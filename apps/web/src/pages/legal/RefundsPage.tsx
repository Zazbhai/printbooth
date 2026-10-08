import SEO from '../../components/common/SEO'
import '../SubPage.css'
import {
  Storefront,
  Receipt,
  WarningCircle,
  MapPin,
} from '@phosphor-icons/react'

const scenarios = [
  {
    title: 'Payment debited, but printing failed (Paper jam, hardware stoppage, or out of paper)',
    outcome:
      'Payment was transferred directly to the merchant partner of the machine. Approach the on-site store merchant or contact them via the phone/email on your receipt for an immediate free reprint or direct refund.',
  },
  {
    title: 'Duplicate payment debited for the same order',
    outcome:
      'If your UPI app or bank debited your account twice for a single print job, share both transaction reference IDs with the kiosk merchant partner. The merchant will reconcile their ledger and refund the duplicate payment directly to you.',
  },
  {
    title: 'Kiosk machine went offline after payment was confirmed',
    outcome:
      'Notify the merchant partner hosting the machine at the counter. The merchant can restart the kiosk spooler to print your queued job, route you to an adjacent station, or refund your payment immediately on-site.',
  },
  {
    title: 'User entered incorrect print settings or uploaded the wrong document',
    outcome:
      'Because print jobs are sent to the printer hardware immediately upon payment to the merchant, changes or cancellations once printing starts are at the sole discretion of the store merchant. Review your settings carefully on the preview screen before paying.',
  },
  {
    title: 'Payment failed or transaction was declined',
    outcome:
      'No amount was deducted from your account, and no funds were transferred to the merchant. No print job is created and no refund action is needed — you were never charged.',
  },
]

