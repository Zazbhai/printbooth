import { useRef, useEffect, useState } from 'react'
import { animate } from 'animejs'
import { stagger } from 'animejs/utils'
import { useInView } from '../../hooks/useScrollProgress'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import RevealText from './RevealText'

const metrics = [
  { label: 'STATUS', value: 'ONLINE', type: 'status' as const },
  { label: 'PRINTER', value: 'READY', type: 'status' as const },
  { label: 'PAPER', value: '82%', type: 'bar' as const, percent: 82 },
  { label: 'TONER', value: '61%', type: 'bar' as const, percent: 61 },
  { label: 'QUEUE', value: '2 JOBS', type: 'text' as const },
  { label: 'TEMPERATURE', value: '47°C', type: 'text' as const },
]

export default function MonitoringSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const [hasAnimated, setHasAnimated] = useState(false)
  const isInView = useInView(sectionRef, 0.2)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!isInView || hasAnimated || !sectionRef.current) return
    setHasAnimated(true)

    const container = sectionRef.current
    const rows = container.querySelectorAll('.monitor-row')
    const bars = container.querySelectorAll('.monitor-bar-fill')

    if (reducedMotion) {
      rows.forEach((el) => {
        ;(el as HTMLElement).style.opacity = '1'
        ;(el as HTMLElement).style.transform = 'none'
      })
      bars.forEach((el) => {
        ;(el as HTMLElement).style.transform = 'scaleX(1)'
      })
      return
    }

    animate(rows, {
      opacity: { to: 1 },
      translateX: { to: 0 },
      duration: 600,
      ease: 'outQuad',
      delay: stagger(80, { start: 300 }),
    })

    animate(bars, {
      scaleX: { to: 1 },
      duration: 900,
      ease: 'outQuad',
      delay: stagger(120, { start: 600 }),
    })
  }, [isInView, hasAnimated, reducedMotion])

  return (
    <section ref={sectionRef} className="landing-monitor" aria-label="Monitoring dashboard">
      <div className="landing-container">
        <RevealText>
          <h2 className="monitor-heading">Remote monitoring.</h2>
        </RevealText>

        <div className="monitor-panel kiosk-screen">
          <div className="kiosk-screen__header">
            <span className="kiosk-screen__dot kiosk-screen__dot--active" />
            <span>PRINTBOOTH PB-001</span>
          </div>

          <div className="kiosk-screen__body">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="monitor-row"
                style={{ opacity: 0, transform: 'translateX(-20px)' }}
              >
                <span className="monitor-label">{m.label}</span>
                <div className="monitor-value-wrap">
                  {m.type === 'bar' ? (
                    <div className="monitor-bar">
                      <div
                        className="monitor-bar-fill"
                        style={{
                          transform: 'scaleX(0)',
                          transformOrigin: 'left',
                          width: `${m.percent}%`,
                        }}
                      />
                    </div>
                  ) : null}
                  <span
                    className={`monitor-value ${
                      m.type === 'status' ? 'monitor-value--status' : ''
                    }`}
                  >
                    {m.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
