import { useRef, useEffect } from 'react'
import { Zap, Printer, QrCode, ArrowRight, ChevronDown, Sparkles } from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { animateHeroIn, showAllImmediately } from '../../animations/landingAnimations'
import ShimmerButton from '../ui/ShimmerButton'
import ScrambleText from '../ui/ScrambleText'
import WordRotator from '../ui/WordRotator'

interface HeroProps {
  scrollProgress?: number
  isActive?: boolean
  onExplore?: () => void
}

export default function Hero({ isActive = true, onExplore }: HeroProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!containerRef.current) return

    if (reducedMotion) {
      showAllImmediately(containerRef.current, [
        '.hero-line',
        '.hero-terminal-pill',
        '.hero-subtitle',
        '.hero-desc',
        '.hero-specs-strip',
        '.hero-ctas',
      ])
      return
    }

    if (isActive) {
      animateHeroIn(containerRef.current)
    }
  }, [isActive, reducedMotion])

  return (
    <section className="landing-hero" aria-labelledby="hero-headline">
      <div ref={containerRef} className="landing-hero__content">
        <div className="landing-hero__text">

          {/* Monumental Kinetic Headline with Decrypt Hover Micro-Interactions */}
          <h1 id="hero-headline" className="landing-hero__headline">
            <span className="hero-line">
              <ScrambleText text="PRINT." delay={80} duration={650} />
            </span>
            <span className="hero-line">
              <ScrambleText text="PAY." delay={200} duration={650} />
            </span>
            <span className="hero-line hero-line--accent">
              <ScrambleText text="COLLECT." delay={340} duration={750} />
            </span>
          </h1>

          <p className="hero-subtitle">
            Autonomous self-service printing for{' '}
            <WordRotator
              words={[
                'college campuses.',
                'public libraries.',
                'transit hubs.',
                'residential societies.',
                'corporate parks.',
              ]}
            />
          </p>

          <p className="hero-desc">
            Direct browser upload. Instant UPI scan-to-pay. Automatic hardware dispense in under 90 seconds. No app installations, zero queues.
          </p>

          {/* Highlight Spec Strip with Immersive SVG Icons */}
          <div className="hero-specs-strip">
            <div className="hero-spec-item">
              <div className="hero-spec-header">
                <Zap className="hero-spec-icon" size={13} />
                <span className="hero-spec-code">PRINT SPEED</span>
              </div>
              <span className="hero-spec-val">&lt; 90 SECONDS</span>
            </div>
            <div className="hero-spec-item">
              <div className="hero-spec-header">
                <Printer className="hero-spec-icon" size={13} />
                <span className="hero-spec-code">PRINT QUALITY</span>
              </div>
              <span className="hero-spec-val">1200 DPI LASER</span>
            </div>
            <div className="hero-spec-item">
              <div className="hero-spec-header">
                <QrCode className="hero-spec-icon" size={13} />
                <span className="hero-spec-code">PAYMENT</span>
              </div>
              <span className="hero-spec-val">INSTANT UPI QR</span>
            </div>
          </div>

          <div className="hero-ctas">
            <ShimmerButton
              to="/print"
              variant="primary"
              id="hero-start-printing"
            >
              <span className="btn-text">START PRINTING</span>
              <ArrowRight className="btn-svg-icon" size={15} />
            </ShimmerButton>
            <ShimmerButton
              type="button"
              variant="ghost"
              id="hero-explore"
              onClick={onExplore}
            >
              <Sparkles className="btn-svg-icon-ghost" size={14} />
              <span className="btn-text">EXPLORE KIOSK</span>
            </ShimmerButton>
          </div>
        </div>

        {/* Empty right column anchor so the 3D model on the right canvas has dedicated screen real estate */}
        <div className="landing-hero__stage-spacer" aria-hidden="true" />
      </div>

      {/* Scroll hint with animated Chevron */}
      <div
        className="landing-hero__scroll-hint"
        aria-hidden="true"
        onClick={onExplore}
        style={{ cursor: onExplore ? 'pointer' : 'default' }}
      >
        <div className="scroll-indicator">
          <div className="scroll-indicator__line" />
          <ChevronDown className="scroll-indicator__chevron" size={14} />
        </div>
        <span className="scroll-indicator__text">SCROLL TO EXPLORE</span>
      </div>
    </section>
  )
}
