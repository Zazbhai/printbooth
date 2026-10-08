import { useRef, useEffect } from 'react'
import {
  Printer,
  Layers,
  Zap,
  Monitor,
  ShieldCheck,
  Wifi,
} from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { animateTechIn, showAllImmediately } from '../../animations/landingAnimations'

interface TechModule {
  id: string
  title: string
  spec: string
  tag: string
  icon: typeof Printer
}

const leftModules: TechModule[] = [
  {
    id: '01',
    title: 'Commercial Laser Engine',
    spec: 'Heavy-duty 45 PPM thermal print core delivering crisp, smudge-proof documents',
    tag: '1200 × 1200 DPI Laser',
    icon: Printer,
  },
  {
    id: '02',
    title: '500-Sheet Paper Tray',
    spec: 'Motorized auto-centering cassette supporting standard A4 and Letter sizes',
    tag: 'Anti-Jam Optical Sensors',
    icon: Layers,
  },
  {
    id: '03',
    title: 'Uninterruptible Power Backup',
    spec: 'Integrated battery backup ensures print jobs finish safely even during power cuts',
    tag: '15-Minute Power Buffer',
    icon: Zap,
  },
]

const rightModules: TechModule[] = [
  {
    id: '04',
    title: '10.1″ Touchscreen Display',
    spec: 'Anti-glare industrial glass display designed for fast, simple on-kiosk operation',
    tag: 'Scratch & Water Resistant',
    icon: Monitor,
  },
  {
    id: '05',
    title: 'Secure Document Processor',
    spec: 'Private in-memory printing engine that automatically wipes files once printed',
    tag: 'Zero Data Stored',
    icon: ShieldCheck,
  },
  {
    id: '06',
    title: 'Smart Cloud Connectivity',
    spec: 'High-speed Wi-Fi and Ethernet LAN connection for instant document reception from your phone',
    tag: 'Instant Mobile Sync',
    icon: Wifi,
  },
]

interface TechnologySectionProps {
  isActive?: boolean
}

export default function TechnologySection({ isActive = false }: TechnologySectionProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!sectionRef.current) return

    if (reducedMotion) {
      showAllImmediately(sectionRef.current, ['.tech-eyebrow', '.tech-heading', '.tech-sub', '.tech-component'])
      return
    }

    if (isActive) {
      animateTechIn(sectionRef.current)
    }
  }, [isActive, reducedMotion])

  return (
    <section ref={sectionRef} className="landing-tech" id="technology" aria-labelledby="tech-heading">
      <div className="tech-container">

        {/* Section Header: positioned safely below floating navbar */}
        <header className="tech-header-compact">
          <h2 className="tech-heading" id="tech-heading">
            Inside the <span className="tech-heading-accent">kiosk.</span>
          </h2>
          <p className="tech-sub">
            Commercial-grade hardware engineered for non-stop, high-quality printing every day.
          </p>
        </header>

        {/* Distributed 3-Column Stage: Left Flank · Center 3D Space · Right Flank */}
        <div className="tech-stage-grid">

          {/* Left Flank: Print & Paper modules */}
          <div className="tech-flank tech-flank--left" aria-label="Print engine and paper feed">
            <div className="tech-flank__label">
              <span>PRINT ENGINE &amp; FEED</span>
              <span className="tech-flank__line" aria-hidden="true" />
            </div>

            <div className="tech-flank__list">
              {leftModules.map((m, i) => {
                const ItemIcon = m.icon
                return (
                  <div
                    key={m.id}
                    className="tech-item tech-component"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="tech-item__badge-wrap">
                      <span className="tech-item__num" aria-hidden="true">
                        <ItemIcon className="tech-item__icon" size={20} />
                      </span>
                    </div>
                    <h3 className="tech-item__title">{m.title}</h3>
                    <p className="tech-item__spec">{m.spec}</p>
                    <span className="tech-item__tag">{m.tag}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Flank: Display & Connectivity modules */}
          <div className="tech-flank tech-flank--right" aria-label="Touchscreen and cloud connectivity">
            <div className="tech-flank__label">
              <span>DISPLAY &amp; CONNECTIVITY</span>
              <span className="tech-flank__line" aria-hidden="true" />
            </div>

            <div className="tech-flank__list">
              {rightModules.map((m, i) => {
                const ItemIcon = m.icon
                return (
                  <div
                    key={m.id}
                    className="tech-item tech-component"
                    style={{ animationDelay: `${(i + 3) * 60}ms` }}
                  >
                    <div className="tech-item__badge-wrap">
                      <span className="tech-item__num" aria-hidden="true">
                        <ItemIcon className="tech-item__icon" size={20} />
                      </span>
                    </div>
                    <h3 className="tech-item__title">{m.title}</h3>
                    <p className="tech-item__spec">{m.spec}</p>
                    <span className="tech-item__tag">{m.tag}</span>
                  </div>
                )
              })}
            </div>
          </div>

        </div>

      </div>
    </section>
  )
}
