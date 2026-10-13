import SEO from '../../components/common/SEO'
import '../SubPage.css'

export default function TermsPage() {
  return (
    <div className="sub-page">
      <SEO
        title="Terms"
        description="PrintBooth terms of service and conditions for self-service walk-up printing kiosks, payment handling, and hardware usage rules."
        canonicalUrl="https://printbooth.co.in/terms"
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Terms & Conditions', url: '/terms' },
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
              Terms &{' '}
              <span className="sub-hero__title-accent">Conditions</span>
            </h1>
            <p className="sub-hero__sub">
              Please read these terms carefully before using PrintBooth.
            </p>
          </div>
        </div>
      </div>

      <div className="container sub-content">
        <div className="neo-legal-wrap">
          <p className="neo-legal-updated">
            Last updated: September 2026 · Have these terms reviewed by a qualified Indian lawyer before production launch.
          </p>

          <div className="neo-legal-section">
            <h2>1. Introduction</h2>
            <p>PrintBooth ("we", "us", "our") provides self-service document printing services through our website (printbooth.co.in), kiosk devices, and related software. By using any part of our service, you agree to these Terms & Conditions.</p>
          </div>

          <div className="neo-legal-section">
            <h2>2. Eligibility</h2>
            <p>You may use PrintBooth if you are at least 18 years of age, or if you are a minor, with the consent of a parent or guardian. By using the service you confirm that you meet these requirements.</p>
          </div>

          <div className="neo-legal-section">
            <h2>3. User Responsibilities</h2>
            <p>When using PrintBooth, you must:</p>
            <ul>
              <li>Upload only documents you are authorised to reproduce and print.</li>
              <li>Not upload content that is unlawful, infringing, defamatory, obscene, or otherwise prohibited.</li>
              <li>Not upload files containing malware, viruses, or malicious code.</li>
              <li>Not attempt to misuse, manipulate, or bypass the service.</li>
              <li>Provide accurate payment information.</li>
            </ul>
          </div>

          <div className="neo-legal-section">
            <h2>4. Prohibited Content</h2>
            <p>You may not use PrintBooth to reproduce or distribute content that infringes intellectual property rights, violates any applicable law, or constitutes prohibited material under Indian law, including but not limited to content prohibited under the Information Technology Act 2000 and its amendments.</p>
          </div>

          <div className="neo-legal-section">
            <h2>5. Printing Service</h2>
            <p>PrintBooth provides document printing services subject to:</p>
            <ul>
              <li>Supported file formats (PDF in the MVP; additional formats added over time).</li>
              <li>Supported paper sizes (A4 in the MVP).</li>
              <li>Printer and paper availability at the selected kiosk.</li>
              <li>Network connectivity and system availability.</li>
            </ul>
            <p>We do not guarantee uninterrupted availability. Kiosks may become temporarily unavailable due to maintenance, hardware issues, or network conditions.</p>
          </div>

          <div className="neo-legal-section">
            <h2>6. Payment & Direct Merchant Settlement</h2>
            <p>Prices are clearly displayed before payment is processed. By proceeding to payment, you confirm you have reviewed and accepted the price. <strong>PrintBooth is a kiosk automation technology platform and does NOT collect, hold, claim, or retain print payments from users.</strong> Every print payment is made directly by the User (Customer) to the independent Merchant Partner (the venue store owner or host) operating that specific kiosk machine via UPI or linked payment gateway. Transaction references are recorded for technical telemetry and audit purposes.</p>
          </div>

          <div className="neo-legal-section">
            <h2>7. Refunds & Merchant Responsibility</h2>
            <p>Because PrintBooth does not receive, custody, or hold user print funds, <strong>all refund requests, payment disputes, failed prints, paper jams, or reprint requests must be addressed directly with the Merchant Partner of that specific machine.</strong> The store merchant has immediate on-site authority to inspect the printer, trigger a free reprint, or issue a direct refund. PrintBooth provides verified device telemetry logs upon request to assist in resolving disputes. Please refer to our <a href="/refunds">Refund Policy</a> for detailed guidelines.</p>
          </div>

          <div className="neo-legal-section">
            <h2>8. Uploaded Files</h2>
            <p>Uploaded documents are stored temporarily solely for the purpose of fulfilling your print order. Files are automatically deleted within 24 hours of job completion, or within 30 minutes if the order is abandoned without payment. We do not access, read, or share the content of your uploaded documents except where required by law.</p>
          </div>

          <div className="neo-legal-section">
            <h2>9. Kiosk Usage</h2>
            <p>When using a PrintBooth kiosk device:</p>
            <ul>
              <li>Do not damage, tamper with, or physically interfere with the hardware.</li>
              <li>Do not attempt to access the underlying operating system or software.</li>
              <li>Do not insert USB drives containing content other than documents for printing.</li>
              <li>Report damage or malfunction to team1printbooth@gmail.com or call +91 90906 36363.</li>
            </ul>
          </div>

          <div className="neo-legal-section">
            <h2>10. Availability</h2>
            <p>Kiosks may become temporarily unavailable due to maintenance, printer failure, paper or toner depletion, network issues, or other conditions outside our control. We will endeavour to restore service promptly and to notify users of planned maintenance where reasonably practicable.</p>
          </div>

          <div className="neo-legal-section">
            <h2>11. Intellectual Property</h2>
            <p>The PrintBooth software, website, design, and branding are owned by PrintBooth and are protected by applicable intellectual property laws. Your uploaded documents remain your property. You grant us a limited, temporary licence solely to process and print your document.</p>
          </div>

          <div className="neo-legal-section">
            <h2>12. Limitation of Liability</h2>
            <p>To the maximum extent permitted by applicable law, PrintBooth's liability for any claim arising out of or related to the service is limited to the amount paid for the specific print order that gave rise to the claim. We are not liable for indirect, incidental, or consequential losses. <strong>This clause should be reviewed by a qualified Indian lawyer before production launch.</strong></p>
          </div>

          <div className="neo-legal-section">
            <h2>13. Changes to Terms</h2>
            <p>We may update these terms from time to time. Changes will be published on this page with an updated date. Continued use of the service after changes are published constitutes acceptance of the revised terms.</p>
          </div>

          <div className="neo-legal-section">
            <h2>14. Contact</h2>
            <p>For questions about these terms, contact us at <a href="mailto:team1printbooth@gmail.com">team1printbooth@gmail.com</a>, call <a href="tel:+919090636363">+91 90906 36363</a>, or write to PrintBooth, Homeseva Jijai Nagar, Kothrud, Pune, Maharashtra 411058.</p>
          </div>
        </div>

        {/* Related links */}
        <div className="neo-quick-links">
          <a href="/privacy" className="neo-quick-link">Privacy Policy</a>
          <a href="/cookies" className="neo-quick-link">Cookie Policy</a>
          <a href="/refunds" className="neo-quick-link">Refund Policy</a>
          <a href="/contact" className="neo-quick-link">Contact Us</a>
        </div>
      </div>
    </div>
  )
}
