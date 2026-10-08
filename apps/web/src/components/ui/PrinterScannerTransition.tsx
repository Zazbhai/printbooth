import React, { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import './PrinterScannerTransition.css'

export type ScanPhase = 'idle' | 'erasing' | 'revealing'

interface PrinterScannerTransitionProps {
  pageKey: string
  scanPhase: ScanPhase
  children: React.ReactNode
}

/**
 * High-tech Printer Scanner Wipe Transition
 * Animates a luminous crimson-red laser line sweeping across the full 100vw screen,
 * erasing outgoing contents and materializing incoming contents like a precision flatbed scanner.
 */
export function PrinterScannerTransition({
  pageKey,
  scanPhase,
  children,
}: PrinterScannerTransitionProps) {
  const isScanning = scanPhase !== 'idle'
  const prevPageKeyRef = useRef(pageKey)
  const [internalPhase, setInternalPhase] = useState<ScanPhase>(scanPhase)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Keep internal phase in sync with parent scanPhase
  useEffect(() => {
    setInternalPhase(scanPhase)
  }, [scanPhase])

  // If pageKey changes externally (e.g. browser history back/forward) while idle,
  // trigger a smooth reveal scan pass
  useEffect(() => {
    if (pageKey !== prevPageKeyRef.current) {
      prevPageKeyRef.current = pageKey
      if (scanPhase === 'idle') {
        setInternalPhase('revealing')
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          setInternalPhase('idle')
        }, 340)
      }
    }
  }, [pageKey, scanPhase])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const activePhase = internalPhase !== 'idle' ? internalPhase : scanPhase
  const phaseClass = activePhase === 'erasing'
    ? 'pst-erasing'
    : activePhase === 'revealing'
    ? 'pst-revealing'
    : 'pst-idle'

  return (
    <div
      className={`pst-root ${isScanning ? 'pst-scanning' : 'pst-idle'} ${phaseClass}`}
      id="printer-scanner-transition-viewport"
    >
      {/* Full-Screen Laser Scanner Portal (Sequential: Vertical for Closing, Horizontal for Opening) */}
      {(activePhase === 'erasing' || activePhase === 'revealing') &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className={`pst-fullscreen-beam-portal ${phaseClass}`} aria-hidden="true">
            {/* Sequential Phase 1: Vertical sweep for closing (top to bottom wipe) */}
            {activePhase === 'erasing' && (
              <div className="pst-vertical-close-beam">
                <div className="pst-laser-bar-h" />
                <div className="pst-trail-wash-h" />
              </div>
            )}

            {/* Sequential Phase 2: Horizontal sweep for opening (left to right wipe) */}
            {activePhase === 'revealing' && (
              <div className="pst-horizontal-open-beam">
                <div className="pst-laser-bar-v" />
                <div className="pst-trail-wash-v" />
              </div>
            )}
          </div>,
          document.body
        )}

      {/* Screen Content receiving the laser clip wipe */}
      <div className="pst-content" key={pageKey}>
        {children}
      </div>
    </div>
  )
}

export default PrinterScannerTransition
