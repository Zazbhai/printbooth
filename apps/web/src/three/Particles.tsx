import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../hooks/useScrollProgress'

interface ParticlesProps {
  count?: number
  totalSections?: number
  activeSection?: number
  scrollProgress?: number
  isMobile?: boolean
}

/**
 * Creates an anti-aliased soft radial glowing dot texture
 */
function createCircleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.85)')
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.25)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 32, 32)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

/**
 * Volumetric cosmic particle system with active harmonic flow,
 * scroll streaking warp acceleration, and automatic Hero section suppression.
 */
export default function Particles({
  count = 420,
  activeSection = 0,
  isMobile = false,
}: ParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null)
  const currentOpacity = useRef(0)
  const circleTexture = useMemo(() => createCircleTexture(), [])

  // Particle data: base positions, orbital parameters, velocities, colors
  const { geometry, meta } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    type ParticleMeta = {
      baseX: number
      baseY: number
      baseZ: number
      orbitRadiusX: number
      orbitRadiusY: number
      orbitRadiusZ: number
      speed: number
      phase: number
      twinkleSpeed: number
      twinklePhase: number
      baseColorR: number
      baseColorG: number
      baseColorB: number
    }

    const metadata: ParticleMeta[] = []

    for (let i = 0; i < count; i++) {
      // Wide volumetric distribution throughout the scene
      const bx = (Math.random() - 0.5) * 16.0
      const by = (Math.random() - 0.5) * 12.0
      const bz = (Math.random() - 0.5) * 9.0 - 1.0

      positions[i * 3] = bx
      positions[i * 3 + 1] = by
      positions[i * 3 + 2] = bz

      sizes[i] = isMobile ? (Math.random() * 0.035 + 0.025) : (Math.random() * 0.05 + 0.03)

      // Color scheme:
      // Vibrant Laser Red (#dc2626), Crimson (#ef4444), Coral Rose (#f87171), Deep Ink Charcoal
      const randColor = Math.random()
      let cr = 1, cg = 1, cb = 1
      if (randColor < 0.35) {
        // Vibrant Laser Red #dc2626
        cr = 0.863; cg = 0.149; cb = 0.149
      } else if (randColor < 0.65) {
        // Bright Crimson #ef4444
        cr = 0.937; cg = 0.267; cb = 0.267
      } else if (randColor < 0.85) {
        // Coral Rose #f87171
        cr = 0.973; cg = 0.443; cb = 0.443
      } else {
        // Deep Charcoal for contrast on light background
        cr = 0.12; cg = 0.12; cb = 0.16
      }

      colors[i * 3] = cr
      colors[i * 3 + 1] = cg
      colors[i * 3 + 2] = cb

      metadata.push({
        baseX: bx,
        baseY: by,
        baseZ: bz,
        orbitRadiusX: 0.35 + Math.random() * 0.85,
        orbitRadiusY: 0.25 + Math.random() * 0.70,
        orbitRadiusZ: 0.20 + Math.random() * 0.60,
        speed: 0.35 + Math.random() * 0.65,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: 1.2 + Math.random() * 2.4,
        twinklePhase: Math.random() * Math.PI * 2,
        baseColorR: cr,
        baseColorG: cg,
        baseColorB: cb,
      })
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    return { geometry: geo, meta: metadata }
  }, [count, isMobile])

  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      size: isMobile ? 0.045 : 0.055,
      map: circleTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      vertexColors: true,
    })
  }, [circleTexture, isMobile])

  // Clean up texture on unmount
  useEffect(() => {
    return () => {
      circleTexture.dispose()
    }
  }, [circleTexture])

  useFrame((state) => {
    if (!pointsRef.current) return

    const time = state.clock.getElapsedTime()
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    const colAttr = pointsRef.current.geometry.attributes.color as THREE.BufferAttribute
    const posArray = posAttr.array as Float32Array
    const colArray = colAttr.array as Float32Array

    // USER REQUIREMENT:
    // "particles animation is missing from some pages fix it just dont include it in hero section"
    // Hero section (activeSection === 0): opacity targets 0.0!
    // All other sections (activeSection > 0): opacity targets 0.72 (up to 0.95 when scrolling)!
    const isHero = activeSection === 0
    const scrollVelocity = scrollState.velocity || 0
    const absVel = Math.min(Math.abs(scrollVelocity), 2.5)

    const targetOpacity = isHero ? 0.0 : Math.min(1.0, 0.72 + absVel * 0.12)
    currentOpacity.current += (targetOpacity - currentOpacity.current) * 0.14
    material.opacity = currentOpacity.current

    if (currentOpacity.current <= 0.002) {
      pointsRef.current.visible = false
      return
    }
    pointsRef.current.visible = true

    // Pointer parallax response (gentle responsive sway with user interaction)
    const pX = isMobile ? 0 : state.pointer.x * 0.45
    const pY = isMobile ? 0 : state.pointer.y * 0.35

    // Warp stream factor when scrolling
    const streamY = scrollVelocity * 0.045
    const streamZ = -Math.abs(scrollVelocity) * 0.055

    for (let i = 0; i < count; i++) {
      const m = meta[i]
      const ix = i * 3
      const iy = i * 3 + 1
      const iz = i * 3 + 2

      // Harmonic 3D orbital drift so particles are constantly, smoothly floating
      const ox = Math.sin(time * m.speed + m.phase) * m.orbitRadiusX
      const oy = Math.cos(time * (m.speed * 0.85) + m.phase * 1.4) * m.orbitRadiusY
      const oz = Math.sin(time * (m.speed * 0.6) + m.phase * 0.7) * m.orbitRadiusZ

      // Dynamic positions with mouse parallax and scroll warp velocity
      const depthFactor = 0.5 + (m.baseZ + 6.0) / 12.0
      posArray[ix] = m.baseX + ox + pX * depthFactor
      posArray[iy] = m.baseY + oy + pY * depthFactor + streamY * depthFactor
      posArray[iz] = m.baseZ + oz + streamZ * depthFactor

      // Breathing shimmer & twinkle
      const twinkle = 0.65 + Math.sin(time * m.twinkleSpeed + m.twinklePhase) * 0.35
      const brightnessBoost = 1.0 + absVel * 0.35
      const finalBright = Math.min(1.2, twinkle * brightnessBoost)

      colArray[ix] = m.baseColorR * finalBright
      colArray[iy] = m.baseColorG * finalBright
      colArray[iz] = m.baseColorB * finalBright
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
  })

  return <points ref={pointsRef} geometry={geometry} material={material} />
}
