import { Suspense, useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Preload } from '@react-three/drei'
import PrintBoothModel from './PrintBoothModel'
import CameraController from './CameraController'
import Lighting from './Lighting'

interface PrintBoothSceneProps {
  scrollProgress: number
  activeSection: number
  totalSections: number
  reducedMotion: boolean
  isMobile: boolean
  isHero?: boolean
}

function SceneFallback() {
  return null
}

export default function PrintBoothScene({
  scrollProgress,
  activeSection,
  totalSections,
  reducedMotion,
  isMobile,
  isHero = true,
}: PrintBoothSceneProps) {
  const [webglAvailable, setWebglAvailable] = useState(true)

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
      if (!gl) setWebglAvailable(false)
    } catch {
      setWebglAvailable(false)
    }
  }, [])

  if (!webglAvailable) {
    return (
      <div className="scene-fallback" aria-label="PrintBooth kiosk">
        <div className="scene-fallback__text">PRINTBOOTH</div>
      </div>
    )
  }

  // 3D scene is strictly displayed on Hero (activeSection === 0) on mobile; Hero + Section 2 (activeSection === 1) on desktop
  if (isMobile ? activeSection !== 0 : (activeSection !== 0 && activeSection !== 1)) {
    return null
  }
  const exploded = 0

  return (
    <div
      className="scene-container"
      aria-label="Interactive 3D view of PrintBooth kiosk"
      role="img"
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <Canvas
        camera={{
          fov: isMobile ? 50 : 48,
          near: 0.1,
          far: 50,
          position: isMobile ? [0.0, 1.45, 5.0] : [0.0, 1.95, 5.2],
        }}
        dpr={isMobile ? 1 : [1, 2]}
        performance={{ min: 0.5 }}
        gl={{
          antialias: !isMobile,
          alpha: true,
          powerPreference: isMobile ? 'low-power' : 'high-performance',
          precision: isMobile ? 'mediump' : 'highp',
          stencil: false,
          depth: true,
        }}
        style={{ background: 'transparent', pointerEvents: 'none' }}
      >
        <Suspense fallback={<SceneFallback />}>
          <CameraController
            scrollProgress={scrollProgress}
            reducedMotion={reducedMotion}
            isMobile={isMobile}
          />
          <Lighting scrollProgress={scrollProgress} />
          <PrintBoothModel
            scrollProgress={scrollProgress}
            activeSection={activeSection}
            totalSections={totalSections}
            exploded={exploded}
            isInteractive={isHero}
            isMobile={isMobile}
          />
          <Preload all />
        </Suspense>
      </Canvas>
    </div>
  )
}

