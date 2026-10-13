import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Key, ArrowLeft, CheckCircle, WarningCircle, Backspace, Sparkle } from '@phosphor-icons/react'
import './KioskScreens.css'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '')

export default function EnterPinScreen() {
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [matchedOrder, setMatchedOrder] = useState<any>(null)

  // 20-Second Inactivity Auto-Back Timer (Return to Print from Phone)
  const [pinIdleSeconds, setPinIdleSeconds] = useState(20)
  const lastActivityRef = useRef(Date.now())

  useEffect(() => {
    lastActivityRef.current = Date.now()

    const handleActivity = () => {
      lastActivityRef.current = Date.now()
      setPinIdleSeconds(20)
    }

    window.addEventListener('touchstart', handleActivity, { passive: true })
    window.addEventListener('touchmove', handleActivity, { passive: true })
    window.addEventListener('mousedown', handleActivity, { passive: true })
    window.addEventListener('click', handleActivity, { passive: true })
    window.addEventListener('keydown', handleActivity, { passive: true })

    const timer = setInterval(() => {
      if (status === 'verifying' || status === 'success') {
        lastActivityRef.current = Date.now()
        setPinIdleSeconds(20)
        return
      }

      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000)
      const remaining = Math.max(0, 20 - elapsed)
      setPinIdleSeconds(remaining)

      if (remaining <= 0) {
        clearInterval(timer)
        navigate('/')
      }
    }, 500)

    return () => {
      clearInterval(timer)
      window.removeEventListener('touchstart', handleActivity)
      window.removeEventListener('touchmove', handleActivity)
      window.removeEventListener('mousedown', handleActivity)
      window.removeEventListener('click', handleActivity)
      window.removeEventListener('keydown', handleActivity)
    }
  }, [status, navigate])

  const kioskId = sessionStorage.getItem('pb_kiosk_id') || 'PB-001'

  const handleDigit = useCallback((d: string) => {
    if (status === 'verifying' || status === 'success') return
    setPin((prev) => {
      if (prev.length >= 4) return prev
      const next = prev + d
      setErrorMessage('')
      return next
    })
  }, [status])

  const handleBackspace = useCallback(() => {
    if (status === 'verifying' || status === 'success') return
    setPin((prev) => prev.slice(0, -1))
    setErrorMessage('')
  }, [status])

  const handleClear = useCallback(() => {
    if (status === 'verifying' || status === 'success') return
    setPin('')
    setErrorMessage('')
    setStatus('idle')
  }, [status])

  const handleVerify = async () => {
    if (pin.length !== 4 || status === 'verifying') return

    // 0. Instant local guard: Reject if PIN was already used on this kiosk
    const localUsed: string[] = (() => {
      try {
        return JSON.parse(localStorage.getItem('pb_used_pins') || '[]')
      } catch {
        return []
      }
    })()

    if (localUsed.includes(pin)) {
      setStatus('error')
      setErrorMessage('This PIN has already been used and is no longer valid.')
      return
    }

    setStatus('verifying')
    setErrorMessage('')

    try {
      // 1. Try Kiosk-specific endpoint
      let res = await fetch(`${API_BASE}/api/kiosks/${encodeURIComponent(kioskId)}/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      // 2. Fallback to generic print route if 404
      if (res.status === 404) {
        res = await fetch(`${API_BASE}/api/print/verify-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kioskId, pin }),
        })
      }

      const json = await res.json()

      if (json.success && json.valid !== false) {
        try {
          const updated = [...localUsed, pin].slice(-200)
          localStorage.setItem('pb_used_pins', JSON.stringify(updated))
        } catch {}

        setStatus('success')
        setMatchedOrder(json.order)
        sessionStorage.setItem('pb_order_id', json.order?.orderId || pin)
        sessionStorage.setItem('pb_file_name', json.order?.fileName || 'PrintBooth_Document.pdf')

        // Transition to printing screen after brief verification feedback
        setTimeout(() => {
          navigate('/printing')
        }, 1200)
      } else {
        setStatus('error')
        setErrorMessage(json.error || 'This PIN has already been used and is no longer valid.')
      }
    } catch (err: any) {
      console.error('[Kiosk PIN Verification] Error:', err)
      setStatus('error')
      setErrorMessage('Could not connect to kiosk service. Please try again.')
    }
  }

  return (
    <div className="kiosk-screen">
      <div className="kiosk-bg-mesh" />

      {/* Status bar */}
      <div className="kiosk-statusbar">
        <div className="statusbar__left">
          <div className="statusbar__dot" />
          <span className="statusbar__kiosk">{kioskId}</span>
          <span>Touchscreen PIN Release</span>
        </div>
        <div className="statusbar__right">
          <span>Printer: Online</span>
        </div>
      </div>

      <div className="kiosk-pin-screen kiosk-enter">
        <div className="kiosk-pin-header">
          <div className="kiosk-pin-badge">
            <Key size={18} weight="bold" />
            <span>ENTER RELEASE PIN</span>
          </div>
          <h1 className="kiosk-pin-title">Enter 4-Digit OTP</h1>
          <p className="kiosk-pin-sub">
            Type the 4-digit code shown on your phone after payment to release your print job.
          </p>
        </div>

        {/* 4 PIN Digit Display Boxes */}
        <div className={`kiosk-pin-display ${status === 'error' ? 'shake-anim' : ''}`}>
          {Array.from({ length: 4 }).map((_, i) => {
            const digit = pin[i]
            const isActive = i === pin.length && status !== 'success'
            return (
              <div
                key={i}
                className={`kiosk-pin-cell ${digit ? 'filled' : ''} ${isActive ? 'active' : ''} ${status === 'success' ? 'verified' : ''}`}
              >
                {digit || ''}
              </div>
            )
          })}
        </div>

        {/* Error / Success Feedback Banner */}
        {status === 'error' && (
          <div className="kiosk-pin-alert error">
            <WarningCircle size={20} weight="fill" />
            <span>{errorMessage}</span>
          </div>
        )}

        {status === 'success' && (
          <div className="kiosk-pin-alert success">
            <CheckCircle size={20} weight="fill" />
            <span>
              PIN Verified! Spooling {matchedOrder?.fileName || 'document'} ({matchedOrder?.copies || 1} copies)…
            </span>
          </div>
        )}

        {/* Touch Numeric Keypad */}
        <div className="kiosk-numpad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              className="kiosk-numpad-key"
              onClick={() => handleDigit(digit)}
              disabled={status === 'verifying' || status === 'success'}
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            className="kiosk-numpad-key action-key"
            onClick={handleClear}
            disabled={status === 'verifying' || status === 'success'}
            title="Clear PIN"
          >
            C
          </button>

          <button
            type="button"
            className="kiosk-numpad-key"
            onClick={() => handleDigit('0')}
            disabled={status === 'verifying' || status === 'success'}
          >
            0
          </button>

          <button
            type="button"
            className="kiosk-numpad-key action-key"
            onClick={handleBackspace}
            disabled={status === 'verifying' || status === 'success'}
            title="Backspace"
          >
            <Backspace size={24} weight="bold" />
          </button>
        </div>

        {/* Submit Action */}
        <div className="kiosk-pin-actions">
          <button
            type="button"
            className="kiosk-btn kiosk-btn-primary kiosk-pin-submit"
            onClick={handleVerify}
            disabled={pin.length !== 4 || status === 'verifying' || status === 'success'}
          >
            <Sparkle size={20} weight="fill" />
            {status === 'verifying' ? 'VERIFYING PIN…' : status === 'success' ? 'VERIFIED ✓' : 'VERIFY & PRINT'}
          </button>
        </div>
      </div>

      {/* Return button */}
      <div className="kiosk-back">
        <button
          type="button"
          className="kiosk-btn kiosk-btn-secondary"
          onClick={() => navigate('/')}
          disabled={status === 'verifying' || status === 'success'}
        >
          <ArrowLeft size={20} weight="bold" />
          BACK TO HOME ({pinIdleSeconds}s)
        </button>
      </div>
    </div>
  )
}
