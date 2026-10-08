import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Renderer, Camera, Geometry, Program, Mesh } from 'ogl'
import { ArrowCounterClockwise } from '@phosphor-icons/react'
import { clearAllFiles } from '@/lib/multiFileStore'
import { clearUploadedDoc } from '@/lib/documentStore'
import './CustomerPrintOtpScreen.css'

interface CustomerPrintOtpScreenProps {
  code: string
  kioskId?: string
  kioskName?: string
  orderId?: string
  onCodeChange?: (newCode: string) => void
  onReprint?: () => void
}

export default function CustomerPrintOtpScreen({
  code: initialCode,
  kioskId = 'PB-001',
  kioskName = 'PrintBooth Machine',
  orderId,
  onCodeChange: _onCodeChange,
  onReprint,
}: CustomerPrintOtpScreenProps) {
  const bgRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [currentCode] = useState(() => {
    const raw = initialCode ? String(initialCode).trim() : ''
    return raw.length >= 4 ? raw.slice(0, 4) : '1234'
  })

  const [statusText, setStatusText] = useState('Generating your code…')
  const [isReady, setIsReady] = useState(false)
  const [isGenerating, setIsGenerating] = useState(true)

  // Slots ref for the 4 boxes
  const boxesRef = useRef<(HTMLDivElement | null)[]>([])
  const timersRef = useRef<number[]>([])

  // ── 1. WebGL OGL Particle Background ──
  useEffect(() => {
    const box = bgRef.current
    if (!box) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const P = {
      count: 85,
      spread: 10,
      speed: 0.08,
      size: 110,
      rand: 1,
      cam: 20,
      hover: 1.2,
      colors: ['#e5383b', '#ff5c5f', '#ff9b9d', '#c92a2d'],
      rot: prefersReducedMotion,
    }

    const hex = (h: string) => {
      const clean = h.replace('#', '')
      const n = parseInt(clean, 16)
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
    }

    const vs = `attribute vec3 position;attribute vec4 random;attribute vec3 color;uniform mat4 modelMatrix;uniform mat4 viewMatrix;uniform mat4 projectionMatrix;uniform float uTime;uniform float uSpread;uniform float uBaseSize;uniform float uSizeRandomness;varying vec4 vRandom;varying vec3 vColor;
void main(){vRandom=random;vColor=color;vec3 pos=position*uSpread;pos.z*=10.0;vec4 mPos=modelMatrix*vec4(pos,1.0);float t=uTime;
mPos.x+=sin(t*random.z+6.28*random.w)*mix(0.1,1.5,random.x);mPos.y+=sin(t*random.y+6.28*random.x)*mix(0.1,1.5,random.w);mPos.z+=sin(t*random.w+6.28*random.y)*mix(0.1,1.5,random.z);
vec4 mvPos=viewMatrix*mPos;gl_PointSize=(uBaseSize*(1.0+uSizeRandomness*(random.x-0.5)))/length(mvPos.xyz);gl_Position=projectionMatrix*mvPos;}`

    const fs = `precision highp float;uniform float uTime;varying vec4 vRandom;varying vec3 vColor;
void main(){vec2 uv=gl_PointCoord.xy;float d=length(uv-vec2(0.5));float c=smoothstep(0.5,0.1,d)*0.75;gl_FragColor=vec4(vColor+0.12*sin(uv.yxx+uTime+vRandom.y*6.28),c);}`

    let renderer: any = null
    let animId = 0

    try {
      renderer = new Renderer({
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        depth: false,
        alpha: true,
      })
      const gl = renderer.gl
      box.appendChild(gl.canvas)
      gl.clearColor(0, 0, 0, 0)

      const cam = new Camera(gl, { fov: 15 })
      cam.position.set(0, 0, P.cam)

      const handleResize = () => {
        if (!box) return
        renderer.setSize(box.clientWidth || window.innerWidth, box.clientHeight || window.innerHeight)
        cam.perspective({ aspect: gl.canvas.width / gl.canvas.height })
      }
      window.addEventListener('resize', handleResize)
      handleResize()

      const pos = new Float32Array(P.count * 3)
      const rnd = new Float32Array(P.count * 4)
      const col = new Float32Array(P.count * 3)

      for (let i = 0; i < P.count; i++) {
        let x = 0, y = 0, z = 0, l = 0
        do {
          x = Math.random() * 2 - 1
          y = Math.random() * 2 - 1
          z = Math.random() * 2 - 1
          l = x * x + y * y + z * z
        } while (l > 1 || !l)
        const k = Math.cbrt(Math.random())

        pos.set([x * k, y * k, z * k], i * 3)
        rnd.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
        col.set(hex(P.colors[(Math.random() * P.colors.length) | 0]), i * 3)
      }

      const geo = new Geometry(gl, {
        position: { size: 3, data: pos },
        random: { size: 4, data: rnd },
        color: { size: 3, data: col },
      })

      const prog = new Program(gl, {
        vertex: vs,
        fragment: fs,
        uniforms: {
          uTime: { value: 0 },
          uSpread: { value: P.spread },
          uBaseSize: { value: P.size * Math.min(window.devicePixelRatio || 1, 2) },
          uSizeRandomness: { value: P.rand },
        },
        transparent: true,
        depthTest: false,
      })

      const m = new Mesh(gl, { mode: gl.POINTS, geometry: geo, program: prog })

      const ms = { x: 0, y: 0 }
      const handlePointerMove = (e: PointerEvent) => {
        ms.x = (e.clientX / window.innerWidth) * 2 - 1
        ms.y = -((e.clientY / window.innerHeight) * 2 - 1)
      }
      window.addEventListener('pointermove', handlePointerMove)

      let last = performance.now()
      let el = 0

      const updateLoop = (t: number) => {
        animId = requestAnimationFrame(updateLoop)
        el += (t - last) * P.speed
        last = t
        prog.uniforms.uTime.value = el * 0.001

        m.position.x += (-ms.x * P.hover - m.position.x) * 0.05
        m.position.y += (-ms.y * P.hover - m.position.y) * 0.05

        if (!P.rot) {
          m.rotation.x = Math.sin(el * 0.0002) * 0.1
          m.rotation.y = Math.cos(el * 0.0005) * 0.15
          m.rotation.z += 0.01 * P.speed
        }
        renderer.render({ scene: m, camera: cam })
      }
      animId = requestAnimationFrame(updateLoop)

      return () => {
        cancelAnimationFrame(animId)
        window.removeEventListener('resize', handleResize)
        window.removeEventListener('pointermove', handlePointerMove)
        if (gl.canvas && gl.canvas.parentElement) {
          gl.canvas.parentElement.removeChild(gl.canvas)
        }
      }
    } catch (e) {
      console.warn('Particle background disabled / WebGL unsupported', e)
    }
  }, [])

  // ── Spark particles animation on reel landing ──
  const spawnSparks = (boxEl: HTMLElement) => {
    const cols = ['#e5383b', '#ff9b9d', '#9aa0b2']
    for (let k = 0; k < 4; k++) {
      const a = (Math.PI * 2 * k) / 4 + Math.random() * 0.4
      const d = 30 + Math.random() * 15
      const sp = document.createElement('i')
      sp.className = 'sp-otp'
      sp.style.setProperty('--dx', `${Math.cos(a) * d}px`)
      sp.style.setProperty('--dy', `${Math.sin(a) * d}px`)
      sp.style.setProperty('--c', cols[k % 3])
      boxEl.appendChild(sp)
      setTimeout(() => sp.remove(), 600)
    }
  }

  // ── Tactile button ripple ──
  const handleRipple = (e: React.PointerEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget
    btn.classList.add('p')
    setTimeout(() => btn.classList.remove('p'), 200)

    const q = btn.getBoundingClientRect()
    const s = q.width * 1.6
    const r = document.createElement('span')
    r.className = 'r-otp'
    r.style.width = `${s}px`
    r.style.height = `${s}px`
    r.style.left = `${e.clientX - q.left - s / 2}px`
    r.style.top = `${e.clientY - q.top - s / 2}px`
    btn.appendChild(r)
    setTimeout(() => r.remove(), 600)
  }

  // ── Slot Machine Reels Spin Execution ──
  const spinReelsToTarget = useCallback((targetCode: string) => {
    // Clear any pending timers
    timersRef.current.forEach(t => clearTimeout(t))
    timersRef.current = []

    setIsReady(false)
    setIsGenerating(true)
    setStatusText('Connecting to printer…')

    const pushTimer = (cb: () => void, ms: number) => {
      const tid = window.setTimeout(cb, ms)
      timersRef.current.push(tid)
    }

    pushTimer(() => setStatusText('Securing your code…'), 400)
    pushTimer(() => setStatusText('Almost there…'), 850)

    const digits = targetCode.split('').map(d => Number(d) || 0)

    boxesRef.current.forEach((b, i) => {
      if (!b) return
      b.classList.remove('land', 'done')
      const oldRing = b.querySelector('.ring-otp')
      if (oldRing) oldRing.remove()

      const reel = b.querySelector('.reel') as HTMLElement | null
      if (!reel) return

      const n = 10 + i * 3
      const dur = 0.75 + i * 0.14
      reel.className = 'reel'
      reel.style.transition = 'none'

      let html = ''
      for (let k = 0; k < n; k++) {
        const char = k === n - 1 ? digits[i] : Math.floor(Math.random() * 10)
        html += `<span>${char}</span>`
      }
      reel.innerHTML = html
      reel.style.setProperty('--n', String(n))
      reel.style.removeProperty('transition')
      reel.style.setProperty('--dur', `${dur}s`)

      // Trigger reflow to restart CSS animation
      void reel.offsetHeight

      pushTimer(() => reel.classList.add('go'), 50 + i * 35)
      pushTimer(() => {
        reel.classList.add('sharp')
        b.classList.add('land', 'done')
        b.insertAdjacentHTML('beforeend', '<i class="ring-otp"></i>')
        spawnSparks(b)
        try {
          if (navigator.vibrate) navigator.vibrate(12)
        } catch {}
      }, dur * 1000 + 80)
    })

    pushTimer(() => {
      setIsGenerating(false)
      setIsReady(true)
      setStatusText('Valid for one print only')
      try {
        if (navigator.vibrate) navigator.vibrate([20, 30])
      } catch {}
    }, 1380)
  }, [])

  // Mount animation
  useEffect(() => {
    spinReelsToTarget(currentCode)
    return () => {
      timersRef.current.forEach(t => clearTimeout(t))
    }
  }, [currentCode, spinReelsToTarget])

  // ── Reprint: Clear files & redirect back to upload ──
  const handleReprint = (e: React.PointerEvent<HTMLButtonElement>) => {
    handleRipple(e)
    if (onReprint) {
      onReprint()
    } else {
      clearAllFiles()
      clearUploadedDoc()
      sessionStorage.removeItem('pb_files')
      sessionStorage.removeItem('pb_print_step')
      sessionStorage.removeItem('pb_file_name')
      sessionStorage.removeItem('pb_file_size')
      sessionStorage.removeItem('pb_page_count')
      sessionStorage.removeItem('pb_settings')
      sessionStorage.removeItem('pb_total_price')
      sessionStorage.removeItem('pb_order_id')
      sessionStorage.removeItem('pb_release_pin')
      window.location.href = '/print/upload'
    }
  }

  return (
    <div className="customer-otp-root">
      {/* 3D WebGL Particle Background */}
      <div id="bg" ref={bgRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />

      {/* Main Glass Neomorphic Card */}
      <main className={`customer-otp-card ${isGenerating ? 'gen' : ''} ${isReady ? 'ready' : ''}`} ref={cardRef}>
        <div className="customer-otp-pane" />

        {/* Animated Printer Badge */}
        <div className="customer-otp-badge">
          <svg viewBox="0 0 56 56">
            <rect className="paper" x="17" y="4" width="22" height="26" rx="3" />
            <rect className="pr-body" x="6" y="22" width="44" height="20" rx="7" />
            <rect className="pr-tray" x="14" y="38" width="28" height="12" rx="3" />
            <circle className="led" cx="42" cy="30" r="2.5" />
          </svg>
        </div>

        <h1>Your OTP</h1>
        <p className="customer-otp-sub">
          Enter this code into the <b>machine</b> ({kioskId}) to release paper{orderId ? ` · Order #${orderId}` : ''}
        </p>

        {/* Slot Machine OTP Reels */}
        <div className="customer-otp-slots">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="customer-otp-box"
              ref={el => { boxesRef.current[i] = el }}
            >
              <div className="win">
                <div className="reel" />
              </div>
            </div>
          ))}
          <div className="scan-beam" />
        </div>

        {/* Status Pill */}
        <div className="customer-otp-pill">
          <i />
          <em>{statusText}</em>
        </div>

        {/* Buttons Row */}
        <div className="customer-otp-row">
          <button
            type="button"
            className="k-otp pri"
            onPointerDown={handleReprint}
            title="Upload and print another document"
          >
            <ArrowCounterClockwise size={18} weight="bold" />
            <span>Reprint</span>
          </button>
        </div>

        {/* Steps Guide */}
        <div className="customer-otp-steps">
          <div className="st-otp">
            <b>1</b>
            <span>Go to machine <strong>{kioskId}</strong> ({kioskName})</span>
          </div>
          <div className="st-otp">
            <b>2</b>
            <span>Enter the 4-digit OTP <strong>{currentCode}</strong> on the touchscreen</span>
          </div>
          <div className="st-otp">
            <b>3</b>
            <span>Collect your freshly printed sheets!</span>
          </div>
        </div>
      </main>
    </div>
  )
}
