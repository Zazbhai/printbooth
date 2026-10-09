import { useRef, useEffect } from 'react'
import { Printer, Smartphone, QrCode, ShieldCheck } from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { animateProductIn, showAllImmediately } from '../../animations/landingAnimations'
import ScrambleText from '../ui/ScrambleText'

interface ProductSpec {
  id: string
  title: string
  spec: string
  status: string
  icon: typeof Printer
}

const specs: ProductSpec[] = [
  { id: '01', title: 'High-Speed Laser Printing', spec: 'Crisp 1200 DPI double-sided prints at 45 pages per minute', status: 'High-Volume', icon: Printer },
  { id: '02', title: 'Instant Mobile Printing', spec: 'Scan QR with your phone, upload any document — zero app downloads', status: 'Touch-Free', icon: Smartphone },
  { id: '03', title: 'Instant UPI Payments', spec: 'Fast payment confirmation with GPay, PhonePe, Paytm, or BHIM', status: 'Cashless', icon: QrCode },
  { id: '04', title: 'Complete Privacy & Security', spec: 'Files are processed securely and automatically deleted after printing', status: '100% Private', icon: ShieldCheck },
]

interface ProductIntroProps {
  isActive?: boolean
}

export default function ProductIntro({ isActive = false }: ProductIntroProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!sectionRef.current) return

    if (reducedMotion) {
      showAllImmediately(sectionRef.current, ['.product-eyebrow', '.product-heading', '.product-sub', '.product-spec-card'])
      return
    }

    if (isActive) {
      animateProductIn(sectionRef.current)
    }
  }, [isActive, reducedMotion])

  return (
    <section ref={sectionRef} className="landing-product" id="product-intro" aria-labelledby="product-heading">
      <div className="landing-container product-layout-container">
        <div className="product-content-left">

          <h2 className="product-heading" id="product-heading">
            The modern{' '}
            <span className="product-heading-accent">
              <ScrambleText text="self-service" delay={250} duration={650} />
            </span>{' '}
            printing kiosk.
          </h2>

          <p className="product-sub">
            Built for college campuses, libraries, residential societies, and transit hubs. Fast, reliable, and completely touchless.
          </p>

          {/* Clean Feature Grid */}
          <div className="product-specs-grid">
            {specs.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.id} className="product-spec-card">
                  <div className="spec-card-header">
                    <div className="spec-id-wrap">
                      <span className="spec-id" aria-hidden="true">
                        <Icon className="spec-icon" size={15} />
                      </span>
                    </div>
                    <span className="spec-status">{item.status}</span>
                  </div>
                  <div className="spec-title">{item.title}</div>
                  <div className="spec-detail">{item.spec}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Empty right column anchor so the 3D model sits proudly unobstructed */}
        <div className="product-stage-spacer" aria-hidden="true" />
      </div>
    </section>
  )
}
