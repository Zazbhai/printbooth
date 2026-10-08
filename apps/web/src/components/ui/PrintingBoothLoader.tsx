import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import './PrintingBoothLoader.css'

interface PrintingBoothLoaderProps {
  fullscreen?: boolean
  className?: string
  taglineText?: string
}

export function PrintingBoothLoader({
  fullscreen = true,
  className = '',
  taglineText = 'Smart • Self-Service • Printing',
}: PrintingBoothLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const scanlineRef = useRef<HTMLDivElement | null>(null)
  const taglineRef = useRef<HTMLDivElement | null>(null)
  const topWordRef = useRef<HTMLDivElement | null>(null)
  const bottomWordRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // ── Build Word Spans ──
    const TOP = 'PRINTING'
    const BOTTOM = 'BOOTH'
    const shardIndices = new Set([3]) // 'N'

    if (topWordRef.current) {
      topWordRef.current.innerHTML = ''
      TOP.split('').forEach((ch, i) => {
        const span = document.createElement('span')
        span.className = 'pbl-letter' + (shardIndices.has(i) ? ' pbl-shard' : '')
        span.textContent = ch
        span.style.animationDelay = `${i * 0.06}s`
        topWordRef.current?.appendChild(span)
      })
    }

    if (bottomWordRef.current) {
      bottomWordRef.current.innerHTML = ''
      BOTTOM.split('').forEach((ch, i) => {
        const span = document.createElement('span')
        span.className = 'pbl-letter'
        span.textContent = ch
        span.style.animationDelay = `${i * 0.06}s`
        bottomWordRef.current?.appendChild(span)
      })
    }

    // Immediately trigger animations
    if (stageRef.current) stageRef.current.classList.add('pbl-live')
    if (scanlineRef.current) {
      void scanlineRef.current.offsetWidth
      scanlineRef.current.classList.add('pbl-sweep')
    }

    const letters = document.querySelectorAll('.pbl-letter')
    letters.forEach(l => {
      void (l as HTMLElement).offsetWidth
      l.classList.add('pbl-in')
    })

    const timer = setTimeout(() => {
      if (taglineRef.current) taglineRef.current.classList.add('pbl-in')
    }, 600)

    // ── Three.js converging particle field ──
    const canvas = canvasRef.current
    if (!canvas) return () => clearTimeout(timer)

    let animFrameId: number
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100)
    camera.position.z = 22

    function resize() {
      if (!canvas) return
      const width = canvas.parentElement?.clientWidth || window.innerWidth
      const height = canvas.parentElement?.clientHeight || window.innerHeight
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

    const palette = [0xf3b023, 0x7f17b2, 0x3253ec, 0x00c2f2, 0x29c2ff]
    const COUNT = 320
    const geo = new THREE.BufferGeometry()
    const targetPos = new Float32Array(COUNT * 3)
    const startPos = new Float32Array(COUNT * 3)
    const drawPos = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    const speeds = new Float32Array(COUNT)
    const tmpColor = new THREE.Color()

    for (let i = 0; i < COUNT; i++) {
      const tx = (Math.random() - 0.5) * 46
      const ty = (Math.random() - 0.5) * 26
      const tz = (Math.random() - 0.5) * 18 - 4
      targetPos[i * 3] = tx
      targetPos[i * 3 + 1] = ty
      targetPos[i * 3 + 2] = tz
      const push = 2.4 + Math.random() * 2.2
      startPos[i * 3] = tx * push
      startPos[i * 3 + 1] = ty * push
      startPos[i * 3 + 2] = tz * push - 6
      drawPos[i * 3] = startPos[i * 3]
      drawPos[i * 3 + 1] = startPos[i * 3 + 1]
      drawPos[i * 3 + 2] = startPos[i * 3 + 2]
      tmpColor.setHex(palette[i % palette.length])
      colors[i * 3] = tmpColor.r
      colors[i * 3 + 1] = tmpColor.g
      colors[i * 3 + 2] = tmpColor.b
      speeds[i] = 0.15 + Math.random() * 0.35
    }
    geo.setAttribute('position', new THREE.BufferAttribute(drawPos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const mat = new THREE.PointsMaterial({
      size: 0.17,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geo, mat)
    scene.add(points)

    function easeOutCubic(t: number) {
      return 1 - Math.pow(1 - t, 3)
    }

    let convergence = 0
    let ambientT = 0
    const clock = new THREE.Clock()
    const startTime = performance.now()
    const duration = 1200

    function animate(now: number) {
      animFrameId = requestAnimationFrame(animate)
      const dt = clock.getDelta()
      const arr = geo.attributes.position.array as Float32Array

      convergence = Math.min(1, (now - startTime) / duration)

      if (convergence < 1) {
        const e = easeOutCubic(convergence)
        for (let i = 0; i < COUNT; i++) {
          arr[i * 3] = startPos[i * 3] + (targetPos[i * 3] - startPos[i * 3]) * e
          arr[i * 3 + 1] = startPos[i * 3 + 1] + (targetPos[i * 3 + 1] - startPos[i * 3 + 1]) * e
          arr[i * 3 + 2] = startPos[i * 3 + 2] + (targetPos[i * 3 + 2] - startPos[i * 3 + 2]) * e
        }
      } else {
        ambientT += dt
        for (let i = 0; i < COUNT; i++) {
          arr[i * 3 + 1] = targetPos[i * 3 + 1] + Math.sin(ambientT * speeds[i] + i) * 0.35
          arr[i * 3] = targetPos[i * 3] + Math.cos(ambientT * 0.15 + i) * 0.25
          arr[i * 3 + 2] = targetPos[i * 3 + 2]
        }
        points.rotation.y = Math.sin(ambientT * 0.05) * 0.15
        points.rotation.z = ambientT * 0.01
      }
      geo.attributes.position.needsUpdate = true
      mat.opacity = 0.35 + 0.35 * Math.min(1, convergence) + (convergence >= 1 ? Math.sin(ambientT * 1.3) * 0.08 : 0)
      renderer.render(scene, camera)
    }

    animFrameId = requestAnimationFrame(animate)

    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(animFrameId)
      window.removeEventListener('resize', resize)
      renderer.dispose()
      geo.dispose()
      mat.dispose()
    }
  }, [])

  return (
    <div className={`pbl-container ${fullscreen ? 'pbl-fullscreen' : ''} ${className}`}>
      <canvas ref={canvasRef} className="pbl-bg" />
      <div ref={stageRef} className="pbl-stage">
        <div ref={scanlineRef} className="pbl-scanline" />
        <div ref={topWordRef} className="pbl-word pbl-top" />
        <div ref={bottomWordRef} className="pbl-word pbl-bottom" />
        <div ref={taglineRef} className="pbl-tagline">
          {taglineText.split('•').map((part, idx, arr) => (
            <span key={idx} className="pbl-tagline-segment">
              <span>{part.trim()}</span>
              {idx < arr.length - 1 && <span className="pbl-dot" />}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
