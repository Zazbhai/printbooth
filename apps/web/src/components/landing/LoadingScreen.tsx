import { useEffect, useRef, useState, useCallback } from 'react'

interface LoadingScreenProps {
  progress?: number
  ready: boolean
  onComplete: () => void
}

export default function LoadingScreen({ ready, onComplete }: LoadingScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [internalProgress, setInternalProgress] = useState(0)
  const [isEjected, setIsEjected] = useState(false)
  const hasFinishedRef = useRef(false)

  // Rhythmic, energetic printer stepper motor progression via requestAnimationFrame
  useEffect(() => {
    let rafId: number
    let lastTime = performance.now()
    let current = 0

    const tick = (now: number) => {
      if (hasFinishedRef.current) return
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now

      // Dynamic snappy printer stepper velocity curve
      let speed = 75
      if (current < 25) {
        speed = 90
      } else if (current < 75) {
        speed = 100
      } else if (current < 95) {
        speed = ready ? 125 : 55
      } else {
        speed = ready ? 150 : 60
      }

      current = Math.min(100, current + speed * dt)
      setInternalProgress(current)

      if (current < 100) {
        rafId = requestAnimationFrame(tick)
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [ready])

  const finishAndTransition = useCallback(() => {
    if (hasFinishedRef.current) return
    hasFinishedRef.current = true

    // Quick, punchy paper eject
    setIsEjected(true)
    setTimeout(() => {
      onComplete()
    }, 400)
  }, [onComplete])

  useEffect(() => {
    if (internalProgress >= 100 && !hasFinishedRef.current) {
      finishAndTransition()
    }
  }, [internalProgress, finishAndTransition])

  // Paper height out of the slot (0% to 100%)
  const paperHeightPct = Math.min(100, Math.round(internalProgress))

  const statusMessage = (() => {
    if (internalProgress < 25) return 'INITIALIZING HARDWARE…'
    if (internalProgress < 55) return 'CALIBRATING OPTICAL SENSORS…'
    if (internalProgress < 85) return 'SYNCHRONIZING PRINTER…'
    if (internalProgress < 100) return 'PREPARING BOOTH…'
    return 'SYSTEM READY'
  })()

  return (
    <div
      ref={containerRef}
      className={`loading-screen ${isEjected ? 'loading-screen--ejected' : ''}`}
      onClick={finishAndTransition}
    >
      <div className="printer-anim-container">
        {/* Brand label */}
        <div className="printer-anim-brand">
          <span className="brand-dot" />
          <span className="brand-name">PRINTBOOTH</span>
          <span className="brand-init-tag">INITIALIZING</span>
        </div>

        {/* The Animated Printer Device */}
        <div className="printer-device">
          {/* Top Paper Input (Feeding into printer) */}
          <div className="printer-input-slot">
            <div
              className="printer-paper-input"
              style={{
                transform: `translateY(${Math.min(30, (100 - internalProgress) * 0.3)}px)`,
                opacity: internalProgress > 90 ? 0.3 : 1,
              }}
            />
          </div>

          {/* Main Printer Body */}
          <div className="printer-chassis">
            <div className="printer-face">
              <div className="printer-led-bar">
                <span className="printer-led printer-led--active" />
                <span className="printer-model-name">PB-600 DUPLEX</span>
              </div>
              <div className="printer-status-text">
                {statusMessage}
              </div>
            </div>

            {/* Front Paper Ejection Slot */}
            <div className="printer-output-slot">
              <div className="slot-dark-cavity" />
              {/* Laser Printhead Line sweeping across the slot */}
              <div className="printer-laser-sweep" />
            </div>
          </div>

          {/* Extruding Printed Paper (Feeding downward out of the front slot) */}
          <div className="printer-output-bay">
            <div
              className={`printer-paper-sheet ${isEjected ? 'is-ejected' : ''}`}
              style={{
                height: `${Math.max(12, paperHeightPct * 1.6)}px`,
              }}
            >
              {/* Laser Print line on the paper */}
              <div className="paper-laser-head" />

              {/* Realistic Printed Content Lines appearing as it prints */}
              <div className="paper-printed-lines">
                <div className="print-line print-line--header" />
                <div className="print-line print-line--1" style={{ opacity: internalProgress > 15 ? 1 : 0 }} />
                <div className="print-line print-line--2" style={{ opacity: internalProgress > 30 ? 1 : 0 }} />
                <div className="print-line print-line--3" style={{ opacity: internalProgress > 45 ? 1 : 0 }} />
                <div className="print-line print-line--barcode" style={{ opacity: internalProgress > 60 ? 1 : 0 }} />
                <div className="print-line print-line--4" style={{ opacity: internalProgress > 75 ? 1 : 0 }} />
                <div className="print-line print-line--5" style={{ opacity: internalProgress > 88 ? 1 : 0 }} />
              </div>
            </div>
          </div>
        </div>

        {/* Minimal Progress Readout */}
        <div className="printer-progress-box">
          <div className="printer-progress-row">
            <span className="printer-status-label">
              {internalProgress < 100 ? 'INITIALIZING PRINTBOOTH…' : 'SYSTEM READY'}
            </span>
            <span className="printer-progress-pct">{Math.round(internalProgress)}%</span>
          </div>
          <div className="printer-progress-track">
            <div className="printer-progress-fill" style={{ width: `${internalProgress}%` }} />
          </div>
          <div className="printer-progress-hint">
            <span>Self-service kiosk starting up…</span>
          </div>
        </div>
      </div>
    </div>
  )
}
