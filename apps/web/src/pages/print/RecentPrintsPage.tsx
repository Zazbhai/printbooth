import React, { useState, useEffect, useMemo } from 'react'
import {
  CheckCircle,
  Copy,
  Check,
  Printer,
  MapPin,
  ArrowsClockwise,
  Trash,
  MagnifyingGlass,
  FileText,
  FilePdf,
  FileImage,
  X,
  Sparkle,
  Plus,
} from '@phosphor-icons/react'
import {
  getRecentPrints,
  deleteRecentPrint,
  clearAllRecentPrints,
  subscribeRecentPrints,
  type RecentPrintRecord,
} from '../../lib/recentPrintsStore'
import { usePrintFlow, usePrintNavigate as useNavigate } from './PrintFlowContext'
import { ShinyButton } from '../../components/ui/ShinyButton'
import './RecentPrintsPage.css'

interface RecentPrintsPageProps {
  onClose?: () => void
  isModal?: boolean
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`

    return date.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return 'Recently'
  }
}

export default function RecentPrintsPage({ onClose, isModal = false }: RecentPrintsPageProps) {
  const navigate = useNavigate()
  const flow = usePrintFlow()
  const [prints, setPrints] = useState<RecentPrintRecord[]>(() => getRecentPrints())
  const [filter, setFilter] = useState<'ALL' | 'AWAITING_PIN' | 'COMPLETED'>('ALL')
  const [search, setSearch] = useState('')
  const [copiedOtpId, setCopiedOtpId] = useState<string | null>(null)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  // Live subscription to storage changes (cross-tab & background updates)
  useEffect(() => {
    const unsubscribe = subscribeRecentPrints(() => {
      setPrints(getRecentPrints())
    })
    return () => unsubscribe()
  }, [])

  // Filter and search computation
  const filteredPrints = useMemo(() => {
    return prints.filter(item => {
      if (filter === 'AWAITING_PIN' && item.status !== 'AWAITING_PIN' && item.status !== 'PRINTING') {
        return false
      }
      if (filter === 'COMPLETED' && item.status !== 'COMPLETED') {
        return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesOrder = item.orderId.toLowerCase().includes(q)
        const matchesKiosk = item.kioskId.toLowerCase().includes(q) || item.kioskName.toLowerCase().includes(q)
        const matchesFiles = item.files.some(f => f.fileName.toLowerCase().includes(q))
        return matchesOrder || matchesKiosk || matchesFiles
      }
      return true
    })
  }, [prints, filter, search])

  // Aggregate stats
  const stats = useMemo(() => {
    const total = prints.length
    const active = prints.filter(p => p.status === 'AWAITING_PIN' || p.status === 'PRINTING').length
    const completed = prints.filter(p => p.status === 'COMPLETED').length
    const totalSheets = prints.reduce((acc, p) => acc + (p.totalSheets || 1), 0)
    return { total, active, completed, totalSheets }
  }, [prints])

  const handleCopyOtp = (orderId: string, otp: string) => {
    navigator.clipboard.writeText(otp)
    setCopiedOtpId(orderId)
    setTimeout(() => setCopiedOtpId(null), 2000)
  }

  const handleOpenLiveOtp = (order: RecentPrintRecord) => {
    sessionStorage.setItem('pb_order_id', order.orderId)
    sessionStorage.setItem('pb_release_pin', order.otp)
    sessionStorage.setItem('pb_kiosk_id', order.kioskId)
    sessionStorage.setItem('pb_kiosk_name', order.kioskName)
    sessionStorage.setItem('pb_total_price', String(order.totalPrice))
    if (order.files?.[0]) {
      sessionStorage.setItem('pb_file_name', order.files[0].fileName)
      sessionStorage.setItem('pb_page_count', String(order.files[0].pageCount || 1))
    }
    if (onClose) onClose()
    if (flow?.goToStep) {
      flow.goToStep('status')
    } else {
      navigate('/print/status')
    }
  }

  const handleReprintOrder = (order: RecentPrintRecord) => {
    sessionStorage.setItem('pb_kiosk_id', order.kioskId)
    sessionStorage.setItem('pb_kiosk_name', order.kioskName)
    if (onClose) onClose()
    if (flow?.goToStep) {
      flow.goToStep('upload')
    } else {
      navigate('/print/upload')
    }
  }

  const handleDelete = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteRecentPrint(orderId)
    setPrints(getRecentPrints())
  }

  const handleClearAll = () => {
    clearAllRecentPrints()
    setPrints([])
    setConfirmClearOpen(false)
  }

  return (
    <div className={`rcp-root ${isModal ? 'is-modal' : ''}`}>
      {/* ── Top Bar / Header ── */}
      <div className="rcp-header">
        <div className="rcp-header-main">
          <div className="rcp-eyebrow">
            <span className="rcp-eyebrow-dot" />
            <span>Print History &amp; Orders</span>
            {stats.active > 0 && (
              <span className="rcp-eyebrow-active-badge">
                {stats.active} {stats.active === 1 ? 'Job Ready' : 'Jobs Ready'}
              </span>
            )}
          </div>
          <h1 className="rcp-title">Recent Print Orders</h1>
          <p className="rcp-subtitle">
            All your print jobs, instant release OTP codes, and station release statuses saved on this device.
          </p>
        </div>

        <div className="rcp-header-actions">
          {prints.length > 0 && (
            <button
              type="button"
              className="rcp-clear-btn"
              onClick={() => setConfirmClearOpen(true)}
              title="Clear all recent print history"
            >
              <Trash size={14} weight="bold" />
              <span>Clear History</span>
            </button>
          )}

          {isModal && onClose && (
            <button
              type="button"
              className="rcp-close-btn"
              onClick={onClose}
              title="Close recent prints"
              aria-label="Close"
            >
              <X size={18} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {/* ── Metric Highlights Rail ── */}
      {prints.length > 0 && (
        <div className="rcp-metrics-rail">
          <div className="rcp-metric-card">
            <span className="rcp-metric-num">{stats.total}</span>
            <span className="rcp-metric-label">Total Jobs</span>
          </div>
          <div className="rcp-metric-divider" />
          <div className="rcp-metric-card">
            <span className="rcp-metric-num accent-red">{stats.active}</span>
            <span className="rcp-metric-label">Active at Kiosk</span>
          </div>
          <div className="rcp-metric-divider" />
          <div className="rcp-metric-card">
            <span className="rcp-metric-num accent-green">{stats.completed}</span>
            <span className="rcp-metric-label">Printed</span>
          </div>
          <div className="rcp-metric-divider" />
          <div className="rcp-metric-card">
            <span className="rcp-metric-num">{stats.totalSheets}</span>
            <span className="rcp-metric-label">Total Sheets</span>
          </div>
        </div>
      )}

      {/* ── Filter & Search Toolbar ── */}
      {prints.length > 0 && (
        <div className="rcp-toolbar">
          <div className="rcp-filter-pills">
            <button
              type="button"
              className={`rcp-filter-pill ${filter === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilter('ALL')}
            >
              <span>All ({stats.total})</span>
            </button>
            <button
              type="button"
              className={`rcp-filter-pill ${filter === 'AWAITING_PIN' ? 'active' : ''}`}
              onClick={() => setFilter('AWAITING_PIN')}
            >
              <span className="rcp-filter-dot pulse-red" />
              <span>Active ({stats.active})</span>
            </button>
            <button
              type="button"
              className={`rcp-filter-pill ${filter === 'COMPLETED' ? 'active' : ''}`}
              onClick={() => setFilter('COMPLETED')}
            >
              <span>Completed ({stats.completed})</span>
            </button>
          </div>

