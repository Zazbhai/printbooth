import { generateDocumentPages, type DocumentPagePreview } from './documentPreview'
import { saveFileToCache, getFileFromCache, clearFileCache } from './fileCache'

export type FileType = 'pdf' | 'image' | 'docx' | 'ppt' | 'unknown'

export type ColourMode = 'BW' | 'COLOUR'
export type DuplexMode = 'SINGLE' | 'DOUBLE'

export type PaperSize = 'A4' | 'A3' | 'LETTER' | 'LEGAL' | 'LEDGER' | 'A5'
export type ScalingMode = 'FIT' | 'ACTUAL' | 'STRETCH' | 'SHRINK_OVERSIZED' | 'CUSTOM'
export type DpiMode = '150' | '300' | '600' | '1200'
export type OrientationMode = 'AUTO' | 'PORTRAIT' | 'LANDSCAPE'
export type PagesPerSheet = 1 | 2 | 4 | 6 | 9 | 16
export type MarginMode = 'STANDARD' | 'BORDERLESS' | 'MINIMAL'
export type ContrastMode = 'BALANCED' | 'CRISP_TEXT' | 'PHOTO_ENHANCED'

export interface FileSettings {
  pages: string
  copies: number
  pageCopies?: Record<string, number>
  colour: ColourMode
  pageColours?: Record<string, ColourMode>
  duplex: DuplexMode
  paperSize: PaperSize
  scaling?: ScalingMode
  customScalePercent?: number
  dpi?: DpiMode
  orientation?: OrientationMode
  pagesPerSheet?: PagesPerSheet
  margins?: MarginMode
  contrastMode?: ContrastMode
  pageBorder?: boolean
}

export function parsePageRange(val: string, total: number): number[] {
  let maxTotal = Math.max(1, isNaN(Number(total)) ? 1 : Number(total))
  if (!val || typeof val !== 'string' || val.trim().toUpperCase() === 'ALL' || val.trim() === '*') {
    return Array.from({ length: maxTotal }, (_, i) => i + 1)
  }

  const clean = val.trim()
  if (clean.startsWith('[') && clean.endsWith(']')) {
    try {
      const arr = JSON.parse(clean)
      if (Array.isArray(arr) && arr.length > 0) {
        const nums = arr.map(Number).filter(n => !isNaN(n) && n >= 1)
        if (nums.length > 0) {
          maxTotal = Math.max(maxTotal, ...nums)
          const valid = nums.filter(n => n <= maxTotal)
          if (valid.length > 0) return Array.from(new Set(valid)).sort((a, b) => a - b)
        }
      }
    } catch {}
  }

  // Pre-scan clean string for explicit page numbers to expand maxTotal if document pageCount was not yet passed
  const allNums: number[] = []
  const matches = clean.match(/\d+/g)
  if (matches) {
    for (const m of matches) {
      const num = parseInt(m, 10)
      if (!isNaN(num) && num >= 1) allNums.push(num)
    }
  }
  if (allNums.length > 0) {
    maxTotal = Math.max(maxTotal, ...allNums)
  }

  const selected = new Set<number>()
  const parts = clean.split(',').map(s => s.trim()).filter(Boolean)
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map(s => s.trim())
      const start = Math.max(1, parseInt(startStr, 10) || 1)
      const end = Math.min(maxTotal, parseInt(endStr, 10) || maxTotal)
      if (start <= end) {
        for (let i = start; i <= end; i++) selected.add(i)
      }
    } else {
      const p = parseInt(part, 10)
      if (!isNaN(p) && p >= 1 && p <= maxTotal) selected.add(p)
    }
  }
  const res = Array.from(selected).sort((a, b) => a - b)
  return res.length > 0 ? res : Array.from({ length: maxTotal }, (_, i) => i + 1)
}

