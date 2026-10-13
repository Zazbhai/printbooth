import { useState, useEffect, useMemo } from 'react'
import {
  Warning,
  XCircle,
  CheckCircle,
  Broadcast,
  PaperPlaneTilt,
  Megaphone,
  Storefront,
  Users,
  Clock,
  Sparkle,
  ShieldCheck,
  Printer,
  Check,
  MagnifyingGlass,
  WifiHigh,
  BatteryHigh,
  Bell,
  Eye,
  PencilSimple,
  Trash,
  X,
  FloppyDisk,
} from '@phosphor-icons/react'
import {
  getAdminAlerts,
  ackAlert,
  ackAllAlerts,
  sendAdminNotification,
  getAdminNotifications,
  getAdminMerchants,
  updateAdminNotification,
  deleteAdminNotification,
} from '@/lib/api'
import Select, { type TSelectData } from '@/components/ui/select'
import './AdminPage.css'
import './AlertsPage.css'

const ALERT_CATEGORY_OPTIONS: TSelectData[] = [
  { id: 'info', label: 'INFO — Operational Update', value: 'INFO', icon: 'ℹ️', description: 'General fleet announcement' },
  { id: 'warning', label: 'WARNING — Supply / Consumables', value: 'WARNING', icon: '⚠️', description: 'Paper low or maintenance alert' },
  { id: 'alert', label: 'ALERT — Urgent Hardware Maintenance', value: 'ALERT', icon: '🚨', description: 'Immediate technician action needed' },
  { id: 'maintenance', label: 'MAINTENANCE — Cloud Patch / Spooler', value: 'MAINTENANCE', icon: '🔧', description: 'Scheduled system downtime' },
  { id: 'system', label: 'SYSTEM — Payout & Direct Billing', value: 'SYSTEM', icon: '💳', description: 'Reconciliation and payout notice' },
]

const TARGET_RECIPIENT_OPTIONS: TSelectData[] = [
  { id: 'all_m', label: 'All Store Partners (Fleet-wide)', value: 'ALL', icon: '📢', description: 'Broadcast to every kiosk partner' },
  { id: 'spec_m', label: 'Single Specific Merchant', value: 'SPECIFIC', icon: '🏪', description: 'Target a single store location' },
]

interface QuickPreset {
  label: string
  title: string
  message: string
  type: 'INFO' | 'WARNING' | 'ALERT' | 'MAINTENANCE' | 'SYSTEM'
}

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: 'Paper Stock Check',
    title: 'Consumables Notice: High Traffic Day Ahead',
    message: 'Please inspect the 75 GSM A4 paper tray on your kiosk and reload if under 50 sheets to avoid queue bottlenecks during peak hours.',
    type: 'WARNING',
  },
  {
    label: 'Firmware Maintenance',
    title: 'Scheduled Cloud Firmware Patch Tonight (11:30 PM)',
    message: 'A minor over-the-air firmware update is scheduled tonight at 11:30 PM IST. Print kiosk services will be paused for approximately 4 minutes.',
    type: 'MAINTENANCE',
  },
  {
    label: 'Settlement Complete',
    title: '100% Direct Payout Settlement Verified',
    message: 'Your merchant payout settlement for recent print jobs has been directly processed into your linked business bank account with 0% platform deductions.',
    type: 'SYSTEM',
  },
  {
    label: 'Printhead Thermal Clean',
    title: 'Urgent: Run Quick Self-Clean Cycle',
    message: 'Hardware telemetry detected slight thermal variance in the print carriage. Please initiate the self-clean cycle from your merchant portal maintenance tab.',
    type: 'ALERT',
  },
]

