import { generateDocumentPages, type DocumentPagePreview } from './documentPreview'
import { saveFileToCache, getFileFromCache, clearFileCache } from './fileCache'

export interface UploadedDocState {
  file: File | null
  fileName: string
  fileSize: number
  pageCount: number
  realPages: DocumentPagePreview[]
}

function initActiveDoc(): UploadedDocState {
  if (typeof window === 'undefined') {
    return { file: null, fileName: '', fileSize: 0, pageCount: 0, realPages: [] }
  }
  try {
    const fileName = sessionStorage.getItem('pb_file_name') || ''
    const fileSize = Number(sessionStorage.getItem('pb_file_size')) || 0
    const pageCount = Number(sessionStorage.getItem('pb_page_count')) || 0
    const realPages = fileName ? generateDocumentPages(fileName, Math.max(1, pageCount)) : []
    return {
      file: null,
      fileName,
      fileSize,
      pageCount: Math.max(pageCount, realPages.length > 0 ? realPages.length : 0),
      realPages,
    }
  } catch {
    return { file: null, fileName: '', fileSize: 0, pageCount: 0, realPages: [] }
  }
}

// In-memory persistent cache for the active SPA session (hydrated from session)
let activeDoc: UploadedDocState = initActiveDoc()

// Non-blocking async rehydration of physical File blob from IndexedDB
if (typeof window !== 'undefined' && activeDoc.fileName) {
  getFileFromCache('active_doc').then((cached) => {
    if (cached) {
      activeDoc.file = cached
    }
  }).catch(() => {})
}

export function setUploadedDoc(doc: Partial<UploadedDocState>) {
  activeDoc = {
    ...activeDoc,
    ...doc,
  }
  if (doc.file) {
    saveFileToCache('active_doc', doc.file).catch(() => {})
  }
  if (doc.fileName) {
    sessionStorage.setItem('pb_file_name', doc.fileName)
  }
  if (doc.fileSize !== undefined) {
    sessionStorage.setItem('pb_file_size', String(doc.fileSize))
  }
  if (doc.pageCount !== undefined) {
    sessionStorage.setItem('pb_page_count', String(doc.pageCount))
  }
  window.dispatchEvent(new Event('printbooth:doc-change'))
}

export function getUploadedDoc(): UploadedDocState {
  return activeDoc
}

export async function getUploadedFileAsync(): Promise<File | null> {
  if (activeDoc.file) return activeDoc.file
  const cached = await getFileFromCache('active_doc')
  if (cached) {
    activeDoc.file = cached
    return cached
  }
  return null
}

export function hasRealUploadedDoc(): boolean {
  if (Boolean(activeDoc.fileName && (activeDoc.realPages?.length > 0 || activeDoc.pageCount > 0))) {
    return true
  }
  if (typeof window !== 'undefined') {
    return Boolean(sessionStorage.getItem('pb_file_name'))
  }
  return false
}

export function clearUploadedDoc() {
  activeDoc = {
    file: null,
    fileName: '',
    fileSize: 0,
    pageCount: 0,
    realPages: [],
  }
  clearFileCache().catch(() => {})
  sessionStorage.removeItem('pb_file_name')
  sessionStorage.removeItem('pb_file_size')
  sessionStorage.removeItem('pb_page_count')
  sessionStorage.removeItem('pb_settings')
  sessionStorage.removeItem('pb_total_price')
  window.dispatchEvent(new Event('printbooth:doc-change'))
  window.dispatchEvent(new Event('printbooth:reset-upload'))
}

