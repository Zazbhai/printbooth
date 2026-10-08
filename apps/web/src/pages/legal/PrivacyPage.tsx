import SEO from '../../components/common/SEO'
import '../SubPage.css'

export default function PrivacyPage() {
  return (
    <div className="sub-page">
      <SEO
        title="Privacy Policy — Zero Cloud Data Retention | PrintBooth"
        description="PrintBooth's privacy policy. We enforce a zero-cloud data retention architecture. Your documents are decrypted locally and purged automatically after printing."
        canonicalUrl="https://printbooth.in/privacy"
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Privacy Policy', url: '/privacy' },
        ]}
      />
      <div className="sub-hero">
        <div className="container">
          <div className="sub-hero__inner">
            <span className="sub-hero__eyebrow">
              <span className="sub-hero__eyebrow-dot" />
              Legal
            </span>
            <h1 className="sub-hero__title">
              Privacy <span className="sub-hero__title-accent">Policy</span>
            </h1>
            <p className="sub-hero__sub">
              How PrintBooth collects, uses, and protects your information.
            </p>
          </div>
        </div>
      </div>

      <div className="container sub-content">
        <div className="neo-legal-wrap">
          <p className="neo-legal-updated">
            Last updated: September 2026 · Review by a qualified legal professional is recommended before production launch.
          </p>

          <div className="neo-legal-section">
            <h2>1. Information We Collect</h2>
            <p>We collect only information necessary to provide the printing service:</p>
            <ul>
              <li><strong>Technical information:</strong> IP address, browser type, device type, and operating system.</li>
              <li><strong>Order information:</strong> Order ID, selected kiosk, print settings, and page count.</li>
              <li><strong>Payment reference:</strong> Transaction reference number from our payment gateway (not card or UPI credentials).</li>
              <li><strong>Uploaded documents:</strong> Stored temporarily solely to fulfil your print order.</li>
              <li><strong>Kiosk usage data:</strong> Which kiosk was used, timestamps, and job status.</li>
              <li><strong>Support requests:</strong> Name, email, and message content submitted via our support form.</li>
            </ul>
            <p>We do not collect information we do not need.</p>
          </div>

          <div className="neo-legal-section">
            <h2>2. How We Use Your Information</h2>
            <ul>
              <li>Processing and fulfilling print orders.</li>
              <li>Verifying payment.</li>
              <li>Providing customer support.</li>
              <li>Detecting and preventing fraud and misuse.</li>
              <li>Improving our service.</li>
              <li>Complying with applicable legal obligations.</li>
            </ul>
          </div>

          <div className="neo-legal-section">
            <h2>3. Uploaded Documents</h2>
            <p>Your uploaded document is stored temporarily on our servers for the sole purpose of printing. We do not read, analyse, or share the content of your documents. Files are stored using an internal identifier, not your original filename. Files are automatically deleted:</p>
            <ul>
              <li>Unpaid uploads: within 30 minutes of upload.</li>
              <li>Completed jobs: within 24 hours of completion.</li>
              <li>Failed or abandoned jobs: within 24 hours.</li>
            </ul>
            <p>Retention periods are configurable and may be shortened in future versions.</p>
          </div>

          <div className="neo-legal-section">
            <h2>4. Payment Information</h2>
            <p>Payments are processed through a third-party UPI/payment gateway. We do not store your UPI ID, bank account details, or card credentials. We retain only the payment gateway transaction reference number, which is required for order tracking, refund processing, and accounting.</p>
          </div>

          <div className="neo-legal-section">
            <h2>5. Sharing Your Information</h2>
            <p>We share information only where necessary:</p>
            <ul>
              <li><strong>Payment providers:</strong> To process and verify transactions.</li>
              <li><strong>Cloud infrastructure providers:</strong> For hosting, storage, and computing services.</li>
              <li><strong>Print agent (kiosk):</strong> Your document is transmitted to the selected kiosk device.</li>
              <li><strong>Authorities:</strong> Where required by applicable law or legal process.</li>
            </ul>
            <p>We do not sell your information to third parties.</p>
          </div>

          <div className="neo-legal-section">
            <h2>6. Security</h2>
            <p>We implement reasonable technical safeguards including HTTPS encryption in transit, access controls, input validation, file type and size checks, and virus scanning. We cannot guarantee that unauthorised access will never occur, but we maintain appropriate measures proportionate to the risks involved.</p>
          </div>

          <div className="neo-legal-section">
            <h2>7. Data Retention</h2>
            <ul>
              <li><strong>Uploaded documents:</strong> Deleted automatically as described in Section 3.</li>
              <li><strong>Order records:</strong> Retained for accounting, support, and legal compliance purposes for a reasonable period.</li>
              <li><strong>Server logs:</strong> Retained for a limited period for security and debugging.</li>
            </ul>
          </div>

          <div className="neo-legal-section">
            <h2>8. Your Rights</h2>
            <p>Depending on applicable law, you may have rights regarding your personal information. Please contact us at <a href="mailto:team1printbooth@gmail.com">team1printbooth@gmail.com</a> to exercise any rights. We will respond in accordance with applicable requirements. The precise rights available to you depend on the laws applicable to your situation.</p>
          </div>

          <div className="neo-legal-section">
            <h2>9. Contact</h2>
            <p>For privacy-related questions, contact: <a href="mailto:team1printbooth@gmail.com">team1printbooth@gmail.com</a>, call <a href="tel:+919090636363">+91 90906 36363</a>, or write to PrintBooth, Homeseva Jijai Nagar, Kothrud, Pune, Maharashtra 411058.</p>
          </div>
        </div>

        <div className="neo-quick-links">
          <a href="/terms" className="neo-quick-link">Terms & Conditions</a>
          <a href="/cookies" className="neo-quick-link">Cookie Policy</a>
          <a href="/refunds" className="neo-quick-link">Refund Policy</a>
          <a href="/contact" className="neo-quick-link">Contact Us</a>
        </div>
      </div>
    </div>
  )
}
