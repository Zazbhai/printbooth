import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { SlidersHorizontal, Info, LifeBuoy, ArrowRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import useMeasure from 'react-use-measure'

const SPRING_CONFIG = {
  type: 'spring',
  stiffness: 200,
  damping: 22,
  mass: 1.2,
} as const

interface NavExpandDetailsProps {
  onNavigate?: (index: number) => void
  activeSection?: number
}

function MotionHamburgerIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <div className="landing-nav__motion-icon" aria-hidden="true">
      <motion.span
        className="motion-icon-line"
        animate={{
          rotate: isOpen ? 45 : 0,
          y: isOpen ? 6 : 0,
          width: isOpen ? 18 : 18,
        }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      />
      <motion.span
        className="motion-icon-line motion-icon-line--mid"
        animate={{
          opacity: isOpen ? 0 : 1,
          scaleX: isOpen ? 0 : 1,
        }}
        transition={{ duration: 0.15 }}
      />
      <motion.span
        className="motion-icon-line"
        animate={{
          rotate: isOpen ? -45 : 0,
          y: isOpen ? -6 : 0,
          width: isOpen ? 18 : 18,
        }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      />
    </div>
  )
}

export default function NavExpandDetails({ onNavigate, activeSection = 0 }: NavExpandDetailsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [ref, bounds] = useMeasure({ offsetSize: true })
  const containerRef = useRef<HTMLDivElement>(null)

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleNavClick = (sectionIndex: number) => {
    setIsOpen(false)
    onNavigate?.(sectionIndex)
  }

  return (
    <div ref={containerRef} className="landing-nav__hamburger-anchor">
      <motion.div
        initial={{ borderRadius: 9999 }}
        animate={{
          width: isOpen ? 210 : 38,
          height: isOpen ? (bounds.height > 0 ? bounds.height : 'auto') : 38,
          borderRadius: isOpen ? 16 : 9999,
        }}
        transition={{
          height: {
            ...SPRING_CONFIG,
            delay: isOpen ? 0.15 : 0,
          },
          width: {
            ...SPRING_CONFIG,
            delay: isOpen ? 0 : 0.2,
          },
          borderRadius: SPRING_CONFIG,
        }}
        className={`landing-nav__hamburger landing-nav__expand-container ${
          isOpen ? 'is-open' : 'is-closed'
        }`}
      >
        <div ref={ref} className="landing-nav__expand-inner">
          <div className="landing-nav__expand-topbar">
            <motion.button
              layout="position"
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              className="landing-nav__expand-trigger"
              aria-expanded={isOpen}
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
            >
              <MotionHamburgerIcon isOpen={isOpen} />
            </motion.button>
          </div>

          <AnimatePresence initial={false} mode="popLayout">
            {isOpen && (
              <motion.div
                initial={{
                  opacity: 0,
                  filter: 'blur(8px)',
                  y: 18,
                }}
                animate={{
                  opacity: 1,
                  filter: 'blur(0px)',
                  y: 0,
                  transition: {
                    type: 'spring',
                    duration: 0.35,
                    bounce: 0,
                    delay: 0.15,
                  },
                }}
                exit={{
                  opacity: 0,
                  filter: 'blur(8px)',
                  y: 12,
                }}
                transition={{
                  type: 'spring',
                  duration: 0.25,
                  bounce: 0,
                }}
                className="landing-nav__expand-content"
              >
                {/* Clean Navigation Links Only */}
                <div className="landing-nav__expand-links">
                  <button
                    type="button"
                    className={`landing-nav__expand-link ${activeSection === 3 ? 'is-active' : ''}`}
                    onClick={() => handleNavClick(3)}
                  >
                    <span className="expand-link-left">
                      <SlidersHorizontal size={14} className="expand-link-icon" />
                      <span>Features</span>
                    </span>
                    <ArrowRight size={13} className="expand-link-arrow" />
                  </button>
                  <button
                    type="button"
                    className={`landing-nav__expand-link ${activeSection === 6 ? 'is-active' : ''}`}
                    onClick={() => handleNavClick(6)}
                  >
                    <span className="expand-link-left">
                      <Info size={14} className="expand-link-icon" />
                      <span>About</span>
                    </span>
                    <ArrowRight size={13} className="expand-link-arrow" />
                  </button>
                  <Link
                    to="/support"
                    className="landing-nav__expand-link"
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="expand-link-left">
                      <LifeBuoy size={14} className="expand-link-icon" />
                      <span>Support</span>
                    </span>
                    <ArrowRight size={13} className="expand-link-arrow" />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
