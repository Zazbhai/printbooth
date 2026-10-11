import SEO from '../../components/common/SEO'
import '../SubPage.css'

const cookieTypes = [
  {
    type: 'Essential',
    badge: 'required' as const,
    title: 'Session Cookies',
    desc: 'Maintains your print session while you navigate the upload and payment flow. Expires when your browser session ends.',
    duration: 'Session',
  },
  {
    type: 'Security',
    badge: 'required' as const,
    title: 'CSRF Protection',
    desc: 'Protects against cross-site request forgery attacks. Required for all form submissions on the site.',
    duration: 'Session',
  },
  {
    type: 'Preference',
    badge: 'required' as const,
    title: 'Cookie Consent',
    desc: 'Remembers your cookie consent choice so you are not shown the banner on every visit. Stored in localStorage.',
    duration: '1 year',
  },
  {
    type: 'Analytics',
    badge: 'optional' as const,
    title: 'Analytics Cookies',
    desc: 'Helps us understand how visitors use the site — which pages are visited most, and how users navigate the printing flow. Used to improve the service.',
    duration: '13 months',
  },
  {
    type: 'Marketing',
    badge: 'none' as const,
    title: 'Marketing Cookies',
    desc: 'PrintBooth does not use marketing or advertising cookies in the current version. This will be updated if introduced in future.',
    duration: 'N/A',
  },
]

export default function CookiesPage() {
  return (
    <div className="sub-page">
      <SEO
        title="Cookie Policy — Essential Privacy Disclosures | PrintBooth"
        description="PrintBooth uses strictly necessary cookies for session continuity and CSRF security. We use no marketing or third-party advertising tracking cookies."
        canonicalUrl="https://printbooth.co.in/cookies"
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Cookie Policy', url: '/cookies' },
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
              Cookie <span className="sub-hero__title-accent">Policy</span>
            </h1>
            <p className="sub-hero__sub">
              A transparent explanation of how PrintBooth uses cookies and similar tracking technologies.
            </p>
          </div>
        </div>
      </div>

      <div className="container sub-content">
        {/* Cookie type cards */}
        <div>
          <h2 className="sub-heading">Cookies we use</h2>
          <div className="neo-cookie-grid">
            {cookieTypes.map(ct => (
              <div key={ct.title} className="neo-card neo-cookie-card">
                <div>
                  <p className="neo-cookie-card__type">{ct.type}</p>
                  <p className="neo-cookie-card__title">{ct.title}</p>
                </div>
                <p className="neo-cookie-card__desc">{ct.desc}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span className={`neo-cookie-card__badge ${ct.badge}`}>
                    {ct.badge === 'required' ? 'Required' : ct.badge === 'optional' ? 'Optional' : 'Not used'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--neo-text-4)', fontFamily: 'var(--font-mono, monospace)' }}>
                    {ct.duration}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail sections */}
        <div className="neo-legal-wrap">
          <div className="neo-legal-section">
            <h2>What are cookies?</h2>
            <p>Cookies are small text files stored in your browser when you visit a website. They allow the website to remember information about your visit, such as your preferences or session state. Some cookies are essential for the site to function; others are optional and can be declined.</p>
          </div>

          <div className="neo-legal-section">
            <h2>Essential Cookies</h2>
            <p>These cookies are required for PrintBooth to function correctly. They cannot be disabled without breaking core functionality. They include session management, CSRF protection, and your cookie preference choice.</p>
          </div>

          <div className="neo-legal-section">
            <h2>Analytics Cookies</h2>
            <p>We may use analytics cookies to understand how visitors use the PrintBooth website, which pages are most visited, and how users navigate through the printing flow. This data is used solely to improve the service.</p>
            <p>Analytics cookies are optional. You can decline them using the cookie banner when you first visit the site, or change your preference at any time by clearing your browser's local storage.</p>
            <p>If analytics is implemented, we will update this section to specify the provider and data retention period.</p>
          </div>

          <div className="neo-legal-section">
            <h2>Marketing Cookies</h2>
            <p>PrintBooth does not use marketing or advertising cookies in the current version of the service. This section will be updated if marketing cookies are introduced in a future version.</p>
          </div>

          <div className="neo-legal-section">
            <h2>Managing Cookies</h2>
            <p>You can manage cookies through your browser settings. Note that disabling essential cookies will prevent core features of PrintBooth from working correctly. Analytics cookies can be declined via the cookie consent banner shown on your first visit. To withdraw consent at a later time, clear your browser's localStorage for this site.</p>
          </div>

          <div className="neo-legal-section">
            <h2>Contact</h2>
            <p>For questions about our cookie use: <a href="mailto:team1printbooth@gmail.com">team1printbooth@gmail.com</a></p>
          </div>
        </div>

        <div className="neo-quick-links">
          <a href="/privacy" className="neo-quick-link">Privacy Policy</a>
          <a href="/terms" className="neo-quick-link">Terms & Conditions</a>
          <a href="/contact" className="neo-quick-link">Contact Us</a>
        </div>
      </div>
    </div>
  )
}
