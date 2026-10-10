import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { scrollState } from '../../hooks/useScrollProgress'
import { useIsMobile, useIsMobileOrTablet, useIsSingleColumn } from '../../hooks/useMediaQuery'
import { useReducedMotion } from '../../hooks/useReducedMotion'


// Sections
import LandingNav from './LandingNav'
import Hero from './Hero'
import ProblemSection from './ProblemSection'
import ProductIntro from './ProductIntro'
import HowItWorks from './HowItWorks'
import TechnologySection from './TechnologySection'
import ComparisonSection from './ComparisonSection'
import DealerSection from './DealerSection'
import FinalCTA from './FinalCTA'
import LandingFooter from './LandingFooter'
import LoadingScreen from './LoadingScreen'
import SectionIndicator from './SectionIndicator'
import SectionTransition, { type TransitionEffect } from './SectionTransition'
import MagneticOrbBackground from './MagneticOrbBackground'

// Lazy-load the heavy 3D scene
const PrintBoothScene = lazy(() => import('../../three/PrintBoothScene'))
import TextLoop from '../ui/TextLoop'
import './LandingNeomorphism.css'

const TOTAL_SECTIONS = 8
const SECTION_LABELS = [
  'PrintBooth',
  'Challenge',
  'Product',
  'Process',
  'Compare',
  'Partner',
  'Hardware',
  'Launch',
]
const TRANSITION_EFFECTS: TransitionEffect[] = ['slideUp', 'fade']


