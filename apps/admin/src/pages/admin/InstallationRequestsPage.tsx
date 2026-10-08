import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  GraduationCap,
  Storefront,
  Buildings,
  Briefcase,
  Books,
  FirstAid,
  MagnifyingGlass,
  Plus,
  X,
  DownloadSimple,
  CheckCircle,
  WarningCircle,
  Lightning,
  ShieldCheck,
  MapPin,
  DeviceMobile,
  EnvelopeSimple,
  ArrowsClockwise,
  Truck,
  Wrench,
  PaperPlaneTilt,
  HardDrives,
  CurrencyInr,
  User,
} from '@phosphor-icons/react'
import type {
  InstallationRequest,
  VenueType,
  InstallationStatus,
  InstallationPriority,
} from '@/lib/installations'
import {
  getInstallationRequests,
  fetchInstallationRequests,
  updateInstallationStatus,
  addSurveyNote,
  allocateKioskToRequest,
  createInstallationRequest,
  getInstallationStats,
} from '@/lib/installations'
import { getAdminKiosks } from '@/lib/api'
import Select, { type TSelectData } from '@/components/ui/select'
import './InstallationRequestsPage.css'

const INSTALL_STATUS_OPTIONS: TSelectData[] = [
  { id: 'all_s', label: 'All Statuses', value: 'ALL', icon: '⚡', description: 'Show all installation leads' },
  { id: 'new', label: 'New Lead', value: 'NEW', icon: '🔴', description: 'Fresh application pending initial call' },
  { id: 'contacted', label: 'Contacted', value: 'CONTACTED', icon: '🔵', description: 'Initial requirements verified' },
  { id: 'site_survey', label: 'Site Survey', value: 'SITE_SURVEY', icon: '🟣', description: 'Space & electrical audit scheduled' },
  { id: 'commercial_quoted', label: 'Commercial Quoted', value: 'COMMERCIAL_QUOTED', icon: '🟡', description: 'Turnkey quote & pro-forma shared' },
  { id: 'approved', label: 'Approved', value: 'APPROVED', icon: '🟢', description: 'PO confirmed, serial assigned' },
  { id: 'dispatched', label: 'Dispatched', value: 'DISPATCHED', icon: '🚚', description: 'Kiosk en route via tech movers' },
  { id: 'installed', label: 'Installed & Live', value: 'INSTALLED', icon: '🏆', description: 'On-site bolting & calibration done' },
  { id: 'rejected', label: 'Rejected', value: 'REJECTED', icon: '⚪', description: 'Incompatible space or cancelled' },
]

const INSTALL_PRIORITY_OPTIONS: TSelectData[] = [
  { id: 'all_p', label: 'All Priorities', value: 'ALL', icon: '🎯', description: 'All priority levels' },
  { id: 'critical', label: 'Critical', value: 'CRITICAL', icon: '🔥', description: 'Immediate deployment deadline' },
  { id: 'high', label: 'High', value: 'HIGH', icon: '⚡', description: 'High footfall venue' },
  { id: 'normal', label: 'Normal', value: 'NORMAL', icon: '📋', description: 'Standard rollout' },
  { id: 'low', label: 'Low', value: 'LOW', icon: '🌱', description: 'Exploratory lead' },
]

const TIMELINE_OPTIONS: TSelectData[] = [
  { id: 'all_t', label: 'All Timelines', value: 'ALL', icon: '📅', description: 'Show all delivery schedules' },
  { id: 'immediate', label: 'Immediate (< 7 Days)', value: 'immediate', icon: '⚡', description: 'Ready for instant delivery' },
  { id: '30_days', label: 'Within 30 Days', value: '30-days', icon: '📆', description: 'Next monthly rollout cycle' },
  { id: 'quarter', label: 'Next Quarter', value: 'quarter', icon: '🗓️', description: 'Upcoming budget semester' },
  { id: 'completed', label: 'Completed / Handover', value: 'completed', icon: '✅', description: 'Delivered and active' },
]

