import { useRef, useEffect, useState } from 'react'
import { animate } from 'animejs'
import { stagger } from 'animejs/utils'
import { useInView } from '../../hooks/useScrollProgress'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import AnimatedHeading from './AnimatedHeading'
import RevealText from './RevealText'

const archNodes = [
  'CUSTOMER',
  'PRINTBOOTH KIOSK',
  'PRINTBOOTH API',
  'PAYMENT',
  'PRINT QUEUE',
  'CUPS',
  'PRINTER',
]

export default function ArchitectureSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const [hasAnimated, setHasAnimated] = useState(false)
  const isInView = useInView(sectionRef, 0.15)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!isInView || hasAnimated || !sectionRef.current) return
    setHasAnimated(true)

    const nodes = sectionRef.current.querySelectorAll('.arch-node')
    const connectors = sectionRef.current.querySelectorAll('.arch-connector')

    if (reducedMotion) {
      ;[...Array.from(nodes), ...Array.from(connectors)].forEach((el) => {
        ;(el as HTMLElement).style.opacity = '1'
        ;(el as HTMLElement).style.transform = 'none'
      })
      return
    }

    animate(nodes, {
      opacity: { to: 1 },
      scale: { to: 1 },
      duration: 500,
      ease: 'outQuad',
      delay: stagger(120, { start: 200 }),
    })

    animate(connectors, {
      scaleY: { to: 1 },
      opacity: { to: 1 },
      duration: 400,
      ease: 'outQuad',
      delay: stagger(120, { start: 350 }),
    })
  }, [isInView, hasAnimated, reducedMotion])

  return (
    <section ref={sectionRef} className="landing-arch" aria-label="System architecture">
      <div className="landing-container">
        <AnimatedHeading
          text="How it all connects."
          tag="h2"
          className="arch-heading-wrap"
          duration={800}
        />

        <div className="arch-flow">
          {archNodes.map((node, i) => (
            <div key={node} className="arch-flow__item">
              <div
                className="arch-node"
                style={{ opacity: 0, transform: 'scale(0.8)' }}
              >
                {node}
              </div>
              {i < archNodes.length - 1 && (
                <div
                  className="arch-connector"
                  style={{ opacity: 0, transform: 'scaleY(0)', transformOrigin: 'top' }}
                >
                  <div className="arch-connector__line" />
                  <div className="arch-connector__arrow">↓</div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="arch-offline">
          <RevealText delay={200}>
            <div className="arch-offline__content">
              <h3 className="arch-offline__heading">Built to keep printing.</h3>
              <p className="arch-offline__desc">
                Local printing, local queue, USB upload — everything works even without cloud.
                The cloud handles payments, remote monitoring, and updates.
              </p>
            </div>
          </RevealText>
        </div>
      </div>
    </section>
  )
}