export default function LandingPage() {
  const isMobile = useIsMobile()
  const isMobileOrTablet = useIsMobileOrTablet()
  const isSingleColumn = useIsSingleColumn()

  const reducedMotion = useReducedMotion()
  const [loaded, setLoaded] = useState(() => {
    try {
      return sessionStorage.getItem('pb_landing_loaded') === 'true'
    } catch {
      return false
    }
  })
  const [loadProgress, setLoadProgress] = useState(() => {
    try {
      return sessionStorage.getItem('pb_landing_loaded') === 'true' ? 100 : 0
    } catch {
      return 0
    }
  })
  const [activeSection, setActiveSection] = useState(0)
  const [transitionDirection, setTransitionDirection] = useState<'down' | 'up'>('down')
  const [transitionEffect, setTransitionEffect] = useState<TransitionEffect>('slideUp')
  const transitionEffectRef = useRef<TransitionEffect>('slideUp')
  transitionEffectRef.current = transitionEffect

  const handleSceneReady = useCallback(() => {
    let current = 0
    const interval = setInterval(() => {
      current += 8
      if (current >= 100) {
        current = 100
        clearInterval(interval)
        setLoadProgress(100)
      } else {
        setLoadProgress(current)
      }
    }, 25)
  }, [])

  const handleLoadComplete = useCallback(() => {
    try {
      sessionStorage.setItem('pb_landing_loaded', 'true')
    } catch {
      // ignore
    }
    setLoaded(true)
  }, [])

  // ── Section navigator & section-by-section scroll controller ─────────
  const activeSectionRef = useRef(0)
  activeSectionRef.current = activeSection
  const lastSectionArrivedAtRef = useRef(0)

  const footerRef = useRef<HTMLDivElement>(null)
  const [isFooterRevealed, setIsFooterRevealed] = useState(false)
  const isFooterRevealedRef = useRef(false)
  isFooterRevealedRef.current = isFooterRevealed

  const isTransitioningRef = useRef(false)
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Jumps the page smoothly to a section by index (used by nav indicator, LandingNav & keyboard navigation)
  const goToSection = useCallback((index: number) => {
    const safeIndex = Math.max(0, Math.min(TOTAL_SECTIONS - 1, index))
    const panels = document.querySelectorAll<HTMLElement>('.landing-section-panel')
    const targetPanel = panels[safeIndex]
    if (!targetPanel) return

    const dir = safeIndex >= activeSectionRef.current ? 'down' : 'up'
    setTransitionDirection(dir)

    if (isMobileOrTablet) {
      setActiveSection(safeIndex)
      activeSectionRef.current = safeIndex
      targetPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    // Automatically cycle through transitions randomly without exposing controls to user (desktop only)
    if (safeIndex !== activeSectionRef.current) {
      const remainingEffects = TRANSITION_EFFECTS.filter((e) => e !== transitionEffectRef.current)
      const nextEffect = remainingEffects[Math.floor(Math.random() * remainingEffects.length)] || 'slideUp'
      setTransitionEffect(nextEffect)
      transitionEffectRef.current = nextEffect
    }

    setIsFooterRevealed(false)
    isFooterRevealedRef.current = false

    // Immediately sync state so indicators and panel classes react
    setActiveSection(safeIndex)
    activeSectionRef.current = safeIndex
    lastSectionArrivedAtRef.current = Date.now()

    // Reset internal scroll of target panel:
    // If moving down, start target panel at top (0)
    // If moving up, start target panel at bottom so user can scroll up through it
    if (dir === 'down') {
      targetPanel.scrollTop = 0
    } else {
      targetPanel.scrollTop = Math.max(0, targetPanel.scrollHeight - targetPanel.clientHeight)
    }

    // Lock transitions during smooth programmatic scroll
    isTransitioningRef.current = true
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)
    transitionTimeoutRef.current = setTimeout(() => {
      isTransitioningRef.current = false
    }, 600)

    targetPanel.scrollIntoView({ behavior: isMobileOrTablet ? 'auto' : 'smooth', block: 'start' })
  }, [isMobileOrTablet])


  // Smoothly scrolls to the footer from Section 8
  const goToFooter = useCallback(() => {
    if (!footerRef.current) return
    // Guard: ensure user has arrived and settled on Section 8 before allowing footer transition
    if (Date.now() - lastSectionArrivedAtRef.current < 350) return

    setTransitionDirection('down')
    setIsFooterRevealed(true)
    isFooterRevealedRef.current = true

    isTransitioningRef.current = true
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)
    transitionTimeoutRef.current = setTimeout(() => {
      isTransitioningRef.current = false
    }, 600)

    footerRef.current.scrollIntoView({ behavior: isMobileOrTablet ? 'auto' : 'smooth', block: 'end' })
  }, [isMobileOrTablet])

  const nextSection = useCallback(() => {
    const curr = activeSectionRef.current
    if (curr < TOTAL_SECTIONS - 1) {
      goToSection(curr + 1)
    } else if (curr === TOTAL_SECTIONS - 1 && !isFooterRevealedRef.current) {
      if (Date.now() - lastSectionArrivedAtRef.current >= 350) {
        goToFooter()
      }
    }
  }, [goToSection, goToFooter])

  const prevSection = useCallback(() => {
    if (isFooterRevealedRef.current) {
      goToSection(TOTAL_SECTIONS - 1)
      return
    }
    const curr = activeSectionRef.current
    if (curr > 0) {
      goToSection(curr - 1)
    }
  }, [goToSection])

  // Snapping and transition cleanup on unmount
  useEffect(() => {
    document.documentElement.classList.add('is-landing-page')
    return () => {
      document.documentElement.classList.remove('is-landing-page')
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current)
      }
    }
  }, [])

  // ── Mouse Wheel & Trackpad Section-by-Section Controller ──────────────────
  useEffect(() => {
    let wheelAccumulator = 0
    let resetTimer: ReturnType<typeof setTimeout> | null = null

    const handleWheel = (e: WheelEvent) => {
      // In mobile or tablet view, allow completely free native scrolling
      if (isMobileOrTablet) return

      // Don't intercept if user is typing in form controls
      const target = e.target as HTMLElement
      if (['input', 'textarea', 'select'].includes(target?.tagName?.toLowerCase()) || target?.isContentEditable) {
        return
      }

      // Check if target is inside an explicitly scrollable inner container (e.g. scrollable table or modal)
      let el: HTMLElement | null = target
      while (el && el !== document.body && el !== document.documentElement) {
        if (el.classList.contains('landing-section-panel')) break
        const style = window.getComputedStyle(el)
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) {
          const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight - 2
          const canScrollUp = el.scrollTop > 2
          if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
            return
          }
        }
        el = el.parentElement
      }

      const panels = document.querySelectorAll<HTMLElement>('.landing-section-panel')
      const activePanel = panels[activeSectionRef.current]
      if (activePanel && activePanel.scrollHeight > activePanel.clientHeight + 8) {
        const canScrollDown = activePanel.scrollTop + activePanel.clientHeight < activePanel.scrollHeight - 6
        const canScrollUp = activePanel.scrollTop > 6
        if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
          // Allow internal scrolling inside section
          return
        }
      }

      const isTargetInFooter = !!(target?.closest?.('.landing-footer-wrapper') || target?.closest?.('.landing-footer'))

      // If user is inside footer or footer is active:
      if (isFooterRevealedRef.current || isTargetInFooter) {
        // Flick upward -> return smoothly to Section 8
        if (e.deltaY < -25) {
          if (isTransitioningRef.current) {
            e.preventDefault()
            return
          }
          const footerWrapper = footerRef.current
          if (footerWrapper && footerWrapper.scrollTop > 5) {
            return
          }
          e.preventDefault()
          wheelAccumulator = 0
          goToSection(TOTAL_SECTIONS - 1)
          return
        }
        // Downward wheel inside footer -> do not intercept or preventDefault
        if (e.deltaY > 0) {
          return
        }
      }

      // Intercept wheel to transition section-by-section cleanly
      e.preventDefault()

      if (isTransitioningRef.current) {
        wheelAccumulator = 0
        return
      }

      wheelAccumulator += e.deltaY

      if (resetTimer) clearTimeout(resetTimer)
      resetTimer = setTimeout(() => {
        wheelAccumulator = 0
      }, 180)

      const THRESHOLD = 30 // Threshold for crisp response

      if (wheelAccumulator > THRESHOLD) {
        wheelAccumulator = 0
        nextSection()
      } else if (wheelAccumulator < -THRESHOLD) {
        wheelAccumulator = 0
        prevSection()
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', handleWheel)
      if (resetTimer) clearTimeout(resetTimer)
    }
  }, [nextSection, prevSection, goToSection, goToFooter])

  // ── Mobile Touch Section-by-Section Controller ────────────────────────────
  useEffect(() => {
    // If mobile or tablet, completely disable touch hijacking so user scrolls freely!
    if (isMobileOrTablet) return

    let startX = 0
    let startY = 0
    let startTime = 0
    let isTrackingTouch = false
    let gestureConsumed = false

    const getActivePanel = (): HTMLElement | null => {
      const panels = document.querySelectorAll<HTMLElement>('.landing-section-panel')
      return panels[activeSectionRef.current] || null
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return

      const target = e.target as HTMLElement
      // Do not intercept interactive form elements
      if (['input', 'textarea', 'select'].includes(target?.tagName?.toLowerCase()) || target?.isContentEditable) {
        return
      }

      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      startTime = Date.now()
      isTrackingTouch = true
      gestureConsumed = false
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTrackingTouch || e.touches.length !== 1) return

      const currentX = e.touches[0].clientX
      const currentY = e.touches[0].clientY
      const diffX = startX - currentX
      const diffY = startY - currentY

      // Check if target is inside an explicitly scrollable inner container (e.g. modal)
      const target = e.target as HTMLElement
      let el: HTMLElement | null = target
      while (el && el !== document.body && el !== document.documentElement) {
        if (el.classList.contains('landing-section-panel')) break
        const style = window.getComputedStyle(el)
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) {
          const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight - 2
          const canScrollUp = el.scrollTop > 2
          if ((diffY > 0 && canScrollDown) || (diffY < 0 && canScrollUp)) {
            return
          }
        }
        el = el.parentElement
      }

      const activePanel = getActivePanel()
      const isPanelScrollable = activePanel ? activePanel.scrollHeight > activePanel.clientHeight + 8 : false
      const canScrollDown = activePanel ? activePanel.scrollTop + activePanel.clientHeight < activePanel.scrollHeight - 8 : false
      const canScrollUp = activePanel ? activePanel.scrollTop > 8 : false

      // If active panel is scrollable and hasn't reached its boundary:
      if (isPanelScrollable) {
        if (diffY > 0 && canScrollDown) {
          // Scrolling down inside section -> allow native touch scrolling
          return
        }
        if (diffY < 0 && canScrollUp) {
          // Scrolling up inside section -> allow native touch scrolling
          return
        }
      }

      // If predominantly vertical gesture and at boundary (or not scrollable), prevent browser free momentum fling
      if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 6) {
        if (e.cancelable) {
          e.preventDefault()
        }
      }

      // Snappy section-by-section trigger once swipe threshold is reached
      if (!gestureConsumed && !isTransitioningRef.current && Math.abs(diffY) >= 42 && Math.abs(diffY) > Math.abs(diffX) * 1.25) {
        gestureConsumed = true
        if (diffY > 0) {
          // Swiped up -> advance to next section
          nextSection()
        } else {
          // Swiped down -> return to previous section
          prevSection()
        }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isTrackingTouch) return
      isTrackingTouch = false

      if (gestureConsumed || isTransitioningRef.current) return

      const endX = e.changedTouches[0].clientX
      const endY = e.changedTouches[0].clientY
      const diffX = startX - endX
      const diffY = startY - endY
      const duration = Date.now() - startTime

      // If horizontal gesture was dominant (e.g. tab swipe), ignore
      if (Math.abs(diffX) > Math.abs(diffY) * 1.2 && Math.abs(diffX) > 25) {
        return
      }

      const activePanel = getActivePanel()
      const isPanelScrollable = activePanel ? activePanel.scrollHeight > activePanel.clientHeight + 8 : false
      const canScrollDown = activePanel ? activePanel.scrollTop + activePanel.clientHeight < activePanel.scrollHeight - 8 : false
      const canScrollUp = activePanel ? activePanel.scrollTop > 8 : false

      // If panel can still scroll internally in this direction, let native momentum handle it
      if (isPanelScrollable) {
        if (diffY > 0 && canScrollDown) return
        if (diffY < 0 && canScrollUp) return
      }

      const velocity = Math.abs(diffY) / Math.max(duration, 1)
      const isFlick = velocity > 0.32 && Math.abs(diffY) >= 20
      const isDrag = Math.abs(diffY) >= 35

      if (isFlick || isDrag) {
        if (diffY > 0) {
          nextSection()
        } else {
          prevSection()
        }
      }
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [nextSection, prevSection, isMobileOrTablet])

  // ── Mobile & Tablet: Natural Free Scroll Section Sync ──────────────────────
  useEffect(() => {
    if (!isMobileOrTablet) return

    const panels = document.querySelectorAll<HTMLElement>('.landing-section-panel')
    if (!panels.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Array.from(panels).indexOf(entry.target as HTMLElement)
            if (index !== -1 && index !== activeSectionRef.current) {
              const dir = index >= activeSectionRef.current ? 'down' : 'up'
              setTransitionDirection(dir)
              setActiveSection(index)
              activeSectionRef.current = index
            }
          }
        })
      },
      {
        rootMargin: '-15% 0px -55% 0px',
        threshold: 0,
      }
    )

    panels.forEach((p) => observer.observe(p))
    return () => observer.disconnect()
  }, [isMobileOrTablet, loaded])



  // ── Keyboard Navigation: Arrow keys, Page Up/Down, Space ──────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag) || (e.target as HTMLElement)?.isContentEditable) {
        return
      }

      const panels = document.querySelectorAll<HTMLElement>('.landing-section-panel')
      const activePanel = panels[activeSectionRef.current]
      const hasInternalScroll = activePanel ? activePanel.scrollHeight > activePanel.clientHeight + 8 : false

      if (['ArrowDown', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey)) {
        if (!isFooterRevealedRef.current) {
          if (hasInternalScroll && activePanel) {
            const canScrollDown = activePanel.scrollTop + activePanel.clientHeight < activePanel.scrollHeight - 6
            if (canScrollDown) {
              e.preventDefault()
              const step = e.key === 'ArrowDown' ? 140 : activePanel.clientHeight * 0.8
              activePanel.scrollBy({ top: step, behavior: 'smooth' })
              return
            }
          }
          e.preventDefault()
          nextSection()
        }
      } else if (['ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey)) {
        if (isFooterRevealedRef.current) {
          e.preventDefault()
          prevSection()
        } else if (activeSectionRef.current >= 0) {
          if (hasInternalScroll && activePanel) {
            const canScrollUp = activePanel.scrollTop > 6
            if (canScrollUp) {
              e.preventDefault()
              const step = e.key === 'ArrowUp' ? 140 : activePanel.clientHeight * 0.8
              activePanel.scrollBy({ top: -step, behavior: 'smooth' })
              return
            }
          }
          if (activeSectionRef.current > 0) {
            e.preventDefault()
            prevSection()
          }
        }
      } else if (e.key === 'Home') {
        e.preventDefault()
        goToSection(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        goToFooter()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [nextSection, prevSection, goToSection, goToFooter])

  // ── Desktop: IntersectionObserver track which section is most in view ────
  const landingPageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isMobileOrTablet) return

    const panels = document.querySelectorAll<HTMLElement>('.landing-section-panel')
    if (!panels.length) return

    const ratios = new Map<HTMLElement, number>()

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          ratios.set(entry.target as HTMLElement, entry.intersectionRatio)
        })

        let bestIdx = -1
        let maxRatio = 0

        panels.forEach((panel, idx) => {
          const ratio = ratios.get(panel) || 0
          if (ratio > maxRatio) {
            maxRatio = ratio
            bestIdx = idx
          }
        })

        if (bestIdx !== -1 && maxRatio >= 0.45 && !isTransitioningRef.current && bestIdx !== activeSectionRef.current) {
          const dir = bestIdx >= activeSectionRef.current ? 'down' : 'up'
          setTransitionDirection(dir)
          setActiveSection(bestIdx)
          activeSectionRef.current = bestIdx
        }
      },
      {
        root: null, // viewport
        threshold: [0.1, 0.3, 0.5, 0.7, 0.9],
        rootMargin: '-5% 0px -5% 0px',
      }
    )

    panels.forEach((panel) => observer.observe(panel))
    return () => observer.disconnect()
  }, [loaded, isMobileOrTablet]) // re-attach after page loads

  // ── Sync footer reveal state when scrolled into view ─────────────────────────
  useEffect(() => {
    const footerEl = footerRef.current
    if (!footerEl) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
            setIsFooterRevealed(true)
            isFooterRevealedRef.current = true
          } else if (!entry.isIntersecting || entry.intersectionRatio < 0.15) {
            setIsFooterRevealed(false)
            isFooterRevealedRef.current = false
          }
        }
      },
      {
        threshold: [0, 0.15, 0.35, 0.7],
      }
    )

    observer.observe(footerEl)
    return () => observer.disconnect()
  }, [loaded])

  // ── Sync scrollState for Three.js using real scroll position ─────────────
  // Only needed on desktop where 3D scene and Orb are active
  useEffect(() => {
    if (isMobileOrTablet || isMobile || isSingleColumn) return // skip rAF smoother on mobile & tablet

    const updateScroll = () => {
      const docH = document.documentElement.scrollHeight - window.innerHeight
      const raw = docH > 0 ? window.scrollY / docH : 0
      scrollState.progress = Math.max(0, Math.min(1, raw))
    }

    window.addEventListener('scroll', updateScroll, { passive: true })
    updateScroll()

    // rAF loop to keep smoothProgress interpolated for 3D scene
    let rafId: number
    const tick = () => {
      const target = scrollState.progress
      const current = scrollState.smoothProgress
      const next = current + (target - current) * 0.1
      scrollState.smoothProgress = next
      scrollState.velocity = (target - next) * 60
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('scroll', updateScroll)
      cancelAnimationFrame(rafId)
    }
  }, [loaded, isMobileOrTablet, isMobile, isSingleColumn])

  // ── Smooth parallax engine (mouse / gyro) ────────────────────────────────
  useEffect(() => {
    if (reducedMotion || isMobileOrTablet || isMobile) {
      if (landingPageRef.current) {
        landingPageRef.current.style.setProperty('--parallax-x', '0')
        landingPageRef.current.style.setProperty('--parallax-y', '0')
      }
      return
    }

    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0
    let rafId: number

    const handleMouseMove = (e: MouseEvent) => {
      targetX = (e.clientX / window.innerWidth) * 2 - 1
      targetY = (e.clientY / window.innerHeight) * 2 - 1
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma != null && e.beta != null) {
        targetX = Math.max(-1, Math.min(1, e.gamma / 35))
        targetY = Math.max(-1, Math.min(1, (e.beta - 45) / 35))
      }
    }

    const render = () => {
      currentX += (targetX - currentX) * 0.06
      currentY += (targetY - currentY) * 0.06
      if (landingPageRef.current) {
        landingPageRef.current.style.setProperty('--parallax-x', currentX.toFixed(4))
        landingPageRef.current.style.setProperty('--parallax-y', currentY.toFixed(4))
      }
      rafId = requestAnimationFrame(render)
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    if ('DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', handleOrientation, { passive: true })
    }
    rafId = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if ('DeviceOrientationEvent' in window) {
        window.removeEventListener('deviceorientation', handleOrientation)
      }
      cancelAnimationFrame(rafId)
    }
  }, [reducedMotion, isMobileOrTablet, isMobile])

  const skip3D = reducedMotion

  // On mobile & tablets, instantly set loaded = true so user doesn't wait for heavy loader
  useEffect(() => {
    if ((isMobileOrTablet || isMobile || isSingleColumn) && !loaded) {
      setLoaded(true)
    }
  }, [isMobileOrTablet, isMobile, isSingleColumn, loaded])

  return (
    <>
      {!loaded && !skip3D && !isMobileOrTablet && !isMobile && !isSingleColumn && (
        <LoadingScreen
          progress={loadProgress}
          ready={loadProgress >= 100}
          onComplete={handleLoadComplete}
        />
      )}

      <div
        ref={landingPageRef}
        className={`landing-page ${loaded || skip3D || isMobileOrTablet || isMobile || isSingleColumn ? 'landing-page--ready' : 'landing-page--loading'}`}
      >
        <LandingNav onNavigate={goToSection} activeSection={activeSection} />

        {/* Ambient Specular Parallax Spotlight — desktop only */}
        {!reducedMotion && !isMobileOrTablet && !isMobile && !isSingleColumn && activeSection !== 7 && !isFooterRevealed && (
          <div className="landing-parallax-spotlight" aria-hidden="true" />
        )}

        {/* Floating Cybernetic Depth Grid Layer — desktop only */}
        {!reducedMotion && !isMobileOrTablet && !isMobile && !isSingleColumn && (
          <div className="landing-parallax-grid" aria-hidden="true" />
        )}

        {/* Dynamic Magnetic Orb Background directly behind 3D model */}
        {!reducedMotion &&
          !isFooterRevealed &&
          (isMobile || isMobileOrTablet || isSingleColumn
            ? activeSection === 0
            : activeSection === 0 || activeSection === 1) && (
          <MagneticOrbBackground
            activeSection={activeSection}
            totalSections={TOTAL_SECTIONS}
            isMobile={isMobile || isSingleColumn}
            reducedMotion={reducedMotion}
            isFooterOpen={isFooterRevealed}
            hue={275}
            hoverIntensity={1.5}
            rotateOnHover={true}
            forceHoverState={false}
            backgroundColor="#000000"
          />
        )}

        {/* 3D Scene — displayed only on Hero on mobile; on Hero and Section 2 on desktop */}
        {!reducedMotion &&
          !isFooterRevealed &&
          (isMobile || isMobileOrTablet || isSingleColumn
            ? activeSection === 0
            : activeSection === 0 || activeSection === 1) && (
          <div className="landing-scene-fixed is-visible">
            <Suspense fallback={<SceneLoadTrigger onLoad={handleSceneReady} />}>
              <PrintBoothScene
                scrollProgress={scrollState.smoothProgress || 0}
                activeSection={activeSection}
                totalSections={TOTAL_SECTIONS}
                reducedMotion={reducedMotion}
                isMobile={isMobile || isSingleColumn}
                isHero={activeSection === 0}
              />
              <SceneLoadTrigger onLoad={handleSceneReady} />
            </Suspense>
          </div>
        )}

        {/* Full-page section viewport — only current section is shown; previous sections never linger */}
        <main className="landing-sections-viewport" role="main" data-direction={transitionDirection}>
          {/* Section 0: Hero */}
          <div
            className={`landing-section-panel landing-section-panel--hero ${
              activeSection === 0 ? 'is-active' : activeSection > 0 ? 'is-passed' : 'is-upcoming'
            }`}
          >
            <SectionTransition
              isActive={activeSection === 0}
              isPassed={activeSection > 0}
              isUpcoming={activeSection < 0}
              direction={transitionDirection}
              effect={transitionEffect}
              isHero={true}
            >
              <Hero onExplore={() => goToSection(1)} isActive={activeSection === 0} />
            </SectionTransition>
          </div>


          {/* Section 1: Problem */}
          <div
            className={`landing-section-panel ${
              activeSection === 1 ? 'is-active' : activeSection > 1 ? 'is-passed' : 'is-upcoming'
            }`}
          >
            <SectionTransition
              isActive={activeSection === 1}
              isPassed={activeSection > 1}
              isUpcoming={activeSection < 1}
              direction={transitionDirection}
              effect={transitionEffect}
            >
              <ProblemSection isActive={activeSection === 1} />
            </SectionTransition>
          </div>

          {/* Section 2: Product */}
          <div
            className={`landing-section-panel ${
              activeSection === 2 ? 'is-active' : activeSection > 2 ? 'is-passed' : 'is-upcoming'
            }`}
          >
            <SectionTransition
              isActive={activeSection === 2}
              isPassed={activeSection > 2}
              isUpcoming={activeSection < 2}
              direction={transitionDirection}
              effect={transitionEffect}
            >
              <ProductIntro isActive={activeSection === 2} />
            </SectionTransition>
          </div>

          {/* Section 3: How It Works */}
          <div
            className={`landing-section-panel ${
              activeSection === 3 ? 'is-active' : activeSection > 3 ? 'is-passed' : 'is-upcoming'
            }`}
          >
            <SectionTransition
              isActive={activeSection === 3}
              isPassed={activeSection > 3}
              isUpcoming={activeSection < 3}
              direction={transitionDirection}
              effect={transitionEffect}
            >
              <HowItWorks isActive={activeSection === 3} />
            </SectionTransition>
          </div>

          {/* Section 4: Comparison (Non-3D) */}
          <div
            className={`landing-section-panel ${
              activeSection === 4 ? 'is-active' : activeSection > 4 ? 'is-passed' : 'is-upcoming'
            }`}
          >
            <SectionTransition
              isActive={activeSection === 4}
              isPassed={activeSection > 4}
              isUpcoming={activeSection < 4}
              direction={transitionDirection}
              effect={transitionEffect}
            >
              <ComparisonSection isActive={activeSection === 4} />
            </SectionTransition>
          </div>

          {/* Section 5: Dealer (Non-3D) */}
          <div
            className={`landing-section-panel ${
              activeSection === 5 ? 'is-active' : activeSection > 5 ? 'is-passed' : 'is-upcoming'
            }`}
          >
            <SectionTransition
              isActive={activeSection === 5}
              isPassed={activeSection > 5}
              isUpcoming={activeSection < 5}
              direction={transitionDirection}
              effect={transitionEffect}
            >
              <DealerSection isActive={activeSection === 5} />
            </SectionTransition>
          </div>

          {/* Section 6: Technology (3D Center Hardware Model) */}
          <div
            className={`landing-section-panel ${
              activeSection === 6 ? 'is-active' : activeSection > 6 ? 'is-passed' : 'is-upcoming'
            }`}
          >
            <SectionTransition
              isActive={activeSection === 6}
              isPassed={activeSection > 6}
              isUpcoming={activeSection < 6}
              direction={transitionDirection}
              effect={transitionEffect}
            >
              <TechnologySection isActive={activeSection === 6} />
            </SectionTransition>
          </div>

          {/* Section 7: Final CTA + TextLoop Banner + Footer */}
          <div
            className={`landing-section-panel ${
              activeSection === 7 ? 'is-active' : 'is-upcoming'
            }`}
          >
            <SectionTransition
              isActive={activeSection === 7}
              isPassed={false}
              isUpcoming={activeSection < 7}
              direction={transitionDirection}
              effect={transitionEffect}
            >
              <div className="landing-final-panel-content">
                <FinalCTA isActive={activeSection === 7} />

                <div className="landing-textloop-container">
                  <TextLoop
                    text="SAFE ✦ SECURE ✦ EASY ✦ 100% PRIVATE ✦ INSTANT UPI ✦ ZERO WAIT TIME ✦ LASER SHARP ✦ NO APP NEEDED"
                    shape="line"
                    speed={80}
                    direction="forward"
                    separator="✦"
                    curviness={0}
                    fontSize={14}
                    fontWeight={800}
                    letterSpacing={2}
                    uppercase
                    color="#ffffff"
                    ribbon
                    ribbonColor="#dc2626"
                    ribbonWidth={34}
                    pauseOnHover
                  />
                </div>

              </div>
            </SectionTransition>
          </div>
        </main>

        {/* ── Document Flow Footer ────────────────────────────────────────── */}
        <div ref={footerRef} className="landing-footer-wrapper">
          <LandingFooter onJumpToTop={() => goToSection(0)} />
        </div>


        {/* Side Section Navigation Indicator */}
        <SectionIndicator
          activeIndex={activeSection}
          total={TOTAL_SECTIONS}
          onSelect={goToSection}
          labels={SECTION_LABELS}
        />
      </div>
    </>
  )
}

function SceneLoadTrigger({ onLoad }: { onLoad: () => void }) {
  useState(() => {
    setTimeout(onLoad, 100)
  })
  return null
}
