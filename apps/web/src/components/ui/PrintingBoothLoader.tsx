import { useEffect, useRef } from 'react'
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
      const frag = document.createDocumentFragment()
      TOP.split('').forEach((ch, i) => {
        const span = document.createElement('span')
        span.className = 'pbl-letter' + (shardIndices.has(i) ? ' pbl-shard' : '') + ' pbl-in'
        span.textContent = ch
        span.style.animationDelay = `${i * 0.05}s`
        frag.appendChild(span)
      })
      topWordRef.current.appendChild(frag)
    }

    if (bottomWordRef.current) {
      bottomWordRef.current.innerHTML = ''
      const frag = document.createDocumentFragment()
      BOTTOM.split('').forEach((ch, i) => {
        const span = document.createElement('span')
        span.className = 'pbl-letter pbl-in'
        span.textContent = ch
        span.style.animationDelay = `${i * 0.05}s`
        frag.appendChild(span)
      })
      bottomWordRef.current.appendChild(frag)
    }

    // Immediately trigger animations
    if (stageRef.current) stageRef.current.classList.add('pbl-live')
    if (scanlineRef.current) scanlineRef.current.classList.add('pbl-sweep')

    const timer = setTimeout(() => {
      if (taglineRef.current) taglineRef.current.classList.add('pbl-in')
    }, 500)

    // ── Silky, lightweight 2D Canvas ambient particles (0% GPU spike) ──
    const canvas = canvasRef.current
    if (!canvas) return () => clearTimeout(timer)

    let animId: number
    let running = true
    const ctx = canvas.getContext('2d', { alpha: true })
    const colors = ['#f3b023', '#7f17b2', '#3253ec', '#00c2f2', '#29c2ff']
    const COUNT = 48
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let width = 0
    let height = 0

    function resize() {
      if (!canvas) return
      width = canvas.parentElement?.clientWidth || window.innerWidth
      height = canvas.parentElement?.clientHeight || window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize, { passive: true })

    const dots = Array.from({ length: COUNT }, (_, i) => ({
      x: Math.random() * (width || 1000),
      y: Math.random() * (height || 800),
      r: 1.2 + Math.random() * 2.2,
      color: colors[i % colors.length],
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      alpha: 0.3 + Math.random() * 0.5,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.02 + Math.random() * 0.025,
    }))

    function render() {
      if (!running || !ctx) return
      if (document.hidden) {
        animId = requestAnimationFrame(render)
        return
      }

      ctx.clearRect(0, 0, width, height)

      for (let k = 0; k < COUNT; k++) {
        const d = dots[k]
        d.x += d.vx
        d.y += d.vy
        d.pulse += d.pulseSpeed

        if (d.x < -10) d.x = width + 10
        else if (d.x > width + 10) d.x = -10
        if (d.y < -10) d.y = height + 10
        else if (d.y > height + 10) d.y = -10

        const a = d.alpha * (0.8 + 0.2 * Math.sin(d.pulse))
        ctx.globalAlpha = a
        ctx.fillStyle = d.color
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, 6.28318)
        ctx.fill()
      }

      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)

    return () => {
      running = false
      clearTimeout(timer)
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
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
