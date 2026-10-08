export type VenueType =
  | 'merchant'
  | 'college'
  | 'office'
  | 'coworking'
  | 'library'
  | 'hospital'

export type InstallationStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'SITE_SURVEY'
  | 'COMMERCIAL_QUOTED'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'INSTALLED'
  | 'REJECTED'

export type InstallationPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'

export interface SurveyNote {
  id: string
  author: string
  text: string
  timestamp: string
}

export interface InstallationRequest {
  id: string // e.g. REQ-2026-001 or PB-OWNER-749214
  venueType: VenueType
  orgName: string
  campusName: string
  city: string
  state: string
  pincode: string
  contactName: string
  contactRole: string
  contactEmail: string
  contactPhone: string
  footfall: string // e.g. '1500-3000'
  timeline: string // e.g. 'immediate', '30-days'
  hasPower: boolean
  hasSecurity: boolean
  notes: string
  status: InstallationStatus
  priority: InstallationPriority
  assignedLead?: string
  allocatedKioskId?: string // assigned when approved/dispatched e.g. PB-005
  estimatedUnits: number
  createdAt: string
  updatedAt: string
  surveyNotes: SurveyNote[]
}

import { api } from './api'

const STORAGE_KEY = 'pb_installation_requests'
const FAKE_REQ_IDS = new Set([
  'REQ-2026-081',
  'REQ-2026-082',
  'REQ-2026-079',
  'REQ-2026-077',
  'REQ-2026-074',
  'REQ-2026-071',
  'REQ-2026-068',
  'REQ-2026-065',
])

export async function fetchInstallationRequests(): Promise<InstallationRequest[]> {
  try {
    const res = await api.get('/installations')
    if (res.data?.success && Array.isArray(res.data.data)) {
      const serverList: InstallationRequest[] = res.data.data
      const localList = getInstallationRequests()

      if (serverList.length > 0) {
        saveInstallationRequests(serverList)
        return serverList
      } else if (localList.length > 0) {
        // If server was newly booted with empty state, sync local requests up
        for (const req of localList) {
          api.post('/installations', req).catch(() => {})
        }
        return localList
      }
      saveInstallationRequests([])
      return []
    }
  } catch (err) {
    console.warn('[Installations] Error fetching from backend API:', err)
  }
  return getInstallationRequests()
}

export function getInstallationRequests(): InstallationRequest[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    // Filter out old fake demo seeds so only real requests exist
    const realReqs = parsed.filter(r => r && r.id && !FAKE_REQ_IDS.has(r.id) && !r.id.startsWith('REQ-FAKE'))
    if (realReqs.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(realReqs))
    }
    return realReqs
  } catch (err) {
    console.error('Failed to parse installation requests from localStorage:', err)
    return []
  }
}

export function saveInstallationRequests(requests: InstallationRequest[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests))
    window.dispatchEvent(new CustomEvent('pb_installation_updated', { detail: { requests } }))
  } catch (err) {
    console.error('Failed to save installation requests:', err)
  }
}

export function updateInstallationStatus(
  id: string,
  newStatus: InstallationStatus,
  noteText?: string,
  author: string = 'Platform Ops Lead'
): InstallationRequest {
  const list = getInstallationRequests()
  let updatedReq: InstallationRequest | undefined

  const updatedList = list.map(req => {
    if (req.id === id) {
      const now = new Date().toISOString()
      const newNotes = [...req.surveyNotes]
      if (noteText) {
        newNotes.push({
          id: `sn-${Date.now()}`,
          author,
          text: noteText,
          timestamp: now,
        })
      }
      updatedReq = {
        ...req,
        status: newStatus,
        updatedAt: now,
        surveyNotes: newNotes,
      }
      return updatedReq
    }
    return req
  })

  if (!updatedReq) throw new Error(`Installation Request ${id} not found`)
  saveInstallationRequests(updatedList)

  api.patch(`/installations/${id}`, {
    status: newStatus,
    surveyNotes: updatedReq.surveyNotes,
  }).catch(err => console.warn('[Installations] Error updating status on backend:', err))

  return updatedReq
}

export function addSurveyNote(
  id: string,
  noteText: string,
  author: string = 'Platform Admin'
): InstallationRequest {
  const list = getInstallationRequests()
  let updatedReq: InstallationRequest | undefined

  const updatedList = list.map(req => {
    if (req.id === id) {
      const now = new Date().toISOString()
      const newNotes = [
        ...req.surveyNotes,
        {
          id: `sn-${Date.now()}`,
          author,
          text: noteText,
          timestamp: now,
        },
      ]
      updatedReq = {
        ...req,
        updatedAt: now,
        surveyNotes: newNotes,
      }
      return updatedReq
    }
    return req
  })

  if (!updatedReq) throw new Error(`Installation Request ${id} not found`)
  saveInstallationRequests(updatedList)

  api.patch(`/installations/${id}`, {
    surveyNotes: updatedReq.surveyNotes,
  }).catch(err => console.warn('[Installations] Error adding note on backend:', err))

  return updatedReq
}

