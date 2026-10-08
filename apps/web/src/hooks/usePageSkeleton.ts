import { useState, useEffect } from 'react'

/**
 * Hook to manage page skeleton loading state with Boneyard.
 * Automatically resolves immediately during Boneyard CLI capture builds,
 * and provides a crisp, smooth skeleton transition on initial route navigation.
 */
export function usePageSkeleton(delayMs = 600) {
  const isBuild = typeof window !== 'undefined' && Boolean((window as any).__BONEYARD_BUILD)
  const [loading, setLoading] = useState(!isBuild)

  useEffect(() => {
    if (isBuild) {
      setLoading(false)
      return
    }

    const timer = setTimeout(() => {
      setLoading(false)
    }, delayMs)

    return () => clearTimeout(timer)
  }, [delayMs, isBuild])

  return loading
}
