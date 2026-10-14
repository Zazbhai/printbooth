import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CircleNotch } from '@phosphor-icons/react'
import { QRCodeSVG } from 'qrcode.react'
import KioskCampaignCard from '../components/KioskCampaignCard'
import './KioskScreens.css'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '').replace(/\/+$/, '')
const KIOSK_ID = 'PB-001'

interface KioskSessionData {
  sessionId: string
  token: string
  qrUrl: string
  expiresAt: number
  state: string
  progressData?: any
}

export default function QRUploadScreen() {
  const navigate = useNavigate()
  const [session, setSession] = useState<KioskSessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [phoneState, setPhoneState] = useState<string>('WAITING')
  const [timeLeft, setTimeLeft] = useState(5 * 60)
  const activeSessionIdRef = useRef<string | null>(null)

  // Initialize or fetch active session on mount
  const initSession = useCallback(async (force = false) => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${API_BASE}/api/kiosk-sessions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kioskId: KIOSK_ID, webBaseUrl: 'https://printbooth.co.in', force }),
      })
      const data = await res.json()
      if (data.success && (data.qrUrl || data.token)) {
        const defaultBase = 'https://printbooth.co.in'
        let rawQr = data.qrUrl || `${defaultBase}/print?id=${KIOSK_ID}&session=${encodeURIComponent(data.token)}`
        let qrUrl = rawQr
        try {
          const urlObj = new URL(rawQr)
          qrUrl = `${defaultBase}${urlObj.pathname}${urlObj.search}`
        } catch {
          qrUrl = `${defaultBase}/print?id=${KIOSK_ID}&session=${encodeURIComponent(data.token)}`
        }
        setSession({
          sessionId: data.sessionId,
          token: data.token,
          qrUrl,
          expiresAt: data.expiresAt || (Date.now() + 5 * 60 * 1000),
          state: data.state || 'QR_READY',
          progressData: data.progressData,
        })
        activeSessionIdRef.current = data.sessionId
        const remaining = Math.max(0, Math.floor(((data.expiresAt || Date.now() + 300000) - Date.now()) / 1000))
        setTimeLeft(remaining || 300)
      } else {
        setError(data.error || 'Failed to initialize session')
      }
    } catch (err: any) {
      console.error('[QRUploadScreen] Init error:', err)
      setError('Unable to reach server. Please check network connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    initSession()
  }, [initSession])

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          // Refresh session when expired
          initSession(true)
          return 300
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [initSession])

  // Poll active session state from kiosk
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/kiosk-sessions/active/${KIOSK_ID}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.hasActiveSession && data.session) {
          const s = data.session
          setPhoneState(s.state || 'WAITING')

          if (s.state === 'PRINTING') {
            navigate('/printing')
            return
          }

          if (s.state === 'DONE') {
            navigate('/collect')
            return
          }

          if (s.state === 'PAYING') {
            navigate('/payment')
            return
          }

          if (s.state === 'REVIEWING') {
            navigate('/review')
            return
          }

          if (s.state === 'CONFIRMING' || s.state === 'CONFIGURING' || s.document || s.fileName) {
            sessionStorage.setItem('pb_file_name', s.fileName || s.document?.fileName || 'document.pdf')
            sessionStorage.setItem('pb_doc_page_count', String(s.totalPages || s.document?.pageCount || 1))
            sessionStorage.setItem('pb_page_count', String(s.totalPages || s.document?.pageCount || 1))
            sessionStorage.setItem('pb_kiosk_session_id', s.sessionId)
            navigate('/settings')
            return
          }

          if (s.state === 'CANCELLED') {
            initSession(true)
          }
        }
      } catch {}
    }, 500)

    return () => clearInterval(pollInterval)
  }, [navigate, initSession])

  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0')
  const seconds = (timeLeft % 60).toString().padStart(2, '0')

  return (
    <div className="kiosk-screen">
      <div className="kiosk-bg-mesh" />
      <div className="kiosk-statusbar">
        <div className="statusbar__left">
          <div className="statusbar__dot" />
          <span className="statusbar__kiosk">{KIOSK_ID}</span>
          <span>MIT ADT University</span>
        </div>
        <div className="statusbar__right">
          <span>Printer: Online</span>
          <span>One Person at a Time</span>
        </div>
      </div>

      <div className="kiosk-qr-screen kiosk-enter">
        <h1 className="kiosk-title" style={{ fontSize: '2rem' }}>Scan to Upload</h1>
        <p className="kiosk-subtitle">Point phone camera or PrintBooth web scanner at this QR code</p>

        <div className="qr-display" style={{ background: '#ffffff', padding: 20, borderRadius: 16, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 12px 32px rgba(0,0,0,0.35)' }}>
          {loading ? (
            <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircleNotch size={40} className="kiosk-spin" color="#dc2626" />
            </div>
          ) : error ? (
            <div style={{ width: 220, height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center' }}>
              <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>
              <button className="kiosk-btn kiosk-btn-secondary" onClick={() => initSession(true)} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
                Retry
              </button>
            </div>
          ) : session?.qrUrl ? (
            <QRCodeSVG
              value={session.qrUrl.replace(/^https?:\/\/[^/]+/, 'https://printbooth.co.in')}
              size={220}
              level="M"
              includeMargin={false}
              fgColor="#06110D"
              bgColor="#ffffff"
            />
          ) : null}
        </div>

        <div className="kiosk-waiting" style={{ marginTop: 16 }}>
          {phoneState === 'CLAIMED' || phoneState === 'UPLOADING' ? (
            <>
              <div className="kiosk-waiting__dot" style={{ background: '#16a34a' }} />
              <span style={{ color: '#16a34a', fontWeight: 600 }}>
                📱 Phone Connected! Uploading documents…
              </span>
            </>
          ) : phoneState === 'CONFIRMING' || phoneState === 'CONFIGURING' ? (
            <>
              <div className="kiosk-waiting__dot" style={{ background: '#c8ff00' }} />
              <span style={{ color: '#ffffff', fontWeight: 600 }}>
                ⚙️ User configuring print settings on phone…
              </span>
            </>
          ) : phoneState === 'REVIEWING' ? (
            <>
              <div className="kiosk-waiting__dot" style={{ background: '#38bdf8' }} />
              <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                📑 Reviewing order on phone…
              </span>
            </>
          ) : phoneState === 'PAYING' ? (
            <>
              <div className="kiosk-waiting__dot" style={{ background: '#f59e0b' }} />
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                💳 Awaiting payment approval on phone…
              </span>
            </>
          ) : (
            <>
              <div className="kiosk-waiting__dot" />
              <span>Waiting for upload from phone…</span>
            </>
          )}
        </div>

        <div className="kiosk-timer">{minutes}:{seconds}</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--clr-text-3)' }}>QR refreshes in {minutes}:{seconds}</p>

        {/* Featured Campaign Card */}
        <div style={{ marginTop: 24, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <KioskCampaignCard kioskId={KIOSK_ID} />
        </div>
      </div>

      <div className="kiosk-back">
        <button className="kiosk-btn kiosk-btn-ghost" onClick={() => navigate('/upload')} id="qr-back">
          <ArrowLeft size={20} />
          Back
        </button>
      </div>
    </div>
  )
}
