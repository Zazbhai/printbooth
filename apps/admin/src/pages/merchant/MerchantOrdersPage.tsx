import { useState, useEffect, useCallback } from 'react'
import {
  MagnifyingGlass,
  FilePdf,
  CheckCircle,
  XCircle,
  HourglassMedium,
  UserMinus,
  ShieldCheck,
  PlusCircle,
  WarningCircle,
  Prohibit,
  Receipt,
  Check,
} from '@phosphor-icons/react'
import {
  getMerchantOrders,
  confirmMerchantOrder,
  rejectMerchantOrder,
  blockMerchantUser,
  unblockMerchantUser,
  getMerchantBlockedUsers,
} from '@/lib/api'
import { useActiveMerchant } from '@/lib/merchantContext'
import '../AdminPage.css'

interface BlockedRecord {
  id?: string
  _id?: string
  ip?: string
  mac?: string
  reason?: string
  createdAt?: string
}

export default function MerchantOrdersPage() {
  const { activeKioskId, activeMerchant } = useActiveMerchant()
  const [orders, setOrders] = useState<any[]>([])
  const [blockedUsers, setBlockedUsers] = useState<BlockedRecord[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'CONFIRMED' | 'BLOCKED'>('ALL')
  const [loading, setLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null)

  // Block modal state
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [targetOrderForBlock, setTargetOrderForBlock] = useState<any | null>(null)
  const [customIp, setCustomIp] = useState('')
  const [customMac, setCustomMac] = useState('')
  const [banReason, setBanReason] = useState('Non-payment / Unverified payment claim')
  const [isSubmittingBlock, setIsSubmittingBlock] = useState(false)

  const showToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setActionMsg({ text, type })
    setTimeout(() => {
      setActionMsg(null)
    }, 4500)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [orderList, blockedList] = await Promise.all([
        getMerchantOrders(activeKioskId),
        getMerchantBlockedUsers(activeKioskId),
      ])

      const rawOrders = Array.isArray(orderList)
        ? orderList
        : orderList?.transactions || []

      setOrders(rawOrders)
      setBlockedUsers(Array.isArray(blockedList) ? blockedList : [])
    } catch (err) {
      console.error('Failed to load merchant orders:', err)
    } finally {
      setLoading(false)
    }
  }, [activeKioskId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Helper to check if an order's IP/MAC is currently blocked
  const isOrderBlocked = useCallback(
    (order: any) => {
      if (order.isUserBlocked) return true
      const orderIp = order.customerIp?.trim().toLowerCase()
      const orderMac = order.customerMac?.trim().toLowerCase()
      return blockedUsers.some((b) => {
        if (orderIp && b.ip?.trim().toLowerCase() === orderIp) return true
        if (orderMac && b.mac?.trim().toLowerCase() === orderMac) return true
        return false
      })
    },
    [blockedUsers]
  )

  // Accept Payment -> Confirm Payment & Status
  const handleAcceptPayment = async (order: any) => {
    const orderId = order.orderId || order.id || order.orderNumber
    try {
      await confirmMerchantOrder(orderId, activeKioskId)
      // Update local state immediately
      setOrders((prev) =>
        prev.map((o) => {
          const match = (o.orderId || o.id || o.orderNumber) === orderId
          if (match) {
            return {
              ...o,
              status: 'PAID',
              paymentConfirmation: {
                status: 'CONFIRMED',
                confirmedAt: new Date().toISOString(),
                confirmedBy: 'Merchant Partner',
              },
            }
          }
          return o
        })
      )
      showToast(`Payment Confirmed for #${order.orderNumber || orderId}! Print job authorized.`, 'success')
    } catch (err: any) {
      showToast(err?.message || 'Failed to confirm payment', 'error')
    }
  }

  // Reject unverified payment
  const handleRejectPayment = async (order: any) => {
    const orderId = order.orderId || order.id || order.orderNumber
    if (!window.confirm(`Reject payment confirmation for Order #${order.orderNumber || orderId}?`)) {
      return
    }
    try {
      await rejectMerchantOrder(orderId, activeKioskId)
      setOrders((prev) =>
        prev.map((o) => {
          const match = (o.orderId || o.id || o.orderNumber) === orderId
          if (match) {
            return {
              ...o,
              status: 'REJECTED',
              paymentConfirmation: {
                status: 'REJECTED',
                confirmedAt: new Date().toISOString(),
                confirmedBy: 'Merchant Partner',
              },
            }
          }
          return o
        })
      )
      showToast(`Order #${order.orderNumber || orderId} rejected.`, 'info')
    } catch (err: any) {
      showToast(err?.message || 'Failed to reject payment', 'error')
    }
  }

  // Open Block Modal for an order
  const handleOpenBlockModal = (order: any) => {
    setTargetOrderForBlock(order)
    setCustomIp(order.customerIp || '')
    setCustomMac(order.customerMac || '')
    setBanReason('Non-payment / Unverified payment claim')
    setBlockModalOpen(true)
  }

  // Open generic Block Modal
  const handleOpenManualBlock = () => {
    setTargetOrderForBlock(null)
    setCustomIp('')
    setCustomMac('')
    setBanReason('Non-payment / Unverified payment claim')
    setBlockModalOpen(true)
  }

  // Execute Block User (IP or MAC)
  const handleConfirmBlock = async () => {
    const ip = customIp.trim()
    const mac = customMac.trim()
    if (!ip && !mac) {
      alert('Please provide an IP address or MAC address to block.')
      return
    }

    setIsSubmittingBlock(true)
    try {
      const res = await blockMerchantUser({
        kioskId: activeKioskId,
        ip: ip || undefined,
        mac: mac || undefined,
        reason: banReason,
      })

      // Add to blocked list
      const newRecord: BlockedRecord = res?.data || {
        ip,
        mac,
        reason: banReason,
        createdAt: new Date().toISOString(),
      }
      setBlockedUsers((prev) => [newRecord, ...prev])

      // Mark affected orders as blocked
      setOrders((prev) =>
        prev.map((o) => {
          const orderIp = o.customerIp?.trim().toLowerCase()
          const orderMac = o.customerMac?.trim().toLowerCase()
          if ((ip && orderIp === ip.toLowerCase()) || (mac && orderMac === mac.toLowerCase())) {
            return { ...o, isUserBlocked: true }
          }
          return o
        })
      )

      showToast(`User (${ip || mac}) is blocked from using Machine ${activeKioskId}.`, 'success')
      setBlockModalOpen(false)
    } catch (err: any) {
      showToast(err?.message || 'Failed to block user', 'error')
    } finally {
      setIsSubmittingBlock(false)
    }
  }

  // Unblock / Allow User
  const handleUnblockUser = async (ip?: string, mac?: string) => {
    if (!ip && !mac) return
    const identifier = ip || mac
    if (!window.confirm(`Lift ban and allow ${identifier} to use Machine ${activeKioskId} again?`)) {
      return
    }

    try {
      await unblockMerchantUser({
        kioskId: activeKioskId,
        ip: ip || undefined,
        mac: mac || undefined,
      })

      // Remove from blocked list
      setBlockedUsers((prev) =>
        prev.filter((b) => {
          if (ip && b.ip?.trim().toLowerCase() === ip.trim().toLowerCase()) return false
          if (mac && b.mac?.trim().toLowerCase() === mac.trim().toLowerCase()) return false
          return true
        })
      )

      // Update orders
      setOrders((prev) =>
        prev.map((o) => {
          const orderIp = o.customerIp?.trim().toLowerCase()
          const orderMac = o.customerMac?.trim().toLowerCase()
          if ((ip && orderIp === ip.toLowerCase()) || (mac && orderMac === mac.toLowerCase())) {
            return { ...o, isUserBlocked: false }
          }
          return o
        })
      )

      showToast(`User (${identifier}) access restored for Machine ${activeKioskId}.`, 'success')
    } catch (err: any) {
      showToast(err?.message || 'Failed to unblock user', 'error')
    }
  }

  // Filtered orders list
  const filteredOrders = orders.filter((o: any) => {
    const orderId = (o.orderId || o.id || o.orderNumber || '').toLowerCase()
    const fileName = (o.fileName || o.file || '').toLowerCase()
    const pickupCode = (o.pickupCode || o.token || '').toLowerCase()
    const ip = (o.customerIp || '').toLowerCase()
    const phone = (o.customerPhone || '').toLowerCase()

    const searchLower = search.toLowerCase()
    const matchesSearch =
      orderId.includes(searchLower) ||
      fileName.includes(searchLower) ||
      pickupCode.includes(searchLower) ||
      ip.includes(searchLower) ||
      phone.includes(searchLower)

    if (!matchesSearch) return false

    const isPending =
      o.status === 'PENDING' ||
      o.paymentConfirmation?.status === 'PENDING' ||
      (!o.paidAt && o.status !== 'PAID' && o.status !== 'COMPLETED' && o.status !== 'REJECTED')
    const isPaid = o.status === 'PAID' || o.paymentConfirmation?.status === 'CONFIRMED' || o.status === 'COMPLETED'
    const isBlocked = isOrderBlocked(o)

    if (filter === 'PENDING') return isPending
    if (filter === 'CONFIRMED') return isPaid
    if (filter === 'BLOCKED') return isBlocked

    return true
  })

  // Computed metrics
  const pendingOrders = orders.filter(
    (o) =>
      o.status === 'PENDING' ||
      o.paymentConfirmation?.status === 'PENDING' ||
      (!o.paidAt && o.status !== 'PAID' && o.status !== 'COMPLETED' && o.status !== 'REJECTED')
  )
  const confirmedVolume = orders
    .filter((o) => o.status === 'PAID' || o.paymentConfirmation?.status === 'CONFIRMED' || o.status === 'COMPLETED')
    .reduce((sum, o) => sum + (Number(o.merchantCut ?? o.cut ?? o.amount * 0.18) || 0), 0)

  return (
    <div className="admin-page animate-fadeInUp">
      {/* ─── Header Row ─── */}
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="badge badge-info">Store Activity & Access Control</span>
            <span style={{ fontSize: 13, color: 'var(--clr-text-3)' }}>
              Machine {activeKioskId} • {activeMerchant?.storeName || 'Campus Partner Hub'}
            </span>
          </div>
          <h1 className="admin-page__title">Store Print Transactions & Customer Access</h1>
          <p className="admin-page__sub">
            Review every customer print order for your machine, verify cash/UPI payments, and allow or ban customer IPs and devices.
          </p>
        </div>

        <div className="page-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleOpenManualBlock}
            id="manual-block-user-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Prohibit size={16} color="#ef4444" />
            <span>Block IP / Device</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={loadData}
            title="Refresh order records"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>↻ Refresh</span>
          </button>
        </div>
      </div>

      {/* ─── Toast Feedback Notification ─── */}
      {actionMsg && (
        <div
          style={{
            background:
              actionMsg.type === 'success'
                ? 'var(--clr-success-dim, rgba(16, 185, 129, 0.15))'
                : actionMsg.type === 'error'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(59, 130, 246, 0.15)',
            border: `1px solid ${
              actionMsg.type === 'success' ? 'var(--clr-success, #10b981)' : actionMsg.type === 'error' ? '#ef4444' : '#3b82f6'
            }`,
            color: actionMsg.type === 'error' ? '#fca5a5' : 'var(--clr-text-1)',
            padding: '10px 16px',
            borderRadius: 'var(--radius-md, 8px)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {actionMsg.type === 'success' ? (
            <CheckCircle size={18} color="var(--clr-success, #10b981)" />
          ) : actionMsg.type === 'error' ? (
            <XCircle size={18} color="#ef4444" />
          ) : (
            <WarningCircle size={18} color="#3b82f6" />
          )}
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* ─── Metric Summary Cards ─── */}
      <div className="stats-grid">
        <div className="glass-card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__icon" style={{ color: 'var(--clr-accent-light, #6366f1)' }}>
              <Receipt size={18} weight="duotone" />
            </span>
            <span className="stat-card__label">Total Transactions</span>
          </div>
          <div className="stat-card__value">{orders.length}</div>
          <div className="stat-card__sub">All recorded print orders for this machine</div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__icon" style={{ color: pendingOrders.length > 0 ? '#f59e0b' : 'var(--clr-text-3)' }}>
              <HourglassMedium size={18} weight="duotone" />
            </span>
            <span className="stat-card__label">Pending Confirmation</span>
          </div>
          <div
            className="stat-card__value"
            style={{ color: pendingOrders.length > 0 ? '#f59e0b' : 'var(--foreground)' }}
          >
            {pendingOrders.length}
          </div>
          <div className="stat-card__sub">
            {pendingOrders.length > 0 ? 'Requires merchant payment confirmation' : 'All transactions verified'}
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__icon" style={{ color: 'var(--clr-success, #10b981)' }}>
              <CheckCircle size={18} weight="duotone" />
            </span>
            <span className="stat-card__label">Confirmed Cut Volume</span>
          </div>
          <div className="stat-card__value" style={{ color: 'var(--clr-success, #10b981)' }}>
            ₹{confirmedVolume.toFixed(2)}
          </div>
          <div className="stat-card__sub">Earned directly for Machine {activeKioskId}</div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__icon" style={{ color: blockedUsers.length > 0 ? '#ef4444' : 'var(--clr-text-3)' }}>
              <UserMinus size={18} weight="duotone" />
            </span>
            <span className="stat-card__label">Blocked Customers</span>
          </div>
          <div
            className="stat-card__value"
            style={{ color: blockedUsers.length > 0 ? '#ef4444' : 'var(--foreground)' }}
          >
            {blockedUsers.length}
          </div>
          <div className="stat-card__sub">Banned IPs / devices on this machine</div>
        </div>
      </div>

      {/* ─── Search & Filters Bar ─── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <MagnifyingGlass
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--clr-text-4)',
            }}
          />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: 36 }}
            placeholder="Search by Order #, Document, Token, Customer IP, or Phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${filter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('ALL')}
          >
            All ({orders.length})
          </button>
          <button
            className={`btn btn-sm ${filter === 'PENDING' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('PENDING')}
            style={pendingOrders.length > 0 && filter !== 'PENDING' ? { borderColor: '#f59e0b', color: '#f59e0b' } : {}}
          >
            Pending Approval ({pendingOrders.length})
          </button>
          <button
            className={`btn btn-sm ${filter === 'CONFIRMED' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('CONFIRMED')}
          >
            Confirmed
          </button>
          <button
            className={`btn btn-sm ${filter === 'BLOCKED' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('BLOCKED')}
            style={blockedUsers.length > 0 && filter !== 'BLOCKED' ? { borderColor: '#ef4444', color: '#ef4444' } : {}}
          >
            Blocked Customers ({blockedUsers.length})
          </button>
        </div>
      </div>

      {/* ─── Orders & Transactions Table ─── */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order & Time</th>
                <th>Token</th>
                <th>Document & Specs</th>
                <th>Customer Identity (IP / MAC)</th>
                <th>Gross Paid</th>
                <th>Your Share</th>
                <th>Payment Status</th>
                <th style={{ textAlign: 'right' }}>Merchant Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--clr-text-3)' }}>
                    Loading machine transactions...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--clr-text-3)' }}>
                    No transactions match your search or filter criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order: any, idx: number) => {
                  const orderId = order.orderNumber || order.orderId || order.id || `ORD-${idx}`
                  const token = order.pickupCode || order.token || '8421'
                  const fileName = order.fileName || order.file || 'Document.pdf'
                  const mode = order.colourMode
                    ? `${order.colourMode} · ${order.duplex || 'SINGLE'}`
                    : order.mode || 'BW Standard'
                  const pages = order.pageCount || order.pages || 1
                  const copies = order.copies || 1
                  const grossAmount = order.amount !== undefined ? `₹${Number(order.amount).toFixed(2)}` : '₹2.00'
                  const cutAmount =
                    order.merchantCut !== undefined
                      ? `₹${Number(order.merchantCut).toFixed(2)}`
                      : `₹${(Number(order.amount || 2) * 0.18).toFixed(2)}`

                  const timeStr = order.createdAt
                    ? new Date(order.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Just now'

                  const isBlocked = isOrderBlocked(order)
                  const isPending =
                    order.status === 'PENDING' ||
                    order.paymentConfirmation?.status === 'PENDING' ||
                    (!order.paidAt &&
                      order.status !== 'PAID' &&
                      order.status !== 'COMPLETED' &&
                      order.status !== 'REJECTED')
                  const isConfirmed =
                    order.status === 'PAID' ||
                    order.paymentConfirmation?.status === 'CONFIRMED' ||
                    order.status === 'COMPLETED'
                  const isRejected =
                    order.status === 'REJECTED' || order.paymentConfirmation?.status === 'REJECTED'

                  const customerIp = order.customerIp || '192.168.1.114'
                  const customerMac = order.customerMac || ''
                  const customerPhone = order.customerPhone || ''

                  return (
                    <tr
                      key={orderId}
                      style={
                        isBlocked
                          ? { background: 'rgba(239, 68, 68, 0.04)' }
                          : isPending
                          ? { background: 'rgba(245, 158, 11, 0.04)' }
                          : {}
                      }
                    >
                      {/* Order & Time */}
                      <td>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--clr-text-1)' }}>
                          {orderId}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--clr-text-4)', marginTop: 2 }}>{timeStr}</div>
                      </td>

                      {/* Pickup Token */}
                      <td>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '3px 8px',
                            background: 'var(--clr-surface-2, rgba(255,255,255,0.06))',
                            borderRadius: 4,
                            color: 'var(--clr-text-1)',
                          }}
                        >
                          #{token}
                        </span>
                      </td>

                      {/* Document & Specs */}
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            color: 'var(--clr-text-1)',
                            maxWidth: 220,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontWeight: 600,
                            fontSize: 13,
                          }}
                          title={fileName}
                        >
                          <FilePdf size={16} color="#ff4d52" weight="fill" />
                          <span>{fileName}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--clr-text-3)', marginTop: 2 }}>
                          {pages} {pages === 1 ? 'page' : 'pages'} {copies > 1 ? `· ${copies} copies` : ''} · {mode}
                        </div>
                      </td>

                      {/* Customer Identity (IP / MAC) */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 12,
                              padding: '2px 6px',
                              background: 'var(--clr-surface-2, rgba(255,255,255,0.05))',
                              borderRadius: 4,
                              color: 'var(--clr-text-2)',
                            }}
                          >
                            {customerIp}
                          </span>
                          {isBlocked && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                background: '#ef4444',
                                color: '#fff',
                                padding: '1px 5px',
                                borderRadius: 4,
                                textTransform: 'uppercase',
                              }}
                            >
                              Blocked
                            </span>
                          )}
                        </div>
                        {(customerMac || customerPhone) && (
                          <div style={{ fontSize: 11, color: 'var(--clr-text-4)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                            {customerMac ? `MAC: ${customerMac}` : ''}
                            {customerMac && customerPhone ? ' · ' : ''}
                            {customerPhone ? `Ph: ${customerPhone}` : ''}
                          </div>
                        )}
                      </td>

                      {/* Gross Paid */}
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--clr-text-2)', fontSize: 13 }}>
                        {grossAmount}
                      </td>

                      {/* Merchant Share */}
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--clr-success, #10b981)', fontSize: 13 }}>
                        +{cutAmount}
                      </td>

                      {/* Payment Status */}
                      <td>
                        {isConfirmed && (
                          <span className="badge badge-online" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Check size={12} weight="bold" />
                            <span>Payment Confirmed</span>
                          </span>
                        )}
                        {isPending && (
                          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <HourglassMedium size={12} />
                            <span>Awaiting Confirmation</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="badge" style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <XCircle size={12} />
                            <span>Rejected</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {/* Payment Confirmation Action */}
                          {isPending && (
                            <>
                              <button
                                className="btn btn-sm btn-primary"
                                style={{
                                  background: 'var(--clr-success, #10b981)',
                                  borderColor: 'var(--clr-success, #10b981)',
                                  fontSize: 11,
                                  padding: '4px 10px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                                onClick={() => handleAcceptPayment(order)}
                                title="Mark user payment confirmed and allow print"
                              >
                                <Check size={14} weight="bold" />
                                <span>Accept Payment</span>
                              </button>
                              <button
                                className="btn btn-sm btn-secondary"
                                style={{
                                  fontSize: 11,
                                  padding: '4px 8px',
                                  color: '#f87171',
                                }}
                                onClick={() => handleRejectPayment(order)}
                                title="Reject unreceived payment"
                              >
                                <XCircle size={14} />
                              </button>
                            </>
                          )}

                          {/* Block / Allow Customer Action */}
                          {isBlocked ? (
                            <button
                              className="btn btn-sm btn-secondary"
                              style={{
                                fontSize: 11,
                                padding: '4px 8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                borderColor: 'var(--clr-success, #10b981)',
                                color: 'var(--clr-success, #10b981)',
                              }}
                              onClick={() => handleUnblockUser(customerIp, customerMac)}
                              title="Unblock this user and restore machine access"
                            >
                              <ShieldCheck size={14} weight="bold" />
                              <span>Allow User</span>
                            </button>
                          ) : (
                            <button
                              className="btn btn-sm btn-secondary"
                              style={{
                                fontSize: 11,
                                padding: '4px 8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                color: '#f87171',
                              }}
                              onClick={() => handleOpenBlockModal(order)}
                              title="Block this user IP from using this machine again"
                            >
                              <UserMinus size={14} weight="bold" />
                              <span>Block IP</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Machine Access Blocklist Section ─── */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Prohibit size={18} color="#ef4444" weight="bold" />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--clr-text-1)', margin: 0 }}>
                Machine Access Blocklist ({blockedUsers.length} Banned)
              </h2>
            </div>
            <p style={{ fontSize: 12, color: 'var(--clr-text-3)', margin: '4px 0 0' }}>
              Enforced by IP and MAC address filtering. Blocked devices are denied access from uploading files or printing at Machine {activeKioskId}.
            </p>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleOpenManualBlock}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <PlusCircle size={15} />
            <span>Block Another IP / Device</span>
          </button>
        </div>

        {blockedUsers.length === 0 ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              background: 'var(--clr-surface-2, rgba(255,255,255,0.02))',
              borderRadius: 'var(--radius-md, 8px)',
              border: '1px dashed var(--clr-border, rgba(255,255,255,0.1))',
              color: 'var(--clr-text-3)',
              fontSize: 13,
            }}
          >
            No customers are currently blocked on this machine. All users on the venue / campus network have normal access.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Target IP / Host</th>
                  <th>MAC Address</th>
                  <th>Ban Date</th>
                  <th>Reason</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {blockedUsers.map((b, idx) => (
                  <tr key={b.id || b._id || `${b.ip}-${idx}`}>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          color: '#f87171',
                          fontWeight: 700,
                          padding: '2px 6px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          borderRadius: 4,
                        }}
                      >
                        {b.ip || 'Any IP (MAC Match)'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--clr-text-3)' }}>
                      {b.mac || '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--clr-text-4)' }}>
                      {b.createdAt ? new Date(b.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Active'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--clr-text-2)' }}>{b.reason || 'Blocked by merchant partner'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{
                          fontSize: 11,
                          padding: '3px 10px',
                          color: 'var(--clr-success, #10b981)',
                          borderColor: 'var(--clr-success, #10b981)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        onClick={() => handleUnblockUser(b.ip, b.mac)}
                      >
                        <ShieldCheck size={13} weight="bold" />
                        <span>Allow User</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Modal: Block Customer From Machine ─── */}
      {blockModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            padding: 16,
          }}
          onClick={() => setBlockModalOpen(false)}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: 520,
              background: 'var(--clr-bg-800, #111827)',
              border: '1px solid var(--clr-border-strong, rgba(255,255,255,0.15))',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ef4444', marginBottom: 12 }}>
              <UserMinus size={24} weight="fill" />
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--clr-text-1)' }}>
                Block Customer from Machine?
              </h2>
            </div>

            <p style={{ fontSize: 13, color: 'var(--clr-text-3)', lineHeight: 1.5, marginBottom: 16 }}>
              {targetOrderForBlock ? (
                <>
                  Blocking customer for Order <strong>#{targetOrderForBlock.orderNumber || targetOrderForBlock.orderId}</strong> ({targetOrderForBlock.fileName}).
                  This will ban their device from Station <strong style={{ color: 'var(--clr-text-1)' }}>{activeKioskId}</strong>.
                </>
              ) : (
                <>
                  This will block the customer's device from creating print orders or executing jobs on Station{' '}
                  <strong style={{ color: 'var(--clr-text-1)' }}>{activeKioskId}</strong>.
                </>
              )}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--clr-text-2)', marginBottom: 6 }}>
                  Customer IP Address
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 192.168.1.114 or 49.36.120.44"
                  value={customIp}
                  onChange={(e) => setCustomIp(e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--clr-text-2)', marginBottom: 6 }}>
                  Device MAC Address (Optional)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 00:1A:2B:3C:4D:5E"
                  value={customMac}
                  onChange={(e) => setCustomMac(e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--clr-text-2)', marginBottom: 6 }}>
                  Reason for Ban
                </label>
                <select
                  className="form-input"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  style={{ marginBottom: 8 }}
                >
                  <option value="Non-payment / Unverified payment claim">Non-payment / Unverified payment claim</option>
                  <option value="Spam / Rapid automated print attempts">Spam / Rapid automated print attempts</option>
                  <option value="Paper waste / Intentional machine jamming">Paper waste / Intentional machine jamming</option>
                  <option value="Disruptive on-site behavior">Disruptive on-site behavior</option>
                  <option value="Other / Merchant discretion">Other / Merchant discretion</option>
                </select>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Or enter custom reason..."
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setBlockModalOpen(false)}
                disabled={isSubmittingBlock}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
                onClick={handleConfirmBlock}
                disabled={isSubmittingBlock}
              >
                {isSubmittingBlock ? 'Enforcing Block...' : 'Confirm & Block User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
