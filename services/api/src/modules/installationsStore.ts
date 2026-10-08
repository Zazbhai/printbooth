import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { isDbConnected } from '../db.js'
import { InstallationRequestModel } from '../models/InstallationRequest.js'
import { cacheGet, cacheSet, cacheDel } from '../redis.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.resolve(__dirname, '../../data')
const DATA_FILE = path.join(DATA_DIR, 'installations.json')

export interface SurveyNote {
  id: string
  author: string
  text: string
  timestamp: string
}

export interface InstallationRequestData {
  id: string
  venueType: string
  orgName: string
  campusName?: string
  city: string
  state: string
  pincode: string
  contactName: string
  contactRole: string
  contactEmail: string
  contactPhone: string
  footfall: string
  timeline: string
  hasPower: boolean
  hasSecurity: boolean
  notes?: string
  status: string
  priority: string
  assignedLead?: string
  assignedKioskId?: string
  estimatedUnits: number
  createdAt: string
  updatedAt: string
  surveyNotes: SurveyNote[]
}

// In-memory cache
let inMemoryInstallations: InstallationRequestData[] = []
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
    console.warn('[InstallationsStore] Warning creating data dir/file:', err)
  }
}

function loadFromFile(): InstallationRequestData[] {
  try {
    ensureDataFile()
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8')
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (err) {
    console.error('[InstallationsStore] Error loading from JSON file:', err)
  }
  return []
}

function saveToFile(data: InstallationRequestData[]) {
  try {
    ensureDataFile()
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error('[InstallationsStore] Error saving to JSON file:', err)
  }
}

export async function initInstallationsStore() {
  if (isInitialized) return
  ensureDataFile()
  inMemoryInstallations = loadFromFile()
  isInitialized = true
}

export async function getAllInstallations(): Promise<InstallationRequestData[]> {
  await initInstallationsStore()

  // 1. If MongoDB is connected, read from DB
  if (isDbConnected()) {
    try {
      const docs = await InstallationRequestModel.find().sort({ createdAt: -1 }).lean()
      if (docs && docs.length > 0) {
        return docs.map((d: any) => ({
          ...d,
          createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : new Date().toISOString(),
        }))
      }
    } catch (err) {
      console.warn('[InstallationsStore] MongoDB query failed, falling back to local store:', err)
    }
  }

  // 2. Read from Redis or local store
  try {
    const cached = await cacheGet<InstallationRequestData[]>('pb:installations:all')
    if (cached && Array.isArray(cached)) {
      inMemoryInstallations = cached
      return cached
    }
  } catch {}

  return [...inMemoryInstallations]
}

export async function getInstallationById(id: string): Promise<InstallationRequestData | null> {
  const all = await getAllInstallations()
  return all.find((r) => r.id === id) || null
}

export async function createInstallation(data: Partial<InstallationRequestData>): Promise<InstallationRequestData> {
  await initInstallationsStore()

  const now = new Date().toISOString()
  const code = data.id || `PB-OWNER-${Math.floor(100000 + Math.random() * 900000)}`

  const newRecord: InstallationRequestData = {
    id: code,
    venueType: data.venueType || 'college',
    orgName: data.orgName || 'Unnamed Venue',
    campusName: data.campusName || 'Main Campus',
    city: data.city || 'Pune',
    state: data.state || 'Maharashtra',
    pincode: data.pincode || '411058',
    contactName: data.contactName || '',
    contactRole: data.contactRole || 'Owner / Representative',
    contactEmail: data.contactEmail || '',
    contactPhone: data.contactPhone || '',
    footfall: data.footfall || '500-1500',
    timeline: data.timeline || 'immediate',
    hasPower: data.hasPower !== undefined ? data.hasPower : true,
    hasSecurity: data.hasSecurity !== undefined ? data.hasSecurity : true,
    notes: data.notes || '',
    status: data.status || 'NEW',
    priority: data.priority || 'HIGH',
    assignedLead: data.assignedLead || 'Unassigned',
    assignedKioskId: data.assignedKioskId,
    estimatedUnits: data.estimatedUnits || 1,
    createdAt: now,
    updatedAt: now,
    surveyNotes: data.surveyNotes || [
      {
        id: `sn-${Date.now()}`,
        author: 'Web Inbound Portal',
        text: `Public website purchase & deployment application received from ${data.orgName || 'Venue'} (${data.city || 'Pune'}). Contact: ${data.contactName || ''} (${data.contactPhone || ''}).`,
        timestamp: now,
      },
    ],
  }

  // 1. Save to MongoDB if connected
  if (isDbConnected()) {
    try {
      await InstallationRequestModel.create({
        ...newRecord,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
    } catch (err) {
      console.warn('[InstallationsStore] Error creating in MongoDB:', err)
    }
  }

  // 2. Save to in-memory + file
  inMemoryInstallations = [newRecord, ...inMemoryInstallations.filter((r) => r.id !== code)]
  saveToFile(inMemoryInstallations)

  // 3. Cache in Redis
  try {
    await cacheSet('pb:installations:all', inMemoryInstallations, 3600)
    await cacheDel('admin:dashboard:')
  } catch {}

  return newRecord
}

export async function updateInstallation(
  id: string,
  patch: Partial<InstallationRequestData>
): Promise<InstallationRequestData | null> {
  await initInstallationsStore()
  const all = await getAllInstallations()
  const idx = all.findIndex((r) => r.id === id)
  if (idx === -1) return null

  const now = new Date().toISOString()
  const existing = all[idx]
  const updated: InstallationRequestData = {
    ...existing,
    ...patch,
    id: existing.id, // Immutable ID
    updatedAt: now,
    surveyNotes: patch.surveyNotes || existing.surveyNotes,
  }

  all[idx] = updated
  inMemoryInstallations = all
  saveToFile(inMemoryInstallations)

  if (isDbConnected()) {
    try {
      await InstallationRequestModel.updateOne({ id }, { ...patch, updatedAt: new Date(now) })
    } catch (err) {
      console.warn('[InstallationsStore] Error updating in MongoDB:', err)
    }
  }

  try {
    await cacheSet('pb:installations:all', inMemoryInstallations, 3600)
  } catch {}

  return updated
}

export async function deleteInstallation(id: string): Promise<boolean> {
  await initInstallationsStore()
  const all = await getAllInstallations()
  const filtered = all.filter((r) => r.id !== id)
  if (filtered.length === all.length) return false

  inMemoryInstallations = filtered
  saveToFile(inMemoryInstallations)

  if (isDbConnected()) {
    try {
      await InstallationRequestModel.deleteOne({ id })
    } catch (err) {
      console.warn('[InstallationsStore] Error deleting in MongoDB:', err)
    }
  }

  try {
    await cacheSet('pb:installations:all', inMemoryInstallations, 3600)
  } catch {}

  return true
}
