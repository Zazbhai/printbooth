import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import './KioskAdBackground.css'

export interface KioskAdItem {
  campaignId: string
  title: string
  advertiser: string
  mediaUrl: string
  headline?: string
  tagline?: string
  callToAction?: string
  badgeText?: string
  accentColor?: string
}

interface KioskAdBackgroundProps {
  kioskId?: string
}

export default function KioskAdBackground({ kioskId = 'PB-001' }: KioskAdBackgroundProps) {
  const location = useLocation()
  const apiUrl = (import.meta.env.VITE_API_URL || 'https://api.printbooth.co.in').replace(/\/api$/, '')

  // Render on "Print from your phone" / idle upload screens
  const isPrintFromPhonePage =
    location.pathname === '/' ||
    location.pathname === '/welcome' ||
    location.pathname === '/upload' ||
    location.pathname === '/upload/qr' ||
    location.pathname === '/enter-pin'

  const [ads, setAds] = useState<KioskAdItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('pb_kiosk_cached_ads')
        if (cached) {
          const parsed = JSON.parse(cached)
          if (Array.isArray(parsed) && parsed.length > 0) return parsed
        }
      } catch {}
    }
    return []
  })

  const [currentIndex, setCurrentIndex] = useState(0)
  const [fadeOpacity, setFadeOpacity] = useState(1)
  const lastTrackedImpression = useRef<string | null>(null)

  const fetchAds = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/advertisements/kiosk/${encodeURIComponent(kioskId)}`)
      if (res.ok) {
        const json = await res.json()
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setAds(json.data)
          try {
            localStorage.setItem('pb_kiosk_cached_ads', JSON.stringify(json.data))
          } catch {}
        }
      }
    } catch {}
  }, [apiUrl, kioskId])

  useEffect(() => {
    fetchAds()
    const poll = setInterval(fetchAds, 60000)
    return () => clearInterval(poll)
  }, [fetchAds])

  useEffect(() => {
    if (ads.length <= 1) return

    const cycle = setInterval(() => {
      setFadeOpacity(0)
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % ads.length)
        setFadeOpacity(1)
      }, 400)
    }, 12000)

    return () => clearInterval(cycle)
  }, [ads.length])

  const currentAd = ads.length > 0 ? ads[currentIndex] || ads[0] : null

  useEffect(() => {
    if (!currentAd?.campaignId || !isPrintFromPhonePage) return
    if (lastTrackedImpression.current === currentAd.campaignId) return

    lastTrackedImpression.current = currentAd.campaignId
    fetch(`${apiUrl}/api/advertisements/${encodeURIComponent(currentAd.campaignId)}/impression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kioskId }),
    }).catch(() => {})
  }, [currentAd?.campaignId, apiUrl, kioskId, isPrintFromPhonePage])

  if (!isPrintFromPhonePage) {
    return null
  }

  return (
    <div className="kiosk-ad-bg-canvas" aria-hidden="true">
      {/* If admin has active ad image, display it smoothly behind white overlay */}
      {currentAd?.mediaUrl ? (
        <>
          <div
            className="kiosk-ad-layer kiosk-ad-motion-drift"
            style={{
              backgroundImage: `url(${currentAd.mediaUrl})`,
              opacity: fadeOpacity * 0.18,
            }}
          />
          <div className="kiosk-ad-white-overlay" />
        </>
      ) : null}

      {/* ── Big App Logo Background: No texts, pure logo mark, moving in smooth ad drift motion ── */}
      <div className="kiosk-bg-logo-stage">
        <div className="kiosk-bg-logo-ambient-wrap">
          <div className="kiosk-bg-logo-aura" />
          <img
            src="/logo.png"
            alt=""
            className="kiosk-bg-logo-big-img"
          />
        </div>
      </div>

      {/* Subtle Depth Vignette */}
      <div className="kiosk-ad-vignette" />
    </div>
  )
}
