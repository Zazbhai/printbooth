import { useState } from 'react'
import {
  Envelope,
  MapPin,
  Clock,
  PaperPlaneTilt,
  CheckCircle,
  Phone,
  Buildings,
  ChatText,
} from '@phosphor-icons/react'
import { Skeleton } from 'boneyard-js/react'
import { usePageSkeleton } from '../hooks/usePageSkeleton'
import { ContactSkeletonFallback } from '../components/ui/PageSkeletonFallback'
import { submitHelpDeskTicket } from '../lib/api'
import SEO from '../components/common/SEO'
import './SubPage.css'

const channels = [
  {
    icon: Envelope,
    label: 'Email',
    value: 'team1printbooth@gmail.com',
    href: 'mailto:team1printbooth@gmail.com',
    sub: 'We respond within 1 business day',
  },
  {
    icon: Phone,
    label: 'Phone / WhatsApp',
    value: '+91 90906 36363',
    href: 'tel:+919090636363',
    sub: 'Mon–Sat, 9 AM – 6 PM IST',
  },
  {
    icon: MapPin,
    label: 'Registered Office',
    value: 'Homeseva Jijai Nagar, Kothrud, Pune, Maharashtra 411058',
    href: 'https://maps.google.com/?q=Homeseva+Jijai+Nagar,+Kothrud,+Pune,+Maharashtra+411058',
    sub: 'Main Office',
  },
  {
    icon: Clock,
    label: 'Support Hours',
    value: 'Mon – Sat',
    href: null,
    sub: '9:00 AM – 6:00 PM IST',
  },
]

