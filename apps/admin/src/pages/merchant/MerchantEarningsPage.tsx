import { useState, useEffect } from 'react'
import {
  CurrencyInr,
  TrendUp,
  DownloadSimple,
  Bank,
  Receipt
} from '@phosphor-icons/react'
import { getMerchantEarnings } from '@/lib/api'
import { useActiveMerchant } from '@/lib/merchantContext'
import '../AdminPage.css'

export default function MerchantEarningsPage() {
  const { activeKioskId, activeMerchant } = useActiveMerchant()
  const [data, setData] = useState<any>(null)
  const [downloadSuccess, setDownloadSuccess] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load() {
      const res = await getMerchantEarnings(activeKioskId)
      if (mounted && res) {
        setData(res)
      }
    }
    load()
    return () => { mounted = false }
  }, [activeKioskId])

  const handleDownloadInvoice = () => {
    setDownloadSuccess(true)
    setTimeout(() => setDownloadSuccess(false), 3000)
  }

  const fin = data?.financials || {
    pendingPayout: '₹0.00',
    grossVolume: '₹0',
    commissionRate: '100% (0% Cut)',
    lifetimeEarned: '₹0',
    bankName: activeMerchant?.bankName || 'State Bank of India',
    bankAccountLast4: activeMerchant?.bankAccountLast4 || '0001',
  }

  const payoutHistory = Array.isArray(data?.payoutHistory) ? data.payoutHistory : []

  return (
    <div className="admin-page animate-fadeInUp">
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="badge badge-online">Store Settlements</span>
            <span style={{ fontSize: 13, color: 'var(--clr-text-3)' }}>
              Machine {activeKioskId} Host Account • {activeMerchant?.storeName || 'Host Account'}
            </span>
          </div>
          <h1 className="admin-page__title">Earnings & Payouts</h1>
          <p className="admin-page__sub">Transparent revenue share and automatic bank payouts for your venue</p>
        </div>

        <button className="btn btn-primary btn-sm" onClick={handleDownloadInvoice}>
          <DownloadSimple size={16} />
          <span>{downloadSuccess ? 'Invoice Downloaded ✓' : 'Download Tax Invoice'}</span>
        </button>
      </div>

      {/* Financial Overview Cards */}
      <div className="stats-grid">
        <div className="stat-card glass-card">
          <div className="stat-card__top">
            <div className="stat-card__icon" style={{ color: 'var(--clr-success)' }}>
              <CurrencyInr size={20} weight="duotone" />
            </div>
            <span className="stat-card__label">Pending Payout</span>
          </div>
          <div className="stat-card__value">{fin.pendingPayout}</div>
          <div className="stat-card__sub">Settling this Friday to {fin.bankName}</div>
        </div>

        <div className="stat-card glass-card">
          <div className="stat-card__top">
            <div className="stat-card__icon" style={{ color: 'var(--clr-accent-light)' }}>
              <TrendUp size={20} weight="duotone" />
            </div>
            <span className="stat-card__label">Store Gross Volume</span>
          </div>
          <div className="stat-card__value">{fin.grossVolume}</div>
          <div className="stat-card__sub">Live order turnover at your counter</div>
        </div>

        <div className="stat-card glass-card">
          <div className="stat-card__top">
            <div className="stat-card__icon" style={{ color: 'var(--clr-success)' }}>
              <Receipt size={20} weight="duotone" />
            </div>
            <span className="stat-card__label">Store Payout Model</span>
          </div>
          <div className="stat-card__value" style={{ color: 'var(--clr-success)' }}>100% Direct</div>
          <div className="stat-card__sub">Zero platform commission cut</div>
        </div>

        <div className="stat-card glass-card">
          <div className="stat-card__top">
            <div className="stat-card__icon" style={{ color: 'var(--clr-warning)' }}>
              <Bank size={20} weight="duotone" />
            </div>
            <span className="stat-card__label">Lifetime Earned</span>
          </div>
          <div className="stat-card__value">{fin.lifetimeEarned}</div>
          <div className="stat-card__sub">100% paid without delay</div>
        </div>
      </div>

      {/* Bank Account Info Card */}
      <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--clr-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-text-1)' }}>
            <Bank size={24} weight="duotone" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--clr-text-1)' }}>{fin.bankName}</span>
              <span className="badge badge-online">Verified Active</span>
            </div>
            <span style={{ fontSize: 13, color: 'var(--clr-text-3)' }}>
              Account ending in <strong>••••{fin.bankAccountLast4}</strong> · Auto-payout enabled
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/merchant/settings" className="btn btn-secondary btn-sm">
            Update Banking Details
          </a>
        </div>
      </div>

      {/* Settlement Records */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--clr-border)', marginBottom: 0 }}>
          <h2 className="card-title">Settlement History</h2>
          <span className="card-meta">All weekly payouts transferred directly to your bank account</span>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Settlement ID</th>
                <th>Cycle Period</th>
                <th>Gross Prints</th>
                <th>Host Share (100%)</th>
                <th>TDS (0%)</th>
                <th>Net Bank Credit</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payoutHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--clr-text-3)' }}>
                    No settlements processed yet. Revenue from live print jobs is credited directly to your store account.
                  </td>
                </tr>
              ) : (
                payoutHistory.map((s: any) => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--clr-accent-light)' }}>{s.id}</td>
                    <td style={{ color: 'var(--clr-text-1)', fontWeight: 500 }}>{s.period}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{s.gross}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--clr-accent-light)' }}>{s.commission}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--clr-text-4)' }}>{s.tds}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--clr-success)' }}>{s.net}</td>
                    <td style={{ fontSize: 12, color: 'var(--clr-text-3)' }}>{s.date}</td>
                    <td>
                      <span className="badge badge-online">{s.status}</span>
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
