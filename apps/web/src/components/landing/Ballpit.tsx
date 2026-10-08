// Component inspired by Kevin Levron:
// https://x.com/soju22/status/1858925191671271801
// Adapted from React Bits open-source library

import { useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'

interface BallpitProps {
  count?: number
  gravity?: number
  friction?: number
  wallBounce?: number
  followCursor?: boolean
  colors?: number[]
}

interface Ball {
  position: THREE.Vector3
  velocity: THREE.Vector3
  radius: number
  mesh: THREE.Mesh
}

export default function Ballpit({
  count = 200,
  gravity = 0.7,
  friction = 0.8,
  wallBounce = 0.95,
  followCursor = true,
  colors = [0xdc2626, 0xef4444, 0xb91c1c, 0xf43f5e, 0x18181b, 0x71717a, 0xffffff],
}: BallpitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null)
  const ballsRef = useRef<Ball[]>([])
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2(9999, 9999))
  const rafRef = useRef<number>(0)
  const sizeRef = useRef({ width: 0, height: 0 })

  const createBalls = useCallback((scene: THREE.Scene, width: number, height: number) => {
    // Clear existing balls
    ballsRef.current.forEach(b => scene.remove(b.mesh))
    ballsRef.current = []

    const viewWidth = width
    const viewHeight = height

    for (let i = 0; i < count; i++) {
      const radius = 4 + Math.random() * 12
      const color = colors[Math.floor(Math.random() * colors.length)]
      
      const geometry = new THREE.CircleGeometry(radius, 32)
      const material = new THREE.MeshBasicMaterial({ 
        color,
        transparent: true,
        opacity: 0.6 + Math.random() * 0.4,
      })
      const mesh = new THREE.Mesh(geometry, material)

      const x = (Math.random() - 0.5) * viewWidth
      const y = (Math.random() - 0.5) * viewHeight
      mesh.position.set(x, y, 0)

      // Add subtle depth via scale
      const scale = 0.5 + Math.random() * 0.5
      mesh.scale.set(scale, scale, 1)

      scene.add(mesh)

      ballsRef.current.push({
        position: new THREE.Vector3(x, y, 0),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          0
        ),
        radius: radius * scale,
        mesh,
      })
    }
  }, [count, colors])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight
    sizeRef.current = { width, height }

    // Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Orthographic camera for 2D feel
    const camera = new THREE.OrthographicCamera(
      -width / 2, width / 2,
      height / 2, -height / 2,
      0.1, 1000
    )
    camera.position.z = 100
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Create balls
    createBalls(scene, width, height)

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouseRef.current.x = e.clientX - rect.left - width / 2
      mouseRef.current.y = -(e.clientY - rect.top - height / 2)
    }

    const handleMouseLeave = () => {
      mouseRef.current.set(9999, 9999)
    }

    if (followCursor) {
      container.addEventListener('mousemove', handleMouseMove)
      container.addEventListener('mouseleave', handleMouseLeave)
    }

    // Animation loop
    const animate = () => {
      const w = sizeRef.current.width
      const h = sizeRef.current.height
      const halfW = w / 2
      const halfH = h / 2

      ballsRef.current.forEach(ball => {
        // Apply gravity
        ball.velocity.y -= gravity * 0.1

        // Apply friction
        ball.velocity.x *= friction
        ball.velocity.y *= friction

        // Cursor interaction
        if (followCursor && mouseRef.current.x !== 9999) {
          const dx = ball.position.x - mouseRef.current.x
          const dy = ball.position.y - mouseRef.current.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const cursorRadius = 80

          if (dist < cursorRadius && dist > 0) {
            const force = (cursorRadius - dist) / cursorRadius
            ball.velocity.x += (dx / dist) * force * 2.5
            ball.velocity.y += (dy / dist) * force * 2.5
          }
        }

        // Update position
        ball.position.x += ball.velocity.x
        ball.position.y += ball.velocity.y

        // Wall collisions
        if (ball.position.x - ball.radius < -halfW) {
          ball.position.x = -halfW + ball.radius
          ball.velocity.x *= -wallBounce
        }
        if (ball.position.x + ball.radius > halfW) {
          ball.position.x = halfW - ball.radius
          ball.velocity.x *= -wallBounce
        }
        if (ball.position.y - ball.radius < -halfH) {
          ball.position.y = -halfH + ball.radius
          ball.velocity.y *= -wallBounce
        }
        if (ball.position.y + ball.radius > halfH) {
          ball.position.y = halfH - ball.radius
          ball.velocity.y *= -wallBounce
        }

        // Update mesh
        ball.mesh.position.set(ball.position.x, ball.position.y, 0)
      })

      renderer.render(scene, camera)
      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    // Resize handler
    const handleResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      sizeRef.current = { width: w, height: h }

      camera.left = -w / 2
      camera.right = w / 2
      camera.top = h / 2
      camera.bottom = -h / 2
      camera.updateProjectionMatrix()

      renderer.setSize(w, h)
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)

    return () => {
      cancelAnimationFrame(rafRef.current)
      resizeObserver.disconnect()
      if (followCursor) {
        container.removeEventListener('mousemove', handleMouseMove)
        container.removeEventListener('mouseleave', handleMouseLeave)
      }
      // Cleanup Three.js resources
      ballsRef.current.forEach(b => {
        b.mesh.geometry.dispose()
        ;(b.mesh.material as THREE.MeshBasicMaterial).dispose()
        scene.remove(b.mesh)
      })
      ballsRef.current = []
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [count, gravity, friction, wallBounce, followCursor, colors, createBalls])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: followCursor ? 'auto' : 'none',
      }}
    />
  )
}
