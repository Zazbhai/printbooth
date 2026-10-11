import {
  Lightning,
  ShieldCheck,
  Printer,
  Clock,
  CurrencyInr,
  UploadSimple,
  DeviceMobile,
  GlobeHemisphereWest,
} from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { ArrowRight } from '@phosphor-icons/react'
import { Skeleton } from 'boneyard-js/react'
import { usePageSkeleton } from '../hooks/usePageSkeleton'
import { FeaturesSkeletonFallback } from '../components/ui/PageSkeletonFallback'
import SEO from '../components/common/SEO'
import './SubPage.css'

const features = [
  {
    icon: UploadSimple,
    title: 'Multiple Upload Methods',
    desc: 'Upload via the website, your phone using a session QR code, or a USB drive at the kiosk.',
    tag: 'Upload',
  },
  {
    icon: CurrencyInr,
    title: 'UPI Payments',
    desc: 'Pay with any UPI app in seconds. Payment is verified server-side before printing begins.',
    tag: 'Payment',
  },
  {
    icon: Printer,
    title: 'Automatic Printing',
    desc: 'Documents print automatically once payment is confirmed. No staff required at any point.',
    tag: 'Automation',
  },
  {
    icon: Clock,
    title: 'Real-time Status',
    desc: 'Track your print job status in real time via WebSocket updates on any device.',
    tag: 'Live',
  },
  {
    icon: ShieldCheck,
    title: 'Secure File Handling',
    desc: 'Files are virus-scanned, stored with internal IDs, and deleted automatically after collection.',
    tag: 'Security',
  },
  {
    icon: Lightning,
    title: 'Under Two Minutes',
    desc: 'From upload to printed page in under two minutes on average — faster than any print shop.',
    tag: 'Speed',
  },
  {
    icon: DeviceMobile,
    title: 'No App Required',
    desc: 'The full print workflow works from any modern browser on any device — no downloads needed.',
    tag: 'Accessibility',
  },
  {
    icon: GlobeHemisphereWest,
    title: 'No Account Needed',
    desc: 'Print without registering. Receive an order ID and track your job anonymously.',
    tag: 'Privacy',
  },
]

export default function FeaturesPage() {
  const loading = usePageSkeleton(450)

  return (
    <Skeleton
      name="features-page"
      loading={loading}
      animate="shimmer"
      color="rgba(163, 177, 198, 0.40)"
      darkColor="rgba(255, 255, 255, 0.08)"
      transition={300}
      fallback={<FeaturesSkeletonFallback />}
    >
      <SEO
        title="Features & Architecture — Fast, Private Autonomous Printing | PrintBooth"
        description="Discover PrintBooth's autonomous printing hardware features. Zero cloud file retention, virus-scanning, instant UPI payments, and sub-90-second automated hardware dispensing."
        canonicalUrl="https://printbooth.co.in/features"
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Features', url: '/features' },
        ]}
      />
      <div className="sub-page">
        {/* Hero */}
        <div className="sub-hero">
          <div className="container">
            <div className="sub-hero__inner">
              <span className="sub-hero__eyebrow">
                <span className="sub-hero__eyebrow-dot" />
                Features
              </span>
              <h1 className="sub-hero__title">
                Built different from a{' '}
                <span className="sub-hero__title-accent">print shop</span>
              </h1>
              <p className="sub-hero__sub">
                No accounts. No queues. No counters. Just upload, pay, and collect — in under two minutes.
              </p>
            </div>
          </div>
        </div>

        <div className="container sub-content">
          {/* Feature grid */}
          <div className="neo-features-grid">
            {features.map(f => {
              const Icon = f.icon
              return (
                <div key={f.title} className="neo-card neo-feature-card">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div className="neo-icon-badge">
                      <Icon size={22} weight="duotone" />
                    </div>
                    <span className="neo-pill" style={{ fontSize: 10, letterSpacing: '0.08em' }}>
                      {f.tag}
                    </span>
                  </div>
                  <h2 className="neo-feature-card__title">{f.title}</h2>
                  <p className="neo-feature-card__desc">{f.desc}</p>
                </div>
              )
            })}
          </div>

          {/* CTA */}
          <div className="neo-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: 17, color: 'var(--neo-text-1)', marginBottom: 6 }}>
                Ready to try it yourself?
              </p>
              <p style={{ fontSize: 14, color: 'var(--neo-text-3)' }}>
                No account required. Find a kiosk near you and print in under 2 minutes.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link to="/print" className="neo-btn neo-btn-primary" id="features-start-printing">
                Start Printing
                <ArrowRight size={16} weight="bold" />
              </Link>
              <Link to="/how-it-works" className="neo-btn">
                How It Works
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Skeleton>
  )
}
