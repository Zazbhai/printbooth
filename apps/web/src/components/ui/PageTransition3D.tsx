import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './PageTransition3D.css'

export interface PageTransition3DProps {
  pageKey: string
  children: React.ReactNode
  title?: string
  color?: string
  text?: string
  accent?: string
}

const DELAYS = [80, 40, 0, 40, 80]
const CLOSE_TIME = 660
const OPEN_TIME = 660

interface StepInfo {
  title: string
  color: string
  text: string
  accent: string
}

// Each step has its own unique, vibrant, non-blue color
const STEP_METADATA: Record<string, StepInfo> = {
  upload: {
    title: 'UPLOAD',
    color: '#dc2626', // Bold Crimson Red
    text: '#ffffff',
    accent: '#ffe85c', // Gold
  },
  confirm: {
    title: 'CONFIRM',
    color: '#ea580c', // Tangerine Orange
    text: '#ffffff',
    accent: '#fef08a', // Pale Yellow
  },
  confirm_doc: {
    title: 'CONFIRM',
    color: '#ea580c', // Tangerine Orange
    text: '#ffffff',
    accent: '#fef08a',
  },
  confirm_final: {
    title: 'CONFIRM',
    color: '#ea580c', // Tangerine Orange
    text: '#ffffff',
    accent: '#fef08a',
  },
  kiosk: {
    title: 'KIOSK',
    color: '#7c3aed', // Royal Violet
    text: '#ffffff',
    accent: '#fbcfe8', // Pink
  },
  settings: {
    title: 'SETTINGS',
    color: '#059669', // Vivid Emerald Green
    text: '#ffffff',
    accent: '#a7f3d0', // Mint
  },
  review: {
    title: 'REVIEW',
    color: '#f0eee6', // Warm Editorial Cream
    text: '#11120f', // Bold Charcoal
    accent: '#dc2626', // Red
  },
  payment: {
    title: 'PAYMENT',
    color: '#18181b', // Matte Obsidian Black
    text: '#ffffff',
    accent: '#10b981', // Emerald
  },
  status: {
    title: 'PRINTING',
    color: '#d97706', // Vibrant Amber Gold
    text: '#ffffff',
    accent: '#fef3c7', // Cream
  },
  success: {
    title: 'SUCCESS',
    color: '#16a34a', // Crisp Vivid Green
    text: '#ffffff',
    accent: '#dcfce7', // Light Green
  },
}

function resolveMeta(key: string, props: { title?: string; color?: string; text?: string; accent?: string }): StepInfo {
  const normalizedKey = key.toLowerCase()
  const matched = STEP_METADATA[normalizedKey] ||
    (normalizedKey.startsWith('confirm') ? STEP_METADATA['confirm'] : null)

  const defaultTitle = key.replace(/[-_]/g, ' ').toUpperCase()

  return {
    title: props.title || matched?.title || defaultTitle || 'PRINTBOOTH',
    color: props.color || matched?.color || '#dc2626',
    text: props.text || matched?.text || '#ffffff',
    accent: props.accent || matched?.accent || '#ffe85c',
  }
}

function wait(duration: number) {
  return new Promise<void>(resolve => {
    window.setTimeout(resolve, duration)
  })
}

function nextFrame() {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function resetScroll() {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  } catch {
    window.scrollTo(0, 0)
  }
  if (typeof document !== 'undefined') {
    if (document.documentElement) document.documentElement.scrollTop = 0
    if (document.body) document.body.scrollTop = 0
  }
}

/**
 * Split Page Transition (Page Wipe)
 * - 5 horizontal staggered rows (delays: 80ms, 40ms, 0ms, 40ms, 80ms)
 * - Portaled to <body> so it covers the Back Button, Breadcrumb Header, and full viewport
 * - Distinct vibrant colors per step (Crimson Red, Tangerine, Violet, Emerald, Cream, Obsidian, Amber)
 * - Pure single-word title only (no step numbers or subtitles)
 * - Responsive fluid text scaling (no overflow on small phones)
 * - Hardware accelerated 60/120fps CSS compositor transitions
 */
