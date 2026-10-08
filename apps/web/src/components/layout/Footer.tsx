import { Link } from 'react-router-dom'
import { Phone, Envelope, MapPin } from '@phosphor-icons/react'
import { getMerchantPortalUrl, getAdminConsoleUrl } from '../../lib/config'
import './Footer.css'

export default function Footer() {
  const currentYear = new Date().getFullYear()
  const footerLinks = {
    company: [
      { to: '/how-it-works', label: 'How It Works' },
      { to: '/features', label: 'Features' },
      { to: '/locations', label: 'Locations' },
      { to: '/pricing', label: 'Pricing' },
      { to: '/request-installation', label: 'Buy a Machine' },
    ],
    support: [
      { to: '/faq', label: 'FAQ' },
      { to: '/support', label: 'Support' },
      { to: '/contact', label: 'Contact Us' },
      { to: '/refunds', label: 'Refund Policy' },
    ],
    legal: [
      { to: '/terms', label: 'Terms & Conditions' },
      { to: '/privacy', label: 'Privacy Policy' },
      { to: '/cookies', label: 'Cookie Policy' },
    ],
    portals: [
      { href: getMerchantPortalUrl(), label: 'Merchant Partner Portal' },
      { href: getAdminConsoleUrl(), label: 'Admin Fleet Console' },
    ],
  }

  return (
    <footer className="footer" role="contentinfo">
      <div className="container">
        <div className="footer__grid">
          {/* Brand column */}
          <div className="footer__brand-col">
            <Link to="/" className="footer__brand">PrintBooth</Link>
            <p className="footer__tagline">
              Self-service document printing.<br />
              Upload. Pay. Collect.
            </p>
            <div className="footer__contact-info">
              <a href="tel:+919090636363" className="footer__contact-link" aria-label="Contact Phone">
                <Phone size={14} weight="bold" />
                <span>+91 90906 36363</span>
              </a>
              <a href="mailto:team1printbooth@gmail.com" className="footer__contact-link" aria-label="Contact Email">
                <Envelope size={14} weight="bold" />
                <span>team1printbooth@gmail.com</span>
              </a>
              <div className="footer__contact-address" aria-label="Office Address">
                <MapPin size={15} weight="bold" />
                <span>Homeseva Jijai Nagar, Kothrud, Pune, Maharashtra 411058</span>
              </div>
            </div>
          </div>

          {/* Company links */}
          <div className="footer__link-col">
            <h3 className="footer__col-heading">Product</h3>
            <ul className="footer__link-list">
              {footerLinks.company.map(link => (
                <li key={link.to}>
                  <Link to={link.to} className="footer__link">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support links */}
          <div className="footer__link-col">
            <h3 className="footer__col-heading">Support</h3>
            <ul className="footer__link-list">
              {footerLinks.support.map(link => (
                <li key={link.to}>
                  <Link to={link.to} className="footer__link">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal links */}
          <div className="footer__link-col">
            <h3 className="footer__col-heading">Legal</h3>
            <ul className="footer__link-list">
              {footerLinks.legal.map(link => (
                <li key={link.to}>
                  <Link to={link.to} className="footer__link">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Portals links */}
          <div className="footer__link-col">
            <h3 className="footer__col-heading">Portals</h3>
            <ul className="footer__link-list">
              {footerLinks.portals.map(link => (
                <li key={(link as any).to || (link as any).href}>
                  {(link as any).to ? (
                    <Link to={(link as any).to} className="footer__link">
                      {link.label}
                    </Link>
                  ) : (
                    <a href={(link as any).href} target="_blank" rel="noopener noreferrer" className="footer__link">
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          <p className="footer__copyright">
            &copy; {currentYear} PrintBooth. All rights reserved.
          </p>
          <p className="footer__legal-note">
            Prices are subject to change. Review pricing before checkout.
          </p>
        </div>
      </div>
    </footer>
  )
}
