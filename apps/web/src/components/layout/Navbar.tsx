import { useState, useEffect } from 'react'
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { List, X } from '@phosphor-icons/react'
import RubberSegment from '../ui/RubberSegment'
import './Navbar.css'

const navLinks = [
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/locations', label: 'Locations' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/request-installation', label: 'Buy Machine' },
  { to: '/faq', label: 'FAQ' },
  { to: '/support', label: 'Support' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const activeNavPath = navLinks.some((l) => l.to === location.pathname) ? location.pathname : undefined

  return (
    <header className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`} role="banner">
      <div className="navbar__inner container">
        {/* Brand */}
        <Link to="/" className="navbar__brand" aria-label="PrintBooth — Home">
          PrintBooth
        </Link>

        {/* Desktop nav with React Bits RubberSegment */}
        <nav className="navbar__links" aria-label="Main navigation">
          <RubberSegment
            items={navLinks.map((link) => ({ value: link.to, label: link.label }))}
            value={activeNavPath}
            defaultValue="/how-it-works"
            onChange={(to) => navigate(to)}
            trackColor="rgba(15, 23, 42, 0.05)"
            thumbColor="#dc2626"
            textColor="#475569"
            activeTextColor="#ffffff"
            size="md"
            radius={12}
            inset={3}
            equalSlots={false}
            stretch={70}
            squash={3}
            speed={1.15}
            glide={65}
            draggable
            className="navbar__rubber-segment"
          />
        </nav>

        {/* CTA */}
        <div className="navbar__actions">
          <Link to="/print" className="btn btn-primary btn-sm" id="nav-start-printing">
            Start Printing
          </Link>
          <button
            className="navbar__hamburger btn btn-ghost btn-sm"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
          >
            {menuOpen ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="navbar__mobile" aria-label="Mobile navigation">
          {navLinks.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `navbar__mobile-link ${isActive ? 'navbar__mobile-link--active' : ''}`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <Link to="/print" className="btn btn-primary" id="nav-mobile-start-printing">
            Start Printing
          </Link>
        </div>
      )}
    </header>
  )
}
