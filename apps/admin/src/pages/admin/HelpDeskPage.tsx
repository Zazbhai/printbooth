import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Headset,
  User,
  Storefront,
  MagnifyingGlass,
  Plus,
  X,
  DownloadSimple,
  PaperPlaneTilt,
  Clock,
  CheckCircle,
  WarningCircle,
  Wrench,
  Package,
  CreditCard,
  Tag,
  MapPin,
  DeviceMobile,
  EnvelopeSimple,
  ArrowsClockwise,
  ShieldCheck,
  NotePencil,
} from '@phosphor-icons/react'
import type {
  HelpDeskTicket,
  QuerySenderType,
  QueryCategory,
  QueryPriority,
  QueryStatus,
} from '@/lib/helpdesk'
import {
  getHelpDeskTickets,
  fetchHelpDeskTickets,
  updateTicketStatus,
  addTicketMessage,
  createHelpDeskTicket,
  getHelpDeskStats,
} from '@/lib/helpdesk'
import { getAdminKiosks } from '@/lib/api'
import Select, { type TSelectData } from '@/components/ui/select'
import './HelpDeskPage.css'

const STATUS_OPTIONS: TSelectData[] = [
  { id: 'all', label: 'All Statuses', value: 'ALL', icon: '⚡', description: 'Show all open, active & closed tickets' },
  { id: 'open', label: 'Open', value: 'OPEN', icon: '🔴', description: 'Immediate triage required' },
  { id: 'in_progress', label: 'In Progress', value: 'IN_PROGRESS', icon: '🔵', description: 'Technician or lead assigned' },
  { id: 'resolved', label: 'Resolved', value: 'RESOLVED', icon: '🟢', description: 'Issue fixed or refund dispatched' },
  { id: 'closed', label: 'Closed', value: 'CLOSED', icon: '⚪', description: 'Archived and confirmed' },
]

const PRIORITY_OPTIONS: TSelectData[] = [
  { id: 'all_p', label: 'All Priorities', value: 'ALL', icon: '🎯', description: 'Filter by urgency level' },
  { id: 'critical', label: 'Critical', value: 'CRITICAL', icon: '🔥', description: 'Immediate SLA response' },
  { id: 'high', label: 'High', value: 'HIGH', icon: '⚡', description: 'Resolution within 1 hour' },
  { id: 'normal', label: 'Normal', value: 'NORMAL', icon: '📋', description: 'Standard queue' },
  { id: 'low', label: 'Low', value: 'LOW', icon: '🌱', description: 'Non-urgent questions' },
]

const CATEGORY_OPTIONS: TSelectData[] = [
  { id: 'all_c', label: 'All Categories', value: 'ALL', icon: '🗂️', description: 'Show all ticket categories' },
  { id: 'paper_jam', label: 'Paper Jam / Feed', value: 'PAPER_JAM', icon: '📄', description: 'Cassette feed or paper path stuck' },
  { id: 'payment_refund', label: 'Payment / Refund', value: 'PAYMENT_REFUND', icon: '💳', description: 'UPI deducted, print failed' },
  { id: 'hardware_maintenance', label: 'Hardware Maintenance', value: 'HARDWARE_MAINTENANCE', icon: '🔧', description: 'Thermal roller, touchscreen, wiring' },
  { id: 'supplies_restock', label: 'Supplies Restock', value: 'SUPPLIES_RESTOCK', icon: '📦', description: 'A4 paper reams or toner cartridge low' },
  { id: 'kiosk_offline', label: 'Kiosk Offline Alert', value: 'KIOSK_OFFLINE', icon: '⚠️', description: 'Heartbeat lost, Wi-Fi disconnected' },
  { id: 'account_payout', label: 'Merchant Payout / UTR', value: 'ACCOUNT_PAYOUT', icon: '💰', description: 'Weekly commission & revenue reconciliation' },
  { id: 'general_inquiry', label: 'General Inquiry', value: 'GENERAL_INQUIRY', icon: '💬', description: 'General questions and support' },
]

