import { useRef, useEffect, useState } from 'react'
import { createTimeline } from 'animejs/timeline'
import { useInView } from '../../hooks/useScrollProgress'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import AnimatedHeading from './AnimatedHeading'

export default function PrintingDemo() {
  const sectionRef = useRef<HTMLElement>(null)
  const [hasAnimated, setHasAnimated] = useState(false)
  const isInView = useInView(sectionRef, 0.2)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!isInView || hasAnimated || !sectionRef.current) return
    setHasAnimated(true)

    const container = sectionRef.current

    if (reducedMotion) {
      container.querySelectorAll('.printing-page-status, .printing-complete').forEach((el) => {
        ;(el as HTMLElement).style.opacity = '1'
        ;(el as HTMLElement).style.transform = 'none'
      })
      return
    }

    const tl = createTimeline({
      defaults: { ease: 'outQuad', duration: 400 },
    })

    const pages = container.querySelectorAll('.printing-page-status')
    pages.forEach((page, i) => {
      tl.add(page, {
        opacity: { to: 1 },
        translateX: { to: 0 },
      }, `+=${i === 0 ? 400 : 600}`)
    })

    const complete = container.querySelector('.printing-complete')
    if (complete) {
      tl.add(complete, {
        opacity: { to: 1 },
        scale: { to: 1 },
        duration: 700,
      }, '+=500')
    }
  }, [isInView, hasAnimated, reducedMotion])

  return (
    <section ref={sectionRef} className="landing-printing" aria-label="Printing demonstration">
      <div className="landing-container">
        <div className="demo-layout">
          <div className="demo-text">
            <AnimatedHeading
              text="Then let the machine do the work."
              tag="h2"
              duration={800}
            />
          </div>

          <div className="demo-visual">
            <div className="printing-panel kiosk-screen">
              <div className="kiosk-screen__header">
                <span className="kiosk-screen__dot kiosk-screen__dot--active" />
                <span>Printing</span>
              </div>

              <div className="kiosk-screen__body">
                <div className="printing-status-label">PRINTING</div>

                {[1, 2, 3, 4, 5].map((page) => (
                  <div
                    key={page}
                    className="printing-page-status"
                    style={{ opacity: 0, transform: 'translateX(-20px)' }}
                  >
                    <span className="page-num">
                      {String(page).padStart(2, '0')} / 05
                    </span>
                    <div className="page-progress">
                      <div className="page-progress__fill" />
                    </div>
                  </div>
                ))}

                <div
                  className="printing-complete"
                  style={{ opacity: 0, transform: 'scale(0.8)' }}
                >
                  <span className="printing-complete__check">✓</span>
                  <span className="printing-complete__text">PRINT COMPLETE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
