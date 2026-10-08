import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Eye,
  Wrench,
  CheckCircle,
  Power,
  Plus,
  Key,
  Copy,
  Check,
  Terminal,
  Cpu,
  X,
  ShieldCheck,
  DownloadSimple,
  ArrowsClockwise,
} from '@phosphor-icons/react'
import {
  getAdminKiosks,
  setKioskStatus,
  setBulkKioskMaintenance,
  deployAdminKiosk,
  getAdminKioskProvisionKit,
  rotateAdminKioskSecret,
  getAdminMerchants,
} from '@/lib/api'
import { getKioskPrintUrl } from '@/lib/config'
import Select, { type TSelectData } from '@/components/ui/select'
import './AdminPage.css'

const KIOSK_STATUS_OPTIONS: TSelectData[] = [
  { id: 'online', label: 'Online', value: 'ONLINE', icon: '🟢', description: 'Available for student self-service' },
  { id: 'maint', label: 'Maintenance', value: 'MAINTENANCE', icon: '🔧', description: 'Hardware service mode' },
  { id: 'offline', label: 'Offline', value: 'OFFLINE', icon: '🔴', description: 'Disconnected from fleet' },
]

function getProgressClass(val: number) {
  if (val > 50) return 'ok'
  if (val > 20) return 'warn'
  return 'error'
}

