import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle, Info } from '@phosphor-icons/react'
import { Skeleton } from 'boneyard-js/react'
import { usePageSkeleton } from '../hooks/usePageSkeleton'
import { PricingSkeletonFallback } from '../components/ui/PageSkeletonFallback'
import SEO from '../components/common/SEO'
import './SubPage.css'

const priceTable = [
  { paperSize: 'A4', colour: 'Black & White', sides: 'Single-sided', price: '₹2', unit: 'per page', highlight: false },
  { paperSize: 'A4', colour: 'Black & White', sides: 'Double-sided', price: '₹3', unit: 'per page', highlight: false },
  { paperSize: 'A4', colour: 'Colour', sides: 'Single-sided', price: '₹8', unit: 'per page', highlight: true },
  { paperSize: 'A4', colour: 'Colour', sides: 'Double-sided', price: '₹12', unit: 'per page', highlight: true },
]

const inclusions = [
  'No setup fees or subscriptions',
  'Pay per page — only for what you print',
  'UPI payment accepted (GPay, PhonePe, Paytm, BHIM)',
  'Price shown before you pay — no surprises',
  'Server-side price calculation — tamper-proof',
]

export default function PricingPage() {
  const loading = usePageSkeleton(450)

  return (
    <Skeleton
      name="pricing-page"
      loading={loading}
      animate="shimmer"
      color="rgba(163, 177, 198, 0.40)"
      darkColor="rgba(255, 255, 255, 0.08)"
      transition={300}
      fallback={<PricingSkeletonFallback />}
    >
      <SEO
        title="Transparent Per-Page Printing Rates — Starting at ₹2 | PrintBooth"
        description="Affordable, transparent per-page printing pricing at PrintBooth kiosks. A4 Black & White starting at ₹2/page, Color at ₹8/page. No subscriptions or hidden fees."
        canonicalUrl="https://printbooth.in/pricing"
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Pricing', url: '/pricing' },
        ]}
      />
      <div className="sub-page">
      {/* Hero */}
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner">
            <span className="sub-hero__eyebrow">
              <span className="sub-hero__eyebrow-dot" />
              Pricing
            </span>
            <h1 className="sub-hero__title">
              Simple,{' '}
              <span className="sub-hero__title-accent">per-page</span> pricing
            </h1>
            <p className="sub-hero__sub">
              Pay only for what you print. No setup fees. No subscriptions. No hidden charges.
            </p>
          </div>
        </div>
      </div>

      <div className="container sub-content">
        {/* Quick stats */}
        <div className="neo-stats">
          <div className="neo-stat">
            <span className="neo-stat__value">₹2</span>
            <span className="neo-stat__label">B&W Single-sided</span>
          </div>
          <div className="neo-stat">
            <span className="neo-stat__value">₹3</span>
            <span className="neo-stat__label">B&W Double-sided</span>
          </div>
          <div className="neo-stat">
            <span className="neo-stat__value">₹8</span>
            <span className="neo-stat__label">Colour Single-sided</span>
          </div>
          <div className="neo-stat">
            <span className="neo-stat__value">₹12</span>
            <span className="neo-stat__label">Colour Double-sided</span>
          </div>
        </div>

        {/* Price table */}
        <div>
          <h2 className="sub-heading">Price List</h2>
          <div className="neo-table-wrap">
            <table className="neo-table" aria-label="Printing prices">
              <thead>
                <tr>
                  <th>Paper</th>
                  <th>Colour Mode</th>
                  <th>Sides</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {priceTable.map((row, i) => (
                  <tr key={i}>
                    <td>{row.paperSize}</td>
                    <td>{row.colour}</td>
                    <td>{row.sides}</td>
                    <td>
                      <span style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: 800,
                        fontSize: 18,
                        color: 'var(--neo-accent)',
                      }}>
                        {row.price}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--neo-text-4)', marginLeft: 4 }}>
                        {row.unit}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inclusions + Notes side by side */}
        <div className="neo-pricing-grid">
          {/* What's included */}
          <div className="neo-card">
            <h3 style={{ fontWeight: 700, fontSize: 16, color: 'var(--neo-text-1)', marginBottom: 16 }}>
              What's included
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {inclusions.map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <CheckCircle size={16} weight="fill" style={{ color: 'var(--neo-success)', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 14, color: 'var(--neo-text-3)', lineHeight: 1.6 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="neo-card">
            <h3 style={{ fontWeight: 700, fontSize: 16, color: 'var(--neo-text-1)', marginBottom: 16 }}>
              Notes
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                'Prices displayed here are estimates. Final amount is calculated server-side before payment.',
                'Prices may vary slightly between kiosk locations.',
                'Prices are subject to change — check before printing.',
                'Payment must be made in full before printing begins.',
              ].map(note => (
                <div key={note} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Info size={15} style={{ color: 'var(--neo-info)', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 13, color: 'var(--neo-text-3)', lineHeight: 1.65 }}>{note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to="/print" className="neo-btn neo-btn-primary neo-btn-lg" id="pricing-start-printing">
            Start Printing
            <ArrowRight size={18} weight="bold" />
          </Link>
          <Link to="/faq" className="neo-btn neo-btn-lg">
            Pricing FAQ
          </Link>
        </div>
      </div>
    </div>
    </Skeleton>
  )
}