export function formatPageRange(pages: number[], total: number): string {
  if (!pages.length) return 'ALL'
  if (pages.length === total && total > 0) return 'ALL'
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b)
  if (sorted.length === 1) return String(sorted[0])

  const ranges: string[] = []
  let start = sorted[0]
  let end = start

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i]
    } else {
      ranges.push(start === end ? String(start) : `${start}-${end}`)
      start = sorted[i]
      end = start
    }
  }
  ranges.push(start === end ? String(start) : `${start}-${end}`)
  return ranges.join(', ')
}

export interface ManagedFile {
  id: string
  file: File
  fileName: string
  fileSize: number
  fileType: FileType
  pageCount: number
  realPages: DocumentPagePreview[]
  settings: FileSettings
  status: 'pending' | 'processing' | 'ready' | 'error'
  errorMsg?: string
  thumbnail?: string  // first page URL for quick preview
  previews?: DocumentPagePreview[]
}

const defaultSettings = (): FileSettings => ({
  pages: 'ALL',
  copies: 1,
  colour: 'BW',
  duplex: 'SINGLE',
  paperSize: 'A4',
  scaling: 'FIT',
  dpi: '600',
  orientation: 'AUTO',
  pagesPerSheet: 1,
  margins: 'STANDARD',
  contrastMode: 'BALANCED',
})

function hydrateMultiFilesFromStorage(): ManagedFile[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem('pb_files')
    if (raw) {
      const list = JSON.parse(raw)
      if (Array.isArray(list) && list.length > 0) {
        return list.map((item: any, idx: number) => {
          const fileType = item.fileType || 'pdf'
          const pageCount = Number(item.pageCount) || 1
          const realPages = generateDocumentPages(item.fileName, pageCount)
          const placeholderFile = new File([new Blob([])], item.fileName, {
            type: fileType === 'pdf' ? 'application/pdf' : 'application/octet-stream',
          })
          return {
            id: item.id || `file_${idx}_${Date.now()}`,
            file: placeholderFile,
            fileName: item.fileName,
            fileSize: Number(item.fileSize) || 1024,
            fileType,
            pageCount,
            realPages,
            settings: { ...defaultSettings(), ...(item.settings || {}) },
            status: 'ready' as const,
            thumbnail: realPages[0]?.url,
          }
        })
      }
    }

    // Single-file legacy fallback
    const singleName = sessionStorage.getItem('pb_file_name')
    if (singleName) {
      const singlePages = Number(sessionStorage.getItem('pb_page_count')) || 1
      const singleSize = Number(sessionStorage.getItem('pb_file_size')) || 1024
      const rawSettings = sessionStorage.getItem('pb_settings')
      let settings = defaultSettings()
      if (rawSettings) {
        try {
          settings = { ...settings, ...JSON.parse(rawSettings) }
        } catch {}
      }
      const realPages = generateDocumentPages(singleName, singlePages)
      const placeholderFile = new File([new Blob([])], singleName, { type: 'application/pdf' })
      return [
        {
          id: 'legacy_single_file',
          file: placeholderFile,
          fileName: singleName,
          fileSize: singleSize,
          fileType: 'pdf',
          pageCount: singlePages,
          realPages,
          settings,
          status: 'ready' as const,
          thumbnail: realPages[0]?.url,
        },
      ]
    }
  } catch (e) {
    console.warn('[multiFileStore] Error during session hydration:', e)
  }
  return []
}

let managedFiles: ManagedFile[] = hydrateMultiFilesFromStorage()
let activeFileId: string | null = managedFiles[0]?.id ?? null

// Asynchronously hydrate physical File blobs from IndexedDB in the background
if (typeof window !== 'undefined' && managedFiles.length > 0) {
  for (const f of managedFiles) {
    ;(async () => {
      const cached = (await getFileFromCache(f.id)) || (await getFileFromCache('active_doc'))
      if (cached && cached.size > 0) {
        f.file = cached
      }
    })().catch(() => {})
  }
}