export function allocateKioskToRequest(
  id: string,
  kioskId: string,
  noteText?: string
): InstallationRequest {
  const list = getInstallationRequests()
  let updatedReq: InstallationRequest | undefined

  const updatedList = list.map(req => {
    if (req.id === id) {
      const now = new Date().toISOString()
      const newNotes = [...req.surveyNotes]
      const note = noteText || (kioskId ? `Hardware serial ${kioskId} assigned for deployment` : 'Hardware serial unassigned')
      newNotes.push({
        id: `sn-${Date.now()}`,
        author: 'Platform Ops Lead',
        text: note,
        timestamp: now,
      })
      updatedReq = {
        ...req,
        allocatedKioskId: kioskId || undefined,
        updatedAt: now,
        surveyNotes: newNotes,
      }
      return updatedReq
    }
    return req
  })

  if (!updatedReq) throw new Error(`Installation Request ${id} not found`)
  saveInstallationRequests(updatedList)

  api.patch(`/installations/${id}`, {
    allocatedKioskId: kioskId || undefined,
    assignedKioskId: kioskId || undefined,
    surveyNotes: updatedReq.surveyNotes,
  }).catch(err => console.warn('[Installations] Error assigning kiosk on backend:', err))

  return updatedReq
}

export function deleteInstallationRequest(id: string): void {
  const list = getInstallationRequests()
  const updated = list.filter(r => r.id !== id)
  saveInstallationRequests(updated)
  api.delete(`/installations/${id}`).catch(err => console.warn('[Installations] Error deleting on backend:', err))
}

export function createInstallationRequest(data: {
  venueType: VenueType
  orgName: string
  campusName: string
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
  priority?: InstallationPriority
  estimatedUnits?: number
}): InstallationRequest {
  const list = getInstallationRequests()
  const nextNum = 1001 + list.length
  const newId = `REQ-2026-${nextNum}`
  const now = new Date().toISOString()

  const newReq: InstallationRequest = {
    id: newId,
    venueType: data.venueType,
    orgName: data.orgName,
    campusName: data.campusName,
    city: data.city,
    state: data.state,
    pincode: data.pincode,
    contactName: data.contactName,
    contactRole: data.contactRole,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    footfall: data.footfall,
    timeline: data.timeline,
    hasPower: data.hasPower,
    hasSecurity: data.hasSecurity,
    notes: data.notes || '',
    status: 'NEW',
    priority: data.priority || 'HIGH',
    assignedLead: 'Unassigned',
    estimatedUnits: data.estimatedUnits || 1,
    createdAt: now,
    updatedAt: now,
    surveyNotes: [
      {
        id: `sn-${Date.now()}`,
        author: 'System Intake',
        text: `Inbound kiosk purchase & installation request received from ${data.orgName} (${data.city}).`,
        timestamp: now,
      },
    ],
  }

  const updated = [newReq, ...list]
  saveInstallationRequests(updated)

  api.post('/installations', newReq).catch(err => {
    console.warn('[Installations] Error syncing new request to backend:', err)
  })

  return newReq
}

export function getInstallationStats() {
  const requests = getInstallationRequests()
  const newCount = requests.filter(r => r.status === 'NEW').length
  const contactedCount = requests.filter(r => r.status === 'CONTACTED').length
  const surveyCount = requests.filter(r => r.status === 'SITE_SURVEY').length
  const quotedCount = requests.filter(r => r.status === 'COMMERCIAL_QUOTED').length
  const approvedCount = requests.filter(r => r.status === 'APPROVED').length
  const dispatchedCount = requests.filter(r => r.status === 'DISPATCHED').length
  const installedCount = requests.filter(r => r.status === 'INSTALLED').length

  const collegeCount = requests.filter(r => r.venueType === 'college').length
  const merchantCount = requests.filter(r => r.venueType === 'merchant').length
  const commercialCount = requests.filter(r => ['office', 'coworking', 'library', 'hospital'].includes(r.venueType)).length

  const totalUnitsRequested = requests.reduce((acc, r) => acc + (Number(r.estimatedUnits) || 1), 0)
  const conversionRate = requests.length > 0
    ? Math.round((installedCount / requests.length) * 100)
    : 100

  return {
    total: requests.length,
    newRequests: newCount,
    inPipeline: contactedCount + surveyCount + quotedCount,
    approvedAndDispatched: approvedCount + dispatchedCount,
    installed: installedCount,
    collegeCount,
    merchantCount,
    commercialCount,
    totalUnitsRequested,
    conversionRate,
  }
}