          <div className="rcp-search-box">
            <MagnifyingGlass size={14} weight="bold" className="rcp-search-icon" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by file, order ID, station…"
              className="rcp-search-input"
            />
            {search && (
              <button
                type="button"
                className="rcp-search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Orders List ── */}
      <div className="rcp-list">
        {filteredPrints.length === 0 ? (
          <div className="rcp-empty-card">
            <div className="rcp-empty-icon-wrap">
              <Printer size={36} weight="duotone" color="#dc2626" />
            </div>
            <h3 className="rcp-empty-title">
              {prints.length === 0 ? 'No Recent Prints Yet' : 'No Orders Matching Search'}
            </h3>
            <p className="rcp-empty-desc">
              {prints.length === 0
                ? 'Your printed documents, payment receipts, and 4-digit release OTPs will appear here automatically.'
                : 'Try clearing your search term or changing the status filter tab.'}
            </p>
            {prints.length === 0 && (
              <ShinyButton
                variant="primary"
                className="rcp-empty-action-btn"
                onClick={() => {
                  if (onClose) onClose()
                  if (flow?.goToStep) flow.goToStep('upload')
                  else navigate('/print/upload')
                }}
              >
                <Plus size={16} weight="bold" />
                <span>Start a New Print</span>
              </ShinyButton>
            )}
          </div>
        ) : (
          filteredPrints.map(order => {
            const isCompleted = order.status === 'COMPLETED'
            const isAwaitingPin = order.status === 'AWAITING_PIN'
            const isPrinting = order.status === 'PRINTING'
            const primaryFile = order.files[0] || { fileName: 'Document' }
            const isCopied = copiedOtpId === order.orderId

            return (
              <article key={order.orderId} className={`rcp-card ${isAwaitingPin ? 'is-awaiting' : ''}`}>
                {/* Status Indicator Bar */}
                <div className={`rcp-card-topbar ${order.status.toLowerCase()}`}>
                  <div className="rcp-card-status-pill">
                    {isCompleted ? (
                      <>
                        <CheckCircle size={13} weight="fill" color="#059669" />
                        <span>PRINT COMPLETED</span>
                      </>
                    ) : isPrinting ? (
                      <>
                        <ArrowsClockwise size={13} weight="bold" className="spin-slow" color="#0284c7" />
                        <span>PRINTING IN PROGRESS</span>
                      </>
                    ) : (
                      <>
                        <span className="rcp-card-pulse-dot" />
                        <span>ENTER OTP AT KIOSK</span>
                      </>
                    )}
                  </div>

                  <div className="rcp-card-meta-right">
                    <span className="rcp-card-order-id">#{order.orderId}</span>
                    <span className="rcp-card-time">{formatRelativeTime(order.createdAt)}</span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="rcp-card-body">
                  {/* Left: Document Info */}
                  <div className="rcp-doc-info">
                    <div className="rcp-doc-icon-wrap">
                      {primaryFile.fileType === 'pdf' ? (
                        <FilePdf size={24} weight="fill" color="#dc2626" />
                      ) : primaryFile.fileType === 'image' ? (
                        <FileImage size={24} weight="fill" color="#059669" />
                      ) : (
                        <FileText size={24} weight="fill" color="#2563eb" />
                      )}
                    </div>

                    <div className="rcp-doc-meta">
                      <h4 className="rcp-doc-title">
                        {primaryFile.fileName}
                        {order.files.length > 1 && (
                          <span className="rcp-doc-multi-badge">
                            +{order.files.length - 1} more
                          </span>
                        )}
                      </h4>

                      <div className="rcp-doc-chips">
                        <span className="rcp-chip">
                          {order.totalSheets} {order.totalSheets === 1 ? 'Sheet' : 'Sheets'} ({order.totalPages}p)
                        </span>
                        <span className="rcp-chip">
                          {primaryFile.colour === 'COLOUR' ? 'Colour' : 'B&W Monochrome'}
                        </span>
                        <span className="rcp-chip">
                          {primaryFile.duplex === 'DOUBLE' ? '2-Sided' : '1-Sided'}
                        </span>
                        {primaryFile.copies && primaryFile.copies > 1 && (
                          <span className="rcp-chip">{primaryFile.copies}x copies</span>
                        )}
                      </div>

                      <div className="rcp-station-line">
                        <MapPin size={12} weight="fill" color="#dc2626" />
                        <span className="rcp-station-name">{order.kioskName}</span>
                        <span className="rcp-station-id">({order.kioskId})</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: OTP Capsule & Price */}
                  <div className="rcp-otp-container">
                    <div className="rcp-otp-header">
                      <span className="rcp-otp-label">Release OTP</span>
                      <span className="rcp-price-tag">₹{order.totalPrice}.00</span>
                    </div>

                    {/* 4-Digit Inset OTP Slots */}
                    <div
                      className="rcp-otp-slots"
                      onClick={() => handleCopyOtp(order.orderId, order.otp)}
                      title="Click to copy OTP"
                    >
                      {order.otp.split('').map((char, idx) => (
                        <span key={idx} className="rcp-otp-digit">
                          {char}
                        </span>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="rcp-card-btn-row">
                      <button
                        type="button"
                        className={`rcp-copy-btn ${isCopied ? 'copied' : ''}`}
                        onClick={() => handleCopyOtp(order.orderId, order.otp)}
                      >
                        {isCopied ? <Check size={12} weight="bold" /> : <Copy size={12} weight="bold" />}
                        <span>{isCopied ? 'Copied ✓' : 'Copy OTP'}</span>
                      </button>

                      {isAwaitingPin && (
                        <button
                          type="button"
                          className="rcp-live-kiosk-btn"
                          onClick={() => handleOpenLiveOtp(order)}
                          title="Open full interactive machine release screen"
                        >
                          <Sparkle size={12} weight="fill" />
                          <span>Kiosk PIN</span>
                        </button>
                      )}

                      {isCompleted && (
                        <button
                          type="button"
                          className="rcp-reprint-btn"
                          onClick={() => handleReprintOrder(order)}
                          title="Print this job again"
                        >
                          <ArrowsClockwise size={12} weight="bold" />
                          <span>Print Again</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="rcp-delete-icon-btn"
                        onClick={(e) => handleDelete(order.orderId, e)}
                        title="Delete from recent list"
                      >
                        <Trash size={13} weight="bold" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>

      {/* ── Clear All Confirmation Dialog ── */}
      {confirmClearOpen && (
        <div className="rcp-modal-backdrop animate-fadeIn" onClick={() => setConfirmClearOpen(false)}>
          <div className="rcp-modal-card animate-scaleUp" onClick={e => e.stopPropagation()}>
            <div className="rcp-modal-icon">
              <Trash size={28} weight="duotone" color="#dc2626" />
            </div>
            <h3 className="rcp-modal-title">Clear Print History?</h3>
            <p className="rcp-modal-desc">
              This will remove all saved orders and OTPs from this device. Any uncollected prints at the physical kiosk station will still be printable using their paper receipts.
            </p>
            <div className="rcp-modal-actions">
              <button
                type="button"
                className="rcp-modal-btn cancel"
                onClick={() => setConfirmClearOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rcp-modal-btn confirm"
                onClick={handleClearAll}
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
