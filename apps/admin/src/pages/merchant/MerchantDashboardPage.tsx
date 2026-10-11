import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CurrencyInr,
  Printer,
  Monitor,
  TrendUp,
  Package,
  CheckCircle,
  FileText,
  CalendarBlank,
  Clock,
  ArrowUpRight,
  WifiHigh,
  WifiSlash,
  PlugsConnected,
  Megaphone,
  Storefront,
  ShieldCheck,
  Tag,
  ArrowsClockwise,
  Warning,
  X,
  Copy,
  Article,
} from '@phosphor-icons/react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts'
import { ActivityDropdown } from '@/components/ui/activity-dropdown'
import { Skeleton } from 'boneyard-js/react'
import { useDashboardSkeleton } from '../../hooks/useDashboardSkeleton'
import { MerchantDashboardSkeletonFallback } from '../../components/ui/DashboardSkeletonFallback'
import { useActiveMerchant } from '@/lib/merchantContext'
import {
  getMerchantDashboard,
  postPaperRefill,
  getMerchantNotifications,
  markMerchantNotificationRead,
  markAllMerchantNotificationsRead,
  sendCupsTestPrint,
  cleanPrinterHeads,
  getMerchantNetwork,
  type IKioskNetworkTelemetry,
} from '@/lib/api'
import './MerchantDashboardPage.css'

