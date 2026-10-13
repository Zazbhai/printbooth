import { useNavigate } from 'react-router-dom'
import { ArrowRight, QrCode, Key } from '@phosphor-icons/react'
import './KioskScreens.css'

export default function WelcomeScreen() {
  const navigate = useNavigate()

  return (
    <div className="kiosk-screen">
      <div className="kiosk-bg-mesh" />

      {/* Status bar */}
      <div className="kiosk-statusbar">
        <div className="statusbar__left">
          <div className="statusbar__dot" />
          <span className="statusbar__kiosk">PB-001</span>
          <span>MIT ADT University</span>
        </div>
        <div className="statusbar__right">
          <span>Printer: Ready</span>
          <span>Paper: 82%</span>
          <span id="kiosk-time" />
        </div>
      </div>

      {/* Main content */}
      <div className="kiosk-welcome kiosk-enter">
        <div className="kiosk-welcome__text">
          <h1 className="kiosk-title">
            Welcome to<br />
            <span style={{ color: 'var(--clr-accent-light)' }}>PrintBooth</span>
          </h1>
          <p className="kiosk-subtitle">
            Print your documents quickly and easily.<br />
            Already paid on your phone? Enter your 6-digit PIN below.
          </p>
        </div>

        <div className="kiosk-welcome__actions">
          <button
            className="kiosk-btn kiosk-btn-primary kiosk-pulse"
            onClick={() => navigate('/enter-pin')}
            id="kiosk-enter-pin"
            style={{ minWidth: 260 }}
          >
            <Key size={24} weight="bold" />
            ENTER PRINT PIN
          </button>

          <button
            className="kiosk-btn kiosk-btn-secondary"
            onClick={() => navigate('/upload')}
            id="kiosk-start"
            style={{ minWidth: 220 }}
          >
            <ArrowRight size={22} weight="bold" />
            NEW PRINT JOB
          </button>
        </div>

        <div className="kiosk-welcome__qr-hint">
          <QrCode size={18} />
          <span>Scan to upload from your phone</span>
        </div>
      </div>
    </div>
  )
}
