import { Link } from 'react-router-dom'
import { HandPointing, MapPin } from '@phosphor-icons/react'
import SEO from '../components/common/SEO'
import './NotFoundPage.css'

export interface NotFoundPageProps {
  title?: string
  message?: string
  kioskId?: string
}

export default function NotFoundPage({ title, message, kioskId }: NotFoundPageProps = {}) {
  const displayTitle = title || (kioskId ? `PrintBooth ${kioskId} Not Found` : 'This page is gone.')
  const displayMessage =
    message ||
    (kioskId
      ? `PrintBooth station '${kioskId}' is not registered or does not exist in our network.`
      : "...maybe the page you're looking for is not found or never existed.")

  return (
    <div className="notfound-wrapper">
      <SEO
        title="404 — Page Not Found | PrintBooth"
        description="The requested page or print station does not exist on PrintBooth."
        noIndex={true}
      />
      <div className="container">
        <div className="gif">
          <img
            src="https://i.postimg.cc/2yrFyxKv/giphy.gif"
            onError={(e) => {
              e.currentTarget.src = '/giphy-404.gif'
            }}
            alt="Page not found"
          />
        </div>
        <div className="content">
          <h1 className="main-heading">{displayTitle}</h1>
          <p>{displayMessage}</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <button type="button" id="notfound-home-btn">
                <span>Back to home</span>
                <HandPointing size={22} weight="regular" />
              </button>
            </Link>
            {kioskId && (
              <Link to="/locations" style={{ textDecoration: 'none' }}>
                <button
                  type="button"
                  style={{
                    background: 'rgba(15, 23, 42, 0.08)',
                    color: '#0f172a',
                    boxShadow: 'none',
                    border: '1px solid rgba(15, 23, 42, 0.15)',
                  }}
                >
                  <span>Find Available Kiosks</span>
                  <MapPin size={20} weight="duotone" />
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