export default function ContactPage() {
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({
    name: '', email: '', phone: '', subject: '', message: '',
  })
  const loading = usePageSkeleton(450)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ticketId = `TKT-${Math.floor(1000 + Math.random() * 9000)}`
    const now = new Date().toISOString()
    const newTicket = {
      id: ticketId,
      senderType: 'USER',
      title: form.subject || `Direct inquiry from ${form.name}`,
      category: 'GENERAL_INQUIRY',
      priority: 'NORMAL',
      status: 'OPEN',
      requesterName: form.name,
      requesterEmail: form.email,
      requesterPhone: form.phone || '',
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
      name="contact-page"
      loading={loading}
      animate="shimmer"
      color="rgba(163, 177, 198, 0.40)"
      darkColor="rgba(255, 255, 255, 0.08)"
      transition={300}
      fallback={<ContactSkeletonFallback />}
    >
      <SEO
        title="Contact Us — Pune Office & Business Inquiries | PrintBooth"
        description="Contact PrintBooth for hardware deployment, partnership inquiries, or customer support. Located in Kothrud, Pune. Phone: +91 9090636363."
        canonicalUrl="https://printbooth.co.in/contact"
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Contact', url: '/contact' },
        ]}
        schema={{
          '@type': 'ContactPage',
          mainEntity: {
            '@type': 'LocalBusiness',
            name: 'PrintBooth Technologies',
            telephone: '+91-9090636363',
            email: 'support@printbooth.co.in',
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'Homeseva Jijai Nagar, Kothrud',
              addressLocality: 'Pune',
              addressRegion: 'Maharashtra',
              postalCode: '411058',
              addressCountry: 'IN',
            },
          },
        }}
      />
      <div className="sub-page">
      {/* Hero */}
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner">
            <span className="sub-hero__eyebrow">
              <span className="sub-hero__eyebrow-dot" />
              Contact Us
            </span>
            <h1 className="sub-hero__title">
              Get in <span className="sub-hero__title-accent">touch</span>
            </h1>
            <p className="sub-hero__sub">
              Have a partnership inquiry, business query, or need help? We'd love to hear from you.
            </p>
          </div>
        </div>
      </div>

      <div className="container sub-content">
        {/* Channel grid */}
        <div className="neo-contact-grid">
          {channels.map(ch => (
            <div key={ch.label} className="neo-card-sm neo-channel-card">
              <div className="neo-icon-badge neo-icon-badge-sm">
                <ch.icon size={18} weight="bold" />
              </div>
              <div className="neo-channel-card__body">
                <span className="neo-channel-card__label">{ch.label}</span>
                <span className="neo-channel-card__value">
                  {ch.href ? (
                    <a href={ch.href}>{ch.value}</a>
                  ) : (
                    ch.value
                  )}
                </span>
                <span className="neo-channel-card__sub">{ch.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Contact Form + Info */}
        <div className="neo-support-grid">
          {/* Form */}
          <div>
            <h2 className="sub-heading">Send a message</h2>
            {sent ? (
              <div className="neo-success-banner">
                <div className="neo-success-icon">
                  <CheckCircle size={32} weight="fill" />
                </div>
                <p className="neo-success-title">Message received!</p>
                <p className="neo-success-sub">
                  Thanks for reaching out. We'll get back to you at <strong>{form.email}</strong> within 1 business day.
                </p>
                <button
                  className="neo-btn neo-btn-sm"
                  onClick={() => { setSent(false); setForm({ name: '', email: '', phone: '', subject: '', message: '' }) }}
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form className="neo-card neo-support-form" onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="neo-form-group">
                    <label htmlFor="contact-name" className="neo-form-label">Full name</label>
                    <input
                      id="contact-name"
                      type="text"
                      className="neo-input"
                      placeholder="John Doe"
                      required
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="neo-form-group">
                    <label htmlFor="contact-email" className="neo-form-label">Email address</label>
                    <input
                      id="contact-email"
                      type="email"
                      className="neo-input"
                      placeholder="you@company.com"
                      required
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="neo-form-group">
                    <label htmlFor="contact-phone" className="neo-form-label">
                      Phone <span style={{ color: 'var(--neo-text-4)', fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input
                      id="contact-phone"
                      type="tel"
                      className="neo-input"
                      placeholder="+91 90906 36363"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div className="neo-form-group">
                    <label htmlFor="contact-subject" className="neo-form-label">Subject</label>
                    <input
                      id="contact-subject"
                      type="text"
                      className="neo-input"
                      placeholder="Partnership / Support / Other"
                      required
                      value={form.subject}
                      onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="neo-form-group">
                  <label htmlFor="contact-message" className="neo-form-label">Message</label>
                  <textarea
                    id="contact-message"
                    className="neo-input neo-textarea"
                    rows={5}
                    placeholder="Tell us how we can help…"
                    required
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  />
                </div>
                <button type="submit" className="neo-btn neo-btn-primary" id="contact-submit">
                  <PaperPlaneTilt size={16} weight="bold" />
                  Send Message
                </button>
              </form>
            )}
          </div>

          {/* Side Info */}
          <div className="neo-support-info">
            <h2 className="sub-heading">Other ways to reach us</h2>

            <div className="neo-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div className="neo-icon-badge neo-icon-badge-sm">
                  <ChatText size={18} weight="bold" />
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--neo-text-1)', marginBottom: 4 }}>
                    Technical Support
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--neo-text-3)', lineHeight: 1.6 }}>
                    For printer kiosk issues, order problems, or payment disputes. Use the form or email us with your Order ID.
                  </p>
                </div>
              </div>
              <div className="neo-divider" />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div className="neo-icon-badge neo-icon-badge-sm">
                  <Buildings size={18} weight="bold" />
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--neo-text-1)', marginBottom: 4 }}>
                    Machine Sales & Partnerships
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--neo-text-3)', lineHeight: 1.6 }}>
                    Interested in purchasing a PrintBooth machine for your shop, campus, or facility?{' '}
                    <a href="/request-installation" style={{ color: 'var(--neo-accent-lt)' }}>
                      Inquire about machine sales →
                    </a>
                  </p>
                </div>
              </div>
            </div>

            <div className="neo-info-banner info">
              <div className="neo-info-banner__icon">
                <Clock size={18} style={{ color: 'var(--neo-info)' }} />
              </div>
              <span>
                Response times may be longer on public holidays. For urgent kiosk hardware issues, include the kiosk ID (e.g. PB-001) in your message.
              </span>
            </div>

            <div className="neo-quick-links">
              <a href="/faq" className="neo-quick-link">FAQ</a>
              <a href="/support" className="neo-quick-link">Support</a>
              <a href="/refunds" className="neo-quick-link">Refunds</a>
            </div>
          </div>
        </div>
      </div>
    </div>
    </Skeleton>
  )
}
