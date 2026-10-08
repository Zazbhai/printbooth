export type QuerySenderType = 'USER' | 'MERCHANT'

export type QueryCategory =
  | 'PAPER_JAM'
  | 'PAYMENT_REFUND'
  | 'HARDWARE_MAINTENANCE'
  | 'SUPPLIES_RESTOCK'
  | 'KIOSK_OFFLINE'
  | 'ACCOUNT_PAYOUT'
  | 'GENERAL_INQUIRY'

export type QueryPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'

export type QueryStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'

export interface QueryMessage {
  id: string
  sender: 'CUSTOMER' | 'MERCHANT' | 'ADMIN'
  senderName: string
  text: string
  timestamp: string
  isInternalNote?: boolean
}

export interface HelpDeskTicket {
  id: string // e.g. TKT-1001
  senderType: QuerySenderType // 'USER' | 'MERCHANT'
  title: string
  category: QueryCategory
  priority: QueryPriority
  status: QueryStatus
  requesterName: string
  requesterEmail: string
  requesterPhone: string
  kioskId?: string // e.g. PB-001
  kioskLocation?: string
  orderId?: string
  merchantId?: string
  createdAt: string
  updatedAt: string
  assignedTo?: string
  hardwareTelemetry?: {
    printerStatus: 'READY' | 'PAPER_JAM' | 'OFFLINE' | 'LOW_PAPER'
    paperLevel: number
    tonerLevel: number
  }
  messages: QueryMessage[]
}

import { api } from './api'

const STORAGE_KEY = 'pb_helpdesk_tickets'
const FAKE_TICKET_IDS = new Set([
  'TKT-1048',
  'TKT-1047',
  'TKT-1045',
  'TKT-1044',
  'TKT-1041',
  'TKT-1039',
  'TKT-1036',
  'TKT-1032',
])

export async function fetchHelpDeskTickets(): Promise<HelpDeskTicket[]> {
  try {
    const res = await api.get('/helpdesk')
    if (res.data?.success && Array.isArray(res.data.data)) {
      const serverList: HelpDeskTicket[] = res.data.data
      const localList = getHelpDeskTickets()

      if (serverList.length > 0) {
        saveHelpDeskTickets(serverList)
        return serverList
      } else if (localList.length > 0) {
        for (const t of localList) {
          api.post('/helpdesk', t).catch(() => {})
        }
        return localList
      }
      saveHelpDeskTickets([])
      return []
    }
  } catch (err) {
    console.warn('[HelpDesk] Error fetching from backend API:', err)
  }
  return getHelpDeskTickets()
}

export function getHelpDeskTickets(): HelpDeskTicket[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    // Purge any legacy fake demo tickets so only real requests exist
    const realTickets = parsed.filter(t => t && t.id && !FAKE_TICKET_IDS.has(t.id) && !t.id.startsWith('TKT-FAKE'))
    if (realTickets.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(realTickets))
    }
    return realTickets
  } catch (err) {
    console.error('Failed to parse helpdesk tickets from localStorage:', err)
    return []
  }
}

export function saveHelpDeskTickets(tickets: HelpDeskTicket[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets))
    window.dispatchEvent(new CustomEvent('pb_helpdesk_updated', { detail: { tickets } }))
  } catch (err) {
    console.error('Failed to save helpdesk tickets to localStorage:', err)
  }
}

export function getTicketById(id: string): HelpDeskTicket | undefined {
  const tickets = getHelpDeskTickets()
  return tickets.find(t => t.id === id)
}

export function deleteHelpDeskTicket(id: string): void {
  const tickets = getHelpDeskTickets()
  const filtered = tickets.filter(t => t.id !== id)
  saveHelpDeskTickets(filtered)
  api.delete(`/helpdesk/${id}`).catch(err => console.warn('[HelpDesk] Error deleting ticket:', err))
}

export function updateTicket(id: string, updates: Partial<HelpDeskTicket>): HelpDeskTicket {
  const tickets = getHelpDeskTickets()
  let updatedTicket: HelpDeskTicket | undefined

  const updatedTickets = tickets.map(t => {
    if (t.id === id) {
      updatedTicket = {
        ...t,
        ...updates,
        updatedAt: new Date().toISOString(),
      }
      return updatedTicket
    }
    return t
  })

  if (!updatedTicket) {
    throw new Error(`Ticket ${id} not found`)
  }

  saveHelpDeskTickets(updatedTickets)
  api.patch(`/helpdesk/${id}`, updates).catch(err => console.warn('[HelpDesk] Error updating ticket on backend:', err))
  return updatedTicket
}

