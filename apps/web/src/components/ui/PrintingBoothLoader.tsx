import React, { useEffect, useRef } from 'react'
import './PrintingBoothLoader.css'

export interface PrintingBoothLoaderProps {
  fullscreen?: boolean
  className?: string
  style?: React.CSSProperties
  ready?: boolean
  onComplete?: () => void
  taglineText?: string
  message?: string
}

export function PrintingBoothLoader({
  fullscreen = true,
  className = '',
  style,
  ready = false,
  onComplete,
  taglineText,
  message,
}: PrintingBoothLoaderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const completedRef = useRef(false)

  // If ready is signaled, smoothly finish
  useEffect(() => {
    if (ready && onComplete && !completedRef.current) {
      completedRef.current = true
      const timer = setTimeout(() => {
        onComplete()
      }, 350)
      return () => clearTimeout(timer)
    }
  }, [ready, onComplete])

  const handleClick = () => {
    if (onComplete && !completedRef.current) {
      completedRef.current = true
      onComplete()
    }
  }

  const rawSubtitle = message || taglineText || 'AUTONOMOUS PRINTING'
  const cleanSubtitle = rawSubtitle.replace(/(\.{3}|…)$/, '')

  return (
    <div
      ref={containerRef}
      className={`pb-loader-container ${fullscreen ? 'pb-loader-container--fullscreen' : ''} ${className}`}
      style={style}
      onClick={handleClick}
      role="status"
      aria-label="Loading PrintBooth"
    >
      <div className="pb-loader-stage">
        {/* 1. Static Brand Hardware Emblem (Completely static, no animation on logo) */}
        <div className="pb-emblem-wrapper">
          <img
            className="pb-emblem-img"
            src="/printbooth-emblem-trans.png"
            alt="PrintBooth Emblem"
            draggable={false}
          />
        </div>

        {/* Clean Static Ground Shadow */}
        <div className="pb-ground-shadow" />

        {/* 2. Optimized Kinetic Wordmark Typography (Montserrat 900) */}
        <div className="pb-wordmark" aria-label="PRINTBOOTH">
          <div className="pb-word-group pb-word--print">
            <span className="pb-char" style={{ '--i': 0 } as React.CSSProperties}>P</span>
            <span className="pb-char" style={{ '--i': 1 } as React.CSSProperties}>R</span>
            <span className="pb-char" style={{ '--i': 2 } as React.CSSProperties}>I</span>
            <span className="pb-char" style={{ '--i': 3 } as React.CSSProperties}>N</span>
            <span className="pb-char" style={{ '--i': 4 } as React.CSSProperties}>T</span>
          </div>
          <div className="pb-word-group pb-word--booth">
            <span className="pb-char pb-char--red" style={{ '--i': 5 } as React.CSSProperties}>B</span>
            <span className="pb-char pb-char--red" style={{ '--i': 6 } as React.CSSProperties}>O</span>
            <span className="pb-char pb-char--red" style={{ '--i': 7 } as React.CSSProperties}>O</span>
            <span className="pb-char pb-char--red" style={{ '--i': 8 } as React.CSSProperties}>T</span>
            <span className="pb-char pb-char--red" style={{ '--i': 9 } as React.CSSProperties}>H</span>
          </div>
          <div className="pb-wordmark-glint" />
        </div>

        {/* 3. Optimized Status Tagline with Pulse Radar & Text Shimmer */}
        <div className="pb-tagline">
          <span className="pb-tagline-dot-wrap">
            <span className="pb-tagline-dot" />
            <span className="pb-tagline-radar" />
          </span>
          <span className="pb-tagline-text">{cleanSubtitle}</span>
          <span className="pb-tagline-ellipsis" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </div>
      </div>
    </div>
  )
}

export default PrintingBoothLoader
