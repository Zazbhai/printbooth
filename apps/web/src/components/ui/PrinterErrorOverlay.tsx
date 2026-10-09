import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import './PrinterErrorOverlay.css'

export interface PrinterErrorOverlayProps {
  isOpen: boolean
  title?: string
  reason?: string
  detail?: string
  kioskName?: string
  printerName?: string
  isChecking?: boolean
  onRetry?: () => void
  onDismiss?: () => void
  onFindKiosk?: () => void
}

export const PrinterErrorOverlay: React.FC<PrinterErrorOverlayProps> = ({
  isOpen,
  title,
  detail,
  onFindKiosk,
}) => {
  // Manage body class to hide navbar and back button when offline overlay is active
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('printer-offline-active')
    } else {
      document.body.classList.remove('printer-offline-active')
    }
    return () => {
      document.body.classList.remove('printer-offline-active')
    }
  }, [isOpen])

  if (!isOpen) return null

  const displayTitle = title || 'PRINTER OFFLINE'

  return createPortal(
    <AnimatePresence>
      <motion.div
        id="oopss"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="oopss-title"
      >
        <div id="error-text">
          {/* Inlined 60fps GPU-Accelerated Mascot — Zero external HTTP/rawgit dependency */}
          <div className="oopss-img-wrap">
            <svg
              className="sad-mascot-svg"
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
              <g className="sad-mascot-group">
                <circle cx="50" cy="50" r="40" fill="#ffffff" stroke="#000000" strokeWidth="6" strokeMiterlimit="10" />
                <path
                  d="M31.866,71.591c2.57-7.556,9.709-13,18.134-13s15.564,5.444,18.134,13"
                  stroke="#000000"
                  strokeWidth="5"
                  strokeLinecap="round"
                  fill="none"
                  strokeMiterlimit="10"
                />
                <line x1="27.5" y1="32.409" x2="39.5" y2="44.409" stroke="#000000" strokeWidth="5" strokeLinecap="round" strokeMiterlimit="10" />
                <line x1="27.5" y1="44.409" x2="39.5" y2="32.409" stroke="#000000" strokeWidth="5" strokeLinecap="round" strokeMiterlimit="10" />
                <line x1="60.5" y1="32.409" x2="72.5" y2="44.409" stroke="#000000" strokeWidth="5" strokeLinecap="round" strokeMiterlimit="10" />
                <line x1="60.5" y1="44.409" x2="72.5" y2="32.409" stroke="#000000" strokeWidth="5" strokeLinecap="round" strokeMiterlimit="10" />
              </g>
            </svg>
          </div>

          {/* Headline */}
          <span id="oopss-title" className="oopss-title">
            {displayTitle}
          </span>

          {detail && (
            <p className="p-a" style={{ marginTop: '16px', fontSize: '1.05rem', opacity: 0.92, fontWeight: 500, maxWidth: '480px' }}>
              {detail}
            </p>
          )}

          {onFindKiosk && (
            <button
              type="button"
              className="oopss-switch-btn"
              onClick={onFindKiosk}
              style={{
                marginTop: '22px',
                padding: '12px 28px',
                borderRadius: '9999px',
                background: 'rgba(255, 255, 255, 0.18)',
                border: '1.5px solid rgba(255, 255, 255, 0.45)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                letterSpacing: '0.02em',
                transition: 'all 0.2s ease',
              }}
            >
              Choose Another Station
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

export default PrinterErrorOverlay

