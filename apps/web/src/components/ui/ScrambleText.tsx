import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import './ScrambleText.css'

const DEFAULT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=-/'

export interface ScrambleTextProps {
  text: string
  characters?: string
  duration?: number
  speed?: number
  delay?: number
  triggerOnView?: boolean
  scrambleOnHover?: boolean
  className?: string
  as?: React.ElementType
  onComplete?: () => void
}

export const ScrambleText: React.FC<ScrambleTextProps> = ({
  text,
  characters = DEFAULT_CHARS,
  duration = 700,
  speed = 36,
  delay = 0,
  triggerOnView = true,
  scrambleOnHover = true,
  className = '',
  as: Component = 'span',
  onComplete,
}) => {
  const [displayText, setDisplayText] = useState(text)
  const [isScrambling, setIsScrambling] = useState(false)
  const reducedMotion = useReducedMotion()
  const elRef = useRef<HTMLElement>(null)
  const animFrameRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const hasTriggeredRef = useRef(false)

  const stopScramble = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsScrambling(false)
  }, [])

  const startScramble = useCallback(() => {
    if (reducedMotion) {
      setDisplayText(text)
      return
    }

    stopScramble()
    setIsScrambling(true)

    const startTime = performance.now() + delay
    let lastGlyphShuffle = 0

    const step = (now: number) => {
      if (now < startTime) {
        animFrameRef.current = requestAnimationFrame(step)
        return
      }

      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / duration)

      // Number of resolved characters from left to right
      const resolvedCount = Math.floor(progress * text.length)

      if (now - lastGlyphShuffle > speed) {
        lastGlyphShuffle = now
        const scrambled = text
          .split('')
          .map((char, index) => {
            if (char === ' ' || char === '\n' || char === '\t') return char
            if (index < resolvedCount) return text[index]
            const randIdx = Math.floor(Math.random() * characters.length)
            return characters[randIdx]
          })
          .join('')

        setDisplayText(scrambled)
      }

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step)
      } else {
        setDisplayText(text)
        setIsScrambling(false)
        animFrameRef.current = null
        onComplete?.()
      }
    }

    animFrameRef.current = requestAnimationFrame(step)
  }, [text, characters, duration, speed, delay, reducedMotion, stopScramble, onComplete])

  // In-view trigger
  useEffect(() => {
    if (!triggerOnView || hasTriggeredRef.current || reducedMotion) return

    const node = elRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasTriggeredRef.current) {
          hasTriggeredRef.current = true
          startScramble()
        }
      },
      { threshold: 0.15 }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [triggerOnView, reducedMotion, startScramble])

  // Hover trigger
  const handleMouseEnter = () => {
    if (scrambleOnHover && !isScrambling && !reducedMotion) {
      startScramble()
    }
  }

  useEffect(() => {
    setDisplayText(text)
    return () => stopScramble()
  }, [text, stopScramble])

  return (
    <Component
      ref={elRef}
      className={`pb-scramble-text ${isScrambling ? 'is-scrambling' : ''} ${className}`.trim()}
      onMouseEnter={handleMouseEnter}
      aria-label={text}
      data-text={text}
    >
      {displayText}
    </Component>
  )
}

export default ScrambleText
