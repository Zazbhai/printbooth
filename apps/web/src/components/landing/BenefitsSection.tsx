import { useRef, useEffect, useState } from 'react'
import { animate } from 'animejs'
import { stagger } from 'animejs/utils'
import { useInView } from '../../hooks/useScrollProgress'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import AnimatedHeading from './AnimatedHeading'

const benefits = [
  '24/7 availability',
  'Automatic printing',
  'UPI payments',
  'Remote monitoring',
  'QR upload',
  'USB support',
  'Local printing',
  'Central management',
]

export default function BenefitsSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const [hasAnimated, setHasAnimated] = useState(false)
  const isInView = useInView(sectionRef, 0.1)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!isInView || hasAnimated || !sectionRef.current) return
    setHasAnimated(true)

    const items = sectionRef.current.querySelectorAll('.benefit-item')

    if (reducedMotion) {
      items.forEach((el) => {
        ;(el as HTMLElement).style.opacity = '1'
        ;(el as HTMLElement).style.transform = 'none'
      })
      return
    }

    animate(items, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 700,
      ease: 'outQuad',
      delay: stagger(100, { start: 400 }),
    })
  }, [isInView, hasAnimated, reducedMotion])

  return (
    <section
      ref={sectionRef}
      className="landing-benefits"
      aria-labelledby="benefits-heading"
    >
      <div className="landing-container">
        <AnimatedHeading
          text="Designed for unattended operation."
          tag="h2"
          id="benefits-heading"
          className="benefits-heading-wrap"
          duration={900}
        />

        <div className="benefits-grid">
          {benefits.map((b) => (
            <div
              key={b}
              className="benefit-item"
              style={{ opacity: 0, transform: 'translateY(30px)' }}
            >
              <span className="benefit-dot" />
              <span className="benefit-text">{b}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
