import { Kiosk } from '../models/Kiosk.js'
import { fallbackKiosks } from '../fallbackData.js'
import { isDbConnected } from '../db.js'
import { cachePurgePattern } from '../redis.js'

export interface PaperHistoryItem {
  id: string
  action: 'SET' | 'ADD' | 'REDUCE' | 'PRINT_CONSUMED' | 'REFILL'
  amount: number // positive for add/set, negative for consumed/reduced
  remainingAfter: number
  note: string
  orderId?: string
  createdAt: Date
}

export interface KioskPaperState {
  kioskId: string
  kioskName: string
  location: string
  remainingPages: number
  paperTrayCapacity: number
  paperLevel: number
  status: 'LOADED' | 'LOW' | 'OUT_OF_PAPER'
  printerModel: string
  isOnline: boolean
  history: PaperHistoryItem[]
}

const DEFAULT_TRAY_CAPACITY = 150

function generateId(prefix = 'PH'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
}

/**
 * Normalizes remaining pages & capacity from either DB or fallback records.
 */
export async function getKioskPaperState(kioskId: string): Promise<KioskPaperState> {
  const cleanId = (kioskId || 'PB-001').trim().toUpperCase()
  let kiosk: any = null

  if (isDbConnected()) {
    kiosk = await Kiosk.findOne({ $or: [{ kioskId: cleanId }, { id: cleanId }] })
  }

  if (!kiosk) {
    kiosk = fallbackKiosks.find((k) => k.kioskId === cleanId || k.id === cleanId) || fallbackKiosks[0]
  }

  const paperTrayCapacity = kiosk?.paperTrayCapacity && kiosk.paperTrayCapacity > 0
    ? kiosk.paperTrayCapacity
    : DEFAULT_TRAY_CAPACITY

  let remainingPages = typeof kiosk?.remainingPages === 'number'
    ? kiosk.remainingPages
    : Math.round(((kiosk?.paperLevel ?? 83) / 100) * paperTrayCapacity)

  remainingPages = Math.max(0, remainingPages)

  const paperLevel = Math.min(100, Math.max(0, Math.round((remainingPages / paperTrayCapacity) * 100)))

  const status: 'LOADED' | 'LOW' | 'OUT_OF_PAPER' =
    remainingPages <= 0 ? 'OUT_OF_PAPER' : remainingPages <= 20 ? 'LOW' : 'LOADED'

  const history: PaperHistoryItem[] = Array.isArray(kiosk?.paperHistory)
    ? [...kiosk.paperHistory].reverse()
    : []

  return {
    kioskId: cleanId,
    kioskName: kiosk?.name || 'PrintBooth — MIT ADT University',
    location: kiosk?.location || 'Loni Kalbhor, Pune',
    remainingPages,
    paperTrayCapacity,
    paperLevel,
    status,
    printerModel: kiosk?.printerModel || 'Laser Print Engine',
    isOnline: kiosk?.status === 'ONLINE',
    history,
  }
}

/**
 * Merchant manually sets the exact sheet count currently inside the printer.
 * (e.g. "I put 150 sheets in the tray right now").
 */
export async function setKioskPaper(
  kioskId: string,
  options: { pages: number; capacity?: number; note?: string }
): Promise<KioskPaperState> {
  const cleanId = (kioskId || 'PB-001').trim().toUpperCase()
  const rawPages = Math.max(0, Math.round(Number(options.pages) || 0))
  const newCapacity = options.capacity && options.capacity > 0 ? Math.round(Number(options.capacity)) : undefined
  const note = options.note || `Manual tray load: set to ${rawPages} sheets`

  const historyItem: PaperHistoryItem = {
    id: generateId('PH-SET'),
    action: 'SET',
    amount: rawPages,
    remainingAfter: rawPages,
    note,
    createdAt: new Date(),
  }

  // Update in-memory fallback
  const fb = fallbackKiosks.find((k) => k.kioskId === cleanId || k.id === cleanId)
  if (fb) {
    if (newCapacity) fb.paperTrayCapacity = newCapacity
    fb.remainingPages = rawPages
    const cap = fb.paperTrayCapacity || DEFAULT_TRAY_CAPACITY
    fb.paperLevel = Math.min(100, Math.max(0, Math.round((rawPages / cap) * 100)))
    fb.paper = rawPages
    if (!Array.isArray(fb.paperHistory)) fb.paperHistory = []
    fb.paperHistory.push(historyItem)
    if (rawPages === 0) fb.printerStatus = 'PAPER_EMPTY'
    else if (fb.printerStatus === 'PAPER_EMPTY') fb.printerStatus = 'READY'
  }

  // Update MongoDB
  if (isDbConnected()) {
    const updateDoc: any = {
      $set: {
        remainingPages: rawPages,
        paperLevel: Math.min(100, Math.max(0, Math.round((rawPages / (newCapacity || fb?.paperTrayCapacity || DEFAULT_TRAY_CAPACITY)) * 100))),
        printerStatus: rawPages === 0 ? 'PAPER_EMPTY' : 'READY',
      },
      $push: {
        paperHistory: {
          $each: [historyItem],
          $slice: -100, // keep latest 100 events
        },
      },
    }
    if (newCapacity) {
      updateDoc.$set.paperTrayCapacity = newCapacity
    }

    await Kiosk.findOneAndUpdate(
      { $or: [{ kioskId: cleanId }, { id: cleanId }] },
      updateDoc
    )
  }

  cachePurgePattern('kiosks:*').catch(() => {})
  cachePurgePattern('merchant:*').catch(() => {})

  return getKioskPaperState(cleanId)
}