export default function KiosksPage() {
  const [kiosks, setKiosks] = useState<any[]>([])
  const [merchants, setMerchants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Deploy modal state
  const [deployModalOpen, setDeployModalOpen] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [newKioskForm, setNewKioskForm] = useState({
    kioskId: '',
    name: '',
    location: '',
    address: '',
    merchantId: 'M-001',
    printerModel: 'Brother DCP-T420W Printer',
  })

  // Provisioning Kit modal state
  const [provisionKitModalOpen, setProvisionKitModalOpen] = useState(false)
  const [activeKitData, setActiveKitData] = useState<any>(null)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState(false)
  const [copiedEnv, setCopiedEnv] = useState(false)
  const [rotatingSecret, setRotatingSecret] = useState(false)

  const handleRotateSecretFromModal = async () => {
    if (!activeKitData?.kioskId) return
    if (!window.confirm(`Rotate cryptographic secret key for station ${activeKitData.kioskId}? The Raspberry Pi will be disconnected until updated with the new key in .env!`)) {
      return
    }
    setRotatingSecret(true)
    try {
      const rotated = await rotateAdminKioskSecret(activeKitData.kioskId)
      if (rotated) {
        setActiveKitData(rotated)
        setFeedback(`✓ Cryptographic key for station ${activeKitData.kioskId} rotated successfully!`)
        setTimeout(() => setFeedback(null), 3500)
      }
    } catch (err: any) {
      alert(`Failed to rotate key: ${err.message}`)
    } finally {
      setRotatingSecret(false)
    }
  }

  const handleDownloadEnvFromModal = () => {
    if (!activeKitData?.envContent) return
    const blob = new Blob([activeKitData.envContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `.env`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setFeedback(`✓ Downloaded .env file for station ${activeKitData.kioskId}`)
    setTimeout(() => setFeedback(null), 3500)
  }

  const loadData = async () => {
    const [kioskData, merchantData] = await Promise.all([
      getAdminKiosks(),
      getAdminMerchants(),
    ])
    if (Array.isArray(kioskData)) {
      setKiosks(kioskData)
    }
    if (Array.isArray(merchantData)) {
      setMerchants(merchantData)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const loadKiosks = loadData

  // Auto-suggest next kiosk ID (e.g. PB-002, PB-003)
  const openDeployModal = () => {
    let nextNum = kiosks.length + 1
    let candidate = `PB-${String(nextNum).padStart(3, '0')}`
    while (kiosks.some(k => (k.kioskId || k.id) === candidate)) {
      nextNum++
      candidate = `PB-${String(nextNum).padStart(3, '0')}`
    }
    setNewKioskForm({
      kioskId: candidate,
      name: `PrintBooth — Station ${nextNum}`,
      location: 'Central Campus',
      address: 'Main Entrance Hall',
      merchantId: merchants[0]?.merchantId || 'M-001',
      printerModel: 'Brother DCP-T420W Printer',
    })
    setDeployModalOpen(true)
  }

  const handleDeploySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setDeploying(true)
    try {
      const res = await deployAdminKiosk(newKioskForm)
      if (res.success && res.provisioning) {
        setDeployModalOpen(false)
        setActiveKitData(res.provisioning)
        setProvisionKitModalOpen(true)
        setFeedback(`Kiosk ${newKioskForm.kioskId} successfully deployed & bound to merchant!`)
        await loadData()
      } else {
        alert(res.error || 'Failed to deploy kiosk')
      }
    } catch (err: any) {
      alert(`Deployment failed: ${err.message || 'Unknown error'}`)
    } finally {
      setDeploying(false)
    }
  }

  const handleOpenKit = async (kioskId: string) => {
    setActionBusy(kioskId)
    try {
      const data = await getAdminKioskProvisionKit(kioskId)
      if (data) {
        setActiveKitData(data)
        setProvisionKitModalOpen(true)
      } else {
        alert('Could not fetch provisioning kit.')
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setActionBusy(null)
    }
  }

  // Change individual kiosk status
  const handleStatusChange = async (kioskId: string, newStatus: 'ONLINE' | 'MAINTENANCE' | 'OFFLINE') => {
    setActionBusy(kioskId)
    try {
      await setKioskStatus(kioskId, newStatus)
      setFeedback(`Kiosk ${kioskId} set to ${newStatus}`)
      await loadKiosks()
      setTimeout(() => setFeedback(null), 3000)
    } catch (err: any) {
      alert(`Failed to update status: ${err.message || 'Unknown error'}`)
    } finally {
      setActionBusy(null)
    }
  }

  // Bulk action: all machines into maintenance or all online
  const handleBulkMaintenance = async (action: 'MAINTENANCE' | 'ONLINE') => {
    const isMaint = action === 'MAINTENANCE'
    const confirmMsg = isMaint
      ? `Are you sure you want to put ALL ${kiosks.length} fleet machines into MAINTENANCE mode? Customers will not be able to send print jobs until restored.`
      : `Bring ALL ${kiosks.length} fleet machines back ONLINE for customer checkouts?`

    if (!window.confirm(confirmMsg)) return

    setActionBusy('BULK')
    try {
      await setBulkKioskMaintenance(action)
      setFeedback(isMaint ? 'All fleet machines put into MAINTENANCE mode' : 'All fleet machines restored to ONLINE')
      await loadKiosks()
      setTimeout(() => setFeedback(null), 3500)
    } catch (err: any) {
      alert(`Bulk maintenance command failed: ${err.message || 'Unknown error'}`)
    } finally {
      setActionBusy(null)
    }
  }

  const onlineCount = kiosks.filter(k => (k.status || '').toUpperCase() === 'ONLINE').length
  const maintCount = kiosks.filter(k => (k.status || '').toUpperCase() === 'MAINTENANCE').length
  const offlineCount = kiosks.filter(k => (k.status || '').toUpperCase() === 'OFFLINE').length

  return (
    <div className="admin-page animate-fadeInUp">
      {/* ─── Page Header with Fleet Stats & Bulk Actions ─── */}
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="badge badge-online">Fleet Control Engine</span>
            <span style={{ fontSize: 13, color: 'var(--clr-text-3)' }}>{kiosks.length} Kiosks Deployed</span>
          </div>
          <h1 className="admin-page__title">Kiosk Fleet Management</h1>
          <p className="admin-page__sub">
            Monitor real-time status and control operational maintenance individually or fleet-wide
          </p>
        </div>

        {/* Deploy & Bulk Controls */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={openDeployModal}
            style={{
              background: 'var(--clr-accent)',
              borderColor: 'var(--clr-accent)',
              fontWeight: 700,
              gap: 6,
            }}
            id="deploy-kiosk-btn"
          >
            <Plus size={16} weight="bold" />
            <span>Deploy New Pi Kiosk</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleBulkMaintenance('MAINTENANCE')}
            disabled={actionBusy === 'BULK'}
            style={{
              borderColor: 'rgba(245, 158, 11, 0.4)',
              color: '#f59e0b',
              fontWeight: 600,
            }}
            id="bulk-maintenance-btn"
          >
            <Wrench size={16} weight="bold" />
            <span>{actionBusy === 'BULK' ? 'Applying...' : 'Put ALL in Maintenance'}</span>
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => handleBulkMaintenance('ONLINE')}
            disabled={actionBusy === 'BULK'}
            style={{
              background: '#16a34a',
              borderColor: '#16a34a',
            }}
            id="bulk-online-btn"
          >
            <CheckCircle size={16} weight="bold" />
            <span>{actionBusy === 'BULK' ? 'Applying...' : 'Bring ALL Online'}</span>
          </button>
        </div>
      </div>

      {/* ─── Feedback Toast / Alert ─── */}
      {feedback && (
        <div
          className="glass-card"
          style={{
            padding: '12px 18px',
            marginBottom: 16,
            background: 'rgba(34, 197, 94, 0.1)',
            borderColor: 'rgba(34, 197, 94, 0.3)',
            color: 'var(--clr-success)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontWeight: 600,
            fontSize: 13.5,
          }}
        >
          <CheckCircle size={18} weight="fill" />
          <span>{feedback}</span>
        </div>
      )}

      {/* ─── Fleet Status KPI Strip ─── */}
      <div
        className="glass-card"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          padding: '16px 20px',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(34, 197, 94, 0.15)',
              color: 'var(--clr-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle size={20} weight="fill" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--clr-text-3)' }}>Online &amp; Ready</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--clr-text-1)' }}>
              {onlineCount} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--clr-text-4)' }}>units</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Wrench size={20} weight="fill" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--clr-text-3)' }}>Under Maintenance</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>
              {maintCount} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--clr-text-4)' }}>units</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Power size={20} weight="fill" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--clr-text-3)' }}>Offline / Fault</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>
              {offlineCount} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--clr-text-4)' }}>units</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Kiosks Grid ─── */}
      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--clr-text-3)' }}>
          Loading kiosks from fleet registry...
        </div>
      ) : (
        <div className="kiosk-list-grid">
          {kiosks.map((k: any) => {
            const status = (k.status || 'OFFLINE').toUpperCase()
            const id = k.kioskId || k.id
            const paper = k.paperLevel ?? 0
            const toner = k.tonerLevel ?? 0
            const isBusy = actionBusy === id

            const isMaintenance = status === 'MAINTENANCE'
            const isOffline = status === 'OFFLINE'

            return (
              <div
                key={id}
                className="glass-card kiosk-detail-card"
                style={{
                  border: isMaintenance
                    ? '1px solid rgba(245, 158, 11, 0.5)'
                    : isOffline
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : undefined,
                }}
              >
                {/* Header */}
                <div className="kiosk-detail-card__header">
                  <div
                    className={`status-dot ${
                      isMaintenance ? 'warning' : isOffline ? 'offline' : 'online'
                    }`}
                  />
                  <div>
                    <div className="kiosk-detail-card__name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{id}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: 'rgba(59, 130, 246, 0.12)',
                          color: '#60a5fa',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                        }}
                      >
                        🏛️ {k.merchantId || 'M-001'}
                      </span>
                    </div>
                    <div className="kiosk-detail-card__location">{k.location || k.address}</div>
                  </div>
                  <span
                    className={`badge badge-${
                      isMaintenance ? 'warning' : isOffline ? 'danger' : 'online'
                    }`}
                    style={{ marginLeft: 'auto' }}
                  >
                    {status}
                  </span>
                </div>

                {/* Machine Status Selector / Quick Toggles */}
                <div
                  style={{
                    background: 'var(--clr-surface-2)',
                    padding: '10px 12px',
                    borderRadius: 8,
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    border: '1px solid var(--clr-border)',
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--clr-text-3)', fontWeight: 600 }}>
                    Machine Status:
                  </span>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {isMaintenance ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleStatusChange(id, 'ONLINE')}
                        disabled={isBusy}
                        style={{
                          background: '#16a34a',
                          color: '#fff',
                          fontSize: 11,
                          padding: '4px 10px',
                          borderRadius: 6,
                        }}
                        title="Restore machine to Online"
                      >
                        <CheckCircle size={13} weight="bold" />
                        <span>Bring Online</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleStatusChange(id, 'MAINTENANCE')}
                        disabled={isBusy}
                        style={{
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#f59e0b',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          fontSize: 11,
                          padding: '4px 10px',
                          borderRadius: 6,
                        }}
                        title="Put this machine into maintenance mode"
                      >
                        <Wrench size={13} weight="bold" />
                        <span>Set Maintenance</span>
                      </button>
                    )}

                    <Select
                      title="Set Kiosk State"
                      data={KIOSK_STATUS_OPTIONS}
                      value={status}
                      onChange={(val) =>
                        handleStatusChange(id, val as 'ONLINE' | 'MAINTENANCE' | 'OFFLINE')
                      }
                      dropdownWidth={220}
                      size="sm"
                    />
                  </div>
                </div>

                {/* Progress Stats */}
                <div className="kiosk-detail-card__stats">
                  <div className="kiosk-stat-row">
                    <span className="kiosk-stat-row__label">Paper</span>
                    <div className="kiosk-stat-row__bar">
                      <div className="progress-bar">
                        <div
                          className={`progress-bar-fill ${getProgressClass(paper)}`}
                          style={{ width: `${paper}%` }}
                        />
                      </div>
                    </div>
                    <span className="kiosk-stat-row__value">{paper}%</span>
                  </div>
                  <div className="kiosk-stat-row">
                    <span className="kiosk-stat-row__label">Toner</span>
                    <div className="kiosk-stat-row__bar">
                      <div className="progress-bar">
                        <div
                          className={`progress-bar-fill ${getProgressClass(toner)}`}
                          style={{ width: `${toner}%` }}
                        />
                      </div>
                    </div>
                    <span className="kiosk-stat-row__value">{toner}%</span>
                  </div>
                </div>

                <div className="kiosk-detail-card__printer">
                  <span>
                    Printer: <strong>{k.printerModel || 'Brother DCP-T420W Printer USB'}</strong>
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'var(--clr-text-3)', fontSize: 11 }}>
                    Queue: {k.queueCount || 0}
                  </span>
                </div>

                {k.kioskPhotoUrl && (
                  <div
                    style={{
                      height: 120,
                      borderRadius: 8,
                      overflow: 'hidden',
                      marginBottom: 12,
                      border: '1px solid var(--clr-border)',
                      background: 'var(--clr-surface-2, #f8fafc)',
                    }}
                  >
                    <img
                      src={k.kioskPhotoUrl}
                      alt={k.name || id}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                )}

                <div
                  className="kiosk-detail-card__actions"
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenKit(id)}
                    className="btn btn-secondary btn-sm"
                    style={{ justifyContent: 'center', borderColor: 'rgba(200, 255, 0, 0.3)', color: 'var(--clr-accent)' }}
                    title="View Raspberry Pi credentials and setup command"
                  >
                    <Key size={14} weight="bold" />
                    <span>Pi Kit</span>
                  </button>

                  <Link
                    to={`/admin/kiosks/${id}`}
                    className="btn btn-secondary btn-sm"
                    style={{ justifyContent: 'center' }}
                  >
                    <Eye size={14} />
                    <span>Telemetry</span>
                  </Link>

                  <a
                    href={getKioskPrintUrl(id)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary btn-sm"
                    style={{ justifyContent: 'center' }}
                  >
                    <span>Test QR</span>
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Modal 1: Deploy New Pi Kiosk Modal ─── */}
      {deployModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            padding: 20,
          }}
        >
          <div
            className="glass-card animate-scaleUp"
            style={{
              width: '100%',
              maxWidth: 540,
              background: '#151517',
              border: '1px solid rgba(200, 255, 0, 0.25)',
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(200, 255, 0, 0.08)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--clr-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'rgba(200, 255, 0, 0.12)',
                    color: 'var(--clr-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Plus size={20} weight="bold" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--clr-text-1)' }}>
                    Deploy New Raspberry Pi Station
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--clr-text-3)' }}>
                    Configure hardware ID and pair with a merchant partner
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDeployModalOpen(false)}
                className="btn-icon"
                style={{ background: 'transparent', border: 'none', color: 'var(--clr-text-3)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleDeploySubmit} style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--clr-text-3)', marginBottom: 6 }}>
                    Station ID
                  </label>
                  <input
                    type="text"
                    required
                    value={newKioskForm.kioskId}
                    onChange={(e) => setNewKioskForm({ ...newKioskForm, kioskId: e.target.value.toUpperCase() })}
                    placeholder="PB-002"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--clr-border)',
                      color: 'var(--clr-accent)',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--clr-text-3)', marginBottom: 6 }}>
                    Station Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newKioskForm.name}
                    onChange={(e) => setNewKioskForm({ ...newKioskForm, name: e.target.value })}
                    placeholder="PrintBooth — Science Library"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--clr-border)',
                      color: 'var(--clr-text-1)',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              {/* Merchant Assignment */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--clr-text-3)', marginBottom: 6 }}>
                  Assign to Merchant Partner
                </label>
                <select
                  value={newKioskForm.merchantId}
                  onChange={(e) => setNewKioskForm({ ...newKioskForm, merchantId: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#1d1d20',
                    border: '1px solid var(--clr-border)',
                    color: 'var(--clr-text-1)',
                    fontSize: 13,
                  }}
                >
                  {merchants.map((m: any) => (
                    <option key={m.merchantId} value={m.merchantId}>
                      {m.merchantId} — {m.name} ({m.storeName})
                    </option>
                  ))}
                  {merchants.length === 0 && (
                    <option value="M-001">M-001 — Anand Patil (MIT ADT Campus Hub)</option>
                  )}
                </select>
                <span style={{ fontSize: 11, color: 'var(--clr-text-4)', marginTop: 4, display: 'block' }}>
                  All orders sent to this Pi will be recorded under this merchant's revenue & payouts.
                </span>
              </div>

              {/* Location & Address */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--clr-text-3)', marginBottom: 6 }}>
                    Campus / Area Location
                  </label>
                  <input
                    type="text"
                    value={newKioskForm.location}
                    onChange={(e) => setNewKioskForm({ ...newKioskForm, location: e.target.value })}
                    placeholder="e.g. Science Block, 1st Floor"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--clr-border)',
                      color: 'var(--clr-text-1)',
                      fontSize: 13,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--clr-text-3)', marginBottom: 6 }}>
                    Printer Hardware Model
                  </label>
                  <input
                    type="text"
                    value={newKioskForm.printerModel}
                    onChange={(e) => setNewKioskForm({ ...newKioskForm, printerModel: e.target.value })}
                    placeholder="Brother DCP-T420W Printer"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--clr-border)',
                      color: 'var(--clr-text-1)',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setDeployModalOpen(false)}
                  className="btn btn-secondary btn-sm"
                  disabled={deploying}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={deploying}
                  style={{ background: 'var(--clr-accent)', borderColor: 'var(--clr-accent)', fontWeight: 700 }}
                >
                  <ShieldCheck size={16} weight="bold" />
                  <span>{deploying ? 'Deploying...' : 'Generate Pi Setup Kit'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Raspberry Pi Provisioning Kit Modal ─── */}
      {provisionKitModalOpen && activeKitData && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(10px)',
            padding: 20,
          }}
        >
          <div
            className="glass-card animate-scaleUp"
            style={{
              width: '100%',
              maxWidth: 620,
              background: '#131315',
              border: '1px solid rgba(200, 255, 0, 0.35)',
              borderRadius: 16,
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 40px rgba(200, 255, 0, 0.12)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--clr-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(200, 255, 0, 0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'rgba(200, 255, 0, 0.18)',
                    color: 'var(--clr-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Cpu size={22} weight="fill" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--clr-accent)', fontFamily: 'monospace' }}>
                      {activeKitData.kioskId}
                    </span>
                    <span className="badge badge-online">Secured & Paired</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--clr-text-3)' }}>
                    Merchant Partner: <strong>{activeKitData.merchantName || activeKitData.merchantId}</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setProvisionKitModalOpen(false)}
                className="btn-icon"
                style={{ background: 'transparent', border: 'none', color: 'var(--clr-text-3)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Body */}
            <div style={{ padding: '24px', maxHeight: '75vh', overflowY: 'auto' }}>
              {/* Option A: One-line Terminal Setup */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--clr-text-1)' }}>
                    <Terminal size={16} weight="bold" color="var(--clr-accent)" />
                    <span>Option 1: 1-Line Setup Command (Run on Raspberry Pi)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(activeKitData.setupCommand)
                      setCopiedCommand(true)
                      setTimeout(() => setCopiedCommand(false), 2500)
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
                  >
                    {copiedCommand ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                    <span>{copiedCommand ? 'Copied!' : 'Copy Command'}</span>
                  </button>
                </div>

                <div
                  style={{
                    background: '#09090b',
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: '#c8ff00',
                    wordBreak: 'break-all',
                    lineHeight: 1.5,
                  }}
                >
                  {activeKitData.setupCommand}
                </div>
              </div>

              {/* Option B: Device Secret Key */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--clr-text-1)' }}>
                    <Key size={16} weight="bold" color="var(--clr-accent)" />
                    <span>Station Device Secret Key</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(activeKitData.deviceSecret)
                        setCopiedSecret(true)
                        setTimeout(() => setCopiedSecret(false), 2500)
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
                    >
                      {copiedSecret ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                      <span>{copiedSecret ? 'Copied!' : 'Copy Key'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRotateSecretFromModal}
                      disabled={rotatingSecret}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 11, padding: '4px 10px', gap: 4, color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.3)' }}
                      title="Rotate this station's cryptographic secret key"
                    >
                      <ArrowsClockwise size={14} className={rotatingSecret ? 'spin' : ''} />
                      <span>{rotatingSecret ? 'Rotating…' : 'Rotate Key'}</span>
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    background: '#09090b',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    fontFamily: 'monospace',
                    fontSize: 12.5,
                    color: 'var(--clr-text-1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{activeKitData.deviceSecret}</span>
                </div>
              </div>

              {/* Option C: .env file content */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-1)' }}>
                    Option 2: Raspberry Pi Configuration File (kiosk/brain/.env)
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(activeKitData.envContent)
                        setCopiedEnv(true)
                        setTimeout(() => setCopiedEnv(false), 2500)
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
                    >
                      {copiedEnv ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                      <span>{copiedEnv ? 'Copied!' : 'Copy .env File'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadEnvFromModal}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
                    >
                      <DownloadSimple size={14} weight="bold" />
                      <span>Download .env</span>
                    </button>
                  </div>
                </div>

                <pre
                  style={{
                    background: '#09090b',
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    fontFamily: 'monospace',
                    fontSize: 11.5,
                    color: '#94a3b8',
                    overflowX: 'auto',
                    margin: 0,
                    lineHeight: 1.45,
                  }}
                >
                  {activeKitData.envContent}
                </pre>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--clr-border)',
                display: 'flex',
                justifyContent: 'flex-end',
                background: 'rgba(255, 255, 255, 0.02)',
              }}
            >
              <button
                type="button"
                onClick={() => setProvisionKitModalOpen(false)}
                className="btn btn-primary btn-sm"
                style={{ background: 'var(--clr-accent)', borderColor: 'var(--clr-accent)', fontWeight: 700 }}
              >
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
