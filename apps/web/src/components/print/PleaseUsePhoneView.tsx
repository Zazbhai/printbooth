import { useState, useMemo, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check, ArrowLeft, DeviceMobile, QrCode } from '@phosphor-icons/react'
import { setAllowDesktopBypass } from '../../lib/deviceDetect'
import './PleaseUsePhoneView.css'

interface PleaseUsePhoneViewProps {
  kioskId?: string | null
  kioskName?: string | null
  onBypass?: () => void
}

export default function PleaseUsePhoneView({ kioskId, kioskName, onBypass }: PleaseUsePhoneViewProps) {
  const [copied, setCopied] = useState(false)

  // Current page URL to encode into QR code so the user can immediately scan with phone camera
  const currentUrl = useMemo(() => {
    const configuredBase = (import.meta.env.VITE_SITE_URL || import.meta.env.VITE_CLIENT_WEB_URL || '').trim().replace(/\/+$/, '')
    if (typeof window !== 'undefined') {
      let href = window.location.href
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const lanBase = configuredBase && !configuredBase.includes('192.168.1.4:')
          ? configuredBase
          : `${window.location.protocol}//${window.location.hostname}:5200`
        href = href.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, lanBase)
      }
      return href
    }
    const fallbackBase = configuredBase && !configuredBase.includes('192.168.1.4:')
      ? configuredBase
      : 'http://192.168.1.41:5200'
    return `${fallbackBase}/print`
  }, [])

  const handleCopyLink = useCallback(() => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(currentUrl).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2200)
      }).catch(() => {})
    }
  }, [currentUrl])

  const handleDeveloperBypass = useCallback(() => {
    setAllowDesktopBypass(true)
    if (onBypass) {
      onBypass()
    } else if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }, [onBypass])

  return (
    <div className="pu-root">
      <div className="pu-backdrop-glow" />

      <main className="pu-card">
        {/* Top Status Pill */}
        <div className="pu-badge">
          <DeviceMobile size={15} weight="bold" />
          <span className="pu-badge-dot" />
          <span>Mobile Device Required</span>
        </div>

        {/* ── Handcrafted Cool SVG Phone & Scanner Animation ── */}
        <div className="pu-anim-stage" aria-hidden="true">
          <svg
            className="pu-svg-element"
            viewBox="0 0 240 220"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Phone Outer Chassis Gradient */}
              <linearGradient id="puChassisGrad" x1="68" y1="20" x2="172" y2="198" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="50%" stopColor="#1e293b" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>

              {/* Phone Bezel Highlight */}
              <linearGradient id="puBezelGrad" x1="68" y1="20" x2="68" y2="198" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#94a3b8" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>

              {/* Laser-Red Screen Ambient Gradient */}
              <linearGradient id="puScreenGrad" x1="74" y1="30" x2="166" y2="190" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#090d16" />
                <stop offset="55%" stopColor="#111827" />
                <stop offset="100%" stopColor="#3b070c" />
              </linearGradient>

              {/* Scanning Laser Gradient with Intense Center */}
              <linearGradient id="puLaserGrad" x1="74" y1="0" x2="166" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#dc2626" stopOpacity="0" />
                <stop offset="25%" stopColor="#ef4444" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
                <stop offset="75%" stopColor="#ef4444" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
              </linearGradient>

              {/* Floating Document Sheet Gradient */}
              <linearGradient id="puDocGrad" x1="88" y1="58" x2="152" y2="142" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#e2e8f0" />
              </linearGradient>

              {/* Laser Soft Glow Filter */}
              <filter id="puLaserGlow" x="-20%" y="-100%" width="140%" height="300%">
                <feGaussianBlur stdDeviation="3.5" result="glow" />
                <feComposite in="SourceGraphic" in2="glow" operator="over" />
              </filter>
            </defs>

            {/* Dynamic Levitation Shadow beneath the Phone */}
            <ellipse
              cx="120"
              cy="204"
              rx="46"
              ry="7"
              fill="#64748b"
              className="pu-phone-shadow"
            />

            {/* Wireless / NFC Signal Waves Radiating from Top */}
            <g className="pu-waves">
              <path
                d="M102 18 C112 11, 128 11, 138 18"
                stroke="#dc2626"
                strokeLinecap="round"
                fill="none"
                className="pu-wave-1"
              />
              <path
                d="M94 11 C109 2, 131 2, 146 11"
                stroke="#ef4444"
                strokeLinecap="round"
                fill="none"
                className="pu-wave-2"
              />
              <path
                d="M86 4 C106 -7, 134 -7, 154 4"
                stroke="#f87171"
                strokeLinecap="round"
                fill="none"
                className="pu-wave-3"
              />
            </g>

            {/* Floating Smartphone Chassis */}
            <g className="pu-phone-chassis">
              {/* Outer Phone Border & Bezel */}
              <rect
                x="68"
                y="24"
                width="104"
                height="172"
                rx="24"
                fill="url(#puChassisGrad)"
                stroke="url(#puBezelGrad)"
                strokeWidth="2.5"
              />

              {/* Glowing Laser-Red OLED Screen */}
              <rect
                x="74"
                y="30"
                width="92"
                height="160"
                rx="18"
                fill="url(#puScreenGrad)"
              />

              {/* Dynamic Island / Camera Pill */}
              <rect
                x="102"
                y="36"
                width="36"
                height="7"
                rx="3.5"
                fill="#000000"
              />
              <circle cx="127" cy="39.5" r="1.5" fill="#1e293b" />

              {/* Sliding Floating Document Inside Screen */}
              <g className="pu-doc-sheet">
                {/* Paper Body */}
                <rect
                  x="90"
                  y="56"
                  width="60"
                  height="78"
                  rx="6"
                  fill="url(#puDocGrad)"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                {/* Folded Corner */}
                <path
                  d="M138 56 L150 68 L138 68 Z"
                  fill="#94a3b8"
                />

                {/* PrintBooth Laser-Red Mini Header */}
                <rect x="97" y="64" width="28" height="4" rx="2" fill="#dc2626" />

                {/* Document Content Text Rows */}
                <rect x="97" y="73" width="46" height="3" rx="1.5" fill="#94a3b8" />
                <rect x="97" y="79" width="40" height="3" rx="1.5" fill="#cbd5e1" />
                <rect x="97" y="85" width="44" height="3" rx="1.5" fill="#cbd5e1" />
                <rect x="97" y="91" width="34" height="3" rx="1.5" fill="#cbd5e1" />

                {/* Mini Stamp / QR Icon inside document */}
                <rect x="97" y="100" width="20" height="20" rx="3" fill="#fee2e2" />
                <circle cx="107" cy="110" r="4" fill="#dc2626" />
                <rect x="122" y="104" width="21" height="3" rx="1.5" fill="#94a3b8" />
                <rect x="122" y="110" width="16" height="3" rx="1.5" fill="#cbd5e1" />
              </g>

              {/* Scanning Laser Beam (sweeps up and down) */}
              <g className="pu-laser-beam">
                <line
                  x1="76"
                  y1="0"
                  x2="164"
                  y2="0"
                  stroke="url(#puLaserGrad)"
                  strokeWidth="3.5"
                  filter="url(#puLaserGlow)"
                />
              </g>

              {/* Bottom Home Indicator Bar */}
              <rect
                x="105"
                y="182"
                width="30"
                height="3.5"
                rx="1.75"
                fill="#ffffff"
                opacity="0.65"
              />
            </g>

            {/* Floating Sparkles & Accent Stars */}
            <g className="pu-sparkle-1">
              <path
                d="M48 60 L50 65 L55 67 L50 69 L48 74 L46 69 L41 67 L46 65 Z"
                fill="#dc2626"
              />
            </g>
            <g className="pu-sparkle-2">
              <path
                d="M192 108 L194 112 L198 114 L194 116 L192 120 L190 116 L186 114 L190 112 Z"
                fill="#ef4444"
              />
            </g>
          </svg>
        </div>

        {/* ── Main Typography ── */}
        <h1 className="pu-title">
          Please Use <span>Your Phone</span>
        </h1>
        <p className="pu-subtitle">
          PrintBooth is designed for quick mobile printing.
          Open this link on your smartphone to upload your documents.
          {kioskId && (
            <strong style={{ display: 'block', marginTop: 6, color: '#1e293b' }}>
              Station: {kioskName || kioskId}
            </strong>
          )}
        </p>

        {/* ── Instant Mobile QR Code + Copy Link Section ── */}
        <div className="pu-qr-section">
          <div className="pu-qr-socket" title="Scan with your phone camera">
            <QRCodeSVG
              value={currentUrl}
              size={170}
              level="M"
              includeMargin={false}
              fgColor="#0f172a"
              bgColor="#ffffff"
            />
          </div>

          <span className="pu-qr-badge">
            <QrCode size={18} weight="bold" color="#dc2626" />
            Scan with your phone camera to open instantly
          </span>

          <div className="pu-actions">
            <button
              type="button"
              className="pu-btn-neo pu-btn-primary"
              onClick={handleCopyLink}
              id="pu-copy-link-btn"
            >
              {copied ? (
                <>
                  <Check size={18} weight="bold" />
                  Link Copied!
                </>
              ) : (
                <>
                  <Copy size={18} weight="bold" />
                  Copy Link for Phone
                </>
              )}
            </button>

            <a
              href="/"
              className="pu-btn-neo"
              id="pu-back-home-btn"
            >
              <ArrowLeft size={18} weight="bold" />
              Back to Home
            </a>
          </div>
        </div>

        {/* Desktop continue link */}
        <button
          type="button"
          className="pu-dev-bypass"
          onClick={handleDeveloperBypass}
          title="Continue in this browser"
          id="pu-dev-bypass-btn"
        >
          Continue on desktop browser →
        </button>
      </main>
    </div>
  )
}
