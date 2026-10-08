import { Skeleton } from 'boneyard-js/react'
import './PrintBoneyardSkeleton.css'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PrintBoneyardSkeleton
 * High-fidelity, bespoke skeleton wireframes for PrintBooth print flow pages.
 * Displays ONLY when data fetching or rendering is in progress / incomplete.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export { Skeleton }

// ── 1. Choose Print Station (Kiosk Rows) Boneyard ──
export function KioskStationBoneyardFallback({ count = 3 }: { count?: number }) {
  return (
    <div className="pb-kiosk-boneyard-wrap" aria-hidden="true" role="presentation">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="pb-kiosk-boneyard-row">
          <div className="pb-kiosk-boneyard-left">
            {/* Small Kiosk Picture Skeleton */}
            <div className="pb-boneyard-bone pb-kiosk-boneyard-thumb" />

            {/* Title, Address & Directions Pill */}
            <div className="pb-kiosk-boneyard-meta">
              <div
                className="pb-boneyard-bone"
                style={{
                  width: i === 0 ? '60%' : i === 1 ? '48%' : '54%',
                  height: 19,
                  borderRadius: 6,
                }}
              />
              <div
                className="pb-boneyard-bone"
                style={{
                  width: i === 0 ? '82%' : i === 1 ? '70%' : '76%',
                  height: 13,
                  borderRadius: 4,
                }}
              />
              <div className="pb-kiosk-boneyard-pills">
                <div
                  className="pb-boneyard-bone"
                  style={{ width: 85, height: 22, borderRadius: 6 }}
                />
                <div
                  className="pb-boneyard-bone"
                  style={{ width: 95, height: 22, borderRadius: 6 }}
                />
              </div>
            </div>
          </div>

          {/* Right: Badge / Select Action */}
          <div className="pb-kiosk-boneyard-right">
            <div
              className="pb-boneyard-bone"
              style={{ width: 80, height: 24, borderRadius: 999 }}
            />
            <div
              className="pb-boneyard-bone"
              style={{ width: 88, height: 32, borderRadius: 999 }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 2. Print Settings Page (Stage & Carousel) Boneyard ──
export function PrintSettingsBoneyardFallback() {
  return (
    <div className="pb-settings-boneyard" aria-hidden="true">
      {/* Central Double-Bezel Sheet Stage Skeleton */}
      <div className="pb-settings-boneyard-stage">
        <div
          className="pb-boneyard-bone"
          style={{ width: 140, height: 16, borderRadius: 6, marginBottom: 8 }}
        />
        <div className="pb-boneyard-bone pb-settings-boneyard-sheet" />
        <div
          className="pb-boneyard-bone"
          style={{ width: 180, height: 14, borderRadius: 6, marginTop: 8 }}
        />
      </div>

      {/* Carousel Pill Strip Skeleton */}
      <div className="pb-settings-boneyard-carousel">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="pb-boneyard-bone pb-settings-boneyard-card" />
        ))}
      </div>

      {/* Bottom Action Skeleton */}
      <div
        className="pb-boneyard-bone"
        style={{ width: 280, height: 46, borderRadius: 14, marginTop: 8 }}
      />
    </div>
  )
}

// ── 3. Review Order (Gallery & Summary) Boneyard ──
export function ReviewOrderBoneyardFallback() {
  return (
    <div className="pb-review-boneyard" aria-hidden="true">
      {/* Left: Lightbox Gallery Stage Skeleton */}
      <div className="pb-review-boneyard-gallery">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="pb-boneyard-bone" style={{ width: 160, height: 22, borderRadius: 6 }} />
          <div className="pb-boneyard-bone" style={{ width: 80, height: 20, borderRadius: 999 }} />
        </div>
        <div className="pb-review-boneyard-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="pb-boneyard-bone pb-review-boneyard-thumb" />
          ))}
        </div>
      </div>

      {/* Right: Order Summary Skeleton */}
      <div className="pb-review-boneyard-summary">
        <div className="pb-boneyard-bone" style={{ width: 140, height: 22, borderRadius: 6 }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
            <div className="pb-boneyard-bone" style={{ width: '40%', height: 13, borderRadius: 4 }} />
            <div className="pb-boneyard-bone" style={{ width: '85%', height: 16, borderRadius: 6 }} />
          </div>
        ))}
        <div className="pb-boneyard-bone" style={{ width: '100%', height: 46, borderRadius: 14, marginTop: 12 }} />
      </div>
    </div>
  )
}

