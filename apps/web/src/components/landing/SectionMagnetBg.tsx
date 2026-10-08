/**
 * SectionMagnetBg
 * ────────────────
 * Renders a MagnetLines grid positioned absolutely behind the section header.
 * Features:
 *   • Entrance glide: slides in from off-screen when the section becomes active
 *   • Exit glide: gracefully slides/fades out when section deactivates
 *   • Scroll parallax: the grid drifts vertically as activeSection changes, giving
 *     a sense of depth and motion between sections
 *   • Per-section colour & angle theming
 *   • Fully disabled under prefers-reduced-motion
 *   • Pointer-reactive via the base MagnetLines component
 */

import { useRef, useEffect } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import MagnetLines from '../ui/MagnetLines'
import './SectionMagnetBg.css'

export interface SectionMagnetBgProps {
  /** Whether this section is currently in view */
  isActive?: boolean
  /** Current section index (0–N), used to drive parallax drift */
  activeSection?: number
  /** Total section count, used for normalising parallax offset */
  totalSections?: number
  /** Index of THIS section, so the parallax is relative */
  sectionIndex?: number
  /** Visual variant — maps to a preset colour + angle */
  variant?: 'violet' | 'crimson' | 'teal' | 'amber' | 'emerald' | 'indigo' | 'rose'
  /** Override grid rows */
  rows?: number
  /** Override grid columns */
  columns?: number
  /** Override the grid size. Defaults to '40vmin'. */
  size?: string
  /** Alignment: which side the grid anchors to */
  side?: 'left' | 'right' | 'center'
  /** Vertical position offset within the section */
  yOffset?: string
}

/* Per-variant colour + base-angle config */
const VARIANT_CONFIG: Record<
  NonNullable<SectionMagnetBgProps['variant']>,
  { color: string; angle: number; lineW: string; lineH: string }
> = {
  violet:  { color: 'rgba(139, 92, 246, 0.35)',  angle: -15, lineW: '0.6vmin', lineH: '4.5vmin' },
  crimson: { color: 'rgba(220, 38, 38, 0.30)',   angle:  10, lineW: '0.55vmin', lineH: '4vmin'  },
  teal:    { color: 'rgba(20, 184, 166, 0.30)',  angle:  -8, lineW: '0.55vmin', lineH: '4.5vmin'},
  amber:   { color: 'rgba(245, 158, 11, 0.28)',  angle:  20, lineW: '0.6vmin',  lineH: '4vmin'  },
  emerald: { color: 'rgba(16, 185, 129, 0.28)',  angle: -12, lineW: '0.55vmin', lineH: '4.5vmin'},
  indigo:  { color: 'rgba(99, 102, 241, 0.32)',  angle:   5, lineW: '0.6vmin',  lineH: '4vmin'  },
  rose:    { color: 'rgba(244, 63, 94, 0.28)',   angle:  -5, lineW: '0.55vmin', lineH: '4vmin'  },
}

/* Section index → variant mapping */
const SECTION_VARIANT: Record<number, NonNullable<SectionMagnetBgProps['variant']>> = {
  1: 'crimson',
  2: 'violet',
  3: 'teal',
  4: 'indigo',
  5: 'emerald',
  6: 'amber',
  7: 'rose',
}

export default function SectionMagnetBg({
  isActive = false,
  activeSection = 0,
  totalSections = 8,
  sectionIndex = 1,
  variant,
  rows = 7,
  columns = 7,
  size = '38vmin',
  side = 'right',
  yOffset = '0px',
}: SectionMagnetBgProps) {
  const reducedMotion = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const resolvedVariant = variant ?? SECTION_VARIANT[sectionIndex] ?? 'violet'
  const cfg = VARIANT_CONFIG[resolvedVariant]

  /* ── Entrance / exit glide animation ── */
  useEffect(() => {
    const el = wrapRef.current
    if (!el || reducedMotion) return

    if (isActive) {
      // Snap to invisible start position then glide in
      el.style.transition = 'none'
      el.style.opacity = '0'
      el.style.transform = 'translateY(32px) scale(0.92)'
      // Force reflow so transition fires
      el.getBoundingClientRect()
      el.style.transition = 'opacity 0.75s cubic-bezier(0.16, 1, 0.3, 1), transform 0.75s cubic-bezier(0.16, 1, 0.3, 1)'
      el.style.opacity = '1'
      el.style.transform = 'translateY(0px) scale(1)'
    } else {
      el.style.transition = 'opacity 0.45s ease, transform 0.45s ease'
      el.style.opacity = '0'
      el.style.transform = 'translateY(-20px) scale(0.94)'
    }
  }, [isActive, reducedMotion])

  /* ── Scroll parallax drift ── */
  useEffect(() => {
    const el = wrapRef.current
    if (!el || reducedMotion || !isActive) return

    // How far this section is from centre (–1 → +1)
    const progress = (activeSection - sectionIndex) / (totalSections - 1)
    const driftY = progress * 28 // max 28px drift when crossing sections

    el.style.setProperty('--magnet-scroll-drift', `${driftY}px`)
  }, [activeSection, sectionIndex, totalSections, reducedMotion, isActive])

  if (reducedMotion) return null

  return (
    <div
      ref={wrapRef}
      className={`section-magnet-bg section-magnet-bg--${side}`}
      aria-hidden="true"
      style={{
        '--magnet-scroll-drift': '0px',
        top: yOffset,
        opacity: 0,
        transform: 'translateY(32px) scale(0.92)',
      } as React.CSSProperties}
    >
      <MagnetLines
        rows={rows}
        columns={columns}
        containerSize={size}
        lineColor={cfg.color}
        lineWidth={cfg.lineW}
        lineHeight={cfg.lineH}
        baseAngle={cfg.angle}
        className="section-magnet-grid"
      />
    </div>
  )
}
