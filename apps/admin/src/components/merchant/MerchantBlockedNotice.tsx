import {
  WarningOctagon,
  Phone,
  EnvelopeSimple,
  ChatCircleDots,
  Clock,
  Buildings,
  HardDrives,
  Printer,
  EyeSlash,
  SignOut,
  X,
} from '@phosphor-icons/react'
import './MerchantBlockedNotice.css'

export interface MerchantBlockedNoticeProps {
  kioskId?: string
  storeName?: string
  merchantName?: string
  onClose?: () => void
  onSignOut?: () => void
  isModal?: boolean
  companyContact?: {
    email?: string
    phone?: string
    whatsapp?: string
    hours?: string
    desk?: string
  }
}

export const DEFAULT_COMPANY_CONTACT = {
  email: 'support@printbooth.in',
  phone: '+91 98234 56789',
  whatsapp: '+919823456789',
  hours: 'Mon - Sat, 9:00 AM - 8:00 PM IST',
  desk: 'PrintBooth Corporate Merchant Relations & Fleet Desk',
}

export default function MerchantBlockedNotice({
  kioskId = 'Assigned Venue',
  storeName,
  merchantName,
  onClose,
  onSignOut,
  isModal = true,
  companyContact = DEFAULT_COMPANY_CONTACT,
}: MerchantBlockedNoticeProps) {
  const contact = { ...DEFAULT_COMPANY_CONTACT, ...companyContact }
  const cleanPhone = contact.phone.replace(/[^0-9+]/g, '')
  const whatsappUrl = `https://wa.me/${contact.whatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
    `Hello PrintBooth Team, my merchant account (${kioskId} - ${storeName || 'Store'}) is currently blocked/suspended. Please assist with reactivation.`
  )}`
  const emailUrl = `mailto:${contact.email}?subject=${encodeURIComponent(
    `Account Suspension & Hardware Inquiries: ${kioskId}`
  )}&body=${encodeURIComponent(
    `Dear PrintBooth Operations Team,\n\nMy merchant account for ${storeName || 'Store'} (${kioskId}) has been suspended and hardware placed offline.\n\nPlease provide details regarding compliance and required steps for account reinstatement.\n\nThank you,\n${merchantName || 'Merchant Partner'}`
  )}`

  if (!isModal) {
    return (
      <div className="merchant-blocked-banner" role="alert">
        <div className="merchant-blocked-banner__content">
          <WarningOctagon size={22} weight="fill" color="#ef4444" />
          <div>
            <strong>Account Suspended & Hardware Offline:</strong> Your merchant account and kiosk ({kioskId}) have been paused by the platform administrator.
          </div>
        </div>
        <div className="merchant-blocked-banner__actions">
          <a
            href={emailUrl}
            className="btn btn--secondary"
            style={{ fontSize: 12, padding: '4px 10px', height: 'auto', color: '#f87171', borderColor: 'rgba(220, 38, 38, 0.4)' }}
          >
            Contact Company Desk
          </a>
          {onSignOut && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onSignOut}
              style={{ fontSize: 12, padding: '4px 8px' }}
            >
              Sign Out
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="merchant-blocked-overlay" role="dialog" aria-modal="true" aria-labelledby="blocked-modal-title">
      <div className="merchant-blocked-card">
        <div className="merchant-blocked-card__ambient" />

        <div className="merchant-blocked-header">
          <div className="merchant-blocked-icon-box">
            <WarningOctagon size={28} weight="fill" />
          </div>
          <div className="merchant-blocked-title-group">
            <div className="merchant-blocked-badges">
              <span className="blocked-badge blocked-badge--danger">
                Account Suspended
              </span>
              <span className="blocked-badge blocked-badge--offline">
                Hardware Offline
              </span>
            </div>
            <h2 id="blocked-modal-title" className="merchant-blocked-title">
              Merchant Partner Suspended
            </h2>
            <p className="merchant-blocked-subtext">
              Your account has been placed on administrative hold by the PrintBooth platform team. All hardware and customer discoverability have been halted.
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              className="btn btn--icon btn--ghost"
              onClick={onClose}
              aria-label="Dismiss alert"
              style={{ color: '#9ca3af', padding: 4 }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Real-time Hardware & Visibility Status Box */}
        <div className="merchant-blocked-hardware-box">
          <div className="hardware-row">
            <span className="hardware-row__label">
              <HardDrives size={16} />
              <span>Assigned Kiosk Terminal ({kioskId})</span>
            </span>
            <span className="hardware-row__status">
              OFFLINE
            </span>
          </div>

          <div className="hardware-row">
            <span className="hardware-row__label">
              <Printer size={16} />
              <span>Printer Daemon & Hardware State</span>
            </span>
            <span className="hardware-row__status">
              HALTED
            </span>
          </div>

          <div className="hardware-row">
            <span className="hardware-row__label">
              <EyeSlash size={16} />
              <span>Customer Print App Discovery</span>
            </span>
            <span className="hardware-row__status">
              HIDDEN FROM MAP
            </span>
          </div>
        </div>

        {/* Company Contact Information Card */}
        <div className="merchant-contact-card">
          <h4 className="merchant-contact-card__heading">
            <Buildings size={16} weight="duotone" />
            <span>Contact Company For Details & Reinstatement</span>
          </h4>

          <div className="merchant-contact-list">
            <div className="merchant-contact-item">
              <span className="merchant-contact-label">
                <EnvelopeSimple size={15} />
                <span>Corporate Support Email</span>
              </span>
              <a href={emailUrl} className="merchant-contact-val">
                {contact.email}
              </a>
            </div>

            <div className="merchant-contact-item">
              <span className="merchant-contact-label">
                <Phone size={15} />
                <span>Helpline Hotline</span>
              </span>
              <a href={`tel:${cleanPhone}`} className="merchant-contact-val">
                {contact.phone}
              </a>
            </div>

            <div className="merchant-contact-item">
              <span className="merchant-contact-label">
                <Clock size={15} />
                <span>Desk Support Hours</span>
              </span>
              <span style={{ color: '#9ca3af', fontSize: 12 }}>
                {contact.hours}
              </span>
            </div>

            <div className="merchant-contact-item">
              <span className="merchant-contact-label">
                <Buildings size={15} />
                <span>Department</span>
              </span>
              <span style={{ color: '#9ca3af', fontSize: 12 }}>
                {contact.desk}
              </span>
            </div>
          </div>
        </div>

        {/* Direct Action Buttons */}
        <div className="merchant-blocked-actions">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-contact-action btn-contact-action--whatsapp"
          >
            <ChatCircleDots size={18} weight="bold" />
            <span>Chat on WhatsApp</span>
          </a>

          <a
            href={emailUrl}
            className="btn-contact-action btn-contact-action--email"
          >
            <EnvelopeSimple size={18} weight="bold" />
            <span>Email Corporate Desk</span>
          </a>

          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="btn-contact-action btn-contact-action--secondary"
            >
              <SignOut size={16} />
              <span>Sign Out</span>
            </button>
          )}

          {onClose && !onSignOut && (
            <button
              type="button"
              onClick={onClose}
              className="btn-contact-action btn-contact-action--secondary"
            >
              <span>Close</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
