"use client"

import React, { useEffect, useState } from "react"
import "./meteors.css"

export interface MeteorsProps {
  number?: number
  minDelay?: number
  maxDelay?: number
  minDuration?: number
  maxDuration?: number
  angle?: number
  className?: string
}

export const Meteors: React.FC<MeteorsProps> = ({
  number = 36,
  minDelay = 0.1,
  maxDelay = 4.5,
  minDuration,
  maxDuration,
  className,
}) => {
  const [meteorStyles, setMeteorStyles] = useState<Array<React.CSSProperties>>([])

  useEffect(() => {
    const styles = [...new Array(number)].map((_, i) => {
      const rand = Math.random()
      
      // Small, realistic meteor sizing ("small & less shiny")
      let size = 1.8
      let tailThickness = 1.2
      let tailLength = 65
      let opacity = 0.78
      let duration = 2.4

      if (rand < 0.50) {
        // Fine swift shooting sparks
        size = 1.5
        tailThickness = 1.0
        tailLength = Math.floor(Math.random() * 25 + 45) // 45px - 70px
        opacity = +(Math.random() * 0.12 + 0.65).toFixed(2)
        duration = minDuration && maxDuration
          ? +(Math.random() * (maxDuration - minDuration) + minDuration).toFixed(2)
          : +(Math.random() * 0.5 + 2.0).toFixed(2) // 2.0s - 2.5s
      } else if (rand < 0.85) {
        // Medium realistic meteors
        size = 1.9
        tailThickness = 1.2
        tailLength = Math.floor(Math.random() * 30 + 65) // 65px - 95px
        opacity = +(Math.random() * 0.1 + 0.72).toFixed(2)
        duration = minDuration && maxDuration
          ? +(Math.random() * (maxDuration - minDuration) + minDuration).toFixed(2)
          : +(Math.random() * 0.6 + 1.7).toFixed(2) // 1.7s - 2.3s
      } else {
        // Slightly faster bright streaks (freefall gravity)
        size = 2.3
        tailThickness = 1.4
        tailLength = Math.floor(Math.random() * 35 + 85) // 85px - 120px
        opacity = 0.85
        duration = minDuration && maxDuration
          ? +(Math.random() * (maxDuration - minDuration) * 0.6 + minDuration).toFixed(2)
          : +(Math.random() * 0.4 + 1.4).toFixed(2) // 1.4s - 1.8s
      }

      // Falls from UPSIDE with a graceful celestial tilt (~20deg from vertical)
      const startTop = `-${Math.floor(Math.random() * 50 + 35)}px`
      
      // Spawn distribution:
      // Distributed across 10% to 115% so that as they drift left during descent,
      // they sweep cleanly across breadcrumbs, cards, and flanks
      let startLeft: string
      if (i % 2 === 0) {
        // Sweeps directly through the breadcrumbs & card stage
        startLeft = `${Math.floor(Math.random() * 45 + 42)}%` // 42% to 87%
      } else if (i % 4 === 1) {
        // Left flank
        startLeft = `${Math.floor(Math.random() * 30 + 8)}%` // 8% to 38%
      } else {
        // Right flank
        startLeft = `${Math.floor(Math.random() * 28 + 88)}%` // 88% to 116%
      }

      // Natural tilt: ~20deg from vertical with subtle organic variation (+/- 2.5deg)
      const tilt = +(19.5 + (Math.random() - 0.5) * 5).toFixed(1)

      const delay = (Math.random() * (maxDelay - minDelay) + minDelay).toFixed(2)

      return {
        "--tilt": `${tilt}deg`,
        "--tail-length": `${tailLength}px`,
        "--tail-thickness": `${tailThickness}px`,
        "--meteor-size": `${size}px`,
        "--meteor-opacity": opacity,
        top: startTop,
        left: startLeft,
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`,
      } as React.CSSProperties
    })
    setMeteorStyles(styles)
  }, [number, minDelay, maxDelay, minDuration, maxDuration])

  return (
    <div className={`meteors-field-container ${className || ""}`}>
      {meteorStyles.map((style, idx) => (
        <span
          key={idx}
          style={style}
          className="meteor-head"
        >
          <div className="meteor-tail" />
        </span>
      ))}
    </div>
  )
}

export default Meteors
