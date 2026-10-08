import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { scrollState } from '../hooks/useScrollProgress'

interface PrintBoothModelProps {
  scrollProgress?: number
  activeSection?: number
  totalSections?: number
  exploded?: number
  isInteractive?: boolean
  isMobile?: boolean
}

function getTargetRotation(sp: number): number {
  const spOf = (n: number) => n / 7
  if (sp <= spOf(1)) {
    const t = clamp01(sp / spOf(1))
    return -0.35 + (0.42 - -0.35) * easeInOutSine(t)
  }
  if (sp <= spOf(2)) {
    const t = clamp01((sp - spOf(1)) / (spOf(2) - spOf(1)))
    return 0.42 + (-0.18 - 0.42) * easeInOutSine(t)
  }
  if (sp <= spOf(3)) {
    const t = clamp01((sp - spOf(2)) / (spOf(3) - spOf(2)))
    return -0.18 + (-0.05 - -0.18) * easeInOutSine(t)
  }
  if (sp <= spOf(4)) {
    const t = clamp01((sp - spOf(3)) / (spOf(4) - spOf(3)))
    return -0.05 + (0.00 - -0.05) * easeInOutSine(t)
  }
  if (sp <= spOf(5)) {
    const t = clamp01((sp - spOf(4)) / (spOf(5) - spOf(4)))
    return 0.00 + (0.25 - 0.00) * easeInOutSine(t)
  }
  if (sp <= spOf(6)) {
    const t = clamp01((sp - spOf(5)) / (spOf(6) - spOf(5)))
    return 0.25 + (0.00 - 0.25) * easeInOutSine(t)
  }
  const t = clamp01((sp - spOf(6)) / (spOf(7) - spOf(6)))
  return 0.00 + (-0.22 - 0.00) * easeInOutSine(t)
}

const easeInOutSine  = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2
const clamp01        = (v: number) => Math.max(0, Math.min(1, v))

const PARTICLE_COUNT = 1200
const MODEL_H  = 1.68
const MODEL_HW = 0.22
const MODEL_HD = 0.17

const COL_CRIMSON = new THREE.Color(0xdc2626)
const COL_CORAL   = new THREE.Color(0xef4444)
const COL_RUBY    = new THREE.Color(0xb91c1c)
const COL_WHITE   = new THREE.Color(0xffffff)
const COL_GOLD    = new THREE.Color(0xfef08a)

function screenToWorld(
  px: number,
  py: number,
  targetZ: number,
  cam: THREE.Camera,
  width: number,
  height: number
): THREE.Vector3 {
  const ndcX = (px / width) * 2 - 1
  const ndcY = -(py / height) * 2 + 1
  const vec = new THREE.Vector3(ndcX, ndcY, 0.5)
  vec.unproject(cam)
  vec.sub(cam.position).normalize()
  const dist = (targetZ - cam.position.z) / vec.z
  return cam.position.clone().add(vec.multiplyScalar(dist))
}

