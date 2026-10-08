import { useRef, useEffect, useState } from 'react'
import {
  Lightning,
  ShieldCheck,
  QrCode,
  Printer,
  Storefront,
  ChartLineUp,
  Plug,
  Wrench,
  CheckCircle,
} from '@phosphor-icons/react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import ShimmerButton from '../ui/ShimmerButton'

interface FinalCTAProps {
  isActive?: boolean
}

export default function FinalCTA({ isActive = false }: FinalCTAProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const reducedMotion = useReducedMotion()
  const [activeTab, setActiveTab] = useState<'user' | 'partner'>('user')
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const handleCardTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleCardTouchEnd = (e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].clientX
    const dy = touchStartY.current - e.changedTouches[0].clientY
    if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      if (dx > 0) {
        setActiveTab('partner')
      } else {
        setActiveTab('user')
      }
    }
  }

  useEffect(() => {
    if (!sectionRef.current) return
    const container = sectionRef.current

    if (reducedMotion) {
      container
        .querySelectorAll<HTMLElement>('.final-launch-header, .final-bento-card, .final-trust-strip')
        .forEach((el) => {
          el.style.opacity = '1'
          el.style.transform = 'none'
        })
      return
    }

    if (isActive) {
      container
        .querySelectorAll<HTMLElement>('.final-launch-header, .final-bento-card, .final-trust-strip')
        .forEach((el) => {
          el.style.opacity = ''
          el.style.transform = ''
        })
    }
  }, [isActive, reducedMotion])

  return (
    <section ref={sectionRef} className="landing-final" aria-label="PrintBooth Network Launchpad">
      <div className="final-launch-container">
        {/* Section Header */}
        <div className="final-launch-header">

          <h2 className="final-launch-title">
            Printing Re-Engineered. <span className="final-launch-title-accent">Zero Queues.</span>
          </h2>

          <p className="final-launch-subtitle">
            Walk up to any active PrintBooth terminal. Upload in your browser, scan UPI, and collect laser prints in under 90 seconds. No apps, no accounts, zero cloud storage.
          </p>
        </div>

        {/* Mobile Audience Segmented Control */}
        <div className="final-mobile-tabs" role="tablist" aria-label="Choose Experience">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'user'}
            className={`final-mobile-tab ${activeTab === 'user' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('user')}
          >
            <Printer size={13} weight={activeTab === 'user' ? 'fill' : 'bold'} />
            <span>Express Print</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'partner'}
            className={`final-mobile-tab ${activeTab === 'partner' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('partner')}
          >
            <Storefront size={13} weight={activeTab === 'partner' ? 'fill' : 'bold'} />
            <span>Host a Kiosk</span>
          </button>
        </div>

        {/* Dual Journey Bento Grid */}
        <div
          className="final-bento-grid"
          data-active-tab={activeTab}
          onTouchStart={handleCardTouchStart}
          onTouchEnd={handleCardTouchEnd}
        >
          {/* Bento 1: Customer Instant Walk-Up Print */}
          <div className="final-bento-card">
            <div className="final-bento-pill user">
              <Printer size={12} weight="bold" />
              <span>Express Print</span>
            </div>

            <h3 className="final-bento-title">Need Documents Right Now?</h3>
            <p className="final-bento-desc">
              Upload PDF, DOCX, or photos directly from your phone. Instant QR checkout and automatic laser dispense.
            </p>

            <div className="final-bento-features">
              <div className="final-bento-feat">
                <Lightning size={14} weight="fill" />
                <span>&lt; 90s Turnaround</span>
              </div>
              <div className="final-bento-feat">
                <ShieldCheck size={14} weight="fill" />
                <span>100% Client-Side Wipe</span>
              </div>
              <div className="final-bento-feat">
                <QrCode size={14} weight="fill" />
                <span>Instant UPI &amp; GPay</span>
              </div>
              <div className="final-bento-feat">
                <Printer size={14} weight="fill" />
                <span>1200 DPI Laser Engine</span>
              </div>
            </div>

            <div className="final-bento-btn-wrap">
              <ShimmerButton
                to="/print"
                variant="primary"
                id="final-start-printing"
              >
                <span>Start Printing Now</span>
                <span className="btn-icon">→</span>
              </ShimmerButton>
            </div>
          </div>

          {/* Bento 2: Franchise & Campus Host Partner */}
          <div className="final-bento-card partner">
            <div className="final-bento-pill partner">
              <Storefront size={12} weight="bold" />
              <span>Host a Station</span>
            </div>

            <h3 className="final-bento-title">Monetize Campus Foot Traffic</h3>
            <p className="final-bento-desc">
              Turn 4 sq. ft. of unused lobby or canteen floor into autonomous monthly revenue with zero maintenance burden.
            </p>

            <div className="final-bento-features">
              <div className="final-bento-feat">
                <ChartLineUp size={14} weight="fill" />
                <span>65%+ Profit Margin</span>
              </div>
              <div className="final-bento-feat">
                <Plug size={14} weight="fill" />
                <span>1 Standard 220V Socket</span>
              </div>
              <div className="final-bento-feat">
                <CheckCircle size={14} weight="fill" />
                <span>Real-Time Fleet Ledger</span>
              </div>
              <div className="final-bento-feat">
                <Wrench size={14} weight="fill" />
                <span>Automated Refill Supply</span>
              </div>
            </div>

            <div className="final-bento-meta-badge">
              <Lightning size={13} weight="fill" color="#dc2626" />
              <span>Ideal for Universities, Libraries, Hostels &amp; Cafes</span>
            </div>

            <div className="final-bento-btn-wrap">
              <ShimmerButton
                to="/request-installation"
                variant="ghost"
                id="final-host-kiosk"
              >
                <span>Host a Kiosk</span>
                <span className="btn-icon">→</span>
              </ShimmerButton>
            </div>
          </div>
        </div>

        {/* Mobile Carousel Indicators */}
        <div className="final-mobile-card-dots" aria-hidden="true">
          <button
            type="button"
            className={`final-dot ${activeTab === 'user' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('user')}
            aria-label="View Express Print"
          />
          <button
            type="button"
            className={`final-dot ${activeTab === 'partner' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('partner')}
            aria-label="View Host a Kiosk"
          />
        </div>

        {/* Live Trust Metrics Bar */}
        <div className="final-trust-strip">
          <div className="final-trust-item">
            <Lightning size={14} weight="fill" />
            <span>&lt; 90s Avg Speed</span>
          </div>
          <span>·</span>
          <div className="final-trust-item">
            <ShieldCheck size={14} weight="fill" />
            <span>0 Bytes Cloud Retention</span>
          </div>
        </div>
      </div>
    </section>
  )
}
