import { useState } from 'react'
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom'
import {
  SquaresFour,
  Monitor,
  ClipboardText,
  CurrencyInr,
  Package,
  Gear,
  SignOut,
  List,
  X,
  Tag,
  ArrowLeft,
  Circle,
  WarningOctagon,
  Article,
} from '@phosphor-icons/react'
import { useActiveMerchant } from '@/lib/merchantContext'
import { useAuth } from '@/lib/authContext'
import MerchantBroadcastPopup from './merchant/MerchantBroadcastPopup'
import FirstLoginPasswordModal from './merchant/FirstLoginPasswordModal'
import MerchantBlockedNotice from './merchant/MerchantBlockedNotice'
import './AdminLayout.css'

const merchantNavItems = [
  { to: '/merchant/dashboard', icon: <SquaresFour size={18} weight="duotone" />, label: 'Dashboard' },
  { to: '/merchant/kiosks', icon: <Monitor size={18} weight="duotone" />, label: 'My Kiosk Status' },
  { to: '/merchant/pages', icon: <Article size={18} weight="duotone" />, label: 'Printer Paper (Tray)' },
  { to: '/merchant/pricing', icon: <Tag size={18} weight="duotone" />, label: 'Page Pricing' },
  { to: '/merchant/orders', icon: <ClipboardText size={18} weight="duotone" />, label: 'Store Orders' },
  { to: '/merchant/earnings', icon: <CurrencyInr size={18} weight="duotone" />, label: 'Earnings & Payouts' },
  { to: '/merchant/supplies', icon: <Package size={18} weight="duotone" />, label: 'Supplies & Stock' },
  { to: '/merchant/settings', icon: <Gear size={18} weight="duotone" />, label: 'Store Settings' },
]

