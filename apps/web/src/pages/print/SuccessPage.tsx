import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, Printer, ArrowRight, House } from '@phosphor-icons/react'
import { usePrintNavigate as useNavigate } from './PrintFlowContext'
import { clearUploadedDoc } from '@/lib/documentStore'
import { clearAllFiles } from '@/lib/multiFileStore'
import './SuccessPage.css'

export default function SuccessPage() {
  const navigate = useNavigate()
  const [countdown, setCountdown] = useState(3)
  const orderId = sessionStorage.getItem('pb_order_id') ?? 'PB-000001'
  const fileName = sessionStorage.getItem('pb_file_name') ?? 'document.pdf'

  const handleReturnToPrint = useCallback(() => {
    // Thoroughly clear file stores and session data
    clearUploadedDoc()
    clearAllFiles()
    sessionStorage.removeItem('pb_file_name')
    sessionStorage.removeItem('pb_file_size')
    sessionStorage.removeItem('pb_settings')
    sessionStorage.removeItem('pb_page_count')
    sessionStorage.removeItem('pb_total_price')
    sessionStorage.removeItem('pb_order_id')
    sessionStorage.removeItem('pb_files')
    sessionStorage.removeItem('pb_print_step')
    navigate('/print')
  }, [navigate])

  useEffect(() => {
    // 1-second interval to update countdown UI
    const countdownInterval = setInterval(() => {
      setCountdown(prev => (prev > 1 ? prev - 1 : 0))
    }, 1000)

    // Auto redirect back to /print after 3 seconds
    const redirectTimeout = setTimeout(() => {
      handleReturnToPrint()
    }, 3000)

    return () => {
      clearInterval(countdownInterval)
      clearTimeout(redirectTimeout)
    }
  }, [handleReturnToPrint])

  return (
    <div className="success-page animate-fadeInUp">
      <div className="success-icon-shell">
        <div className="success-icon-core">
          <CheckCircle size={52} weight="fill" className="success-icon" />
        </div>
      </div>

      <div className="success-content">
        <h1 className="success-title">Printing Complete</h1>
        <p className="success-sub">
          Your documents have been cleanly printed. Please collect your sheets directly from the output tray.
        </p>
      </div>

      {/* Auto-return banner */}
      <div className="success-redirect-badge">
        <span className="success-redirect-dot" />
        <span>Returning to start in <strong>{countdown}s</strong></span>
      </div>

      {/* Double-Bezel Order Receipt Card */}
      <div className="success-card-shell">
        <div className="success-card">
          <div className="success-detail">
            <span className="success-detail__label">Order ID</span>
            <span className="success-detail__value mono">{orderId}</span>
          </div>
          <div className="success-detail">
            <span className="success-detail__label">Document</span>
            <span className="success-detail__value">{fileName}</span>
          </div>
          <div className="success-detail">
            <span className="success-detail__label">Status</span>
            <span className="success-status-badge">
              <span className="success-status-dot" />
              Completed &amp; Released
            </span>
          </div>
        </div>
      </div>

      <div className="success-notice">
        <Printer size={18} weight="duotone" className="success-notice-icon" />
        <p>
          Your document file has been safely queued for immediate deletion.
          Zero files are retained on our servers.
        </p>
      </div>

      <div className="success-actions">
        <button
          type="button"
          onClick={handleReturnToPrint}
          className="success-btn-primary"
          id="success-print-another"
          style={{ border: 'none', cursor: 'pointer' }}
        >
          <span>Print Again ({countdown}s)</span>
          <span className="success-btn-circle">
            <ArrowRight size={14} weight="bold" />
          </span>
        </button>
        <Link
          to="/"
          onClick={handleReturnToPrint}
          className="success-btn-ghost"
          id="success-go-home"
        >
          <House size={15} weight="bold" />
          <span>Home</span>
        </Link>
      </div>
    </div>
  )
}
