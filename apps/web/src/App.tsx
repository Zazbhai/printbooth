import { Routes, Route, Navigate, useSearchParams, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import Layout from './components/layout/Layout'
import HomePage from './pages/HomePage'
import HowItWorksPage from './pages/HowItWorksPage'
import LocationsPage from './pages/LocationsPage'
import PricingPage from './pages/PricingPage'
import FeaturesPage from './pages/FeaturesPage'
import FAQPage from './pages/FAQPage'
import SupportPage from './pages/SupportPage'
import ContactPage from './pages/ContactPage'
import RequestInstallationPage from './pages/RequestInstallationPage'
import TermsPage from './pages/legal/TermsPage'
import PrivacyPage from './pages/legal/PrivacyPage'
import CookiesPage from './pages/legal/CookiesPage'
import RefundsPage from './pages/legal/RefundsPage'
// Unified Print flow on single URL /print?id={printer_id}
import UnifiedPrintPage from './pages/print/UnifiedPrintPage'
import NotFoundPage from './pages/NotFoundPage'

function PrintRouteRedirect() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const pathParts = location.pathname.split('/').filter(Boolean)
  const pathParam = pathParts.length > 1 ? pathParts[1] : null
  const explicitPrinterId =
    searchParams.get('id') ||
    searchParams.get('printer_id') ||
    pathParam

  if (explicitPrinterId && /^PB-\d{3}$/i.test(explicitPrinterId.trim())) {
    const cleanId = explicitPrinterId.trim().toUpperCase()
    sessionStorage.setItem('pb_kiosk_id', cleanId)
    localStorage.setItem('pb_kiosk_id', cleanId)
    return <Navigate to={`/print?id=${cleanId}`} replace />
  }

  const savedKioskId = typeof window !== 'undefined'
    ? (sessionStorage.getItem('pb_kiosk_id') || localStorage.getItem('pb_kiosk_id'))
    : null
  if (savedKioskId && /^PB-\d{3}$/i.test(savedKioskId.trim())) {
    return <Navigate to={`/print?id=${savedKioskId.trim().toUpperCase()}`} replace />
  }

  return <Navigate to="/print?step=kiosk" replace />
}

// Apple HIG page-level transition variants
const pageVars = {
  initial: { opacity: 0, y: 10, scale: 0.993 },
  enter:   {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.9,
      opacity: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } }
  },
  exit:    {
    opacity: 0, y: -8, scale: 0.997,
    transition: { type: 'spring' as const, stiffness: 400, damping: 38, duration: 0.14 }
  },
}
const reducedVars = {
  initial: { opacity: 0 },
  enter:   { opacity: 1, transition: { duration: 0.12 } },
  exit:    { opacity: 0, transition: { duration: 0.08 } },
}

// Routes that manage their own internal step/state — AnimatePresence must NOT
const staticVars = {
  initial: { opacity: 1 },
  enter:   { opacity: 1 },
  exit:    { opacity: 1 },
}

// Routes that manage their own internal step/state — AnimatePresence must NOT
// remount these on every query-string or minor location change.
const STATIC_ROUTE_SEGMENTS = new Set(['/print'])

function AnimatedRoutes() {
  const location = useLocation()
  const shouldReduceMotion = useReducedMotion()
  const baseVars = shouldReduceMotion ? reducedVars : pageVars

  // Key on the top-level path segment only.
  // /print?id=PB-001, /print?id=PB-002  → same key "/print" → no remount
  const firstSegment = location.pathname.split('/').filter(Boolean)[0]
  const topSegment = firstSegment ? '/' + firstSegment : '/'
  const animKey = STATIC_ROUTE_SEGMENTS.has(topSegment) ? topSegment : location.pathname

  const isStatic = animKey === '/' || STATIC_ROUTE_SEGMENTS.has(animKey)
  const activeVars = isStatic ? staticVars : baseVars

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={animKey}
        variants={activeVars}
        initial="initial"
        animate="enter"
        exit="exit"
        style={{ width: '100%', maxWidth: '100%', overflowX: 'clip', minHeight: '100dvh', backgroundColor: 'var(--bg, #e0e5ec)' }}
      >
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/print" element={<UnifiedPrintPage />} />
          <Route path="/print/*" element={<PrintRouteRedirect />} />
          <Route path="/kiosk/:id" element={<PrintRouteRedirect />} />
          <Route path="/kiosks/:id" element={<PrintRouteRedirect />} />
          <Route path="/p/:id" element={<PrintRouteRedirect />} />

          {/* Legacy redirect for /merchant to home (Dedicated Merchant Portal runs on apps/admin) */}
          <Route path="/merchant" element={<Navigate to="/" replace />} />
          <Route path="/merchant/*" element={<Navigate to="/" replace />} />

          {/* Public website with nav + footer */}
          <Route element={<Layout />}>
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/locations" element={<LocationsPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/request-installation" element={<RequestInstallationPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/cookies" element={<CookiesPage />} />
            <Route path="/refunds" element={<RefundsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  return <AnimatedRoutes />
}


