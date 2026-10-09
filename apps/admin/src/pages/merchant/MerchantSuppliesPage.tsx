import { useState, useEffect } from 'react'
import {
  Package,
  CheckCircle,
  Truck,
  Printer,
  Plus
} from '@phosphor-icons/react'
import { getMerchantSupplies, postPaperRefill } from '@/lib/api'
import { useActiveMerchant } from '@/lib/merchantContext'
import '../AdminPage.css'

export default function MerchantSuppliesPage() {
  const { activeKioskId } = useActiveMerchant()
  const [supplies, setSupplies] = useState<any>(null)
  const [orderedItem, setOrderedItem] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      const data = await getMerchantSupplies(activeKioskId)
      if (mounted && data) {
        setSupplies(data)
      }
    }
    load()
    return () => { mounted = false }
  }, [activeKioskId])

  const handleQuickOrder = async (name: string) => {
    setOrderedItem(name)
    await postPaperRefill(activeKioskId, `Refill requested: ${name}`)
    setTimeout(() => setOrderedItem(null), 3500)
  }

  const paperLevel = supplies?.paperLevel ?? 0
  const tonerLevel = supplies?.tonerLevel ?? 0
  const isOnline = supplies?.status === 'ONLINE' && (supplies?.isOnline !== false)
  const printerModel = supplies?.printerModel || 'Laser Print Engine'

  const inventoryItems = [
    {
      id: 'SUP-01',
      item: 'A4 Premium 75GSM Paper (Tray 1)',
      onHand: isOnline ? `${paperLevel}% Remaining` : '0% · Sensor Offline',
      minRecommended: '20% Minimum',
      status: isOnline ? (paperLevel > 20 ? 'Adequate' : 'Low Stock') : 'Disconnected',
      badgeClass: isOnline && paperLevel > 20 ? 'badge-online' : 'badge-danger',
      detail: isOnline ? `${printerModel} tray sensor telemetry` : 'Hardware disconnected · No telemetry',
    },
    {
      id: 'SUP-02',
      item: 'Enterprise High-Yield Toner',
      onHand: isOnline ? `${tonerLevel}% Remaining` : '0% · Sensor Offline',
      minRecommended: '15% Minimum',
      status: isOnline ? (tonerLevel > 20 ? 'Adequate' : 'Low Toner') : 'Disconnected',
      badgeClass: isOnline && tonerLevel > 20 ? 'badge-online' : 'badge-danger',
      detail: isOnline ? 'Smart chip odometer reading' : 'Hardware disconnected · No telemetry',
    },
    {
      id: 'SUP-03',
      item: 'PrintBooth QR Standee & Counter Stickers',
      onHand: '1 Set',
      minRecommended: '1 Set',
      status: 'Active',
      badgeClass: 'badge-online',
      detail: 'Placed on shop counter',
    },
  ]

  return (
    <div className="admin-page animate-fadeInUp">
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="badge badge-info">Zero-Cost Consumables</span>
            <span style={{ fontSize: 13, color: 'var(--clr-text-3)' }}>100% Free Replenishment</span>
          </div>
          <h1 className="admin-page__title">Supplies & Inventory</h1>
          <p className="admin-page__sub">Manage on-site paper stock and order free replacement cartridges for your shop</p>
        </div>
      </div>

      {orderedItem && (
        <div style={{ background: 'var(--clr-success-dim)', border: '1px solid var(--clr-success)', padding: '12px 16px', borderRadius: 'var(--radius-md)', color: 'var(--clr-success)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle size={20} />
          <span>Dispatched order for <strong>{orderedItem}</strong>! Delivery expected tomorrow morning by 11:00 AM.</span>
        </div>
      )}

      {/* Supplies Order Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {/* Paper Reams Box */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--clr-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-accent-light)' }}>
              <Package size={22} weight="duotone" />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--clr-text-1)' }}>A4 Paper Box (5 Reams)</h3>
              <span style={{ fontSize: 12, color: 'var(--clr-text-3)' }}>2,500 Sheets · 75 GSM High Brightness</span>
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--clr-text-2)', lineHeight: 1.5 }}>
            Standard PrintBooth high-speed laser paper. Jam-resistant and moisture sealed.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--clr-border)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-success)' }}>FREE (Partner Contract)</span>
            <button className="btn btn-primary btn-sm" onClick={() => handleQuickOrder('A4 Paper Box (5 Reams)')}>
              <Plus size={16} />
              <span>Order Pack</span>
            </button>
          </div>
        </div>

        {/* High Yield Toner */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--clr-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-info)' }}>
              <Printer size={22} weight="duotone" />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--clr-text-1)' }}>OEM Laser Toner Pack</h3>
              <span style={{ fontSize: 12, color: 'var(--clr-text-3)' }}>Compatible with {printerModel}</span>
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--clr-text-2)', lineHeight: 1.5 }}>
            Genuine high-capacity toner cartridge. Keep 1 unopened box in your store at all times.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--clr-border)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-success)' }}>FREE (Partner Contract)</span>
            <button className="btn btn-primary btn-sm" onClick={() => handleQuickOrder('Laser Toner Cartridge')}>
              <Plus size={16} />
              <span>Order Toner</span>
            </button>
          </div>
        </div>

        {/* Marketing Standee */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--clr-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-warning)' }}>
              <Truck size={22} weight="duotone" />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--clr-text-1)' }}>Marketing & QR Standee</h3>
              <span style={{ fontSize: 12, color: 'var(--clr-text-3)' }}>Acrylic Counter Stand + Stickers</span>
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--clr-text-2)', lineHeight: 1.5 }}>
            Durable counter display with instructions for walk-in customers to upload & print via phone.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--clr-border)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-success)' }}>FREE (Partner Contract)</span>
            <button className="btn btn-primary btn-sm" onClick={() => handleQuickOrder('Marketing Standee Kit')}>
              <Plus size={16} />
              <span>Request Standee</span>
            </button>
          </div>
        </div>
      </div>

      {/* Current On-Site Inventory Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--clr-border)', marginBottom: 0 }}>
          <h2 className="card-title">Live Hardware Sensor Levels</h2>
          <span className="card-meta">Real-time IoT telemetry for {activeKioskId}</span>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Supply Name</th>
                <th>On-Hand Stock</th>
                <th>Recommended Minimum</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {inventoryItems.map(item => (
                <tr key={item.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--clr-accent-light)' }}>{item.id}</td>
                  <td style={{ color: 'var(--clr-text-1)', fontWeight: 500 }}>{item.item}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--clr-text-1)' }}>{item.onHand}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--clr-text-3)' }}>{item.minRecommended}</td>
                  <td>
                    <span className={`badge ${item.badgeClass}`}>{item.status}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--clr-text-4)' }}>{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
