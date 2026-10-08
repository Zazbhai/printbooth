import { useState, useEffect } from 'react'
import './CookieBanner.css'

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('pb_cookie_consent')
    if (!consent) {
      setTimeout(() => setVisible(true), 1500)
    }
  }, [])

  function accept() {
    localStorage.setItem('pb_cookie_consent', 'accepted')
    setVisible(false)
  }

  function reject() {
    localStorage.setItem('pb_cookie_consent', 'essential-only')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie consent" aria-live="polite">
      <div className="cookie-banner__content">
        <p className="cookie-banner__text">
          We use essential cookies to operate PrintBooth. With your permission, we may also use
          analytics cookies to understand how the website is used.{' '}
          <a href="/cookies" className="cookie-banner__link">Cookie Policy</a>
        </p>
        <div className="cookie-banner__actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={reject}
            id="cookie-reject"
          >
            Reject Optional
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={accept}
            id="cookie-accept"
          >
            Accept Optional Cookies
          </button>
        </div>
      </div>
    </div>
  )
}
