import React, { useState, useEffect, useCallback } from 'react'
import {
  LockKey,
  ArrowsClockwise,
  MapPin,
  House,
  Printer,
  Sparkle,
  CheckCircle,
} from '@phosphor-icons/react'
import { getApiBase } from '@/lib/api'
import './MachineInUseView.css'

interface MachineInUseViewProps {
  kioskId?: string
  kioskName?: string
  token?: string | null
  onRetry?: () => void
  onSelectOtherKiosk: () => void
  onGoHome: () => void
}

export const MachineInUseView: React.FC<MachineInUseViewProps> = ({
  kioskId = 'PB-001',
  kioskName,
  token: _token,
  onRetry,
  onSelectOtherKiosk,
  onGoHome,
}) => {
  const [isChecking, setIsChecking] = useState(false)
  const [isNowAvailable, setIsNowAvailable] = useState(false)
  const [lastCheckedText, setLastCheckedText] = useState('Checking station…')

  const checkAvailability = useCallback(async () => {
    setIsChecking(true)
    try {
      const apiBase = getApiBase()
      const res = await fetch(`${apiBase}/api/kiosk-sessions/active/${encodeURIComponent(kioskId)}`)
      const data = await res.json()

      // If active session is QR_READY or there is no busy active session, machine became free!
      if (!data.hasActiveSession || data.session?.state === 'QR_READY' || data.isExpired) {
        setIsNowAvailable(true)
        setLastCheckedText('Station is now free! You can connect now.')
      } else {
        setIsNowAvailable(false)
        const phaseLabel = data.session?.phase || 'Active print in progress'
        setLastCheckedText(`Station busy: ${phaseLabel}`)
      }
    } catch {
      setLastCheckedText('Station status pending…')
    } finally {
      setIsChecking(false)
    }
  }, [kioskId])

  // Periodic polling every 4 seconds to detect when current customer finishes
  useEffect(() => {
    checkAvailability()
    const interval = setInterval(checkAvailability, 4000)
    return () => clearInterval(interval)
  }, [checkAvailability])

  const handleManualCheck = () => {
    if (isNowAvailable && onRetry) {
      onRetry()
    } else {
      checkAvailability()
    }
  }

  return (
    <div className="miu-container">
      <div className="miu-card">
        {/* Decorative laser-red radial glow */}
        <div className="miu-glow" />

        {/* Status Badge */}
        <div className="miu-badge-wrapper">
          <div className="miu-icon-badge">
            <div className="miu-pulse-ring" />
            <LockKey size={34} weight="duotone" />
          </div>
        </div>

        <div>
          <span className="miu-status-pill">
            <span className="miu-status-dot" />
            Terminal Busy · Hardware In Use
          </span>
        </div>

        {/* Main Title */}
        <h1 className="miu-title">Machine Already in Use</h1>

        {/* Narrative Description */}
        <p className="miu-description">
          Another customer has already scanned the QR code and is actively printing at{' '}
          <strong>{kioskName ? `${kioskName} (${kioskId})` : `Station ${kioskId}`}</strong>.
          <br />
          For security and privacy, each printing station serves one customer at a time.
        </p>

        {/* Kiosk Telemetry Card */}
        <div className="miu-station-card">
          <div className="miu-station-info">
            <div className="miu-station-icon">
              <Printer size={22} weight="duotone" />
            </div>
            <div>
              <div className="miu-station-name">{kioskName || `PrintBooth ${kioskId}`}</div>
              <div className="miu-station-id">Station ID: {kioskId}</div>
            </div>
          </div>
          <div className="miu-station-state">
            <LockKey size={13} weight="bold" />
            {isNowAvailable ? 'FREE NOW' : 'OCCUPIED'}
          </div>
        </div>

        {/* Real-time status update bar */}
        <div
          className="miu-telemetry-banner"
          style={{
            borderColor: isNowAvailable ? 'rgba(34, 197, 94, 0.4)' : undefined,
            background: isNowAvailable ? '#f0fdf4' : undefined,
            color: isNowAvailable ? '#15803d' : undefined,
          }}
        >
          {isNowAvailable ? (
            <CheckCircle size={16} weight="fill" color="#16a34a" />
          ) : isChecking ? (
            <ArrowsClockwise size={16} weight="bold" className="miu-spin" />
          ) : (
            <Sparkle size={16} weight="duotone" />
          )}
          <span>{lastCheckedText}</span>
        </div>

        {/* Action Controls */}
        <div className="miu-actions">
          <button
            type="button"
            className="miu-btn-primary"
            onClick={handleManualCheck}
            disabled={isChecking}
            style={
              isNowAvailable
                ? {
                    background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    boxShadow: '0 8px 20px -4px rgba(22, 163, 74, 0.4)',
                  }
                : undefined
            }
          >
            <ArrowsClockwise size={18} weight="bold" className={isChecking ? 'miu-spin' : ''} />
            {isNowAvailable ? 'Station Free · Tap to Connect' : isChecking ? 'Checking Station…' : 'Check Availability'}
          </button>

          <button
            type="button"
            className="miu-btn-secondary"
            onClick={onSelectOtherKiosk}
          >
            <MapPin size={18} weight="duotone" />
            Choose Another Station
          </button>

          <button
            type="button"
            className="miu-btn-ghost"
            onClick={onGoHome}
          >
            <House size={16} weight="duotone" />
            Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}
