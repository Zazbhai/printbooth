import React, { useEffect, useRef, useState, useMemo } from 'react'
import './CuboidPrinter3D.css'

interface CuboidPrinter3DProps {
  isPrinting: boolean
  isColor?: boolean
  currentPage?: number
  totalPages?: number
  previewImages?: string[]
  onPageCycle?: (page: number) => void
}

function Cuboid({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={`cuboid ${className}`}>
      <div className="cuboid__side" />
      <div className="cuboid__side" />
      <div className="cuboid__side" />
      <div className="cuboid__side">{children}</div>
      <div className="cuboid__side" />
      <div className="cuboid__side" />
    </div>
  )
}

export default function CuboidPrinter3D({
  isPrinting,
  isColor = false,
  currentPage = 1,
  previewImages = [],
  onPageCycle,
}: CuboidPrinter3DProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [rotX, setRotX] = useState(0)
  const [rotY, setRotY] = useState(0)
  const [cycleKey, setCycleKey] = useState(0)

  // Default fallback icons if no user preview is available
  const defaultPreviews = useMemo(
    () => [
      'https://assets.codepen.io/605876/css-tricks-icon.svg',
      'https://assets.codepen.io/605876/sitepoint-icon.svg',
      'https://assets.codepen.io/605876/smashing-icon.svg',
      'https://assets.codepen.io/605876/egghead-icon.svg',
      'https://assets.codepen.io/605876/codepen-icon.svg',
    ],
    []
  )

  // Active preview image for current page
  const activePreview = useMemo(() => {
    if (previewImages && previewImages.length > 0) {
      const idx = Math.max(0, (currentPage - 1) % previewImages.length)
      return previewImages[idx]
    }
    return defaultPreviews[(currentPage - 1) % defaultPreviews.length]
  }, [previewImages, defaultPreviews, currentPage])

  // Play realistic mechanical print audio on cycle trigger
  useEffect(() => {
    if (!isPrinting) return
    const audio = new Audio('https://assets.codepen.io/605876/print.mp3')
    audio.volume = 0.4
    const playPromise = audio.play()
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay policy prevented playback; ignore gracefully
      })
    }
    return () => {
      audio.pause()
      audio.currentTime = 0
    }
  }, [cycleKey, isPrinting])

  // Whenever currentPage updates while printing, re-trigger the CSS keyframe cycle
  useEffect(() => {
    if (isPrinting) {
      setCycleKey(prev => prev + 1)
      onPageCycle?.(currentPage)
    }
  }, [currentPage, isPrinting, onPageCycle])

  // Mouse / Pointer Parallax on 3D stage
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    const bound = 22
    const newY = -(y / (rect.height / 2)) * bound
    const newX = (x / (rect.width / 2)) * bound
    setRotX(newY)
    setRotY(newX)
  }

  const handlePointerLeave = () => {
    setRotX(0)
    setRotY(0)
  }

  // Calculate speeds based on 5s (BW) or 10s (Color)
  // Standard CSS timings:
  // total = ((load * 0.75) + print + shoot)
  // For BW 5s: load=2.2, print=1.3, shoot=1.5 => (1.65 + 1.3 + 1.5) = 4.45s + 0.55s buffer
  // For Color 10s: load=4.4, print=2.6, shoot=3.0 => (3.3 + 2.6 + 3.0) = 8.9s + 1.1s buffer
  const loadSpeed = isColor ? 4.4 : 2.2
  const printSpeed = isColor ? 2.6 : 1.3
  const shootSpeed = isColor ? 3.0 : 1.5

  return (
    <div
      ref={stageRef}
      className="printer-3d-stage"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={
        {
          '--rotate-x': rotX,
          '--rotate-y': rotY,
          '--load-speed': loadSpeed,
          '--print-speed': printSpeed,
          '--shoot-speed': shootSpeed,
        } as React.CSSProperties
      }
    >
      <div className={`printer-3d-wrapper ${isPrinting ? 'printing' : ''}`} key={cycleKey}>
        <div className="printer-scene">
          <div className="printer">
            {/* Left Casing */}
            <div className="printer__side printer__side--left">
              <Cuboid className="cuboid--side" />
            </div>

            {/* Right Casing with status lights and physical button */}
            <div className="printer__side printer__side--right">
              <div className="cuboid cuboid--side">
                <div className="cuboid__side" />
                <div className="cuboid__side" />
                <div className="cuboid__side" />
                <div className="cuboid__side">
                  <div className="light progress-light" title={isPrinting ? 'Printing' : 'Standby'} />
                  <div className="light standby-light" title="Online" />
                  <button type="button" className="print-button" aria-label="Printer Control">
                    <div className="button">
                      <Cuboid className="cuboid--button" />
                    </div>
                  </button>
                </div>
                <div className="cuboid__side" />
                <div className="cuboid__side" />
              </div>
            </div>

            {/* Output & Input Trays */}
            <div className="printer__tray printer__tray--bottom">
              <Cuboid className="cuboid--tray" />
            </div>
            <div className="printer__tray printer__tray--top">
              <Cuboid className="cuboid--tray" />
            </div>

            {/* Top Lid & Live Preview Screen */}
            <div className="printer__top">
              <div className="cuboid cuboid--top">
                <div className="cuboid__side" />
                <div className="cuboid__side" />
                <div className="cuboid__side" />
                <div className="cuboid__side">
                  <div className="screen">
                    <div className="screen__preview">
                      <div className="screen__previews">
                        <img
                          src={activePreview}
                          alt={`Page ${currentPage}`}
                          style={{ filter: !isColor ? 'grayscale(1)' : 'none' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="cuboid__side" />
                <div className="cuboid__side" />
              </div>
            </div>

            {/* Back Panel */}
            <div className="printer__back">
              <Cuboid className="cuboid--back" />
            </div>

            {/* Printed Page Ejection Mechanism */}
            <div className="printed">
              <div className="printed__spinner">
                <div className="printed__paper">
                  <div className="printed__papiere">
                    <div className="paper-preview">
                      <div className="paper-preview__previews">
                        <img
                          src={activePreview}
                          alt={`Printed page ${currentPage}`}
                          style={{ filter: !isColor ? 'grayscale(1)' : 'none' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="printed__paper-back" />
              </div>
            </div>

            {/* Input Paper Stacks */}
            <div className="paper-stack paper-stack--bottom">
              <Cuboid className="cuboid--paper" />
            </div>
            <div className="paper-stack paper-stack--top">
              <div className="cuboid cuboid--paper">
                <div className="cuboid__side">
                  <div className="paper">
                    <div className="paper__flyer" />
                  </div>
                </div>
                <div className="cuboid__side" />
                <div className="cuboid__side" />
                <div className="cuboid__side" />
                <div className="cuboid__side" />
                <div className="cuboid__side" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
