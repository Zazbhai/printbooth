import { useRef, useEffect, useState } from 'react'
import { animate } from 'animejs'
import { stagger } from 'animejs/utils'
import { useInView } from '../../hooks/useScrollProgress'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import AnimatedHeading from './AnimatedHeading'

const options = [
  { label: 'Paper', value: 'A4' },
  { label: 'Colour', values: ['B&W', 'Colour'], active: 0 },
  { label: 'Sides', values: ['Single', 'Double'], active: 1 },
  { label: 'Copies', value: '1' },
  { label: 'Page range', value: 'All' },
]

export default function PrintSettingsDemo() {
  const sectionRef = useRef<HTMLElement>(null)
  const [hasAnimated, setHasAnimated] = useState(false)
  const isInView = useInView(sectionRef, 0.2)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!isInView || hasAnimated || !sectionRef.current) return
    setHasAnimated(true)

    const rows = sectionRef.current.querySelectorAll('.config-row')

    if (reducedMotion) {
      rows.forEach((el) => {
        ;(el as HTMLElement).style.opacity = '1'
        ;(el as HTMLElement).style.transform = 'none'
      })
      return
    }

    animate(rows, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 600,
      ease: 'outQuad',
      delay: stagger(100, { start: 300 }),
    })
  }, [isInView, hasAnimated, reducedMotion])

  return (
    <section ref={sectionRef} className="landing-config" aria-label="Configuration demonstration">
      <div className="landing-container">
        <div className="demo-layout">
          <div className="demo-text">
            <AnimatedHeading
              text="Choose exactly how you want it."
              tag="h2"
              duration={800}
            />
          </div>

          <div className="demo-visual">
            <div className="config-panel kiosk-screen">
              <div className="kiosk-screen__header">
                <span className="kiosk-screen__dot" />
                <span>Print Settings</span>
              </div>

              <div className="kiosk-screen__body">
                {options.map((opt) => (
                  <div
                    key={opt.label}
                    className="config-row"
                    style={{ opacity: 0, transform: 'translateY(20px)' }}
                  >
                    <span className="config-label">{opt.label}</span>
                    <div className="config-value">
                      {opt.values ? (
                        <div className="config-toggle">
                          {opt.values.map((v, i) => (
                            <button
                              key={v}
                              className={`config-toggle__btn ${i === opt.active ? 'active' : ''}`}
                              tabIndex={-1}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="config-static">{opt.value}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
