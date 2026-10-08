import './MascotUnavailable.css'

interface MascotUnavailableProps {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  showBadge?: boolean
  className?: string
}

export const MascotUnavailable: React.FC<MascotUnavailableProps> = ({
  size = 'sm',
  label = 'Unavailable',
  showBadge = true,
  className = '',
}) => {
  return (
    <div className={`mascot-unavailable mascot-unavailable--${size} ${className}`}>
      <div className="mascot-avatar-wrap">
        {/* Animated Floating Zzz */}
        <div className="mascot-zzz-layer" aria-hidden="true">
          <span className="mascot-z z-1">z</span>
          <span className="mascot-z z-2">z</span>
          <span className="mascot-z z-3">Z</span>
        </div>

        {/* Mascot SVG Vector Illustration */}
        <svg
          viewBox="0 0 72 72"
          className="mascot-svg"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Sleeping kiosk mascot"
        >
          {/* Subtle Drop Shadow */}
          <ellipse cx="36" cy="67" rx="20" ry="3.5" fill="rgba(15, 23, 42, 0.12)" className="mascot-shadow" />

          {/* Antenna */}
          <g className="mascot-antenna-group">
            <line x1="36" y1="18" x2="36" y2="10" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="36" cy="8" r="4" fill="#f59e0b" className="mascot-antenna-bulb" />
            <circle cx="36" cy="8" r="7" fill="#f59e0b" opacity="0.3" className="mascot-antenna-glow" />
          </g>

          {/* Kiosk Robot Body */}
          <rect
            x="14"
            y="18"
            width="44"
            height="46"
            rx="14"
            fill="url(#mascot-body-gradient)"
            stroke="rgba(255, 255, 255, 0.6)"
            strokeWidth="1.5"
          />

          {/* Glossy Screen / Visor */}
          <rect
            x="20"
            y="25"
            width="32"
            height="22"
            rx="8"
            fill="#0f172a"
            stroke="rgba(148, 163, 184, 0.25)"
            strokeWidth="1"
          />

          {/* Screen Glass Reflection */}
          <path
            d="M 23 27 L 46 27 C 48 27 50 29 49 32 L 44 38 L 22 38 C 21 34 21 29 23 27 Z"
            fill="rgba(255, 255, 255, 0.08)"
          />

          {/* Sleepy Eyes (Curved Sleeping Slits) */}
          <g className="mascot-sleepy-eyes">
            {/* Left Eye */}
            <path
              d="M 26 36 Q 29 40 32 36"
              stroke="#fbbf24"
              strokeWidth="2.4"
              strokeLinecap="round"
              fill="none"
            />
            {/* Right Eye */}
            <path
              d="M 40 36 Q 43 40 46 36"
              stroke="#fbbf24"
              strokeWidth="2.4"
              strokeLinecap="round"
              fill="none"
            />
          </g>

          {/* Rosy Cheeks */}
          <circle cx="25" cy="41" r="2.2" fill="#fb7185" opacity="0.65" />
          <circle cx="47" cy="41" r="2.2" fill="#fb7185" opacity="0.65" />

          {/* Cute Little Sleepy Mouth */}
          <path
            d="M 34 41 Q 36 43 38 41"
            stroke="#94a3b8"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />

          {/* Printer Output Slot & Sleeping Paper Tongue */}
          <rect x="24" y="52" width="24" height="4" rx="2" fill="#1e293b" />
          <rect
            x="28"
            y="54"
            width="16"
            height="7"
            rx="2"
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth="0.8"
            className="mascot-paper-tongue"
          />

          {/* Definitions */}
          <defs>
            <linearGradient id="mascot-body-gradient" x1="14" y1="18" x2="58" y2="64" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f1f5f9" />
              <stop offset="0.5" stopColor="#e2e8f0" />
              <stop offset="1" stopColor="#cbd5e1" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Clean Status Label Below Mascot with NO Background */}
      {showBadge && (
        <span className="mascot-status-label">{label}</span>
      )}
    </div>
  )
}
