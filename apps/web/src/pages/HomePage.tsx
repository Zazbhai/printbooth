import '../components/landing/Landing.css'
import '../components/landing/LandingNeomorphism.css'
import LandingPage from '../components/landing/LandingPage'
import SEO from '../components/common/SEO'

export default function HomePage() {
  return (
    <>
      <SEO
        title="PrintBooth — Autonomous Self-Service Printing Kiosks"
        description="PrintBooth is India's autonomous walk-up printing network. Direct browser upload, instant UPI QR payments, zero-cloud data retention, and automated release in under 90 seconds."
        canonicalUrl="https://printbooth.in/"
      />
      <LandingPage />
    </>
  )
}
