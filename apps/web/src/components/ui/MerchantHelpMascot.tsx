import React, { useState, useEffect } from 'react'
import {
  PhoneCall,
  WhatsappLogo,
  EnvelopeSimple,
  Clock,
  MapPin,
  X,
  WarningCircle,
  Headset,
  Storefront,
} from '@phosphor-icons/react'
import { getApiBaseUrl } from '@/lib/config'
import './MerchantHelpMascot.css'

export interface MerchantContact {
  merchantId?: string
  name: string
  storeName: string
  phone: string
  whatsapp?: string
  email?: string
  onSiteLocation?: string
  supportHours?: string
  kioskId?: string
}

interface MerchantHelpMascotProps {
  printerId?: string
  kioskName?: string
  onSelectStation?: () => void
  variant?: 'header' | 'sticky'
}

export const MerchantHelpMascot: React.FC<MerchantHelpMascotProps> = ({
  printerId,
  kioskName,
  onSelectStation,
  variant = 'header',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [contact, setContact] = useState<MerchantContact | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch machine-specific merchant contact when printerId is provided or changes
  useEffect(() => {
    if (!printerId) {
      setContact(null)
      return
    }

    let mounted = true
    const cleanId = printerId.trim()

    async function loadContact() {
      setLoading(true)
      try {
        const apiBase = getApiBaseUrl()
        const res = await fetch(`${apiBase}/kiosks/${cleanId}`)

        if (res.ok) {
          const json = await res.json()
          if (mounted && json.data?.merchantContact) {
            // Strictly verify that the merchant contact belongs to THIS machine
            if (json.data.merchantContact.kioskId === cleanId) {
              setContact(json.data.merchantContact)
              setLoading(false)
              return
            }
          }
        }
      } catch (err) {
        console.warn('[MerchantHelpMascot] Could not fetch remote contact, checking fallback:', err)
      }

      // Safe local fallback strictly tied to cleanId
      if (mounted) {
        if (cleanId === 'PB-001') {
          setContact({
            kioskId: 'PB-001',
            merchantId: 'M-001',
            name: 'Rahul Sharma',
            storeName: 'MIT ADT Campus Print Hub',
            phone: '+91 98234 56789',
            whatsapp: '+919823456789',
            email: 'rahul.adt@printbooth.in',
            onSiteLocation: 'Ground Floor, Central Reading Hall (Counter #1, next to turnstiles)',
            supportHours: '8:30 AM - 9:30 PM (Mon-Sat)',
          })
        } else {
          setContact(null)
        }
        setLoading(false)
      }
    }

    loadContact()
    return () => {
      mounted = false
    }
  }, [printerId])

  // Format clean whatsapp link
  const rawWhatsapp = contact?.whatsapp || contact?.phone || ''
  const cleanWhatsappNumber = rawWhatsapp.replace(/[^0-9]/g, '')
  const whatsappUrl = cleanWhatsappNumber
    ? `https://wa.me/${cleanWhatsappNumber}?text=${encodeURIComponent(
        `Hi! I am using PrintBooth Station ${printerId || ''} (${kioskName || 'Print Station'}) and need assistance with my print job.`
      )}`
    : '#'

  const callUrl = contact?.phone ? `tel:${contact.phone.replace(/\s+/g, '')}` : '#'

  return (
    <>
      {variant === 'header' ? (
        <button
          type="button"
          className="merchant-help-header-btn"
          onClick={() => setIsOpen(true)}
          id="merchant-help-mascot-btn"
          title={
            printerId
              ? `Need help with Machine ${printerId}? Contact store merchant directly`
              : 'Need help? Click for customer support'
          }
          aria-label={printerId ? `Machine Help for Station ${printerId}` : 'Machine Help'}
        >
          <div className="merchant-help-header-avatar">
            <svg
              viewBox="0 0 72 72"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="merchant-help-trigger__svg"
              aria-hidden="true"
            >
              <circle cx="36" cy="8" r="4.5" fill="#f59e0b" />
              <line x1="36" y1="12" x2="36" y2="20" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
              <rect x="14" y="20" width="44" height="42" rx="14" fill="#e0e5ec" stroke="#cbd5e1" strokeWidth="2.5" />
              <path d="M12 40 C12 22 60 22 60 40" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" fill="none" />
              <rect x="10" y="34" width="6" height="12" rx="3" fill="#2563eb" />
              <rect x="56" y="34" width="6" height="12" rx="3" fill="#2563eb" />
              <rect x="20" y="28" width="32" height="18" rx="8" fill="#1e293b" />
              <circle cx="28" cy="37" r="3" fill="#38bdf8" />
              <circle cx="44" cy="37" r="3" fill="#38bdf8" />
              <path d="M31 52 Q36 56 41 52" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            </svg>
          </div>

          <div className="merchant-help-header-text">
            <div className="merchant-help-header-title">
              <span>Help</span>
            </div>
            <div className="merchant-help-header-sub">
              {printerId ? printerId : 'Kiosk'}
            </div>
          </div>
        </button>
      ) : (
        <div className="merchant-help-sticky-container" aria-label="Customer Support">
          <button
            type="button"
            className="merchant-help-trigger"
            onClick={() => setIsOpen(true)}
            id="merchant-help-mascot-btn"
            title={
              printerId
                ? `Need help with Machine ${printerId}? Contact store merchant directly`
                : 'Need help? Click for customer support'
            }
          >
            <div className="merchant-help-trigger__avatar">
              <svg
                viewBox="0 0 72 72"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="merchant-help-trigger__svg"
                aria-hidden="true"
              >
                <circle cx="36" cy="8" r="4.5" fill="#f59e0b" />
                <line x1="36" y1="12" x2="36" y2="20" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
                <rect x="14" y="20" width="44" height="42" rx="14" fill="#e0e5ec" stroke="#cbd5e1" strokeWidth="2.5" />
                <path d="M12 40 C12 22 60 22 60 40" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" fill="none" />
                <rect x="10" y="34" width="6" height="12" rx="3" fill="#2563eb" />
                <rect x="56" y="34" width="6" height="12" rx="3" fill="#2563eb" />
                <rect x="20" y="28" width="32" height="18" rx="8" fill="#1e293b" />
                <circle cx="28" cy="37" r="3" fill="#38bdf8" />
                <circle cx="44" cy="37" r="3" fill="#38bdf8" />
                <path d="M31 52 Q36 56 41 52" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              </svg>
            </div>

            <div className="merchant-help-trigger__label">
              <div className="merchant-help-trigger__title">
                <span>Machine Help</span>
              </div>
              <div className="merchant-help-trigger__subtitle">
                {printerId ? `Station ${printerId}` : 'Contact Merchant'}
              </div>
            </div>
          </button>
        </div>
      )}

      {/* ─── Expandable Support Modal ─── */}
      {isOpen && (
        <div
          className="merchant-help-modal-backdrop"
          onClick={() => setIsOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="merchant-help-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="merchant-help-modal__header">
              <div className="merchant-help-modal__mascot-badge">
                <div className="merchant-help-modal__mascot-icon">
                  <Headset size={26} color="#2563eb" weight="duotone" />
                </div>
                <div className="merchant-help-modal__titles">
                  {printerId && (
                    <span className="merchant-help-modal__machine-tag">
                      Station {printerId}
                    </span>
                  )}
                  <h3 className="merchant-help-modal__title">On-Site Machine Support</h3>
                </div>
              </div>

              <button
                type="button"
                className="merchant-help-modal__close"
                onClick={() => setIsOpen(false)}
                aria-label="Close dialog"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            {/* Direct Partner Payment Notice */}
            <div className="merchant-help-modal__notice">
              <WarningCircle size={20} color="#b45309" weight="fill" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Customer Protection Notice:</strong> Payments for this machine are credited directly to the on-site store merchant. For <strong>cash refunds</strong>, <strong>paper refills</strong>, or <strong>payment verification</strong>, please contact the assigned store partner below.
              </div>
            </div>

            {/* If a station is selected and merchant contact is resolved */}
            {printerId && contact ? (
              <div className="merchant-help-card">
                <div className="merchant-help-card__header">
                  <div className="merchant-help-card__avatar">
                    {contact.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="merchant-help-card__meta">
                    <div className="merchant-help-card__name">{contact.name}</div>
                    <div className="merchant-help-card__store">
                      {contact.storeName}
                    </div>
                  </div>
                </div>

                {/* Direct Action Buttons: Call & WhatsApp */}
                <div className="merchant-help-actions">
                  <a
                    href={callUrl}
                    className="merchant-help-btn merchant-help-btn--call"
                    title={`Call ${contact.name}`}
                  >
                    <PhoneCall size={18} weight="bold" />
                    <span>Call Store</span>
                  </a>

                  {cleanWhatsappNumber && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="merchant-help-btn merchant-help-btn--whatsapp"
                      title="Open WhatsApp Chat"
                    >
                      <WhatsappLogo size={20} weight="fill" />
                      <span>WhatsApp</span>
                    </a>
                  )}
                </div>

                {/* Details List */}
                <div className="merchant-help-details">
                  {contact.onSiteLocation && (
                    <div className="merchant-help-detail-row">
                      <MapPin size={16} weight="duotone" />
                      <span>
                        <strong>Counter Desk:</strong> {contact.onSiteLocation}
                      </span>
                    </div>
                  )}

                  {contact.supportHours && (
                    <div className="merchant-help-detail-row">
                      <Clock size={16} weight="duotone" />
                      <span>
                        <strong>Hours:</strong> {contact.supportHours}
                      </span>
                    </div>
                  )}

                  {contact.email && (
                    <div className="merchant-help-detail-row">
                      <EnvelopeSimple size={16} weight="duotone" />
                      <span>
                        <strong>Email:</strong>{' '}
                        <a href={`mailto:${contact.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                          {contact.email}
                        </a>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : printerId && loading ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: '0.85rem' }}>
                Connecting to Station {printerId} merchant partner...
              </div>
            ) : (
              /* No specific printer selected yet */
              <div className="merchant-help-unselected">
                <Storefront size={42} color="#64748b" weight="duotone" />
                <div className="merchant-help-unselected__title">
                  Choose Your Print Station First
                </div>
                <div className="merchant-help-unselected__text">
                  To ensure you receive direct support, refunds, or paper refills from the correct venue host, please select your physical printer station first.
                </div>
                {onSelectStation && (
                  <button
                    type="button"
                    className="merchant-help-unselected__btn"
                    onClick={() => {
                      setIsOpen(false)
                      onSelectStation()
                    }}
                  >
                    Select Print Station
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
