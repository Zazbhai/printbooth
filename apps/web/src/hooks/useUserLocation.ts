import { useState, useEffect, useCallback } from 'react'

export interface Coordinates {
  lat: number
  lng: number
}

export interface DistanceInfo {
  distanceKm: number | null
  distanceText: string
  travelTimeText: string
}

export type LocationPermissionStatus = 'prompt' | 'granted' | 'denied' | 'unavailable' | 'loading'

/**
 * Calculates great-circle distance between two points on the Earth's surface using Haversine formula
 */
export function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function formatDistance(distKm: number | null): string {
  if (distKm === null || isNaN(distKm)) return ''
  if (distKm < 0.05) return 'Here · <50 m'
  if (distKm < 1.0) {
    const meters = Math.round(distKm * 1000)
    return `${meters} m away`
  }
  return `${distKm.toFixed(1)} km away`
}

export function formatTravelTime(distKm: number | null): string {
  if (distKm === null || isNaN(distKm)) return ''
  if (distKm < 0.05) return 'At location'
  if (distKm <= 1.5) {
    const mins = Math.max(1, Math.round(distKm * 12.5))
    return `~${mins} min walk`
  }
  const driveMins = Math.max(2, Math.round((distKm / 30) * 60))
  return `~${driveMins} min drive`
}

const STORAGE_KEY = 'pb_user_coords'

export function useUserLocation() {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(() => {
    try {
      const cached = sessionStorage.getItem(STORAGE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
          return parsed
        }
      }
    } catch {
      // ignore
    }
    return null
  })

  const [status, setStatus] = useState<LocationPermissionStatus>(() => {
    return coordinates ? 'granted' : 'prompt'
  })
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const requestLocation = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable')
      setErrorMsg('Geolocation is not supported by your browser')
      return
    }

    setStatus('loading')
    setErrorMsg(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: Coordinates = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        }
        setCoordinates(coords)
        setStatus('granted')
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(coords))
        } catch {
          // ignore
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied')
          setErrorMsg('Location permission denied. Showing default ordering.')
        } else {
          setStatus('unavailable')
          setErrorMsg('Could not detect location. Showing default ordering.')
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    )
  }, [])

  // Auto-request location on mount once
  useEffect(() => {
    if (!coordinates && status === 'prompt') {
      requestLocation()
    }
  }, [coordinates, status, requestLocation])

  const getDistanceTo = useCallback(
    (targetLat?: number, targetLng?: number): DistanceInfo => {
      if (
        !coordinates ||
        targetLat === undefined ||
        targetLng === undefined ||
        isNaN(targetLat) ||
        isNaN(targetLng)
      ) {
        return {
          distanceKm: null,
          distanceText: '',
          travelTimeText: '',
        }
      }

      const km = calculateHaversineKm(coordinates.lat, coordinates.lng, targetLat, targetLng)
      return {
        distanceKm: km,
        distanceText: formatDistance(km),
        travelTimeText: formatTravelTime(km),
      }
    },
    [coordinates]
  )

  return {
    coordinates,
    status,
    errorMsg,
    requestLocation,
    getDistanceTo,
  }
}