export async function ensureFileHydrated(fileId: string): Promise<File | null> {
  const found = managedFiles.find(f => f.id === fileId)
  if (found && found.file && found.file.size > 0) return found.file
  const cached = (await getFileFromCache(fileId)) || (await getFileFromCache('active_doc'))
  if (cached && found) {
    found.file = cached
    return cached
  }
  return cached || null
}

export function getFileType(file: File): FileType {
  const name = file.name.toLowerCase()
  const type = file.type

  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (type.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif|bmp)$/.test(name)) return 'image'
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx') ||
    name.endsWith('.doc')
  )
    return 'docx'
  if (
    type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    name.endsWith('.pptx') ||
    name.endsWith('.ppt')
  )
    return 'ppt'

  return 'unknown'
}

export function getMaxFileSizeMB(_type?: FileType): number {
  return 10
}

export const MAX_COMBINED_FILE_SIZE_MB = 10
export const MAX_COMBINED_FILE_SIZE_BYTES = 10 * 1024 * 1024

export function getCombinedFileSize(): number {
  return managedFiles.reduce((sum, f) => sum + (f.fileSize || f.file?.size || 0), 0)
}

export function isSupportedFileType(type: FileType): boolean {
  return ['pdf', 'image'].includes(type)
}

export function canAddFile(file: File): { ok: boolean; reason?: string } {
  const fileType = getFileType(file)
  if (!isSupportedFileType(fileType)) {
    return { ok: false, reason: `"${file.name}" is not a supported format. Please upload PDF, PNG, JPG, or WEBP.` }
  }
  const maxBytes = getMaxFileSizeMB(fileType) * 1024 * 1024
  if (file.size > maxBytes) {
    return { ok: false, reason: `"${file.name}" exceeds the 10 MB limit for ${fileType.toUpperCase()} files.` }
  }

  const existingIndex = managedFiles.findIndex(
    f => f.fileName === file.name && f.fileSize === file.size
  )
  const existingBytes = managedFiles.reduce((sum, f, idx) => {
    if (idx === existingIndex) return sum
    return sum + (f.fileSize || f.file?.size || 0)
  }, 0)

  if (existingBytes + file.size > MAX_COMBINED_FILE_SIZE_BYTES) {
    const totalMB = ((existingBytes + file.size) / (1024 * 1024)).toFixed(1)
    return {
      ok: false,
      reason: `Combined file size cannot exceed 10 MB (total would be ${totalMB} MB). Please choose smaller files.`,
    }
  }

  return { ok: true }
}

/** Generate a unique ID for a file based on name + size */
function makeFileId(file: File): string {
  return `file_${file.name.replace(/\W+/g, '_')}_${file.size}_${Date.now()}`
}

