import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useIsMobileOrTablet } from '../../hooks/useMediaQuery'
import './SectionTransition.css'

export type TransitionEffect = 'slideUp' | 'fade' | 'zoom' | 'flipX' | 'flipY'

interface SectionTransitionProps {
  isActive: boolean
  isPassed: boolean
  isUpcoming: boolean
  direction: 'down' | 'up'
  effect?: TransitionEffect
  phaseCode?: string
  phaseTitle?: string
  children: ReactNode
  className?: string
  showBadge?: boolean
  isHero?: boolean
}

export default function SectionTransition({
  isActive,
  isPassed,
  isUpcoming,
  direction,
  effect = 'slideUp',
  children,
  className = '',
  isHero = false,
}: SectionTransitionProps) {
  const isMobileOrTablet = useIsMobileOrTablet()
  const containerRef = useRef<HTMLDivElement>(null)
  const [hasScrolledInView, setHasScrolledInView] = useState(() => isHero || isActive)

  // IntersectionObserver for mobile & tablet scroll entrance animation
  useEffect(() => {
    if (isHero) {
      setHasScrolledInView(true)
      return
    }

    if (!isMobileOrTablet) {
      return
    }

    if (hasScrolledInView) return

    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasScrolledInView(true)
          observer.disconnect()
        }
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -30px 0px',
      }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [isMobileOrTablet, hasScrolledInView, isHero])

  // If section becomes active, ensure it is also marked as revealed
  useEffect(() => {
    if (isActive && !hasScrolledInView) {
      setHasScrolledInView(true)
    }
  }, [isActive, hasScrolledInView])

  const mobileStatusClass =
    isHero || hasScrolledInView ? 'mobile-tab-revealed' : 'mobile-tab-unrevealed'

  return (
    <div
      ref={containerRef}
      className={`section-transition-container effect-${effect} ${
        isActive ? 'is-active' : 'is-inactive'
      } ${isPassed ? 'is-passed' : ''} ${
        isUpcoming ? 'is-upcoming' : ''
      } direction-${direction} ${mobileStatusClass} ${
        isHero ? 'mobile-tab-hero' : ''
      } ${className}`}
      data-active={isActive}
      data-effect={effect}
    >
      <div className="section-transition-content">
        {children}
      </div>
    </div>
  )
}

