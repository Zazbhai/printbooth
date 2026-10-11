import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { animate } from 'animejs'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import NavExpandDetails from './NavExpandDetails'

interface LandingNavProps {
  onNavigate?: (index: number) => void
  activeSection?: number
}

export default function LandingNav({ onNavigate, activeSection = 0 }: LandingNavProps) {
  const navRef = useRef<HTMLElement>(null)
  const hasAnimated = useRef(false)
  const reducedMotion = useReducedMotion()

  const scrolled = activeSection > 0

  // Entry animation
  useEffect(() => {
    if (!navRef.current || hasAnimated.current) return
    hasAnimated.current = true

    if (reducedMotion) {
      navRef.current.style.opacity = '1'
      return
    }

    animate(navRef.current, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 800,
      ease: 'outQuad',
      delay: 300,
    })
  }, [reducedMotion])

  return (
    <nav
      ref={navRef}
      className={`landing-nav-wrapper ${scrolled ? 'is-scrolled' : ''}`}
      style={{ opacity: 0, transform: 'translateY(-20px)' }}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="landing-nav-pill">
        {/* Brand with Orbital Atom Icon matching reference image */}
        <button
          type="button"
          className="landing-nav__brand"
          onClick={() => (onNavigate ? onNavigate(0) : undefined)}
          aria-label="PrintBooth Home"
        >
          <img
            src="/logo.png"
            alt="PrintBooth"
            className="landing-nav__brand-glyph"
          />
          <span className="landing-nav__brand-title">PrintBooth</span>
        </button>

        {/* Navigation Links for Desktop */}
        <div className="landing-nav__links">
          <button
            type="button"
            className={`landing-nav__link ${activeSection === 3 ? 'is-active' : ''}`}
            onClick={() => (onNavigate ? onNavigate(3) : undefined)}
          >
            Features
          </button>
          <button
            type="button"
            className={`landing-nav__link ${activeSection === 6 ? 'is-active' : ''}`}
            onClick={() => (onNavigate ? onNavigate(6) : undefined)}
          >
            About
          </button>
          <Link to="/support" className="landing-nav__link">
            Support
          </Link>
        </div>

        {/* Expand Details Micro-Interaction for Mobile Navigation */}
        <NavExpandDetails onNavigate={onNavigate} activeSection={activeSection} />
      </div>
    </nav>
  )
}
