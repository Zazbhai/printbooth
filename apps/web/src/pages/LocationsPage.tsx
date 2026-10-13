import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, CheckCircle, ArrowRight, Clock, Sparkle, NavigationArrow, Buildings } from '@phosphor-icons/react'
import { Skeleton } from 'boneyard-js/react'
import { usePageSkeleton } from '../hooks/usePageSkeleton'
import { useUserLocation } from '../hooks/useUserLocation'
import { LocationsSkeletonFallback } from '../components/ui/PageSkeletonFallback'
import { getLiveKiosks } from '../lib/api'
import { IndiaMapSearchAnimation } from '../components/ui/IndiaMapSearch/IndiaMapSearchAnimation'
import SEO from '../components/common/SEO'
import './SubPage.css'

const DEFAULT_LOCATIONS = [
  {
    id: 'PB-001',
    name: 'MIT ADT University',
    address: 'Ground Floor, Central Reading Hall, MIT ADT Campus, Pune — 412201',
    lat: 18.4912,
    lng: 74.0253,
    hours: '8:30 AM – 9:30 PM',
    status: 'OFFLINE' as const,
    type: 'University Campus',
  },
]

export default function LocationsPage() {
  const loading = usePageSkeleton(450)
  const { coordinates, status: geoStatus, getDistanceTo } = useUserLocation()
  const [locations, setLocations] = useState<any[]>(DEFAULT_LOCATIONS)

  useEffect(() => {
    let mounted = true
    getLiveKiosks()
      .then((kiosks) => {
        if (mounted && Array.isArray(kiosks) && kiosks.length > 0) {
          setLocations(
            kiosks.map((k) => ({
              id: k.id,
              name: k.name?.replace(/^PrintBooth\s*[—–-]\s*/i, '') || k.location,
              address: k.address || k.location,
              lat: k.lat,
              lng: k.lng,
              hours: '8:30 AM – 9:30 PM',
              status: k.status,
              type: 'Active Station',
            }))
          )
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  return (
    <Skeleton
      name="locations-page"
      loading={loading}
      animate="shimmer"
      color="rgba(163, 177, 198, 0.40)"
      darkColor="rgba(255, 255, 255, 0.08)"
      transition={300}
      fallback={<LocationsSkeletonFallback />}
    >
      <SEO
        title="Locations"
        description="Find active walk-up PrintBooth kiosk stations near you. Live hardware status, walking distance, directions, and operating hours across campuses and tech hubs."
        canonicalUrl="https://printbooth.co.in/locations"
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Locations', url: '/locations' },
        ]}
      />
      <div className="sub-page">
      {/* Hero */}
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner">
            <span className="sub-hero__eyebrow">
              <span className="sub-hero__eyebrow-dot" />
              Locations
            </span>
            <h1 className="sub-hero__title">
              Find a PrintBooth{' '}
              <span className="sub-hero__title-accent">near you</span>
            </h1>
            <p className="sub-hero__sub">
              Self-service printing kiosks across Pune. More cities coming soon.
            </p>
          </div>
        </div>
      </div>

      <div className="container sub-content">
        {/* India Map Search Animation — shown while GPS is loading */}
        {(geoStatus === 'loading' || geoStatus === 'prompt') && (
          <IndiaMapSearchAnimation variant="full" label="Locating nearest PrintBooth" />
        )}

        {/* Stats — shown once location is resolved */}
        {geoStatus !== 'loading' && geoStatus !== 'prompt' && (
          <div className="neo-stats">
            <div className="neo-stat">
              <span className="neo-stat__value">{locations.length}</span>
              <span className="neo-stat__label">Active Kiosks</span>
            </div>
            <div className="neo-stat">
              <span className="neo-stat__value">Pune</span>
              <span className="neo-stat__label">Current City</span>
            </div>
            <div className="neo-stat">
              <span className="neo-stat__value">24/7</span>
              <span className="neo-stat__label">Some locations</span>
            </div>
            <div className="neo-stat">
              <span className="neo-stat__value">&lt;90s</span>
              <span className="neo-stat__label">Avg Print Time</span>
            </div>
          </div>
        )}

        {/* Location cards */}
        <div>
          <h2 className="sub-heading">Active Locations</h2>
          <div className="neo-locations-grid">
            {locations
              .map(loc => {
                const distInfo = getDistanceTo(loc.lat, loc.lng)
                return { ...loc, distInfo }
              })
              .sort((a, b) => {
                if (coordinates && a.distInfo.distanceKm !== null && b.distInfo.distanceKm !== null) {
                  return a.distInfo.distanceKm - b.distInfo.distanceKm
                }
                return 0
              })
              .map((loc, idx) => {
                const isNearest = Boolean(coordinates && loc.distInfo.distanceKm !== null && idx === 0)
                return (
                  <div key={loc.id} className="neo-card neo-location-card" style={isNearest ? { border: '1.5px solid var(--neo-success)', boxShadow: '0 0 16px rgba(16, 185, 129, 0.2)' } : undefined}>
                    {/* Header */}
                    <div className="neo-location-card__header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="neo-location-card__id">{loc.id}</span>
                        {isNearest && (
                          <span className="neo-pill" style={{ background: 'var(--neo-success)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Sparkle size={11} weight="fill" />
                            Nearest
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {loc.distInfo.distanceText && (
                          <span className="neo-pill" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--neo-success)', fontSize: 11, fontWeight: 600 }}>
                            {loc.distInfo.distanceText}
                          </span>
                        )}
                        <span
                          className={`neo-pill ${loc.status === 'ONLINE' ? 'neo-pill-success' : ''}`}
                          style={loc.status !== 'ONLINE' ? { background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' } : undefined}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: loc.status === 'ONLINE' ? 'var(--neo-success)' : '#ef4444',
                              display: 'inline-block',
                            }}
                          />
                          {loc.status === 'ONLINE' ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>

                    {/* Icon + Name */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, margin: '16px 0 12px' }}>
                      <div className="neo-icon-badge neo-icon-badge-sm">
                        <MapPin size={18} weight="fill" />
                      </div>
                      <div>
                        <h2 className="neo-location-card__name">PrintBooth — {loc.name}</h2>
                        <p className="neo-location-card__type">{loc.type}</p>
                      </div>
                    </div>

                    {/* Address */}
                    <p className="neo-location-card__address">{loc.address}</p>

                    {/* Meta */}
                    <div className="neo-location-card__meta">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={13} style={{ color: 'var(--neo-text-4)' }} />
                        <span>{loc.hours}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle size={13} style={{ color: loc.status === 'ONLINE' ? 'var(--neo-success)' : '#ef4444' }} />
                        <span style={{ color: loc.status === 'ONLINE' ? 'var(--neo-success)' : '#ef4444' }}>
                          {loc.status === 'ONLINE' ? 'Available' : 'Offline'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                      <Link
                        to={`/print?id=${loc.id}`}
                        className="neo-btn neo-btn-sm"
                        id={`location-select-${loc.id}`}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        Print here
                        <ArrowRight size={14} weight="bold" />
                      </Link>
                      {loc.lat && loc.lng && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="neo-btn neo-btn-sm"
                          style={{ padding: '0 12px', background: 'transparent', border: '1px solid var(--neo-border)' }}
                          title="Get Directions on Google Maps"
                        >
                          <NavigationArrow size={14} weight="fill" />
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        {/* Expansion notice */}
        <div className="neo-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div className="neo-icon-badge">
            <Buildings size={22} weight="bold" />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--neo-text-1)', marginBottom: 6 }}>
              Deploy or Purchase a PrintBooth Machine
            </p>
            <p style={{ fontSize: 14, color: 'var(--neo-text-3)', lineHeight: 1.65, marginBottom: 14 }}>
              We sell complete autonomous PrintBooth machines directly to xerox shops, universities, colleges, and institutions. Zero company commission on prints, connect your own Wi-Fi or Ethernet, with full on-site installation included.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link to="/request-installation" className="neo-btn neo-btn-primary neo-btn-sm">
                Buy a Machine / Inquire
              </Link>
              <Link to="/contact" className="neo-btn neo-btn-sm">
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
    </Skeleton>
  )
}
