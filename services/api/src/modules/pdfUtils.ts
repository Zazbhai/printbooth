import fs from 'fs'
import { PDFDocument } from 'pdf-lib'

/**
 * Authoritatively detects the real page count of a PDF file directly from its bytes.
 * Uses pdf-lib first with zero-dependency native regex fallback.
 */
export async function detectPdfPageCount(filePathOrBuffer: string | Buffer): Promise<number> {
  try {
    let bytes: Buffer
    if (typeof filePathOrBuffer === 'string') {
      if (!fs.existsSync(filePathOrBuffer)) return 1
      bytes = fs.readFileSync(filePathOrBuffer)
    } else {
      bytes = filePathOrBuffer
    }

    if (!bytes || bytes.length === 0) return 1

    // Quick check for PDF signature (%PDF-)
    const head = bytes.subarray(0, 10).toString('latin1')
    if (!head.includes('%PDF')) {
      return 1
    }

    try {
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const count = pdfDoc.getPageCount()
      if (typeof count === 'number' && count > 0) {
        return count
      }
    } catch (pdfLibErr) {
      // Fallback: fast regex count of /Type /Page objects
      const str = bytes.toString('latin1')
      const matches = str.match(/\/Type\s*\/Page[^s]/g)
      if (matches && matches.length > 0) {
        return matches.length
      }
      const countMatches = str.match(/\/Count\s+(\d+)/g)
      if (countMatches) {
        let maxCount = 1
        for (const cm of countMatches) {
          const num = parseInt(cm.replace(/\/Count\s+/, ''), 10)
          if (!isNaN(num) && num > maxCount) maxCount = num
        }
        return maxCount
      }
    }
  } catch (err) {
    console.warn('[pdfUtils] Error detecting PDF page count:', err)
  }
  return 1
}
