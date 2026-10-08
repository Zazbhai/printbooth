import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Wrench,
  CheckCircle,
  Power,
  Key,
  Copy,
  Check,
  Terminal,
  Eye,
  EyeSlash,
  ArrowsClockwise,
  DownloadSimple,
} from '@phosphor-icons/react'
import { getAdminKioskDetail, setKioskStatus, getAdminKioskProvisionKit, rotateAdminKioskSecret } from '@/lib/api'
import { getKioskPrintUrl } from '@/lib/config'
import './AdminPage.css'

export default function KioskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [kiosk, setKiosk] = useState<any>(null)
  const [provisionKit, setProvisionKit] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState(false)
  const [copiedEnv, setCopiedEnv] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const loadKiosk = async () => {
    if (id) {
      const [data, kit] = await Promise.all([
        getAdminKioskDetail(id),
        getAdminKioskProvisionKit(id),
      ])
      if (data) setKiosk(data)
      if (kit) setProvisionKit(kit)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadKiosk()
  }, [id])

  const handleUpdateStatus = async (newStatus: 'ONLINE' | 'MAINTENANCE' | 'OFFLINE') => {
    if (!id) return
    setUpdating(true)
    try {
      await setKioskStatus(id, newStatus)
      setFeedback(`Kiosk ${id} status updated to ${newStatus}`)
      await loadKiosk()
      setTimeout(() => setFeedback(null), 3000)
    } catch (err: any) {
      alert(`Failed to update status: ${err.message || 'Unknown error'}`)
    } finally {
      setUpdating(false)
    }
  }

  const handleRotateSecret = async () => {
    if (!id) return
    if (!window.confirm(`Are you sure you want to rotate the Device Secret for ${id}? The current Raspberry Pi connection will be disconnected until updated with the new secret.`)) {
      return
    }
    setRotating(true)
    try {
      const rotated = await rotateAdminKioskSecret(id)
      if (rotated) {
        setProvisionKit(rotated)
        setFeedback(`Secret key for station ${id} rotated successfully!`)
        setTimeout(() => setFeedback(null), 3500)
      }
    } catch (err: any) {
      alert(`Failed to rotate secret: ${err.message || 'Unknown error'}`)
    } finally {
      setRotating(false)
    }
  }

  const handleDownloadEnv = () => {
    const envContent = provisionKit?.envContent || ''
    if (!envContent) return
    const blob = new Blob([envContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `.env`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setFeedback(`✓ Downloaded .env file for station ${id}`)
    setTimeout(() => setFeedback(null), 3000)
  }

  function getProgressClass(val: number) {
    if (val > 50) return 'ok'
    if (val > 20) return 'warn'
    return 'error'
  }

  const kioskData = kiosk || {
    kioskId: id || 'PB-001',
    name: 'PrintBooth — MIT ADT University',
    location: 'Loni Kalbhor, Pune',
    status: 'OFFLINE',
    printerStatus: 'OFFLINE',
    printerModel: 'Brother DCP-T420W Printer USB',
    paperLevel: 0,
    tonerLevel: 0,
    queueCount: 0,
    todayPages: 0,
    todayRevenue: 0,
  }

  const currentStatus = (kioskData.status || 'OFFLINE').toUpperCase()
  const isMaintenance = currentStatus === 'MAINTENANCE'
  const isOffline = currentStatus === 'OFFLINE'

  const metricRows = [
    { label: 'Operational Status', value: currentStatus, mono: false },
    { label: 'Printer Model', value: kioskData.printerModel, mono: false },
    { label: 'Printer Status', value: kioskData.printerStatus || 'OFFLINE', mono: false },
    { label: 'Live Queue', value: `${kioskData.queueCount || 0} jobs`, mono: false },
    { label: "Today's Pages", value: String(kioskData.todayPages || 0), mono: true },
    { label: "Today's Revenue", value: `₹${kioskData.todayRevenue || 0}`, mono: true },
    { label: 'Location', value: kioskData.location || kioskData.address, mono: false },
  ]

  return (
    <div className="admin-page animate-fadeInUp">
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <Link
            to="/admin/kiosks"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: 'var(--clr-accent-light)',
              marginBottom: 6,
            }}
          >
            <ArrowLeft size={14} /> Back to Kiosks Fleet
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              className={`badge badge-${
                isMaintenance ? 'warning' : isOffline ? 'danger' : 'online'
              }`}
            >
              {currentStatus}
            </span>
            <span style={{ fontSize: 13, color: 'var(--clr-text-3)' }}>{kioskData.kioskId}</span>
          </div>
          <h1 className="admin-page__title">{kioskData.name || kioskData.kioskId}</h1>
          <p className="admin-page__sub">{kioskData.location || kioskData.address}</p>
        </div>

        {/* Maintenance / Operational Mode Control Buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {isMaintenance ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => handleUpdateStatus('ONLINE')}
              disabled={updating}
              style={{ background: '#16a34a', borderColor: '#16a34a' }}
            >
              <CheckCircle size={15} weight="bold" />
              <span>{updating ? 'Updating...' : 'Bring Online'}</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleUpdateStatus('MAINTENANCE')}
              disabled={updating}
              style={{
                color: '#f59e0b',
                borderColor: 'rgba(245, 158, 11, 0.4)',
                background: 'rgba(245, 158, 11, 0.1)',
              }}
            >
              <Wrench size={15} weight="bold" />
              <span>{updating ? 'Updating...' : 'Put in Maintenance'}</span>
            </button>
          )}

          {!isOffline && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleUpdateStatus('OFFLINE')}
              disabled={updating}
              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
            >
              <Power size={15} weight="bold" />
              <span>Set Offline</span>
            </button>
          )}

          {isOffline && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => handleUpdateStatus('ONLINE')}
              disabled={updating}
              style={{ background: '#16a34a', borderColor: '#16a34a' }}
            >
              <CheckCircle size={15} weight="bold" />
              <span>Restore Online</span>
            </button>
          )}

          <a
            href={getKioskPrintUrl(kioskData.kioskId)}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary btn-sm"
          >
            <span>Test Customer Page</span>
          </a>
        </div>
      </div>

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

      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--clr-text-3)' }}>
          Loading kiosk telemetry...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {/* Status Details */}
          <div className="glass-card">
            <div className="card-header" style={{ padding: 0, marginBottom: 16 }}>
              <h2 className="card-title">Live Telemetry</h2>
            </div>
            <div className="metric-list">
              {metricRows.map((row) => (
                <div key={row.label} className="metric-list__row">
                  <span className="metric-list__label">{row.label}</span>
                  <span className={`metric-list__val ${row.mono ? 'mono' : ''}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Consumables */}
          <div className="glass-card">
            <div className="card-header" style={{ padding: 0, marginBottom: 16 }}>
              <h2 className="card-title">Consumables &amp; Hardware</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>Paper Tray Level</span>
                  <span className="mono font-semibold">{kioskData.paperLevel}%</span>
                </div>
                <div className="progress-bar" style={{ height: 10 }}>
                  <div
                    className={`progress-bar-fill ${getProgressClass(kioskData.paperLevel)}`}
                    style={{ width: `${kioskData.paperLevel}%` }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>Toner Level</span>
                  <span className="mono font-semibold">{kioskData.tonerLevel}%</span>
                </div>
                <div className="progress-bar" style={{ height: 10 }}>
                  <div
                    className={`progress-bar-fill ${getProgressClass(kioskData.tonerLevel)}`}
                    style={{ width: `${kioskData.tonerLevel}%` }}
                  />
                </div>
              </div>

              <div
                style={{
                  background: 'var(--clr-surface-2)',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--clr-text-3)',
                  border: '1px solid var(--clr-border)',
                }}
              >
                Maintenance Mode Notice: When switched to <strong>MAINTENANCE</strong>, walk-up QR codes will show that this unit is undergoing service and prevent customers from submitting or paying for print jobs until restored.
              </div>
            </div>
          </div>

          {/* Device Credentials & Raspberry Pi Setup */}
          <div className="glass-card" style={{ gridColumn: '1 / -1', border: '1px solid rgba(200, 255, 0, 0.25)' }}>
            <div className="card-header" style={{ padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(200, 255, 0, 0.15)',
                    color: 'var(--clr-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Key size={18} weight="bold" />
                </div>
                <div>
                  <h2 className="card-title" style={{ margin: 0 }}>Device Security & Raspberry Pi Setup</h2>
                  <span style={{ fontSize: 12, color: 'var(--clr-text-3)' }}>
                    Merchant Partner Association: <strong>{provisionKit?.merchantName || kioskData.merchantId || 'Assigned Merchant'}</strong> ({kioskData.merchantId || 'M-001'})
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRotateSecret}
                disabled={rotating}
                className="btn btn-secondary btn-sm"
                style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444', gap: 6 }}
                title="Invalidate current secret and generate a fresh one"
              >
                <ArrowsClockwise size={14} className={rotating ? 'spin' : ''} />
                <span>{rotating ? 'Rotating...' : 'Rotate Device Secret'}</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {/* Secret Key Box */}
              <div style={{ background: '#09090b', padding: '14px', borderRadius: 8, border: '1px solid var(--clr-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--clr-text-3)' }}>
                    Device Secret Key
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 11, padding: '2px 8px' }}
                    >
                      {showSecret ? <EyeSlash size={13} /> : <Eye size={13} />}
                      <span>{showSecret ? 'Hide' : 'Reveal'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const sec = provisionKit?.deviceSecret || kioskData.deviceSecret || ''
                        navigator.clipboard.writeText(sec)
                        setCopiedKey(true)
                        setTimeout(() => setCopiedKey(false), 2500)
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 11, padding: '2px 8px', gap: 4 }}
                    >
                      {copiedKey ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                      <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--clr-accent)', wordBreak: 'break-all' }}>
                  {showSecret
                    ? (provisionKit?.deviceSecret || kioskData.deviceSecret || 'No secret set yet')
                    : '••••••••••••••••••••••••••••••••••••••••••••'}
                </div>
              </div>

              {/* 1-Line Setup Command */}
              <div style={{ background: '#09090b', padding: '14px', borderRadius: 8, border: '1px solid var(--clr-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--clr-text-3)' }}>
                    <Terminal size={14} color="var(--clr-accent)" />
                    <span>Run on Raspberry Pi to Pair</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const fallbackApi = `${window.location.protocol}//${window.location.hostname}:5000/api`
                      const cmd = provisionKit?.setupCommand || `python3 setup_station.py --id ${kioskData.kioskId} --secret ${kioskData.deviceSecret || ''} --api ${fallbackApi}`
                      navigator.clipboard.writeText(cmd)
                      setCopiedCommand(true)
                      setTimeout(() => setCopiedCommand(false), 2500)
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: 11, padding: '2px 8px', gap: 4 }}
                  >
                    {copiedCommand ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                    <span>{copiedCommand ? 'Copied' : 'Copy Command'}</span>
                  </button>
                </div>

                <div style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#94a3b8', wordBreak: 'break-all', lineHeight: 1.4 }}>
                  {provisionKit?.setupCommand || `python3 setup_station.py --id ${kioskData.kioskId} --secret ${kioskData.deviceSecret || ''} --api ${window.location.protocol}//${window.location.hostname}:5000/api`}
                </div>
              </div>

              {/* Ready-to-use .env Box */}
              {provisionKit?.envContent && (
                <div style={{ background: '#09090b', padding: '14px', borderRadius: 8, border: '1px solid var(--clr-border)', gridColumn: '1 / -1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--clr-text-3)' }}>
                      Raspberry Pi .env Configuration (kiosk/brain/.env)
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(provisionKit.envContent)
                          setCopiedEnv(true)
                          setTimeout(() => setCopiedEnv(false), 2500)
                        }}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: 11, padding: '2px 8px', gap: 4 }}
                      >
                        {copiedEnv ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                        <span>{copiedEnv ? 'Copied' : 'Copy .env File'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadEnv}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: 11, padding: '2px 8px', gap: 4 }}
                      >
                        <DownloadSimple size={13} weight="bold" />
                        <span>Download .env</span>
                      </button>
                    </div>
                  </div>

                  <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 11.5, color: '#94a3b8', overflowX: 'auto', lineHeight: 1.45 }}>
                    {provisionKit.envContent}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
