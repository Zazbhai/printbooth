import React, { useState, useEffect, useCallback } from 'react'
import { getApiBase } from '@/lib/api'
import './MachineInUseView.css'

interface MachineInUseViewProps {
  kioskId?: string
  kioskName?: string
  token?: string | null
  onPrinterFree?: () => void
  onRetry?: () => void
  onSelectOtherKiosk?: () => void
  onGoHome?: () => void
}

export const MachineInUseView: React.FC<MachineInUseViewProps> = ({
  kioskId = 'PB-001',
  onPrinterFree,
  onRetry,
}) => {
  const [, setIsFree] = useState(false)

  const checkAvailability = useCallback(async () => {
    try {
      const apiBase = getApiBase()
      // Check both active kiosk session state and hardware printer status
      const [sessRes, hwRes] = await Promise.all([
        fetch(`${apiBase}/api/kiosk-sessions/active/${encodeURIComponent(kioskId)}`).catch(() => null),
        fetch(`${apiBase}/api/printer/status?kioskId=${encodeURIComponent(kioskId)}`).catch(() => null),
      ])

      let sessionFree = true
      if (sessRes && sessRes.ok) {
        const sessData = await sessRes.json().catch(() => null)
        if (
          sessData &&
          sessData.hasActiveSession &&
          sessData.session?.state &&
          sessData.session.state !== 'QR_READY' &&
          sessData.session.state !== 'DONE' &&
          sessData.session.state !== 'CANCELLED' &&
          !sessData.isExpired
        ) {
          sessionFree = false
        }
      }

      let hwFree = true
      if (hwRes && hwRes.ok) {
        const hwData = await hwRes.json().catch(() => null)
        if (hwData && (hwData.printerStatus === 'BUSY' || hwData.printerStatus === 'PRINTING' || hwData.isBusy === true)) {
          hwFree = false
        }
      }

      const available = sessionFree && hwFree
      if (available) {
        setIsFree(true)
        if (onPrinterFree) {
          onPrinterFree()
        } else if (onRetry) {
          onRetry()
        }
      } else {
        setIsFree(false)
      }
    } catch {
      // Non-blocking status probe
    }
  }, [kioskId, onPrinterFree, onRetry])

  // Poll station availability every 2 seconds until the printer becomes free
  useEffect(() => {
    checkAvailability()
    const interval = setInterval(checkAvailability, 2000)
    return () => clearInterval(interval)
  }, [checkAvailability])

  return (
    <div className="miu-fullscreen-container" role="alert" aria-live="polite">
      <div className="miu-ambient-glow" />

      <main className="miu-card">
        {/* Handcrafted animated printer SVG */}
        <div className="miu-stage" aria-hidden="true">
          <svg
            className="miu-svg-art"
            viewBox="0 0 280 230"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="miu-body-grad" x1="0" y1="0" x2="280" y2="230" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#1e2430" />
                <stop offset="50%" stopColor="#141822" />
                <stop offset="100%" stopColor="#0c0e14" />
              </linearGradient>

              <linearGradient id="miu-paper-grad" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="85%" stopColor="#f1f5f9" />
                <stop offset="100%" stopColor="#e2e8f0" />
              </linearGradient>

              <linearGradient id="miu-laser-beam" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(220, 38, 38, 0)" />
                <stop offset="35%" stopColor="rgba(220, 38, 38, 0.6)" />
                <stop offset="50%" stopColor="#ef4444" />
                <stop offset="65%" stopColor="rgba(220, 38, 38, 0.6)" />
                <stop offset="100%" stopColor="rgba(220, 38, 38, 0)" />
              </linearGradient>

              <filter id="miu-glow-filter" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Printer Base Shadow */}
            <ellipse cx="140" cy="208" rx="100" ry="12" fill="rgba(15, 23, 42, 0.12)" />

            {/* Input Paper Tray (Top Rear) */}
            <rect x="85" y="24" width="110" height="48" rx="6" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1.5" />
            <rect x="92" y="32" width="96" height="36" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
            <line x1="102" y1="42" x2="178" y2="42" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="102" y1="50" x2="164" y2="50" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="3 3" />

            {/* Rear Tray Wall */}
            <path d="M72 64 L208 64 L200 78 L80 78 Z" fill="#334155" />

            {/* Main Printer Body */}
            <rect
              x="50"
              y="74"
              width="180"
              height="108"
              rx="18"
              fill="url(#miu-body-grad)"
              stroke="#334155"
              strokeWidth="1.5"
            />

            {/* Subtle Metallic Highlight Rim */}
            <path
              d="M52 88 Q140 82 228 88"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />

            {/* Feed Slot */}
            <rect x="75" y="116" width="130" height="8" rx="4" fill="#05070a" />

            {/* Moving Printed Sheet (Feeds downward through slot) */}
            <g className="miu-anim-paper">
              <rect
                x="82"
                y="118"
                width="116"
                height="68"
                rx="5"
                fill="url(#miu-paper-grad)"
                stroke="#cbd5e1"
                strokeWidth="1"
              />
              {/* Printed Text Lines */}
              <line x1="94" y1="134" x2="186" y2="134" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="94" y1="144" x2="174" y2="144" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="94" y1="154" x2="180" y2="154" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="94" y1="164" x2="140" y2="164" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" />
            </g>

            {/* Output Catch Tray Underneath */}
            <path
              d="M74 168 L82 196 L198 196 L206 168 Z"
              fill="#1e293b"
              stroke="#475569"
              strokeWidth="1.5"
            />

            {/* Front Panel Bezel */}
            <rect x="68" y="86" width="144" height="20" rx="6" fill="#0f172a" stroke="#334155" strokeWidth="1" />

            {/* Status LED (Pulsing Busy Red Light) */}
            <g className="miu-anim-led">
              <circle cx="82" cy="96" r="4.5" fill="#ef4444" filter="url(#miu-glow-filter)" />
              <circle cx="82" cy="96" r="2.5" fill="#ffffff" />
            </g>

            {/* Mini LCD Display on Printer Face */}
            <rect x="94" y="90" width="80" height="12" rx="3" fill="#090d16" />
            <line x1="100" y1="96" x2="136" y2="96" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" className="miu-anim-lcd-pulse" />

            {/* Active Sweeping Laser Scan Beam */}
            <g className="miu-anim-laser">
              <rect x="78" y="118" width="124" height="3" fill="url(#miu-laser-beam)" />
            </g>

            {/* Power / Status Indicator Dot */}
            <circle cx="196" cy="96" r="3" fill="#22c55e" opacity="0.8" />
          </svg>
        </div>

        {/* Text exactly as requested */}
        <h1 className="miu-title">Printer is in use</h1>
        <p className="miu-subtitle">Please wait while the printer finishes the current print job</p>
      </main>
    </div>
  )
}
