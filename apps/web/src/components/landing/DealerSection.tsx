import { useRef, useEffect } from 'react'
import { Coins, Maximize2, Wrench, ArrowUpRight, Mail } from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { animateDealerIn, showAllImmediately } from '../../animations/landingAnimations'
import ShimmerButton from '../ui/ShimmerButton'

interface DealerSectionProps {
  isActive?: boolean
}

interface HostPillar {
  tag: string
  title: string
  desc: string
  icon: typeof Coins
}

const HOST_PILLARS: HostPillar[] = [
  {
    tag: '0% COMMISSION',
    title: 'Keep 100% Profit',
    desc: 'Zero company cut for sold machines. You collect and retain 100% of all customer printing revenue.',
    icon: Coins,
  },
  {
    tag: '4.5 SQ.FT',
    title: 'Minimal Footprint',
    desc: 'Fits xerox shops, college libraries, cafeterias, and tech parks with a standard 230V 5A socket.',
    icon: Maximize2,
  },
  {
    tag: 'TURNKEY SETUP',
    title: 'Installed by PrintBooth',
    desc: 'Full on-site delivery, hardware setup, and calibration included. Connects easily to your own Wi-Fi or Ethernet.',
    icon: Wrench,
  },
]

export default function DealerSection({ isActive = false }: DealerSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!sectionRef.current) return

    if (reducedMotion) {
      showAllImmediately(sectionRef.current, [
        '.dlr-eyebrow',
        '.dlr-heading',
        '.dlr-sub',
        '.dlr-pillar-card',
        '.dlr-rule',
        '.dlr-cta',
      ])
      return
    }

    if (isActive) {
      animateDealerIn(sectionRef.current)
    }
  }, [isActive, reducedMotion])

  return (
    <section ref={sectionRef} className="dlr-section" aria-labelledby="dlr-heading">
      {/* Ambient Rising Spark Particle Layer */}
      <div className="section-particle-dust dlr-particle-dust" aria-hidden="true">
        <span className="particle-spark p-1" />
        <span className="particle-spark p-2" />
        <span className="particle-spark p-3" />
        <span className="particle-spark p-4" />
        <span className="particle-spark p-5" />
        <span className="particle-spark p-6" />
      </div>

      <div className="dlr-inner">

        {/* Heading block */}
        <div className="dlr-header">
          <h2 className="dlr-heading" id="dlr-heading" data-anim data-delay="0">
            Buy a PrintBooth Machine.<br />
            <span className="dlr-heading-accent">Keep 100% of your earnings.</span>
          </h2>
          <p className="dlr-sub" data-anim data-delay="120">
            We sell complete autonomous printing kiosks to merchants, colleges, and stationery owners.
            Zero commission to PrintBooth, connect your own Wi-Fi or Ethernet, and enjoy turnkey on-site installation by our team.
          </p>
        </div>

        {/* Host Highlights Grid */}
        <div className="dlr-pillars-grid">
          {HOST_PILLARS.map((p, i) => {
            const PillarIcon = p.icon
            return (
              <div
                key={p.tag}
                className="dlr-pillar-card"
                data-anim
                data-delay={String(180 + i * 60)}
              >
                <div className="dlr-pillar-top">
                  <PillarIcon className="dlr-pillar-icon" size={15} />
                  <span className="dlr-pillar-tag">{p.tag}</span>
                </div>
                <h3 className="dlr-pillar-title">{p.title}</h3>
                <p className="dlr-pillar-desc">{p.desc}</p>
              </div>
            )
          })}
        </div>

        {/* Divider */}
        <div className="dlr-rule" data-anim data-delay="380" />

        {/* CTA */}
        <div className="dlr-cta" data-anim data-delay="440">
          <ShimmerButton
            to="/request-installation"
            variant="primary"
            id="dealer-request-installation"
          >
            <span>Buy a Machine / Inquire</span>
            <ArrowUpRight className="btn-svg-icon" size={16} />
          </ShimmerButton>
          <a href="mailto:team1printbooth@gmail.com" className="dlr-mailto">
            <Mail className="dlr-mail-icon" size={14} />
            <span>team1printbooth@gmail.com</span>
          </a>
        </div>

      </div>
    </section>
  )
}
