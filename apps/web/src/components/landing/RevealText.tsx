import { useRef, useEffect, useState } from 'react'
import { animate } from 'animejs'
import { useInView } from '../../hooks/useScrollProgress'
import { useReducedMotion } from '../../hooks/useReducedMotion'

interface RevealTextProps {
  children: React.ReactNode
  className?: string
  delay?: number
  duration?: number
  direction?: 'up' | 'down' | 'left' | 'right'
  distance?: number
}

export default function RevealText({
  children,
  className = '',
  delay = 0,
  duration = 700,
  direction = 'up',
  distance = 40,
}: RevealTextProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [hasAnimated, setHasAnimated] = useState(false)
  const isInView = useInView(ref, 0.15)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!isInView || hasAnimated || !ref.current) return
    setHasAnimated(true)

    if (reducedMotion) {
      ref.current.style.opacity = '1'
      ref.current.style.transform = 'none'
      return
    }

    animate(ref.current, {
      opacity: { to: 1 },
      ...(direction === 'up' || direction === 'down'
        ? { translateY: { to: 0 } }
        : { translateX: { to: 0 } }),
      duration,
      ease: 'outQuad',
      delay,
    })
  }, [isInView, hasAnimated, delay, duration, direction, reducedMotion])

  const initialTransform = (() => {
    switch (direction) {
      case 'up': return `translateY(${distance}px)`
      case 'down': return `translateY(${-distance}px)`
      case 'left': return `translateX(${distance}px)`
      case 'right': return `translateX(${-distance}px)`
    }
  })()

  return (
    <div
      ref={ref}
      className={`reveal-text ${className}`}
      style={{ opacity: 0, transform: initialTransform }}
    >
      {children}
    </div>
  )
}
