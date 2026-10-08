/**
 * Multi-format file renderer.
 * Converts uploaded files into DocumentPagePreview arrays.
 * - PDF: rendered via pdf.js (real page render)
 * - Image (PNG/JPG/WEBP): single page from the image URL
 * - DOCX/PPT: accurate page/slide detection via backend COM inspection & fast ZIP parsing
 */

import type { DocumentPagePreview } from './documentPreview'
import { renderPdfPages } from './pdfRenderer'
import type { FileType } from './multiFileStore'
import { inspectDocument } from './api'

/**
 * Convert a Blob/File to a data URL.
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Fast client-side PPTX slide count detector.
 * PPTX files contain uncompressed slide file headers in their ZIP directory.
 */
async function countPptxSlides(file: File): Promise<number> {
  try {
    const buffer = await file.arrayBuffer()
    const decoder = new TextDecoder('latin1')
    const text = decoder.decode(buffer)
    const matches = text.match(/ppt\/slides\/slide\d+\.xml/g)
    if (matches && matches.length > 0) {
      const unique = new Set(matches)
      return unique.size
    }
    const sldMatches = text.match(/<p:sldId/g)
    if (sldMatches && sldMatches.length > 0) {
      return sldMatches.length
    }
  } catch (e) {
    console.warn('[multiFileRenderer] PPTX slide count error:', e)
  }
  return 1
}

/**
 * Fast client-side DOCX page count detector from metadata.
 */
async function countDocxPages(file: File): Promise<number> {
  try {
    const buffer = await file.arrayBuffer()
    const decoder = new TextDecoder('latin1')
    const text = decoder.decode(buffer)
    const m = text.match(/<Pages>(\d+)<\/Pages>/)
    if (m && parseInt(m[1]) > 0) {
      return parseInt(m[1])
    }
    const pageBreaks = (text.match(/w:type="page"/g) || []).length
    if (pageBreaks > 0) {
      return pageBreaks + 1
    }
  } catch (e) {
    console.warn('[multiFileRenderer] DOCX page count error:', e)
  }
  return 1
}

/**
 * Generate a styled SVG placeholder preview for DOCX / PPT files
 * when native raster rendering is not available.
 */
function generateOfficePlaceholder(
  fileName: string,
  fileType: FileType,
  pageNum: number = 1,
  totalPages: number = 1
): string {
  const isPpt = fileType === 'ppt'
  const ext = isPpt ? 'PPT' : 'DOCX'
  const color = isPpt ? '#D24726' : '#2B5CE6'
  const typeLabel = isPpt ? 'Slide' : 'Page'
  const icon =
    isPpt
      ? `<text x="210" y="235" font-family="sans-serif" font-size="64" font-weight="900" fill="${color}" text-anchor="middle" opacity="0.15">P</text>`
      : `<text x="210" y="235" font-family="serif" font-size="64" font-weight="900" fill="${color}" text-anchor="middle" opacity="0.15">W</text>`

  const shortName =
    fileName.length > 28 ? fileName.substring(0, 26) + '…' : fileName

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 560" width="420" height="560">
  <rect width="420" height="560" rx="8" fill="#f8fafc"/>
  <rect width="420" height="560" rx="8" fill="none" stroke="#cbd5e1" stroke-width="1.5"/>
  <!-- colored top band -->
  <rect x="0" y="0" width="420" height="6" rx="8" fill="${color}"/>
  <!-- file type badge -->
  <rect x="30" y="30" width="58" height="24" rx="5" fill="${color}"/>
  <text x="59" y="46" font-family="system-ui,sans-serif" font-size="12" font-weight="800" fill="#fff" text-anchor="middle">${ext}</text>
  <!-- file name -->
  <text x="100" y="47" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#334155">${shortName}</text>
  <!-- large watermark letter -->
  ${icon}
  <!-- page / slide counter -->
  <rect x="140" y="455" width="140" height="34" rx="17" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="1"/>
  <text x="210" y="477" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#475569" text-anchor="middle">${typeLabel} ${pageNum} of ${totalPages}</text>
  <!-- notice band -->
  <rect x="30" y="340" width="360" height="56" rx="10" fill="#f1f5f9"/>
  <text x="210" y="365" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#64748b" text-anchor="middle">Ready for Hardware Print</text>
  <text x="210" y="383" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">Native print pipeline preserves full formatting</text>
</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * Render an image file into a single-page DocumentPagePreview.
 */
async function renderImageFile(file: File): Promise<DocumentPagePreview[]> {
  const dataUrl = await fileToDataUrl(file)

  const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth || 1200, height: img.naturalHeight || 1600 })
    }
    img.onerror = () => resolve({ width: 1200, height: 1600 })
    img.src = dataUrl
  })

  return [
    {
      id: 1,
      pageNumber: 1,
      title: 'Page 1',
      subtitle: file.name,
      url: dataUrl,
      width,
      height,
    },
  ]
}

/**
 * Generate preview list for Office files (DOCX, DOC, PPTX, PPT)
 * using any available raster previews or styled placeholders.
 */
function renderOfficePlaceholders(
  file: File,
  fileType: FileType,
  count: number,
  previews?: DocumentPagePreview[]
): DocumentPagePreview[] {
  const safeCount = Math.max(1, count)
  const result: DocumentPagePreview[] = []

  for (let i = 1; i <= safeCount; i++) {
    const existing = previews?.find(p => p.pageNumber === i)
    if (existing && existing.url) {
      result.push(existing)
    } else {
      result.push({
        id: i,
        pageNumber: i,
        title: fileType === 'ppt' ? `Slide ${i}` : `Page ${i}`,
        subtitle: file.name,
        url: generateOfficePlaceholder(file.name, fileType, i, safeCount),
      })
    }
  }
  return result
}

/**
 * Main entry point: render any supported file type into DocumentPagePreview[].
 */
export async function renderFilePages(
  file: File,
  fileType: FileType,
  onProgress?: (current: number, total: number) => void
): Promise<DocumentPagePreview[]> {
  if (fileType === 'pdf') {
    return renderPdfPages(file, 50, onProgress)
  }

  if (fileType === 'image') {
    onProgress?.(0, 1)
    const pages = await renderImageFile(file)
    onProgress?.(1, 1)
    return pages
  }

  if (fileType === 'docx' || fileType === 'ppt') {
    onProgress?.(0, 1)

    // Step 1: Fast local count detection
    let localCount = 1
    if (fileType === 'ppt') {
      localCount = await countPptxSlides(file)
    } else {
      localCount = await countDocxPages(file)
    }

    // Step 2: Query backend inspection (Word/PowerPoint COM conversion for exact count & raster page thumbnails)
    try {
      const inspected = await inspectDocument(file)
      if (inspected && inspected.pageCount && inspected.pageCount > 0) {
        const exactCount = inspected.pageCount
        const existingPreviews: DocumentPagePreview[] = (inspected.previews || []).map((p: any, idx: number) => ({
          id: p.id || idx + 1,
          pageNumber: p.pageNumber || idx + 1,
          title: p.title || (fileType === 'ppt' ? `Slide ${idx + 1}` : `Page ${idx + 1}`),
          subtitle: p.subtitle || file.name,
          url: p.url,
        }))

        const pages = renderOfficePlaceholders(file, fileType, exactCount, existingPreviews)
        onProgress?.(1, 1)
        return pages
      }
    } catch (e) {
      console.warn('[multiFileRenderer] Backend inspection failed, falling back to local count:', e)
    }

    // Fallback: Use detected client-side count
    const pages = renderOfficePlaceholders(file, fileType, localCount)
    onProgress?.(1, 1)
    return pages
  }

  return []
}
