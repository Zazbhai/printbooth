import { useEffect, useState } from "react"
import "./IndiaMapSearchAnimation.css"

interface Props {
  /** "full" = centered block (LocationsPage), "compact" = inline banner (SelectKioskPage) */
  variant?: "full" | "compact"
  /** Optional label override */
  label?: string
}

const STEPS = [
  "Requesting GPS signal",
  "Triangulating position",
  "Scanning nearby kiosks",
  "Sorting by distance",
]

export function IndiaMapSearchAnimation({ variant = "full", label }: Props) {
  const [stepIdx, setStepIdx] = useState(0)

  // Cycle through steps
  useEffect(() => {
    const t = setInterval(() => {
      setStepIdx((i) => (i + 1) % STEPS.length)
    }, 1100)
    return () => clearInterval(t)
  }, [])

  const mapSize = variant === "compact" ? 64 : 120

  return (
    <div className={`india-search-overlay${variant === "compact" ? " compact" : ""}`}>
      {/* ── Animated India Map SVG ── */}
      <div className="india-map-wrap">
        <svg
          className="india-map-svg"
          width={mapSize}
          height={mapSize}
          viewBox="0 0 200 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* India outline — simplified but recognisable path */}
          <path
            className="india-map-land"
            d="M 72 8
               L 78 6  L 88 8  L 96 6  L 108 10  L 118 8
               L 128 12 L 136 18 L 140 28 L 136 36 L 140 44
               L 148 52 L 154 62 L 156 72 L 152 80 L 156 88
               L 158 98 L 154 108 L 148 116 L 140 124 L 132 130
               L 128 140 L 122 150 L 116 158 L 110 166 L 104 174
               L 100 182 L 96 174  L 90 166  L 84 158  L 78 148
               L 72 138 L 68 128  L 60 118  L 52 110  L 46 100
               L 40 90  L 38 80   L 42 70   L 44 60   L 48 50
               L 50 40  L 46 30   L 52 22   L 60 16   L 68 10 Z"
            strokeLinejoin="round"
          />

          {/* Scan horizontal lines */}
          {[60, 80, 100, 120, 140].map((y) => (
            <line
              key={y}
              className="india-scan-line"
              x1="38" y1={y} x2="162" y2={y}
            />
          ))}

          {/* Radar sweep cone originating from center of map */}
          <g className="india-radar-sweep" style={{ transformOrigin: "100px 100px" }}>
            <defs>
              <radialGradient id="radarGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
                gradientTransform="translate(100 100) scale(80)">
                <stop offset="0%" stopColor="#dc2626" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
              </radialGradient>
            </defs>
            <path
              d="M 100 100 L 180 60 A 80 80 0 0 1 180 140 Z"
              fill="url(#radarGrad)"
              style={{ transformOrigin: "100px 100px" }}
            />
            {/* Leading edge line */}
            <line x1="100" y1="100" x2="180" y2="100" stroke="#dc2626" strokeWidth="1.5" strokeOpacity="0.5" />
          </g>

          {/* Scattered kiosk dots that appear */}
          <circle className="india-dot" cx="76" cy="72" r="3.5" />
          <circle className="india-dot" cx="120" cy="95" r="3" />
          <circle className="india-dot" cx="90" cy="118" r="3" />
          <circle className="india-dot" cx="108" cy="60" r="2.5" />
          <circle className="india-dot" cx="64" cy="104" r="3" />

          {/* Main pin — Pune area (~100, 110) */}
          <g className="india-pin-group">
            {/* Ripple rings */}
            <circle className="india-pin-ripple" cx="100" cy="110" r="4" />
            <circle className="india-pin-ripple" cx="100" cy="110" r="4" />
            <circle className="india-pin-ripple" cx="100" cy="110" r="4" />

            {/* Pin body */}
            <circle cx="100" cy="110" r="6" fill="#dc2626" />
            <circle cx="100" cy="110" r="3" fill="white" />

            {/* Pin shadow drop */}
            <ellipse cx="100" cy="118" rx="5" ry="2" fill="#dc2626" fillOpacity="0.2" />
          </g>

          {/* Concentric distance rings */}
          <circle cx="100" cy="110" r="30" stroke="#dc2626" strokeWidth="0.6" strokeOpacity="0.12" fill="none" strokeDasharray="3 6" />
          <circle cx="100" cy="110" r="50" stroke="#dc2626" strokeWidth="0.6" strokeOpacity="0.08" fill="none" strokeDasharray="3 8" />
        </svg>
      </div>

      {/* ── Text section ── */}
      <div className="india-search-text">
        <div className="india-search-headline">
          {label || "Finding nearest PrintBooth"}
          &nbsp;
          <span className="india-typing-dots" aria-hidden="true">
            <span className="india-typing-dot" />
            <span className="india-typing-dot" />
            <span className="india-typing-dot" />
          </span>
        </div>

        {variant === "full" && (
          <p className="india-search-sub">
            Scanning kiosks across India and sorting by your distance
          </p>
        )}

        <div className="india-search-steps">
          {STEPS.map((step, i) => (
            <div
              key={step}
              className={`india-step${i === stepIdx ? " is-active" : i < stepIdx ? " is-done" : ""}`}
            >
              <span className="india-step__dot" />
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
