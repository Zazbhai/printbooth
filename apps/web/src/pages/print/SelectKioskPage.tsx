import { useState, useEffect, useMemo } from 'react'
import { useNavigate as useRouterNavigate } from 'react-router-dom'
import { usePrintFlow } from './PrintFlowContext'
import {
  MapPin,
  MagnifyingGlass,
  Sparkle,
  NavigationArrow,
  Crosshair,
  ArrowSquareOut,
  CheckCircle,
  ArrowRight,
} from '@phosphor-icons/react'
import { getLiveKiosks } from '@/lib/api'
import { useUserLocation } from '@/hooks/useUserLocation'
import { MascotUnavailable } from './MascotUnavailable'
import { Skeleton, KioskStationBoneyardFallback } from '../../components/ui/PrintBoneyardSkeleton'
import { IndiaMapSearchAnimation } from '../../components/ui/IndiaMapSearch/IndiaMapSearchAnimation'
import './SelectKioskPage.css'

export interface Kiosk {
  id: string
  name: string
  location: string
  address?: string
  lat?: number
  lng?: number
  distance?: string
  status: 'ONLINE' | 'WARNING' | 'OFFLINE' | 'MAINTENANCE'
  printerStatus: string
  printerModel?: string
  printer?: string
  paper: number
  toner: number
  queue: number
  isTestMode?: boolean
  kioskPhotoUrl?: string
  hardwareDetails?: {
    isAvailable: boolean
    isOnline: boolean
    isHardwareReady: boolean
    isTestMode?: boolean
    port?: string
    driver?: string
    connectionType?: string
    statusLabels?: string[]
    selectedPrinter?: string
  }
}

export interface KioskHealth {
  isAvailable: boolean
  isOffline: boolean
  badgeLabel: string
}

export function getKioskHealth(kiosk: Kiosk): KioskHealth {
  const statusUpper = (kiosk.status || '').toUpperCase()
  const printerUpper = (kiosk.printerStatus || '').toUpperCase()
  const labels = (kiosk.hardwareDetails?.statusLabels || []).join(' ').toUpperCase()

  const hasHardwareError =
    printerUpper === 'ERROR' ||
    printerUpper === 'PAPER_JAM' ||
    labels.includes('ERROR') ||
    labels.includes('JAM') ||
    labels.includes('STOPPED')

  const isNotConnected =
    kiosk.hardwareDetails?.isOnline === false ||
    kiosk.hardwareDetails?.isAvailable === false ||
    labels.includes('DISCONNECTED') ||
    labels.includes('NOT CONNECTED') ||
    printerUpper === 'OFFLINE' ||
    statusUpper === 'OFFLINE'

  const isMaintenance = statusUpper === 'MAINTENANCE'
  const isPaperDepleted =
    labels.includes('PAPER_OUT') ||
    labels.includes('PAPER PROBLEM') ||
    printerUpper === 'PAPER_OUT' ||
    (typeof kiosk.paper === 'number' && kiosk.paper > 0 && kiosk.paper <= 5)

  const isPrinterReady =
    printerUpper === 'READY' ||
    printerUpper === 'IDLE' ||
    printerUpper === 'ONLINE' ||
    printerUpper === 'AVAILABLE' ||
    printerUpper === 'PRINTING' ||
    Boolean(kiosk.hardwareDetails?.isHardwareReady) ||
    Boolean(kiosk.hardwareDetails?.isAvailable)

  const isAvailable =
    !hasHardwareError &&
    !isNotConnected &&
    !isMaintenance &&
    !isPaperDepleted &&
    statusUpper === 'ONLINE' &&
    isPrinterReady

  return {
    isAvailable,
    isOffline: !isAvailable,
    badgeLabel: isAvailable ? 'Online' : 'Unavailable',
  }
}

const DEFAULT_KIOSK_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=400&q=80'