/**
 * Merchant manually increases or reduces pages as they like.
 * type = 'ADD' (+X sheets)
 * type = 'REDUCE' (-X sheets, e.g. for jams or manual deduction)
 */
export async function adjustKioskPaper(
  kioskId: string,
  options: { change: number; type: 'ADD' | 'REDUCE'; note?: string }
): Promise<KioskPaperState> {
  const cleanId = (kioskId || 'PB-001').trim().toUpperCase()
  const currentState = await getKioskPaperState(cleanId)
  const absChange = Math.max(1, Math.round(Math.abs(Number(options.change) || 1)))
  const isAdd = options.type === 'ADD'

  const newPages = isAdd
    ? currentState.remainingPages + absChange
    : Math.max(0, currentState.remainingPages - absChange)

  const signedAmount = isAdd ? absChange : -absChange
  const note = options.note || (isAdd ? `Added +${absChange} sheets to tray` : `Removed -${absChange} sheets from tray`)

  const historyItem: PaperHistoryItem = {
    id: generateId(isAdd ? 'PH-ADD' : 'PH-RED'),
    action: isAdd ? 'ADD' : 'REDUCE',
    amount: signedAmount,
    remainingAfter: newPages,
    note,
    createdAt: new Date(),
  }

  // Update in-memory fallback
  const fb = fallbackKiosks.find((k) => k.kioskId === cleanId || k.id === cleanId)
  if (fb) {
    fb.remainingPages = newPages
    const cap = fb.paperTrayCapacity || DEFAULT_TRAY_CAPACITY
    fb.paperLevel = Math.min(100, Math.max(0, Math.round((newPages / cap) * 100)))
    fb.paper = newPages
    if (!Array.isArray(fb.paperHistory)) fb.paperHistory = []
    fb.paperHistory.push(historyItem)
    if (newPages === 0) fb.printerStatus = 'PAPER_EMPTY'
    else if (fb.printerStatus === 'PAPER_EMPTY') fb.printerStatus = 'READY'
  }

  // Update MongoDB
  if (isDbConnected()) {
    const cap = currentState.paperTrayCapacity || DEFAULT_TRAY_CAPACITY
    const newLevel = Math.min(100, Math.max(0, Math.round((newPages / cap) * 100)))

    await Kiosk.findOneAndUpdate(
      { $or: [{ kioskId: cleanId }, { id: cleanId }] },
      {
        $set: {
          remainingPages: newPages,
          paperLevel: newLevel,
          printerStatus: newPages === 0 ? 'PAPER_EMPTY' : 'READY',
        },
        $push: {
          paperHistory: {
            $each: [historyItem],
            $slice: -100,
          },
        },
      }
    )
  }

  cachePurgePattern('kiosks:*').catch(() => {})
  cachePurgePattern('merchant:*').catch(() => {})

  return getKioskPaperState(cleanId)
}

/**
 * Automatically consumes paper sheets as customers take prints.
 * Called on order completion / creation.
 */
export async function consumePaperForOrder(
  kioskId: string,
  pages: number,
  orderId?: string,
  note?: string
): Promise<KioskPaperState> {
  const cleanId = (kioskId || 'PB-001').trim().toUpperCase()
  const pagesConsumed = Math.max(1, Math.round(Number(pages) || 1))
  const currentState = await getKioskPaperState(cleanId)

  const newPages = Math.max(0, currentState.remainingPages - pagesConsumed)
  const entryNote = note || `Printed ${pagesConsumed} sheets (Order #${orderId || 'PRINT'})`

  const historyItem: PaperHistoryItem = {
    id: generateId('PH-PRINT'),
    action: 'PRINT_CONSUMED',
    amount: -pagesConsumed,
    remainingAfter: newPages,
    note: entryNote,
    orderId,
    createdAt: new Date(),
  }

  // Update in-memory fallback
  const fb = fallbackKiosks.find((k) => k.kioskId === cleanId || k.id === cleanId)
  if (fb) {
    fb.remainingPages = newPages
    const cap = fb.paperTrayCapacity || DEFAULT_TRAY_CAPACITY
    fb.paperLevel = Math.min(100, Math.max(0, Math.round((newPages / cap) * 100)))
    fb.paper = newPages
    if (!Array.isArray(fb.paperHistory)) fb.paperHistory = []
    fb.paperHistory.push(historyItem)
    if (newPages === 0) fb.printerStatus = 'PAPER_EMPTY'
  }

  // Update MongoDB
  if (isDbConnected()) {
    const cap = currentState.paperTrayCapacity || DEFAULT_TRAY_CAPACITY
    const newLevel = Math.min(100, Math.max(0, Math.round((newPages / cap) * 100)))

    await Kiosk.findOneAndUpdate(
      { $or: [{ kioskId: cleanId }, { id: cleanId }] },
      {
        $set: {
          remainingPages: newPages,
          paperLevel: newLevel,
          ...(newPages === 0 ? { printerStatus: 'PAPER_EMPTY' } : {}),
        },
        $push: {
          paperHistory: {
            $each: [historyItem],
            $slice: -100,
          },
        },
      }
    )
  }

  cachePurgePattern('kiosks:*').catch(() => {})
  cachePurgePattern('merchant:*').catch(() => {})

  return getKioskPaperState(cleanId)
}
