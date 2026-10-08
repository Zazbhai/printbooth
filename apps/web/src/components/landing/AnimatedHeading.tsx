import { useRef, useEffect, useState } from 'react'
import { animate } from 'animejs'
import { stagger } from 'animejs/utils'
import { useInView } from '../../hooks/useScrollProgress'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useIsMobileOrTablet } from '../../hooks/useMediaQuery'

interface AnimatedHeadingProps {
  text: string
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span'
  className?: string
  staggerMs?: number
  duration?: number
  delay?: number
  splitBy?: 'word' | 'line'
  id?: string
}

export default function AnimatedHeading({
  text,
  tag: Tag = 'h2',
  className = '',
  staggerMs = 60,
  duration = 800,
  delay = 0,
  splitBy = 'word',
  id,
}: AnimatedHeadingProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hasAnimated, setHasAnimated] = useState(false)
  const isInView = useInView(containerRef, 0.2)
  const reducedMotion = useReducedMotion()
  const isMobileOrTablet = useIsMobileOrTablet()
  const instant = reducedMotion || isMobileOrTablet


  useEffect(() => {
    if (instant) {
      if (containerRef.current) {
        const spans = containerRef.current.querySelectorAll('.ah-word')
        spans.forEach((span) => {
          ;(span as HTMLElement).style.opacity = '1'
          ;(span as HTMLElement).style.transform = 'none'
        })
      }
      return
    }

    if (!isInView || hasAnimated || !containerRef.current) return

    setHasAnimated(true)
    const spans = containerRef.current.querySelectorAll('.ah-word')

    animate(spans, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration,
      ease: 'outQuad',
      delay: stagger(staggerMs, { start: delay }),
    })
  }, [isInView, hasAnimated, staggerMs, duration, delay, instant])

  const words = splitBy === 'word' ? text.split(' ') : text.split('\n')

  return (
    <div ref={containerRef} className={`animated-heading ${className}`}>
      <Tag id={id}>
        {words.map((word, i) => (
          <span key={i} className="ah-word-wrap">
            <span
              className="ah-word"
              style={{
                opacity: instant ? 1 : 0,
                transform: instant ? 'none' : 'translateY(50px)',
                display: 'inline-block',
              }}
            >
              {word}
              {i < words.length - 1 && splitBy === 'word' ? '\u00A0' : ''}
            </span>
          </span>
        ))}
      </Tag>
    </div>
  )
}
