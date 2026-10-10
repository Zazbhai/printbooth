import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Monitor,
  Package,
  CheckCircle,
  ArrowsClockwise,
  WifiHigh,
  WifiSlash,
  PlugsConnected,
  Eye,
  EyeSlash,
  LightbulbFilament,
  QrCode,
  Copy,
  ArrowSquareOut,
  Image as ImageIcon,
  MapPin,
  Camera,
} from '@phosphor-icons/react'
import {
  getMerchantHardware,
  getMerchantPrinters,
  sendCupsTestPrint,
  postPaperRefill,
  getMerchantNetwork,
  scanMerchantWifi,
  connectMerchantWifi,
  updateMerchantKioskPhoto,
  type IKioskNetworkTelemetry,
} from '@/lib/api'
import { getKioskPrintUrl } from '@/lib/config'
import { useActiveMerchant } from '@/lib/merchantContext'
import Select, { type TSelectData } from '@/components/ui/select'
import KioskPhotoEditorModal from '@/components/KioskPhotoEditorModal'
import '../AdminPage.css'
import '../admin/MerchantsPage.css'

const DELIVERY_ITEMS: TSelectData[] = [
  { id: 'combo', label: 'Combo Kit (5 Reams Paper + 1 Toner)', value: 'combo', icon: '📦', description: 'Recommended: Full restock package' },
  { id: 'paper', label: 'A4 Paper Box (5 Reams / 2,500 Sheets)', value: 'paper', icon: '📄', description: 'JK Cedar 75 GSM High-Speed Xerox' },
  { id: 'toner', label: 'High-Yield Toner Cartridge (TN-2365)', value: 'toner', icon: '🖨️', description: 'Black toner, up to 2,600 prints' },
]

const URGENCY_OPTIONS: TSelectData[] = [
  { id: 'standard', label: 'Standard Delivery (Within 24 Hours)', value: 'standard', icon: '🚚', description: 'Scheduled courier batch' },
  { id: 'urgent', label: 'Urgent Delivery (Within 4 Hours)', value: 'urgent', icon: '⚡', description: 'Immediate technician runner dispatch' },
]

