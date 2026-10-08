import { useRef, useEffect } from 'react'
import {
  Timer,
  ShieldCheck,
  QrCode,
  Clock,
  Target,
  XCircle,
  CheckCircle2,
  Trash2,
  Smartphone,
  Activity,
} from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { animateComparisonIn, showAllImmediately } from '../../animations/landingAnimations'

interface ComparisonSectionProps {
  isActive?: boolean
}

interface ComparisonItem {
  label: string
  oldText: string
  newText: string
  badge: string
  icon: typeof Timer
}

const COMPARISONS: ComparisonItem[] = [
  {
    label: 'Turnaround',
    oldText: '20+ min queue',
    newText: 'Under 90s dispense',
    badge: '13x faster',
    icon: Timer,
  },
  {
    label: 'Privacy',
    oldText: 'USB & WhatsApp chats',
    newText: 'Instant auto-wipe',
    badge: 'Zero trace',
    icon: ShieldCheck,
  },
  {
    label: 'Payment',
    oldText: 'Exact cash & change',
    newText: 'Dynamic UPI QR',
    badge: 'Instant',
    icon: QrCode,
  },
  {
    label: 'Access',
    oldText: 'Shop hours only',
    newText: '24 / 7 / 365',
    badge: 'Always on',
    icon: Clock,
  },
  {
    label: 'Accuracy',
    oldText: 'Clerk misprints',
    newText: 'Laser calibration',
    badge: '100% precision',
    icon: Target,
  },
]

const STATS = [
  { num: '< 90s', text: 'Average dispense', icon: Timer },
  { num: '0 KB', text: 'Post-print storage', icon: Trash2 },
  { num: '100%', text: 'UPI contactless', icon: Smartphone },
  { num: '24 / 7', text: 'Always online', icon: Activity },
]

export default function ComparisonSection({ isActive = false }: ComparisonSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!sectionRef.current) return

    if (reducedMotion) {
      showAllImmediately(sectionRef.current, ['.cmp-eyebrow', '.cmp-header', '.cmp-frosted-stage', '.cmp-item-row', '.cmp-stat-card'])
      return
    }

    if (isActive) {
      animateComparisonIn(sectionRef.current)
    }
  }, [isActive, reducedMotion])

  return (
    <section ref={sectionRef} className="cmp-section" aria-labelledby="cmp-heading">
      {/* Ambient Cybernetic Particle Dust Layer */}
      <div className="section-particle-dust" aria-hidden="true">
        <span className="particle-spark p-1" />
        <span className="particle-spark p-2" />
        <span className="particle-spark p-3" />
        <span className="particle-spark p-4" />
        <span className="particle-spark p-5" />
        <span className="particle-spark p-6" />
      </div>

      <div className="cmp-inner">
        {/* Header */}
        <div className="cmp-header" data-anim data-delay="0">
          <h2 className="cmp-heading" id="cmp-heading">
            Traditional shop vs. <span className="cmp-heading-accent">PrintBooth.</span>
          </h2>
        </div>

        {/* Frosted Glass Stage */}
        <div className="cmp-frosted-stage" data-anim data-delay="60">
          {/* Table Header */}
          <div className="cmp-table-head" aria-hidden="true">
            <span className="cmp-th-label">Category</span>
            <span className="cmp-th-old">Traditional Shop</span>
            <span className="cmp-th-divider" />
            <span className="cmp-th-neo">PrintBooth</span>
          </div>

          {/* Showdown Rows */}
          <div className="cmp-rows">
            {COMPARISONS.map((item, idx) => {
              const CatIcon = item.icon
              return (
                <div
                  key={item.label}
                  className="cmp-item-row"
                  data-anim
                  data-delay={String(100 + idx * 35)}
                >
                  <div className="cmp-item-label">
                    <CatIcon size={14} className="cmp-cat-icon" />
                    <span>{item.label}</span>
                  </div>

                  <div className="cmp-item-old">
                    <XCircle size={13} className="cmp-icon-old" />
                    <span className="cmp-text-old">{item.oldText}</span>
                  </div>

                  <div className="cmp-item-divider" aria-hidden="true">
                    <span className="cmp-divider-laser" />
                  </div>

                  <div className="cmp-item-neo">
                    <CheckCircle2 size={13} className="cmp-icon-neo" />
                    <span className="cmp-text-neo">{item.newText}</span>
                    <span className="cmp-sub-tag">{item.badge}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Frosted Stat Strip */}
        <div className="cmp-stats-ribbon" data-anim data-delay="280">
          {STATS.map((st) => {
            const StatIcon = st.icon
            return (
              <div key={st.text} className="cmp-stat-card">
                <StatIcon size={16} className="cmp-stat-icon" />
                <span className="cmp-stat-num">{st.num}</span>
                <span className="cmp-stat-text">{st.text}</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
