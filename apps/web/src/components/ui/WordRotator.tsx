import React, { useState, useEffect, useRef } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import './WordRotator.css'

export interface WordRotatorProps {
  words: string[]
  interval?: number
  className?: string
  accent?: boolean
}

export const WordRotator: React.FC<WordRotatorProps> = ({
  words,
  interval = 3200,
  className = '',
  accent = true,
}) => {
  const [index, setIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const reducedMotion = useReducedMotion()
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (reducedMotion || words.length <= 1 || isPaused) return

    timerRef.current = window.setInterval(() => {
      setIsTransitioning(true)
      const timeout = window.setTimeout(() => {
        setIndex((prev) => (prev + 1) % words.length)
        setIsTransitioning(false)
      }, 500)

      return () => window.clearTimeout(timeout)
    }, interval)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [words.length, interval, reducedMotion, isPaused])

  const currentWord = words[index] || words[0] || ''
  const nextWord = words[(index + 1) % words.length] || ''

  if (reducedMotion) {
    return (
      <span className={`pb-word-rotator ${accent ? 'pb-word-rotator--accent' : ''} ${className}`.trim()}>
        {words[0]}
      </span>
    )
  }

  return (
    <span
      className={`pb-word-rotator-wrapper ${accent ? 'pb-word-rotator--accent' : ''} ${className}`.trim()}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="text"
      aria-live="polite"
    >
      <span className="pb-word-rotator-viewport">
        <span
          className={`pb-word-rotator-item ${isTransitioning ? 'is-exiting' : 'is-active'}`}
          aria-hidden={isTransitioning}
        >
          {currentWord}
        </span>
        {isTransitioning && (
          <span className="pb-word-rotator-item is-entering" aria-hidden="true">
            {nextWord}
          </span>
        )}
      </span>
    </span>
  )
}

export default WordRotator
