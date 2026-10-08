import { useState, useEffect } from 'react'
import { getAdminOrders } from '@/lib/api'
import './AdminPage.css'

const statusColors: Record<string, string> = {
  COMPLETED: 'badge-online',
  PRINTING: 'badge-info',
  QUEUED: 'badge-warning',
  WAITING: 'badge-neutral',
  PAID: 'badge-online',
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function loadOrders() {
      setLoading(true)
      const data = await getAdminOrders(100)
      if (mounted && Array.isArray(data)) {
        setOrders(data)
      }
      if (mounted) setLoading(false)
    }
    loadOrders()
    return () => { mounted = false }
  }, [])

  return (
    <div className="admin-page animate-fadeInUp">
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="badge badge-online">Print Transactions</span>
            <span style={{ fontSize: 13, color: 'var(--clr-text-3)' }}>{orders.length} Records</span>
          </div>
          <h1 className="admin-page__title">Live Orders Fleet</h1>
          <p className="admin-page__sub">Real-time print transactions directly synchronized across the network</p>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Kiosk</th>
                <th>Document</th>
                <th>Customer IP</th>
                <th>Pages</th>
                <th>Mode</th>
                <th>Gross Total</th>
                <th>Store Revenue (100%)</th>
                <th>Status</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: 'var(--clr-text-3)' }}>
                    Loading print orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: 'var(--clr-text-3)' }}>
                    No print orders recorded yet. Walk-up orders from kiosks will appear here live.
                  </td>
                </tr>
              ) : (
                orders.map((o: any) => (
                  <tr key={o._id || o.orderId} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--clr-accent-light)' }}>
                      {o.orderId}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {o.kioskId}
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--clr-text-1)' }}>
                      {o.fileName}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--clr-text-2)' }}>
                      {o.customerIp || '—'}
                    </td>
                    <td>
                      {o.pageCount || 1} {o.copies > 1 ? `(${o.copies} copies)` : ''}
                    </td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                        {o.colourMode || 'BW'} · {o.duplex || 'SINGLE'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--clr-text-1)' }}>
                      ₹{(Number(o.amount) || 0).toFixed(2)}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--clr-success)', fontWeight: 600 }}>
                      ₹{(Number(o.amount || o.merchantCut) || 0).toFixed(2)}
                    </td>
                    <td>
                      <span className={`badge ${statusColors[o.status] ?? 'badge-online'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {o.createdAt ? new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
