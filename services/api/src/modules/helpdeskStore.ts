import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { isDbConnected } from '../db.js'
import { HelpDeskTicketModel } from '../models/HelpDeskTicket.js'
import { cacheGet, cacheSet, cacheDel } from '../redis.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.resolve(__dirname, '../../data')
const DATA_FILE = path.join(DATA_DIR, 'helpdesk.json')

export interface QueryMessage {
  id: string
  sender: 'CUSTOMER' | 'MERCHANT' | 'ADMIN'
  senderName: string
  text: string
  timestamp: string
  isInternalNote?: boolean
}

export interface HelpDeskTicketData {
  id: string
  senderType: 'USER' | 'MERCHANT'
  title: string
  category: string
  priority: string
  status: string
  requesterName: string
  requesterEmail: string
  requesterPhone: string
  kioskId?: string
  kioskLocation?: string
  orderId?: string
  merchantId?: string
  createdAt: string
  updatedAt: string
  assignedTo?: string
  hardwareTelemetry?: {
    printerStatus: string
    paperLevel: number
    tonerLevel: number
  }
  messages: QueryMessage[]
}

let inMemoryTickets: HelpDeskTicketData[] = []
let isInitialized = false

function ensureDataFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8')
    }
  } catch (err) {
    console.warn('[HelpDeskStore] Warning creating data dir/file:', err)
  }
}

function loadFromFile(): HelpDeskTicketData[] {
  try {
    ensureDataFile()
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8')
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (err) {
    console.error('[HelpDeskStore] Error loading from JSON file:', err)
  }
  return []
}

function saveToFile(data: HelpDeskTicketData[]) {
  try {
    ensureDataFile()
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error('[HelpDeskStore] Error saving to JSON file:', err)
  }
}

export async function initHelpDeskStore() {
  if (isInitialized) return
  ensureDataFile()
  inMemoryTickets = loadFromFile()
  isInitialized = true
}

export async function getAllTickets(): Promise<HelpDeskTicketData[]> {
  await initHelpDeskStore()

  if (isDbConnected()) {
    try {
      const docs = await HelpDeskTicketModel.find().sort({ createdAt: -1 }).lean()
      if (docs && docs.length > 0) {
        return docs.map((d: any) => ({
          ...d,
          createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : new Date().toISOString(),
        }))
      }
    } catch (err) {
      console.warn('[HelpDeskStore] MongoDB query failed, falling back to local store:', err)
    }
  }

  try {
    const cached = await cacheGet<HelpDeskTicketData[]>('pb:helpdesk:all')
    if (cached && Array.isArray(cached)) {
      inMemoryTickets = cached
      return cached
    }
  } catch {}

  return [...inMemoryTickets]
}

export async function getTicketById(id: string): Promise<HelpDeskTicketData | null> {
  const all = await getAllTickets()
  return all.find((t) => t.id === id) || null
}

export async function createTicket(data: Partial<HelpDeskTicketData>): Promise<HelpDeskTicketData> {
  await initHelpDeskStore()

  const now = new Date().toISOString()
  const code = data.id || `TKT-${Math.floor(1000 + Math.random() * 9000)}`

  const newRecord: HelpDeskTicketData = {
    id: code,
    senderType: data.senderType || 'USER',
    title: data.title || 'Inbound Support Request',
    category: data.category || 'GENERAL_INQUIRY',
    priority: data.priority || 'HIGH',
    status: data.status || 'OPEN',
    requesterName: data.requesterName || 'Inbound User',
    requesterEmail: data.requesterEmail || '',
    requesterPhone: data.requesterPhone || '',
    kioskId: data.kioskId,
    kioskLocation: data.kioskLocation,
    orderId: data.orderId,
    merchantId: data.merchantId,
    createdAt: now,
    updatedAt: now,
    assignedTo: data.assignedTo || 'Ops Support',
    hardwareTelemetry: data.hardwareTelemetry || {
      printerStatus: 'READY',
      paperLevel: 100,
      tonerLevel: 100,
    },
    messages: data.messages || [
      {
        id: `msg-${Date.now()}`,
        sender: data.senderType === 'MERCHANT' ? 'MERCHANT' : 'CUSTOMER',
        senderName: data.requesterName || 'Inbound User',
        text: (data as any).initialMessage || data.title || 'Inquiry submitted via portal.',
        timestamp: now,
      },
    ],
  }

  if (isDbConnected()) {
    try {
      await HelpDeskTicketModel.create({
        ...newRecord,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
    } catch (err) {
      console.warn('[HelpDeskStore] Error creating in MongoDB:', err)
    }
  }

  inMemoryTickets = [newRecord, ...inMemoryTickets.filter((t) => t.id !== code)]
  saveToFile(inMemoryTickets)

  try {
    await cacheSet('pb:helpdesk:all', inMemoryTickets, 3600)
  } catch {}

  return newRecord
}

export async function updateTicket(
  id: string,
  patch: Partial<HelpDeskTicketData>
): Promise<HelpDeskTicketData | null> {
  await initHelpDeskStore()
  const all = await getAllTickets()
  const idx = all.findIndex((t) => t.id === id)
  if (idx === -1) return null

  const now = new Date().toISOString()
  const existing = all[idx]
  const updated: HelpDeskTicketData = {
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: now,
    messages: patch.messages || existing.messages,
  }

  all[idx] = updated
  inMemoryTickets = all
  saveToFile(inMemoryTickets)

  if (isDbConnected()) {
    try {
      await HelpDeskTicketModel.updateOne({ id }, { ...patch, updatedAt: new Date(now) })
    } catch (err) {
      console.warn('[HelpDeskStore] Error updating in MongoDB:', err)
    }
  }

  try {
    await cacheSet('pb:helpdesk:all', inMemoryTickets, 3600)
  } catch {}

  return updated
}

export async function deleteTicket(id: string): Promise<boolean> {
  await initHelpDeskStore()
  const all = await getAllTickets()
  const filtered = all.filter((t) => t.id !== id)
  if (filtered.length === all.length) return false

  inMemoryTickets = filtered
  saveToFile(inMemoryTickets)

  if (isDbConnected()) {
    try {
      await HelpDeskTicketModel.deleteOne({ id })
    } catch (err) {
      console.warn('[HelpDeskStore] Error deleting in MongoDB:', err)
    }
  }

  try {
    await cacheSet('pb:helpdesk:all', inMemoryTickets, 3600)
  } catch {}

  return true
}