export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState<'broadcast' | 'hardware'>('broadcast')

  // Hardware alerts state
  const [alerts, setAlerts] = useState<any[]>([])
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [hardwareFilter, setHardwareFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'ACKNOWLEDGED'>('ALL')

  // Notifications broadcast state
  const [notifications, setNotifications] = useState<any[]>([])
  const [merchants, setMerchants] = useState<any[]>([])
  const [loadingNotifs, setLoadingNotifs] = useState(true)

  // Search & category filter for dispatch history
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'INFO' | 'WARNING' | 'ALERT' | 'MAINTENANCE' | 'SYSTEM'>('ALL')

  // Form state for new notification
  const [targetType, setTargetType] = useState<'ALL' | 'SPECIFIC'>('ALL')
  const [selectedMerchantId, setSelectedMerchantId] = useState('')
  const [notifType, setNotifType] = useState<'INFO' | 'WARNING' | 'ALERT' | 'MAINTENANCE' | 'SYSTEM'>('INFO')
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMessage, setNotifMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)

  // View modal state
  const [viewingNotif, setViewingNotif] = useState<any | null>(null)

  // Edit modal state
  const [editingNotif, setEditingNotif] = useState<any | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editMessage, setEditMessage] = useState('')
  const [editType, setEditType] = useState<'INFO' | 'WARNING' | 'ALERT' | 'MAINTENANCE' | 'SYSTEM'>('INFO')
  const [editTargetType, setEditTargetType] = useState<'ALL' | 'SPECIFIC'>('ALL')
  const [editMerchantId, setEditMerchantId] = useState('')
  const [updating, setUpdating] = useState(false)

  // Delete confirmation state
  const [deletingNotif, setDeletingNotif] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const loadAlerts = async () => {
    setLoadingAlerts(true)
    const data = await getAdminAlerts()
    if (Array.isArray(data)) {
      setAlerts(data)
    }
    setLoadingAlerts(false)
  }

  const loadNotificationsAndMerchants = async () => {
    setLoadingNotifs(true)
    const [notifsData, merchantsData] = await Promise.all([
      getAdminNotifications(),
      getAdminMerchants(),
    ])
    if (Array.isArray(notifsData)) {
      setNotifications(notifsData)
    }
    if (Array.isArray(merchantsData)) {
      setMerchants(merchantsData)
      if (merchantsData.length > 0 && !selectedMerchantId) {
        setSelectedMerchantId(merchantsData[0].merchantId || 'M-001')
      }
    }
    setLoadingNotifs(false)
  }

  useEffect(() => {
    loadAlerts()
    loadNotificationsAndMerchants()
  }, [])

  const handleAck = async (alertId: string) => {
    await ackAlert(alertId)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pb_alerts_updated'))
    }
    await loadAlerts()
  }

  const handleAckAll = async () => {
    await ackAllAlerts()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pb_alerts_updated'))
    }
    await loadAlerts()
  }

  const applyPreset = (preset: QuickPreset) => {
    setNotifTitle(preset.title)
    setNotifMessage(preset.message)
    setNotifType(preset.type)
  }

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!notifTitle.trim() || !notifMessage.trim()) return

    setSending(true)
    try {
      const selectedMerchant = merchants.find(m => m.merchantId === selectedMerchantId)
      const payload: any = {
        title: notifTitle.trim(),
        message: notifMessage.trim(),
        type: notifType,
        target: targetType === 'ALL' ? 'ALL' : selectedMerchantId,
        targetMerchantId: targetType === 'ALL' ? undefined : selectedMerchantId,
        targetMerchantName: targetType === 'ALL' ? 'All Merchants' : selectedMerchant?.name,
        targetKioskId: targetType === 'ALL' ? undefined : selectedMerchant?.kioskId,
      }

      await sendAdminNotification(payload)
      setSendSuccess(
        targetType === 'ALL'
          ? 'Fleet broadcast successfully published to all store partner portals!'
          : `Dispatched direct notice to ${selectedMerchant?.name || selectedMerchantId} (${selectedMerchant?.kioskId || 'N/A'})!`
      )
      setNotifTitle('')
      setNotifMessage('')
      await loadNotificationsAndMerchants()
      setTimeout(() => setSendSuccess(null), 4500)
    } catch (err: any) {
      alert(`Failed to send notification: ${err.message || 'Unknown error'}`)
    } finally {
      setSending(false)
    }
  }

  const handleOpenView = (notif: any) => {
    setViewingNotif(notif)
  }

  const handleOpenEdit = (notif: any) => {
    setEditingNotif(notif)
    setEditTitle(notif.title || '')
    setEditMessage(notif.message || '')
    setEditType(notif.type || 'INFO')
    setEditTargetType(notif.target === 'ALL' ? 'ALL' : 'SPECIFIC')
    setEditMerchantId(notif.targetMerchantId || notif.target || (merchants[0]?.merchantId || 'M-001'))
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingNotif || !editTitle.trim() || !editMessage.trim()) return

    setUpdating(true)
    try {
      const selectedMerchant = merchants.find(m => m.merchantId === editMerchantId)
      const id = editingNotif.notificationId || editingNotif._id
      const payload: any = {
        title: editTitle.trim(),
        message: editMessage.trim(),
        type: editType,
        target: editTargetType === 'ALL' ? 'ALL' : editMerchantId,
        targetMerchantId: editTargetType === 'ALL' ? undefined : editMerchantId,
        targetMerchantName: editTargetType === 'ALL' ? 'All Merchants' : (selectedMerchant?.name || editMerchantId),
        targetKioskId: editTargetType === 'ALL' ? undefined : (selectedMerchant?.kioskId || 'PB-001'),
      }

      await updateAdminNotification(id, payload)
      setActionSuccess('Broadcast announcement successfully updated!')
      setEditingNotif(null)
      await loadNotificationsAndMerchants()
      setTimeout(() => setActionSuccess(null), 4000)
    } catch (err: any) {
      alert(`Failed to update broadcast: ${err.message || 'Unknown error'}`)
    } finally {
      setUpdating(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deletingNotif) return
    setDeleting(true)
    try {
      const id = deletingNotif.notificationId || deletingNotif._id
      await deleteAdminNotification(id)
      setActionSuccess('Broadcast permanently removed from partner merchant inboxes.')
      setDeletingNotif(null)
      if (viewingNotif && (viewingNotif.notificationId === id || viewingNotif._id === id)) {
        setViewingNotif(null)
      }
      await loadNotificationsAndMerchants()
      setTimeout(() => setActionSuccess(null), 4000)
    } catch (err: any) {
      alert(`Failed to delete broadcast: ${err.message || 'Unknown error'}`)
    } finally {
      setDeleting(false)
    }
  }

  // Filter calculations
  const activeAlerts = useMemo(() => alerts.filter(a => !a.acknowledged), [alerts])
  const criticalCount = useMemo(() => activeAlerts.filter(a => a.severity === 'CRITICAL').length, [activeAlerts])
  const warningCount = useMemo(() => activeAlerts.filter(a => a.severity === 'WARNING').length, [activeAlerts])

  const filteredAlerts = useMemo(() => {
    if (hardwareFilter === 'ALL') return alerts
    if (hardwareFilter === 'CRITICAL') return alerts.filter(a => a.severity === 'CRITICAL' && !a.acknowledged)
    if (hardwareFilter === 'WARNING') return alerts.filter(a => a.severity === 'WARNING' && !a.acknowledged)
    if (hardwareFilter === 'ACKNOWLEDGED') return alerts.filter(a => a.acknowledged)
    return alerts
  }, [alerts, hardwareFilter])

  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      const matchesCategory = categoryFilter === 'ALL' || n.type === categoryFilter
      const q = searchQuery.toLowerCase().trim()
      const matchesQuery = !q
        || n.title?.toLowerCase().includes(q)
        || n.message?.toLowerCase().includes(q)
        || n.targetMerchantName?.toLowerCase().includes(q)
        || n.targetKioskId?.toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })
  }, [notifications, categoryFilter, searchQuery])

  const selectedMerchantObj = useMemo(() => {
    return merchants.find(m => m.merchantId === selectedMerchantId)
  }, [merchants, selectedMerchantId])

  const badgeColorClass = {
    INFO: { bg: '#eff6ff', border: 'rgba(59, 130, 246, 0.3)', text: '#1d4ed8' },
    WARNING: { bg: '#fffbeb', border: 'rgba(245, 158, 11, 0.3)', text: '#b45309' },
    ALERT: { bg: '#fef2f2', border: 'rgba(239, 68, 68, 0.3)', text: '#b91c1c' },
    MAINTENANCE: { bg: '#faf5ff', border: 'rgba(168, 85, 247, 0.3)', text: '#7e22ce' },
    SYSTEM: { bg: '#ecfdf5', border: 'rgba(16, 185, 129, 0.3)', text: '#047857' },
  }[notifType]

  return (
    <div className="admin-page animate-fadeInUp">
      {/* ─── Header & Incident Status Strip ─── */}
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
            <span className={`incident-header-badge ${criticalCount > 0 ? 'critical' : 'healthy'}`}>
              <span className={`beacon-dot ${criticalCount > 0 ? 'critical' : 'healthy'}`} />
              <span>{criticalCount > 0 ? `${criticalCount} Urgent Incidents` : 'Fleet Health Nominal'}</span>
            </span>
            <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
              Hardware Telemetry &amp; Merchant Broadcast Engine
            </span>
          </div>
          <h1 className="admin-page__title">Fleet Alerts</h1>
          <p className="admin-page__sub">
            Publish synchronized announcements to host stores and resolve real-time hardware telemetry alerts
          </p>
        </div>

        {/* Tactile Segmented Navigation */}
        <div className="segmented-nav">
          <button
            type="button"
            className={`segmented-tab ${activeTab === 'broadcast' ? 'active' : ''}`}
            onClick={() => setActiveTab('broadcast')}
          >
            <Megaphone size={16} weight={activeTab === 'broadcast' ? 'fill' : 'regular'} />
            <span>Broadcasts &amp; Notices</span>
            <span className="segmented-badge">{notifications.length}</span>
          </button>
          <button
            type="button"
            className={`segmented-tab ${activeTab === 'hardware' ? 'active' : ''}`}
            onClick={() => setActiveTab('hardware')}
          >
            <Warning size={16} weight={activeTab === 'hardware' ? 'fill' : 'regular'} />
            <span>Hardware Alerts</span>
            <span
              className="segmented-badge"
              style={{
                background: activeAlerts.length > 0 ? 'rgba(220, 38, 38, 0.12)' : undefined,
                color: activeAlerts.length > 0 ? '#dc2626' : undefined,
              }}
            >
              {activeAlerts.length}
            </span>
          </button>
        </div>
      </div>

      {/* ─── High-Level KPI Strip ─── */}
      <div className="alerts-kpi-strip">
        <div className="alerts-kpi-card">
          <div className="alerts-kpi-icon" style={{ background: 'rgba(220, 38, 38, 0.08)', color: '#dc2626' }}>
            <XCircle size={22} weight="duotone" />
          </div>
          <div className="alerts-kpi-info">
            <span className="alerts-kpi-label">Critical Faults</span>
            <span className="alerts-kpi-value">{criticalCount}</span>
          </div>
        </div>

        <div className="alerts-kpi-card">
          <div className="alerts-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#d97706' }}>
            <Warning size={22} weight="duotone" />
          </div>
          <div className="alerts-kpi-info">
            <span className="alerts-kpi-label">Active Warnings</span>
            <span className="alerts-kpi-value">{warningCount}</span>
          </div>
        </div>

        <div className="alerts-kpi-card">
          <div className="alerts-kpi-icon" style={{ background: 'rgba(37, 99, 235, 0.08)', color: '#2563eb' }}>
            <Broadcast size={22} weight="duotone" />
          </div>
          <div className="alerts-kpi-info">
            <span className="alerts-kpi-label">Dispatched Notices</span>
            <span className="alerts-kpi-value">{notifications.length}</span>
          </div>
        </div>

        <div className="alerts-kpi-card">
          <div className="alerts-kpi-icon" style={{ background: 'rgba(5, 150, 105, 0.08)', color: '#059669' }}>
            <Storefront size={22} weight="duotone" />
          </div>
          <div className="alerts-kpi-info">
            <span className="alerts-kpi-label">Partner Venues</span>
            <span className="alerts-kpi-value">{merchants.length} Hosts</span>
          </div>
        </div>
      </div>

      {/* ─── TAB 1: Merchant Broadcasts & Live Device Simulator ─── */}
      {activeTab === 'broadcast' && (
        <div className="alerts-layout">
          {/* Dispatcher + Live Simulator Split Grid */}
          <div className="broadcast-grid">
            {/* Left: Dispatcher Card */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16 }}>
                    <PaperPlaneTilt size={20} color="var(--primary)" weight="bold" />
                    <span>Dispatch Partner Broadcast</span>
                  </h2>
                  <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                    Immediate delivery to on-site tablets
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--clr-text-3)', margin: 0 }}>
                  Publish operational advisories, maintenance alerts, or settlement updates directly to merchant dashboard feeds.
                </p>
              </div>

              {/* Quick Presets Bar */}
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Sparkle size={14} weight="fill" color="#f59e0b" />
                  <span>One-Click Action Presets:</span>
                </div>
                <div className="presets-bar">
                  {QUICK_PRESETS.map((p, idx) => {
                    const dotColors: Record<string, string> = {
                      WARNING: '#f59e0b',
                      MAINTENANCE: '#a855f7',
                      SYSTEM: '#10b981',
                      ALERT: '#ef4444',
                      INFO: '#3b82f6',
                    }
                    return (
                      <button
                        key={idx}
                        type="button"
                        className="preset-chip"
                        onClick={() => applyPreset(p)}
                      >
                        <span className="preset-chip-dot" style={{ backgroundColor: dotColors[p.type] || '#64748b' }} />
                        <span>{p.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {sendSuccess && (
                <div
                  style={{
                    background: 'rgba(5, 150, 105, 0.08)',
                    borderColor: 'rgba(5, 150, 105, 0.25)',
                    color: '#059669',
                    border: '1px solid',
                    borderRadius: 10,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: 13.5,
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle size={20} weight="fill" />
                  <span>{sendSuccess}</span>
                </div>
              )}

              <form onSubmit={handleSendNotification} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Target Audience Segment */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Target Destination</label>
                  <div className="target-radio-grid">
                    <button
                      type="button"
                      className={`target-radio-card ${targetType === 'ALL' ? 'active' : ''}`}
                      onClick={() => setTargetType('ALL')}
                    >
                      <Users size={18} weight={targetType === 'ALL' ? 'fill' : 'bold'} />
                      <div>
                        <div>Fleet-wide Broadcast</div>
                        <div style={{ fontSize: 11.5, fontWeight: 400, opacity: 0.75 }}>All {merchants.length} partner stores</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`target-radio-card ${targetType === 'SPECIFIC' ? 'active' : ''}`}
                      onClick={() => setTargetType('SPECIFIC')}
                    >
                      <Storefront size={18} weight={targetType === 'SPECIFIC' ? 'fill' : 'bold'} />
                      <div>
                        <div>Targeted Machine Partner</div>
                        <div style={{ fontSize: 11.5, fontWeight: 400, opacity: 0.75 }}>Single on-site kiosk tablet</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Specific Merchant Picker */}
                {targetType === 'SPECIFIC' && (
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Select Specific Merchant</label>
                    <Select
                      title="Select Target Merchant"
                      data={merchants.map((m) => ({
                        id: m.merchantId,
                        label: m.storeName || m.name,
                        value: m.merchantId,
                        icon: '🏪',
                        description: `Station ${m.kioskId} • ${m.name}`,
                      }))}
                      value={selectedMerchantId}
                      onChange={(val) => setSelectedMerchantId(val)}
                      dropdownWidth={360}
                    />
                  </div>
                )}

                {/* Notification Type & Priority */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Broadcast Classification</label>
                  <div className="classification-grid">
                    {(['INFO', 'WARNING', 'ALERT', 'MAINTENANCE', 'SYSTEM'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`classification-pill ${t.toLowerCase()} ${notifType === t ? 'active' : ''}`}
                        onClick={() => setNotifType(t)}
                      >
                        <span>{t}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ fontWeight: 600, marginBottom: 0 }}>Subject Title</label>
                    <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{notifTitle.length}/100</span>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    maxLength={100}
                    placeholder="e.g. Consumables Notice: Paper Restock Recommended"
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    required
                  />
                </div>

                {/* Message */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ fontWeight: 600, marginBottom: 0 }}>Message Narrative</label>
                    <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{notifMessage.length}/500</span>
                  </div>
                  <textarea
                    className="form-input"
                    rows={4}
                    maxLength={500}
                    placeholder="Provide concise operational guidance or instructions for the on-site host..."
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    required
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={sending || !notifTitle.trim() || !notifMessage.trim()}
                    id="send-broadcast-btn"
                    style={{ minWidth: 180 }}
                  >
                    <PaperPlaneTilt size={16} weight="bold" />
                    <span>{sending ? 'Dispatching...' : 'Dispatch Announcement'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Right: Live Merchant Feed Preview Simulator */}
            <div className="simulator-card">
              <div className="simulator-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="simulator-dots">
                    <span className="simulator-dot" />
                    <span className="simulator-dot" />
                    <span className="simulator-dot" />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Merchant Portal Tablet Simulator
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
                  <WifiHigh size={14} />
                  <BatteryHigh size={14} />
                  <span>12:45 PM</span>
                </div>
              </div>

              <div className="simulator-canvas">
                <div className="simulator-mock-device">
                  {/* Mock Portal Header */}
                  <div className="simulator-mock-top">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Storefront size={16} color="#dc2626" weight="bold" />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                        {targetType === 'ALL'
                          ? 'Global Partner Broadcast'
                          : selectedMerchantObj?.storeName || 'Host Store Portal'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: '#64748b' }}>
                      {targetType === 'ALL' ? 'ALL-HOSTS' : selectedMerchantObj?.kioskId || 'PB-001'}
                    </span>
                  </div>

                  {/* Mock Notice Card */}
                  <div className="simulator-mock-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        className="simulator-pill"
                        style={{
                          background: badgeColorClass.bg,
                          border: `1px solid ${badgeColorClass.border}`,
                          color: badgeColorClass.text,
                        }}
                      >
                        <Bell size={11} weight="fill" />
                        {notifType} NOTICE
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} />
                        Just now
                      </span>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', lineHeight: 1.35 }}>
                      {notifTitle || 'Your Announcement Headline Will Appear Here'}
                    </div>

                    <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>
                      {notifMessage ||
                        'As you compose the announcement in the form, this live simulator updates immediately to show exactly how store managers will perceive the notice on their on-site tablet.'}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        paddingTop: 10,
                        borderTop: '1px solid #f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        color: '#64748b',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ShieldCheck size={14} color="#059669" weight="fill" />
                        <span>Signed by PrintBooth Operations</span>
                      </span>
                      <button type="button" className="simulator-action-btn">
                        <Check size={12} weight="bold" />
                        <span>Acknowledge</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Broadcast Dispatch History */}
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              className="card-header"
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                  <Broadcast size={18} color="var(--primary)" weight="bold" />
                  <span>Recent Fleet Broadcasts &amp; Dispatches</span>
                </h3>
                <span className="card-meta">Audit record of messages delivered to partner merchant portal inboxes</span>
              </div>
              <span className="badge badge-secondary mono">
                {notifications.length} Delivered
              </span>
            </div>

            {/* Filter & Search Toolbar */}
            <div className="table-toolbar">
              <div className="filter-pills">
                {(['ALL', 'INFO', 'WARNING', 'ALERT', 'MAINTENANCE', 'SYSTEM'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`filter-pill ${categoryFilter === cat ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    <span>{cat}</span>
                    <span className="filter-pill-badge">
                      {cat === 'ALL'
                        ? notifications.length
                        : notifications.filter(n => n.type === cat).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="table-search-box">
                <MagnifyingGlass size={15} color="#94a3b8" />
                <input
                  type="text"
                  className="table-search-input"
                  placeholder="Search announcements..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {loadingNotifs ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                Retrieving dispatch log...
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                {searchQuery || categoryFilter !== 'ALL'
                  ? 'No announcements match the selected filter criteria.'
                  : 'No announcements dispatched yet. Use the composer above to publish updates.'}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Type</th>
                      <th style={{ width: 200 }}>Target Recipient</th>
                      <th>Announcement Details</th>
                      <th style={{ width: 110 }}>Sent Time</th>
                      <th style={{ width: 110 }}>Delivery</th>
                      <th style={{ textAlign: 'right', width: 120 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNotifications.map((n) => {
                      const id = n.notificationId || n._id
                      const isAll = n.target === 'ALL'
                      const timeStr = n.createdAt
                        ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Recent'

                      return (
                        <tr key={id}>
                          <td>
                            <span
                              className={`badge ${
                                n.type === 'ALERT'
                                  ? 'badge-danger'
                                  : n.type === 'WARNING' || n.type === 'MAINTENANCE'
                                  ? 'badge-warning'
                                  : 'badge-accent'
                              }`}
                            >
                              {n.type}
                            </span>
                          </td>

                          <td>
                            {isAll ? (
                              <span className="badge badge-online">
                                <Users size={12} weight="bold" style={{ marginRight: 4 }} />
                                All Merchants
                              </span>
                            ) : (
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: 13 }}>
                                  {n.targetMerchantName || n.targetMerchantId}
                                </div>
                                {n.targetKioskId && (
                                  <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono, monospace)' }}>
                                    Station {n.targetKioskId}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          <td style={{ maxWidth: 420 }}>
                            <div style={{ fontWeight: 600, color: 'var(--foreground)', marginBottom: 2 }}>
                              {n.title}
                            </div>
                            <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.45 }}>
                              {n.message}
                            </div>
                          </td>

                          <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--muted-foreground)' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={12} />
                              {timeStr}
                            </span>
                          </td>

                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                color: '#059669',
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              <CheckCircle size={14} weight="fill" />
                              <span>Delivered</span>
                            </span>
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            <div className="broadcast-row-actions">
                              <button
                                type="button"
                                className="broadcast-action-btn view"
                                title="View Broadcast Details"
                                aria-label="View Broadcast Details"
                                onClick={() => handleOpenView(n)}
                              >
                                <Eye size={15} weight="bold" />
                              </button>
                              <button
                                type="button"
                                className="broadcast-action-btn edit"
                                title="Edit Broadcast"
                                aria-label="Edit Broadcast"
                                onClick={() => handleOpenEdit(n)}
                              >
                                <PencilSimple size={15} weight="bold" />
                              </button>
                              <button
                                type="button"
                                className="broadcast-action-btn delete"
                                title="Delete Broadcast"
                                aria-label="Delete Broadcast"
                                onClick={() => setDeletingNotif(n)}
                              >
                                <Trash size={15} weight="bold" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 2: Hardware Telemetry Alerts ─── */}
      {activeTab === 'hardware' && (
        <div className="alerts-layout">
          {/* Hardware Filter Bar */}
          <div className="hardware-toolbar">
            <div className="filter-pills">
              <button
                type="button"
                className={`filter-pill ${hardwareFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setHardwareFilter('ALL')}
              >
                <span>All Telemetry</span>
                <span className="filter-pill-badge">{alerts.length}</span>
              </button>
              <button
                type="button"
                className={`filter-pill ${hardwareFilter === 'CRITICAL' ? 'active' : ''}`}
                onClick={() => setHardwareFilter('CRITICAL')}
              >
                <span>Critical</span>
                <span className="filter-pill-badge">
                  {alerts.filter(a => a.severity === 'CRITICAL' && !a.acknowledged).length}
                </span>
              </button>
              <button
                type="button"
                className={`filter-pill ${hardwareFilter === 'WARNING' ? 'active' : ''}`}
                onClick={() => setHardwareFilter('WARNING')}
              >
                <span>Warnings</span>
                <span className="filter-pill-badge">
                  {alerts.filter(a => a.severity === 'WARNING' && !a.acknowledged).length}
                </span>
              </button>
              <button
                type="button"
                className={`filter-pill ${hardwareFilter === 'ACKNOWLEDGED' ? 'active' : ''}`}
                onClick={() => setHardwareFilter('ACKNOWLEDGED')}
              >
                <span>Acknowledged</span>
                <span className="filter-pill-badge">
                  {alerts.filter(a => a.acknowledged).length}
                </span>
              </button>
            </div>

            {activeAlerts.length > 0 && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleAckAll}
                id="alerts-acknowledge-all"
              >
                <CheckCircle size={15} weight="bold" />
                <span>Acknowledge All ({activeAlerts.length})</span>
              </button>
            )}
          </div>

          {loadingAlerts ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
              Loading real-time hardware telemetry alerts...
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--muted-foreground)' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'rgba(5, 150, 105, 0.1)',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <CheckCircle size={32} weight="fill" />
              </div>
              <h3 style={{ color: '#0f172a', marginBottom: 6, fontSize: 17, fontWeight: 700 }}>
                All Printing Stations Operating Cleanly
              </h3>
              <p style={{ fontSize: 13.5, maxWidth: 420, margin: '0 auto', color: '#64748b' }}>
                Zero active faults or unresolved hardware exceptions matching this filter across the fleet.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredAlerts.map((alert: any) => {
                const id = alert.alertId || alert._id
                const isCrit = alert.severity === 'CRITICAL'
                const isWarn = alert.severity === 'WARNING'
                const cardClass = alert.acknowledged ? 'acknowledged' : isCrit ? 'critical' : isWarn ? 'warning' : ''
                const timeAgo = alert.createdAt
                  ? new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Recent'

                return (
                  <div key={id} className={`incident-card ${cardClass}`}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1 }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          background: isCrit
                            ? 'rgba(220, 38, 38, 0.1)'
                            : isWarn
                            ? 'rgba(245, 158, 11, 0.1)'
                            : 'rgba(37, 99, 235, 0.1)',
                          color: isCrit ? '#dc2626' : isWarn ? '#d97706' : '#2563eb',
                        }}
                      >
                        {isCrit ? <XCircle size={20} weight="fill" /> : <Warning size={20} weight="fill" />}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono, monospace)',
                              fontWeight: 700,
                              fontSize: 12,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              color: '#0f172a',
                            }}
                          >
                            Station {alert.kioskId}
                          </span>
                          <span
                            className={`badge ${isCrit ? 'badge-danger' : isWarn ? 'badge-warning' : 'badge-accent'}`}
                            style={{ fontSize: 11 }}
                          >
                            {alert.severity}
                          </span>
                          <span style={{ fontSize: 12, color: '#64748b' }}>
                            Type: {alert.type || 'HARDWARE_FAULT'}
                          </span>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>•</span>
                          <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={12} />
                            {timeAgo}
                          </span>
                        </div>

                        <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
                          {alert.message}
                        </div>

                        {alert.acknowledged && (
                          <div style={{ fontSize: 11.5, color: '#059669', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Check size={13} weight="bold" />
                            <span>Acknowledged by Administrator</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <a
                        href={`/admin/kiosks/${alert.kioskId}`}
                        className="btn btn-secondary btn-sm"
                        title="View kiosk status"
                      >
                        <Printer size={14} />
                        <span>Telemetry</span>
                      </a>
                      {!alert.acknowledged && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleAck(id)}
                        >
                          <Check size={14} weight="bold" />
                          <span>Resolve</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Modal 1: View Broadcast Details ─── */}
      {viewingNotif && (
        <div className="broadcast-modal-backdrop" onClick={() => setViewingNotif(null)}>
          <div className="broadcast-modal" onClick={(e) => e.stopPropagation()}>
            <div className="broadcast-modal-header">
              <h3 className="broadcast-modal-title">
                <Eye size={18} color="#2563eb" weight="bold" />
                <span>Broadcast Inspection &amp; Delivery</span>
              </h3>
              <button
                type="button"
                className="broadcast-modal-close"
                onClick={() => setViewingNotif(null)}
                title="Close"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <div className="broadcast-modal-body">
              <div className="detail-grid">
                <div>
                  <div className="detail-label">Notification ID</div>
                  <div className="detail-val mono">{viewingNotif.notificationId || viewingNotif._id}</div>
                </div>
                <div>
                  <div className="detail-label">Classification</div>
                  <div>
                    <span
                      className={`badge ${
                        viewingNotif.type === 'ALERT'
                          ? 'badge-danger'
                          : viewingNotif.type === 'WARNING' || viewingNotif.type === 'MAINTENANCE'
                          ? 'badge-warning'
                          : 'badge-accent'
                      }`}
                    >
                      {viewingNotif.type || 'INFO'}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="detail-label">Target Recipient</div>
                  <div className="detail-val">
                    {viewingNotif.target === 'ALL'
                      ? 'All Merchants (Fleet-wide)'
                      : viewingNotif.targetMerchantName || viewingNotif.targetMerchantId || viewingNotif.target}
                  </div>
                </div>
                <div>
                  <div className="detail-label">Dispatched Time</div>
                  <div className="detail-val">
                    {viewingNotif.createdAt
                      ? new Date(viewingNotif.createdAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Recent'}
                  </div>
                </div>
              </div>

              <div>
                <div className="detail-label" style={{ marginBottom: 6 }}>Broadcast Message Narrative</div>
                <div className="detail-message-box">
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: '#0f172a', marginBottom: 6 }}>
                    {viewingNotif.title}
                  </div>
                  <div>{viewingNotif.message}</div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  fontSize: 12.5,
                  color: '#166534',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <ShieldCheck size={16} weight="fill" color="#16a34a" />
                  <span>Delivered to Merchant Tablet Inboxes</span>
                </span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, color: '#15803d' }}>
                  HTTP 200 OK
                </span>
              </div>
            </div>

            <div className="broadcast-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setViewingNotif(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ color: '#d97706', borderColor: '#fde68a' }}
                onClick={() => {
                  const target = viewingNotif
                  setViewingNotif(null)
                  handleOpenEdit(target)
                }}
              >
                <PencilSimple size={15} weight="bold" />
                <span>Edit Broadcast</span>
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  const target = viewingNotif
                  setViewingNotif(null)
                  setDeletingNotif(target)
                }}
              >
                <Trash size={15} weight="bold" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Edit Broadcast ─── */}
      {editingNotif && (
        <div className="broadcast-modal-backdrop" onClick={() => !updating && setEditingNotif(null)}>
          <div className="broadcast-modal" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveEdit}>
              <div className="broadcast-modal-header">
                <h3 className="broadcast-modal-title">
                  <PencilSimple size={18} color="#d97706" weight="bold" />
                  <span>Update Broadcast Announcement</span>
                </h3>
                <button
                  type="button"
                  className="broadcast-modal-close"
                  onClick={() => !updating && setEditingNotif(null)}
                  title="Close"
                  disabled={updating}
                >
                  <X size={16} weight="bold" />
                </button>
              </div>

              <div className="broadcast-modal-body">
                {/* Classification & Target */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  <div>
                    <label className="composer-label">Category Classification</label>
                    <Select
                      title="Alert Category"
                      data={ALERT_CATEGORY_OPTIONS}
                      value={editType}
                      onChange={(val) => setEditType(val as any)}
                      dropdownWidth={320}
                    />
                  </div>

                  <div>
                    <label className="composer-label">Target Recipient</label>
                    <Select
                      title="Recipient Target"
                      data={TARGET_RECIPIENT_OPTIONS}
                      value={editTargetType}
                      onChange={(val) => setEditTargetType(val as any)}
                      dropdownWidth={300}
                    />
                  </div>
                </div>

                {editTargetType === 'SPECIFIC' && (
                  <div>
                    <label className="composer-label">Select Partner Merchant</label>
                    <Select
                      title="Partner Merchant"
                      data={merchants.map((m) => ({
                        id: m.merchantId || m._id,
                        label: m.name,
                        value: m.merchantId,
                        icon: '🏪',
                        description: `${m.storeName || m.kioskId} (${m.kioskId})`,
                      }))}
                      value={editMerchantId}
                      onChange={(val) => setEditMerchantId(val)}
                      dropdownWidth={360}
                    />
                  </div>
                )}

                <div>
                  <label className="composer-label">Announcement Headline</label>
                  <input
                    type="text"
                    className="composer-input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Enter headline..."
                    required
                  />
                </div>

                <div>
                  <label className="composer-label">Message Narrative</label>
                  <textarea
                    className="composer-textarea"
                    rows={4}
                    value={editMessage}
                    onChange={(e) => setEditMessage(e.target.value)}
                    placeholder="Provide full details for merchant operators..."
                    required
                  />
                </div>
              </div>

              <div className="broadcast-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingNotif(null)}
                  disabled={updating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updating || !editTitle.trim() || !editMessage.trim()}
                >
                  {updating ? (
                    <span>Saving Changes...</span>
                  ) : (
                    <>
                      <FloppyDisk size={15} weight="bold" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 3: Delete Confirmation ─── */}
      {deletingNotif && (
        <div className="broadcast-modal-backdrop" onClick={() => !deleting && setDeletingNotif(null)}>
          <div className="broadcast-modal delete-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="broadcast-modal-header">
              <h3 className="broadcast-modal-title" style={{ color: '#dc2626' }}>
                <Trash size={18} weight="bold" />
                <span>Delete Broadcast Announcement</span>
              </h3>
              <button
                type="button"
                className="broadcast-modal-close"
                onClick={() => !deleting && setDeletingNotif(null)}
                title="Close"
                disabled={deleting}
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <div className="broadcast-modal-body">
              <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.5 }}>
                Are you sure you want to permanently delete this broadcast announcement? It will be removed from recipient partner merchant portals and cannot be recovered.
              </div>

              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 10,
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span
                    className={`badge ${
                      deletingNotif.type === 'ALERT'
                        ? 'badge-danger'
                        : deletingNotif.type === 'WARNING' || deletingNotif.type === 'MAINTENANCE'
                        ? 'badge-warning'
                        : 'badge-accent'
                    }`}
                  >
                    {deletingNotif.type || 'INFO'}
                  </span>
                  <span style={{ fontSize: 12, color: '#991b1b', fontWeight: 600 }}>
                    Target: {deletingNotif.target === 'ALL' ? 'All Merchants' : deletingNotif.targetMerchantName || deletingNotif.target}
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#991b1b' }}>
                  {deletingNotif.title}
                </div>
              </div>
            </div>

            <div className="broadcast-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeletingNotif(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <span>Deleting...</span>
                ) : (
                  <>
                    <Trash size={15} weight="bold" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Action Notification Toast ─── */}
      {actionSuccess && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 80,
            background: '#ffffff',
            border: '1px solid #10b981',
            borderRadius: 10,
            padding: '12px 18px',
            boxShadow: '0 10px 25px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: '#065f46',
            fontSize: 13.5,
            fontWeight: 600,
            animation: 'modalSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <CheckCircle size={18} weight="fill" color="#10b981" />
          <span>{actionSuccess}</span>
        </div>
      )}
    </div>
  )
}
