import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle,
  PaperPlaneTilt,
  Lightning,
  Sparkle,
  Phone,
  Envelope,
  MapPin,
} from '@phosphor-icons/react'
import { Skeleton } from 'boneyard-js/react'
import { usePageSkeleton } from '../hooks/usePageSkeleton'
import { RequestInstallationSkeletonFallback } from '../components/ui/PageSkeletonFallback'
import { submitInstallationRequest } from '../lib/api'
import SEO from '../components/common/SEO'
import Select, { type TSelectData } from '../components/ui/Select'
import './SubPage.css'

interface FormData {
  venueType: string
  orgName: string
  campusName: string
  city: string
  state: string
  pincode: string
  contactName: string
  contactEmail: string
  contactPhone: string
  contactRole: string
  footfall: string
  timeline: string
  hasPower: boolean
  hasSecurity: boolean
  notes: string
}

const VENUE_OPTIONS: TSelectData[] = [
  { id: 'college', value: 'college', icon: '🎓', label: 'University / College Campus', description: 'Hostels, libraries, student unions & foyers' },
  { id: 'merchant', value: 'merchant', icon: '🏪', label: 'Xerox / Stationery / Print Store', description: 'Automate peak rush counter & offload queues' },
  { id: 'office', value: 'office', icon: '🏢', label: 'Tech Park / Corporate Office', description: 'IT parks, SEZs, cafeteria breakout areas' },
  { id: 'coworking', value: 'coworking', icon: '💼', label: 'Coworking Hub / Incubator', description: 'Shared creator desks & freelance offices' },
  { id: 'library', value: 'library', icon: '📚', label: 'Public / Academic Library', description: 'Study halls, reading rooms & exam lounges' },
  { id: 'hospital', value: 'hospital', icon: '🏥', label: 'Hospital / Healthcare Center', description: 'Patient records, labs & visitor corridors' },
]

const FOOTFALL_OPTIONS: TSelectData[] = [
  { id: '500-1500', value: '500-1500', icon: '🔥', label: '500 – 1,500 daily visitors', description: 'High-density library or college cafeteria' },
  { id: '1500-3000', value: '1500-3000', icon: '⚡', label: '1,500 – 3,000 daily visitors', description: 'Central campus concourse or busy transit link' },
  { id: '3000+', value: '3000+', icon: '🚀', label: '3,000+ high density', description: 'Major university hub or mega commercial center' },
  { id: '200-500', value: '200-500', icon: '👥', label: '200 – 500 daily visitors', description: 'Boutique department, clinic or private facility' },
]

const TIMELINE_OPTIONS: TSelectData[] = [
  { id: 'immediate', value: 'immediate', icon: '⚡', label: 'Immediate (< 7 Days)', description: 'Location is ready for rapid turnkey placement' },
  { id: '30days', value: '30days', icon: '📅', label: 'Within 30 Days', description: 'Finalizing space or internal approvals this month' },
  { id: 'nextQuarter', value: 'nextQuarter', icon: '🗓️', label: 'Next Semester / Quarter', description: 'Budgeting & scheduling for upcoming session' },
  { id: 'exploring', value: 'exploring', icon: '💡', label: 'Evaluating Feasibility', description: 'Inquiring about revenue share & kiosk pricing' },
]

