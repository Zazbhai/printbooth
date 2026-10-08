import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../hooks/useScrollProgress'

interface CameraControllerProps {
  scrollProgress: number
  reducedMotion: boolean
  isMobile?: boolean
}

/**
 * Keyframe type
 */
interface CameraKeyframe {
  progress: number
  pos: [number, number, number]
  lookAt: [number, number, number]
}

/**
 * Desktop Camera Keyframes for all 8 sections:
 * 0: Hero (Page 1)
 * 1: Problem (Page 2)
 * 2: Product (Page 3)
 * 3: Process (Page 4)
 * 4: Comparison (Page 5)
 * 5: Dealer (Page 6)
 * 6: Technology (Page 7 - Hardware centerstage)
 * 7: Final CTA (Page 8)
 */
const DESKTOP_KEYFRAMES: CameraKeyframe[] = [
  // 0. Hero (Page 1): frontal-isometric view, camera framed with kiosk on right
  { progress: 0.0,              pos: [0.0, 1.25, 4.5],   lookAt: [0.0, 0.95, 0.0] },
  // 1. Problem (Page 2): slightly lowered to emphasize rugged chassis and card reader
  { progress: 1 / 7,            pos: [0.15, 1.15, 4.3],  lookAt: [0.05, 0.90, 0.0] },
  // 2. Product (Page 3): closer focus on touchscreen and dispensing bay
  { progress: 2 / 7,            pos: [-0.08, 1.08, 4.0], lookAt: [0.0, 0.90, 0.0] },
  // 3. Process / Workflow (Page 4): elevated perspective while model degenerates into text
  { progress: 3 / 7,            pos: [0.0, 1.18, 4.3],   lookAt: [0.0, 0.92, 0.0] },
  // 4. Comparison (Page 5): expansive wide perspective showcasing particle field behind matrix
  { progress: 4 / 7,            pos: [0.0, 1.22, 4.65],  lookAt: [0.0, 0.92, 0.0] },
  // 5. Dealer / Partner (Page 6): focused angle as particles swirl in ascending effervescent sparks
  { progress: 5 / 7,            pos: [0.0, 1.14, 4.4],   lookAt: [0.0, 0.88, 0.0] },
  // 6. Technology / Hardware (Page 7): optimal framing of generated solid model centered on ground radar
  { progress: 6 / 7,            pos: [0.0, 1.05, 4.15],  lookAt: [0.0, 0.82, 0.0] },
  // 7. Final CTA (Page 8): elegant right-stage placement next to start console
  { progress: 1.0,              pos: [0.0, 1.25, 4.5],   lookAt: [0.0, 0.95, 0.0] },
]

/**
 * Mobile Camera Keyframes for all 8 sections:
 */
const MOBILE_KEYFRAMES: CameraKeyframe[] = [
  { progress: 0.0,              pos: [0.0, 1.45, 5.0],   lookAt: [0.0, 1.05, 0.0] },
  { progress: 1 / 7,            pos: [0.0, 1.4, 5.2],    lookAt: [0.0, 1.1, 0.0] },
  { progress: 2 / 7,            pos: [0.0, 1.35, 5.0],   lookAt: [0.0, 1.0, 0.0] },
  { progress: 3 / 7,            pos: [0.0, 1.2, 5.0],    lookAt: [0.0, 0.90, 0.0] },
  { progress: 4 / 7,            pos: [0.0, 1.25, 5.2],   lookAt: [0.0, 0.92, 0.0] },
  { progress: 5 / 7,            pos: [0.0, 1.2, 5.0],    lookAt: [0.0, 0.90, 0.0] },
  { progress: 6 / 7,            pos: [0.0, 0.75, 4.8],   lookAt: [0.0, 0.20, 0.0] },
  { progress: 1.0,              pos: [0.0, 1.2, 5.0],    lookAt: [0.0, 1.0, 0.0] },
]

function getInterpolatedCamera(progress: number, isMobile: boolean) {
  const keyframes = isMobile ? MOBILE_KEYFRAMES : DESKTOP_KEYFRAMES
  let lower = keyframes[0]
  let upper = keyframes[keyframes.length - 1]

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (progress >= keyframes[i].progress && progress <= keyframes[i + 1].progress) {
      lower = keyframes[i]
      upper = keyframes[i + 1]
      break
    }
  }

  const range = upper.progress - lower.progress
  const t = range > 0 ? (progress - lower.progress) / range : 0
  const ease = t * t * (3 - 2 * t) // smoothstep

  const pos: [number, number, number] = [
    lower.pos[0] + (upper.pos[0] - lower.pos[0]) * ease,
    lower.pos[1] + (upper.pos[1] - lower.pos[1]) * ease,
    lower.pos[2] + (upper.pos[2] - lower.pos[2]) * ease,
  ]

  const lookAt: [number, number, number] = [
    lower.lookAt[0] + (upper.lookAt[0] - lower.lookAt[0]) * ease,
    lower.lookAt[1] + (upper.lookAt[1] - lower.lookAt[1]) * ease,
    lower.lookAt[2] + (upper.lookAt[2] - lower.lookAt[2]) * ease,
  ]

  return { pos, lookAt }
}

export default function CameraController({
  scrollProgress = 0,
  reducedMotion,
  isMobile = false,
}: CameraControllerProps) {
  const { camera } = useThree()
  const defaultPos = isMobile ? [0.0, 1.45, 5.0] : [0.0, 1.95, 5.2]
  const defaultLookAt = isMobile ? [0.0, 1.05, 0.0] : [0.0, 1.65, 0.0]
  const targetPos = useRef(new THREE.Vector3(...(defaultPos as [number, number, number])))
  const targetLookAt = useRef(new THREE.Vector3(...(defaultLookAt as [number, number, number])))
  const currentLookAt = useRef(new THREE.Vector3(...(defaultLookAt as [number, number, number])))
  const smoothProgress = useRef(scrollProgress)

  useFrame((state) => {
    if (reducedMotion) {
      camera.position.set(defaultPos[0], defaultPos[1], defaultPos[2])
      camera.lookAt(defaultLookAt[0], defaultLookAt[1], defaultLookAt[2])
      return
    }

    // Smoothly interpolate towards real-time continuous scroll progress
    const activeSp = typeof scrollState !== 'undefined' && scrollState.smoothProgress > 0
      ? scrollState.smoothProgress
      : scrollProgress
    const prevSp = smoothProgress.current
    smoothProgress.current += (activeSp - smoothProgress.current) * 0.14
    const scrollVel = (activeSp - prevSp) * 16.0
    const { pos, lookAt } = getInterpolatedCamera(smoothProgress.current, isMobile)

    // Interactive mouse / touch parallax offset for realistic camera depth (disabled on mobile)
    const parallaxWeight = isMobile ? 0 : 0.28
    const mouseX = state.pointer.x * parallaxWeight
    const mouseY = state.pointer.y * (parallaxWeight * 0.75)

    // Dynamic scroll elevation and pitch response
    const scrollPitchY = scrollVel * 0.12

    targetPos.current.set(pos[0] + mouseX, pos[1] + mouseY + scrollPitchY, pos[2])
    targetLookAt.current.set(lookAt[0] + mouseX * 0.35, lookAt[1] + mouseY * 0.35 - scrollPitchY * 0.5, lookAt[2])

    // Crispy, responsive camera tracking synchronized with section transitions
    camera.position.lerp(targetPos.current, 0.13)
    currentLookAt.current.lerp(targetLookAt.current, 0.13)
    camera.lookAt(currentLookAt.current)
  })

  return null
}