/** Deduplicate managedFiles list by fileName + fileSize */
export function getDeduplicatedFiles(): ManagedFile[] {
  const seen = new Set<string>()
  return managedFiles.filter(f => {
    const key = `${f.fileName}_${f.fileSize}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function addFile(file: File): ManagedFile | null {
  const check = canAddFile(file)
  if (!check.ok) {
    console.warn(`[multiFileStore] Rejecting file "${file.name}":`, check.reason)
    return null
  }

  const fileType = getFileType(file)

  // Check if a file with the same name and size already exists
  const existingIndex = managedFiles.findIndex(
    f => f.fileName === file.name && f.fileSize === file.size
  )

  const entryId = makeFileId(file)
  const entry: ManagedFile = {
    id: entryId,
    file,
    fileName: file.name,
    fileSize: file.size,
    fileType,
    pageCount: 1,
    realPages: [],
    settings: defaultSettings(),
    status: 'pending',
  }

  // Persist file object to IndexedDB immediately
  saveFileToCache(entryId, file).catch(() => {})
  saveFileToCache('active_doc', file).catch(() => {})

  if (existingIndex >= 0) {
    // Replace existing duplicate in-place
    managedFiles = managedFiles.map((f, idx) => (idx === existingIndex ? entry : f))
  } else {
    managedFiles = [...managedFiles, entry]
  }

  if (!activeFileId || existingIndex >= 0) activeFileId = entry.id

  notifyChange()
  return entry
}

export function setManagedFiles(files: ManagedFile[]) {
  managedFiles = files
  activeFileId = files[0]?.id ?? null
  persistAllFilesToSession()
  notifyChange()
}

export function updateFile(id: string, patch: Partial<ManagedFile>) {
  managedFiles = managedFiles.map(f => (f.id === id ? { ...f, ...patch } : f))
  if (patch.file) {
    saveFileToCache(id, patch.file).catch(() => {})
    saveFileToCache('active_doc', patch.file).catch(() => {})
  }
  if (patch.status === 'ready') {
    persistAllFilesToSession()
  }
  notifyChange()
}

export function updateFileSettings(id: string, patch: Partial<FileSettings>) {
  managedFiles = managedFiles.map(f =>
    f.id === id ? { ...f, settings: { ...f.settings, ...patch, scaling: 'FIT', paperSize: 'A4' } } : f
  )
  persistAllFilesToSession()
  notifyChange()
}

export function removeFile(id: string) {
  managedFiles = managedFiles.filter(f => f.id !== id)
  if (activeFileId === id) {
    activeFileId = managedFiles[0]?.id ?? null
  }
  persistAllFilesToSession()
  notifyChange()
}

export function setActiveFile(id: string) {
  activeFileId = id
  notifyChange()
}

export function getActiveFileId(): string | null {
  return activeFileId
}

export function getActiveFile(): ManagedFile | null {
  return managedFiles.find(f => f.id === activeFileId) ?? null
}

export function getAllFiles(): ManagedFile[] {
  return getDeduplicatedFiles()
}

export function getReadyFiles(): ManagedFile[] {
  return getDeduplicatedFiles().filter(f => f.status === 'ready')
}

export function hasAnyReadyFile(): boolean {
  if (managedFiles.length > 0) return true
  if (typeof window !== 'undefined') {
    const raw = sessionStorage.getItem('pb_files')
    if (raw) {
      try {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr) && arr.length > 0) return true
      } catch {}
    }
    if (sessionStorage.getItem('pb_file_name')) return true
  }
  return false
}

export function clearAllFiles() {
  managedFiles = []
  activeFileId = null

  // Also clear multi-file and legacy single-file session storage
  sessionStorage.removeItem('pb_files')
  sessionStorage.removeItem('pb_file_name')
  sessionStorage.removeItem('pb_file_size')
  sessionStorage.removeItem('pb_page_count')
  sessionStorage.removeItem('pb_settings')
  sessionStorage.removeItem('pb_total_price')
  sessionStorage.removeItem('pb_print_step')

  clearFileCache().catch(() => {})

  window.dispatchEvent(new Event('printbooth:multifile-change'))
  window.dispatchEvent(new Event('printbooth:doc-change'))
  window.dispatchEvent(new Event('printbooth:reset-upload'))
}

/** Calculate total printed sheets for a given file taking into account pages, copies & per-page copies */
export function calcFileTotalSheets(f: ManagedFile): number {
  const s = f.settings
  const selectedPages = parsePageRange(s.pages, f.pageCount)

  let totalPagePrints = 0
  if (s.pageCopies && Object.keys(s.pageCopies).length > 0) {
    for (const p of selectedPages) {
      const c = Number(s.pageCopies[String(p)]) || s.copies || 1
      totalPagePrints += Math.max(1, c)
    }
  } else {
    totalPagePrints = selectedPages.length * Math.max(1, s.copies)
  }

  const nUp = s.pagesPerSheet || 1
  const effectivePrints = Math.max(1, Math.ceil(totalPagePrints / nUp))

  if (s.duplex === 'DOUBLE') {
    return Math.max(1, Math.ceil(effectivePrints / 2))
  }
  return effectivePrints
}

export interface KioskPricing {
  bwSingle: number
  bwDouble: number
  colorSingle: number
  colorDouble: number
}

let activeKioskPricing: KioskPricing = {
  bwSingle: 2,
  bwDouble: 3,
  colorSingle: 8,
  colorDouble: 12,
}

export function setKioskPricing(pricing?: Partial<KioskPricing> | null) {
  if (!pricing) return
  activeKioskPricing = {
    bwSingle: Number(pricing.bwSingle ?? activeKioskPricing.bwSingle),
    bwDouble: Number(pricing.bwDouble ?? activeKioskPricing.bwDouble),
    colorSingle: Number(pricing.colorSingle ?? activeKioskPricing.colorSingle),
    colorDouble: Number(pricing.colorDouble ?? activeKioskPricing.colorDouble),
  }
  try {
    sessionStorage.setItem('pb_kiosk_pricing', JSON.stringify(activeKioskPricing))
  } catch {}
  notifyChange()
}

let activeKioskVariant: 'pro' | 'lite' = 'pro'

export function setKioskVariant(variant?: 'pro' | 'lite' | string | null, kioskId?: string) {
  if (!variant) return
  const normalized: 'pro' | 'lite' = String(variant).toLowerCase().includes('lite') ? 'lite' : 'pro'
  activeKioskVariant = normalized
  const cleanId = (kioskId || (typeof window !== 'undefined' ? (sessionStorage.getItem('pb_kiosk_id') || localStorage.getItem('pb_kiosk_id')) : '') || '').trim().toUpperCase()
  try {
    sessionStorage.setItem('pb_kiosk_variant', normalized)
    if (cleanId) {
      sessionStorage.setItem(`pb_kiosk_variant_${cleanId}`, normalized)
      localStorage.setItem(`pb_kiosk_variant_${cleanId}`, normalized)
    }
  } catch {}
  // If variant is lite, enforce pure B&W across all loaded documents
  if (normalized === 'lite') {
    managedFiles.forEach(f => {
      f.settings.colour = 'BW'
      f.settings.pageColours = undefined
    })
  }
  notifyChange()
}

export function getKioskVariant(kioskId?: string): 'pro' | 'lite' {
  const cleanId = (kioskId || (typeof window !== 'undefined' ? (sessionStorage.getItem('pb_kiosk_id') || localStorage.getItem('pb_kiosk_id')) : '') || '').trim().toUpperCase()
  // Default PB-001 strictly to 'pro' unless explicitly marked lite for PB-001
  if (cleanId === 'PB-001') {
    try {
      const scoped = sessionStorage.getItem(`pb_kiosk_variant_${cleanId}`) || localStorage.getItem(`pb_kiosk_variant_${cleanId}`)
      if (scoped) {
        return String(scoped).toLowerCase().includes('lite') ? 'lite' : 'pro'
      }
    } catch {}
    return 'pro'
  }
  try {
    if (cleanId) {
      const scoped = sessionStorage.getItem(`pb_kiosk_variant_${cleanId}`) || localStorage.getItem(`pb_kiosk_variant_${cleanId}`)
      if (scoped) {
        return String(scoped).toLowerCase().includes('lite') ? 'lite' : 'pro'
      }
    }
    const saved = sessionStorage.getItem('pb_kiosk_variant')
    if (saved) {
      return String(saved).toLowerCase().includes('lite') ? 'lite' : 'pro'
    }
  } catch {}
  return activeKioskVariant
}

export function getKioskPricing(): KioskPricing {
  try {
    const saved = sessionStorage.getItem('pb_kiosk_pricing')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (typeof parsed?.bwSingle === 'number') {
        return {
          bwSingle: Number(parsed.bwSingle),
          bwDouble: Number(parsed.bwDouble),
          colorSingle: Number(parsed.colorSingle),
          colorDouble: Number(parsed.colorDouble),
        }
      }
    }
  } catch {}
  return activeKioskPricing
}

/** Calculate total price for a given file taking into account duplex, copies, and per-page colour */
export function calcFileTotalPrice(f: ManagedFile): number {
  const s = f.settings
  const selectedPages = parsePageRange(s.pages, f.pageCount)
  const isDuplex = s.duplex === 'DOUBLE'
  const hasPageColours = s.pageColours && Object.keys(s.pageColours).length > 0
  const hasPageCopies = s.pageCopies && Object.keys(s.pageCopies).length > 0
  const pricing = getKioskPricing()

  if (!hasPageColours) {
    const sheets = calcFileTotalSheets(f)
    const PRICES: Record<string, number> = {
      BW_SINGLE: pricing.bwSingle,
      BW_DOUBLE: pricing.bwDouble,
      COLOUR_SINGLE: pricing.colorSingle,
      COLOUR_DOUBLE: pricing.colorDouble,
    }
    const key = `${s.colour}_${s.duplex}`
    return sheets * (PRICES[key] ?? pricing.bwSingle)
  }

  // Build sequential list of page impressions
  const impressions: ColourMode[] = []
  for (const p of selectedPages) {
    const pCopies = hasPageCopies ? (Number(s.pageCopies?.[String(p)]) || s.copies || 1) : (s.copies || 1)
    const pColour = s.pageColours?.[String(p)] || s.colour
    for (let c = 0; c < Math.max(1, pCopies); c++) {
      impressions.push(pColour)
    }
  }

  if (!isDuplex) {
    return impressions.reduce((acc, col) => acc + (col === 'COLOUR' ? pricing.colorSingle : pricing.bwSingle), 0)
  } else {
    let total = 0
    for (let i = 0; i < impressions.length; i += 2) {
      const side1 = impressions[i]
      const side2 = impressions[i + 1]
      if (side2 !== undefined) {
        const hasColour = side1 === 'COLOUR' || side2 === 'COLOUR'
        total += hasColour ? pricing.colorDouble : pricing.bwDouble
      } else {
        total += side1 === 'COLOUR' ? pricing.colorSingle : pricing.bwSingle
      }
    }
    return Math.max(1, total)
  }
}

/** Compute the grand total price across all ready files */
export function computeTotalPrice(): number {
  return managedFiles
    .filter(f => f.status === 'ready')
    .reduce((sum, f) => sum + calcFileTotalPrice(f), 0)
}

/** Persist active file metadata to session storage for downstream pages */
export function persistActiveFileToSession() {
  const f = getActiveFile()
  if (!f) return
  sessionStorage.setItem('pb_file_name', f.fileName)
  sessionStorage.setItem('pb_file_size', String(f.fileSize))
  sessionStorage.setItem('pb_page_count', String(f.pageCount))
  sessionStorage.setItem('pb_settings', JSON.stringify({ ...f.settings, scaling: 'FIT', paperSize: 'A4' }))
}

/** Persist all files as JSON to session (for ReviewPage and PaymentPage) */
export function persistAllFilesToSession() {
  const readyFiles = managedFiles.filter(f => f.status === 'ready')
  const payload = readyFiles.map(f => ({
    id: f.id,
    fileName: f.fileName,
    fileSize: f.fileSize,
    fileType: f.fileType,
    pageCount: f.pageCount,
    settings: { ...f.settings, scaling: 'FIT', paperSize: 'A4' },
  }))
  sessionStorage.setItem('pb_files', JSON.stringify(payload))
  const total = computeTotalPrice()
  sessionStorage.setItem('pb_total_price', String(total))

  const active = getActiveFile() || readyFiles[0]
  if (active && active.settings) {
    sessionStorage.setItem('pb_settings', JSON.stringify({ ...active.settings, scaling: 'FIT', paperSize: 'A4' }))
  }
}

function notifyChange() {
  window.dispatchEvent(new Event('printbooth:multifile-change'))
  window.dispatchEvent(new Event('printbooth:doc-change'))
}