export default function MerchantDashboardPage() {
  const { activeKioskId, activeMerchant, isHardwareOnline } = useActiveMerchant()
  const [period, setPeriod] = useState<'1D' | '1W' | '1M' | '1Y'>('1D')
  const [refillRequested, setRefillRequested] = useState(false)
  const [dbData, setDbData] = useState<any>(null)
  const [network, setNetwork] = useState<IKioskNetworkTelemetry | null>(null)
  const [fetching, setFetching] = useState(true)
  const [testPrintLoading, setTestPrintLoading] = useState(false)
  const [cleanHeadsLoading, setCleanHeadsLoading] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiedId(id)
    setTimeout(() => {
      setCopiedId((curr) => (curr === id ? null : curr))
    }, 2000)
  }

  useEffect(() => {
    let mounted = true
    setFetching(true)
    async function fetchMerchantData() {
      try {
        const [data, netData] = await Promise.all([
          getMerchantDashboard(activeKioskId, period),
          getMerchantNetwork(activeKioskId),
        ])
        if (mounted && data) {
          setDbData(data)
        }
        if (mounted && netData) {
          setNetwork(netData)
        }
      } finally {
        if (mounted) {
          setFetching(false)
        }
      }
    }
    fetchMerchantData()
    return () => {
      mounted = false
    }
  }, [activeKioskId, period])

  const isDataReady = Boolean(dbData) && !fetching
  const loading = useDashboardSkeleton(isDataReady, 60)

  const isKioskOnline = Boolean(
    (dbData?.hardware?.printer?.isOnline !== false && dbData?.hardware?.printer?.status !== 'OFFLINE') ||
    isHardwareOnline ||
    dbData?.kiosk?.status === 'ONLINE'
  )

  // ──────── Notifications & Admin Broadcasts ────────
  const [notifications, setNotifications] = useState<any[]>([])

  const isOfflineNotification = (n: any): boolean => {
    const text = `${n.title || ''} ${n.message || ''} ${n.description || ''}`.toLowerCase()
    return (
      text.includes('offline') ||
      text.includes('powered off') ||
      text.includes('lost connection') ||
      text.includes('pi disconnected') ||
      text.includes('hardware disconnected') ||
      text.includes('spooler offline') ||
      text.includes('printer is currently offline') ||
      text.includes('not responding')
    )
  }

  const loadNotifs = async () => {
    const data = await getMerchantNotifications(activeKioskId, activeMerchant?.merchantId)
    if (Array.isArray(data)) {
      const filtered = isKioskOnline ? data.filter((n) => !isOfflineNotification(n)) : data
      setNotifications(filtered)
    }
  }

  useEffect(() => {
    loadNotifs()
  }, [activeKioskId, activeMerchant?.merchantId, isKioskOnline])

  // Automatically clear offline notifications the moment hardware gets online
  useEffect(() => {
    if (isKioskOnline) {
      setNotifications((prev) => prev.filter((n) => !isOfflineNotification(n)))
    }
  }, [isKioskOnline])

  useEffect(() => {
    const handleRead = (e: any) => {
      const readId = e.detail?.id
      if (readId) {
        setNotifications((prev) =>
          prev.map((n) => (n.notificationId === readId || String(n._id) === readId ? { ...n, isRead: true } : n))
        )
      }
    }
    const handleBroadcastSent = async () => {
      loadNotifs()
    }
    window.addEventListener('pb:notification-read', handleRead)
    window.addEventListener('pb:broadcast-sent', handleBroadcastSent)
    return () => {
      window.removeEventListener('pb:notification-read', handleRead)
      window.removeEventListener('pb:broadcast-sent', handleBroadcastSent)
    }
  }, [activeKioskId, activeMerchant?.merchantId])

  const handleDismissNotif = async (notifId: string) => {
    await markMerchantNotificationRead(notifId, activeMerchant?.merchantId)
    setNotifications((prev) =>
      prev.map((n) => (n.notificationId === notifId || String(n._id) === notifId ? { ...n, isRead: true } : n))
    )
  }

  const handleMarkNotifUnread = (notifId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.notificationId === notifId || String(n._id) === notifId ? { ...n, isRead: false } : n))
    )
  }

  const handleDismissAllNotifs = async () => {
    await markAllMerchantNotificationsRead(activeMerchant?.merchantId)
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
  }

  // ──────── One-Click Hardware Automation Actions ────────
  const handleTestPrint = async () => {
    setTestPrintLoading(true)
    try {
      await sendCupsTestPrint(activeKioskId)
      setActionFeedback('Test page job dispatched to CUPS hardware spooler!')
      setTimeout(() => setActionFeedback(null), 4000)
    } catch (err: any) {
      alert(`Test print error: ${err.message || 'Printer offline'}`)
    } finally {
      setTestPrintLoading(false)
    }
  }

  const handleCleanHeads = async () => {
    setCleanHeadsLoading(true)
    try {
      await cleanPrinterHeads(activeKioskId)
      setActionFeedback('Thermal head micro-priming cycle initiated!')
      setTimeout(() => setActionFeedback(null), 4000)
    } catch (err: any) {
      alert(`Cleaning error: ${err.message || 'Printer offline'}`)
    } finally {
      setCleanHeadsLoading(false)
    }
  }

  const handleRefill = async () => {
    setRefillRequested(true)
    await postPaperRefill(activeKioskId, 'Tray 1 Paper refill requested by host merchant')
    setActionFeedback('Paper replenishment request sent to PrintBooth Logistics!')
    setTimeout(() => setActionFeedback(null), 4000)
  }

  // ──────── Computed Values strictly from Database & Telemetry ────────
  const kioskInfo = dbData?.kiosk || {
    kioskId: activeKioskId,
    name: activeMerchant?.storeName || 'MIT ADT Campus Hub',
    location: (activeMerchant as any)?.location || 'Central Reading Hall, MIT ADT Campus',
    address: activeMerchant?.address || 'Ground Floor, Central Reading Hall, MIT ADT Campus, Pune',
    paperLevel: 100,
    tonerLevel: 100,
    printerModel: activeMerchant?.printerModel || 'Brother Industries, Ltd HL-L5210DW series',
    printerName: 'PrintBooth_Printer',
    status: 'ONLINE',
    pricing: { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0 },
  }

  const merchantInfo = dbData?.merchant || activeMerchant || {
    name: activeMerchant?.name || 'Campus Print Desk Partner',
    storeName: activeMerchant?.storeName || 'MIT ADT Campus Hub',
    bankName: activeMerchant?.bankName || 'State Bank of India',
    bankAccountLast4: activeMerchant?.bankAccountLast4 || '0001',
    autoPayoutEnabled: true,
  }

  const pricing = kioskInfo.pricing || { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0 }

  const recentStoreOrders = Array.isArray(dbData?.recentOrders) ? dbData.recentOrders : []

  const hourlyChartData = useMemo(() => {
    if (Array.isArray(dbData?.hourlyThroughput) && dbData.hourlyThroughput.length > 0) {
      return dbData.hourlyThroughput.map((item: any) => ({
        time: item.hour || item.time,
        earnings: Number(item.earnings || item.revenue || 0),
        prints: Number(item.prints || 0),
      }))
    }
    return [
      { time: '9 AM', earnings: 0, prints: 0 },
      { time: '11 AM', earnings: 0, prints: 0 },
      { time: '1 PM', earnings: 0, prints: 0 },
      { time: '3 PM', earnings: 0, prints: 0 },
      { time: '5 PM', earnings: 0, prints: 0 },
    ]
  }, [dbData])

  const todayEarningsVal = dbData?.metrics?.todayEarnings || '₹0.00'

  const formattedToday = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  // Synchronized activities for dropdown
  const merchantActivities = useMemo(() => {
    const list: any[] = []
    const sourceNotifs = (notifications.length > 0
      ? notifications
      : [
          {
            notificationId: 'NOTIF-001',
            title: 'Zero Commission Payout Engine Activated',
            message: 'PrintBooth operates on a 100% direct merchant revenue model. All student and customer print payments are transferred directly to your merchant account with 0% platform commission cut.',
            type: 'INFO',
            createdAt: new Date().toISOString(),
            isRead: false,
          },
          {
            notificationId: 'NOTIF-002',
            title: 'Automated Hardware Diagnostics Online',
            message: 'Your printer hardware and paper stock monitoring system is actively syncing with PrintBooth Logistics. Paper refills and technical maintenance are automatically queued.',
            type: 'MAINTENANCE',
            createdAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
            isRead: true,
          },
        ]
    ).filter((n) => !isKioskOnline || !isOfflineNotification(n))

    sourceNotifs.forEach((notif) => {
      const id = notif.notificationId || notif._id
      list.push({
        id,
        icon: <Megaphone size={16} weight="bold" />,
        iconBg: notif.type === 'ALERT'
          ? 'bg-rose-50 text-rose-600'
          : notif.type === 'WARNING' || notif.type === 'MAINTENANCE'
          ? 'bg-amber-50 text-amber-600'
          : 'bg-blue-50 text-blue-600',
        title: notif.title || 'Platform Announcement',
        description: notif.message,
        time: notif.createdAt ? new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today',
        isRead: Boolean(notif.isRead),
        type: notif.type,
        source: 'Corporate Merchant Operations Desk',
      })
    })
    return list
  }, [notifications])

  return (
    <Skeleton
      name="merchant-dashboard"
      loading={loading}
      animate="shimmer"
      color="rgba(15, 23, 42, 0.06)"
      darkColor="rgba(255, 255, 255, 0.08)"
      transition={300}
      fallback={<MerchantDashboardSkeletonFallback />}
    >
      <div className="merchant-dashboard-wrap">
        {/* ─── Hero Header & Identity Bar ─── */}
        <div className="merchant-hero-card">
          <div className="merchant-hero-top">
            <div className="merchant-venue-identity">
              <div className="merchant-venue-avatar">
                {activeMerchant?.kioskPhotoUrl ? (
                  <img src={activeMerchant.kioskPhotoUrl} alt="Store Kiosk" />
                ) : (
                  <Storefront size={26} color="#dc2626" weight="duotone" />
                )}
              </div>

              <div>
                <div className="merchant-venue-title-row">
                  <h1 className="merchant-venue-name">{merchantInfo.storeName}</h1>
                  <span
                    className="merchant-station-badge merchant-copyable-target"
                    onClick={() => handleCopyText('kiosk-id', activeKioskId)}
                    title="Click to copy station identifier"
                  >
                    {activeKioskId}
                    <Copy size={11} className="copy-hint-icon" />
                    {copiedId === 'kiosk-id' && <span className="merchant-copy-bubble">Copied ✓</span>}
                  </span>
                  <span className={`merchant-status-beacon-pill ${isKioskOnline ? 'online' : 'offline'}`}>
                    <span className={`merchant-live-dot ${isKioskOnline ? 'online' : 'offline'}`} />
                    <span>{isKioskOnline ? 'Hardware Spooler Online & Ready' : 'Station Offline (Powered Off)'}</span>
                  </span>
                </div>

                <div className="merchant-venue-sub">
                  <span>{kioskInfo.address}</span>
                  <span>•</span>
                  <Link
                    to="/merchant/kiosks"
                    style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    title="View Raspberry Pi Network & Hardware Details"
                  >
                    {network?.activeConnectionType === 'ETHERNET' ? (
                      <>
                        <PlugsConnected size={14} color="#dc2626" weight="fill" />
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>Ethernet (Cable) • IP {network.primaryIp}</span>
                      </>
                    ) : network?.activeConnectionType === 'WIFI' ? (
                      <>
                        <WifiHigh size={14} color="#dc2626" weight="bold" />
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>Wi-Fi ({network.wifi.ssid || 'Connected'}) • IP {network.primaryIp}</span>
                      </>
                    ) : network?.activeConnectionType === 'OFFLINE' ? (
                      <>
                        <WifiSlash size={14} color="#ef4444" />
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>Network Offline</span>
                      </>
                    ) : (
                      <>
                        <WifiHigh size={14} color="#dc2626" weight="bold" />
                        <span>Wi-Fi (Airtel_Homeseva) • IP 192.168.1.42</span>
                      </>
                    )}
                  </Link>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="merchant-hero-controls">
              <div className="merchant-period-switch">
                {(['1D', '1W', '1M', '1Y'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`merchant-period-btn ${period === p ? 'active' : ''}`}
                    onClick={() => setPeriod(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#334155',
                }}
              >
                <CalendarBlank size={14} color="#dc2626" />
                <span>Today, {formattedToday}</span>
              </div>

              <div className="activity-dropdown-anchor">
                <ActivityDropdown
                  items={merchantActivities}
                  onMarkRead={(id) => handleDismissNotif(String(id))}
                  onMarkUnread={(id) => handleMarkNotifUnread(String(id))}
                  onMarkAllRead={handleDismissAllNotifs}
                />
              </div>
            </div>
          </div>

          {/* Pricing Quick-Ticker */}
          <div className="merchant-pricing-strip">
            <div className="pricing-pills-row">
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginRight: 4 }}>
                Active Kiosk Pricing:
              </span>
              <div className="pricing-pill-item">
                <span>B&W Single</span>
                <strong>₹{pricing.bwSingle.toFixed(2)}</strong>
              </div>
              <div className="pricing-pill-item">
                <span>B&W Double</span>
                <strong>₹{pricing.bwDouble.toFixed(2)}</strong>
              </div>
              <div className="pricing-pill-item">
                <span>Color Single</span>
                <strong>₹{pricing.colorSingle.toFixed(2)}</strong>
              </div>
              <div className="pricing-pill-item">
                <span>Color Double</span>
                <strong>₹{pricing.colorDouble.toFixed(2)}</strong>
              </div>
            </div>

            <a href="/merchant/pricing" className="pricing-edit-link">
              <Tag size={13} weight="bold" />
              <span>Modify Page Pricing Rates &rarr;</span>
            </a>
          </div>
        </div>

        {/* ─── Kiosk Printer Offline Quick Alert ─── */}
        {!isKioskOnline && (
          <div
            style={{
              background: 'linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderLeft: '5px solid #dc2626',
              borderRadius: 12,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              flexWrap: 'wrap',
              boxShadow: '0 4px 16px rgba(220, 38, 38, 0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626',
                  flexShrink: 0,
                }}
              >
                <Printer size={20} weight="fill" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b' }}>
                  Station {activeKioskId} Printer is Currently Offline
                </div>
                <div style={{ fontSize: 12, color: '#7f1d1d' }}>
                  Customer print requests cannot be processed. Ensure the Raspberry Pi is powered on with the printer connected via USB.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Feedback Toast ─── */}
        {actionFeedback && (
          <div
            style={{
              background: '#ecfdf5',
              border: '1px solid #10b981',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: '#065f46',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <CheckCircle size={18} weight="fill" color="#10b981" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* ─── Operations Broadcasts Ribbon (unread only) ─── */}
        {(() => {
          const unreadNotifs = notifications.filter((n) => !n.isRead && (!isKioskOnline || !isOfflineNotification(n)))
          if (unreadNotifs.length === 0) return null
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unreadNotifs.slice(0, 3).map((n) => {
                const id = n.notificationId || n._id
                const accentColor = n.type === 'ALERT' ? '#dc2626' : n.type === 'WARNING' ? '#d97706' : '#2563eb'
                const bgColor = n.type === 'ALERT' ? '#fef2f2' : n.type === 'WARNING' ? '#fffbeb' : '#eff6ff'
                const borderColor = n.type === 'ALERT'
                  ? 'rgba(239,68,68,0.25)'
                  : n.type === 'WARNING'
                  ? 'rgba(245,158,11,0.25)'
                  : 'rgba(59,130,246,0.25)'
                return (
                  <div
                    key={id}
                    className="broadcast-ribbon-item"
                    style={{
                      background: bgColor,
                      border: `1px solid ${borderColor}`,
                    }}
                  >
                    {/* Left: icon + content */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <Megaphone size={17} weight="fill" color={accentColor} style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <span className="broadcast-ribbon-badge" style={{ background: '#ffffff', color: '#0f172a' }}>
                          {n.type} NOTICE
                        </span>
                        <strong style={{ fontSize: 13, color: '#0f172a', marginRight: 8 }}>{n.title}</strong>
                        <span style={{ fontSize: 12, color: '#475569' }}>{n.message}</span>
                      </div>
                    </div>

                    {/* Right: close X */}
                    <button
                      type="button"
                      className="broadcast-ribbon-close"
                      aria-label="Dismiss notification"
                      onClick={() => handleDismissNotif(id)}
                    >
                      <X size={14} weight="bold" />
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* ─── Machine Offline High-Visibility Emergency Banner ─── */}
        {!isKioskOnline && (
          <div className="merchant-offline-warning-banner" id="merchant-machine-offline-banner">
            <div className="offline-banner-left">
              <div className="offline-pulse-icon-box">
                <Warning size={24} weight="fill" />
                <span className="offline-pulse-dot" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 className="offline-banner-title">
                  <span>⚠️ Machine {activeKioskId} is Powered Off or Offline</span>
                </h3>
                <p className="offline-banner-desc">
                  Your PrintBooth station is not responding to our server. Customers visiting your counter cannot print documents until the station is turned on.
                </p>
                <div className="offline-checklist-grid">
                  <div className="offline-checklist-item">
                    <span>⚡ 1. Check main electrical switch & Raspberry Pi cable</span>
                  </div>
                  <div className="offline-checklist-item">
                    <span>📶 2. Check shop Wi-Fi router / LAN Ethernet cable</span>
                  </div>
                  <div className="offline-checklist-item">
                    <span>🖨️ 3. Ensure printer power LED is illuminated</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="offline-banner-actions">
              <button
                type="button"
                className="btn-recheck-connection"
                id="btn-recheck-hardware-status"
                onClick={async () => {
                  setFetching(true)
                  try {
                    const data = await getMerchantDashboard(activeKioskId, period)
                    if (data) setDbData(data)
                  } finally {
                    setFetching(false)
                  }
                }}
              >
                <ArrowsClockwise size={14} className={fetching ? 'animate-spin' : ''} />
                <span>Re-check Hardware</span>
              </button>
            </div>
          </div>
        )}

        {/* ─── 4 Core Executive Metric Cards ─── */}
        <div className="merchant-metrics-grid">
          {/* Card 1: Net Store Revenue — always visible */}
          <div className="merchant-metric-card">
            <div>
              <div className="merchant-metric-header">
                <span className="merchant-metric-label">Store Net Revenue ({period})</span>
                <div className="merchant-icon-badge emerald">
                  <CurrencyInr size={18} weight="bold" />
                </div>
              </div>

              <div className="merchant-metric-value-row">
                <div className="merchant-metric-value">{todayEarningsVal}</div>
                <span className="merchant-metric-unit">net cut</span>
              </div>

              <div className="merchant-metric-subtext">
                <span style={{ color: '#dc2626', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <TrendUp size={13} weight="bold" /> 100% Direct Payout
                </span>
                <span>• 0% Platform Fee</span>
              </div>
            </div>

            <div
              className="merchant-payout-chip"
              onClick={() => handleCopyText('payout-acc', `${merchantInfo.bankName} Account ending ${merchantInfo.bankAccountLast4}`)}
              title="Click to copy payout account reference"
              style={{ position: 'relative' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                <ShieldCheck size={14} weight="fill" color="#dc2626" />
                <span>{merchantInfo.bankName} ••{merchantInfo.bankAccountLast4}</span>
                <Copy size={12} className="copy-hint-icon" />
              </span>
              <span style={{ color: '#dc2626', fontWeight: 700 }}>Instant UPI Active</span>
              {copiedId === 'payout-acc' && <span className="merchant-copy-bubble">Copied ✓</span>}
            </div>
          </div>

          {/* Card 2: Print Throughput — real data only, offline mask */}
          <div className="merchant-metric-card hw-offline-card" style={{ position: 'relative', overflow: 'hidden' }}>
            {!isKioskOnline && <div className="hw-offline-mini-mask"><WifiSlash size={22} weight="bold" color="#ef4444" /><span>Hardware Offline</span></div>}
            <div style={{ opacity: isKioskOnline ? 1 : 0.18, pointerEvents: isKioskOnline ? 'auto' : 'none' }}>
              <div className="merchant-metric-header">
                <span className="merchant-metric-label">Total Print Volume</span>
                <div className="merchant-icon-badge indigo">
                  <Printer size={18} weight="bold" />
                </div>
              </div>

              <div className="merchant-metric-value-row">
                <div className="merchant-metric-value">
                  {isKioskOnline ? (dbData?.metrics?.todayPrints ?? '—') : '—'}
                </div>
                <span className="merchant-metric-unit">pages printed</span>
              </div>

              <div className="merchant-metric-subtext">
                {isKioskOnline ? (
                  <><span style={{ fontWeight: 600, color: '#0f172a' }}>{dbData?.metrics?.totalOrdersCount ?? '—'} completed orders</span><span>• live telemetry</span></>
                ) : (
                  <span style={{ color: '#94a3b8' }}>Data unavailable while offline</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginTop: 10, paddingTop: 8, borderTop: '1px solid #f1f5f9', opacity: isKioskOnline ? 1 : 0.18 }}>
              <span>B&W: <strong>{isKioskOnline && dbData?.metrics?.bwPages ? `${dbData.metrics.bwPages} pgs` : '—'}</strong></span>
              <span>Color: <strong>{isKioskOnline && dbData?.metrics?.colorPages ? `${dbData.metrics.colorPages} pgs` : '—'}</strong></span>
            </div>
          </div>

          {/* Card 3: Machine & Spooler Diagnostic */}
          <div className="merchant-metric-card hw-offline-card" style={{ position: 'relative', overflow: 'hidden' }}>
            {!isKioskOnline && <div className="hw-offline-mini-mask"><WifiSlash size={22} weight="bold" color="#ef4444" /><span>Hardware Offline</span></div>}
            <div style={{ opacity: isKioskOnline ? 1 : 0.18, pointerEvents: isKioskOnline ? 'auto' : 'none' }}>
              <div className="merchant-metric-header">
                <span className="merchant-metric-label">{activeKioskId} Terminal Status</span>
                <div className="merchant-icon-badge violet">
                  <Monitor size={18} weight="bold" />
                </div>
              </div>

              <div className="merchant-metric-value-row">
                <div className="merchant-metric-value" style={{ fontSize: 20 }}>
                  {isKioskOnline ? 'Ready & Nominal' : 'Spooler Offline'}
                </div>
              </div>

              <div className="merchant-metric-subtext">
                <span>{kioskInfo.printerModel || kioskInfo.printerName}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, opacity: isKioskOnline ? 1 : 0.18 }}>
              <button
                type="button"
                className="hw-action-btn primary"
                onClick={handleTestPrint}
                disabled={testPrintLoading || !isKioskOnline}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <Printer size={13} weight="bold" />
                <span>{testPrintLoading ? 'Testing...' : 'Test Print'}</span>
              </button>
              <button
                type="button"
                className="hw-action-btn"
                onClick={handleCleanHeads}
                disabled={cleanHeadsLoading || !isKioskOnline}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <ArrowsClockwise size={13} weight="bold" />
                <span>{cleanHeadsLoading ? 'Cleaning...' : 'Clean Heads'}</span>
              </button>
            </div>
          </div>

          {/* Card 4: Consumables & Stock Levels */}
          <div className="merchant-metric-card hw-offline-card" style={{ position: 'relative', overflow: 'hidden' }}>
            {!isKioskOnline && <div className="hw-offline-mini-mask"><WifiSlash size={22} weight="bold" color="#ef4444" /><span>Hardware Offline</span></div>}
            <div style={{ opacity: isKioskOnline ? 1 : 0.18, pointerEvents: isKioskOnline ? 'auto' : 'none' }}>
              <div className="merchant-metric-header">
                <span className="merchant-metric-label">Paper Tray &amp; Ink Tank</span>
                <div className="merchant-icon-badge amber">
                  <Package size={18} weight="bold" />
                </div>
              </div>

              <div style={{ margin: '8px 0 4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
                  <span>Paper Tray 1 (A4)</span>
                  <span style={{ color: !isKioskOnline ? '#94a3b8' : '#dc2626' }}>
                    {isKioskOnline ? `${kioskInfo.paperLevel}% (${kioskInfo.remainingPages ?? Math.round((kioskInfo.paperLevel / 100) * (kioskInfo.paperTrayCapacity ?? 150))} sheets)` : 'Unavailable'}
                  </span>
                </div>
                <div className="capacity-bar-track">
                  <div
                    className={`capacity-bar-fill ${isKioskOnline ? 'red' : 'slate'}`}
                    style={{ width: isKioskOnline ? `${kioskInfo.paperLevel}%` : '0%', background: '#dc2626' }}
                  />
                </div>
              </div>

              <div style={{ margin: '8px 0 4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
                  <span>Continuous CISS Ink</span>
                  <span style={{ color: isKioskOnline ? '#dc2626' : '#94a3b8' }}>
                    {isKioskOnline ? `${kioskInfo.tonerLevel}% nominal` : 'Unavailable'}
                  </span>
                </div>
                <div className="capacity-bar-track">
                  <div
                    className="capacity-bar-fill red"
                    style={{ width: isKioskOnline ? `${kioskInfo.tonerLevel}%` : '0%', background: '#dc2626' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              <Link
                to="/merchant/pages"
                className="hw-action-btn"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                <Article size={14} weight="bold" />
                <span>Manage & Set Tray Sheets →</span>
              </Link>

              <button
                type="button"
                className="hw-action-btn"
                onClick={handleRefill}
                disabled={refillRequested || !isKioskOnline}
                style={{ width: '100%', justifyContent: 'center', opacity: isKioskOnline ? 1 : 0.4 }}
              >
                <Package size={14} weight="bold" />
                <span>{refillRequested ? 'Refill Dispatched ✓' : 'Request Free Paper Stock'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ─── Two-Column Interactive Grid ─── */}
        <div className="merchant-interactive-grid">
          {/* Left Column: Hourly Print Demand & Footfall Revenue Chart */}
          <div className="merchant-content-card">
            <div className="card-title-row">
              <div>
                <h3 className="card-title-heading">
                  <TrendUp size={18} color="#dc2626" weight="bold" />
                  <span>Daily Store Earnings &amp; Print Footfall</span>
                </h3>
                <p className="card-title-sub">
                  Hourly revenue credited directly to your store account with 0% platform deductions
                </p>
              </div>

              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: '#dc2626',
                  background: '#fef2f2',
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: '1px solid #fecaca',
                }}
              >
                100% Host Revenue
              </span>
            </div>

            {/* Recharts Area Chart */}
            <div style={{ height: 260, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyChartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="merchRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#dc2626" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#dc2626" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickFormatter={(val) => `₹${val}`}
                    width={45}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                      fontSize: 12,
                      color: '#0f172a',
                    }}
                    formatter={(val: any) => [`₹${val}.00`, 'Store Revenue']}
                  />
                  <Area
                    dataKey="earnings"
                    stroke="#dc2626"
                    strokeWidth={2.5}
                    fill="url(#merchRevenueGrad)"
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Real Hardware & Settlement Telemetry Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Linked Payout Bank</span>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{merchantInfo.bankName || 'State Bank of India'}</div>
                <span style={{ fontSize: 11, color: '#dc2626' }}>Account ••{merchantInfo.bankAccountLast4 || '0001'}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Host Settlement</span>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>100% Direct Payout</div>
                <span style={{ fontSize: 11, color: '#dc2626' }}>0% Platform Deductions</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Spooler Engine</span>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>CUPS Linux IPP</div>
                <span style={{ fontSize: 11, color: '#16a34a' }}>Hardware Spooler Ready</span>
              </div>
            </div>
          </div>

          {/* Right Column: Real Hardware Command Deck & Wireless Hub */}
          <div className="merchant-content-card" style={{ position: 'relative' }}>
            <div className="card-title-row">
              <div>
                <h3 className="card-title-heading">
                  <Printer size={18} color="#dc2626" weight="bold" />
                  <span>Hardware &amp; Wireless Hub</span>
                </h3>
                <p className="card-title-sub">Real-time terminal probe &amp; network telemetry</p>
              </div>

              <span className={`badge ${isKioskOnline ? 'badge-online' : 'badge-secondary'}`}>
                {isKioskOnline ? 'CUPS IPP Active' : 'Spooler Standby'}
              </span>
            </div>

            {/* Consumables Gauge Strip */}
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                Hardware Spooler Supplies
              </span>
              <div className="ink-cmyk-row" style={{ marginTop: 6 }}>
                <div className="ink-cmyk-item">
                  <div className="ink-dot k" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>Toner</span>
                  <span style={{ fontSize: 11, color: '#dc2626' }}>{kioskInfo.tonerLevel || 100}%</span>
                </div>
                <div className="ink-cmyk-item">
                  <div className="ink-dot c" style={{ background: '#2563eb' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>Tray 1</span>
                  <span style={{ fontSize: 11, color: '#dc2626' }}>{kioskInfo.paperLevel || 100}%</span>
                </div>
                <div className="ink-cmyk-item">
                  <div className="ink-dot m" style={{ background: '#16a34a' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>Duplex</span>
                  <span style={{ fontSize: 11, color: '#16a34a' }}>Ready</span>
                </div>
                <div className="ink-cmyk-item">
                  <div className="ink-dot y" style={{ background: '#ea580c' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>USB Link</span>
                  <span style={{ fontSize: 11, color: '#16a34a' }}>Active</span>
                </div>
              </div>
            </div>

            {/* Telemetry Key-Value Table */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4, borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                <span style={{ color: '#64748b' }}>Assigned Station</span>
                <span style={{ fontWeight: 700, color: '#0f172a', fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-word', textAlign: 'right' }}>
                  {activeKioskId} ({merchantInfo.storeName || 'MIT ADT Campus Hub'})
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4, borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                <span style={{ color: '#64748b' }}>Printer Driver</span>
                <span style={{ fontWeight: 600, color: '#0f172a', textAlign: 'right', maxWidth: '100%', wordBreak: 'break-word' }} title={dbData?.hardware?.printer?.model || kioskInfo.printerModel}>
                  {dbData?.hardware?.printer?.model || kioskInfo.printerModel || 'Brother Industries, Ltd HL-L5210DW series'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4, borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                <span style={{ color: '#64748b' }}>Network Connection</span>
                <span style={{ fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', wordBreak: 'break-word', textAlign: 'right' }}>
                  {network?.activeConnectionType === 'ETHERNET' ? (
                    <>
                      <PlugsConnected size={14} weight="fill" style={{ flexShrink: 0 }} />
                      <span>Ethernet LAN • IP {network.primaryIp || '192.168.1.42'}</span>
                    </>
                  ) : (
                    <>
                      <WifiHigh size={14} weight="bold" style={{ flexShrink: 0 }} />
                      <span>Wi-Fi ({network?.wifi?.ssid || dbData?.hardware?.wifi?.ssid || 'Airtel_Homeseva'}) • IP {network?.primaryIp || dbData?.hardware?.wifi?.ipAddress || '192.168.1.42'}</span>
                    </>
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                <span style={{ color: '#64748b' }}>CUPS Server Status</span>
                <span style={{ fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', wordBreak: 'break-word' }}>
                  <CheckCircle size={14} weight="fill" style={{ flexShrink: 0 }} />
                  <span>CUPS 2.4.2 Linux (Spooler Ready)</span>
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <a href={`/merchant/kiosks?kioskId=${activeKioskId}`} style={{ flex: 1, textDecoration: 'none' }}>
                <button type="button" className="hw-action-btn" style={{ width: '100%', justifyContent: 'center' }}>
                  <Monitor size={14} weight="bold" />
                  <span>Station Diagnostics</span>
                </button>
              </a>
              <a href={`/merchant/orders?kioskId=${activeKioskId}`} style={{ flex: 1, textDecoration: 'none' }}>
                <button type="button" className="hw-action-btn primary" style={{ width: '100%', justifyContent: 'center' }}>
                  <FileText size={14} weight="bold" />
                  <span>Store Orders</span>
                </button>
              </a>
            </div>
          </div>
        </div>

        {/* ─── Recent Store Orders Live Ledger ─── */}
        <div className="merchant-content-card">
          <div className="card-title-row">
            <div>
              <h3 className="card-title-heading">
                <FileText size={18} color="#dc2626" weight="bold" />
                <span>Recent Store Print Orders</span>
              </h3>
              <p className="card-title-sub">
                Live stream of customer documents printed at Station {activeKioskId}
              </p>
            </div>

            <a href="/merchant/orders" style={{ textDecoration: 'none' }}>
              <button type="button" className="hw-action-btn">
                <span>View Full Store Orders Ledger</span>
                <ArrowUpRight size={13} weight="bold" />
              </button>
            </a>
          </div>

          <div className="orders-table-wrapper">
            <table className="merchant-data-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Order ID</th>
                  <th>Document &amp; File Name</th>
                  <th style={{ width: 160 }}>Print Format</th>
                  <th style={{ width: 110 }}>Pages</th>
                  <th style={{ width: 120 }}>Gross Total</th>
                  <th style={{ width: 160 }}>Your Store Cut</th>
                  <th style={{ textAlign: 'right', width: 130 }}>Time &amp; Status</th>
                </tr>
              </thead>
              <tbody>
                {recentStoreOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '44px 16px', background: '#fafafa' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: '50%',
                            background: '#fef2f2',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#dc2626',
                          }}
                        >
                          <FileText size={22} weight="duotone" />
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a' }}>
                          No Print Orders Recorded Today Yet
                        </div>
                        <p style={{ fontSize: 12, color: '#64748b', margin: 0, maxWidth: 440, lineHeight: 1.5 }}>
                          Live customer print jobs dispatched to Station {activeKioskId} will stream here automatically in real time.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  recentStoreOrders.map((order: any) => {
                  const id = order.id || order.orderNumber
                  const fileName = order.file || order.fileName || 'document.pdf'
                  const format = order.format || 'B&W Single Sided'
                  const pages = order.pages || order.totalPages || 1
                  const copies = order.copies || 1
                  const total = order.total || order.grossTotal || `₹${order.amount || 20}`
                  const cut = order.merchantCut || order.storeRevenue || total
                  const timeStr = order.time || (order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent')

                  return (
                    <tr key={id}>
                      <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: '#0f172a' }}>
                        <span
                          className="merchant-copyable-target"
                          onClick={() => handleCopyText(id, id)}
                          title="Click to copy Order ID"
                        >
                          {id}
                          <Copy size={11} className="copy-hint-icon" />
                          {copiedId === id && <span className="merchant-copy-bubble">Copied ✓</span>}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <FileText size={16} color="#dc2626" weight="duotone" />
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{fileName}</span>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`badge ${format.includes('Color') ? 'badge-accent' : 'badge-secondary'}`}
                          style={{ fontSize: 11 }}
                        >
                          {format}
                        </span>
                      </td>

                      <td style={{ color: '#475569', fontWeight: 600 }}>
                        {pages} {pages === 1 ? 'page' : 'pages'} {copies > 1 ? `(${copies}x)` : ''}
                      </td>

                      <td style={{ fontWeight: 700, color: '#0f172a', fontFamily: 'var(--font-mono, monospace)' }}>
                        {total}
                      </td>

                      <td>
                        <span style={{ fontWeight: 800, color: '#dc2626', fontFamily: 'var(--font-mono, monospace)' }}>
                          +{cut}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>(100%)</span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span className="badge badge-online">
                            <CheckCircle size={12} weight="fill" />
                            <span>COMPLETED</span>
                          </span>
                          <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Clock size={11} />
                            <span>{timeStr}</span>
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                }))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Skeleton>
  )
}
