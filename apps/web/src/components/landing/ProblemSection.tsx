import { useRef, useEffect } from 'react'
import { Wrench, Clock, ShieldAlert } from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { animateProblemIn, showAllImmediately } from '../../animations/landingAnimations'

interface ProblemSectionProps {
  isActive?: boolean
}

const faults = [
  {
    code: '01',
    category: 'Broken Equipment',
    title: 'Broken stationery store printers',
    desc: 'Unreliable offline shops, toner shortages, and sudden paper jams with no one around to fix them.',
    icon: Wrench,
  },
  {
    code: '02',
    category: 'Long Waiting Lines',
    title: 'Long queues for a single page',
    desc: 'Wasting 20 minutes standing in line just to get an urgent invoice, assignment, or boarding pass printed.',
    icon: Clock,
  },
  {
    code: '03',
    category: 'Privacy Risk',
    title: 'Unsafe WhatsApp & USB transfers',
    desc: 'Forwarding sensitive personal documents over WhatsApp or plugging USB drives into infected public shop computers.',
    icon: ShieldAlert,
  },
]

export default function ProblemSection({ isActive = false }: ProblemSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!sectionRef.current) return

    if (reducedMotion) {
      showAllImmediately(sectionRef.current, ['.problem-eyebrow', '.problem-word', '.problem-item', '.problem-fault-card'])
      return
    }

    if (isActive) {
      animateProblemIn(sectionRef.current)
    }
  }, [isActive, reducedMotion])

  const headingWords = [
    { text: 'Printing', isAccent: false },
    { text: "shouldn't", isAccent: false },
    { text: 'be', isAccent: false },
    { text: 'complicated.', isAccent: true },
  ]

  return (
    <section ref={sectionRef} className="landing-problem" aria-labelledby="problem-heading">
      <div className="problem-layout-container">
        {/* Left column anchor: 3D model sits proudly on the left side */}
        <div className="problem-stage-spacer" aria-hidden="true" />

        {/* Right column: eyebrow, heading, and compact fault cards */}
        <div className="problem-content-right">

          <h2 className="problem-heading" id="problem-heading">
            {headingWords.map((w, i) => (
              <span
                key={i}
                className={`problem-word ${w.isAccent ? 'problem-word--accent' : ''}`}
                data-index={i}
              >
                {w.text}{' '}
              </span>
            ))}
          </h2>

          <div className="problem-fault-grid">
            {faults.map((f, i) => {
              const Icon = f.icon
              return (
                <div key={f.code} className="problem-fault-card" style={{ animationDelay: `${i * 120}ms` }}>
                  <div className="fault-card-header">
                    <div className="fault-icon-wrap" aria-hidden="true">
                      <span className="fault-icon-badge">
                        <Icon className="fault-icon" size={16} />
                      </span>
                    </div>
                    <span className="fault-badge">{f.category}</span>
                  </div>
                  <div className="fault-title">{f.title}</div>
                  <div className="fault-desc">{f.desc}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
