import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import './PaymentStatusModal.css'

export interface PaymentStatusModalProps {
  status: 'SUCCESS' | 'FAILED' | null
  onClose?: () => void
}

/**
 * Centered Payment Status Modal
 * Displays ONLY an animated tick (checkmark) for SUCCESS or an animated cross (X) for FAILED.
 * Portaled to document.body for zero layout shift.
 */
export function PaymentStatusModal({ status, onClose }: PaymentStatusModalProps) {
  useEffect(() => {
    if (status === 'FAILED') {
      const timer = setTimeout(() => {
        onClose?.()
      }, 2600)
      return () => clearTimeout(timer)
    }
  }, [status, onClose])

  if (!status) return null

  const content = (
    <div
      className="payment-status-overlay"
      onClick={() => {
        if (status === 'FAILED') onClose?.()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={status === 'SUCCESS' ? 'Payment Successful' : 'Payment Failed'}
    >
      <div
        className={`payment-status-card ${status.toLowerCase()}`}
        onClick={e => {
          if (status === 'FAILED') {
            e.stopPropagation()
            onClose?.()
          }
        }}
      >
        {status === 'SUCCESS' ? (
          <svg className="status-anim-svg success-svg" viewBox="0 0 52 52">
            <circle className="status-anim-circle success-circle" cx="26" cy="26" r="23" fill="none" />
            <path className="status-anim-check" fill="none" d="M14.5 27.2l7.5 7.5 15.5-16.5" />
          </svg>
        ) : (
          <svg className="status-anim-svg failed-svg" viewBox="0 0 52 52">
            <circle className="status-anim-circle failed-circle" cx="26" cy="26" r="23" fill="none" />
            <line className="status-anim-line line-1" x1="16.5" y1="16.5" x2="35.5" y2="35.5" />
            <line className="status-anim-line line-2" x1="35.5" y1="16.5" x2="16.5" y2="35.5" />
          </svg>
        )}
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }
  return content
}

export default PaymentStatusModal
