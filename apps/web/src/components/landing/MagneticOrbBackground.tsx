import { useEffect, useRef } from 'react'
import Orb from '../ui/Orb'
import { scrollState } from '../../hooks/useScrollProgress'
import './MagneticOrb.css'

interface MagneticOrbBackgroundProps {
  activeSection: number
  totalSections?: number
  isMobile: boolean
  reducedMotion?: boolean
  isFooterOpen?: boolean
  hue?: number
  hoverIntensity?: number
  rotateOnHover?: boolean
  forceHoverState?: boolean
  backgroundColor?: string
}

export default function MagneticOrbBackground({
  activeSection,
  totalSections: _totalSections,
  isMobile,
  reducedMotion = false,
  isFooterOpen = false,
  hue = 275,
  hoverIntensity = 1.2,
  rotateOnHover = true,
  forceHoverState = false,
  backgroundColor = '#000000',
}: MagneticOrbBackgroundProps) {
  const podRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (reducedMotion) return

    const defaultXRatio = isMobile ? 0.5 : (activeSection === 1 ? 0.28 : 0.74)
    let currentX = window.innerWidth * defaultXRatio
    let currentY = window.innerHeight * 0.5
    const is3DSectionActive = !isFooterOpen && (isMobile ? activeSection === 0 : (activeSection === 0 || activeSection === 1))
    let currentScale = is3DSectionActive ? 1.05 : 0.5
    let currentOpacity = is3DSectionActive ? 0.88 : 0.0

    let rafId: number
    const animate = () => {
      rafId = requestAnimationFrame(animate)
      if (!podRef.current) return

      const modelPos = (scrollState as any).modelScreenPos
      const is3DSection = !isFooterOpen && (isMobile ? activeSection === 0 : (activeSection === 0 || activeSection === 1))
      const hasModel = Boolean(is3DSection && (modelPos?.visible !== false))

      // ── Opacity & Scale:
      let targetScale = 1.05
      let targetOpacity = 0.0

      if (hasModel) {
        targetScale = 1.05
        targetOpacity = 0.88
      } else {
        targetScale = 0.5
        targetOpacity = 0.0
      }

      // ── Position:
      // Lock precisely onto the live projected 3D model center
      let targetX = 0
      let targetY = 0

      if (hasModel && modelPos && modelPos.x > 0 && modelPos.y > 0) {
        targetX = modelPos.x
        targetY = modelPos.y
      } else {
        const fallbackXRatio = isMobile ? 0.5 : (activeSection === 1 ? 0.28 : 0.74)
        targetX = window.innerWidth * fallbackXRatio
        targetY = window.innerHeight * 0.5
      }

      // Smooth exponential tracking keeping orb centered directly on 3D model
      currentX += (targetX - currentX) * 0.2
      currentY += (targetY - currentY) * 0.2

      currentScale += (targetScale - currentScale) * 0.12
      currentOpacity += (targetOpacity - currentOpacity) * 0.12

      if (currentOpacity < 0.01) {
        podRef.current.style.display = 'none'
        podRef.current.style.visibility = 'hidden'
      } else {
        podRef.current.style.display = 'flex'
        podRef.current.style.visibility = 'visible'
      }

      podRef.current.style.transform = `translate3d(calc(${currentX.toFixed(1)}px - 50%), calc(${currentY.toFixed(1)}px - 50%), 0) scale(${currentScale.toFixed(3)})`
      podRef.current.style.opacity = currentOpacity.toFixed(3)
    }

    rafId = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [activeSection, isMobile, reducedMotion, isFooterOpen])

  const isInitiallyVisible = activeSection === 0 || (!isMobile && activeSection === 1)

  return (
    <div className="landing-orb-magnet-layer" aria-hidden="true">
      <div
        ref={podRef}
        className="landing-orb-pod"
        style={{
          transform: `translate3d(calc(${isMobile ? 50 : 74}vw - 50%), calc(${isMobile ? 58 : 50}vh - 50%), 0) scale(${isInitiallyVisible ? 1.05 : 0.5})`,
          opacity: isInitiallyVisible ? 0.88 : 0,
          display: isInitiallyVisible ? 'flex' : 'none',
        }}
      >
        <Orb
          hue={hue}
          hoverIntensity={hoverIntensity}
          rotateOnHover={rotateOnHover}
          forceHoverState={forceHoverState}
          backgroundColor={backgroundColor}
        />
      </div>
    </div>
  )
}
