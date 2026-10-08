import { useRef, useEffect, useState } from 'react'
import { animate } from 'animejs'
import { stagger } from 'animejs/utils'
import { useInView } from '../../hooks/useScrollProgress'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import AnimatedHeading from './AnimatedHeading'
import RevealText from './RevealText'

const locations = [
  'Universities',
  'Libraries',
  'Hostels',
  'Co-working spaces',
  'Railway stations',
  'Hospitals',
  'Shopping centres',
  'Government offices',
]

export default function LocationsSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const [hasAnimated, setHasAnimated] = useState(false)
  const isInView = useInView(sectionRef, 0.1)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!isInView || hasAnimated || !sectionRef.current) return
    setHasAnimated(true)

    const points = sectionRef.current.querySelectorAll('.location-point')

    if (reducedMotion) {
      points.forEach((el) => {
        ;(el as HTMLElement).style.opacity = '1'
        ;(el as HTMLElement).style.transform = 'none'
      })
      return
    }

    animate(points, {
      opacity: { to: 1 },
      scale: { to: 1 },
      duration: 500,
      ease: 'outQuad',
      delay: stagger(100, { start: 400 }),
    })
  }, [isInView, hasAnimated, reducedMotion])

  return (
    <section
      ref={sectionRef}
      className="landing-locations"
      id="locations"
      aria-labelledby="locations-heading"
    >
      <div className="landing-container">
        <AnimatedHeading
          text="Put printing where people need it."
          tag="h2"
          id="locations-heading"
          className="locations-heading-wrap"
          duration={900}
        />

        <RevealText delay={200}>
          <p className="locations-subtext">
            Potential deployment locations for self-service printing.
          </p>
        </RevealText>

        <div className="locations-grid">
          {locations.map((loc) => (
            <div
              key={loc}
              className="location-point"
              style={{ opacity: 0, transform: 'scale(0.8)' }}
            >
              <div className="location-marker" />
              <span className="location-name">{loc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
