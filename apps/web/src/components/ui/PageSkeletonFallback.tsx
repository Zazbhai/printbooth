import './PageSkeletonFallback.css'

/**
 * Pixel-perfect, authentic Neomorphic skeleton fallbacks for each subpage.
 * Matches real DOM cards, shapes, positions, and typography scale 1:1.
 */

// ── 1. Features Page Skeleton Fallback ──
export function FeaturesSkeletonFallback() {
  return (
    <div className="sub-page neo-skeleton-page" aria-hidden="true">
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner" style={{ maxWidth: 640 }}>
            <div className="neo-skeleton-bone" style={{ width: 110, height: 26, borderRadius: 999, marginBottom: 18 }} />
            <div className="neo-skeleton-bone" style={{ width: '85%', height: 42, borderRadius: 12, marginBottom: 14 }} />
            <div className="neo-skeleton-bone" style={{ width: '65%', height: 20, borderRadius: 8, marginBottom: 10 }} />
            <div className="neo-skeleton-bone" style={{ width: '50%', height: 20, borderRadius: 8 }} />
          </div>
        </div>
      </div>

      <div className="container sub-content">
        <div className="neo-features-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="neo-card neo-feature-card" style={{ minHeight: 180 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                <div className="neo-skeleton-bone" style={{ width: 44, height: 44, borderRadius: 14 }} />
                <div className="neo-skeleton-bone" style={{ width: 64, height: 22, borderRadius: 999 }} />
              </div>
              <div className="neo-skeleton-bone" style={{ width: '70%', height: 22, borderRadius: 8, marginBottom: 12 }} />
              <div className="neo-skeleton-bone" style={{ width: '100%', height: 14, borderRadius: 6, marginBottom: 8 }} />
              <div className="neo-skeleton-bone" style={{ width: '80%', height: 14, borderRadius: 6 }} />
            </div>
          ))}
        </div>

        <div className="neo-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginTop: 40, padding: 32 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="neo-skeleton-bone" style={{ width: '50%', height: 22, borderRadius: 8, marginBottom: 10 }} />
            <div className="neo-skeleton-bone" style={{ width: '75%', height: 16, borderRadius: 6 }} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="neo-skeleton-bone" style={{ width: 140, height: 44, borderRadius: 14 }} />
            <div className="neo-skeleton-bone" style={{ width: 120, height: 44, borderRadius: 14 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 2. Locations Page Skeleton Fallback ──
export function LocationsSkeletonFallback() {
  return (
    <div className="sub-page neo-skeleton-page" aria-hidden="true">
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner" style={{ maxWidth: 640 }}>
            <div className="neo-skeleton-bone" style={{ width: 105, height: 26, borderRadius: 999, marginBottom: 18 }} />
            <div className="neo-skeleton-bone" style={{ width: '80%', height: 42, borderRadius: 12, marginBottom: 14 }} />
            <div className="neo-skeleton-bone" style={{ width: '60%', height: 20, borderRadius: 8 }} />
          </div>
        </div>
      </div>

      <div className="container sub-content">
        {/* Quick stats row */}
        <div className="neo-stats">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="neo-stat">
              <div className="neo-skeleton-bone" style={{ width: 50, height: 32, borderRadius: 8, marginBottom: 6 }} />
              <div className="neo-skeleton-bone" style={{ width: 85, height: 14, borderRadius: 6 }} />
            </div>
          ))}
        </div>

        {/* Section title */}
        <div className="neo-skeleton-bone" style={{ width: 160, height: 22, borderRadius: 8, marginBottom: 20 }} />

        {/* 3 Real Location Cards */}
        <div className="neo-locations-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="neo-card neo-location-card" style={{ minHeight: 290 }}>
              {/* Header: PB ID & Online pill */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div className="neo-skeleton-bone" style={{ width: 68, height: 22, borderRadius: 999 }} />
                <div className="neo-skeleton-bone" style={{ width: 72, height: 22, borderRadius: 999 }} />
              </div>
              {/* Icon + Title */}
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
                <div className="neo-skeleton-bone" style={{ width: 38, height: 38, borderRadius: 12 }} />
                <div style={{ flex: 1 }}>
                  <div className="neo-skeleton-bone" style={{ width: '80%', height: 20, borderRadius: 6, marginBottom: 6 }} />
                  <div className="neo-skeleton-bone" style={{ width: '45%', height: 14, borderRadius: 6 }} />
                </div>
              </div>
              {/* Address line */}
              <div className="neo-skeleton-bone" style={{ width: '90%', height: 15, borderRadius: 6, marginBottom: 10 }} />
              {/* Hours line */}
              <div className="neo-skeleton-bone" style={{ width: '55%', height: 15, borderRadius: 6, marginBottom: 24 }} />
              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="neo-skeleton-bone" style={{ flex: 1, height: 42, borderRadius: 12 }} />
                <div className="neo-skeleton-bone" style={{ width: 44, height: 42, borderRadius: 12 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Host banner */}
        <div className="neo-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 28, marginTop: 32, flexWrap: 'wrap', gap: 18 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="neo-skeleton-bone" style={{ width: '60%', height: 22, borderRadius: 8, marginBottom: 8 }} />
            <div className="neo-skeleton-bone" style={{ width: '85%', height: 15, borderRadius: 6 }} />
          </div>
          <div className="neo-skeleton-bone" style={{ width: 170, height: 44, borderRadius: 14 }} />
        </div>
      </div>
    </div>
  )
}

// ── 3. Pricing Page Skeleton Fallback ──
export function PricingSkeletonFallback() {
  return (
    <div className="sub-page neo-skeleton-page" aria-hidden="true">
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner" style={{ maxWidth: 640 }}>
            <div className="neo-skeleton-bone" style={{ width: 90, height: 26, borderRadius: 999, marginBottom: 18 }} />
            <div className="neo-skeleton-bone" style={{ width: '80%', height: 42, borderRadius: 12, marginBottom: 14 }} />
            <div className="neo-skeleton-bone" style={{ width: '65%', height: 20, borderRadius: 8 }} />
          </div>
        </div>
      </div>

      <div className="container sub-content">
        {/* Quick stats */}
        <div className="neo-stats">
          <div className="neo-stat">
            <div className="neo-skeleton-bone" style={{ width: 45, height: 32, borderRadius: 8, marginBottom: 6 }} />
            <div className="neo-skeleton-bone" style={{ width: 110, height: 14, borderRadius: 6 }} />
          </div>
          <div className="neo-stat">
            <div className="neo-skeleton-bone" style={{ width: 45, height: 32, borderRadius: 8, marginBottom: 6 }} />
            <div className="neo-skeleton-bone" style={{ width: 110, height: 14, borderRadius: 6 }} />
          </div>
          <div className="neo-stat">
            <div className="neo-skeleton-bone" style={{ width: 35, height: 32, borderRadius: 8, marginBottom: 6 }} />
            <div className="neo-skeleton-bone" style={{ width: 95, height: 14, borderRadius: 6 }} />
          </div>
        </div>

        {/* Price Table Card */}
        <div className="neo-table-card" style={{ padding: 28, marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
            <div className="neo-skeleton-bone" style={{ width: 120, height: 20, borderRadius: 6 }} />
            <div className="neo-skeleton-bone" style={{ width: 140, height: 20, borderRadius: 6 }} />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: '1px solid rgba(163, 177, 198, 0.2)' }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <div className="neo-skeleton-bone" style={{ width: 40, height: 22, borderRadius: 6 }} />
                <div className="neo-skeleton-bone" style={{ width: 100, height: 22, borderRadius: 6 }} />
                <div className="neo-skeleton-bone" style={{ width: 90, height: 22, borderRadius: 6 }} />
              </div>
              <div className="neo-skeleton-bone" style={{ width: 50, height: 26, borderRadius: 8 }} />
            </div>
          ))}
        </div>

        {/* Inclusions Card */}
        <div className="neo-inclusions" style={{ padding: 28 }}>
          <div className="neo-skeleton-bone" style={{ width: 220, height: 22, borderRadius: 8, marginBottom: 20 }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
              <div className="neo-skeleton-bone" style={{ width: 18, height: 18, borderRadius: '50%' }} />
              <div className="neo-skeleton-bone" style={{ width: `${60 + (i % 3) * 12}%`, height: 16, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 4. How It Works Skeleton Fallback ──
export function HowItWorksSkeletonFallback() {
  return (
    <div className="sub-page neo-skeleton-page" aria-hidden="true">
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner" style={{ maxWidth: 640 }}>
            <div className="neo-skeleton-bone" style={{ width: 110, height: 26, borderRadius: 999, marginBottom: 18 }} />
            <div className="neo-skeleton-bone" style={{ width: '75%', height: 42, borderRadius: 12, marginBottom: 14 }} />
            <div className="neo-skeleton-bone" style={{ width: '65%', height: 20, borderRadius: 8 }} />
          </div>
        </div>
      </div>

      <div className="container sub-content">
        <div className="neo-steps-list">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="neo-card neo-step-card" style={{ padding: 28, marginBottom: 24, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <div className="neo-skeleton-bone" style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div className="neo-skeleton-bone" style={{ width: 36, height: 18, borderRadius: 4 }} />
                  <div className="neo-skeleton-bone" style={{ width: '40%', height: 22, borderRadius: 6 }} />
                </div>
                <div className="neo-skeleton-bone" style={{ width: '95%', height: 15, borderRadius: 6, marginBottom: 8 }} />
                <div className="neo-skeleton-bone" style={{ width: '80%', height: 15, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 5. FAQ Page Skeleton Fallback ──
export function FAQSkeletonFallback() {
  return (
    <div className="sub-page neo-skeleton-page" aria-hidden="true">
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner" style={{ maxWidth: 640 }}>
            <div className="neo-skeleton-bone" style={{ width: 75, height: 26, borderRadius: 999, marginBottom: 18 }} />
            <div className="neo-skeleton-bone" style={{ width: '80%', height: 42, borderRadius: 12, marginBottom: 14 }} />
            <div className="neo-skeleton-bone" style={{ width: '60%', height: 20, borderRadius: 8 }} />
          </div>
        </div>
      </div>

      <div className="container sub-content">
        {/* Search bar bone */}
        <div className="neo-skeleton-bone" style={{ maxWidth: 480, height: 48, borderRadius: 14, marginBottom: 32 }} />

        {/* 6 Accordion Items */}
        <div className="neo-faq-list">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="neo-faq-item" style={{ padding: '20px 24px', marginBottom: 14, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="neo-skeleton-bone" style={{ width: `${55 + (i % 4) * 10}%`, height: 20, borderRadius: 6 }} />
              <div className="neo-skeleton-bone" style={{ width: 24, height: 24, borderRadius: '50%' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 6. Support Page Skeleton Fallback ──
export function SupportSkeletonFallback() {
  return (
    <div className="sub-page neo-skeleton-page" aria-hidden="true">
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner" style={{ maxWidth: 640 }}>
            <div className="neo-skeleton-bone" style={{ width: 120, height: 26, borderRadius: 999, marginBottom: 18 }} />
            <div className="neo-skeleton-bone" style={{ width: '75%', height: 42, borderRadius: 12, marginBottom: 14 }} />
            <div className="neo-skeleton-bone" style={{ width: '65%', height: 20, borderRadius: 8 }} />
          </div>
        </div>
      </div>

      <div className="container sub-content">
        <div className="neo-stats">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="neo-stat">
              <div className="neo-skeleton-bone" style={{ width: 55, height: 30, borderRadius: 8, marginBottom: 6 }} />
              <div className="neo-skeleton-bone" style={{ width: 90, height: 14, borderRadius: 6 }} />
            </div>
          ))}
        </div>

        <div className="neo-support-grid">
          {/* Form bone */}
          <div className="neo-card neo-support-form" style={{ padding: 28 }}>
            <div className="neo-skeleton-bone" style={{ width: '35%', height: 16, borderRadius: 6, marginBottom: 8 }} />
            <div className="neo-skeleton-bone" style={{ width: '100%', height: 44, borderRadius: 10, marginBottom: 20 }} />
            <div className="neo-skeleton-bone" style={{ width: '35%', height: 16, borderRadius: 6, marginBottom: 8 }} />
            <div className="neo-skeleton-bone" style={{ width: '100%', height: 44, borderRadius: 10, marginBottom: 20 }} />
            <div className="neo-skeleton-bone" style={{ width: '35%', height: 16, borderRadius: 6, marginBottom: 8 }} />
            <div className="neo-skeleton-bone" style={{ width: '100%', height: 90, borderRadius: 10, marginBottom: 24 }} />
            <div className="neo-skeleton-bone" style={{ width: 160, height: 44, borderRadius: 14 }} />
          </div>

          {/* Cards bone */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="neo-card" style={{ padding: 20, display: 'flex', gap: 14, alignItems: 'center' }}>
                <div className="neo-skeleton-bone" style={{ width: 40, height: 40, borderRadius: 12 }} />
                <div style={{ flex: 1 }}>
                  <div className="neo-skeleton-bone" style={{ width: '50%', height: 18, borderRadius: 6, marginBottom: 6 }} />
                  <div className="neo-skeleton-bone" style={{ width: '80%', height: 14, borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 7. Contact Page Skeleton Fallback ──
export function ContactSkeletonFallback() {
  return (
    <div className="sub-page neo-skeleton-page" aria-hidden="true">
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner" style={{ maxWidth: 640 }}>
            <div className="neo-skeleton-bone" style={{ width: 100, height: 26, borderRadius: 999, marginBottom: 18 }} />
            <div className="neo-skeleton-bone" style={{ width: '70%', height: 42, borderRadius: 12, marginBottom: 14 }} />
            <div className="neo-skeleton-bone" style={{ width: '60%', height: 20, borderRadius: 8 }} />
          </div>
        </div>
      </div>

      <div className="container sub-content">
        <div className="neo-channels-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 36 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="neo-card neo-channel-card" style={{ padding: 24 }}>
              <div className="neo-skeleton-bone" style={{ width: 40, height: 40, borderRadius: 12, marginBottom: 16 }} />
              <div className="neo-skeleton-bone" style={{ width: '50%', height: 14, borderRadius: 6, marginBottom: 8 }} />
              <div className="neo-skeleton-bone" style={{ width: '75%', height: 18, borderRadius: 6, marginBottom: 6 }} />
              <div className="neo-skeleton-bone" style={{ width: '60%', height: 13, borderRadius: 6 }} />
            </div>
          ))}
        </div>

        <div className="neo-card" style={{ padding: 32, maxWidth: 680, margin: '0 auto' }}>
          <div className="neo-skeleton-bone" style={{ width: 180, height: 22, borderRadius: 8, marginBottom: 24 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="neo-skeleton-bone" style={{ height: 44, borderRadius: 10 }} />
            <div className="neo-skeleton-bone" style={{ height: 44, borderRadius: 10 }} />
          </div>
          <div className="neo-skeleton-bone" style={{ height: 44, borderRadius: 10, marginBottom: 16 }} />
          <div className="neo-skeleton-bone" style={{ height: 100, borderRadius: 10, marginBottom: 24 }} />
          <div className="neo-skeleton-bone" style={{ width: 150, height: 44, borderRadius: 14 }} />
        </div>
      </div>
    </div>
  )
}

// ── 8. Request Installation Page Skeleton Fallback ──
export function RequestInstallationSkeletonFallback() {
  return (
    <div className="sub-page neo-skeleton-page" aria-hidden="true">
      <div className="sub-hero" style={{ paddingBottom: 36 }}>
        <div className="container">
          <div className="sub-hero__inner" style={{ maxWidth: 560, margin: '0 auto', alignItems: 'center', textAlign: 'center' }}>
            <div className="neo-skeleton-bone" style={{ width: 150, height: 26, borderRadius: 999, marginBottom: 16 }} />
            <div className="neo-skeleton-bone" style={{ width: '85%', height: 38, borderRadius: 12, marginBottom: 12 }} />
            <div className="neo-skeleton-bone" style={{ width: '70%', height: 18, borderRadius: 8 }} />
          </div>
        </div>
      </div>

      <div className="container sub-content" style={{ paddingTop: 0 }}>
        {/* Form Card */}
        <div className="neo-card" style={{ padding: 32, maxWidth: 760, margin: '0 auto' }}>
          <div className="neo-skeleton-bone" style={{ width: 220, height: 24, borderRadius: 8, marginBottom: 20 }} />
          {/* Inputs Row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="neo-skeleton-bone" style={{ height: 44, borderRadius: 10 }} />
            <div className="neo-skeleton-bone" style={{ height: 44, borderRadius: 10 }} />
          </div>
          {/* Inputs Row 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="neo-skeleton-bone" style={{ height: 44, borderRadius: 10 }} />
            <div className="neo-skeleton-bone" style={{ height: 44, borderRadius: 10 }} />
          </div>
          {/* Inputs Row 3 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="neo-skeleton-bone" style={{ height: 44, borderRadius: 10 }} />
            <div className="neo-skeleton-bone" style={{ height: 44, borderRadius: 10 }} />
          </div>
          <div className="neo-skeleton-bone" style={{ width: '100%', height: 46, borderRadius: 14, marginTop: 8 }} />
        </div>
      </div>
    </div>
  )
}

// ── 9. Legal Document Pages Skeleton Fallback ──
export function LegalSkeletonFallback() {
  return (
    <div className="sub-page neo-skeleton-page" aria-hidden="true">
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner" style={{ maxWidth: 640 }}>
            <div className="neo-skeleton-bone" style={{ width: 80, height: 26, borderRadius: 999, marginBottom: 18 }} />
            <div className="neo-skeleton-bone" style={{ width: '70%', height: 42, borderRadius: 12, marginBottom: 14 }} />
            <div className="neo-skeleton-bone" style={{ width: 140, height: 22, borderRadius: 999 }} />
          </div>
        </div>
      </div>

      <div className="container sub-content">
        <div className="neo-card" style={{ padding: 36, maxWidth: 800, margin: '0 auto' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ marginBottom: 32 }}>
              <div className="neo-skeleton-bone" style={{ width: '40%', height: 22, borderRadius: 6, marginBottom: 14 }} />
              <div className="neo-skeleton-bone" style={{ width: '100%', height: 15, borderRadius: 6, marginBottom: 8 }} />
              <div className="neo-skeleton-bone" style={{ width: '92%', height: 15, borderRadius: 6, marginBottom: 8 }} />
              <div className="neo-skeleton-bone" style={{ width: '75%', height: 15, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
