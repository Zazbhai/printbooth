import { useState, useEffect, useCallback, useMemo } from 'react'
import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  SquaresFour,
  Monitor,
  ClipboardText,
  Bell,
  SignOut,
  Storefront,
  List,
  X,
  CreditCard,
  ShieldCheck,
  Crown,
  Headset,
  HardDrives,
  UsersThree,
  Megaphone,
} from '@phosphor-icons/react'
import { useAuth } from '@/lib/authContext'
import { getAdminAlerts } from '@/lib/api'
import { getHelpDeskStats, fetchHelpDeskTickets } from '@/lib/helpdesk'
import { getInstallationStats, fetchInstallationRequests } from '@/lib/installations'
import './AdminLayout.css'

export default function AdminLayout() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const [badgeCounts, setBadgeCounts] = useState<{
    alerts: number
    helpdesk: number
    installations: number
  }>({
    alerts: 0,
    helpdesk: 0,
    installations: 0,
  })

  const refreshBadgeCounts = useCallback(async () => {
    try {
      // 1. Hardware & Fleet Alerts (only unacknowledged alerts)
      const alerts = await getAdminAlerts().catch(() => [])
      const unackAlerts = Array.isArray(alerts)
        ? alerts.filter((a: any) => !a.acknowledged).length
        : 0

      // 2. Real Help Desk tickets (only OPEN tickets)
      const hdStats = getHelpDeskStats()
      const openTickets = hdStats.open || 0

      // 3. Real Installation requests (only NEW/unprocessed requests)
      const instStats = getInstallationStats()
      const newRequests = instStats.newRequests || 0

      setBadgeCounts({
        alerts: unackAlerts,
        helpdesk: openTickets,
        installations: newRequests,
      })
    } catch (err) {
      console.warn('[AdminLayout] Failed to refresh sidebar badges:', err)
    }
  }, [])

  useEffect(() => {
    // Initial sync from backend
    fetchHelpDeskTickets().then(() => refreshBadgeCounts()).catch(() => {})
    fetchInstallationRequests().then(() => refreshBadgeCounts()).catch(() => {})
    refreshBadgeCounts()

    // Real-time custom event listeners
    const onHelpdesk = () => refreshBadgeCounts()
    const onInst = () => refreshBadgeCounts()
    const onAlerts = () => refreshBadgeCounts()

    window.addEventListener('pb_helpdesk_updated', onHelpdesk)
    window.addEventListener('pb_installation_updated', onInst)
    window.addEventListener('pb_alerts_updated', onAlerts)

    // Periodic poll every 15s to keep in sync with fleet changes
    const interval = setInterval(refreshBadgeCounts, 15000)

    return () => {
      window.removeEventListener('pb_helpdesk_updated', onHelpdesk)
      window.removeEventListener('pb_installation_updated', onInst)
      window.removeEventListener('pb_alerts_updated', onAlerts)
      clearInterval(interval)
    }
  }, [refreshBadgeCounts])

  const adminNavItems = useMemo(() => [
    { to: '/admin/dashboard', icon: <SquaresFour size={18} weight="duotone" />, label: 'Dashboard' },
    { to: '/admin/kiosks', icon: <Monitor size={18} weight="duotone" />, label: 'Kiosks Fleet' },
    { to: '/admin/orders', icon: <ClipboardText size={18} weight="duotone" />, label: 'All Orders' },
    {
      to: '/admin/alerts',
      icon: <Bell size={18} weight="duotone" />,
      label: 'Alerts',
      badge: badgeCounts.alerts > 0 ? badgeCounts.alerts : undefined,
    },
    {
      to: '/admin/helpdesk',
      icon: <Headset size={18} weight="duotone" />,
      label: 'Help Desk',
      badge: badgeCounts.helpdesk > 0 ? badgeCounts.helpdesk : undefined,
    },
    {
      to: '/admin/installations',
      icon: <HardDrives size={18} weight="duotone" />,
      label: 'Installation Requests',
      badge: badgeCounts.installations > 0 ? badgeCounts.installations : undefined,
    },
    { to: '/admin/merchants', icon: <Storefront size={18} weight="duotone" />, label: 'Merchant Partners' },
    { to: '/admin/payments', icon: <CreditCard size={18} weight="duotone" />, label: 'Razorpay Payments' },
    { to: '/admin/advertisements', icon: <Megaphone size={18} weight="duotone" />, label: 'Ad Campaigns' },
    { to: '/admin/users', icon: <UsersThree size={18} weight="duotone" />, label: 'Admin Management' },
  ], [badgeCounts])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="admin-layout">
      {/* Mobile Top Header (< 768px) */}
      <header className="mobile-header" role="banner">
        <div className="mobile-header__brand">
          <Link to="/admin/dashboard" className="mobile-header__logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo.png" alt="PrintBooth" style={{ width: 22, height: 22, objectFit: 'contain' }} />
            <span>PrintBooth</span>
            <span className="sidebar__brand-tag">Admin</span>
          </Link>
        </div>

        <div className="mobile-header__actions">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            color: '#dc2626',
            background: 'rgba(220, 38, 38, 0.1)',
            padding: '3px 8px',
            borderRadius: 6,
          }}>
            <ShieldCheck size={14} weight="bold" />
            <span>Superuser</span>
          </div>

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
          <Link to="/admin/dashboard" className="sidebar__brand-link" onClick={() => setMobileMenuOpen(false)}>
            <div className="sidebar__brand-icon" style={{ overflow: 'hidden', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/logo.png" alt="PrintBooth" style={{ width: 22, height: 22, objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>PrintBooth</span>
                <span className="sidebar__brand-tag">Admin</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 400 }}>Fleet Operations</span>
            </div>
          </Link>
        </div>

        {/* Superuser Authority Scope Banner */}
        <div style={{
          margin: '4px 14px 12px',
          padding: '8px 12px',
          background: 'rgba(220, 38, 38, 0.06)',
          border: '1px solid rgba(220, 38, 38, 0.2)',
          borderRadius: 8,
          fontSize: 11,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Crown size={13} weight="fill" />
              <span>Full Platform Rights</span>
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-text-4)' }}>Root</span>
          </div>
          <div style={{ color: 'var(--clr-text-3)', fontSize: 10.5, lineHeight: 1.35 }}>
            Nationwide fleet telemetry, merchant partnerships, and real-time operations.
          </div>
        </div>

        <nav className="sidebar__nav">
          <div className="sidebar__section-title">Platform Console</div>
          {adminNavItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `sidebar__nav-item ${isActive ? 'active' : ''}`
              }
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className={`sidebar__badge ${item.to.includes('alerts') ? 'badge-error' : 'badge-accent'}`}>
                  {item.badge}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user-card">
            <div className="sidebar__avatar admin-avatar">AD</div>
            <div className="sidebar__user-info" style={{ minWidth: 0 }}>
              <span className="sidebar__user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name || 'Super Admin'}
              </span>
              <span className="sidebar__user-role">Platform Operator</span>
            </div>
          </div>
          <button className="sidebar__logout" onClick={handleLogout} id="admin-logout-btn" title="Sign Out of Platform Admin">
            <SignOut size={16} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="admin-main">
        <AnimatedOutlet />
      </main>

      {/* Mobile Bottom Navigation Bar (< 640px) */}
      <nav className="mobile-bottom-nav" role="navigation" aria-label="Quick admin tabs">
        <NavLink to="/admin/dashboard" className={({ isActive }) => `bottom-nav__item ${isActive ? 'active' : ''}`}>
          <SquaresFour size={20} weight="duotone" />
          <span>Home</span>
        </NavLink>
        <NavLink to="/admin/kiosks" className={({ isActive }) => `bottom-nav__item ${isActive ? 'active' : ''}`}>
          <Monitor size={20} weight="duotone" />
          <span>Kiosks</span>
        </NavLink>
        <NavLink to="/admin/orders" className={({ isActive }) => `bottom-nav__item ${isActive ? 'active' : ''}`}>
          <ClipboardText size={20} weight="duotone" />
          <span>Orders</span>
        </NavLink>
        <NavLink to="/admin/alerts" className={({ isActive }) => `bottom-nav__item ${isActive ? 'active' : ''}`}>
          <Bell size={20} weight="duotone" />
          <span>Alerts</span>
        </NavLink>
        <NavLink to="/admin/merchants" className={({ isActive }) => `bottom-nav__item ${isActive ? 'active' : ''}`}>
          <Storefront size={20} weight="duotone" />
          <span>Partners</span>
        </NavLink>
      </nav>
    </div>
  )
}

function AnimatedOutlet() {
  const location = useLocation()
  const reduce = useReducedMotion()
  const vars = reduce
    ? { initial: { opacity: 0 }, enter: { opacity: 1, transition: { duration: 0.1 } }, exit: { opacity: 0, transition: { duration: 0.07 } } }
    : {
        initial: { opacity: 0, y: 8, scale: 0.996 },
        enter:   { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 340, damping: 34, opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] } } },
        exit:    { opacity: 0, y: -6, transition: { duration: 0.12 } },
      }
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div key={location.pathname} variants={vars} initial="initial" animate="enter" exit="exit"
        style={{ width: '100%', willChange: 'transform, opacity' }}>
        <Outlet />
      </motion.div>
    </AnimatePresence>
  )
}