export default function SelectKioskPage() {
  const routerNavigate = useRouterNavigate()
  const flow = usePrintFlow()
  const [kiosksList, setKiosksList] = useState<Kiosk[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return flow?.printerId ? flow.printerId.toUpperCase() : (typeof window !== 'undefined' ? (sessionStorage.getItem('pb_kiosk_id')?.toUpperCase() || null) : null)
  })
  const [isLoading, setIsLoading] = useState(true)
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null)

  const { coordinates, status: geoStatus, requestLocation, getDistanceTo } = useUserLocation()

  // Sync selectedId with context
  useEffect(() => {
    if (flow?.printerId) {
      setSelectedId(flow.printerId.toUpperCase())
    }
  }, [flow?.printerId])

  useEffect(() => {
    let mounted = true
    async function loadKiosks() {
      try {
        const data = await getLiveKiosks()
        if (mounted) {
          if (data && data.length > 0) {
            const activeKiosks = data.filter((k: any) => !k.isBlocked && !k.merchantBlocked && k.status !== 'BLOCKED')
            setKiosksList(activeKiosks)
          }
          setIsLoading(false)
        }
      } catch {
        if (mounted) setIsLoading(false)
      }
    }
    loadKiosks()
    const timer = setInterval(loadKiosks, 5000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  // Process kiosks with health status, real-time distance and sorting
  const processedKiosks = useMemo(() => {
    // 1. Enrich with health and distance
    const enriched = kiosksList.map(kiosk => {
      const health = getKioskHealth(kiosk)
      const distInfo = getDistanceTo(kiosk.lat, kiosk.lng)
      return {
        ...kiosk,
        health,
        distInfo,
      }
    })

    // 2. Filter by search
    const filtered = enriched.filter(k =>
      k.name.toLowerCase().includes(search.toLowerCase()) ||
      k.location.toLowerCase().includes(search.toLowerCase()) ||
      (k.address && k.address.toLowerCase().includes(search.toLowerCase()))
    )

    // 3. Sort: Available kiosks first, then sorted by distance
    const sorted = [...filtered].sort((a, b) => {
      if (a.health.isAvailable && !b.health.isAvailable) return -1
      if (!a.health.isAvailable && b.health.isAvailable) return 1

      const distA = a.distInfo.distanceKm ?? 99999
      const distB = b.distInfo.distanceKm ?? 99999
      return distA - distB
    })

    // 4. Mark nearest available kiosk (or nearest overall if all are offline)
    let nearestAssigned = false
    return sorted.map(k => {
      const isNearest =
        !nearestAssigned &&
        k.distInfo.distanceKm !== null &&
        k.distInfo.distanceKm < 50
      if (isNearest) {
        nearestAssigned = true
      }
      return {
        ...k,
        isNearest,
      }
    })
  }, [kiosksList, search, getDistanceTo])

  function handleSelect(kiosk: Kiosk, health: KioskHealth) {
    if (!health.isAvailable) return
    const targetId = ((kiosk as any).kioskId || kiosk.id || '').trim().toUpperCase()
    setSelectedId(targetId)
    sessionStorage.setItem('pb_kiosk_id', targetId)
    sessionStorage.setItem('pb_kiosk_name', kiosk.name)
    localStorage.setItem('pb_kiosk_id', targetId)
    localStorage.setItem('pb_kiosk_name', kiosk.name)

    const hasFiles = Boolean(sessionStorage.getItem('pb_file_name')) || Boolean(sessionStorage.getItem('pb_files'))

    if (flow) {
      flow.setPrinterId(targetId, kiosk.name)
      if (hasFiles) {
        flow.goToStep('settings')
      } else {
        flow.goToStep('upload')
      }
    } else {
      routerNavigate('/print', { replace: true })
    }
  }

  return (
    <div className="kiosk-page">
      {/* ── Header ── */}
      <div className="kiosk-header">
        <h1 className="kiosk-title">Choose Print Station</h1>
        <p className="kiosk-subtitle">
          Select an active walk-up PrintBooth to route and release your documents.
        </p>
      </div>

      {/* ── GPS / Distance Bar ── */}
      {(geoStatus === 'loading' || geoStatus === 'prompt') ? (
        <IndiaMapSearchAnimation variant="compact" label="Finding nearest print station" />
      ) : (
        <div className="kiosk-distance-bar">
          <div className="kiosk-distance-bar__left">
            <div className="kiosk-radar-ping">
              <span className="kiosk-radar-ring" />
              <span className="kiosk-radar-ring second" />
              <span className="kiosk-radar-center" />
            </div>
            <span>
              {coordinates ? (
                <>
                  <strong>Live Distance Active:</strong> Showing nearest PrintBooth first
                </>
              ) : geoStatus === 'denied' ? (
                'Location access blocked. Showing default station list.'
              ) : (
                'Enable GPS to calculate walking distance and find nearest kiosk'
              )}
            </span>
          </div>
          <button
            type="button"
            className="kiosk-distance-action-btn"
            onClick={requestLocation}
            title={coordinates ? 'Refresh GPS location' : 'Enable location'}
          >
            <Crosshair size={14} weight="bold" />
            <span>{coordinates ? 'Refresh GPS' : 'Enable Location'}</span>
          </button>
        </div>
      )}

      {/* ── Search Capsule ── */}
      <div className="kiosk-search-shell">
        <div className="kiosk-search">
          <MagnifyingGlass size={17} weight="bold" className="kiosk-search__icon" />
          <input
            type="search"
            placeholder="Search campus or station name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="kiosk-search__input"
            id="kiosk-search"
            aria-label="Search PrintBooth locations"
          />
          {search && (
            <button
              type="button"
              className="kiosk-search__clear"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {offlineNotice && (
        <div
          style={{
            maxWidth: '680px',
            margin: '0 auto 16px',
            padding: '10px 16px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#dc2626',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <span>{offlineNotice}</span>
          <button
            type="button"
            onClick={() => setOfflineNotice(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#dc2626',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '16px',
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Kiosk Stations List (Modern Strip Style — NO CARDS) ── */}
      <div className="kiosk-station-list" role="list">
        <Skeleton
          name="choose-kiosk-stations"
          loading={isLoading && kiosksList.length === 0}
          animate="shimmer"
          fallback={<KioskStationBoneyardFallback count={3} />}
        >
          {processedKiosks.length === 0 ? (
            <div className="kiosk-empty">
              No PrintBooths found matching your search.
            </div>
          ) : (
            processedKiosks.map(kiosk => {
            const { health, distInfo, isNearest } = kiosk
            const targetId = ((kiosk as any).kioskId || kiosk.id || '').trim().toUpperCase()
            const isSelected = targetId === (selectedId || '').toUpperCase() || (Boolean(flow?.printerId) && targetId === flow?.printerId?.toUpperCase())
            const displayDistance = distInfo.distanceText || kiosk.distance

            const googleMapsDirections =
              kiosk.lat && kiosk.lng
                ? `https://www.google.com/maps/dir/?api=1&destination=${kiosk.lat},${kiosk.lng}`
                : null

            const photoUrl = kiosk.kioskPhotoUrl || DEFAULT_KIOSK_FALLBACK_IMAGE

            return (
              <div
                key={kiosk.id}
                className={`kiosk-station-row ${
                  isSelected ? 'kiosk-station-row--selected' : ''
                } ${isNearest ? 'kiosk-station-row--nearest' : ''} ${
                  !health.isAvailable ? 'kiosk-station-row--unavailable' : ''
                }`}
                role="listitem"
                onClick={() => {
                  if (health.isAvailable) {
                    handleSelect(kiosk, health)
                  } else {
                    setOfflineNotice(`Station "${kiosk.name}" is currently offline or undergoing service. Please select an available station or visit once powered on.`)
                  }
                }}
              >
                {/* Nearest Beacon Accent Line */}
                {isNearest && (
                  <div className="kiosk-nearest-indicator-bar">
                    <span className="nearest-beacon-pulse" />
                  </div>
                )}

                {/* Left: Small Kiosk Picture from Database */}
                <div className="kiosk-thumb-wrap">
                  <img
                    src={photoUrl}
                    alt={kiosk.name}
                    className="kiosk-thumb-img"
                    onError={e => {
                      // Fallback to default photo if image fails
                      const target = e.currentTarget
                      if (target.src !== DEFAULT_KIOSK_FALLBACK_IMAGE) {
                        target.src = DEFAULT_KIOSK_FALLBACK_IMAGE
                      }
                    }}
                  />
                  {/* Subtle status indicator dot on picture */}
                  <span
                    className={`kiosk-thumb-status-dot ${
                      health.isAvailable ? 'online' : 'offline'
                    }`}
                    title={health.isAvailable ? 'Online' : 'Unavailable'}
                  />
                </div>

                {/* Center: Station Name & Directions */}
                <div className="kiosk-meta">
                  <div className="kiosk-meta__title-row">
                    <h2 className="kiosk-station-name">{kiosk.name}</h2>
                    {isNearest && (
                      <span className="kiosk-nearest-chip" title="Closest station to your current location">
                        <Sparkle size={11} weight="fill" className="nearest-sparkle" />
                        <span>Nearest</span>
                      </span>
                    )}
                  </div>

                  {/* Location / Address */}
                  <div className="kiosk-meta__address">
                    <MapPin size={13} weight="fill" className="kiosk-map-pin" />
                    <span className="kiosk-address-text">
                      {kiosk.address || kiosk.location}
                    </span>
                  </div>

                  {/* Directions & Distance Row */}
                  <div className="kiosk-meta__directions-row">
                    {displayDistance && (
                      <span className={`kiosk-distance-tag ${isNearest ? 'nearest' : ''}`}>
                        {displayDistance}
                        {distInfo.travelTimeText ? ` · ${distInfo.travelTimeText}` : ''}
                      </span>
                    )}

                    {googleMapsDirections && (
                      <a
                        href={googleMapsDirections}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="kiosk-directions-link"
                        onClick={e => e.stopPropagation()}
                        title="Open walking directions in Google Maps"
                      >
                        <NavigationArrow size={12} weight="fill" className="nav-arrow-icon" />
                        <span>Directions</span>
                        <ArrowSquareOut size={11} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Right: Action or Offline Mascot */}
                <div className="kiosk-action-col">
                  {health.isAvailable ? (
                    <button
                      type="button"
                      className={`kiosk-select-pill-btn ${isSelected ? 'selected' : ''}`}
                      onClick={e => {
                        e.stopPropagation()
                        handleSelect(kiosk, health)
                      }}
                      id={`select-kiosk-${kiosk.id}`}
                      aria-label={`Select ${kiosk.name}`}
                    >
                      <span>{isSelected ? 'Selected' : 'Select'}</span>
                      {isSelected ? (
                        <CheckCircle size={15} weight="fill" />
                      ) : (
                        <ArrowRight size={14} weight="bold" />
                      )}
                    </button>
                  ) : (
                    /* IF OFFLINE: Only show "Unavailable" below Mascot Animation (No Background) */
                    <div className="kiosk-unavailable-mascot-box">
                      <MascotUnavailable size="sm" label="Unavailable" />
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
        </Skeleton>
      </div>
    </div>
  )
}
