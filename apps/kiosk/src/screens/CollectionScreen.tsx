import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle } from '@phosphor-icons/react'
import './KioskScreens.css'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '').replace(/\/+$/, '')
const KIOSK_ID = 'PB-001'

export default function CollectionScreen() {
  const navigate = useNavigate()

  const handleDismiss = useCallback(async () => {
    try {
      const sessionId = sessionStorage.getItem('pb_kiosk_session_id')
      if (sessionId) {
        await fetch(`${API_BASE}/api/kiosk-sessions/${sessionId}/reset`, { method: 'POST' })
      } else {
        await fetch(`${API_BASE}/api/kiosk-sessions/kiosk/${KIOSK_ID}/reset`, { method: 'POST' })
      }
    } catch {}

    // Clear session storage so kiosk returns to clean idle state
    sessionStorage.removeItem('pb_settings')
    sessionStorage.removeItem('pb_total_price')
    sessionStorage.removeItem('pb_file_name')
    sessionStorage.removeItem('pb_doc_page_count')
    sessionStorage.removeItem('pb_page_count')
    sessionStorage.removeItem('pb_kiosk_session_id')
    sessionStorage.removeItem('pb_upi_qr_value')
    sessionStorage.removeItem('pb_colour_mode')
    sessionStorage.removeItem('pb_copies')
    sessionStorage.removeItem('pb_order_id')

    navigate('/')
  }, [navigate])

  // Auto-return to home after 20 seconds
  useEffect(() => {
    const timer = setTimeout(handleDismiss, 20000)
    return () => clearTimeout(timer)
  }, [handleDismiss])

  return (
    <div className="kiosk-screen">
      <div className="kiosk-bg-mesh" />
      <div className="kiosk-statusbar">
        <div className="statusbar__left"><div className="statusbar__dot" /><span className="statusbar__kiosk">{KIOSK_ID}</span></div>
      </div>

      <div className="kiosk-collection kiosk-enter" style={{ marginTop: 48 }}>
        <CheckCircle size={100} weight="fill" className="kiosk-success-icon" />

        <h1 className="kiosk-title">
          Your prints are ready!
        </h1>

        <p className="kiosk-subtitle" style={{ maxWidth: '40ch' }}>
          Please collect your document from the output tray below.
          Thank you for using PrintBooth.
        </p>

        <div style={{
          padding: '20px 40px',
          background: 'var(--clr-success-dim)',
          border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 'var(--radius-xl)',
          fontSize: '1rem',
          color: 'var(--clr-success)',
          fontWeight: 500,
        }}>
          ↓ Output tray below
        </div>

        <button
          className="kiosk-btn kiosk-btn-secondary"
          onClick={handleDismiss}
          id="collect-done"
          style={{ marginTop: 16 }}
        >
          Tap to dismiss
        </button>

        <p style={{ fontSize: '0.75rem', color: 'var(--clr-text-4)', fontFamily: 'var(--font-mono)' }}>
          Auto-returning to home in 20 seconds
        </p>
      </div>
    </div>
  )
}
