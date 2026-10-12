import { useEffect, useState, useCallback, useRef } from 'react'
import { PrintingBoothLoader } from '../ui/PrintingBoothLoader'

interface LoadingScreenProps {
  progress?: number
  ready: boolean
  onComplete: () => void
}

export default function LoadingScreen({ ready, onComplete }: LoadingScreenProps) {
  const [fadingOut, setFadingOut] = useState(false)
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)
  const hasFinishedRef = useRef(false)

  const handleFinish = useCallback(() => {
    if (hasFinishedRef.current) return
    hasFinishedRef.current = true
    setFadingOut(true)
    setTimeout(() => {
      onComplete()
    }, 350)
  }, [onComplete])

  // Allow the brand typography reveal to gracefully play (~1.0s)
  useEffect(() => {
    const minTimer = setTimeout(() => {
      setMinTimeElapsed(true)
    }, 1000)
    return () => clearTimeout(minTimer)
  }, [])

  useEffect(() => {
    // When both the minimum reveal time has elapsed and assets are ready, smoothly transition
    if (ready && minTimeElapsed && !hasFinishedRef.current) {
      handleFinish()
    }
  }, [ready, minTimeElapsed, handleFinish])

  // Safety fallback if ready isn't triggered
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      if (!hasFinishedRef.current) {
        handleFinish()
      }
    }, 3500)
    return () => clearTimeout(safetyTimer)
  }, [handleFinish])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: '#ffffff',
        opacity: fadingOut ? 0 : 1,
        transition: 'opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: fadingOut ? 'none' : 'auto',
      }}
      onClick={handleFinish}
      role="button"
      tabIndex={0}
      aria-label="Skip loading"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleFinish()
      }}
    >
      <PrintingBoothLoader fullscreen={false} onComplete={handleFinish} />
    </div>
  )
}