export default function PrintBoothModel({
  scrollProgress = 0,
  activeSection = 0,
  totalSections: _totalSections = 8,
  exploded: _exp,
  isInteractive = false,
  isMobile = false,
}: PrintBoothModelProps) {
  const groupRef       = useRef<THREE.Group>(null)
  const solidGroupRef  = useRef<THREE.Group>(null)
  const wireGroupRef   = useRef<THREE.Group>(null)
  const scanCubeRef    = useRef<THREE.Group>(null)
  const particlesRef   = useRef<THREE.Points>(null)
  const scanLightRef   = useRef<THREE.PointLight>(null)
  const accentLightRef = useRef<THREE.PointLight>(null)

  const floatOffset      = useRef(0)
  const currentXOffset   = useRef(0)
  const currentYOffset   = useRef(0)
  const smoothedProgress = useRef(scrollProgress)
  const autoRotY         = useRef(0)
  const groundRingRef    = useRef<THREE.Group>(null)
  const pointerPos       = useRef({ x: 0, y: 0 })
  const smoothPointer    = useRef({ x: 0, y: 0 })
  const pointerVel       = useRef({ x: 0, y: 0, speed: 0 })
  const hasPointerMoved  = useRef(false)
  const genProgressRef   = useRef(0.0)
  const lastActiveSecRef = useRef(activeSection)
  const tempBox          = useMemo(() => new THREE.Box3(), [])
  const tempVec          = useMemo(() => new THREE.Vector3(), [])

  const { gl, camera, size } = useThree()

  useEffect(() => { gl.localClippingEnabled = true }, [gl])

  useEffect(() => {
    const onGlobalPointerMove = (e: PointerEvent) => {
      // Normalized device coordinates (-1 to +1)
      pointerPos.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointerPos.current.y = -(e.clientY / window.innerHeight) * 2 + 1
      hasPointerMoved.current = true
    }
    window.addEventListener('pointermove', onGlobalPointerMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onGlobalPointerMove)
    }
  }, [])

  const isDragging   = useRef(false)
  const lastPointerX = useRef(0)
  const lastPointerY = useRef(0)
  const dragRotY     = useRef(-0.32)
  const dragRotX     = useRef(0)
  const dragVelX     = useRef(0)
  const dragVelY     = useRef(0)

  useEffect(() => {
    const dom = gl.domElement
    if (!isInteractive) { dom.style.cursor = 'default'; isDragging.current = false; return }
    dom.style.cursor = 'grab'
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      isDragging.current = true
      lastPointerX.current = e.clientX; lastPointerY.current = e.clientY
      dragVelX.current = dragVelY.current = 0
      dom.style.cursor = 'grabbing'
      try { dom.setPointerCapture(e.pointerId) } catch {}
    }
    const onMove = (e: PointerEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - lastPointerX.current
      const dy = e.clientY - lastPointerY.current
      lastPointerX.current = e.clientX; lastPointerY.current = e.clientY
      dragRotY.current += dx * 0.007; dragVelX.current = dx * 0.007
      dragRotX.current = Math.max(-0.35, Math.min(0.35, dragRotX.current + dy * 0.005))
      dragVelY.current = dy * 0.005
    }
    const onUp = (e: PointerEvent) => {
      isDragging.current = false; dom.style.cursor = 'grab'
      try { dom.releasePointerCapture(e.pointerId) } catch {}
    }
    const onDbl = () => { dragRotY.current = -0.32; dragRotX.current = dragVelX.current = dragVelY.current = 0 }
    dom.addEventListener('pointerdown', onDown)
    dom.addEventListener('pointermove', onMove)
    dom.addEventListener('pointerup', onUp)
    dom.addEventListener('pointercancel', onUp)
    dom.addEventListener('dblclick', onDbl)
    return () => {
      dom.removeEventListener('pointerdown', onDown)
      dom.removeEventListener('pointermove', onMove)
      dom.removeEventListener('pointerup', onUp)
      dom.removeEventListener('pointercancel', onUp)
      dom.removeEventListener('dblclick', onDbl)
      dom.style.cursor = 'default'
    }
  }, [isInteractive, gl])

  const solidClipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 10), [])
  const wireClipTop    = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 10), [])
  const wireClipBot    = useMemo(() => new THREE.Plane(new THREE.Vector3(0,  1, 0), 10), [])

  const gltf = useGLTF('/models/printbooth.gltf')

  const { solidScene, wireScene } = useMemo(() => {
    const solid  = gltf.scene.clone(true)
    const box    = new THREE.Box3().setFromObject(solid)
    const center = box.getCenter(new THREE.Vector3())
    const sizeVec   = box.getSize(new THREE.Vector3())
    const sf     = 1.55 / Math.max(sizeVec.x, sizeVec.y, sizeVec.z)
    solid.scale.setScalar(sf)
    solid.position.set(-center.x * sf, -box.min.y * sf, -center.z * sf)
    solid.traverse(child => {
      if (!(child as THREE.Mesh).isMesh) return
      const mesh = child as THREE.Mesh
      const applyClip = (m: THREE.Material) => {
        const c = m.clone() as THREE.MeshStandardMaterial
        c.transparent = true
        c.needsUpdate = true
        return c
      }
      if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(applyClip)
      else if (mesh.material) mesh.material = applyClip(mesh.material)
    })
    const wire    = solid.clone(true)
    const wireMat = new THREE.MeshBasicMaterial({
      wireframe: true, color: COL_CRIMSON,
      transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
      clippingPlanes: [wireClipTop, wireClipBot], clipIntersection: false,
    })
    wire.traverse(child => {
      if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).material = wireMat
    })
    return { solidScene: solid, wireScene: wire }
  }, [gltf.scene, solidClipPlane, wireClipTop, wireClipBot])

  const particleTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
    grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.9)')
    grad.addColorStop(0.45, 'rgba(239, 68, 68, 0.6)')
    grad.addColorStop(0.75, 'rgba(220, 38, 38, 0.2)')
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [])

  const pData = useMemo(() => {
    type P = {
      sy: number; sx: number; sz: number
      burstVx: number; burstVy: number; burstVz: number
      ambX: number; ambY: number; ambZ: number
      sp: number; pulseSpeed: number; vortexDir: number
      speed: number
      orbitRadius: number
      orbitAngle: number
      orbitSpeed: number
      lag: number
      zSpread: number
      isHighlight: boolean
      flightDelay: number
      cx: number; cy: number; cz: number
    }
    const list: P[] = []
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const colors    = new Float32Array(PARTICLE_COUNT * 3)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const sy = Math.random() * MODEL_H
      const hw = sy > 1.3 ? MODEL_HW * 0.82 : MODEL_HW
      const face = Math.floor(Math.random() * 4)
      let sx = 0, sz = 0
      if      (face === 0) { sx = (Math.random() * 2 - 1) * hw; sz =  MODEL_HD }
      else if (face === 1) { sx = (Math.random() * 2 - 1) * hw; sz = -MODEL_HD }
      else if (face === 2) { sx =  hw; sz = (Math.random() * 2 - 1) * MODEL_HD }
      else                 { sx = -hw; sz = (Math.random() * 2 - 1) * MODEL_HD }
      positions[i * 3] = sx; positions[i * 3 + 1] = sy; positions[i * 3 + 2] = sz

      // Orbital parameters around cursor
      // Power curve gives a dense, vibrant core and sweeping ethereal outer ribbons
      const orbitRadius = Math.pow(Math.random(), 1.6) * 1.95 + 0.08
      const orbitAngle  = Math.random() * Math.PI * 2
      const orbitSpeed  = 0.5 + Math.random() * 1.8
      const vortexDir   = Math.random() < 0.5 ? 1 : -1
      const lag         = 0.04 + Math.random() * 0.26
      const zSpread     = (Math.random() - 0.5) * 0.45

      // Highlights: white & gold sparks for premium cosmic feel
      const mix = Math.random()
      const isHighlight = mix < 0.28
      const col = mix < 0.14
        ? COL_WHITE
        : mix < 0.28
        ? COL_GOLD
        : mix < 0.62
        ? COL_CORAL
        : mix < 0.85
        ? COL_CRIMSON
        : COL_RUBY
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b

      // Outward burst velocity when dissolving
      const angle = Math.atan2(sz, sx) + (Math.random() - 0.5) * 0.5
      const burstSpeed = 1.0 + Math.random() * 1.8
      const burstVx = Math.cos(angle) * burstSpeed
      const burstVy = (Math.random() - 0.1) * 1.6
      const burstVz = Math.sin(angle) * burstSpeed

      // Ambient inward vectors for generation into Section 6
      const ambR = 1.5 + Math.random() * 2.5
      const ambA = Math.random() * Math.PI * 2
      const ambX = Math.cos(ambA) * ambR
      const ambY = (Math.random() - 0.3) * 2.2
      const ambZ = Math.sin(ambA) * ambR

      const flightDelay = (i / PARTICLE_COUNT) * 0.36 + (Math.random() - 0.5) * 0.08

      list.push({
        sy, sx, sz,
        burstVx, burstVy, burstVz,
        ambX, ambY, ambZ,
        sp: Math.random() * Math.PI * 2,
        pulseSpeed: 4.0 + Math.random() * 6.0,
        vortexDir,
        speed: 0.6 + Math.random() * 1.2,
        orbitRadius,
        orbitAngle,
        orbitSpeed,
        lag,
        zSpread,
        isHighlight,
        flightDelay,
        cx: sx,
        cy: sy,
        cz: sz,
      })
    }
    return { meta: list, positions, colors }
  }, [])

  const pGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pData.positions.slice(), 3))
    g.setAttribute('color',    new THREE.BufferAttribute(pData.colors.slice(), 3))
    return g
  }, [pData])

  const pMat = useMemo(() => new THREE.PointsMaterial({
    size: isMobile ? 0.040 : 0.050,
    map: particleTexture ?? undefined,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  }), [particleTexture, isMobile])

  const setSolidOpacity = (opacity: number) => {
    solidScene.traverse(child => {
      if (!(child as THREE.Mesh).isMesh) return
      const mesh = child as THREE.Mesh
      const set = (m: THREE.Material) => {
        if ('opacity' in m) {
          ;(m as THREE.MeshStandardMaterial).opacity = opacity
          ;(m as THREE.MeshStandardMaterial).transparent = opacity < 0.999
        }
      }
      if (Array.isArray(mesh.material)) mesh.material.forEach(set)
      else if (mesh.material) set(mesh.material)
    })
  }

  useFrame(({ clock }, delta) => {
    if (!groupRef.current || !particlesRef.current) return
    const time = clock.getElapsedTime()
    const dt = Math.min(0.05, delta || 0.016)

    // Trigger particle generation animation whenever Section 6 (Page 7: Hardware) is entered
    if (lastActiveSecRef.current !== activeSection) {
      if (activeSection === 6) {
        genProgressRef.current = 0.0
      }
      lastActiveSecRef.current = activeSection
    }

    if (activeSection === 6) {
      if (genProgressRef.current < 1.0) {
        // ~1.15s silky smooth assembly
        genProgressRef.current = Math.min(1.0, genProgressRef.current + dt * 0.88)
      }
    } else if (activeSection === 7) {
      genProgressRef.current = 1.0
    } else {
      genProgressRef.current = 0.0
    }

    const activeSp = typeof scrollState !== 'undefined' && scrollState.smoothProgress > 0
      ? scrollState.smoothProgress
      : (scrollProgress ?? 0)

    const prevSp = smoothedProgress.current
    smoothedProgress.current += (activeSp - smoothedProgress.current) * 0.10
    const sp = smoothedProgress.current
    const scrollDelta = activeSp - prevSp

    // Dynamic physical scroll tilt & banking roll
    const scrollTiltX = clamp01(Math.abs(scrollDelta) * 8.0) * (scrollDelta > 0 ? 0.22 : -0.22)
    const scrollBankZ = -scrollDelta * 0.95

    const isSingleColumn = isMobile || size.width <= 900

    // Fixed section indices (independent of totalSections count)
    // Section 0: Hero, 1: Problem, 2: Product
    // Non-3D lined-up sections: 3: HowItWorks, 4: Comparison, 5: Dealer
    // Section 6: Technology (solid 3D center stage), 7: FinalCTA (Section 8: Start)
    const S_TECH  = 6   // Technology — solid model, exploded view in center
    const S_FINAL = 7   // Final CTA (Section 8: Start)
    const isTechSection = activeSection === S_TECH
    const isFinalSection = !isSingleColumn && activeSection === S_FINAL

    // Calculate visible frustum bounds at the model's depth (z=0)
    const perspCam = camera as THREE.PerspectiveCamera
    const vFOV = THREE.MathUtils.degToRad(perspCam.fov)
    const camDist = Math.abs(perspCam.position.z)
    const visibleHalfH = Math.tan(vFOV / 2) * camDist

    // Adaptive model scale for responsive screen widths & heights:
    // Ensures the 3D model never overpowers text, clips vertically, or exceeds the frustum
    let responsiveScale = 1.0
    if (isSingleColumn) {
      responsiveScale = 0.80
    } else {
      const widthT  = Math.max(0, Math.min(1, (size.width - 900) / (1440 - 900)))
      const heightT = Math.max(0, Math.min(1, (size.height - 600) / (900 - 600)))
      const dimFactor = Math.min(widthT, heightT * 1.1)
      responsiveScale = 0.72 + dimFactor * 0.28
      if (isTechSection) {
        responsiveScale = Math.min(0.85, 0.66 + dimFactor * 0.18)
      }
    }
    const finalScale = responsiveScale
    groupRef.current.scale.setScalar(finalScale)

    // Hovering levitation: on mobile Hero, subtle float
    if (isSingleColumn) {
      floatOffset.current = Math.sin(time * 1.2) * 0.02
    } else {
      floatOffset.current = Math.sin(time * 0.8) * 0.012
    }

    // Dynamic horizontal & vertical placement:
    let targetX = 0.0
    let targetY = 0.0

    if (isSingleColumn) {
      targetX = 0.0
      targetY = 0.0

      if (typeof document !== 'undefined') {
        const spacerSelector = activeSection === 1 ? '.problem-stage-spacer' : '.landing-hero__stage-spacer'
        const spacer = document.querySelector(spacerSelector)
        if (spacer) {
          const rect = spacer.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            const centerX = rect.left + rect.width * 0.5
            const centerY = rect.top + rect.height * 0.5
            const worldPos = screenToWorld(centerX, centerY, 0, camera, size.width, size.height)
            targetX = worldPos.x
            targetY = worldPos.y - (0.42 * finalScale)
          }
        }
      }
    } else {
      if (activeSection === 1) {
        // Section 2 (Problem / Challenge): place kiosk on LEFT side
        let placedFromSpacer = false
        if (typeof document !== 'undefined') {
          const spacer = document.querySelector('.problem-stage-spacer')
          if (spacer) {
            const rect = spacer.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              const centerX = rect.left + rect.width * 0.5
              const centerY = rect.top + rect.height * 0.5
              const worldPos = screenToWorld(centerX, centerY, 0, camera, size.width, size.height)
              targetX = worldPos.x
              targetY = 0.15
              placedFromSpacer = true
            }
          }
        }
        if (!placedFromSpacer) {
          const leftTargetRatio = 0.28 - Math.min(1, Math.max(0, (size.width - 900) / 540)) * 0.03
          const desiredScreenX = size.width * leftTargetRatio
          const leftClearancePx = size.width < 1280 ? 90 : 110
          const pixelsPerWorldUnit = size.height / (2 * visibleHalfH)
          const modelVisualRadiusPx = (0.38 * finalScale) * pixelsPerWorldUnit
          const minScreenX = leftClearancePx + modelVisualRadiusPx
          const safeScreenX = Math.max(desiredScreenX, minScreenX)
          const worldPos = screenToWorld(safeScreenX, size.height * 0.5, 0, camera, size.width, size.height)
          targetX = worldPos.x
          targetY = 0.12
        }
      } else {
        // Section 0 (Hero): place kiosk in right stage with responsive clearance
        const targetXRatio = 0.70 + Math.min(1, Math.max(0, (size.width - 900) / 540)) * 0.04
        const desiredScreenX = size.width * targetXRatio

        // Safe right edge clearance accounting for .section-indicator (track + margin ~50px) + visual margin
        const rightClearancePx = size.width < 1280 ? 95 : 115
        const pixelsPerWorldUnit = size.height / (2 * visibleHalfH)
        const modelVisualRadiusPx = (0.38 * finalScale) * pixelsPerWorldUnit
        const maxScreenX = size.width - rightClearancePx - modelVisualRadiusPx

        const safeScreenX = Math.min(desiredScreenX, maxScreenX)

        // Convert safe screen pixel position to exact 3D world coordinate at z=0
        const worldPos = screenToWorld(safeScreenX, size.height * 0.5, 0, camera, size.width, size.height)
        targetX = worldPos.x
        targetY = 0.15
      }
    }

    currentXOffset.current += (targetX - currentXOffset.current) * 0.10
    currentYOffset.current += (targetY - currentYOffset.current) * 0.10
    groupRef.current.position.set(currentXOffset.current, currentYOffset.current + floatOffset.current, 0)

    if (isInteractive && isDragging.current) {
      groupRef.current.rotation.y = dragRotY.current
      groupRef.current.rotation.x = dragRotX.current
    } else if (isTechSection) {
      // Auto-rotating capability in middle stage
      if (!isDragging.current) {
        autoRotY.current += 0.0075
        dragVelX.current *= 0.93; dragRotY.current += dragVelX.current
        dragVelY.current *= 0.93
      }
      const targetRotY = getTargetRotation(sp) + autoRotY.current + dragRotY.current
      groupRef.current.rotation.y += (targetRotY - groupRef.current.rotation.y) * 0.10

      // Tilted isometric dynamic effect: forward pitch (~11.5 deg) and banking roll (-3 deg)
      const targetTiltX = 0.20 + Math.sin(time * 0.9) * 0.02 + dragRotX.current + scrollTiltX
      const targetTiltZ = -0.05 + Math.cos(time * 0.75) * 0.015 + scrollBankZ
      groupRef.current.rotation.x += (targetTiltX - groupRef.current.rotation.x) * 0.08
      groupRef.current.rotation.z += (targetTiltZ - groupRef.current.rotation.z) * 0.08
    } else if (isFinalSection) {
      // Section 8 (Start): Iconic front 3/4 perspective showcasing dispensers & touchscreen
      // Gentle harmonic idle breathing sway + full interactive touch/pointer orbit
      dragVelX.current *= 0.93; dragRotY.current += dragVelX.current
      dragVelY.current *= 0.93
      dragRotX.current = Math.max(-0.35, Math.min(0.35, dragRotX.current + dragVelY.current))

      const idleSway = Math.sin(time * 0.7) * 0.18
      const targetRotY = -0.32 + idleSway + dragRotY.current
      groupRef.current.rotation.y += (targetRotY - groupRef.current.rotation.y) * 0.12

      const targetTiltX = 0.08 + Math.sin(time * 0.8) * 0.015 + dragRotX.current + scrollTiltX
      const targetTiltZ = -0.02 + Math.cos(time * 0.7) * 0.01 + scrollBankZ
      groupRef.current.rotation.x += (targetTiltX - groupRef.current.rotation.x) * 0.08
      groupRef.current.rotation.z += (targetTiltZ - groupRef.current.rotation.z) * 0.08
    } else if (isSingleColumn) {
      if (!isDragging.current) {
        autoRotY.current += 0.009
        const targetRotY = -0.32 + autoRotY.current + dragRotY.current
        groupRef.current.rotation.y += (targetRotY - groupRef.current.rotation.y) * 0.10
        groupRef.current.rotation.x = 0.08
        groupRef.current.rotation.z = 0.0
      } else {
        dragVelX.current *= 0.93; dragRotY.current += dragVelX.current
        dragVelY.current *= 0.93
        dragRotX.current = Math.max(-0.35, Math.min(0.35, dragRotX.current + dragVelY.current))
        groupRef.current.rotation.y += (dragRotY.current - groupRef.current.rotation.y) * 0.15
        groupRef.current.rotation.x += (dragRotX.current - groupRef.current.rotation.x) * 0.15
      }
    } else if (isInteractive) {
      dragVelX.current *= 0.93; dragRotY.current += dragVelX.current
      dragVelY.current *= 0.93
      dragRotX.current = Math.max(-0.35, Math.min(0.35, dragRotX.current + dragVelY.current))
      groupRef.current.rotation.y += (dragRotY.current - groupRef.current.rotation.y) * 0.15
      groupRef.current.rotation.x += (dragRotX.current - groupRef.current.rotation.x) * 0.15
      groupRef.current.rotation.z += (0 - groupRef.current.rotation.z) * 0.08
    } else {
      dragRotX.current += (0 - dragRotX.current) * 0.08
      groupRef.current.rotation.y += (getTargetRotation(sp) - groupRef.current.rotation.y) * 0.09
      groupRef.current.rotation.x += (scrollTiltX - groupRef.current.rotation.x) * 0.10
      groupRef.current.rotation.z += (scrollBankZ - groupRef.current.rotation.z) * 0.10
    }

    // Dynamic cursor position in 3D world space at z = 0
    if (!hasPointerMoved.current) {
      pointerPos.current.x = Math.sin(time * 0.7) * 0.35 + 0.15
      pointerPos.current.y = Math.cos(time * 0.9) * 0.22
    }

    const prevSmoothX = smoothPointer.current.x
    const prevSmoothY = smoothPointer.current.y
    smoothPointer.current.x += (pointerPos.current.x - smoothPointer.current.x) * 0.14
    smoothPointer.current.y += (pointerPos.current.y - smoothPointer.current.y) * 0.14

    const pvx = (smoothPointer.current.x - prevSmoothX) * 60
    const pvy = (smoothPointer.current.y - prevSmoothY) * 60
    pointerVel.current.x = pvx
    pointerVel.current.y = pvy
    pointerVel.current.speed = Math.sqrt(pvx * pvx + pvy * pvy)

    const isModelSection = activeSection === 0 || activeSection === 1
    const mode = isModelSection ? 'solid' : 'hidden'

    if (mode === 'solid') {
      solidGroupRef.current!.visible = true
      if (wireGroupRef.current) wireGroupRef.current.visible = false
      if (scanCubeRef.current) scanCubeRef.current.visible = false
      solidClipPlane.set(new THREE.Vector3(0, -1, 0), 100)
      setSolidOpacity(1.0)
      particlesRef.current.visible = false
      pMat.opacity = 0

      if (scanLightRef.current) scanLightRef.current.intensity = 0
      if (accentLightRef.current) {
        accentLightRef.current.intensity = isTechSection ? 1.2 : (isFinalSection ? 0.95 : 0)
        accentLightRef.current.color.setHex(0xef4444)
        accentLightRef.current.position.set(currentXOffset.current - 0.35, 0.75, 0.8)
      }
    }
    else {
      groupRef.current.visible = false
      solidGroupRef.current!.visible = false
      if (wireGroupRef.current) wireGroupRef.current.visible = false
      if (scanCubeRef.current) scanCubeRef.current.visible = false
      particlesRef.current.visible = false
      setSolidOpacity(0)
      if (scanLightRef.current) scanLightRef.current.intensity = 0
      if (accentLightRef.current) accentLightRef.current.intensity = 0
    }

    if (mode === 'solid' && groupRef.current) {
      groupRef.current.visible = true
    }

    // 3D Holographic Ground Radar animation
    if (groundRingRef.current) {
      groundRingRef.current.visible = false
    }

    // Project exact 3D model visual center to 2D screen coordinates for circular orb alignment
    const isModelVisible = mode === 'solid' && isModelSection
    if (isModelVisible && solidGroupRef.current && groupRef.current) {
      groupRef.current.updateMatrixWorld(true)
      tempBox.setFromObject(solidGroupRef.current)
      tempBox.getCenter(tempVec)
      tempVec.project(camera)
      const screenX = (tempVec.x * 0.5 + 0.5) * size.width
      const screenY = (-tempVec.y * 0.5 + 0.5) * size.height
      scrollState.modelScreenPos = {
        x: screenX,
        y: screenY,
        visible: true,
      }
    } else {
      scrollState.modelScreenPos = {
        x: 0,
        y: 0,
        visible: false,
      }
    }
  })

  return (
    <>
      <group ref={groupRef}>
        <group ref={solidGroupRef}>
          <primitive object={solidScene} />
        </group>
        <group ref={wireGroupRef} visible={false}>
          <primitive object={wireScene} />
        </group>
        <group ref={scanCubeRef} visible={false}>
          <mesh>
            <boxGeometry args={[1.35, 0.024, 1.05]} />
            <meshBasicMaterial color={0xdc2626} transparent opacity={0.60} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <mesh>
            <boxGeometry args={[1.35, 0.005, 1.05]} />
            <meshBasicMaterial color={0xef4444} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(1.36, 0.026, 1.06)]} />
            <lineBasicMaterial color={0xdc2626} transparent opacity={0.9} blending={THREE.AdditiveBlending} />
          </lineSegments>
          <pointLight ref={scanLightRef} color={0xdc2626} intensity={0} distance={2.5} decay={2} />
        </group>
      </group>

      {/* 3D Holographic Ground Radar — anchored precisely beneath the chassis */}
      <group ref={groundRingRef} position={[0, -0.28, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        {/* Outer dashed ring */}
        <mesh>
          <ringGeometry args={[0.88, 0.90, 64]} />
          <meshBasicMaterial color={0xdc2626} transparent opacity={0.45} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {/* Middle pulsing neon ring */}
        <mesh>
          <ringGeometry args={[0.68, 0.71, 48]} />
          <meshBasicMaterial color={0xef4444} transparent opacity={0.65} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {/* Inner core ring */}
        <mesh>
          <ringGeometry args={[0.46, 0.48, 48]} />
          <meshBasicMaterial color={0xb91c1c} transparent opacity={0.40} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {/* Ground light projecting upward onto chassis base */}
        <pointLight color={0xef4444} intensity={1.6} distance={1.8} decay={2} />
      </group>

      {/* World-space particle points and ambient text accent light */}
      <points ref={particlesRef} geometry={pGeo} material={pMat} visible={false} />
      <pointLight ref={accentLightRef} color={0xef4444} intensity={0} position={[0, 0.85, 0.3]} distance={4.5} decay={2} />
    </>
  )
}

useGLTF.preload('/models/printbooth.gltf')