export default function InstallationRequestsPage() {
  const [requests, setRequests] = useState<InstallationRequest[]>([])
  const [stats, setStats] = useState(getInstallationStats())
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null)
  const [venueFilter, setVenueFilter] = useState<'ALL' | VenueType>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL')
  const [timelineFilter, setTimelineFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Drawer note state
  const [newNoteText, setNewNoteText] = useState('')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    venueType: 'college' as VenueType,
    orgName: '',
    campusName: '',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411058',
    contactName: '',
    contactRole: '',
    contactEmail: '',
    contactPhone: '',
    footfall: '1500-3000',
    timeline: 'immediate',
    hasPower: true,
    hasSecurity: true,
    notes: '',
    priority: 'HIGH' as InstallationPriority,
    estimatedUnits: 1,
  })

  // Live hardware kiosks
  const [liveKiosks, setLiveKiosks] = useState<any[]>([])

  const refreshData = () => {
    const list = getInstallationRequests()
    setRequests(list)
    setStats(getInstallationStats())
  }

  useEffect(() => {
    refreshData()
    fetchInstallationRequests().then(list => {
      if (Array.isArray(list)) {
        setRequests(list)
        setStats(getInstallationStats())
      }
    })
    getAdminKiosks().then(kiosks => {
      if (Array.isArray(kiosks)) {
        setLiveKiosks(kiosks)
      }
    })

    const handleUpdate = () => refreshData()
    window.addEventListener('pb_installation_updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('pb_installation_updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedReqId(null)
        setModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (selectedReqId || modalOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [selectedReqId, modalOpen])

  // Selected request
  const selectedReq = useMemo(() => {
    if (!selectedReqId) return null
    return requests.find(r => r.id === selectedReqId) || null
  }, [requests, selectedReqId])

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      if (venueFilter !== 'ALL' && req.venueType !== venueFilter) return false
      if (statusFilter !== 'ALL' && req.status !== statusFilter) return false
      if (priorityFilter !== 'ALL' && req.priority !== priorityFilter) return false
      if (timelineFilter !== 'ALL' && req.timeline !== timelineFilter) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchId = req.id.toLowerCase().includes(q)
        const matchOrg = req.orgName.toLowerCase().includes(q)
        const matchCampus = req.campusName.toLowerCase().includes(q)
        const matchContact = req.contactName.toLowerCase().includes(q)
        const matchPhone = req.contactPhone.toLowerCase().includes(q)
        const matchEmail = req.contactEmail.toLowerCase().includes(q)
        const matchCity = req.city.toLowerCase().includes(q)
        const matchPincode = req.pincode.toLowerCase().includes(q)
        if (!matchId && !matchOrg && !matchCampus && !matchContact && !matchPhone && !matchEmail && !matchCity && !matchPincode) {
          return false
        }
      }
      return true
    })
  }, [requests, venueFilter, statusFilter, priorityFilter, timelineFilter, searchQuery])

  // Helpers
  const getVenueIcon = (type: VenueType) => {
    switch (type) {
      case 'college': return <GraduationCap size={14} weight="bold" />
      case 'merchant': return <Storefront size={14} weight="bold" />
      case 'office': return <Buildings size={14} weight="bold" />
      case 'coworking': return <Briefcase size={14} weight="bold" />
      case 'library': return <Books size={14} weight="bold" />
      case 'hospital': return <FirstAid size={14} weight="bold" />
    }
  }

  const getVenueLabel = (type: VenueType) => {
    switch (type) {
      case 'college': return 'College / University'
      case 'merchant': return 'Xerox & Stationery'
      case 'office': return 'Office / Tech Park'
      case 'coworking': return 'Coworking Hub'
      case 'library': return 'Library'
      case 'hospital': return 'Hospital / Clinic'
    }
  }

  const getStatusClass = (status: InstallationStatus) => {
    return status.toLowerCase()
  }

  const getPriorityClass = (priority: InstallationPriority) => {
    return priority.toLowerCase()
  }

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString)
      const now = Date.now()
      const diffMin = Math.round((now - d.getTime()) / (1000 * 60))
      if (diffMin < 60) return `${diffMin}m ago`
      const diffHours = Math.round(diffMin / 60)
      if (diffHours < 24) return `${diffHours}h ago`
      const diffDays = Math.round(diffHours / 24)
      if (diffDays < 7) return `${diffDays}d ago`
      return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
    } catch {
      return isoString
    }
  }

  // Handle status update
  const handleStatusChange = (reqId: string, newStatus: InstallationStatus, note?: string) => {
    updateInstallationStatus(reqId, newStatus, note)
    refreshData()
  }

  // Add survey note
  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedReq || !newNoteText.trim()) return
    addSurveyNote(selectedReq.id, newNoteText.trim(), 'Platform Ops Lead')
    setNewNoteText('')
    refreshData()
  }


  // Handle hardware serial allocation
  const handleAllocateKiosk = (reqId: string, kioskId: string) => {
    allocateKioskToRequest(reqId, kioskId)
    refreshData()
  }

  // Handle manual request submission
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.orgName.trim() || !formData.contactName.trim() || !formData.contactPhone.trim()) {
      alert('Please fill out all required fields')
      return
    }

    const created = createInstallationRequest({
      venueType: formData.venueType,
      orgName: formData.orgName,
      campusName: formData.campusName || 'Main Campus',
      city: formData.city,
      state: formData.state,
      pincode: formData.pincode,
      contactName: formData.contactName,
      contactRole: formData.contactRole || 'Operations Contact',
      contactEmail: formData.contactEmail || 'contact@example.com',
      contactPhone: formData.contactPhone,
      footfall: formData.footfall,
      timeline: formData.timeline,
      hasPower: formData.hasPower,
      hasSecurity: formData.hasSecurity,
      notes: formData.notes,
      priority: formData.priority,
      estimatedUnits: Number(formData.estimatedUnits) || 1,
    })

    setModalOpen(false)
    refreshData()
    setSelectedReqId(created.id)
    setFormData({
      venueType: 'college',
      orgName: '',
      campusName: '',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411058',
      contactName: '',
      contactRole: '',
      contactEmail: '',
      contactPhone: '',
      footfall: '1500-3000',
      timeline: 'immediate',
      hasPower: true,
      hasSecurity: true,
      notes: '',
      priority: 'HIGH',
      estimatedUnits: 1,
    })
  }

  // CSV Export
  const exportCSV = () => {
    const headers = [
      'Request ID',
      'Venue Type',
      'Organization Name',
      'Campus / Area',
      'City',
      'Pincode',
      'Contact Person',
      'Role',
      'Phone',
      'Email',
      'Footfall',
      'Units',
      'Timeline',
      'Power Ready',
      'Security Ready',
      'Status',
      'Priority',
      'Assigned Lead',
      'Created Date',
    ]
    const rows = filteredRequests.map(r => [
      r.id,
      r.venueType,
      `"${r.orgName.replace(/"/g, '""')}"`,
      `"${r.campusName.replace(/"/g, '""')}"`,
      r.city,
      r.pincode,
      `"${r.contactName.replace(/"/g, '""')}"`,
      `"${r.contactRole.replace(/"/g, '""')}"`,
      r.contactPhone,
      r.contactEmail,
      r.footfall,
      r.estimatedUnits,
      r.timeline,
      r.hasPower ? 'YES' : 'NO',
      r.hasSecurity ? 'YES' : 'NO',
      r.status,
      r.priority,
      r.assignedLead || 'Unassigned',
      r.createdAt,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `printbooth_installation_requests_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Progress Stepper mapping
  const STEPS: { status: InstallationStatus; label: string; shortLabel: string }[] = [
    { status: 'NEW', label: '1. Received', shortLabel: 'Received' },
    { status: 'CONTACTED', label: '2. Contacted', shortLabel: 'Contact' },
    { status: 'SITE_SURVEY', label: '3. Site Survey', shortLabel: 'Survey' },
    { status: 'COMMERCIAL_QUOTED', label: '4. Commercial Quote', shortLabel: 'Quote' },
    { status: 'APPROVED', label: '5. Approved', shortLabel: 'Approved' },
    { status: 'DISPATCHED', label: '6. Dispatched', shortLabel: 'Dispatch' },
    { status: 'INSTALLED', label: '7. Live Handover', shortLabel: 'Live' },
  ]

  const getStepIndex = (st: InstallationStatus) => {
    switch (st) {
      case 'NEW': return 0
      case 'CONTACTED': return 1
      case 'SITE_SURVEY': return 2
      case 'COMMERCIAL_QUOTED': return 3
      case 'APPROVED': return 4
      case 'DISPATCHED': return 5
      case 'INSTALLED': return 6
      case 'REJECTED': return -1
    }
  }

  return (
    <div className="installations-page">
      {/* ── Top Header ── */}
      <header className="installations-header">
        <div className="installations-header__title-group">
          <div className="installations-header__title">
            <HardDrives size={28} weight="duotone" color="#dc2626" />
            <span>Kiosk Purchase & Installation Requests</span>
            <span className="installations-header__badge">Dealership Pipeline</span>
          </div>
          <p className="installations-header__sub">
            Review and fulfill inbound requests from <strong>universities, colleges, stationery stores, tech parks, and commercial hubs</strong> requesting turnkey PrintBooth kiosk purchases and deployments.
          </p>
        </div>

        <div className="installations-header__actions">
          <button
            type="button"
            className="macro-chip"
            onClick={exportCSV}
            title="Export filtered installation requests to CSV"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px' }}
          >
            <DownloadSimple size={15} weight="bold" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            className="macro-chip"
            onClick={refreshData}
            title="Refresh requests"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px' }}
          >
            <ArrowsClockwise size={15} weight="bold" />
            <span>Sync</span>
          </button>

          <button
            type="button"
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
            <span>Log Inbound Lead</span>
          </button>
        </div>
      </header>

      {/* ── KPI Summary Cards ── */}
      <section className="installations-kpis" aria-label="Installation pipeline metrics">
        <div className="installations-kpi-card">
          <div className="installations-kpi-card__top">
            <span className="installations-kpi-card__label">Total Applications</span>
            <div className="installations-kpi-card__icon-wrap" style={{ background: '#f1f5f9', color: '#475569' }}>
              <HardDrives size={16} weight="duotone" />
            </div>
          </div>
          <div className="installations-kpi-card__val">{stats.total}</div>
          <div className="installations-kpi-card__sub">
            <span>{stats.totalUnitsRequested} kiosks requested</span>
          </div>
        </div>

        <div className="installations-kpi-card">
          <div className="installations-kpi-card__top">
            <span className="installations-kpi-card__label">New Inbound</span>
            <div className="installations-kpi-card__icon-wrap" style={{ background: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}>
              <WarningCircle size={16} weight="duotone" />
            </div>
          </div>
          <div className="installations-kpi-card__val" style={{ color: stats.newRequests > 0 ? '#dc2626' : '#16a34a' }}>
            {stats.newRequests}
          </div>
          <div className="installations-kpi-card__sub">
            <span>Pending initial call</span>
          </div>
        </div>

        <div className="installations-kpi-card">
          <div className="installations-kpi-card__top">
            <span className="installations-kpi-card__label">Survey & Quoting</span>
            <div className="installations-kpi-card__icon-wrap" style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}>
              <Wrench size={16} weight="duotone" />
            </div>
          </div>
          <div className="installations-kpi-card__val" style={{ color: '#7c3aed' }}>
            {stats.inPipeline}
          </div>
          <div className="installations-kpi-card__sub">
            <span>Active technical evaluation</span>
          </div>
        </div>

        <div className="installations-kpi-card">
          <div className="installations-kpi-card__top">
            <span className="installations-kpi-card__label">Approved & Dispatched</span>
            <div className="installations-kpi-card__icon-wrap" style={{ background: 'rgba(13, 148, 136, 0.1)', color: '#0d9488' }}>
              <Truck size={16} weight="duotone" />
            </div>
          </div>
          <div className="installations-kpi-card__val" style={{ color: '#0d9488' }}>
            {stats.approvedAndDispatched}
          </div>
          <div className="installations-kpi-card__sub">
            <span>En route / assembly</span>
          </div>
        </div>

        <div className="installations-kpi-card">
          <div className="installations-kpi-card__top">
            <span className="installations-kpi-card__label">Installed & Live</span>
            <div className="installations-kpi-card__icon-wrap" style={{ background: 'rgba(22, 163, 74, 0.1)', color: '#16a34a' }}>
              <CheckCircle size={16} weight="duotone" />
            </div>
          </div>
          <div className="installations-kpi-card__val" style={{ color: '#16a34a' }}>
            {stats.installed}
          </div>
          <div className="installations-kpi-card__sub">
            <span>{stats.conversionRate}% completion rate</span>
          </div>
        </div>
      </section>

      {/* ── Filter Controls Bar ── */}
      <section className="installations-filters-bar">
        <div className="installations-filters-top">
          {/* Venue Segments */}
          <div className="venue-segments" role="tablist" aria-label="Venue category selector">
            <button
              type="button"
              role="tab"
              aria-selected={venueFilter === 'ALL'}
              className={`venue-segment-btn ${venueFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setVenueFilter('ALL')}
            >
              <span>All Venues</span>
              <span className="venue-segment-count">{stats.total}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={venueFilter === 'college'}
              className={`venue-segment-btn ${venueFilter === 'college' ? 'active' : ''}`}
              onClick={() => setVenueFilter('college')}
            >
              <GraduationCap size={14} weight="bold" />
              <span>Colleges & Unis</span>
              <span className="venue-segment-count">{stats.collegeCount}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={venueFilter === 'merchant'}
              className={`venue-segment-btn ${venueFilter === 'merchant' ? 'active' : ''}`}
              onClick={() => setVenueFilter('merchant')}
            >
              <Storefront size={14} weight="bold" />
              <span>Xerox & Stationery</span>
              <span className="venue-segment-count">{stats.merchantCount}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={venueFilter === 'office'}
              className={`venue-segment-btn ${venueFilter === 'office' ? 'active' : ''}`}
              onClick={() => setVenueFilter('office')}
            >
              <Buildings size={14} weight="bold" />
              <span>Tech Parks / Offices</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={venueFilter === 'coworking'}
              className={`venue-segment-btn ${venueFilter === 'coworking' ? 'active' : ''}`}
              onClick={() => setVenueFilter('coworking')}
            >
              <Briefcase size={14} weight="bold" />
              <span>Coworking</span>
            </button>
          </div>

          <div style={{ fontSize: 12, color: 'var(--clr-text-3, #64748b)' }}>
            Showing <strong>{filteredRequests.length}</strong> of {requests.length} applications
          </div>
        </div>

        {/* Search & dropdowns */}
        <div className="installations-filters-controls">
          <div className="installations-search-wrap">
            <MagnifyingGlass size={16} className="installations-search-icon" />
            <input
              type="text"
              className="installations-search-input"
              placeholder="Search by college, store, contact, phone, city, pincode..."
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
            title="Deployment Status"
            data={INSTALL_STATUS_OPTIONS}
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            dropdownWidth={280}
            size="sm"
          />

          <Select
            title="Lead Priority"
            data={INSTALL_PRIORITY_OPTIONS}
            value={priorityFilter}
            onChange={(val) => setPriorityFilter(val)}
            dropdownWidth={280}
            size="sm"
          />

          <Select
            title="Fulfillment Timeline"
            data={TIMELINE_OPTIONS}
            value={timelineFilter}
            onChange={(val) => setTimelineFilter(val)}
            dropdownWidth={280}
            size="sm"
          />
        </div>
      </section>

      {/* ── Table Card ── */}
      <section className="installations-table-card">
        <div className="installations-table-wrap">
          <table className="installations-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Organization & Venue</th>
                <th>Location / City</th>
                <th>Contact Person</th>
                <th>Footfall & Units</th>
                <th>Site Readiness</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Lead Assigned</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '48px 16px', color: '#64748b' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <HardDrives size={36} weight="light" color="#94a3b8" />
                      {requests.length === 0 ? (
                        <>
                          <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                            No installation requests currently in queue
                          </p>
                          <p style={{ margin: 0, fontSize: 12.5, color: '#64748b', maxWidth: 460 }}>
                            Inbound applications submitted by universities, colleges, and business partners via the public portal will appear here in real-time. Zero mock records are used.
                          </p>
                          <button
                            type="button"
                            className="macro-chip"
                            onClick={() => setModalOpen(true)}
                            style={{ marginTop: 6 }}
                          >
                            <Plus size={14} weight="bold" />
                            <span>Log Inbound Application</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <p style={{ margin: 0, fontWeight: 600 }}>No installation requests match this filter</p>
                          <button
                            type="button"
                            className="macro-chip"
                            onClick={() => {
                              setVenueFilter('ALL')
                              setStatusFilter('ALL')
                              setPriorityFilter('ALL')
                              setTimelineFilter('ALL')
                              setSearchQuery('')
                            }}
                          >
                            Reset filters
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRequests.map(req => {
                  const isSelected = selectedReqId === req.id
                  return (
                    <tr
                      key={req.id}
                      className={isSelected ? 'selected' : ''}
                      onClick={() => setSelectedReqId(req.id)}
                    >
                      <td>
                        <span className="req-id-badge">{req.id}</span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 260 }}>
                          <span style={{ fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                            {req.orgName}
                          </span>
                          <span className={`venue-type-badge ${req.venueType}`}>
                            {getVenueIcon(req.venueType)}
                            <span>{getVenueLabel(req.venueType)}</span>
                          </span>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{req.city}, {req.pincode}</span>
                          <span
                            style={{
                              fontSize: 11,
                              color: '#64748b',
                              maxWidth: 180,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={req.campusName}
                          >
                            {req.campusName}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{req.contactName}</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{req.contactRole}</span>
                          <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>{req.contactPhone}</span>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>{req.estimatedUnits} Unit{req.estimatedUnits > 1 ? 's' : ''}</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{req.footfall} daily</span>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            className={`readiness-icon ${req.hasPower ? 'ready' : 'pending'}`}
                            title={req.hasPower ? '230V Socket Ready' : 'Power Socket Pending'}
                          >
                            <Lightning size={12} weight="bold" />
                          </span>
                          <span
                            className={`readiness-icon ${req.hasSecurity ? 'ready' : 'pending'}`}
                            title={req.hasSecurity ? 'CCTV / Security Verified' : 'Security Pending'}
                          >
                            <ShieldCheck size={12} weight="bold" />
                          </span>
                        </div>
                      </td>

                      <td>
                        <span className={`install-status-pill ${getStatusClass(req.status)}`}>
                          {req.status === 'INSTALLED' && <CheckCircle size={12} weight="bold" />}
                          {req.status === 'DISPATCHED' && <Truck size={12} weight="bold" />}
                          {req.status.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td>
                        <span className={`install-priority-pill ${getPriorityClass(req.priority)}`}>
                          {req.priority}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: 12, color: req.assignedLead ? '#0f172a' : '#94a3b8', fontWeight: 500 }}>
                          {req.assignedLead || 'Unassigned'}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                          {formatDate(req.updatedAt)}
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

      {/* ── Center Detail Inspection Modal (Zero Layout Shift via Portal to document.body) ── */}
      {selectedReq && createPortal(
        <div
          className="installations-modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) setSelectedReqId(null)
          }}
          role="presentation"
        >
          <div className="installations-center-modal" role="dialog" aria-modal="true" aria-label="Installation Request Dossier">
            {/* Header Bar */}
            <div className="installations-drawer__header">
              <div className="installations-drawer__header-left">
                <span className="dossier-id-badge">{selectedReq.id}</span>
                <span className={`venue-type-badge ${selectedReq.venueType}`}>
                  {getVenueIcon(selectedReq.venueType)}
                  <span>{getVenueLabel(selectedReq.venueType)}</span>
                </span>
                <span className={`install-priority-pill ${getPriorityClass(selectedReq.priority)}`}>
                  <span className="priority-pulse-dot" />
                  {selectedReq.priority}
                </span>
              </div>

              <div className="installations-drawer__header-right">
                <Select
                  title="Update Status"
                  data={INSTALL_STATUS_OPTIONS.filter((o) => o.value !== 'ALL')}
                  value={selectedReq.status}
                  onChange={(val) => handleStatusChange(selectedReq.id, val as InstallationStatus, `Status updated to ${val}`)}
                  dropdownWidth={260}
                  size="sm"
                  align="right"
                />

                <button
                  type="button"
                  className="installations-drawer__close"
                  onClick={() => setSelectedReqId(null)}
                  aria-label="Close dossier"
                  title="Close (Esc)"
                >
                  <X size={18} weight="bold" />
                </button>
              </div>
            </div>

            {/* Scrollable Dossier Body */}
            <div className="installations-drawer__body">
              {/* Stepper Progress Rail (Zero Collisions, Segmented Bar + Clean Milestone Chips) */}
              <div className="dossier-pipeline-card">
                <div className="dossier-pipeline-header">
                  <div className="dossier-pipeline-title">
                    <span>DEPLOYMENT PIPELINE</span>
                    <span className="dossier-step-counter">
                      Step {Math.max(1, getStepIndex(selectedReq.status) + 1)} of {STEPS.length}
                    </span>
                  </div>
                  <div className={`dossier-status-pill dossier-status-pill--${getStatusClass(selectedReq.status)}`}>
                    <span className="dossier-status-dot" />
                    <span>{selectedReq.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>

                {/* Segmented Fill Bar */}
                <div className="dossier-track-rail">
                  {STEPS.map((step, idx) => {
                    const currentIdx = getStepIndex(selectedReq.status)
                    const isCompleted = idx < currentIdx
                    const isCurrent = idx === currentIdx
                    return (
                      <div
                        key={step.status}
                        className={`dossier-track-segment ${isCompleted ? 'is-completed' : isCurrent ? 'is-current' : 'is-upcoming'}`}
                        onClick={() => handleStatusChange(selectedReq.id, step.status, `Advanced to step: ${step.label}`)}
                        title={`Click to set status to ${step.label}`}
                      />
                    )
                  })}
                </div>

                {/* Milestone Node Chips */}
                <div className="dossier-milestones-row">
                  {STEPS.map((step, idx) => {
                    const currentIdx = getStepIndex(selectedReq.status)
                    const isCompleted = idx < currentIdx
                    const isCurrent = idx === currentIdx

                    return (
                      <button
                        key={step.status}
                        type="button"
                        className={`dossier-milestone-chip ${isCompleted ? 'is-completed' : isCurrent ? 'is-current' : 'is-upcoming'}`}
                        onClick={() => handleStatusChange(selectedReq.id, step.status, `Advanced to step: ${step.label}`)}
                        title={`Click to advance: ${step.label}`}
                      >
                        <span className="milestone-badge">
                          {isCompleted ? <CheckCircle size={10} weight="bold" /> : idx + 1}
                        </span>
                        <span className="milestone-text">{step.shortLabel}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Title, Location & Hardware Serial Hero */}
              <div className="dossier-venue-hero">
                <div className="dossier-venue-identity">
                  <h2 className="dossier-venue-title">{selectedReq.orgName}</h2>
                  <div className="dossier-venue-location">
                    <MapPin size={15} weight="duotone" color="#dc2626" />
                    <span>{selectedReq.campusName}, {selectedReq.city} · {selectedReq.pincode} ({selectedReq.state})</span>
                  </div>
                </div>

                <div className="dossier-hardware-slot">
                  <span className="dossier-slot-label">Hardware Allocation:</span>
                  {selectedReq.allocatedKioskId ? (
                    <div className="dossier-allocated-badge">
                      <HardDrives size={14} weight="bold" />
                      <span>Serial: <strong>{selectedReq.allocatedKioskId}</strong></span>
                      <button
                        type="button"
                        onClick={() => handleAllocateKiosk(selectedReq.id, '')}
                        className="dossier-release-serial-btn"
                        title="Release serial"
                      >
                        <X size={12} weight="bold" />
                      </button>
                    </div>
                  ) : (
                    <div className="dossier-assign-select-wrap">
                      <Select
                        title="Assign Hardware Serial"
                        data={[
                          { id: 'none', label: 'Assign Hardware Serial...', value: '' },
                          ...liveKiosks.map(k => ({
                            id: k.id || k.kioskId,
                            label: `${k.id || k.kioskId} — ${k.name || k.location}`,
                            value: k.id || k.kioskId,
                            icon: '🖨️',
                          }))
                        ]}
                        value=""
                        onChange={(val) => {
                          if (val) handleAllocateKiosk(selectedReq.id, val)
                        }}
                        dropdownWidth={280}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 2-Column Bento Grid: Contact Dossier & Commercial Parameters */}
              <div className="dossier-bento-grid">
                {/* Contact Dossier Card */}
                <div className="dossier-card">
                  <div className="dossier-card-head">
                    <User size={13} weight="bold" />
                    <span>PRIMARY KEY CONTACT</span>
                  </div>
                  <div className="dossier-contact-body">
                    <div className="dossier-contact-name-row">
                      <span className="dossier-contact-name">{selectedReq.contactName}</span>
                      <span className="dossier-contact-role">{selectedReq.contactRole || 'Lead Representative'}</span>
                    </div>
                    <div className="dossier-contact-actions">
                      {selectedReq.contactPhone && (
                        <a href={`tel:${selectedReq.contactPhone}`} className="dossier-contact-pill dossier-contact-pill--tel">
                          <DeviceMobile size={13} weight="bold" />
                          <span>{selectedReq.contactPhone}</span>
                        </a>
                      )}
                      {selectedReq.contactEmail && selectedReq.contactEmail.trim().length > 0 && (
                        <a href={`mailto:${selectedReq.contactEmail}`} className="dossier-contact-pill dossier-contact-pill--mail">
                          <EnvelopeSimple size={13} weight="bold" />
                          <span>{selectedReq.contactEmail}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Commercial Terms Card */}
                <div className="dossier-card">
                  <div className="dossier-card-head">
                    <CurrencyInr size={13} weight="bold" />
                    <span>COMMERCIAL PARAMETERS</span>
                  </div>
                  <div className="dossier-specs-list">
                    <div className="dossier-spec-row">
                      <span className="spec-label">Requested Units:</span>
                      <span className="spec-value">{selectedReq.estimatedUnits} Machine{selectedReq.estimatedUnits > 1 ? 's' : ''}</span>
                    </div>
                    <div className="dossier-spec-row">
                      <span className="spec-label">Daily Footfall:</span>
                      <span className="spec-value">{selectedReq.footfall} users/day</span>
                    </div>
                    <div className="dossier-spec-row">
                      <span className="spec-label">Target Timeline:</span>
                      <span className={`timeline-tag timeline-tag--${(selectedReq.timeline || '').toLowerCase().replace(/\s+/g, '-')}`}>
                        {selectedReq.timeline.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* On-Site Technical Readiness */}
              <div className="dossier-card dossier-card--readiness">
                <div className="dossier-card-head">
                  <Lightning size={13} weight="bold" />
                  <span>ON-SITE TECHNICAL READINESS</span>
                </div>
                <div className="dossier-readiness-grid">
                  <div className={`readiness-pill ${selectedReq.hasPower ? 'is-ready' : 'is-pending'}`}>
                    <span className="readiness-pill-icon">
                      {selectedReq.hasPower ? <CheckCircle size={14} weight="bold" /> : <Lightning size={14} weight="bold" />}
                    </span>
                    <div className="readiness-pill-text">
                      <span className="readiness-pill-title">230V 5A Power Socket</span>
                      <span className="readiness-pill-status">{selectedReq.hasPower ? 'Verified Available' : 'Pending Verification'}</span>
                    </div>
                  </div>

                  <div className={`readiness-pill ${selectedReq.hasSecurity ? 'is-ready' : 'is-pending'}`}>
                    <span className="readiness-pill-icon">
                      {selectedReq.hasSecurity ? <CheckCircle size={14} weight="bold" /> : <ShieldCheck size={14} weight="bold" />}
                    </span>
                    <div className="readiness-pill-text">
                      <span className="readiness-pill-title">CCTV &amp; Area Security</span>
                      <span className="readiness-pill-status">{selectedReq.hasSecurity ? 'Verified Monitored' : 'Pending Verification'}</span>
                    </div>
                  </div>
                </div>

                {selectedReq.notes && (
                  <div className="dossier-applicant-quote">
                    <span className="quote-label">Applicant Notes:</span>
                    <p className="quote-content">{selectedReq.notes}</p>
                  </div>
                )}
              </div>

              {/* Survey & Field Engineering Notes Feed */}
              <div className="dossier-notes-section">
                <span className="dossier-section-eyebrow">
                  SURVEY &amp; FIELD ENGINEERING NOTES ({selectedReq.surveyNotes.length})
                </span>

                <div className="dossier-notes-feed">
                  {selectedReq.surveyNotes.length === 0 ? (
                    <div className="dossier-notes-empty">
                      <span>No field survey notes recorded yet. Add an update below.</span>
                    </div>
                  ) : (
                    selectedReq.surveyNotes.map((note) => (
                      <div key={note.id} className="dossier-note-card">
                        <div className="dossier-note-meta">
                          <span className="note-author-badge">{note.author}</span>
                          <span className="note-time">{formatDate(note.timestamp)}</span>
                        </div>
                        <p className="note-text">{note.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Note Composer Footer (Fixed, Non-overlapping, Cleanly Padded) */}
            <form className="dossier-note-composer-footer" onSubmit={handleAddNote}>
              <div className="dossier-composer-header">
                <span className="composer-title">Add Field Note or Survey Update</span>
                <span className="composer-hint">Internal audit log</span>
              </div>

              <textarea
                rows={2}
                className="dossier-composer-textarea"
                placeholder="Log site survey results, socket verification, customer discussions..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
              />

              <div className="dossier-composer-bottom">
                <span className="composer-scope">Visible to operations and field engineering leads</span>
                <button
                  type="submit"
                  disabled={!newNoteText.trim()}
                  className="dossier-post-note-btn"
                >
                  <PaperPlaneTilt size={13} weight="bold" />
                  <span>Post Note</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── Log Inbound Lead Modal ── */}
      {modalOpen && createPortal(
        <div
          className="installations-modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) setModalOpen(false)
          }}
          role="presentation"
        >
          <div className="installations-modal" role="dialog" aria-modal="true" aria-label="Log inbound installation lead">
            <div className="installations-modal__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HardDrives size={20} weight="bold" color="#dc2626" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  Log Inbound Kiosk Installation Lead
                </h3>
              </div>
              <button
                type="button"
                className="installations-drawer__close"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="installations-modal__body">
                {/* Venue Type */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Venue Category *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {(['college', 'merchant', 'office', 'coworking', 'library', 'hospital'] as VenueType[]).map(vt => (
                      <button
                        key={vt}
                        type="button"
                        onClick={() => setFormData(f => ({ ...f, venueType: vt }))}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 6,
                          border: formData.venueType === vt ? '2px solid #dc2626' : '1px solid #e2e8f0',
                          background: formData.venueType === vt ? 'rgba(220, 38, 38, 0.06)' : '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          color: formData.venueType === vt ? '#dc2626' : '#475569',
                        }}
                      >
                        {getVenueIcon(vt)}
                        <span>{getVenueLabel(vt).split(' ')[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Organization & Campus */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Organization / Store Name *</label>
                    <input
                      type="text"
                      required
                      className="installations-search-input"
                      placeholder="e.g. Pune Institute of Computer Technology"
                      value={formData.orgName}
                      onChange={e => setFormData(f => ({ ...f, orgName: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Campus / Branch Area</label>
                    <input
                      type="text"
                      className="installations-search-input"
                      placeholder="e.g. Dhankawadi Campus, Ground Floor"
                      value={formData.campusName}
                      onChange={e => setFormData(f => ({ ...f, campusName: e.target.value }))}
                    />
                  </div>
                </div>

                {/* City & Pincode */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>City *</label>
                    <input
                      type="text"
                      required
                      className="installations-search-input"
                      value={formData.city}
                      onChange={e => setFormData(f => ({ ...f, city: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Pincode *</label>
                    <input
                      type="text"
                      required
                      className="installations-search-input"
                      value={formData.pincode}
                      onChange={e => setFormData(f => ({ ...f, pincode: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Estimated Units</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      className="installations-search-input"
                      value={formData.estimatedUnits}
                      onChange={e => setFormData(f => ({ ...f, estimatedUnits: Number(e.target.value) }))}
                    />
                  </div>
                </div>

                {/* Contact Person */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Contact Person *</label>
                    <input
                      type="text"
                      required
                      className="installations-search-input"
                      placeholder="e.g. Prof. Rajesh Shinde"
                      value={formData.contactName}
                      onChange={e => setFormData(f => ({ ...f, contactName: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Designation / Role</label>
                    <input
                      type="text"
                      className="installations-search-input"
                      placeholder="e.g. Facilities Director"
                      value={formData.contactRole}
                      onChange={e => setFormData(f => ({ ...f, contactRole: e.target.value }))}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Phone Number *</label>
                    <input
                      type="tel"
                      required
                      className="installations-search-input"
                      placeholder="+91 98220 12345"
                      value={formData.contactPhone}
                      onChange={e => setFormData(f => ({ ...f, contactPhone: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Email Address</label>
                    <input
                      type="email"
                      className="installations-search-input"
                      placeholder="rajesh@college.edu"
                      value={formData.contactEmail}
                      onChange={e => setFormData(f => ({ ...f, contactEmail: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Footfall & Timeline */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Estimated Daily Footfall</label>
                    <select
                      className="installations-select"
                      value={formData.footfall}
                      onChange={e => setFormData(f => ({ ...f, footfall: e.target.value }))}
                    >
                      <option value="500-1500">500 – 1,500 students/users</option>
                      <option value="1500-3000">1,500 – 3,000 students/users</option>
                      <option value="3000+">3,000+ high-density campus</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Deployment Timeline</label>
                    <select
                      className="installations-select"
                      value={formData.timeline}
                      onChange={e => setFormData(f => ({ ...f, timeline: e.target.value }))}
                    >
                      <option value="immediate">Immediate (&lt; 7 Days)</option>
                      <option value="30-days">Within 30 Days</option>
                      <option value="quarter">Next Quarter / Semester</option>
                    </select>
                  </div>
                </div>

                {/* Readiness Checkboxes */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '6px 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.hasPower}
                      onChange={e => setFormData(f => ({ ...f, hasPower: e.target.checked }))}
                    />
                    <span>230V 5A Socket Ready</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.hasSecurity}
                      onChange={e => setFormData(f => ({ ...f, hasSecurity: e.target.checked }))}
                    />
                    <span>CCTV / 24/7 Guarded Area</span>
                  </label>
                </div>

                {/* Notes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Initial Notes / Requirements</label>
                  <textarea
                    rows={3}
                    className="installations-search-input"
                    style={{ resize: 'vertical' }}
                    placeholder="Log specific requirements, space availability, printer specifications requested..."
                    value={formData.notes}
                    onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>

              <div className="installations-modal__footer">
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
                  Log Application
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