// ── 4. Payment Page Boneyard ──
export function PaymentBoneyardFallback() {
  return (
    <div className="pb-payment-boneyard" aria-hidden="true">
      <div className="pb-boneyard-bone" style={{ width: 130, height: 26, borderRadius: 999 }} />
      <div className="pb-boneyard-bone" style={{ width: 190, height: 32, borderRadius: 8 }} />
      <div className="pb-boneyard-bone pb-payment-boneyard-qr" />
      <div className="pb-boneyard-bone" style={{ width: '70%', height: 18, borderRadius: 6 }} />
      <div className="pb-boneyard-bone" style={{ width: '90%', height: 46, borderRadius: 14, marginTop: 8 }} />
    </div>
  )
}

// ── 5. Status Page Boneyard ──
export function StatusPageBoneyardFallback() {
  return (
    <div className="pb-status-boneyard" aria-hidden="true">
      <div className="pb-boneyard-bone pb-status-boneyard-ring" />
      <div className="pb-boneyard-bone" style={{ width: 180, height: 24, borderRadius: 8 }} />
      <div className="pb-boneyard-bone" style={{ width: 260, height: 16, borderRadius: 6 }} />
      <div style={{ width: '100%', display: 'flex', gap: 12, marginTop: 8 }}>
        <div className="pb-boneyard-bone" style={{ flex: 1, height: 72, borderRadius: 16 }} />
        <div className="pb-boneyard-bone" style={{ flex: 1, height: 72, borderRadius: 16 }} />
      </div>
    </div>
  )
}

// ── 6. Confirm / Inspection Doc Pages Boneyard ──
export function ConfirmDocPagesBoneyardFallback({ count = 4 }: { count?: number }) {
  return (
    <div className="pb-review-boneyard-grid" style={{ padding: '20px', width: '100%', boxSizing: 'border-box' }} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="pb-boneyard-bone pb-review-boneyard-thumb" />
      ))}
    </div>
  )
}

// ── 7. Advanced Print Modal Sheet Preview Boneyard ──
export function SheetPreviewBoneyardFallback() {
  return (
    <div className="pb-sheet-boneyard-mock" aria-hidden="true">
      <div className="pb-boneyard-bone" style={{ width: '40%', height: 16, borderRadius: 4, marginBottom: 12 }} />
      <div className="pb-boneyard-bone" style={{ width: '90%', height: 10, borderRadius: 3, marginBottom: 8 }} />
      <div className="pb-boneyard-bone" style={{ width: '80%', height: 10, borderRadius: 3, marginBottom: 8 }} />
      <div className="pb-boneyard-bone" style={{ width: '85%', height: 10, borderRadius: 3, marginBottom: 16 }} />
      <div className="pb-boneyard-bone" style={{ width: '100%', height: 110, borderRadius: 8, marginBottom: 16 }} />
      <div className="pb-boneyard-bone" style={{ width: '95%', height: 10, borderRadius: 3, marginBottom: 8 }} />
      <div className="pb-boneyard-bone" style={{ width: '70%', height: 10, borderRadius: 3 }} />
    </div>
  )
}

// ── 8. Upload / Extraction Boneyard ──
export function UploadDropzoneBoneyardFallback() {
  return (
    <div className="pb-upload-boneyard" aria-hidden="true">
      <div className="pb-boneyard-bone" style={{ width: 44, height: 44, borderRadius: '50%', marginBottom: 14 }} />
      <div className="pb-boneyard-bone" style={{ width: '52%', height: 18, borderRadius: 6, marginBottom: 8 }} />
      <div className="pb-boneyard-bone" style={{ width: '38%', height: 13, borderRadius: 4, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="pb-boneyard-bone" style={{ width: 72, height: 100, borderRadius: 8 }} />
        <div className="pb-boneyard-bone" style={{ width: 72, height: 100, borderRadius: 8 }} />
      </div>
    </div>
  )
}