export function PageTransition3D({
  pageKey,
  children,
  title,
  color,
  text,
  accent,
}: PageTransition3DProps) {
  const prevPageKeyRef = useRef(pageKey)
  const isFirstMountRef = useRef(true)
  const [displayedChildren, setDisplayedChildren] = useState(children)
  const nextChildrenRef = useRef(children)
  nextChildrenRef.current = children

  const wipeRef = useRef<HTMLDivElement>(null)
  const runIdRef = useRef(0)

  useEffect(() => {
    // Skip animation on initial page load
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false
      setDisplayedChildren(children)
      return
    }

    // If key hasn't changed, pass through updated children without triggering transition
    if (pageKey === prevPageKeyRef.current) {
      setDisplayedChildren(children)
      return
    }

    prevPageKeyRef.current = pageKey

    const reducedMotion = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

    if (reducedMotion) {
      setDisplayedChildren(children)
      resetScroll()
      return
    }

    const wipe = wipeRef.current
    if (!wipe) {
      setDisplayedChildren(children)
      resetScroll()
      return
    }

    const currentRunId = ++runIdRef.current
    const meta = resolveMeta(pageKey, { title, color, text, accent })

    async function executeWipe() {
      if (!wipe) return

      // Apply transition properties
      wipe.style.setProperty('--wipe-bg', meta.color)
      wipe.style.setProperty('--wipe-color', meta.text)
      wipe.style.setProperty('--wipe-accent', meta.accent)

      const titleElements = wipe.querySelectorAll('[data-page-wipe-title]')
      titleElements.forEach(el => {
        el.textContent = meta.title
      })

      document.documentElement.classList.add('is-page-transitioning')

      wipe.classList.remove('is-opening', 'is-covered', 'is-covering')

      await nextFrame()
      if (runIdRef.current !== currentRunId) return

      // Phase 1: Closing halves to 50%
      wipe.classList.add('is-covering')

      await wait(CLOSE_TIME)
      if (runIdRef.current !== currentRunId) return

      // Phase 2: Fully covered state
      wipe.classList.remove('is-covering')
      wipe.classList.add('is-covered')

      // Swap the rendered page under solid cover and reset scroll cleanly
      setDisplayedChildren(nextChildrenRef.current)
      resetScroll()

      await nextFrame()
      if (runIdRef.current !== currentRunId) return

      // Phase 3: Opening halves back to 0%
      wipe.classList.remove('is-covered')
      wipe.classList.add('is-opening')

      await wait(OPEN_TIME)
      if (runIdRef.current !== currentRunId) return

      // Phase 4: Reset to idle
      wipe.classList.remove('is-opening')
      document.documentElement.classList.remove('is-page-transitioning')
    }

    executeWipe()

    return () => {
      document.documentElement.classList.remove('is-page-transitioning')
    }
  }, [pageKey, children, title, color, text, accent])

  const initialMeta = resolveMeta(pageKey, { title, color, text, accent })

  const wipePortal = typeof document !== 'undefined' ? createPortal(
    <div
      ref={wipeRef}
      className="page-wipe"
      data-page-wipe
      aria-hidden="true"
      style={{
        ['--wipe-bg' as any]: initialMeta.color,
        ['--wipe-color' as any]: initialMeta.text,
        ['--wipe-accent' as any]: initialMeta.accent,
      }}
    >
      {/* Staggered shutter rows */}
      {DELAYS.map((delay, row) => (
        <div
          key={row}
          className="page-wipe__row"
          style={
            {
              ['--row']: row,
              ['--delay']: `${delay}ms`,
            } as React.CSSProperties
          }
        >
          <div className="page-wipe__half page-wipe__half--start" />
          <div className="page-wipe__half page-wipe__half--end" />
        </div>
      ))}

      {/* Single centered title layer (eliminates double-text bug) */}
      <div className="page-wipe__center">
        <div className="page-wipe__title">
          <span data-page-wipe-title>{initialMeta.title}</span>
        </div>
        <div className="page-wipe__accent-dot" />
      </div>
    </div>,
    document.body
  ) : null

  return (
    <div className="pt3d-wrapper page-wipe-container" id="pt3d-wrapper">
      {wipePortal}

      {/* Page Content */}
      <div className="pt3d-page page-wipe-content">
        {displayedChildren}
      </div>
    </div>
  )
}

export const SplitPageTransition = PageTransition3D
export const PageWipe = PageTransition3D

export default PageTransition3D