export default function RequestInstallationPage() {
  const [formData, setFormData] = useState<FormData>({
    venueType: 'college',
    orgName: '',
    campusName: '',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411058',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    contactRole: '',
    footfall: '500-1500',
    timeline: 'immediate',
    hasPower: true,
    hasSecurity: true,
    notes: '',
  })

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [refCode, setRefCode] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const code = `PB-OWNER-${Math.floor(100000 + Math.random() * 900000)}`
    const now = new Date().toISOString()
    const newReq = {
      id: code,
      venueType: formData.venueType,
      orgName: formData.orgName,
      campusName: formData.campusName || 'Main Campus',
      city: formData.city || 'Pune',
      state: formData.state || 'Maharashtra',
      pincode: formData.pincode || '411058',
      contactName: formData.contactName,
      contactRole: formData.contactRole || 'Owner / Representative',
      contactEmail: formData.contactEmail,
      contactPhone: formData.contactPhone,
      footfall: formData.footfall,
      timeline: formData.timeline,
      hasPower: formData.hasPower,
      hasSecurity: formData.hasSecurity,
      notes: formData.notes,
      status: 'NEW',
      priority: 'HIGH',
      assignedLead: 'Unassigned',
      estimatedUnits: 1,
      createdAt: now,
      updatedAt: now,
      surveyNotes: [
        {
          id: `sn-${Date.now()}`,
          author: 'Web Inbound Portal',
          text: `Public website purchase & deployment application received from ${formData.orgName} (${formData.city}). Contact: ${formData.contactName} (${formData.contactPhone}).`,
          timestamp: now,
        },
      ],
    }

    try {
      const serverRes = await submitInstallationRequest(newReq)
      if (serverRes && serverRes.id) {
        newReq.id = serverRes.id
      }
    } catch (err) {
      console.warn('Backend sync failed, storing locally:', err)
    }

    try {
      const raw = localStorage.getItem('pb_installation_requests')
      const existing = raw ? JSON.parse(raw) : []
      localStorage.setItem('pb_installation_requests', JSON.stringify([newReq, ...existing]))
      window.dispatchEvent(new CustomEvent('pb_installation_updated'))
    } catch {}

    setRefCode(newReq.id)
    setSubmitting(false)
    setSubmitted(true)
    window.scrollTo({ top: 120, behavior: 'smooth' })
  }

  const loading = usePageSkeleton(400)

  return (
    <Skeleton
      name="request-installation-page"
      loading={loading}
      animate="shimmer"
      color="rgba(163, 177, 198, 0.40)"
      darkColor="rgba(255, 255, 255, 0.08)"
      transition={300}
      fallback={<RequestInstallationSkeletonFallback />}
    >
      <SEO
        title="Installation"
        description="Deploy autonomous PrintBooth kiosks at your university, college, library, or retail venue. Turnkey hardware setup, 100% merchant profit retention, and full warranty."
        canonicalUrl="https://printbooth.co.in/request-installation"
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Request Installation', url: '/request-installation' },
        ]}
      />
      <div className="sub-page">
        {/* ── Hero ── */}
        <div className="sub-hero" style={{ paddingBottom: 36 }}>
          <div className="container">
            <div className="sub-hero__inner" style={{ textAlign: 'center', alignItems: 'center', margin: '0 auto' }}>
              <span className="sub-hero__eyebrow">
                <span className="sub-hero__eyebrow-dot" />
                Machine Sales & Turnkey Setup
              </span>
              <h1 className="sub-hero__title" style={{ fontSize: 'clamp(1.8rem, 3.8vw, 2.8rem)' }}>
                Request Kiosk Installation &{' '}
                <span className="sub-hero__title-accent">Purchase</span>
              </h1>
              <p className="sub-hero__sub" style={{ maxWidth: 560, fontSize: 15, margin: '0 auto' }}>
                Order turnkey autonomous PrintBooth kiosks for your store, campus, or office.
                Keep 100% of printing income with full delivery, setup, and hardware warranty included.
              </p>
            </div>
          </div>
        </div>

        {/* ── Main Compact Form Container ── */}
        <div className="container sub-content" style={{ paddingTop: 0 }}>
          <div className="neo-install-compact-wrap">
            {submitted ? (
              /* Success State */
              <div className="neo-success-banner" style={{ padding: 'clamp(24px, 4vw, 36px)' }}>
                <div className="neo-success-icon" style={{ color: 'var(--neo-success)' }}>
                  <CheckCircle size={40} weight="fill" />
                </div>
                <p className="neo-success-title" style={{ fontSize: 20 }}>
                  Installation & Purchase Request Received!
                </p>
                <p className="neo-success-sub" style={{ maxWidth: 480 }}>
                  Thank you, <strong>{formData.contactName || 'Partner'}</strong>.
                  Our deployment desk will contact you within 24 hours regarding{' '}
                  <strong style={{ color: 'var(--neo-accent)' }}>{formData.orgName || 'your venue'}</strong>.
                </p>

                {/* Reference ID */}
                <div className="neo-card-inset" style={{ width: '100%', maxWidth: 420, textAlign: 'center', margin: '12px auto' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--neo-text-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                    Application Reference ID
                  </p>
                  <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 22, fontWeight: 800, color: 'var(--neo-accent)', letterSpacing: '0.05em' }}>
                    {refCode}
                  </p>
                </div>

                {/* Steps */}
                <div className="neo-card-sm" style={{ width: '100%', textAlign: 'left', marginTop: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--neo-accent)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Sparkle size={14} weight="fill" /> Next Deployment Steps
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--neo-text-3)' }}>
                    <div>1. Deployment team shares turnkey quote and machine dimensions.</div>
                    <div>2. Site readiness check (standard 230V socket + Wi-Fi/LAN).</div>
                    <div>3. On-site delivery, physical bolting, and live printing calibration.</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                  <Link to="/" className="neo-btn">Back to Home</Link>
                  <a
                    href={`https://wa.me/919090636363?text=Hi%20PrintBooth,%20I%20submitted%20an%20installation%20request%20(${refCode})`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="neo-btn"
                    style={{ background: '#25D366', color: '#000', fontWeight: 700 }}
                  >
                    Chat on WhatsApp
                  </a>
                </div>
              </div>
            ) : (
              /* Compact Form Card */
              <form onSubmit={handleSubmit}>
                <div className="neo-card" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 'clamp(20px, 3.5vw, 32px)' }}>
                  {/* Form Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(163, 177, 198, 0.3)', paddingBottom: 16 }}>
                    <div className="neo-icon-badge neo-icon-badge-sm">
                      <Lightning size={20} weight="fill" />
                    </div>
                    <div>
                      <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--neo-text-1)', margin: 0 }}>
                        Inquire / Order a PrintBooth Machine
                      </h2>
                      <p style={{ fontSize: 12.5, color: 'var(--neo-text-4)', margin: '2px 0 0' }}>
                        Provide your venue details — our engineers respond within 24 hours.
                      </p>
                    </div>
                  </div>

                  {/* Row 1: Venue Dropdown & Organization Name */}
                  <div className="neo-form-row">
                    <div className="neo-form-group">
                      <label htmlFor="venue-type-select" className="neo-form-label" style={{ fontSize: 12 }}>
                        Venue / Facility Type *
                      </label>
                      <Select
                        id="venue-type-select"
                        title="Facility / Venue Type"
                        data={VENUE_OPTIONS}
                        value={formData.venueType}
                        onChange={(val) => setFormData((f) => ({ ...f, venueType: val }))}
                      />
                    </div>

                    <div className="neo-form-group">
                      <label htmlFor="org-name" className="neo-form-label" style={{ fontSize: 12 }}>
                        Organization / Store Name *
                      </label>
                      <input
                        id="org-name"
                        type="text"
                        className="neo-input"
                        placeholder="e.g. PICT College, Om Stationery"
                        required
                        value={formData.orgName}
                        onChange={e => setFormData(f => ({ ...f, orgName: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Row 2: Campus/Building & City */}
                  <div className="neo-form-row">
                    <div className="neo-form-group">
                      <label htmlFor="campus-name" className="neo-form-label" style={{ fontSize: 12 }}>
                        Campus / Wing / Area
                      </label>
                      <input
                        id="campus-name"
                        type="text"
                        className="neo-input"
                        placeholder="e.g. Library Foyer, Main Gate"
                        value={formData.campusName}
                        onChange={e => setFormData(f => ({ ...f, campusName: e.target.value }))}
                      />
                    </div>

                    <div className="neo-form-group">
                      <label htmlFor="city-name" className="neo-form-label" style={{ fontSize: 12 }}>
                        City *
                      </label>
                      <input
                        id="city-name"
                        type="text"
                        className="neo-input"
                        placeholder="e.g. Pune"
                        required
                        value={formData.city}
                        onChange={e => setFormData(f => ({ ...f, city: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Row 3: Pincode & Daily Footfall */}
                  <div className="neo-form-row">
                    <div className="neo-form-group">
                      <label htmlFor="pincode" className="neo-form-label" style={{ fontSize: 12 }}>
                        Pincode *
                      </label>
                      <input
                        id="pincode"
                        type="text"
                        className="neo-input"
                        placeholder="411058"
                        maxLength={6}
                        required
                        value={formData.pincode}
                        onChange={e => setFormData(f => ({ ...f, pincode: e.target.value }))}
                      />
                    </div>

                    <div className="neo-form-group">
                      <label htmlFor="footfall-select" className="neo-form-label" style={{ fontSize: 12 }}>
                        Estimated Daily Footfall
                      </label>
                      <Select
                        id="footfall-select"
                        title="Daily Footfall Range"
                        data={FOOTFALL_OPTIONS}
                        value={formData.footfall}
                        onChange={(val) => setFormData((f) => ({ ...f, footfall: val }))}
                      />
                    </div>
                  </div>

                  {/* Row 4: Contact Person & Phone */}
                  <div className="neo-form-row">
                    <div className="neo-form-group">
                      <label htmlFor="contact-name" className="neo-form-label" style={{ fontSize: 12 }}>
                        Contact Person Name *
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        className="neo-input"
                        placeholder="e.g. Rajesh Patil"
                        required
                        value={formData.contactName}
                        onChange={e => setFormData(f => ({ ...f, contactName: e.target.value }))}
                      />
                    </div>

                    <div className="neo-form-group">
                      <label htmlFor="contact-phone" className="neo-form-label" style={{ fontSize: 12 }}>
                        Phone / WhatsApp Number *
                      </label>
                      <input
                        id="contact-phone"
                        type="tel"
                        className="neo-input"
                        placeholder="+91 98220 12345"
                        required
                        value={formData.contactPhone}
                        onChange={e => setFormData(f => ({ ...f, contactPhone: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Row 5: Role & Email */}
                  <div className="neo-form-row">
                    <div className="neo-form-group">
                      <label htmlFor="contact-role" className="neo-form-label" style={{ fontSize: 12 }}>
                        Designation / Role
                      </label>
                      <input
                        id="contact-role"
                        type="text"
                        className="neo-input"
                        placeholder="e.g. Owner, Store Manager, Dean"
                        value={formData.contactRole}
                        onChange={e => setFormData(f => ({ ...f, contactRole: e.target.value }))}
                      />
                    </div>

                    <div className="neo-form-group">
                      <label htmlFor="contact-email" className="neo-form-label" style={{ fontSize: 12 }}>
                        Email Address
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        className="neo-input"
                        placeholder="rajesh@example.com"
                        value={formData.contactEmail}
                        onChange={e => setFormData(f => ({ ...f, contactEmail: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Row 6: Deployment Timeline & Readiness Checks */}
                  <div className="neo-form-row">
                    <div className="neo-form-group">
                      <label htmlFor="timeline-select" className="neo-form-label" style={{ fontSize: 12 }}>
                        Desired Deployment Timeline
                      </label>
                      <Select
                        id="timeline-select"
                        title="Deployment Timeline"
                        data={TIMELINE_OPTIONS}
                        value={formData.timeline}
                        onChange={(val) => setFormData((f) => ({ ...f, timeline: val }))}
                      />
                    </div>

                    <div className="neo-form-group" style={{ justifyContent: 'center', gap: 8 }}>
                      <span className="neo-form-label" style={{ fontSize: 12 }}>Site Readiness</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label className="neo-checkbox-label" style={{ fontSize: 12 }}>
                          <input
                            type="checkbox"
                            className="neo-checkbox"
                            checked={formData.hasPower}
                            onChange={e => setFormData(f => ({ ...f, hasPower: e.target.checked }))}
                          />
                          <span>230V 5A power outlet available</span>
                        </label>
                        <label className="neo-checkbox-label" style={{ fontSize: 12 }}>
                          <input
                            type="checkbox"
                            className="neo-checkbox"
                            checked={formData.hasSecurity}
                            onChange={e => setFormData(f => ({ ...f, hasSecurity: e.target.checked }))}
                          />
                          <span>Venue Wi-Fi or LAN connection ready</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Row 7: Notes */}
                  <div className="neo-form-group">
                    <label htmlFor="install-notes" className="neo-form-label" style={{ fontSize: 12 }}>
                      Special Requirements / Queries
                      <span style={{ color: 'var(--neo-text-4)', fontWeight: 400, marginLeft: 6 }}>(Optional)</span>
                    </label>
                    <textarea
                      id="install-notes"
                      className="neo-input neo-textarea"
                      rows={2}
                      placeholder="e.g. Space dimensions, multi-kiosk quote, specific installation timing..."
                      value={formData.notes}
                      onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                    />
                  </div>

                  {/* Submit CTA */}
                  <button
                    type="submit"
                    className="neo-btn neo-btn-primary neo-btn-lg"
                    id="install-submit-btn"
                    disabled={submitting}
                    style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
                  >
                    {submitting ? (
                      <>
                        <span className="neo-spinner" />
                        Transmitting Inquiry…
                      </>
                    ) : (
                      <>
                        Submit Machine Purchase & Setup Inquiry
                        <PaperPlaneTilt size={18} weight="bold" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Direct Contact & Trust Footer Strip */}
            <div className="neo-install-trust-bar">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Phone size={14} weight="bold" color="var(--neo-accent)" />
                Direct Desk: <a href="tel:+919090636363">+91 90906 36363</a>
              </span>
              <span>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Envelope size={14} weight="bold" color="var(--neo-accent)" />
                <a href="mailto:team1printbooth@gmail.com">team1printbooth@gmail.com</a>
              </span>
              <span>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <MapPin size={14} weight="bold" color="var(--neo-accent)" />
                <span>Kothrud, Pune 411058</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Skeleton>
  )
}