export default function RefundsPage() {
  return (
    <div className="sub-page">
      <SEO
        title="Refund Policy & Dispute Resolution | PrintBooth"
        description="PrintBooth's policy for print failure refunds, duplicate debits, and hardware stoppage. Instant on-site merchant resolutions and direct ledger refunds."
        canonicalUrl="https://printbooth.in/refunds"
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Refund Policy', url: '/refunds' },
        ]}
      />
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner">
            <span className="sub-hero__eyebrow">
              <span className="sub-hero__eyebrow-dot" />
              Legal & Financial Terms
            </span>
            <h1 className="sub-hero__title">
              Refund <span className="sub-hero__title-accent">Policy</span>
            </h1>
            <p className="sub-hero__sub">
              PrintBooth direct merchant settlement terms, customer-to-merchant refund guidelines, and payment dispute resolution.
            </p>
          </div>
        </div>
      </div>

      <div className="container sub-content">

        {/* ─── Core Principle Notice ─── */}
        <div className="neo-info-banner warning" style={{
          background: 'rgba(254, 243, 199, 0.7)',
          border: '1px solid #fde68a',
          borderRadius: 16,
          padding: '1.5rem',
          marginBottom: '2rem',
          display: 'flex',
          gap: '1.25rem',
          alignItems: 'flex-start',
        }}>
          <div style={{ color: '#b45309', flexShrink: 0, marginTop: 2 }}>
            <WarningCircle size={28} weight="fill" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#92400e' }}>
              Important Notice: Direct Merchant Payment & Settlement Architecture
            </h3>
            <p style={{ margin: '0 0 0.65rem', fontSize: '0.94rem', lineHeight: 1.55, color: '#78350f' }}>
              <strong>PrintBooth (the company and technology platform) does NOT claim, collect, retain, or hold any money from users.</strong>
            </p>
            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.55, color: '#78350f' }}>
              Every print transaction is a direct peer-to-merchant agreement between the <strong>User (Customer)</strong> and the independent <strong>Merchant Partner (the store owner or venue host)</strong> whose kiosk printer fulfills the job. When you pay via UPI QR or card gateway, your payment routes directly to the merchant partner's linked business account. Therefore, <strong>all refund requests, payment disputes, or failed print inquiries must be directed to the Merchant Partner of that specific machine.</strong>
            </p>
          </div>
        </div>

        {/* ─── How to Contact the Merchant ─── */}
        <div className="neo-card" style={{ padding: '2rem', marginBottom: '2.5rem' }}>
          <h2 className="sub-heading" style={{ marginTop: 0, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Storefront size={24} weight="fill" style={{ color: 'var(--clr-accent, #dc2626)' }} />
            How to Contact the Merchant Partner of Your Machine
          </h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--clr-text-3)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Because the merchant partner owns and operates the physical printing machine at their store or campus venue, they have immediate on-site authority to inspect the printer, trigger a free reprint, or return your funds directly:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '1.25rem', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 700, color: 'var(--clr-text-1)' }}>
                <Storefront size={20} color="#2563eb" />
                <span>1. On-Site at Store Counter</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--clr-text-3)', lineHeight: 1.45 }}>
                If you are standing at the kiosk, notify the store manager, cashier, or counter attendant immediately. They can inspect the paper tray, fix paper jams, and print your document or refund you on the spot.
              </p>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '1.25rem', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 700, color: 'var(--clr-text-1)' }}>
                <Receipt size={20} color="#059669" />
                <span>2. Digital Receipt & Station Details</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--clr-text-3)', lineHeight: 1.45 }}>
                Your digital order confirmation and receipt display the station ID (e.g. <code>PB-001</code>), store venue name, store address, and the merchant partner's contact phone number and email.
              </p>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '1.25rem', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 700, color: 'var(--clr-text-1)' }}>
                <MapPin size={20} color="#d97706" />
                <span>3. Counter QR Standee Info</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--clr-text-3)', lineHeight: 1.45 }}>
                The acrylic QR standee located on the counter beside the kiosk displays the store's customer service number and station coordinator info for after-hours resolution.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Refund Scenarios ─── */}
        <div>
          <h2 className="sub-heading">Specific Refund Scenarios</h2>
          <div className="neo-card neo-scenario-list" style={{ marginBottom: '2.5rem' }}>
            {scenarios.map((s, i) => (
              <div key={i} className="neo-scenario">
                <div className="neo-scenario__num">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="neo-scenario__body">
                  <p className="neo-scenario__title">{s.title}</p>
                  <p className="neo-scenario__outcome">{s.outcome}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Platform Role & Telemetry Logs ─── */}
        <div className="neo-legal-wrap">
          <div className="neo-legal-section">
            <h2>Role of PrintBooth Technology & Audit Logs</h2>
            <p>
              While PrintBooth does not hold customer funds and cannot debit or credit merchant bank accounts, our automated cloud platform maintains an immutable audit trail of every print job, spooler telemetry event, and payment verification attempt.
            </p>
            <ul>
              <li><strong>Hardware Sensor Logs:</strong> Our system records whether the printer had a paper jam, offline connection, or toner error during your job execution.</li>
              <li><strong>Verification Records:</strong> If the merchant partner requires technical verification that your print was aborted or interrupted, email your Order ID to <a href="mailto:team1printbooth@gmail.com">team1printbooth@gmail.com</a> or call <a href="tel:+919090636363">+91 90906 36363</a>. We will provide verified diagnostic logs to share with the merchant.</li>
              <li><strong>No Platform Surcharge or Custody:</strong> PrintBooth charges no withdrawal or refund fee, as user funds are never held by PrintBooth.</li>
            </ul>
          </div>

          <div className="neo-legal-section">
            <h2>Payment Disputes & Unresponsive Merchants</h2>
            <p>
              In the unlikely event that a merchant partner fails to address a legitimate failed print job or paper jam dispute, please report the venue location and station ID to <a href="mailto:team1printbooth@gmail.com">team1printbooth@gmail.com</a>. While PrintBooth cannot directly reverse merchant bank settlements, we will contact the store owner on your behalf and may suspend or delist non-compliant kiosks from the network.
            </p>
          </div>
        </div>

        {/* ─── Key Summary Stats ─── */}
        <div className="neo-stats">
          <div className="neo-stat">
            <span className="neo-stat__value">100% Direct</span>
            <span className="neo-stat__label">Payment to Merchant</span>
          </div>
          <div className="neo-stat">
            <span className="neo-stat__value">On-Site</span>
            <span className="neo-stat__label">Instant Merchant Resolution</span>
          </div>
          <div className="neo-stat">
            <span className="neo-stat__value">₹0 Held</span>
            <span className="neo-stat__label">No Company Custody</span>
          </div>
        </div>

        {/* ─── Quick Links ─── */}
        <div className="neo-quick-links">
          <a href="/support" className="neo-quick-link">Support & Diagnostics</a>
          <a href="/terms" className="neo-quick-link">Terms & Conditions</a>
          <a href="/privacy" className="neo-quick-link">Privacy Policy</a>
          <a href="/locations" className="neo-quick-link">Find Nearest Station</a>
        </div>
      </div>
    </div>
  )
}
