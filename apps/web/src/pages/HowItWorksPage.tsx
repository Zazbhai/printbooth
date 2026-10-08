import { Link } from 'react-router-dom'
import {
  ArrowRight,
  UploadSimple,
  SlidersHorizontal,
  CurrencyInr,
  Printer,
  Package,
} from '@phosphor-icons/react'
import { Skeleton } from 'boneyard-js/react'
import { usePageSkeleton } from '../hooks/usePageSkeleton'
import { HowItWorksSkeletonFallback } from '../components/ui/PageSkeletonFallback'
import SEO from '../components/common/SEO'
import './SubPage.css'

const steps = [
  {
    icon: UploadSimple,
    number: '01',
    title: 'Upload Your Document',
    body: 'Upload your document from your phone, the website, or a USB drive. PDF is the primary supported format. Your file is validated, virus-scanned, and stored securely with a short retention window.',
  },
  {
    icon: SlidersHorizontal,
    number: '02',
    title: 'Select & Customise',
    body: 'Choose a nearby PrintBooth location. Then configure your print settings: paper size, colour mode, duplex, page range, and number of copies.',
  },
  {
    icon: CurrencyInr,
    number: '03',
    title: 'Pay with UPI',
    body: 'Scan the QR code with any UPI-supported app — GPay, PhonePe, Paytm, and more. Payment is verified by our server via a secure webhook. The frontend never confirms payment.',
  },
  {
    icon: Printer,
    number: '04',
    title: 'Automatic Printing',
    body: 'Once payment is confirmed, your document is sent to the PrintBooth automatically. CUPS manages the print queue. You can track the job status in real time.',
  },
  {
    icon: Package,
    number: '05',
    title: 'Collect Your Prints',
    body: 'Collect your printed document from the output tray. You will be notified on-screen when printing is complete. Your document file is queued for deletion.',
  },
]

export default function HowItWorksPage() {
  const loading = usePageSkeleton(450)

  return (
    <Skeleton
      name="how-it-works-page"
      loading={loading}
      animate="shimmer"
      color="rgba(163, 177, 198, 0.40)"
      darkColor="rgba(255, 255, 255, 0.08)"
      transition={300}
      fallback={<HowItWorksSkeletonFallback />}
    >
      <SEO
        title="How It Works — Fast, Autonomous Self-Service Printing | PrintBooth"
        description="Learn how to print documents at a PrintBooth kiosk in 5 simple steps. Upload your file, configure settings, scan UPI QR, and collect your prints in under 2 minutes."
        canonicalUrl="https://printbooth.in/how-it-works"
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'How It Works', url: '/how-it-works' },
        ]}
      />
      <div className="sub-page">
      {/* Hero */}
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner">
            <span className="sub-hero__eyebrow">
              <span className="sub-hero__eyebrow-dot" />
              How It Works
            </span>
            <h1 className="sub-hero__title">
              Upload. Pay.{' '}
              <span className="sub-hero__title-accent">Print.</span>
            </h1>
            <p className="sub-hero__sub">
              From upload to printed page in under two minutes — without accounts, queues or counters.
            </p>
          </div>
        </div>
      </div>

      <div className="container sub-content">
        {/* Steps */}
        <div className="neo-hiw-steps">
          {steps.map((step, i) => {
            const Icon = step.icon
            return (
              <div key={step.number} className="neo-hiw-step animate-fadeInUp" style={{ animationDelay: `${i * 0.08}s` }}>
                {/* Left: number + connector */}
                <div className="neo-hiw-step__left">
                  <div className="neo-hiw-step__num">{step.number}</div>
                  {i < steps.length - 1 && <div className="neo-hiw-step__line" />}
                </div>
                {/* Right: content */}
                <div className="neo-hiw-step__card neo-card">
                  <div className="neo-hiw-step__icon-wrap neo-icon-badge">
                    <Icon size={22} weight="duotone" />
                  </div>
                  <div>
                    <h2 className="neo-hiw-step__title">{step.title}</h2>
                    <p className="neo-hiw-step__body">{step.body}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to="/print" className="neo-btn neo-btn-primary neo-btn-lg" id="hiw-start-printing">
            Start Printing
            <ArrowRight size={18} weight="bold" />
          </Link>
          <Link to="/locations" className="neo-btn neo-btn-lg" id="hiw-find-location">
            Find a Location
          </Link>
        </div>
      </div>
    </div>
    </Skeleton>
  )
}
