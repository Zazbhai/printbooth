import React, { useState, useEffect, useRef } from 'react'
import { ClockCountdown, QrCode, ArrowCounterClockwise, Storefront, CircleNotch, X } from '@phosphor-icons/react'
import './SessionExpiredView.css'

interface SessionExpiredViewProps {
  kioskId?: string
  kioskName?: string
  message?: string
  onRescan?: () => void | Promise<void>
  onChooseStation?: () => void
}

export const SessionExpiredView: React.FC<SessionExpiredViewProps> = ({
  kioskId = 'PB-001',
  kioskName,
  message,
  onRescan,
  onChooseStation,
}) => {
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(3)
  const redirectedRef = useRef(false)

  const handleReload = async () => {
    if (loading || redirectedRef.current) return
    redirectedRef.current = true
    setLoading(true)
    const cleanUrl = `/print?id=${encodeURIComponent(kioskId)}`
    try {
      if (onRescan) {
        await onRescan()
      } else {
        window.location.replace(cleanUrl)
      }
    } catch {
      window.location.replace(cleanUrl)
    } finally {
      setLoading(false)
    }
  }

  // 3-second auto-redirect countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          handleReload()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [kioskId])

  const handleSelectStation = () => {
    redirectedRef.current = true
    if (onChooseStation) {
      onChooseStation()
    } else {
      window.location.replace('/print?step=kiosk')
    }
  }

  return (
    <div className="session-expired-root" id="session-expired-view">
      <div className="session-expired-ambient" />
      <div className="session-expired-card">
        <button
          type="button"
          className="session-expired-close-btn"
          onClick={handleReload}
          title="Dismiss and return to print"
          aria-label="Dismiss and return to print"
        >
          <X size={16} weight="bold" />
        </button>

        <div className="session-expired-icon-wrap">
          <div className="session-expired-icon-pulse" />
          <ClockCountdown size={38} weight="duotone" color="#ef4444" />
        </div>

        <div className="session-expired-pill">
          <span>Security Guard</span>
        </div>

        <h2 className="session-expired-title">QR Code Expired</h2>
        <p className="session-expired-desc">
          {message ||
            'This print link has expired or was already completed. PrintBooth QR codes rotate automatically for privacy and live station syncing.'}
        </p>

        <div className="session-expired-countdown-pill">
          <CircleNotch size={14} weight="bold" className="animate-spin" />
          <span>Redirecting to upload in <strong>{countdown}s</strong>…</span>
        </div>

        <div className="session-expired-kiosk-box">
          <span className="session-expired-kiosk-label">Target Station</span>
          <span className="session-expired-kiosk-value">
            <QrCode size={16} weight="bold" />
            {kioskId} {kioskName ? `· ${kioskName}` : ''}
          </span>
        </div>

        <div className="session-expired-actions">
          <button
            type="button"
            className="session-expired-primary-btn"
            onClick={handleReload}
            disabled={loading}
            id="expired-scan-live-btn"
          >
            {loading ? (
              <CircleNotch size={18} weight="bold" className="animate-spin" />
            ) : (
              <ArrowCounterClockwise size={18} weight="bold" />
            )}
            {loading ? 'Redirecting to Print…' : `Return to Print Now (${countdown}s)`}
          </button>

          <button
            type="button"
            className="session-expired-secondary-btn"
            onClick={handleSelectStation}
            disabled={loading}
            id="expired-choose-station-btn"
          >
            <Storefront size={17} weight="bold" />
            Choose Another Station
          </button>
        </div>
      </div>
    </div>
  )
}

export default SessionExpiredView
