import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import WelcomeScreen from './screens/WelcomeScreen'
import EnterPinScreen from './screens/EnterPinScreen'
import UploadMethodScreen from './screens/UploadMethodScreen'
import QRUploadScreen from './screens/QRUploadScreen'
import USBSelectScreen from './screens/USBSelectScreen'
import PrintSettingsScreen from './screens/PrintSettingsScreen'
import ReviewScreen from './screens/ReviewScreen'
import PaymentScreen from './screens/PaymentScreen'
import PrintingScreen from './screens/PrintingScreen'
import CollectionScreen from './screens/CollectionScreen'
import ErrorScreen from './screens/ErrorScreen'
import NetworkOfflineScreen from './screens/NetworkOfflineScreen'
import KioskAdBackground from './components/KioskAdBackground'
import KioskInactivityBanner from './components/KioskInactivityBanner'

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [inactivityRemaining, setInactivityRemaining] = useState<number | null>(null)
  const [resetAt, setResetAt] = useState<number | null>(null)

  const isUploadFromPhonePage =
    location.pathname === '/' ||
    location.pathname === '/welcome' ||
    location.pathname === '/upload' ||
    location.pathname === '/upload/qr' ||
    location.pathname === '/enter-pin'

  const isSessionSection =
    location.pathname === '/settings' ||
    location.pathname === '/review' ||
    location.pathname === '/payment' ||
    location.pathname === '/upload/qr'

  // Reset 1-minute section timer each time kiosk enters a new section
  useEffect(() => {
    if (isSessionSection) {
      const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '').replace(/\/+$/, '')
      fetch(`${API_BASE}/api/kiosk-sessions/kiosk/PB-001/section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: location.pathname }),
      }).catch(() => {})
      setInactivityRemaining(60)
      setResetAt(Date.now() + 60000)
    } else {
      setInactivityRemaining(null)
      setResetAt(null)
    }
  }, [location.pathname, isSessionSection])

  // Global Kiosk Session Sync: Redirects kiosk when a user uploads from phone or advances flow,
  // tracks 1-minute phone inactivity timer, and auto-resets when expired
  useEffect(() => {
    const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '').replace(/\/+$/, '')
    const KIOSK_ID = 'PB-001'

    const pollSession = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/kiosk-sessions/active/${KIOSK_ID}`)
        if (!res.ok) return
        const data = await res.json()

        // Auto-reset kiosk when session has timed out or expired
        if (data.isInactiveTimeout || (data.session && (data.session.state === 'EXPIRED' || data.session.state === 'CANCELLED'))) {
          sessionStorage.removeItem('pb_settings')
          sessionStorage.removeItem('pb_total_price')
          sessionStorage.removeItem('pb_file_name')
          sessionStorage.removeItem('pb_doc_page_count')
          sessionStorage.removeItem('pb_page_count')
          sessionStorage.removeItem('pb_kiosk_session_id')
          setInactivityRemaining(null)
          setResetAt(null)
          if (location.pathname !== '/' && location.pathname !== '/welcome') {
            navigate('/')
          }
          return
        }

        if (data.hasActiveSession && data.session) {
          const s = data.session

          // Inactivity metrics during active section
          if (isSessionSection && s.state !== 'PRINTING' && s.state !== 'DONE' && s.state !== 'QR_READY') {
            const remaining = typeof data.inactivityRemainingSec === 'number'
              ? data.inactivityRemainingSec
              : (typeof s.inactivityRemainingSec === 'number' ? s.inactivityRemainingSec : null)
            const targetReset = data.resetAt || s.resetAt || (Date.now() + (remaining ? remaining * 1000 : 60000))

            setInactivityRemaining(remaining)
            setResetAt(targetReset)
          } else {
            setInactivityRemaining(null)
            setResetAt(null)
          }

          // When phone user uploads a document while kiosk is on home, welcome, upload, or qr screen
          if ((s.document || s.state === 'CONFIRMING' || s.state === 'CONFIGURING') && isUploadFromPhonePage) {
            sessionStorage.setItem('pb_file_name', s.fileName || s.document?.fileName || 'document.pdf')
            sessionStorage.setItem('pb_doc_page_count', String(s.totalPages || s.document?.pageCount || 1))
            sessionStorage.setItem('pb_page_count', String(s.totalPages || s.document?.pageCount || 1))
            sessionStorage.setItem('pb_kiosk_session_id', s.sessionId)
            navigate('/settings')
            return
          }

          // When phone advances to payment
          if (s.state === 'PAYING' && (location.pathname === '/settings' || location.pathname === '/review')) {
            navigate('/payment')
            return
          }

          // When print is triggered
          if (s.state === 'PRINTING' && location.pathname !== '/printing') {
            navigate('/printing')
            return
          }

          // When print is complete
          if (s.state === 'DONE' && location.pathname !== '/collect') {
            navigate('/collect')
            return
          }
        } else {
          setInactivityRemaining(null)
          setResetAt(null)
        }
      } catch {}
    }

    const interval = setInterval(pollSession, 500)
    return () => clearInterval(interval)
  }, [location.pathname, navigate, isUploadFromPhonePage, isSessionSection])

  return (
    <>
      {isUploadFromPhonePage && <KioskAdBackground kioskId="PB-001" />}
      <KioskInactivityBanner remainingSec={inactivityRemaining} resetAt={resetAt} />
      <Routes>
      <Route path="/" element={<WelcomeScreen />} />
      <Route path="/enter-pin" element={<EnterPinScreen />} />
      <Route path="/upload" element={<UploadMethodScreen />} />
      <Route path="/upload/qr" element={<QRUploadScreen />} />
      <Route path="/upload/usb" element={<USBSelectScreen />} />
      <Route path="/settings" element={<PrintSettingsScreen />} />
      <Route path="/review" element={<ReviewScreen />} />
      <Route path="/payment" element={<PaymentScreen />} />
      <Route path="/printing" element={<PrintingScreen />} />
      <Route path="/collect" element={<CollectionScreen />} />
      <Route path="/error" element={<ErrorScreen />} />
      <Route path="/offline" element={<NetworkOfflineScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>
  )
}