export default function MerchantKiosksPage() {
  const { activeKioskId, setActiveKioskId, activeMerchant, merchantKiosks, refreshMerchants } = useActiveMerchant()
  const [hardware, setHardware] = useState<any>(null)
  const [network, setNetwork] = useState<IKioskNetworkTelemetry | null>(null)
  const [loadingPrinters, setLoadingPrinters] = useState(false)
  const [testPrintRunning, setTestPrintRunning] = useState(false)
  const [testPrintDone, setTestPrintDone] = useState(false)
  const [refillModalOpen, setRefillModalOpen] = useState(false)
  const [refillSent, setRefillSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [photoModalOpen, setPhotoModalOpen] = useState(false)

  const handleSaveKioskPhoto = async (newPhotoUrl: string) => {
    await updateMerchantKioskPhoto(activeKioskId, newPhotoUrl)
    if (refreshMerchants) {
      await refreshMerchants()
    }
  }

  // Wi-Fi & Raspberry Pi Network States
  const [wifiModalOpen, setWifiModalOpen] = useState(false)
  const [selectedSsid, setSelectedSsid] = useState('')
  const [customSsid, setCustomSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [scanningWifi, setScanningWifi] = useState(false)
  const [connectingWifi, setConnectingWifi] = useState(false)
  const [scannedNetworks, setScannedNetworks] = useState<any[]>([])
  const [copiedIp, setCopiedIp] = useState(false)
  const [networkNotice, setNetworkNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const loadHardware = async (rescan = false) => {
    setLoadingPrinters(true)
    try {
      const [hwData, , netData] = await Promise.all([
        getMerchantHardware(activeKioskId),
        getMerchantPrinters(activeKioskId, rescan),
        getMerchantNetwork(activeKioskId),
      ])
      if (hwData) setHardware(hwData)
      if (netData) {
        setNetwork(netData)
        if (netData.wifi?.lastScan && Array.isArray(netData.wifi.lastScan)) {
          setScannedNetworks(netData.wifi.lastScan)
        }
      } else if (hwData?.network) {
        setNetwork(hwData.network)
        if (hwData.network.wifi?.lastScan) {
          setScannedNetworks(hwData.network.wifi.lastScan)
        }
      }
    } catch {
      // non-fatal
    } finally {
      setLoadingPrinters(false)
    }
  }

  useEffect(() => {
    loadHardware()
  }, [activeKioskId])

  const handleScanWifi = async () => {
    setScanningWifi(true)
    try {
      const results = await scanMerchantWifi(activeKioskId)
      if (Array.isArray(results) && results.length > 0) {
        setScannedNetworks(results)
      }
      const netData = await getMerchantNetwork(activeKioskId)
      if (netData) {
        setNetwork(netData)
        if (netData.wifi?.lastScan) setScannedNetworks(netData.wifi.lastScan)
      }
      setNetworkNotice({
        type: 'success',
        message: `Wi-Fi scan updated: Discovered ${results?.length || scannedNetworks.length || 0} wireless access points.`,
      })
      setTimeout(() => setNetworkNotice(null), 4000)
    } catch {
      setNetworkNotice({ type: 'error', message: 'Wi-Fi scan timed out. Please retry.' })
    } finally {
      setScanningWifi(false)
    }
  }

  const handleConnectWifi = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetSsid = selectedSsid === 'custom' ? customSsid.trim() : selectedSsid
    if (!targetSsid) return
    setConnectingWifi(true)
    setNetworkNotice(null)
    try {
      const res = await connectMerchantWifi(targetSsid, wifiPassword, activeKioskId)
      if (res?.success) {
        setNetworkNotice({
          type: 'success',
          message: res.message || `Connected successfully to "${targetSsid}". Assigned IP: ${res.data?.primaryIp || res.data?.wifi?.ipAddress || '192.168.1.4'}`,
        })
        setWifiModalOpen(false)
        setWifiPassword('')
        setCustomSsid('')
        await loadHardware()
      } else {
        setNetworkNotice({
          type: 'error',
          message: res?.error || 'Failed to connect to Wi-Fi network. Please verify password.',
        })
      }
    } catch (err: any) {
      setNetworkNotice({
        type: 'error',
        message: err?.response?.data?.error || err.message || 'Wi-Fi handshake error.',
      })
    } finally {
      setConnectingWifi(false)
    }
  }

  const handleCopyIp = (ipToCopy: string) => {
    navigator.clipboard.writeText(ipToCopy)
    setCopiedIp(true)
    setTimeout(() => setCopiedIp(false), 2500)
  }

  const handleTestPrint = async () => {
    setTestPrintRunning(true)
    try {
      await sendCupsTestPrint(activeKioskId)
      setTestPrintDone(true)
      await loadHardware()
      setTimeout(() => setTestPrintDone(false), 5000)
    } catch {
      //
    } finally {
      setTestPrintRunning(false)
    }
  }

  const handleRefillSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRefillSent(true)
    await postPaperRefill(activeKioskId, 'Host requested paper & toner pack')
    setTimeout(() => {
      setRefillModalOpen(false)
      setRefillSent(false)
    }, 1500)
  }

  const printer = hardware?.printer || {
    name: 'Laser Print Engine',
    model: activeMerchant?.printerModel || 'Laser Print Engine',
    paperLevel: activeMerchant?.paperLevel ?? 0,
    tonerBlack: activeMerchant?.tonerLevel ?? 0,
    paperTray1Remaining: 0,
    status: activeMerchant?.printerStatus || 'OFFLINE',
    isOnline: false,
  }

  const isPrinterOnline = Boolean(
    (printer.isOnline ?? (printer.status === 'READY' || printer.status === 'IDLE' || printer.status === 'ONLINE')) &&
    printer.status !== 'OFFLINE' &&
    printer.status !== 'WORK_OFFLINE'
  )

  const activeNetworkType = network?.activeConnectionType || (hardware?.network?.activeConnectionType) || 'WIFI'
  const isEthActive = activeNetworkType === 'ETHERNET'
  const isWifiActive = activeNetworkType === 'WIFI'
  const isNetworkOnline = network?.isOnline ?? (isEthActive || isWifiActive)
  const hostIp = network?.primaryIp || network?.wifi?.ipAddress || hardware?.wifi?.ipAddress || '192.168.1.145'
  const wifiData = network?.wifi || hardware?.wifi || {
    connected: false,
    ssid: 'Not Connected',
    signalStrength: 0,
    signalDbm: -100,
    frequency: '5 GHz',
    security: 'WPA2-Personal',
    ipAddress: hostIp,
    lastScan: [],
  }

  const customerPrintUrl = getKioskPrintUrl(activeKioskId)

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(customerPrintUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="admin-page animate-fadeInUp">
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="badge badge-info">Store Hardware</span>
            <span style={{ fontSize: 13, color: 'var(--clr-text-3)' }}>
              Machine {activeKioskId} • {activeMerchant?.storeName || 'MIT ADT Campus Print Hub'}
            </span>
          </div>
          <h1 className="admin-page__title">My Kiosk Hardware & QR Standee</h1>
          <p className="admin-page__sub">Live paper levels, printer health, counter standee QR, and maintenance tools for your location</p>
        </div>

        <div className="page-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleTestPrint}
            disabled={testPrintRunning}
            id="test-print-btn"
          >
            <ArrowsClockwise size={16} className={testPrintRunning ? 'animate-spin' : ''} />
            <span>{testPrintRunning ? 'Running Self-Test...' : testPrintDone ? 'Self-Test Passed ✓' : 'Run Test Print'}</span>
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setRefillModalOpen(true)}
            id="order-paper-btn"
          >
            <Package size={16} />
            <span>Order Paper / Toner Pack</span>
          </button>
        </div>
      </div>

      {/* Network Notice */}

      {/* Multi-Kiosk Fleet Switcher Bar for Merchant */}
      {merchantKiosks && merchantKiosks.length > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--clr-surface-1)',
          border: '1px solid var(--clr-border)',
          borderRadius: 12,
          padding: '10px 16px',
          marginBottom: 20,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Monitor size={15} color="var(--clr-accent)" />
            <span>My Stations ({merchantKiosks.length}):</span>
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {merchantKiosks.map((k: any) => {
              const id = k.kioskId || k.id
              const isSelected = id === activeKioskId
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveKioskId(id)}
                  className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    fontSize: 12,
                    padding: '4px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{id}</span>
                  {k.name && <span style={{ opacity: 0.8, fontSize: 11 }}>({k.name})</span>}
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: k.status === 'ONLINE' ? '#10b981' : '#f59e0b',
                      display: 'inline-block',
                    }}
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Station Offline Warning Banner */}
      {!isPrinterOnline && (
        <div
          style={{
            background: 'linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderLeft: '5px solid #dc2626',
            borderRadius: 14,
            padding: '16px 20px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            boxShadow: '0 4px 20px rgba(220, 38, 38, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626',
                flexShrink: 0,
              }}
            >
              <LightbulbFilament size={22} weight="fill" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#991b1b', margin: '0 0 4px 0' }}>
                ⚠️ Machine {activeKioskId} Printer is Offline ({printer.name || printer.model})
              </h3>
              <p style={{ fontSize: 13, color: '#7f1d1d', margin: '0 0 8px 0', lineHeight: 1.5 }}>
                Your PrintBooth station printer is not reachable or is in offline pause mode. Customers cannot submit print jobs until an active printer is selected and online.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#b91c1c', background: 'rgba(254, 226, 226, 0.8)', padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  ⚡ 1. Check printer USB cable or Wi-Fi LED
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#b91c1c', background: 'rgba(254, 226, 226, 0.8)', padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  🔌 2. If printer rebooted after power outage, select it below
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => loadHardware()}
            disabled={loadingPrinters}
            style={{ flexShrink: 0, gap: 6 }}
          >
            <ArrowsClockwise size={14} className={loadingPrinters ? 'animate-spin' : ''} />
            <span>Re-check Now</span>
          </button>
        </div>
      )}

      {/* Grid: Kiosk Photo & Counter Standee QR Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 20 }}>
        {/* Physical Kiosk Photo Card */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ImageIcon size={18} color="var(--clr-accent-light)" weight="bold" />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-text-1)' }}>Physical Kiosk Installation</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge badge-online">Verified Installation</span>
              <button
                type="button"
                onClick={() => setPhotoModalOpen(true)}
                className="btn btn-secondary btn-sm"
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  borderColor: 'rgba(200, 255, 0, 0.35)',
                  color: 'var(--clr-accent, #c8ff00)',
                  background: 'rgba(200, 255, 0, 0.08)',
                }}
                title="Edit or upload new photo of this kiosk"
              >
                <Camera size={14} weight="bold" />
                <span>Edit Photo</span>
              </button>
            </div>
          </div>

          <div style={{ borderRadius: 12, overflow: 'hidden', height: 180, background: 'var(--clr-surface-2, #f8fafc)', position: 'relative', border: '1px solid var(--clr-border)' }}>
            {activeMerchant?.kioskPhotoUrl ? (
              <img
                src={activeMerchant.kioskPhotoUrl}
                alt={`${activeMerchant?.storeName} Kiosk`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-text-4)' }}>
                No photo uploaded
              </div>
            )}
            <button
              type="button"
              onClick={() => setPhotoModalOpen(true)}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                backdropFilter: 'blur(6px)',
                zIndex: 2,
              }}
              title="Update physical kiosk hardware installation photo"
            >
              <Camera size={13} weight="bold" />
              <span>Change</span>
            </button>
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '8px 12px',
              background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
              color: '#fff',
            }}>
              <span style={{ fontWeight: 600 }}>{activeMerchant?.storeName || 'Host Store'}</span>
              <span style={{ fontFamily: 'monospace', background: 'rgba(99, 102, 241, 0.4)', padding: '2px 6px', borderRadius: 4 }}>
                {activeKioskId}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--clr-text-3)' }}>
            <MapPin size={16} color="var(--clr-accent-light)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{activeMerchant?.address || 'Shop 4, Ferguson College Rd, Shivajinagar, Pune'}</span>
          </div>
        </div>

        {/* Counter QR Standee Card */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <QrCode size={18} color="var(--clr-accent-light)" weight="bold" />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-text-1)' }}>Customer Print QR Standee</h3>
            </div>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--clr-accent-light)', background: 'var(--clr-surface-2)', padding: '2px 8px', borderRadius: 4 }}>
              {activeKioskId}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--clr-surface-1)', padding: 14, borderRadius: 12, border: '1px solid var(--clr-border)' }}>
            <div style={{ background: '#fff', padding: 8, borderRadius: 8, flexShrink: 0 }}>
              <QRCodeSVG value={customerPrintUrl} size={110} level="H" includeMargin={false} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-1)' }}>
                Scan to Print on Machine {activeKioskId}
              </div>
              <div style={{ fontSize: 11, color: 'var(--clr-text-3)', lineHeight: 1.4 }}>
                Customers scan this QR code with their phone camera to instantly print documents at your counter.
              </div>
              <div style={{
                fontSize: 11,
                fontFamily: 'monospace',
                color: 'var(--clr-accent-light)',
                background: 'var(--clr-surface-2)',
                padding: '4px 8px',
                borderRadius: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {customerPrintUrl}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleCopyUrl}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {copied ? <CheckCircle size={15} color="#10b981" /> : <Copy size={15} />}
              <span>{copied ? 'Copied!' : 'Copy URL'}</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => window.open(customerPrintUrl, '_blank')}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <ArrowSquareOut size={15} />
              <span>Test Print Link</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Kiosk Hardware Card */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Top header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingBottom: 16, borderBottom: '1px solid var(--clr-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--clr-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-accent-light)' }}>
              <Monitor size={26} weight="duotone" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--clr-text-1)' }}>
                  PrintBooth Kiosk {activeKioskId}
                </h2>
                <span className={`badge ${isPrinterOnline ? 'badge-online' : 'badge-danger'}`}>
                  {isPrinterOnline ? 'Operational' : 'Offline'}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--clr-text-3)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                <span>Venue: {activeMerchant?.storeName || 'MIT ADT Campus Print Hub'} · {activeMerchant?.address || 'Ground Floor, Central Reading Hall'}</span>
                <a
                  href={`https://www.google.com/maps?q=${(activeMerchant as any)?.lat ?? 18.4912},${(activeMerchant as any)?.lng ?? 74.0253}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="badge badge-info"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  title="View Kiosk on Google Maps"
                >
                  <MapPin size={12} weight="fill" />
                  <span>GPS: {Number((activeMerchant as any)?.lat ?? 18.5204).toFixed(4)}, {Number((activeMerchant as any)?.lng ?? 73.8431).toFixed(4)}</span>
                  <ArrowSquareOut size={11} />
                </a>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--clr-text-3)' }}>
            {isEthActive ? (
              <span className="badge badge-online" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px' }}>
                <PlugsConnected size={14} weight="fill" />
                <span>Ethernet: Connected • IP {hostIp}</span>
              </span>
            ) : isWifiActive ? (
              <span className="badge badge-online" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px' }}>
                <WifiHigh size={14} weight="bold" />
                <span>Wi-Fi: {wifiData.ssid} ({wifiData.signalStrength}%) • IP {hostIp}</span>
              </span>
            ) : (
              <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px' }}>
                <WifiSlash size={14} />
                <span>Network: Offline</span>
              </span>
            )}
            <span style={{ color: 'var(--clr-border-strong)' }}>|</span>
            <span style={{ color: isPrinterOnline ? 'var(--clr-success)' : 'var(--clr-danger)', fontWeight: 600 }}>
              CUPS: {isPrinterOnline ? 'Ready' : 'Offline'}
            </span>
          </div>
        </div>

        {/* ──────── RASPBERRY PI HOST & NETWORK CONNECTIVITY HUB ──────── */}
        <div
          style={{
            background: 'var(--clr-surface-2, rgba(255, 255, 255, 0.03))',
            border: '1px solid var(--clr-border)',
            borderRadius: 'var(--radius-lg, 14px)',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: isEthActive ? 'rgba(16, 185, 129, 0.12)' : isWifiActive ? 'rgba(59, 130, 246, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isEthActive ? '#10b981' : isWifiActive ? '#3b82f6' : '#ef4444',
                }}
              >
                {isEthActive ? <PlugsConnected size={22} weight="fill" /> : isWifiActive ? <WifiHigh size={22} weight="bold" /> : <WifiSlash size={22} />}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--clr-text-1)', margin: 0 }}>
                    Raspberry Pi Host & Network Connection
                  </h3>
                  {isEthActive && (
                    <span className="badge badge-online" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                      <span>Ethernet LAN Active (Cable)</span>
                    </span>
                  )}
                  {isWifiActive && (
                    <span className="badge badge-online" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                      <span>Wi-Fi Active ({wifiData.ssid || 'Connected'})</span>
                    </span>
                  )}
                  {!isEthActive && !isWifiActive && (
                    <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                      <span>Host Offline (No Internet Gateway)</span>
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: 'var(--clr-text-3)', margin: '3px 0 0 0' }}>
                  Internet route priority: {isEthActive ? 'Primary route over physical Ethernet RJ-45 cable' : isWifiActive ? `Primary route over wireless 802.11 (${wifiData.ssid})` : 'No active network route detected'}
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleScanWifi}
                disabled={scanningWifi}
                title="Scan for available wireless networks nearby"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              >
                <ArrowsClockwise size={14} className={scanningWifi ? 'animate-spin' : ''} />
                <span>{scanningWifi ? 'Scanning...' : 'Rescan Wi-Fi'}</span>
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setWifiModalOpen(true)}
                id="connect-wifi-btn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              >
                <WifiHigh size={15} weight="bold" />
                <span>Connect to Wi-Fi / Change</span>
              </button>
            </div>
          </div>

          {/* Network Action Feedback Notice */}
          {networkNotice && (
            <div
              style={{
                background: networkNotice.type === 'success' ? '#ecfdf5' : '#fef2f2',
                border: `1px solid ${networkNotice.type === 'success' ? '#10b981' : '#ef4444'}`,
                borderRadius: 10,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: networkNotice.type === 'success' ? '#065f46' : '#991b1b',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span>{networkNotice.message}</span>
              <button
                type="button"
                onClick={() => setNetworkNotice(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Telemetry 3-Column Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            {/* Card 1: Raspberry Pi IP Discovery */}
            <div
              style={{
                background: 'var(--clr-surface-1)',
                border: '1px solid var(--clr-border)',
                borderRadius: 'var(--radius-md, 10px)',
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--clr-text-3)' }}>
                  Raspberry Pi Host IP
                </span>
                <span className={`badge ${isNetworkOnline ? 'badge-online' : 'badge-danger'}`} style={{ fontSize: 10 }}>
                  {isNetworkOnline ? 'Reachable' : 'Unreachable'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono, monospace)', color: 'var(--clr-accent-light, #c8ff00)' }}>
                  {hostIp}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyIp(hostIp)}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  title="Copy Raspberry Pi IP Address"
                >
                  {copiedIp ? <CheckCircle size={14} color="#10b981" weight="fill" /> : <Copy size={14} />}
                  <span>{copiedIp ? 'Copied!' : 'Copy IP'}</span>
                </button>
              </div>

              <div style={{ fontSize: 11, color: 'var(--clr-text-4)', display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px solid var(--clr-border)', paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Hostname:</span>
                  <span style={{ color: 'var(--clr-text-2)', fontFamily: 'monospace' }}>{network?.hostname || 'kiosk'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Default Gateway:</span>
                  <span style={{ color: 'var(--clr-text-2)', fontFamily: 'monospace' }}>{network?.gateway || '192.168.1.1'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>DNS Server:</span>
                  <span style={{ color: 'var(--clr-text-2)', fontFamily: 'monospace' }}>{network?.dns || '1.1.1.1'}</span>
                </div>
              </div>
            </div>

            {/* Card 2: Physical Ethernet Interface */}
            <div
              style={{
                background: 'var(--clr-surface-1)',
                border: isEthActive ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--clr-border)',
                borderRadius: 'var(--radius-md, 10px)',
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--clr-text-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <PlugsConnected size={14} />
                  <span>Ethernet (RJ-45 / {network?.ethernet?.interfaceName || 'eth0'})</span>
                </span>
                <span className={`badge ${network?.ethernet?.connected ? 'badge-online' : 'badge-neutral'}`} style={{ fontSize: 10 }}>
                  {network?.ethernet?.connected ? 'Link UP' : network?.ethernet?.cableConnected ? 'Cable In' : 'Unplugged'}
                </span>
              </div>

              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{network?.ethernet?.connected ? 'Cable Connected & Routing' : 'No Ethernet Cable'}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--clr-text-3)', marginTop: 2 }}>
                  {network?.ethernet?.connected ? `Speed: ${network.ethernet.speedMbps || 1000} Mbps Full Duplex` : 'Plug Cat6 cable for maximum stability'}
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--clr-text-4)', display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px solid var(--clr-border)', paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Assigned IP:</span>
                  <span style={{ color: 'var(--clr-text-2)', fontFamily: 'monospace' }}>{network?.ethernet?.ipAddress || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>MAC Address:</span>
                  <span style={{ color: 'var(--clr-text-2)', fontFamily: 'monospace' }}>{network?.ethernet?.macAddress || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Route Status:</span>
                  <span style={{ color: isEthActive ? '#10b981' : 'var(--clr-text-4)', fontWeight: isEthActive ? 700 : 400 }}>
                    {isEthActive ? 'Active Default Route' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: Wi-Fi Wireless Interface */}
            <div
              style={{
                background: 'var(--clr-surface-1)',
                border: isWifiActive ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--clr-border)',
                borderRadius: 'var(--radius-md, 10px)',
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--clr-text-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <WifiHigh size={14} />
                  <span>Wi-Fi ({network?.wifi?.interfaceName || 'wlan0'})</span>
                </span>
                <span className={`badge ${wifiData.connected ? 'badge-online' : 'badge-danger'}`} style={{ fontSize: 10 }}>
                  {wifiData.connected ? `${wifiData.signalStrength || 100}% Signal` : 'Disconnected'}
                </span>
              </div>

              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--clr-text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{wifiData.connected ? wifiData.ssid : 'Not Connected'}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--clr-text-3)', marginTop: 2 }}>
                  {wifiData.connected ? `${wifiData.frequency || '5 GHz'} • ${wifiData.security || 'WPA2-Personal'}` : 'Click Connect to configure Wi-Fi'}
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--clr-text-4)', display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px solid var(--clr-border)', paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Assigned IP:</span>
                  <span style={{ color: 'var(--clr-text-2)', fontFamily: 'monospace' }}>{wifiData.ipAddress || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Signal Level:</span>
                  <span style={{ color: 'var(--clr-text-2)' }}>{wifiData.signalDbm ? `${wifiData.signalDbm} dBm` : '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Wireless Network:</span>
                  <button
                    type="button"
                    onClick={() => setWifiModalOpen(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--clr-accent-light, #c8ff00)', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 }}
                  >
                    Change / Join →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Gauges Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {/* Paper Level */}
          <div style={{ background: 'var(--clr-surface-2)', padding: 16, borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text-2)' }}>Paper Tray (A4 75GSM)</span>
              <span className={`badge ${isPrinterOnline && printer.paperLevel > 20 ? 'badge-online' : 'badge-danger'}`}>
                {isPrinterOnline ? (printer.paperLevel > 20 ? 'Good' : 'Low') : 'Sensor Offline'}
              </span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--clr-text-1)' }}>
              {isPrinterOnline ? `${printer.paperLevel}%` : '0%'}
            </div>
            <div className="progress-bar" style={{ height: 6 }}>
              <div
                className={`progress-bar-fill ${isPrinterOnline && printer.paperLevel > 20 ? 'ok' : 'danger'}`}
                style={{ width: isPrinterOnline ? `${printer.paperLevel}%` : '0%' }}
              />
            </div>
            <span style={{ fontSize: 12, color: 'var(--clr-text-4)' }}>
              {isPrinterOnline
                ? `Approx. ${printer.paperTray1Remaining || 0} sheets remaining in tray 1`
                : 'Sensor offline · Telemetry unreachable'}
            </span>
          </div>

          {/* Toner Life */}
          <div style={{ background: 'var(--clr-surface-2)', padding: 16, borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text-2)' }}>Toner Life (Black)</span>
              <span className={`badge ${isPrinterOnline && printer.tonerBlack > 20 ? 'badge-online' : 'badge-danger'}`}>
                {isPrinterOnline ? (printer.tonerBlack > 20 ? 'Good' : 'Low') : 'Sensor Offline'}
              </span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--clr-text-1)' }}>
              {isPrinterOnline ? `${printer.tonerBlack}%` : '0%'}
            </div>
            <div className="progress-bar" style={{ height: 6 }}>
              <div
                className={`progress-bar-fill ${isPrinterOnline && printer.tonerBlack > 20 ? 'ok' : 'danger'}`}
                style={{ width: isPrinterOnline ? `${printer.tonerBlack}%` : '0%' }}
              />
            </div>
            <span style={{ fontSize: 12, color: 'var(--clr-text-4)' }}>
              {isPrinterOnline
                ? `Approx. ${Math.round((printer.tonerBlack || 0) * 25)} pages remaining`
                : 'Sensor offline · Telemetry unreachable'}
            </span>
          </div>

          {/* Hardware Diagnostic Status */}
          <div style={{ background: 'var(--clr-surface-2)', padding: 16, borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text-2)' }}>Hardware Spooler</span>
              <span className={`badge ${isPrinterOnline ? 'badge-online' : 'badge-danger'}`}>
                {isPrinterOnline ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--clr-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={printer.name || printer.model}>
              {printer.name || printer.model || (isPrinterOnline ? 'Nominal' : 'Offline')}
            </div>
            <div className="progress-bar" style={{ height: 6 }}>
              <div
                className={`progress-bar-fill ${isPrinterOnline ? 'ok' : 'danger'}`}
                style={{ width: isPrinterOnline ? '100%' : '0%' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 12 }}>
              <span style={{ color: 'var(--clr-text-4)' }}>
                {isPrinterOnline ? 'Spooler Active · Ready' : 'Printer paused / offline'}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => loadHardware(true)}
                disabled={loadingPrinters}
                style={{ fontSize: 11, padding: '2px 8px', height: 'auto', fontWeight: 600 }}
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Queue Count */}
          <div style={{ background: 'var(--clr-surface-2)', padding: 16, borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text-2)' }}>Active Job Queue</span>
              <span className="badge badge-info">{hardware?.printer?.jobsCount ? 'Processing' : 'Idle'}</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--clr-text-1)' }}>
              {hardware?.printer?.jobsCount || 0}
            </div>
            <div className="progress-bar" style={{ height: 6 }}>
              <div className="progress-bar-fill accent" style={{ width: hardware?.printer?.jobsCount ? '60%' : '0%' }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--clr-text-4)' }}>
              {hardware?.printer?.jobsCount ? `${hardware.printer.jobsCount} jobs in spooler queue` : 'No queued jobs waiting · Idle'}
            </span>
          </div>
        </div>

        {/* Daily Merchant Staff Checklist */}
        <div style={{ background: 'var(--clr-surface-1)', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--clr-text-1)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <LightbulbFilament size={18} color="var(--clr-warning)" />
            <span>Store Staff Daily Quick Checklist</span>
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--clr-text-2)' }}>
              <CheckCircle size={16} color="var(--clr-success)" />
              <span>Front paper door securely latched</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--clr-text-2)' }}>
              <CheckCircle size={16} color="var(--clr-success)" />
              <span>Main power cord connected & illuminated</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--clr-text-2)' }}>
              <CheckCircle size={16} color="var(--clr-success)" />
              <span>QR code standee clean and unobstructed</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--clr-text-2)' }}>
              <CheckCircle size={16} color="var(--clr-success)" />
              <span>At least 2 spare paper reams in backroom</span>
            </div>
          </div>
        </div>
      </div>

      {/* Refill Request Modal */}
      {refillModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setRefillModalOpen(false)}
        >
          <div
            className="glass-card"
            style={{ width: '100%', maxWidth: 440, background: 'var(--clr-bg-800)', border: '1px solid var(--clr-border-strong)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--clr-text-1)', marginBottom: 8 }}>
              Request Consumables Refill
            </h3>
            <p style={{ fontSize: 13, color: 'var(--clr-text-3)', marginBottom: 16 }}>
              PrintBooth provides paper and toner kits directly to your shop free of charge under your partner contract.
            </p>

            <form onSubmit={handleRefillSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Delivery Item</label>
                <Select
                  title="Select Restock Supplies"
                  data={DELIVERY_ITEMS}
                  defaultValue="combo"
                  dropdownWidth={360}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Urgency</label>
                <Select
                  title="Select Delivery Speed"
                  data={URGENCY_OPTIONS}
                  defaultValue="standard"
                  dropdownWidth={340}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Store Delivery Address</label>
                <input
                  type="text"
                  className="form-input"
                  defaultValue={activeMerchant?.address || `${activeMerchant?.storeName || 'MIT ADT Campus Print Hub'}, Central Reading Hall, Pune`}
                  readOnly
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRefillModalOpen(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                  {refillSent ? 'Order Dispatched ✓' : 'Confirm Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────── MODAL: CONNECT RASPBERRY PI TO WI-FI ──────── */}
      {wifiModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setWifiModalOpen(false)}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#151517',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                  <WifiHigh size={20} weight="bold" />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>
                    Connect Raspberry Pi to Wi-Fi
                  </h3>
                  <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
                    Station {activeKioskId} • Wireless Host Configuration
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWifiModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConnectWifi} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* SSID Picker */}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
                    Select Wireless Network (SSID)
                  </label>
                  <button
                    type="button"
                    onClick={handleScanWifi}
                    disabled={scanningWifi}
                    style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <ArrowsClockwise size={12} className={scanningWifi ? 'animate-spin' : ''} />
                    <span>{scanningWifi ? 'Scanning...' : 'Rescan'}</span>
                  </button>
                </div>

                <select
                  className="form-input"
                  value={selectedSsid}
                  onChange={(e) => setSelectedSsid(e.target.value)}
                  style={{
                    background: '#1e1e24',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 13,
                  }}
                  required
                >
                  <option value="">-- Choose Wi-Fi network --</option>
                  {scannedNetworks.map((net: any, idx: number) => (
                    <option key={idx} value={net.ssid}>
                      {net.ssid} ({net.signalStrength}% signal • {net.security}) {net.isCurrent ? '★ Current' : ''}
                    </option>
                  ))}
                  <option value="custom">+ Hidden or Other SSID...</option>
                </select>
              </div>

              {/* Custom SSID Input */}
              {selectedSsid === 'custom' && (
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
                    Hidden Network Name (SSID)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Campus_Staff_Private"
                    value={customSsid}
                    onChange={(e) => setCustomSsid(e.target.value)}
                    className="form-input"
                    style={{
                      background: '#1e1e24',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '10px 12px',
                      fontSize: 13,
                    }}
                  />
                </div>
              )}

              {/* Password Input with Show/Hide */}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
                    Wi-Fi Security Key (Password)
                  </label>
                  <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)' }}>
                    WPA2 / WPA3
                  </span>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter network password (leave blank if open)"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    className="form-input"
                    style={{
                      width: '100%',
                      background: '#1e1e24',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '10px 38px 10px 12px',
                      fontSize: 13,
                      fontFamily: showPassword ? 'inherit' : 'monospace',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.6)',
                      cursor: 'pointer',
                      padding: 4,
                    }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)' }}>
                  Credentials are sent securely to the station host to establish the connection and acquire DHCP IP.
                </span>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setWifiModalOpen(false)}
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={connectingWifi}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, justifyContent: 'center', gap: 6 }}
                  disabled={connectingWifi || !selectedSsid || (selectedSsid === 'custom' && !customSsid.trim())}
                >
                  {connectingWifi ? (
                    <>
                      <ArrowsClockwise size={14} className="animate-spin" />
                      <span>Connecting & Leasing IP...</span>
                    </>
                  ) : (
                    <>
                      <WifiHigh size={15} weight="bold" />
                      <span>Connect Station</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kiosk Photo Editor Modal */}
      <KioskPhotoEditorModal
        isOpen={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        kioskId={activeKioskId}
        venueName={activeMerchant?.storeName}
        currentPhotoUrl={activeMerchant?.kioskPhotoUrl}
        onSave={handleSaveKioskPhoto}
        title="Update Kiosk Hardware Photo"
        subtitle={`Upload a photo of kiosk station ${activeKioskId} installed at ${activeMerchant?.storeName || 'venue'}.`}
      />
    </div>
  )
}
