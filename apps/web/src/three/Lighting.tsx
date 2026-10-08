import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../hooks/useScrollProgress'

interface LightingProps {
  scrollProgress: number
}

/**
 * Dark-theme lighting that responds to scroll progress.
 * Low ambient with dramatic directional keys.
 */
export default function Lighting({ scrollProgress: _sp }: LightingProps) {
  const keyLightRef = useRef<THREE.DirectionalLight>(null)
  const accentRef = useRef<THREE.PointLight>(null)

  useFrame(() => {
    if (keyLightRef.current) {
      // Key light intensity modulates with scroll
      const sp = scrollState.smoothProgress
      const intensity = 1.0 + sp * 0.4
      keyLightRef.current.intensity = intensity
    }
    if (accentRef.current) {
      // Red accent light subtly pulses
      const sp = scrollState.smoothProgress
      accentRef.current.intensity = sp > 0.3 && sp < 0.7 ? 0.6 : 0.2
    }
  })

  return (
    <>
      {/* High-key clean ambient for light mono white theme */}
      <ambientLight intensity={0.9} color="#FFFFFF" />

      {/* Key light — crisp directional white */}
      <directionalLight
        ref={keyLightRef}
        position={[4, 5, 4]}
        intensity={1.2}
        color="#FFFFFF"
        castShadow={false}
      />

      {/* Fill light — soft clean fill */}
      <directionalLight
        position={[-3, 3, 2]}
        intensity={0.6}
        color="#F8FAFC"
      />

      {/* Rim light — back edge */}
      <directionalLight
        position={[0, 2, -4]}
        intensity={0.7}
        color="#FFFFFF"
      />

      {/* Red accent point light */}
      <pointLight
        ref={accentRef}
        position={[0, 0.5, 1.5]}
        intensity={0.4}
        color="#dc2626"
        distance={5}
        decay={2}
      />

      {/* Subtle ruby rim bounce */}
      <pointLight
        position={[-3.5, 2.5, -2]}
        intensity={0.3}
        color="#ef4444"
        distance={8}
        decay={2}
      />

      {/* Ground bounce — clean light neutral */}
      <hemisphereLight args={['#FFFFFF', '#F1F5F9', 0.5]} />
    </>
  )
}