export default function MerchantLayout() {
  const navigate = useNavigate()
  const { user, isAdmin, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { activeKioskId, setActiveKioskId, activeMerchant, merchants, merchantKiosks } = useActiveMerchant()
  const isBlocked = Boolean(activeMerchant?.isBlocked || activeMerchant?.status === 'BLOCKED')

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function handleBackToAdmin() {
    navigate('/admin/merchants')
    setMobileMenuOpen(false)
  }

  const initials = activeMerchant?.name
    ? activeMerchant.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'MP'

  return (
    <div className={`merchant-portal-shell ${isAdmin ? 'has-admin-topbar' : ''}`}>
      {/* Admin Emulation Topbar (outside the flex-row admin-layout) */}
      {isAdmin && (
        <div className="admin-emulation-topbar">
          <div className="admin-emulation-topbar__left">
            <span className="admin-emulation-topbar__tag">
              Admin Preview
            </span>
            <span className="admin-emulation-topbar__text">
              Viewing Merchant Partner Console for <strong>{activeMerchant?.storeName || activeKioskId}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={handleBackToAdmin}
            className="admin-emulation-topbar__btn"
          >
            <ArrowLeft size={14} />
            <span>Return to Fleet Console</span>
          </button>
        </div>
      )}

      <div className="admin-layout merchant-layout">
        {/* Mobile Top Header */}
        <header className="mobile-header" role="banner">
          <div className="mobile-header__brand">
          <Link to={`/merchant/dashboard?kioskId=${activeKioskId}`} className="mobile-header__logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo.png" alt="PrintBooth" style={{ width: 22, height: 22, objectFit: 'contain' }} />
            <span>PrintBooth</span>
            <span className="sidebar__brand-tag merchant-tag">{activeKioskId}</span>
          </Link>
        </div>

        <div className="mobile-header__actions">
          {isAdmin ? (
            <button
              type="button"
              className="portal-switch-pill portal-switch-pill--compact"
              onClick={handleBackToAdmin}
              title="Return to Admin Fleet Console"
            >
              <ArrowLeft size={14} weight="bold" />
              <span>Fleet</span>
            </button>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 700,
              color: isBlocked ? '#ef4444' : '#dc2626',
              background: isBlocked ? 'rgba(220, 38, 38, 0.12)' : '#fef2f2',
              border: isBlocked ? '1px solid rgba(220, 38, 38, 0.3)' : '1px solid #fecaca',
              padding: '3px 8px',
              borderRadius: 6,
            }}>
              <Circle size={8} weight="fill" color={isBlocked ? '#ef4444' : '#dc2626'} />
              <span>{isBlocked ? 'Suspended' : 'Partner'}</span>
            </div>
          )}

          <button
            type="button"
            className="mobile-header__hamburger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X size={22} /> : <List size={22} />}
          </button>
        </div>
      </header>

      {/* Mobile Slide-over Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="mobile-drawer-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar (Desktop Persistent & Mobile Drawer) */}
      <aside className={`admin-sidebar ${mobileMenuOpen ? 'mobile-drawer-open' : ''}`}>
        <div className="sidebar__brand">
          <Link to={`/merchant/dashboard?kioskId=${activeKioskId}`} className="sidebar__brand-link" onClick={() => setMobileMenuOpen(false)}>
            <div className="sidebar__brand-icon merchant-icon" style={{ overflow: 'hidden', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {activeMerchant?.kioskPhotoUrl ? (
                <img
                  src={activeMerchant.kioskPhotoUrl}
                  alt="Kiosk"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <img
                  src="/logo.png"
                  alt="PrintBooth"
                  style={{ width: 22, height: 22, objectFit: 'contain' }}
                />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>PrintBooth</span>
                <span
                  className={`sidebar__brand-tag ${isBlocked ? 'tag-blocked' : 'merchant-tag'}`}
                  style={isBlocked ? { background: 'rgba(220, 38, 38, 0.2)', color: '#ef4444', borderColor: 'rgba(220, 38, 38, 0.4)' } : undefined}
                >
                  {isBlocked ? 'Blocked' : 'Partner'}
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--muted-foreground)',
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 155,
                }}
                title={activeMerchant?.storeName || 'My Store'}
              >
                {activeMerchant?.storeName || 'My Store'}
              </span>
            </div>
          </Link>
        </div>

        {/* Store Isolation & Venue Scope Card */}
        <div style={{
          margin: '4px 14px 12px',
          padding: '10px 12px',
          background: 'rgba(220, 38, 38, 0.04)',
          border: '1px solid rgba(220, 38, 38, 0.18)',
          borderRadius: 8,
          fontSize: 11,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Circle size={8} weight="fill" color="#dc2626" />
              <span>Assigned Venue</span>
            </span>
            <span style={{ fontWeight: 800, color: 'var(--clr-text-1)', background: 'var(--clr-surface-2)', padding: '2px 6px', borderRadius: 4 }}>
              {activeKioskId}
            </span>
          </div>

          <div style={{ color: 'var(--clr-text-3)', fontSize: 10.5, lineHeight: 1.35 }}>
            {activeMerchant?.address || 'Licensed store location with isolated print telemetry'}
          </div>

          {/* Kiosk Switcher: Available to Admins OR Merchants with multiple kiosks */}
          {isAdmin && merchants.length > 1 && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(220, 38, 38, 0.15)' }}>
              <label style={{ display: 'block', fontSize: 9.5, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', marginBottom: 3 }}>
                Admin Kiosk Switcher
              </label>
              <select
                value={activeKioskId}
                onChange={(e) => setActiveKioskId(e.target.value)}
                className="form-input"
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  background: 'var(--clr-surface-1)',
                  borderColor: 'rgba(220, 38, 38, 0.3)',
                  color: 'var(--clr-text-1)',
                  width: '100%',
                }}
              >
                {merchants.map((m) => (
                  <option key={m.kioskId} value={m.kioskId}>
                    {m.kioskId} - {m.storeName || m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isAdmin && merchantKiosks && merchantKiosks.length > 1 && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(220, 38, 38, 0.15)' }}>
              <label style={{ display: 'block', fontSize: 9.5, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', marginBottom: 3 }}>
                My Stations ({merchantKiosks.length})
              </label>
              <select
                value={activeKioskId}
                onChange={(e) => setActiveKioskId(e.target.value)}
                className="form-input"
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  background: 'var(--clr-surface-1)',
                  borderColor: 'rgba(220, 38, 38, 0.3)',
                  color: 'var(--clr-text-1)',
                  width: '100%',
                }}
              >
                {merchantKiosks.map((k: any) => (
                  <option key={k.kioskId || k.id} value={k.kioskId || k.id}>
                    {k.kioskId || k.id} {k.name ? `— ${k.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <nav className="sidebar__nav">
          <div className="sidebar__section-title">Store Management</div>
          {merchantNavItems.map(item => (
            <NavLink
              key={item.to}
              to={`${item.to}?kioskId=${activeKioskId}`}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `sidebar__nav-item ${isActive ? 'active' : ''}`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Merchant Footer Profile */}
        <div className="sidebar__footer">
          <div className="sidebar__user" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div
                className="sidebar__avatar"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--clr-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeMerchant?.name || user?.name || 'Store Partner'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--clr-text-4)' }}>
                  {isAdmin ? 'Admin View' : 'Merchant Partner'}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="btn btn--icon btn--ghost"
              onClick={handleLogout}
              title="Sign Out of Merchant Portal"
              style={{ flexShrink: 0, padding: 6, borderRadius: 6 }}
            >
              <SignOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="admin-main" role="main">
        {isBlocked && isAdmin && (
          <div style={{
            background: 'rgba(220, 38, 38, 0.14)',
            border: '1px solid rgba(220, 38, 38, 0.35)',
            borderRadius: 10,
            margin: '16px 24px 0',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <WarningOctagon size={22} weight="fill" color="#ef4444" />
              <div style={{ fontSize: 13, color: '#fca5a5' }}>
                <strong style={{ color: '#fff' }}>Merchant Partner is SUSPENDED.</strong> All assigned kiosks ({activeKioskId}) and printer daemons have been taken OFFLINE and hidden from customer discovery.
              </div>
            </div>
            <Link
              to="/admin/merchants"
              className="btn btn--secondary"
              style={{ fontSize: 12, padding: '6px 12px', height: 'auto', color: '#fca5a5', borderColor: 'rgba(220, 38, 38, 0.4)' }}
            >
              Fleet Console
            </Link>
          </div>
        )}

        {isBlocked && !isAdmin ? (
          <MerchantBlockedNotice
            isModal={true}
            kioskId={activeKioskId}
            storeName={activeMerchant?.storeName}
            merchantName={activeMerchant?.name}
            onSignOut={handleLogout}
          />
        ) : (
          <Outlet />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (< 768px) */}
      <nav className="mobile-bottom-nav" role="navigation" aria-label="Mobile Navigation">
        <NavLink
          to={`/merchant/dashboard?kioskId=${activeKioskId}`}
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'active' : ''}`}
        >
          <SquaresFour size={20} weight="duotone" />
          <span>Dashboard</span>
        </NavLink>
        <NavLink
          to={`/merchant/kiosks?kioskId=${activeKioskId}`}
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'active' : ''}`}
        >
          <Monitor size={20} weight="duotone" />
          <span>My Kiosk</span>
        </NavLink>
        <NavLink
          to={`/merchant/pricing?kioskId=${activeKioskId}`}
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'active' : ''}`}
        >
          <Tag size={20} weight="duotone" />
          <span>Pricing</span>
        </NavLink>
        <NavLink
          to={`/merchant/orders?kioskId=${activeKioskId}`}
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'active' : ''}`}
        >
          <ClipboardText size={20} weight="duotone" />
          <span>Orders</span>
        </NavLink>
        <NavLink
          to={`/merchant/earnings?kioskId=${activeKioskId}`}
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'active' : ''}`}
        >
          <CurrencyInr size={20} weight="duotone" />
          <span>Earnings</span>
        </NavLink>
      </nav>

      {/* First-Time Sign-In Password Change Modal */}
      <FirstLoginPasswordModal />

      {/* Real-time Fleet Broadcast Announcement Popup */}
      <MerchantBroadcastPopup />
    </div>
  </div>
)
}
