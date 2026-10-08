/**
 * Recent Prints Storage & State Engine
 * Persists all customer print orders, 4-digit OTPs, hardware kiosk info,
 * and completion status to localStorage with cross-tab and event synchronization.
 */

export interface RecentPrintFile {
  id?: string
  fileName: string
  fileType?: string
  fileSize?: number
  pageCount?: number
  copies?: number
  colour?: 'BW' | 'COLOUR'
  duplex?: 'SINGLE' | 'DOUBLE'
  pages?: string
  thumbnail?: string
}

export type RecentPrintStatus = 'AWAITING_PIN' | 'PRINTING' | 'COMPLETED' | 'FAILED'

export interface RecentPrintRecord {
  orderId: string
  createdAt: string
  completedAt?: string
  status: RecentPrintStatus
  otp: string
  kioskId: string
  kioskName: string
  kioskLocation?: string
  totalPrice: number
  totalSheets: number
  totalPages: number
  files: RecentPrintFile[]
  paymentRef?: string
}

const STORAGE_KEY = 'pb_recent_prints_v1'
const EVENT_NAME = 'printbooth:recent-prints-change'

/** Safe retrieval of all stored print records */
export function getRecentPrints(): RecentPrintRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch (e) {
    console.warn('[recentPrintsStore] Failed to read recent prints:', e)
    return []
  }
}

/** Broadcast change to active subscribers and tabs */
function notifyChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

/** Save or update a print order in recent history */
export function saveRecentPrint(order: Partial<RecentPrintRecord> & { orderId: string }): RecentPrintRecord {
  const prints = getRecentPrints()
  const existingIdx = prints.findIndex(p => p.orderId === order.orderId)

  const record: RecentPrintRecord = {
    orderId: order.orderId,
    createdAt: order.createdAt || (existingIdx >= 0 ? prints[existingIdx].createdAt : new Date().toISOString()),
    completedAt: order.completedAt || (existingIdx >= 0 ? prints[existingIdx].completedAt : undefined),
    status: order.status || (existingIdx >= 0 ? prints[existingIdx].status : 'AWAITING_PIN'),
    otp: order.otp || (existingIdx >= 0 ? prints[existingIdx].otp : '1234'),
    kioskId: order.kioskId || (existingIdx >= 0 ? prints[existingIdx].kioskId : 'PB-001'),
    kioskName: order.kioskName || (existingIdx >= 0 ? prints[existingIdx].kioskName : 'PrintBooth Station'),
    kioskLocation: order.kioskLocation || (existingIdx >= 0 ? prints[existingIdx].kioskLocation : undefined),
    totalPrice: order.totalPrice ?? (existingIdx >= 0 ? prints[existingIdx].totalPrice : 0),
    totalSheets: order.totalSheets ?? (existingIdx >= 0 ? prints[existingIdx].totalSheets : 1),
    totalPages: order.totalPages ?? (existingIdx >= 0 ? prints[existingIdx].totalPages : 1),
    files: order.files || (existingIdx >= 0 ? prints[existingIdx].files : []),
    paymentRef: order.paymentRef || (existingIdx >= 0 ? prints[existingIdx].paymentRef : undefined),
  }

  if (existingIdx >= 0) {
    prints[existingIdx] = record
  } else {
    prints.unshift(record)
  }

  // Keep latest 50 orders
  const trimmed = prints.slice(0, 50)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    notifyChange()
  } catch (e) {
    console.warn('[recentPrintsStore] Failed to write recent prints:', e)
  }

  return record
}

/** Mark a specific order as COMPLETED when printing finishes */
export function markPrintCompleted(orderId: string): void {
  if (!orderId) return
  const prints = getRecentPrints()
  const match = prints.find(p => p.orderId === orderId)
  if (!match) {
    // If not found in records, create a minimal completed entry from session
    const otp = sessionStorage.getItem('pb_release_pin') || ''
    const kioskId = sessionStorage.getItem('pb_kiosk_id') || 'PB-001'
    const kioskName = sessionStorage.getItem('pb_kiosk_name') || 'PrintBooth Station'
    const totalPrice = Number(sessionStorage.getItem('pb_total_price') || '0')
    const fileName = sessionStorage.getItem('pb_file_name') || 'Document'
    const pageCount = Number(sessionStorage.getItem('pb_page_count') || '1')

    saveRecentPrint({
      orderId,
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      otp: otp || '----',
      kioskId,
      kioskName,
      totalPrice,
      totalSheets: pageCount,
      totalPages: pageCount,
      files: [{ fileName, pageCount, copies: 1, colour: 'BW', duplex: 'SINGLE' }],
    })
    return
  }

  match.status = 'COMPLETED'
  match.completedAt = new Date().toISOString()

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prints))
    notifyChange()
  } catch (e) {
    console.warn('[recentPrintsStore] Failed to mark completed:', e)
  }
}

/** Update order status (e.g. PRINTING, AWAITING_PIN, FAILED) */
export function updatePrintStatus(orderId: string, status: RecentPrintStatus): void {
  if (!orderId) return
  const prints = getRecentPrints()
  const match = prints.find(p => p.orderId === orderId)
  if (!match) return

  match.status = status
  if (status === 'COMPLETED' && !match.completedAt) {
    match.completedAt = new Date().toISOString()
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prints))
    notifyChange()
  } catch (e) {
    console.warn('[recentPrintsStore] Failed to update status:', e)
  }
}

/** Count how many prints are pending release or active */
export function getActivePrintsCount(): number {
  return getRecentPrints().filter(p => p.status === 'AWAITING_PIN' || p.status === 'PRINTING').length
}

/** Delete a specific order from recent prints */
export function deleteRecentPrint(orderId: string): void {
  const prints = getRecentPrints().filter(p => p.orderId !== orderId)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prints))
    notifyChange()
  } catch (e) {
    console.warn('[recentPrintsStore] Failed to delete print:', e)
  }
}

/** Clear all history */
export function clearAllRecentPrints(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    notifyChange()
  } catch (e) {
    console.warn('[recentPrintsStore] Failed to clear history:', e)
  }
}

/** React hook friendly subscribe to changes */
export function subscribeRecentPrints(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT_NAME, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(EVENT_NAME, callback)
    window.removeEventListener('storage', callback)
  }
}
