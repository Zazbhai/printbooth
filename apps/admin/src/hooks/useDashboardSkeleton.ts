import { useState, useEffect, useRef } from 'react'

/**
 * Hook to manage dashboard skeleton loading state with Boneyard.
 * - Always resolves immediately during Boneyard CLI capture builds (window.__BONEYARD_BUILD)
 * - Keeps loading active while API data is pending
 * - Enforces a minimum display time (default: 450ms) so users get a clean, polished
 *   skeleton transition without layout jumps or premature flashes of incomplete state.
 */
export function useDashboardSkeleton(dataLoaded: boolean, minDelayMs = 450) {
  const isBuild = typeof window !== 'undefined' && Boolean((window as any).__BONEYARD_BUILD)
  const [loading, setLoading] = useState(!isBuild)
  const mountTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    if (isBuild) {
      setLoading(false)
      return
    }

    if (!dataLoaded) {
      setLoading(true)
      mountTimeRef.current = Date.now()
      return
    }

    const elapsed = Date.now() - mountTimeRef.current
    const remaining = Math.max(0, minDelayMs - elapsed)

    const timer = setTimeout(() => {
      setLoading(false)
    }, remaining)

    return () => clearTimeout(timer)
  }, [dataLoaded, minDelayMs, isBuild])

  return loading
}
