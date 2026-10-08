import { useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'

/* ─── Shared mutable ref that Three.js can read without React re-renders ─── */
export const scrollState = {
  progress: 0,
  smoothProgress: 0,
  velocity: 0,
  scrollY: 0,
  modelScreenPos: { x: 0, y: 0, visible: true },
}

/* ─── Lerp utility ─── */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/* ─── Main hook: drives Lenis + exposes React state (throttled) ─── */
interface ScrollData {
  progress: number
  velocity: number
  direction: 'up' | 'down' | 'idle'
  scrollY: number
}

export function useScrollProgress(): ScrollData {
  const [data, setData] = useState<ScrollData>({
    progress: 0,
    velocity: 0,
    direction: 'idle',
    scrollY: 0,
  })
  const lenisRef = useRef<Lenis | null>(null)
  const frameCount = useRef(0)

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.15,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 1.5,
      wheelMultiplier: 1.0,
    })
    lenisRef.current = lenis

    // Gentle section snapping — only after scrolling has completely settled
    let snapTimeout: ReturnType<typeof setTimeout> | null = null

    lenis.on('scroll', ({ velocity }: { velocity: number }) => {
      if (snapTimeout) clearTimeout(snapTimeout)

      // Only evaluate snapping when motion has truly ceased
      if (Math.abs(velocity) < 0.05) {
        snapTimeout = setTimeout(() => {
          const sections = document.querySelectorAll<HTMLElement>(
            '.landing-hero, .landing-problem, .landing-product, .landing-how, .landing-tech, .landing-final'
          )
          if (sections.length === 0) return

          const currentScroll = lenis.scroll
          const vh = window.innerHeight

          let closest: HTMLElement | null = null
          let closestDist = Infinity

          sections.forEach((section) => {
            const rect = section.getBoundingClientRect()
            const absoluteTop = rect.top + currentScroll
            const dist = Math.abs(currentScroll - absoluteTop)
            // Snap if within 35% of viewport height and not already aligned
            if (dist < vh * 0.35 && dist < closestDist) {
              closestDist = dist
              closest = section
            }
          })

          if (closest && closestDist > 12) {
            lenis.scrollTo(closest, {
              duration: 0.7,
              easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            })
          }
        }, 280)
      }
    })

    let raf: number

    function tick(time: number) {
      lenis.raf(time)

      const scrollY = lenis.scroll
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      const rawProgress = maxScroll > 0 ? Math.min(scrollY / maxScroll, 1) : 0

      // Update shared mutable state with responsive 0.2 lerp for crispy tracking
      scrollState.progress = rawProgress
      scrollState.smoothProgress = lerp(scrollState.smoothProgress, rawProgress, 0.2)
      scrollState.velocity = lenis.velocity
      scrollState.scrollY = scrollY

      // Throttle React setState to every 3rd frame (~20fps state updates)
      frameCount.current++
      if (frameCount.current % 3 === 0) {
        const dir: ScrollData['direction'] =
          lenis.velocity > 0.01 ? 'down' : lenis.velocity < -0.01 ? 'up' : 'idle'
        setData({
          progress: rawProgress,
          velocity: lenis.velocity,
          direction: dir,
          scrollY,
        })
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      if (snapTimeout) clearTimeout(snapTimeout)
      lenis.destroy()
    }
  }, [])

  return data
}

/* ─── Section progress (IntersectionObserver based) ─── */
interface SectionProgress {
  progress: number
  isInView: boolean
}

export function useSectionProgress(
  ref: React.RefObject<HTMLElement | null>,
  offset: number = 0
): SectionProgress {
  const [data, setData] = useState<SectionProgress>({
    progress: 0,
    isInView: false,
  })
  const rafId = useRef(0)

  useEffect(() => {
    const update = () => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect()
        const windowHeight = window.innerHeight
        const sectionHeight = rect.height
        const totalTravel = windowHeight + sectionHeight
        const traveled = windowHeight - rect.top + offset
        const progress = Math.max(0, Math.min(traveled / totalTravel, 1))
        const isInView = rect.top < windowHeight && rect.bottom > 0
        setData({ progress, isInView })
      }
      rafId.current = requestAnimationFrame(update)
    }
    rafId.current = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafId.current)
  }, [ref, offset])

  return data
}

/* ─── Utilities ─── */
export function mapRange(
  value: number, inMin: number, inMax: number,
  outMin: number, outMax: number
): number {
  const clamped = Math.max(inMin, Math.min(value, inMax))
  return outMin + ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export { lerp }

export function smoothstep(min: number, max: number, value: number): number {
  const t = clamp((value - min) / (max - min), 0, 1)
  return t * t * (3 - 2 * t)
}

export function useInView(
  ref: React.RefObject<HTMLElement | null>,
  threshold: number = 0.1
): boolean {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold }
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref, threshold])

  return inView
}
