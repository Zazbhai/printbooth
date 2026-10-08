import { useRef, useEffect } from 'react'
import {
  UploadCloud,
  SlidersHorizontal,
  QrCode,
  KeyRound,
  FileCheck2,
  Check,
} from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { animateWorkflowIn, showAllImmediately } from '../../animations/landingAnimations'

interface HowItWorksProps {
  isActive?: boolean
}

interface StepItem {
  id: string
  title: string
  desc: string
  pos: 'up' | 'down'
  side: 'left' | 'right'
  slotType: 'upload' | 'custom' | 'pay' | 'pin' | 'dispense'
  icon: typeof UploadCloud
}

const steps: StepItem[] = [
  {
    id: '01',
    title: 'Upload Document',
    desc: 'Scan QR & upload PDF or photos directly from phone',
    pos: 'up',
    side: 'left',
    slotType: 'upload',
    icon: UploadCloud,
  },
  {
    id: '02',
    title: 'Customize',
    desc: 'Select B&W or Color, duplex & page ranges',
    pos: 'down',
    side: 'right',
    slotType: 'custom',
    icon: SlidersHorizontal,
  },
  {
    id: '03',
    title: 'Pay via UPI',
    desc: 'Instant QR payment via GPay, PhonePe or Paytm',
    pos: 'up',
    side: 'left',
    slotType: 'pay',
    icon: QrCode,
  },
  {
    id: '04',
    title: 'Enter PIN',
    desc: 'Type your secure 4-digit code on the kiosk screen',
    pos: 'down',
    side: 'right',
    slotType: 'pin',
    icon: KeyRound,
  },
  {
    id: '05',
    title: 'Collect Print',
    desc: 'Laser-sharp print dispensed in under 15 seconds',
    pos: 'up',
    side: 'left',
    slotType: 'dispense',
    icon: FileCheck2,
  },
]

export default function HowItWorks({ isActive = false }: HowItWorksProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!sectionRef.current) return

    if (reducedMotion) {
      showAllImmediately(sectionRef.current, [
        '.workflow-header',
        '.roadmap-spine',
        '.roadmap-step-card',
      ])
      return
    }

    if (isActive) {
      animateWorkflowIn(sectionRef.current)
    }
  }, [isActive, reducedMotion])

  const renderVisualSlot = (slotType: StepItem['slotType']) => {
    switch (slotType) {
      case 'upload':
        return (
          <div className="step-visual-slot step-visual-slot--upload" aria-hidden="true">
            <div className="clean-upload-sheet">
              <span className="clean-scan-sweep" />
              <span className="clean-sheet-notch" />
              <div className="clean-sheet-lines">
                <span className="c-line" />
                <span className="c-line c-line--mid" />
              </div>
            </div>
          </div>
        )
      case 'custom':
        return (
          <div className="step-visual-slot step-visual-slot--custom" aria-hidden="true">
            <div className="clean-duplex-wireframe">
              <div className="wireframe-page wireframe-page--back" />
              <div className="wireframe-page wireframe-page--front" />
            </div>
            <div className="clean-cmyk-palette">
              <span className="cmyk-dot dot--c" />
              <span className="cmyk-dot dot--m" />
              <span className="cmyk-dot dot--y" />
              <span className="cmyk-dot dot--k" />
            </div>
          </div>
        )
      case 'pay':
        return (
          <div className="step-visual-slot step-visual-slot--pay" aria-hidden="true">
            <div className="clean-qr-scanner">
              <span className="qr-reticle-corner corner--tl" />
              <span className="qr-reticle-corner corner--tr" />
              <span className="qr-reticle-corner corner--bl" />
              <span className="qr-reticle-corner corner--br" />
              <span className="qr-laser-sweep-line" />
              <svg className="clean-qr-glyph" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                <rect x="3" y="3" width="6" height="6" rx="1" />
                <rect x="15" y="3" width="6" height="6" rx="1" />
                <rect x="3" y="15" width="6" height="6" rx="1" />
                <circle cx="17" cy="17" r="1.5" fill="#dc2626" />
              </svg>
            </div>
          </div>
        )
      case 'pin':
        return (
          <div className="step-visual-slot step-visual-slot--pin" aria-hidden="true">
            <div className="clean-otp-pods">
              <span className="otp-digit filled"><span className="digit-core" /></span>
              <span className="otp-digit filled"><span className="digit-core" /></span>
              <span className="otp-digit filled"><span className="digit-core" /></span>
              <span className="otp-digit active"><span className="digit-cursor" /></span>
            </div>
          </div>
        )
      case 'dispense':
        return (
          <div className="step-visual-slot step-visual-slot--dispense" aria-hidden="true">
            <div className="clean-dispenser-bay">
              <span className="bay-aperture-line" />
              <div className="clean-paper-sheet">
                <span className="sheet-watermark" />
              </div>
              <span className="clean-check-icon">
                <Check size={14} strokeWidth={2.8} />
              </span>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <section
      ref={sectionRef}
      className="landing-how"
      id="how-it-works"
      aria-labelledby="how-heading"
    >
      <div className="roadmap-container">
        {/* Clean Single Header with Badge */}
        <div className="workflow-header">
          <h2 className="workflow-title" id="how-heading">
            How It <span className="workflow-title-accent">Works.</span>
          </h2>
          <p className="workflow-subtitle">
            From mobile upload to physical document in hand in under 90 seconds.
          </p>
        </div>

        {/* Seamless Roadmap Stage */}
        <div className="roadmap-glass-stage" role="region" aria-label="Five-Step Process Timeline">
          <div className="roadmap-ambient-glow" aria-hidden="true" />

          <div className="roadmap-timeline">
            {/* Center Horizontal Laser Spine (Desktop) */}
            <div className="roadmap-spine roadmap-spine--desktop" aria-hidden="true">
              <div className="roadmap-rail" />
              <div className="roadmap-laser-glow" />
              {!reducedMotion && <div className="roadmap-photon" />}
            </div>

            {/* Center Vertical Laser Spine (Mobile) */}
            <div className="roadmap-spine roadmap-spine--mobile" aria-hidden="true">
              <div className="roadmap-rail-vertical" />
              <div className="roadmap-laser-glow-vertical" />
              {!reducedMotion && <div className="roadmap-photon-vertical" />}
            </div>

            <div className="roadmap-steps-layout">
              {steps.map((step) => {
                const StepIcon = step.icon
                return (
                  <article
                    key={step.id}
                    className={`roadmap-step-card step-pos--${step.pos} step-side--${step.side}`}
                    tabIndex={0}
                  >
                    <div className="roadmap-node-marker" aria-hidden="true">
                      <span className="roadmap-node-circle">
                        <StepIcon className="roadmap-node-icon" size={13} />
                      </span>
                    </div>
                    <span className="roadmap-stem-beam" aria-hidden="true" />
                    <div className="roadmap-card-glass">
                      <div className="step-card-text">
                        <div className="step-title-row">
                          <StepIcon className="step-title-icon" size={15} />
                          <h3 className="step-main-title">{step.title}</h3>
                        </div>
                        <p className="step-desc">{step.desc}</p>
                      </div>
                      {renderVisualSlot(step.slotType)}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
