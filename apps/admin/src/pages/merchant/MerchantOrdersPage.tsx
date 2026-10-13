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
  Copy,
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
  const { activeKioskId, activeMerchant, merchantKiosks } = useActiveMerchant()
  const [selectedKiosk, setSelectedKiosk] = useState<string>('ALL')
  const [orders, setOrders] = useState<any[]>([])
  const [blockedUsers, setBlockedUsers] = useState<BlockedRecord[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'CONFIRMED' | 'BLOCKED'>('ALL')
  const [loading, setLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null)

  // Computed list of unique accessible kiosks
  const availableKiosks = Array.from(
    new Set([
      'PB-001',
      'PB-002',
      ...(merchantKiosks?.map((k: any) => k.kioskId || k.id).filter(Boolean) || []),
      ...(activeKioskId ? [activeKioskId] : []),
    ])
  )

  // Block modal state
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [targetOrderForBlock, setTargetOrderForBlock] = useState<any | null>(null)
  const [customIp, setCustomIp] = useState('')
  const [customMac, setCustomMac] = useState('')
  const [banReason, setBanReason] = useState('Non-payment / Unverified payment claim')
  const [isSubmittingBlock, setIsSubmittingBlock] = useState(false)

  // Payment Details modal state
  const [selectedPaymentOrder, setSelectedPaymentOrder] = useState<any | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showRawJson, setShowRawJson] = useState(false)

  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const showToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setActionMsg({ text, type })
    setTimeout(() => {
      setActionMsg(null)
    }, 4500)
  }, [])

  const loadData = useCallback(async (force = false) => {
    setLoading(true)
    try {
      const targetQuery = selectedKiosk || 'ALL'
      const blockQuery = targetQuery === 'ALL' ? (activeKioskId || 'PB-001') : targetQuery
      const [orderList, blockedList] = await Promise.all([
        getMerchantOrders(targetQuery, force),
        getMerchantBlockedUsers(blockQuery),
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
  }, [selectedKiosk, activeKioskId])

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
    const orderId = order.orderId || order.orderNumber || order._id || order.id
    const targetKiosk = order.kioskId || activeKioskId || 'PB-001'
    try {
      await confirmMerchantOrder(orderId, targetKiosk)
      // Update local state immediately
      setOrders((prev) =>
        prev.map((o) => {
          const match =
            (o.orderId && (o.orderId === orderId || o.orderId === order.orderId)) ||
            (o.orderNumber && (o.orderNumber === orderId || o.orderNumber === order.orderNumber)) ||
            (o._id && (String(o._id) === String(orderId) || String(o._id) === String(order._id))) ||
            (o.id && (o.id === orderId || o.id === order.id))
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
      loadData(true)
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to confirm payment', 'error')
    }
  }

  // Reject unverified payment
  const handleRejectPayment = async (order: any) => {
    const orderId = order.orderId || order.orderNumber || order._id || order.id
    const targetKiosk = order.kioskId || activeKioskId || 'PB-001'
    if (!window.confirm(`Reject payment confirmation for Order #${order.orderNumber || orderId}?`)) {
      return
    }
    try {
      await rejectMerchantOrder(orderId, targetKiosk)
      setOrders((prev) =>
        prev.map((o) => {
          const match =
            (o.orderId && (o.orderId === orderId || o.orderId === order.orderId)) ||
            (o.orderNumber && (o.orderNumber === orderId || o.orderNumber === order.orderNumber)) ||
            (o._id && (String(o._id) === String(orderId) || String(o._id) === String(order._id))) ||
            (o.id && (o.id === orderId || o.id === order.id))
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
      loadData(true)
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to reject payment', 'error')
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
    const targetKiosk = targetOrderForBlock?.kioskId || (selectedKiosk !== 'ALL' ? selectedKiosk : activeKioskId) || 'PB-001'
    try {
      const res = await blockMerchantUser({
        kioskId: targetKiosk,
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

      showToast(`User (${ip || mac}) is blocked from using Machine ${targetKiosk}.`, 'success')
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
    const targetKiosk = (selectedKiosk !== 'ALL' ? selectedKiosk : activeKioskId) || 'PB-001'
    if (!window.confirm(`Lift ban and allow ${identifier} to use Machine ${targetKiosk} again?`)) {
      return
    }

    try {
      await unblockMerchantUser({
        kioskId: targetKiosk,
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
        <div className="admin-page__header" style={{ minWidth: 0, maxWidth: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span className="badge badge-info" style={{ whiteSpace: 'nowrap' }}>Store Activity & Access Control</span>
            <span style={{ fontSize: 13, color: 'var(--clr-text-3)', wordBreak: 'break-word' }}>
              {selectedKiosk === 'ALL' ? 'All Machine Stations' : `Station ${selectedKiosk}`} • {activeMerchant?.storeName || 'Campus Partner Hub'}
            </span>
          </div>
          <h1 className="admin-page__title" style={{ wordBreak: 'break-word' }}>Store Orders</h1>
          <p className="admin-page__sub" style={{ wordBreak: 'break-word' }}>
            Review every customer print order for your machines, verify cash/UPI payments, and allow or ban customer IPs and devices.
          </p>
        </div>

        <div className="page-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleOpenManualBlock}
            id="manual-block-user-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            <Prohibit size={16} color="#ef4444" />
            <span>Block IP / Device</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => loadData(true)}
            title="Refresh order records"
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            <span>↻ Refresh</span>
          </button>
        </div>
      </div>

      {/* ─── Station / Machine Filter Pills ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          background: 'var(--clr-surface-2, rgba(255,255,255,0.03))',
          padding: '10px 14px',
          borderRadius: 'var(--radius-md, 8px)',
          border: '1px solid var(--clr-border, rgba(255,255,255,0.08))',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 4 }}>
          Machine Station:
        </span>
        <button
          type="button"
          className={`btn btn-sm ${selectedKiosk === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSelectedKiosk('ALL')}
          style={{ fontSize: 12, padding: '4px 12px', whiteSpace: 'nowrap' }}
        >
          All Stations (Storewide)
        </button>
        {availableKiosks.map((kid) => (
          <button
            key={kid}
            type="button"
            className={`btn btn-sm ${selectedKiosk === kid ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedKiosk(kid)}
            style={{ fontSize: 12, padding: '4px 12px', whiteSpace: 'nowrap' }}
          >
            Station {kid}
          </button>
        ))}
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
            wordBreak: 'break-word',
          }}
        >
          {actionMsg.type === 'success' ? (
            <CheckCircle size={18} color="var(--clr-success, #10b981)" style={{ flexShrink: 0 }} />
          ) : actionMsg.type === 'error' ? (
            <XCircle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
          ) : (
            <WarningCircle size={18} color="#3b82f6" style={{ flexShrink: 0 }} />
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
          <div className="stat-card__sub" style={{ wordBreak: 'break-word' }}>
            {selectedKiosk === 'ALL' ? 'Storewide print order volume across all kiosks' : `All recorded print orders for Machine ${selectedKiosk}`}
          </div>
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
          <div className="stat-card__sub" style={{ wordBreak: 'break-word' }}>
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
          <div className="stat-card__sub" style={{ wordBreak: 'break-word' }}>
            Earned directly for {selectedKiosk === 'ALL' ? 'all store stations' : `Machine ${selectedKiosk}`}
          </div>
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
          <div className="stat-card__sub" style={{ wordBreak: 'break-word' }}>
            Banned IPs / devices on {selectedKiosk === 'ALL' ? 'store stations' : `Machine ${selectedKiosk}`}
          </div>
        </div>
      </div>

      {/* ─── Search & Filters Bar ─── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 'min(100%, 240px)' }}>
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
            style={{ paddingLeft: 36, width: '100%', boxSizing: 'border-box' }}
            placeholder="Search by Order #, Document, Token, Customer IP, or Phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${filter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('ALL')}
            style={{ whiteSpace: 'nowrap' }}
          >
            All ({orders.length})
          </button>
          <button
            className={`btn btn-sm ${filter === 'PENDING' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('PENDING')}
            style={{
              whiteSpace: 'nowrap',
              ...(pendingOrders.length > 0 && filter !== 'PENDING' ? { borderColor: '#f59e0b', color: '#f59e0b' } : {}),
            }}
          >
            Pending Approval ({pendingOrders.length})
          </button>
          <button
            className={`btn btn-sm ${filter === 'CONFIRMED' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('CONFIRMED')}
            style={{ whiteSpace: 'nowrap' }}
          >
            Confirmed
          </button>
          <button
            className={`btn btn-sm ${filter === 'BLOCKED' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('BLOCKED')}
            style={{
              whiteSpace: 'nowrap',
              ...(blockedUsers.length > 0 && filter !== 'BLOCKED' ? { borderColor: '#ef4444', color: '#ef4444' } : {}),
            }}
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
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--clr-text-1)' }}>
                            {orderId}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              background: 'var(--clr-surface-2, rgba(255,255,255,0.06))',
                              border: '1px solid var(--clr-border, rgba(255,255,255,0.08))',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            {order.kioskId || 'PB-001'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--clr-text-4)', marginTop: 2 }}>{timeStr}</div>
                      </td>

                      {/* Pickup Token */}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '3px 8px',
                            background: 'var(--clr-surface-2, rgba(255,255,255,0.06))',
                            borderRadius: 4,
                            color: 'var(--clr-text-1)',
                            whiteSpace: 'nowrap',
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
                            maxWidth: 'clamp(140px, 20vw, 240px)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontWeight: 600,
                            fontSize: 13,
                          }}
                          title={fileName}
                        >
                          <FilePdf size={16} color="#ff4d52" weight="fill" style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--clr-text-3)', marginTop: 2, whiteSpace: 'nowrap' }}>
                          {pages} {pages === 1 ? 'page' : 'pages'} {copies > 1 ? `· ${copies} copies` : ''} · {mode}
                        </div>
                      </td>

                      {/* Customer Identity (IP / MAC) */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 12,
                              padding: '2px 6px',
                              background: 'var(--clr-surface-2, rgba(255,255,255,0.05))',
                              borderRadius: 4,
                              color: 'var(--clr-text-2)',
                              whiteSpace: 'nowrap',
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
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Blocked
                            </span>
                          )}
                        </div>
                        {(customerMac || customerPhone) && (
                          <div style={{ fontSize: 11, color: 'var(--clr-text-4)', marginTop: 2, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                            {customerMac ? `MAC: ${customerMac}` : ''}
                            {customerMac && customerPhone ? ' · ' : ''}
                            {customerPhone ? `Ph: ${customerPhone}` : ''}
                          </div>
                        )}
                      </td>

                      {/* Gross Paid */}
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--clr-text-2)', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {grossAmount}
                      </td>

                      {/* Merchant Share */}
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--clr-success, #10b981)', fontSize: 13, whiteSpace: 'nowrap' }}>
                        +{cutAmount}
                      </td>

                      {/* Payment Status */}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {isConfirmed && (
                          <div>
                            <span className="badge badge-online" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                              <Check size={12} weight="bold" />
                              <span>Payment Confirmed</span>
                            </span>
                            {order.paymentDetails?.bankReferenceNo && (
                              <div style={{ marginTop: 4 }}>
                                <button
                                  type="button"
                                  className="btn btn-xs"
                                  style={{
                                    background: 'rgba(56, 189, 248, 0.12)',
                                    color: '#38bdf8',
                                    border: '1px solid rgba(56, 189, 248, 0.25)',
                                    padding: '2px 7px',
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    cursor: 'pointer',
                                  }}
                                  onClick={() => setSelectedPaymentOrder(order)}
                                  title="Click to view full UPI verification details"
                                >
                                  <Receipt size={11} weight="bold" />
                                  <span>UTR: {order.paymentDetails.bankReferenceNo}</span>
                                </button>
                              </div>
                            )}
                            {order.paymentDetails?.payerName && (
                              <div style={{ fontSize: 10, color: 'var(--clr-text-3)', marginTop: 2 }}>
                                {order.paymentDetails.payerName} {order.paymentDetails.payerHandle ? `(${order.paymentDetails.payerHandle})` : ''}
                              </div>
                            )}
                          </div>
                        )}
                        {isPending && (
                          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                            <HourglassMedium size={12} />
                            <span>Awaiting Confirmation</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="badge" style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                            <XCircle size={12} />
                            <span>Rejected</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {/* View Payment Details / Proof */}
                          <button
                            className="btn btn-sm btn-secondary"
                            style={{
                              fontSize: 11,
                              padding: '4px 8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              color: '#38bdf8',
                              borderColor: 'rgba(56, 189, 248, 0.3)',
                            }}
                            onClick={() => setSelectedPaymentOrder(order)}
                            title="View full transaction proof & bank response"
                          >
                            <Receipt size={14} weight="bold" />
                            <span>Details</span>
                          </button>

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ minWidth: 0, maxWidth: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Prohibit size={18} color="#ef4444" weight="bold" />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--clr-text-1)', margin: 0, wordBreak: 'break-word' }}>
                Machine Access Blocklist ({blockedUsers.length} Banned)
              </h2>
            </div>
            <p style={{ fontSize: 12, color: 'var(--clr-text-3)', margin: '4px 0 0', wordBreak: 'break-word' }}>
              Enforced by IP and MAC address filtering. Blocked devices are denied access from uploading files or printing at Machine {selectedKiosk === 'ALL' ? 'fleet stations' : selectedKiosk}.
            </p>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleOpenManualBlock}
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
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
              maxWidth: 'min(520px, calc(100vw - 32px))',
              background: 'var(--clr-bg-800, #111827)',
              border: '1px solid var(--clr-border-strong, rgba(255,255,255,0.15))',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              padding: 'clamp(16px, 4vw, 24px)',
              boxSizing: 'border-box',
              maxHeight: 'calc(100vh - 40px)',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ef4444', marginBottom: 12 }}>
              <UserMinus size={24} weight="fill" style={{ flexShrink: 0 }} />
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--clr-text-1)', wordBreak: 'break-word' }}>
                Block Customer from Machine?
              </h2>
            </div>

            <p style={{ fontSize: 13, color: 'var(--clr-text-3)', lineHeight: 1.5, marginBottom: 16, wordBreak: 'break-word' }}>
              {targetOrderForBlock ? (
                <>
                  Blocking customer for Order <strong>#{targetOrderForBlock.orderNumber || targetOrderForBlock.orderId}</strong> ({targetOrderForBlock.fileName}).
                  This will ban their device from Station <strong style={{ color: 'var(--clr-text-1)' }}>{targetOrderForBlock.kioskId || activeKioskId}</strong>.
                </>
              ) : (
                <>
                  This will block the customer's device from creating print orders or executing jobs on Station{' '}
                  <strong style={{ color: 'var(--clr-text-1)' }}>{selectedKiosk === 'ALL' ? activeKioskId : selectedKiosk}</strong>.
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

      {/* ─── Modal: UPI Payment Verification & Full Transaction Details ─── */}
      {selectedPaymentOrder && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.82)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 130,
            padding: 16,
          }}
          onClick={() => setSelectedPaymentOrder(null)}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: 'min(640px, calc(100vw - 32px))',
              background: '#0c121e',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9)',
              padding: 'clamp(18px, 4vw, 28px)',
              boxSizing: 'border-box',
              maxHeight: 'calc(100vh - 40px)',
              overflowY: 'auto',
              borderRadius: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2))',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#10b981',
                    flexShrink: 0,
                  }}
                >
                  <Receipt size={22} weight="duotone" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--clr-text-1)' }}>
                      UPI Payment Proof & Verification
                    </h2>
                    <span
                      className="badge badge-online"
                      style={{ fontSize: 11, padding: '2px 8px', textTransform: 'uppercase' }}
                    >
                      {selectedPaymentOrder.paymentDetails?.rawStatus || selectedPaymentOrder.status || 'Verified'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--clr-text-3)', margin: '2px 0 0' }}>
                    BharatPe / UPIExpress Real-time Webhook Verification Proof
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 10px', fontSize: 13 }}
                onClick={() => setSelectedPaymentOrder(null)}
              >
                ✕ Close
              </button>
            </div>

            {/* Financial Overview Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 8,
                  padding: '12px 14px',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--clr-text-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Gross Paid
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  ₹{Number(selectedPaymentOrder.amount || selectedPaymentOrder.paymentDetails?.amount || 0).toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--clr-text-3)', marginTop: 2 }}>
                  Convenience Fee: ₹{Number(selectedPaymentOrder.paymentDetails?.convenienceFee || 0).toFixed(2)}
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 8,
                  padding: '12px 14px',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--clr-text-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Payer Identity
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-1)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedPaymentOrder.paymentDetails?.payerName || selectedPaymentOrder.customerName || 'Verified Payer'}
                </div>
                <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 2 }}>
                  App: {selectedPaymentOrder.paymentDetails?.payerHandle || 'UPI / BHIM'}
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 8,
                  padding: '12px 14px',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--clr-text-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Bank UTR / Ref (RRN)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                    {selectedPaymentOrder.paymentDetails?.bankReferenceNo || selectedPaymentOrder.paymentDetails?.upiTxnId || '—'}
                  </span>
                  {(selectedPaymentOrder.paymentDetails?.bankReferenceNo || selectedPaymentOrder.paymentDetails?.upiTxnId) && (
                    <button
                      type="button"
                      onClick={() => handleCopyText(selectedPaymentOrder.paymentDetails?.bankReferenceNo || selectedPaymentOrder.paymentDetails?.upiTxnId, 'utr')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: copiedKey === 'utr' ? '#10b981' : 'var(--clr-text-4)',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                      title="Copy UTR"
                    >
                      {copiedKey === 'utr' ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--clr-text-4)', marginTop: 2 }}>
                  Verified by BharatPe Switch
                </div>
              </div>
            </div>

            {/* Detailed Transaction Info List */}
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 8,
                overflow: 'hidden',
                marginBottom: 20,
              }}
            >
              {[
                { label: 'Order ID (Client Txn)', value: selectedPaymentOrder.orderNumber || selectedPaymentOrder.orderId, copyKey: 'orderId' },
                { label: 'Pickup Token', value: `#${selectedPaymentOrder.pickupCode || selectedPaymentOrder.token || '—'}` },
                { label: 'Machine Station', value: selectedPaymentOrder.kioskId || activeKioskId || 'PB-001' },
                { label: 'Payer Full Name', value: selectedPaymentOrder.paymentDetails?.payerName || '—' },
                { label: 'UPI Handle / Payer App', value: selectedPaymentOrder.paymentDetails?.payerHandle || '—' },
                { label: 'Bank Reference No (RRN)', value: selectedPaymentOrder.paymentDetails?.bankReferenceNo || '—', copyKey: 'bankRef' },
                { label: 'Internal Bank UTR', value: selectedPaymentOrder.paymentDetails?.internalUtr || '—', copyKey: 'internalUtr' },
                { label: 'Merchant VPA / Payee Identifier', value: selectedPaymentOrder.paymentDetails?.payeeIdentifier || '—', copyKey: 'payee' },
                { label: 'UPI Express Order ID', value: selectedPaymentOrder.paymentDetails?.gatewayOrderId || '—', copyKey: 'gatewayOrderId' },
                { label: 'Gateway Txn ID', value: selectedPaymentOrder.paymentDetails?.gatewayTxnId || '—', copyKey: 'gatewayTxnId' },
                { label: 'Merchant Txn ID', value: selectedPaymentOrder.paymentDetails?.merchantTxnId || '—', copyKey: 'merchantTxnId' },
                { label: 'Customer Mobile', value: selectedPaymentOrder.customerPhone || selectedPaymentOrder.paymentDetails?.customerMobile || '—' },
                { label: 'Customer Email', value: selectedPaymentOrder.customerEmail || selectedPaymentOrder.paymentDetails?.customerEmail || '—' },
                { label: 'Customer IP Address', value: selectedPaymentOrder.customerIp || '—' },
                { label: 'Transaction Type', value: selectedPaymentOrder.paymentDetails?.txnSubType || 'SALE_P2PM' },
                {
                  label: 'Payment Timestamp',
                  value: selectedPaymentOrder.paymentDetails?.paymentTimestamp
                    ? new Date(selectedPaymentOrder.paymentDetails.paymentTimestamp).toLocaleString()
                    : (selectedPaymentOrder.paidAt ? new Date(selectedPaymentOrder.paidAt).toLocaleString() : '—'),
                },
              ].map((row, rIdx) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 14px',
                    fontSize: 12,
                    borderBottom: rIdx < 15 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                    background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)',
                  }}
                >
                  <span style={{ color: 'var(--clr-text-3)', fontWeight: 500 }}>{row.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--clr-text-1)' }}>
                      {row.value}
                    </span>
                    {row.copyKey && row.value && row.value !== '—' && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(String(row.value), row.copyKey!)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copiedKey === row.copyKey ? '#10b981' : 'var(--clr-text-4)',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                        title={`Copy ${row.label}`}
                      >
                        {copiedKey === row.copyKey ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Collapsible Raw Bank / Webhook JSON Inspector */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => setShowRawJson(!showRawJson)}
                >
                  <span>{showRawJson ? '▼ Hide Raw Webhook Response' : '▶ View Full Raw Webhook JSON'}</span>
                </button>

                {showRawJson && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: 11, padding: '4px 8px' }}
                    onClick={() =>
                      handleCopyText(
                        JSON.stringify(
                          selectedPaymentOrder.paymentDetails?.rawResponse || selectedPaymentOrder.paymentDetails || selectedPaymentOrder,
                          null,
                          2
                        ),
                        'rawJson'
                      )
                    }
                  >
                    {copiedKey === 'rawJson' ? '✓ Copied' : 'Copy JSON'}
                  </button>
                )}
              </div>

              {showRawJson && (
                <pre
                  style={{
                    background: '#040711',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    padding: 12,
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: '#93c5fd',
                    overflowX: 'auto',
                    maxHeight: 240,
                    margin: 0,
                    lineHeight: 1.45,
                  }}
                >
                  {JSON.stringify(
                    selectedPaymentOrder.paymentDetails?.rawResponse || selectedPaymentOrder.paymentDetails || selectedPaymentOrder,
                    null,
                    2
                  )}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