export function updateTicketStatus(id: string, status: QueryStatus): HelpDeskTicket {
  return updateTicket(id, { status })
}

export function addTicketMessage(
  ticketId: string,
  message: Omit<QueryMessage, 'id' | 'timestamp'>
): HelpDeskTicket {
  const tickets = getHelpDeskTickets()
  let updatedTicket: HelpDeskTicket | undefined

  const updatedTickets = tickets.map(t => {
    if (t.id === ticketId) {
      const newMessage: QueryMessage = {
        ...message,
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
      }
      const newStatus: QueryStatus =
        t.status === 'OPEN' && message.sender === 'ADMIN' ? 'IN_PROGRESS' : t.status

      updatedTicket = {
        ...t,
        status: newStatus,
        updatedAt: new Date().toISOString(),
        messages: [...t.messages, newMessage],
      }
      return updatedTicket
    }
    return t
  })

  if (!updatedTicket) {
    throw new Error(`Ticket ${ticketId} not found`)
  }

  saveHelpDeskTickets(updatedTickets)
  return updatedTicket
}

export function createHelpDeskTicket(data: {
  senderType: QuerySenderType
  title: string
  category: QueryCategory
  priority: QueryPriority
  requesterName: string
  requesterEmail: string
  requesterPhone: string
  kioskId?: string
  kioskLocation?: string
  orderId?: string
  merchantId?: string
  initialMessage: string
  hardwareTelemetry?: {
    printerStatus: 'READY' | 'PAPER_JAM' | 'OFFLINE' | 'LOW_PAPER'
    paperLevel: number
    tonerLevel: number
  }
}): HelpDeskTicket {
  const tickets = getHelpDeskTickets()
  const nextNum = 1001 + tickets.length
  const newId = `TKT-${nextNum}`
  const now = new Date().toISOString()

  const newTicket: HelpDeskTicket = {
    id: newId,
    senderType: data.senderType,
    title: data.title,
    category: data.category,
    priority: data.priority,
    status: 'OPEN',
    requesterName: data.requesterName,
    requesterEmail: data.requesterEmail,
    requesterPhone: data.requesterPhone,
    kioskId: data.kioskId,
    kioskLocation: data.kioskLocation,
    orderId: data.orderId,
    merchantId: data.merchantId,
    hardwareTelemetry: data.hardwareTelemetry,
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: `msg-${Date.now()}`,
        sender: data.senderType === 'USER' ? 'CUSTOMER' : 'MERCHANT',
        senderName: data.requesterName,
        text: data.initialMessage,
        timestamp: now,
      },
    ],
  }

  const updated = [newTicket, ...tickets]
  saveHelpDeskTickets(updated)
  api.post('/helpdesk', newTicket).catch(err => console.warn('[HelpDesk] Error creating ticket on backend:', err))
  return newTicket
}

export function getHelpDeskStats() {
  const tickets = getHelpDeskTickets()
  const openCount = tickets.filter(t => t.status === 'OPEN').length
  const inProgressCount = tickets.filter(t => t.status === 'IN_PROGRESS').length
  const resolvedCount = tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length
  const userCount = tickets.filter(t => t.senderType === 'USER').length
  const merchantCount = tickets.filter(t => t.senderType === 'MERCHANT').length
  const criticalCount = tickets.filter(t => t.priority === 'CRITICAL' && t.status !== 'RESOLVED' && t.status !== 'CLOSED').length

  let avgResolutionMin = 0
  const resolvedTickets = tickets.filter(t => (t.status === 'RESOLVED' || t.status === 'CLOSED') && t.createdAt && t.updatedAt)
  if (resolvedTickets.length > 0) {
    const totalMin = resolvedTickets.reduce((acc, t) => {
      const diff = Math.max(1, Math.round((new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60)))
      return acc + diff
    }, 0)
    avgResolutionMin = Math.round(totalMin / resolvedTickets.length)
  }

  const slaRate = tickets.length > 0
    ? Math.min(100, Math.round((tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED' || t.messages.length > 1).length / tickets.length) * 100))
    : 100

  return {
    total: tickets.length,
    open: openCount,
    inProgress: inProgressCount,
    resolved: resolvedCount,
    userQueries: userCount,
    merchantQueries: merchantCount,
    critical: criticalCount,
    avgResolutionMin,
    slaRate,
  }
}
