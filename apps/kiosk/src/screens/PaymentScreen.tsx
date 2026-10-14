import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CircleNotch, ShieldCheck, DeviceMobile } from '@phosphor-icons/react'
import { QRCodeSVG } from 'qrcode.react'
import './KioskScreens.css'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '').replace(/\/+$/, '')
const KIOSK_ID = 'PB-001'

export default function PaymentScreen() {
  const navigate = useNavigate()
  const [totalPrice, setTotalPrice] = useState<string>(() => sessionStorage.getItem('pb_total_price') ?? '10')
  const [upiQrValue, setUpiQrValue] = useState<string | null>(() => sessionStorage.getItem('pb_upi_qr_value') || null)
  const [loading, setLoading] = useState<boolean>(() => !sessionStorage.getItem('pb_upi_qr_value'))
  const [timeLeft, setTimeLeft] = useState<number>(5 * 60)

  // Countdown timer for session payment
  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000)
    return () => clearInterval(timer)
  }, [])

  // Poll active session for live UPI QR, amount, and phase progression
  useEffect(() => {
    const pollPaymentState = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/kiosk-sessions/active/${KIOSK_ID}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.hasActiveSession && data.session) {
          const s = data.session

          if (s.state === 'PRINTING') {
            navigate('/printing')
            return
          }
          if (s.state === 'DONE') {
            navigate('/collect')
            return
          }
          if (s.state === 'REVIEWING') {
            navigate('/review')
            return
          }
          if (s.state === 'CONFIRMING' || s.state === 'CONFIGURING') {
            navigate('/settings')
            return
          }

          // Live amount
          if (typeof s.amount === 'number' && s.amount > 0) {
            const formatted = String(s.amount)
            setTotalPrice(formatted)
            sessionStorage.setItem('pb_total_price', formatted)
          }

          // Dynamic UPI QR code
          const qr = s.upiQrValue || s.upiIntentUrl || s.paymentUrl
          if (qr) {
            setUpiQrValue(qr)
            sessionStorage.setItem('pb_upi_qr_value', qr)
            setLoading(false)
          }
        }
      } catch {}
    }

    pollPaymentState()
    const interval = setInterval(pollPaymentState, 600)
    return () => clearInterval(interval)
  }, [navigate])

  const handleBackToReview = async () => {
    try {
      await fetch(`${API_BASE}/api/kiosk-sessions/kiosk/${KIOSK_ID}/section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: '/review' }),
      })
    } catch {}
    navigate('/review')
  }

  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0')
  const seconds = (timeLeft % 60).toString().padStart(2, '0')

  return (
    <div className="kiosk-screen">
      <div className="kiosk-bg-mesh" />
      <div className="kiosk-statusbar">
        <div className="statusbar__left">
          <div className="statusbar__dot" />
          <span className="statusbar__kiosk">{KIOSK_ID}</span>
          <span style={{ color: 'var(--clr-text-3)', fontSize: '0.8rem' }}>Express Print Station</span>
        </div>
        <div className="statusbar__right">
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--clr-accent-light)' }}>
            Expires: {minutes}:{seconds}
          </span>
        </div>
      </div>

      <div className="kiosk-payment kiosk-enter" style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--clr-accent-dim)',
            border: '1px solid var(--clr-accent)',
            color: 'var(--clr-accent-light)',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '1px',
            padding: '4px 12px',
            borderRadius: '9999px',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}>
            <ShieldCheck size={14} weight="bold" />
            Secure Instant UPI Payment
          </div>
          <h1 className="kiosk-title" style={{ fontSize: '2.4rem', margin: 0, fontWeight: 800 }}>
            Pay ₹{Number(totalPrice).toFixed(2)}
          </h1>
          <p className="kiosk-subtitle" style={{ margin: 0, fontSize: '0.95rem', color: 'var(--clr-text-2)' }}>
            Scan with Google Pay, PhonePe, Paytm, BHIM, or any UPI app
          </p>
        </div>

        <div
          className="kiosk-qr-box"
          style={{
            background: '#ffffff',
            padding: 24,
            borderRadius: '20px',
            boxShadow: '0 0 50px rgba(200, 255, 0, 0.18), 0 20px 40px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 268,
            minHeight: 268,
          }}
        >
          {loading || !upiQrValue ? (
            <div style={{ width: 220, height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <CircleNotch size={38} className="kiosk-spin" color="#06110D" />
              <span style={{ fontSize: '0.8rem', color: '#4b5563', fontWeight: 600 }}>
                Generating dynamic UPI QR…
              </span>
            </div>
          ) : (
            <QRCodeSVG
              value={upiQrValue}
              size={220}
              level="M"
              includeMargin={false}
              fgColor="#06110D"
              bgColor="#ffffff"
            />
          )}
        </div>

        <div className="kiosk-waiting" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(200, 255, 0, 0.08)',
          border: '1px solid rgba(200, 255, 0, 0.25)',
          padding: '8px 18px',
          borderRadius: '9999px',
        }}>
          <div className="kiosk-waiting__dot" style={{ background: 'var(--clr-accent)' }} />
          <span style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 600 }}>
            Awaiting instant UPI confirmation…
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--clr-text-3)', fontSize: '0.78rem' }}>
          <DeviceMobile size={15} />
          <span>Printing starts automatically the second payment is received.</span>
        </div>
      </div>

      <div className="kiosk-back">
        <button className="kiosk-btn kiosk-btn-ghost" onClick={handleBackToReview} id="payment-back">
          <ArrowLeft size={20} />
          Back to Review
        </button>
      </div>
    </div>
  )
}
