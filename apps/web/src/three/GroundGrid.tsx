import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import * as THREE from 'three'
import { scrollState } from '../hooks/useScrollProgress'

interface GroundGridProps {
  isMobile?: boolean
}

/**
 * High-tech ground grid beneath the PrintBooth kiosk.
 * Features:
 * - Infinite perspective grid with subtle red section lines and dark cell lines
 * - Ground glow ring directly under the kiosk pedestal
 * - Reactive pulse responding to scroll velocity
 */
export default function GroundGrid({ isMobile = false }: GroundGridProps) {
  const ringRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime()
    const vel = Math.abs(scrollState.velocity)

    if (ringRef.current) {
      // Subtle pulse on the pedestal ring
      const baseScale = 1 + Math.sin(time * 1.5) * 0.02 + Math.min(vel * 0.001, 0.08)
      ringRef.current.scale.set(baseScale, baseScale, 1)
    }

    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshBasicMaterial
      if (mat) {
        mat.opacity = 0.12 + Math.sin(time * 2) * 0.04 + Math.min(vel * 0.002, 0.1)
      }
    }
  })

  return (
    <group position={[0, 0, 0]}>
      {/* 3D Grid helper from Drei — subtle light cell lines with PrintBooth red section lines */}
      <Grid
        position={[0, -0.005, 0]}
        args={[30, 30]}
        cellSize={isMobile ? 0.6 : 0.5}
        cellThickness={0.8}
        cellColor="#e4e4e7"
        sectionSize={isMobile ? 2.4 : 2.5}
        sectionThickness={1.4}
        sectionColor="#dc2626"
        fadeDistance={isMobile ? 14 : 22}
        fadeStrength={1.4}
        infiniteGrid
      />

      {/* Subtle illuminated pedestal ring under kiosk base */}
      <mesh
        ref={ringRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.002, 0]}
      >
        <ringGeometry args={[0.9, 0.94, 64]} />
        <meshBasicMaterial
          color="#dc2626"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Soft contact glow disc under the kiosk */}
      <mesh
        ref={glowRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
      >
        <circleGeometry args={[1.2, 48]} />
        <meshBasicMaterial
          color="#ef4444"
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Dark contact shadow disc directly under the kiosk feet to anchor it */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.0005, 0]}
      >
        <circleGeometry args={[0.8, 36]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
