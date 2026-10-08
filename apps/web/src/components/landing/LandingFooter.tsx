import { Link } from 'react-router-dom'
import { ArrowUp, ArrowRight, ShieldCheck } from '@phosphor-icons/react'
import { getMerchantPortalUrl, getAdminConsoleUrl } from '../../lib/config'
import './LandingFooter.css'

interface LandingFooterProps {
  onJumpToTop?: () => void
}

export default function LandingFooter({ onJumpToTop }: LandingFooterProps) {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="landing-footer" role="contentinfo">
      <div className="landing-footer__inner">
        <div className="landing-footer__grid">
          {/* Brand & Mission Column */}
          <div className="landing-footer__brand-col">
            <Link to="/" className="landing-footer__brand" onClick={onJumpToTop}>
              PRINTBOOTH
            </Link>
            <p className="landing-footer__tagline">
              Autonomous self-service printing kiosks. Walk up, upload via QR, pay with UPI, and collect prints in under 90 seconds.
            </p>

            <div className="landing-footer__privacy-badge">
              <ShieldCheck size={14} weight="fill" />
              <span>Zero App Downloads · Zero Cloud Storage</span>
            </div>
          </div>

          {/* Links: Platform */}
          <div className="landing-footer__col">
            <h4 className="landing-footer__heading">Platform</h4>
            <ul className="landing-footer__links">
              <li>
                <Link to="/print" className="landing-footer__link landing-footer__link--highlight">
                  <span>Start Printing</span>
                  <ArrowRight size={11} weight="bold" />
                </Link>
              </li>
              <li>
                <Link to="/request-installation" className="landing-footer__link">
                  Host a Kiosk
                </Link>
              </li>
              <li>
                <a href={getMerchantPortalUrl()} target="_blank" rel="noopener noreferrer" className="landing-footer__link">
                  Merchant Portal
                </a>
              </li>
              <li>
                <a href={getAdminConsoleUrl()} target="_blank" rel="noopener noreferrer" className="landing-footer__link">
                  Fleet Console
                </a>
              </li>
            </ul>
          </div>

          {/* Links: Trust & Legal */}
          <div className="landing-footer__col">
            <h4 className="landing-footer__heading">Trust &amp; Legal</h4>
            <ul className="landing-footer__links">
              <li><Link to="/privacy" className="landing-footer__link">Privacy Policy</Link></li>
              <li><Link to="/terms" className="landing-footer__link">Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="landing-footer__bottom">

          <span className="landing-footer__copy">
            &copy; {currentYear} PrintBooth Technologies. All rights reserved.
          </span>

          <button
            type="button"
            className="landing-footer__top-btn"
            onClick={onJumpToTop}
            aria-label="Back to Top"
          >
            <span>Back to top</span>
            <ArrowUp size={14} weight="bold" />
          </button>
        </div>
      </div>
    </footer>
  )
}
