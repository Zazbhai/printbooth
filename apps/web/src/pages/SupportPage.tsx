import { useState } from 'react'
import {
  Envelope,
  PaperPlaneTilt,
  Clock,
  Receipt,
  CheckCircle,
  HeadCircuit,
  Lightning,
  ArrowRight,
  Phone,
  MapPin,
} from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { Skeleton } from 'boneyard-js/react'
import { usePageSkeleton } from '../hooks/usePageSkeleton'
import { SupportSkeletonFallback } from '../components/ui/PageSkeletonFallback'
import { submitHelpDeskTicket } from '../lib/api'
import SEO from '../components/common/SEO'
import './SubPage.css'

export default function SupportPage() {
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', orderId: '', message: '' })
  const loading = usePageSkeleton(450)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ticketId = `TKT-${Math.floor(1000 + Math.random() * 9000)}`
    const now = new Date().toISOString()
    const newTicket = {
      id: ticketId,
      senderType: 'USER',
      title: form.orderId ? `Customer query for Order #${form.orderId}` : `Support inquiry from ${form.name}`,
      category: form.orderId ? 'PAYMENT_REFUND' : 'GENERAL_INQUIRY',
      priority: 'HIGH',
      status: 'OPEN',
      requesterName: form.name,
      requesterEmail: form.email,
      requesterPhone: '+91 90906 36363',
      orderId: form.orderId || undefined,
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: `msg-${Date.now()}`,
          sender: 'CUSTOMER',
          senderName: form.name,
          text: form.message,
          timestamp: now,
        },
      ],
    }

    try {
      const res = await submitHelpDeskTicket(newTicket)
      if (res && res.id) newTicket.id = res.id
    } catch (err) {
      console.warn('Backend sync failed, storing locally:', err)
    }

    try {
      const raw = localStorage.getItem('pb_helpdesk_tickets')
      const existing = raw ? JSON.parse(raw) : []
      localStorage.setItem('pb_helpdesk_tickets', JSON.stringify([newTicket, ...existing]))
      window.dispatchEvent(new CustomEvent('pb_helpdesk_updated'))
    } catch {}

    setSent(true)
  }

  return (
    <Skeleton
      name="support-page"
      loading={loading}
      animate="shimmer"
      color="rgba(163, 177, 198, 0.40)"
      darkColor="rgba(255, 255, 255, 0.08)"
      transition={300}
      fallback={<SupportSkeletonFallback />}
    >
      <SEO
        title="Customer Support & Helpdesk — Fast Order Assistance | PrintBooth"
        description="Need help with a print order or kiosk payment? Contact the PrintBooth help desk. Fast response within 24 hours with dedicated refund and ticket resolution."
        canonicalUrl="https://printbooth.in/support"
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Support', url: '/support' },
        ]}
      />
      <div className="sub-page">
      {/* Hero */}
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner">
            <span className="sub-hero__eyebrow">
              <span className="sub-hero__eyebrow-dot" />
              Support Centre
            </span>
            <h1 className="sub-hero__title">
              We're here to{' '}
              <span className="sub-hero__title-accent">help you</span>
            </h1>
            <p className="sub-hero__sub">
              Facing an issue with an order, payment, or kiosk? Send us a message and we'll get back to you within one business day.
            </p>
          </div>
        </div>
      </div>

      <div className="container sub-content">
        {/* Stats */}
        <div className="neo-stats">
          <div className="neo-stat">
            <span className="neo-stat__value">&lt; 24h</span>
            <span className="neo-stat__label">Response Time</span>
          </div>
          <div className="neo-stat">
            <span className="neo-stat__value">98%</span>
            <span className="neo-stat__label">Resolution Rate</span>
          </div>
          <div className="neo-stat">
            <span className="neo-stat__value">7 days</span>
            <span className="neo-stat__label">Refund Window</span>
          </div>
          <div className="neo-stat">
            <span className="neo-stat__value">Free</span>
            <span className="neo-stat__label">No Charge Support</span>
          </div>
        </div>

        {/* Main Grid */}
        <div className="neo-support-grid">
          {/* Form */}
          <div>
            <h2 className="sub-heading">Send a message</h2>
            {sent ? (
              <div className="neo-success-banner">
                <div className="neo-success-icon">
                  <CheckCircle size={32} weight="fill" />
                </div>
                <p className="neo-success-title">Message sent successfully!</p>
                <p className="neo-success-sub">
                  We'll respond to your email within 1 business day.<br />
                  Keep your Order ID handy for faster resolution.
                </p>
                <button
                  className="neo-btn neo-btn-sm"
                  onClick={() => { setSent(false); setForm({ name: '', email: '', orderId: '', message: '' }) }}
                >
                  Send another message
                </button>
              </div>
            ) : (
              <div className="neo-card neo-support-form">
                <div className="neo-form-group">
                  <label htmlFor="support-name" className="neo-form-label">Your name</label>
                  <input
                    id="support-name"
                    type="text"
                    className="neo-input"
                    placeholder="Full name"
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="neo-form-group">
                  <label htmlFor="support-email" className="neo-form-label">Email address</label>
                  <input
                    id="support-email"
                    type="email"
                    className="neo-input"
                    placeholder="you@example.com"
                    required
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="neo-form-group">
                  <label htmlFor="support-order" className="neo-form-label">
                    Order ID <span style={{ color: 'var(--neo-text-4)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    id="support-order"
                    type="text"
                    className="neo-input"
                    placeholder="PB-20260926-000124"
                    value={form.orderId}
                    onChange={e => setForm(f => ({ ...f, orderId: e.target.value }))}
                  />
                </div>
                <div className="neo-form-group">
                  <label htmlFor="support-message" className="neo-form-label">Message</label>
                  <textarea
                    id="support-message"
                    className="neo-input neo-textarea"
                    rows={5}
                    placeholder="Describe your issue in detail…"
                    required
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  />
                </div>
                <button type="button" className="neo-btn neo-btn-primary" id="support-submit" onClick={handleSubmit}>
                  <PaperPlaneTilt size={16} weight="bold" />
                  Send Message
                </button>
              </div>
            )}
          </div>

          {/* Contact info */}
          <div className="neo-support-info">
            <h2 className="sub-heading">Contact details</h2>

            <div className="neo-card">
              <div className="neo-contact-row">
                <span className="neo-contact-label">
                  <Envelope size={12} /> Email
                </span>
                <span className="neo-contact-value">
                  <a href="mailto:team1printbooth@gmail.com">team1printbooth@gmail.com</a>
                </span>
              </div>
              <div className="neo-contact-row">
                <span className="neo-contact-label">
                  <Phone size={12} /> Phone
                </span>
                <span className="neo-contact-value">
                  <a href="tel:+919090636363">+91 90906 36363</a>
                </span>
              </div>
              <div className="neo-contact-row">
                <span className="neo-contact-label">
                  <MapPin size={12} /> Office
                </span>
                <span className="neo-contact-value" style={{ fontSize: 13 }}>
                  Homeseva Jijai Nagar, Kothrud, Pune, Maharashtra 411058
                </span>
              </div>
              <div className="neo-contact-row">
                <span className="neo-contact-label">
                  <Clock size={12} /> Response time
                </span>
                <span className="neo-contact-value">Within 1 business day</span>
              </div>
              <div className="neo-contact-row">
                <span className="neo-contact-label">
                  <Receipt size={12} /> Refunds & Payments
                </span>
                <span className="neo-contact-value" style={{ fontSize: 13, color: 'var(--neo-text-3)' }}>
                  Print charges are paid directly to the station merchant. Contact the on-site merchant partner for direct refunds or reprints. See our{' '}
                  <a href="/refunds" style={{ color: 'var(--neo-accent-lt)' }}>refund policy</a>.
                </span>
              </div>
            </div>

            {/* Quick action cards */}
            <div className="neo-card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div className="neo-icon-badge neo-icon-badge-sm">
                  <Lightning size={18} weight="fill" />
                </div>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--neo-text-1)' }}>Quick actions</span>
              </div>
              <Link to="/faq" className="neo-quick-link" style={{ justifyContent: 'space-between' }}>
                <span>Browse FAQ</span>
                <ArrowRight size={14} />
              </Link>
              <Link to="/refunds" className="neo-quick-link" style={{ justifyContent: 'space-between' }}>
                <span>Refund Policy</span>
                <ArrowRight size={14} />
              </Link>
              <Link to="/request-installation" className="neo-quick-link" style={{ justifyContent: 'space-between' }}>
                <span>Buy Machine / Setup</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="neo-info-banner info">
              <div className="neo-info-banner__icon">
                <HeadCircuit size={18} style={{ color: 'var(--neo-info)' }} />
              </div>
              <span>
                For urgent hardware issues at a kiosk, include the kiosk ID (e.g. PB-001) visible on the device.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </Skeleton>
  )
}