export default function HelpDeskPage() {
  const [tickets, setTickets] = useState<HelpDeskTicket[]>([])
  const [stats, setStats] = useState(getHelpDeskStats())
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [originFilter, setOriginFilter] = useState<'ALL' | QuerySenderType>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Drawer reply composer state
  const [replyText, setReplyText] = useState('')
  const [isInternalNote, setIsInternalNote] = useState(false)

  // Log Query Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    senderType: 'USER' as QuerySenderType,
    title: '',
    category: 'PAPER_JAM' as QueryCategory,
    priority: 'HIGH' as QueryPriority,
    requesterName: '',
    requesterEmail: '',
    requesterPhone: '',
    kioskId: 'PB-001',
    kioskLocation: 'MIT ADT University, Central Reading Hall, Pune',
    orderId: '',
    initialMessage: '',
  })

  // Live hardware kiosks
  const [liveKiosks, setLiveKiosks] = useState<any[]>([])

  // Load tickets on mount & sync on custom event
  const refreshData = () => {
    const list = getHelpDeskTickets()
    setTickets(list)
    setStats(getHelpDeskStats())
  }

  useEffect(() => {
    refreshData()
    fetchHelpDeskTickets().then(list => {
      if (Array.isArray(list)) {
        setTickets(list)
        setStats(getHelpDeskStats())
      }
    })
    getAdminKiosks().then(kiosks => {
      if (Array.isArray(kiosks)) {
        setLiveKiosks(kiosks)
      }
    })

    const handleUpdate = () => refreshData()
    window.addEventListener('pb_helpdesk_updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)

    return () => {
      window.removeEventListener('pb_helpdesk_updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedTicketId(null)
        setModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (selectedTicketId || modalOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [selectedTicketId, modalOpen])

  // Currently selected ticket
  const selectedTicket = useMemo(() => {
    if (!selectedTicketId) return null
    return tickets.find(t => t.id === selectedTicketId) || null
  }, [tickets, selectedTicketId])

  // Real-time hardware telemetry linked to selected ticket
  const ticketTelemetry = useMemo(() => {
    if (!selectedTicket) return null
    if (selectedTicket.hardwareTelemetry) return selectedTicket.hardwareTelemetry
    if (!selectedTicket.kioskId) return null
    const kiosk = liveKiosks.find(k => k.id === selectedTicket.kioskId || k.kioskId === selectedTicket.kioskId)
    if (!kiosk) return null
    return {
      printerStatus: kiosk.printerStatus || (kiosk.status === 'ONLINE' ? 'READY' : 'OFFLINE'),
      paperLevel: kiosk.paperLevel ?? kiosk.paper ?? 85,
      tonerLevel: kiosk.tonerLevel ?? kiosk.toner ?? 90,
    }
  }, [selectedTicket, liveKiosks])

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      // Origin filter
      if (originFilter !== 'ALL' && ticket.senderType !== originFilter) {
        return false
      }
      // Status filter
      if (statusFilter !== 'ALL' && ticket.status !== statusFilter) {
        return false
      }
      // Priority filter
      if (priorityFilter !== 'ALL' && ticket.priority !== priorityFilter) {
        return false
      }
      // Category filter
      if (categoryFilter !== 'ALL' && ticket.category !== categoryFilter) {
        return false
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchId = ticket.id.toLowerCase().includes(q)
        const matchTitle = ticket.title.toLowerCase().includes(q)
        const matchName = ticket.requesterName.toLowerCase().includes(q)
        const matchEmail = ticket.requesterEmail.toLowerCase().includes(q)
        const matchPhone = ticket.requesterPhone.toLowerCase().includes(q)
        const matchKiosk = ticket.kioskId?.toLowerCase().includes(q) || false
        const matchOrder = ticket.orderId?.toLowerCase().includes(q) || false
        if (!matchId && !matchTitle && !matchName && !matchEmail && !matchPhone && !matchKiosk && !matchOrder) {
          return false
        }
      }
      return true
    })
  }, [tickets, originFilter, statusFilter, priorityFilter, categoryFilter, searchQuery])

  // Status badge class
  const getStatusClass = (st: QueryStatus) => {
    switch (st) {
      case 'OPEN': return 'open'
      case 'IN_PROGRESS': return 'in_progress'
      case 'RESOLVED': return 'resolved'
      case 'CLOSED': return 'closed'
    }
  }

  // Priority badge class
  const getPriorityClass = (pr: QueryPriority) => {
    switch (pr) {
      case 'CRITICAL': return 'critical'
      case 'HIGH': return 'high'
      case 'NORMAL': return 'normal'
      case 'LOW': return 'low'
    }
  }

  // Handle status update
  const handleStatusChange = (tktId: string, newStatus: QueryStatus) => {
    updateTicketStatus(tktId, newStatus)
    refreshData()
  }

  // Handle send message/note
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTicket || !replyText.trim()) return

    addTicketMessage(selectedTicket.id, {
      sender: 'ADMIN',
      senderName: 'Platform Ops Admin',
      text: replyText.trim(),
      isInternalNote: isInternalNote,
    })

    setReplyText('')
    setIsInternalNote(false)
    refreshData()
  }

  // Handle quick macro insertion / execution
  const applyMacro = (macroText: string, markStatus?: QueryStatus) => {
    if (!selectedTicket) return
    addTicketMessage(selectedTicket.id, {
      sender: 'ADMIN',
      senderName: 'Fleet Automations',
      text: macroText,
      isInternalNote: false,
    })
    if (markStatus) {
      updateTicketStatus(selectedTicket.id, markStatus)
    }
    refreshData()
  }

  // Handle create ticket submission
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim() || !formData.requesterName.trim() || !formData.initialMessage.trim()) {
      alert('Please fill out all required fields')
      return
    }

    const created = createHelpDeskTicket({
      senderType: formData.senderType,
      title: formData.title,
      category: formData.category,
      priority: formData.priority,
      requesterName: formData.requesterName,
      requesterEmail: formData.requesterEmail || 'user@printbooth.in',
      requesterPhone: formData.requesterPhone || '+91 90906 36363',
      kioskId: formData.kioskId,
      kioskLocation: formData.kioskLocation,
      orderId: formData.orderId || undefined,
      initialMessage: formData.initialMessage,
    })

    setModalOpen(false)
    refreshData()
    setSelectedTicketId(created.id)
    setFormData({
      senderType: 'USER',
      title: '',
      category: 'PAPER_JAM',
      priority: 'HIGH',
      requesterName: '',
      requesterEmail: '',
      requesterPhone: '',
      kioskId: 'PB-001',
      kioskLocation: 'MIT ADT University, Central Reading Hall, Pune',
      orderId: '',
      initialMessage: '',
    })
  }

  // Format date helper
  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString)
      const now = Date.now()
      const diffMin = Math.round((now - d.getTime()) / (1000 * 60))
      if (diffMin < 60) return `${diffMin}m ago`
      const diffHours = Math.round(diffMin / 60)
      if (diffHours < 24) return `${diffHours}h ago`
      return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return isoString
    }
  }

  // Export tickets as CSV
  const exportTicketsCSV = () => {
    const headers = ['Ticket ID', 'Sender Type', 'Requester Name', 'Email', 'Phone', 'Kiosk ID', 'Category', 'Priority', 'Status', 'Created At', 'Title']
    const rows = filteredTickets.map(t => [
      t.id,
      t.senderType,
      `"${t.requesterName}"`,
      t.requesterEmail,
      t.requesterPhone,
      t.kioskId || 'N/A',
      t.category,
      t.priority,
      t.status,
      t.createdAt,
      `"${t.title.replace(/"/g, '""')}"`
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `printbooth_helpdesk_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="helpdesk-page">
      {/* ── Top Header ── */}
      <header className="helpdesk-header">
        <div className="helpdesk-header__title-group">
          <div className="helpdesk-header__title">
            <Headset size={28} weight="duotone" color="#dc2626" />
            <span>Help Desk & Operations Triage</span>
            <span className="helpdesk-header__badge">Unified Feed</span>
          </div>
          <p className="helpdesk-header__sub">
            Centralized dispute resolution and triage for both <strong>User print issues</strong> (paper jams, UPI refunds) and <strong>Merchant Partner requisitions</strong> (paper restocks, hardware telemetry, payouts).
          </p>
        </div>

        <div className="helpdesk-header__actions">
          <button
            type="button"
            className="macro-chip"
            onClick={exportTicketsCSV}
            title="Export filtered tickets to CSV"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px' }}
          >
            <DownloadSimple size={15} weight="bold" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            className="macro-chip"
            onClick={refreshData}
            title="Refresh tickets"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px' }}
          >
            <ArrowsClockwise size={15} weight="bold" />
            <span>Sync</span>
          </button>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setModalOpen(true)}
            style={{
              background: '#dc2626',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
            }}
          >
            <Plus size={16} weight="bold" />
            <span>Log New Query</span>
          </button>
        </div>
      </header>

      {/* ── KPI Summary Cards ── */}
      <section className="helpdesk-kpis" aria-label="Help desk operational metrics">
        <div className="helpdesk-kpi-card">
          <div className="helpdesk-kpi-card__top">
            <span className="helpdesk-kpi-card__label">Total Queries</span>
            <div className="helpdesk-kpi-card__icon-wrap" style={{ background: '#f1f5f9', color: '#475569' }}>
              <Tag size={16} weight="duotone" />
            </div>
          </div>
          <div className="helpdesk-kpi-card__val">{stats.total}</div>
          <div className="helpdesk-kpi-card__sub">
            <span>{stats.inProgress} in active triage</span>
          </div>
        </div>

        <div className="helpdesk-kpi-card">
          <div className="helpdesk-kpi-card__top">
            <span className="helpdesk-kpi-card__label">Open Issues</span>
            <div className="helpdesk-kpi-card__icon-wrap" style={{ background: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}>
              <WarningCircle size={16} weight="duotone" />
            </div>
          </div>
          <div className="helpdesk-kpi-card__val" style={{ color: stats.open > 0 ? '#dc2626' : '#16a34a' }}>
            {stats.open}
          </div>
          <div className="helpdesk-kpi-card__sub">
            <span style={{ color: stats.critical > 0 ? '#dc2626' : undefined, fontWeight: stats.critical > 0 ? 700 : 400 }}>
              {stats.critical} Critical priority
            </span>
          </div>
        </div>

        <div className="helpdesk-kpi-card">
          <div className="helpdesk-kpi-card__top">
            <span className="helpdesk-kpi-card__label">User / Customer</span>
            <div className="helpdesk-kpi-card__icon-wrap" style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
              <User size={16} weight="duotone" />
            </div>
          </div>
          <div className="helpdesk-kpi-card__val" style={{ color: '#2563eb' }}>
            {stats.userQueries}
          </div>
          <div className="helpdesk-kpi-card__sub">
            <span>Refunds, jams & print errors</span>
          </div>
        </div>

        <div className="helpdesk-kpi-card">
          <div className="helpdesk-kpi-card__top">
            <span className="helpdesk-kpi-card__label">Merchant Partners</span>
            <div className="helpdesk-kpi-card__icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
              <Storefront size={16} weight="duotone" />
            </div>
          </div>
          <div className="helpdesk-kpi-card__val" style={{ color: '#059669' }}>
            {stats.merchantQueries}
          </div>
          <div className="helpdesk-kpi-card__sub">
            <span>Supplies, payouts & repairs</span>
          </div>
        </div>

        <div className="helpdesk-kpi-card">
          <div className="helpdesk-kpi-card__top">
            <span className="helpdesk-kpi-card__label">First-Response SLA</span>
            <div className="helpdesk-kpi-card__icon-wrap" style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#ca8a04' }}>
              <Clock size={16} weight="duotone" />
            </div>
          </div>
          <div className="helpdesk-kpi-card__val">{stats.slaRate}%</div>
          <div className="helpdesk-kpi-card__sub">
            <span>Avg {stats.avgResolutionMin}m resolution time</span>
          </div>
        </div>
      </section>

      {/* ── Filter Controls Bar ── */}
      <section className="helpdesk-filters-bar">
        <div className="helpdesk-filters-top">
          {/* Origin Segmented Tabs */}
          <div className="origin-segments" role="tablist" aria-label="Query origin selector">
            <button
              type="button"
              role="tab"
              aria-selected={originFilter === 'ALL'}
              className={`origin-segment-btn ${originFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setOriginFilter('ALL')}
            >
              <span>All Queries</span>
              <span className="origin-segment-count">{stats.total}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={originFilter === 'USER'}
              className={`origin-segment-btn ${originFilter === 'USER' ? 'active' : ''}`}
              onClick={() => setOriginFilter('USER')}
            >
              <User size={14} weight="bold" />
              <span>Customer Queries</span>
              <span className="origin-segment-count">{stats.userQueries}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={originFilter === 'MERCHANT'}
              className={`origin-segment-btn ${originFilter === 'MERCHANT' ? 'active' : ''}`}
              onClick={() => setOriginFilter('MERCHANT')}
            >
              <Storefront size={14} weight="bold" />
              <span>Merchant Queries</span>
              <span className="origin-segment-count">{stats.merchantQueries}</span>
            </button>
          </div>

          <div style={{ fontSize: 12, color: 'var(--clr-text-3, #64748b)' }}>
            Showing <strong>{filteredTickets.length}</strong> of {tickets.length} tickets
          </div>
        </div>

        {/* Search & dropdown filters */}
        <div className="helpdesk-filters-controls">
          <div className="helpdesk-search-wrap">
            <MagnifyingGlass size={16} className="helpdesk-search-icon" />
            <input
              type="text"
              className="helpdesk-search-input"
              placeholder="Search by ticket ID, name, kiosk, order ID, phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <Select
            title="Ticket Status"
            data={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            dropdownWidth={280}
            size="sm"
          />

          <Select
            title="Ticket Priority"
            data={PRIORITY_OPTIONS}
            value={priorityFilter}
            onChange={(val) => setPriorityFilter(val)}
            dropdownWidth={280}
            size="sm"
          />

          <Select
            title="Ticket Category"
            data={CATEGORY_OPTIONS}
            value={categoryFilter}
            onChange={(val) => setCategoryFilter(val)}
            dropdownWidth={320}
            size="sm"
          />
        </div>
      </section>

      {/* ── Tickets Table ── */}
      <section className="helpdesk-table-card">
        <div className="helpdesk-table-wrap">
          <table className="helpdesk-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Origin</th>
                <th>Subject & Category</th>
                <th>Requester</th>
                <th>Location / Kiosk</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Last Update</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 16px', color: '#64748b' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <Headset size={36} weight="light" color="#94a3b8" />
                      {tickets.length === 0 ? (
                        <>
                          <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                            No support tickets currently in queue
                          </p>
                          <p style={{ margin: 0, fontSize: 12.5, color: '#64748b', maxWidth: 440 }}>
                            User queries submitted from customer portal or merchant kiosks will arrive in real-time. Zero mock records are used.
                          </p>
                          <button
                            type="button"
                            className="macro-chip"
                            onClick={() => setModalOpen(true)}
                            style={{ marginTop: 6 }}
                          >
                            <Plus size={14} weight="bold" />
                            <span>Log Support Ticket</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <p style={{ margin: 0, fontWeight: 600 }}>No tickets match the current filter criteria</p>
                          <button
                            type="button"
                            className="macro-chip"
                            onClick={() => {
                              setOriginFilter('ALL')
                              setStatusFilter('ALL')
                              setPriorityFilter('ALL')
                              setCategoryFilter('ALL')
                              setSearchQuery('')
                            }}
                          >
                            Reset all filters
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTickets.map(ticket => {
                  const isSelected = selectedTicketId === ticket.id
                  return (
                    <tr
                      key={ticket.id}
                      className={isSelected ? 'selected' : ''}
                      onClick={() => setSelectedTicketId(ticket.id)}
                    >
                      <td>
                        <span className="tkt-id-badge">{ticket.id}</span>
                      </td>

                      <td>
                        {ticket.senderType === 'USER' ? (
                          <span className="origin-pill user">
                            <User size={12} weight="bold" />
                            <span>Customer</span>
                          </span>
                        ) : (
                          <span className="origin-pill merchant">
                            <Storefront size={12} weight="bold" />
                            <span>Merchant</span>
                          </span>
                        )}
                      </td>

                      <td>
                        <div className="tkt-subject-cell">
                          <span className="tkt-title">{ticket.title}</span>
                          <span className="tkt-category-tag">
                            <span>{ticket.category.replace(/_/g, ' ')}</span>
                            {ticket.orderId && <span>• Order {ticket.orderId}</span>}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{ticket.requesterName}</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{ticket.requesterPhone}</span>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{ticket.kioskId || 'N/A'}</span>
                          <span
                            style={{
                              fontSize: 11,
                              color: '#64748b',
                              maxWidth: 160,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={ticket.kioskLocation}
                          >
                            {ticket.kioskLocation || 'General Desk'}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span className={`priority-pill ${getPriorityClass(ticket.priority)}`}>
                          {ticket.priority}
                        </span>
                      </td>

                      <td>
                        <span className={`status-pill ${getStatusClass(ticket.status)}`}>
                          {ticket.status === 'RESOLVED' && <CheckCircle size={12} weight="bold" />}
                          {ticket.status === 'IN_PROGRESS' && <Clock size={12} weight="bold" />}
                          {ticket.status.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                          {formatDate(ticket.updatedAt)}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Center Detail Modal (Zero Layout Shift via Portal to document.body) ── */}
      {selectedTicket && createPortal(
        <div
          className="helpdesk-modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) setSelectedTicketId(null)
          }}
          role="presentation"
        >
          <div className="helpdesk-center-modal" role="dialog" aria-modal="true" aria-label="Ticket details modal">
            {/* Header */}
            <div className="helpdesk-drawer__header">
              <div className="helpdesk-drawer__header-left">
                <span className="tkt-id-badge" style={{ fontSize: 13 }}>{selectedTicket.id}</span>
                <span className={`origin-pill ${selectedTicket.senderType.toLowerCase()}`}>
                  {selectedTicket.senderType === 'USER' ? <User size={12} weight="bold" /> : <Storefront size={12} weight="bold" />}
                  <span>{selectedTicket.senderType === 'USER' ? 'User Query' : 'Merchant Partner'}</span>
                </span>
                <span className={`priority-pill ${getPriorityClass(selectedTicket.priority)}`}>
                  {selectedTicket.priority}
                </span>
              </div>

              <div className="helpdesk-drawer__header-right">
                <Select
                  title="Update Ticket Status"
                  data={STATUS_OPTIONS.filter((o) => o.value !== 'ALL')}
                  value={selectedTicket.status}
                  onChange={(val) => handleStatusChange(selectedTicket.id, val as QueryStatus)}
                  dropdownWidth={260}
                  size="sm"
                  align="right"
                />

                <button
                  type="button"
                  className="helpdesk-drawer__close"
                  onClick={() => setSelectedTicketId(null)}
                  aria-label="Close ticket drawer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="helpdesk-drawer__body">
              {/* Title & Metadata */}
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px 0', color: '#0f172a' }}>
                  {selectedTicket.title}
                </h2>
                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>Created: {new Date(selectedTicket.createdAt).toLocaleString('en-IN')}</span>
                  {selectedTicket.assignedTo && <span>• Assigned: <strong>{selectedTicket.assignedTo}</strong></span>}
                </div>
              </div>

              {/* Requester & Kiosk Meta Card */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '12px 14px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                fontSize: 12,
              }}>
                <div>
                  <span style={{ color: '#64748b', display: 'block', marginBottom: 2, fontWeight: 600 }}>Requester</span>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedTicket.requesterName}</div>
                  <div style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <EnvelopeSimple size={13} />
                    <a href={`mailto:${selectedTicket.requesterEmail}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {selectedTicket.requesterEmail}
                    </a>
                  </div>
                  <div style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <DeviceMobile size={13} />
                    <a href={`tel:${selectedTicket.requesterPhone}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {selectedTicket.requesterPhone}
                    </a>
                  </div>
                </div>

                <div>
                  <span style={{ color: '#64748b', display: 'block', marginBottom: 2, fontWeight: 600 }}>Kiosk & Order Link</span>
                  {selectedTicket.kioskId ? (
                    <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={13} color="#dc2626" />
                      <span>{selectedTicket.kioskId}</span>
                    </div>
                  ) : (
                    <div style={{ color: '#94a3b8' }}>No Kiosk Assigned</div>
                  )}
                  {selectedTicket.kioskLocation && (
                    <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                      {selectedTicket.kioskLocation}
                    </div>
                  )}
                  {selectedTicket.orderId && (
                    <div style={{ marginTop: 4, fontWeight: 600, color: '#dc2626' }}>
                      Order: #{selectedTicket.orderId}
                    </div>
                  )}
                </div>
              </div>

              {/* Hardware Telemetry Snapshot (if kiosk linked) */}
              {ticketTelemetry && (
                <div className="drawer-telemetry-box">
                  <div className="drawer-telemetry-header">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Wrench size={16} weight="duotone" color="#dc2626" />
                      <span>Live Kiosk Telemetry ({selectedTicket.kioskId})</span>
                    </span>
                    <span style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: ticketTelemetry.printerStatus === 'READY' ? '#dcfce7' : '#fee2e2',
                      color: ticketTelemetry.printerStatus === 'READY' ? '#15803d' : '#b91c1c',
                    }}>
                      {ticketTelemetry.printerStatus}
                    </span>
                  </div>

                  <div className="drawer-telemetry-bars">
                    <div className="telemetry-bar-wrap">
                      <div className="telemetry-bar-label">
                        <span>Paper Tray Cassette</span>
                        <strong>{ticketTelemetry.paperLevel}%</strong>
                      </div>
                      <div className="telemetry-progress-bg">
                        <div
                          className="telemetry-progress-fill"
                          style={{
                            width: `${ticketTelemetry.paperLevel}%`,
                            background: ticketTelemetry.paperLevel < 20 ? '#dc2626' : '#16a34a',
                          }}
                        />
                      </div>
                    </div>

                    <div className="telemetry-bar-wrap">
                      <div className="telemetry-bar-label">
                        <span>Black Toner Cartridge</span>
                        <strong>{ticketTelemetry.tonerLevel}%</strong>
                      </div>
                      <div className="telemetry-progress-bg">
                        <div
                          className="telemetry-progress-fill"
                          style={{
                            width: `${ticketTelemetry.tonerLevel}%`,
                            background: ticketTelemetry.tonerLevel < 20 ? '#d97706' : '#2563eb',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Action Macros */}
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', display: 'block', marginBottom: 8 }}>
                  Quick Response Macros
                </span>
                <div className="macro-chips">
                  {selectedTicket.senderType === 'USER' ? (
                    <>
                      <button
                        type="button"
                        className="macro-chip"
                        onClick={() => applyMacro('We have verified the paper jam telemetry and reversed your payment of ₹24 directly to your original UPI account via Razorpay. UTR will reflect within 24 hours.', 'RESOLVED')}
                      >
                        <CreditCard size={13} />
                        <span>Issue Refund & Resolve</span>
                      </button>

                      <button
                        type="button"
                        className="macro-chip"
                        onClick={() => applyMacro('We have sent a reprint command to Kiosk Tray 1. Please tap "Collect Print" on the screen.')}
                      >
                        <ArrowsClockwise size={13} />
                        <span>Trigger Remote Reprint</span>
                      </button>

                      <button
                        type="button"
                        className="macro-chip"
                        onClick={() => applyMacro('Could you please reply with the UPI transaction ID or a screenshot of your payment receipt so we can trace the order?')}
                      >
                        <NotePencil size={13} />
                        <span>Ask For UPI Proof</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="macro-chip"
                        onClick={() => applyMacro('Restock Requisition #PO-7741 approved. 5 reams of JK Cedar A4 75 GSM paper have been dispatched via Pune Central Courier for delivery today.', 'IN_PROGRESS')}
                      >
                        <Package size={13} />
                        <span>Approve Paper Restock</span>
                      </button>

                      <button
                        type="button"
                        className="macro-chip"
                        onClick={() => applyMacro('Technician Mahesh More has been dispatched with a replacement toner cartridge and roller kit. ETA: 45 minutes.', 'IN_PROGRESS')}
                      >
                        <Wrench size={13} />
                        <span>Dispatch Field Tech</span>
                      </button>

                      <button
                        type="button"
                        className="macro-chip"
                        onClick={() => applyMacro('Merchant payout for weekly settlement cycle has been initiated to your HDFC bank account. Bank UTR will be shared shortly.')}
                      >
                        <CreditCard size={13} />
                        <span>Confirm Payout Release</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Conversation Thread */}
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', display: 'block', marginBottom: 12 }}>
                  Communication Timeline ({selectedTicket.messages.length})
                </span>

                <div className="helpdesk-thread">
                  {selectedTicket.messages.map(msg => {
                    const isSenderAdmin = msg.sender === 'ADMIN'
                    const isCustomer = msg.sender === 'CUSTOMER'
                    const isInternal = !!msg.isInternalNote

                    return (
                      <div
                        key={msg.id}
                        className={`thread-msg ${isInternal ? 'internal' : isSenderAdmin ? 'admin' : isCustomer ? 'customer' : 'merchant'}`}
                      >
                        <div className="thread-msg-meta">
                          {isInternal && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              background: '#fef3c7',
                              color: '#92400e',
                              padding: '1px 5px',
                              borderRadius: 4,
                              fontWeight: 700,
                              fontSize: 10,
                            }}>
                              <ShieldCheck size={11} weight="bold" /> Internal Note
                            </span>
                          )}
                          <strong>{msg.senderName}</strong>
                          <span>•</span>
                          <span>{formatDate(msg.timestamp)}</span>
                        </div>

                        <div className="thread-msg-bubble">
                          {msg.text}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Composer Footer */}
            <form className="helpdesk-composer" onSubmit={handleSendMessage}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                  {isInternalNote ? 'Confidential Ops Note (Only visible to admin team)' : `Reply to ${selectedTicket.requesterName}`}
                </span>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#64748b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={e => setIsInternalNote(e.target.checked)}
                  />
                  <span>Mark as internal note</span>
                </label>
              </div>

              <textarea
                className="composer-textarea"
                rows={3}
                placeholder={isInternalNote ? 'Type an internal team note, tech dispatch detail or refund verification...' : 'Write an official response to the customer or partner...'}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
              />

              <div className="composer-actions">
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  Press Send to post response & update ticket history
                </span>

                <button
                  type="submit"
                  disabled={!replyText.trim()}
                  style={{
                    background: isInternalNote ? '#d97706' : '#dc2626',
                    color: '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 12.5,
                    cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                    opacity: replyText.trim() ? 1 : 0.6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <PaperPlaneTilt size={14} weight="bold" />
                  <span>{isInternalNote ? 'Save Note' : 'Send Reply'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── Log New Query Modal ── */}
      {modalOpen && createPortal(
        <div
          className="helpdesk-modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) setModalOpen(false)
          }}
          role="presentation"
        >
          <div className="helpdesk-modal" role="dialog" aria-modal="true" aria-label="Log new query modal">
            <div className="helpdesk-modal__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Headset size={20} weight="bold" color="#dc2626" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  Log New Customer / Merchant Query
                </h3>
              </div>
              <button
                type="button"
                className="helpdesk-drawer__close"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="helpdesk-modal__body">
                {/* Sender Type Picker */}
                <div className="form-group">
                  <label className="form-label">Query Origin Type *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setFormData(f => ({ ...f, senderType: 'USER' }))}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: formData.senderType === 'USER' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: formData.senderType === 'USER' ? 'rgba(37, 99, 235, 0.06)' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        fontWeight: 600,
                        color: formData.senderType === 'USER' ? '#2563eb' : '#475569',
                      }}
                    >
                      <User size={18} weight="bold" />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 13 }}>Customer User Query</div>
                        <div style={{ fontSize: 11, fontWeight: 400, color: '#64748b' }}>Print jams, refund disputes, UPI</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData(f => ({ ...f, senderType: 'MERCHANT' }))}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: formData.senderType === 'MERCHANT' ? '2px solid #059669' : '1px solid #e2e8f0',
                        background: formData.senderType === 'MERCHANT' ? 'rgba(16, 185, 129, 0.06)' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        fontWeight: 600,
                        color: formData.senderType === 'MERCHANT' ? '#059669' : '#475569',
                      }}
                    >
                      <Storefront size={18} weight="bold" />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 13 }}>Merchant Partner Query</div>
                        <div style={{ fontSize: 11, fontWeight: 400, color: '#64748b' }}>Supplies, hardware maintenance, payouts</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Subject */}
                <div className="form-group">
                  <label className="form-label">Subject / Issue Summary *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Paper jam after UPI payment on Kiosk PB-001"
                    value={formData.title}
                    onChange={e => setFormData(f => ({ ...f, title: e.target.value }))}
                  />
                </div>

                {/* Category & Priority */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Category *</label>
                    <select
                      className="form-input"
                      value={formData.category}
                      onChange={e => setFormData(f => ({ ...f, category: e.target.value as QueryCategory }))}
                    >
                      <option value="PAPER_JAM">Paper Jam / Feed Failure</option>
                      <option value="PAYMENT_REFUND">Payment / Refund Dispute</option>
                      <option value="HARDWARE_MAINTENANCE">Hardware Maintenance</option>
                      <option value="SUPPLIES_RESTOCK">Supplies / Paper Restock</option>
                      <option value="KIOSK_OFFLINE">Kiosk Offline Alert</option>
                      <option value="ACCOUNT_PAYOUT">Merchant Payout / Settlement</option>
                      <option value="GENERAL_INQUIRY">General Inquiry</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Priority Level *</label>
                    <select
                      className="form-input"
                      value={formData.priority}
                      onChange={e => setFormData(f => ({ ...f, priority: e.target.value as QueryPriority }))}
                    >
                      <option value="CRITICAL">Critical (Immediate SLA)</option>
                      <option value="HIGH">High (Within 1 hour)</option>
                      <option value="NORMAL">Normal (Within 4 hours)</option>
                      <option value="LOW">Low (Within 24 hours)</option>
                    </select>
                  </div>
                </div>

                {/* Requester Details */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Requester Name *</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="e.g. Rohan Kulkarni"
                      value={formData.requesterName}
                      onChange={e => setFormData(f => ({ ...f, requesterName: e.target.value }))}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Phone Number *</label>
                    <input
                      type="tel"
                      required
                      className="form-input"
                      placeholder="+91 98220 12345"
                      value={formData.requesterPhone}
                      onChange={e => setFormData(f => ({ ...f, requesterPhone: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="rohan@example.com"
                      value={formData.requesterEmail}
                      onChange={e => setFormData(f => ({ ...f, requesterEmail: e.target.value }))}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Associated Kiosk</label>
                    <select
                      className="form-input"
                      value={formData.kioskId}
                      onChange={e => {
                        const kid = e.target.value
                        const matched = liveKiosks.find(k => (k.id || k.kioskId) === kid)
                        setFormData(f => ({
                          ...f,
                          kioskId: kid,
                          kioskLocation: matched ? (matched.location || matched.name) : 'General Desk',
                        }))
                      }}
                    >
                      <option value="">General Support (No Specific Kiosk)</option>
                      {liveKiosks.map(k => (
                        <option key={k.id || k.kioskId} value={k.id || k.kioskId}>
                          {k.id || k.kioskId} — {k.name || k.location}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {formData.senderType === 'USER' && (
                  <div className="form-group">
                    <label className="form-label">Order ID (Optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. ORD-8921"
                      value={formData.orderId}
                      onChange={e => setFormData(f => ({ ...f, orderId: e.target.value }))}
                    />
                  </div>
                )}

                {/* Initial Description */}
                <div className="form-group">
                  <label className="form-label">Initial Message / Problem Description *</label>
                  <textarea
                    required
                    rows={4}
                    className="form-input"
                    style={{ resize: 'vertical' }}
                    placeholder="Provide full description of the issue reported by the customer or merchant partner..."
                    value={formData.initialMessage}
                    onChange={e => setFormData(f => ({ ...f, initialMessage: e.target.value }))}
                  />
                </div>
              </div>

              <div className="helpdesk-modal__footer">
                <button
                  type="button"
                  className="macro-chip"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
