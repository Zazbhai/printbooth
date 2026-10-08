import { useRef, useEffect, useState } from 'react'
import { createTimeline } from 'animejs/timeline'
import { useInView } from '../../hooks/useScrollProgress'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import AnimatedHeading from './AnimatedHeading'

export default function UploadDemo() {
  const sectionRef = useRef<HTMLElement>(null)
  const [hasAnimated, setHasAnimated] = useState(false)
  const isInView = useInView(sectionRef, 0.2)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!isInView || hasAnimated || !sectionRef.current) return
    setHasAnimated(true)

    const container = sectionRef.current
    const allAnimated = container.querySelectorAll('[data-animate]')

    if (reducedMotion) {
      allAnimated.forEach((el) => {
        ;(el as HTMLElement).style.opacity = '1'
        ;(el as HTMLElement).style.transform = 'none'
      })
      return
    }

    const tl = createTimeline({
      defaults: { ease: 'outQuad', duration: 600 },
    })

    const screen = container.querySelector('.upload-screen')
    const qr = container.querySelector('.upload-qr')
    const fileRow = container.querySelector('.upload-file-row')
    const progress = container.querySelector('.upload-progress-fill')
    const status = container.querySelector('.upload-status')

    if (screen) {
      tl.add(screen, { opacity: { to: 1 }, scale: { to: 1 }, duration: 700 })
    }
    if (qr) {
      tl.add(qr, { opacity: { to: 1 }, scale: { to: 1 } }, '+=200')
    }
    if (fileRow) {
      tl.add(fileRow, { opacity: { to: 1 }, translateY: { to: 0 } }, '+=300')
    }
    if (progress) {
      tl.add(progress, { scaleX: { to: 1 }, duration: 1200, ease: 'inOutQuad' }, '+=100')
    }
    if (status) {
      tl.add(status, { opacity: { to: 1 }, translateY: { to: 0 } }, '+=200')
    }
  }, [isInView, hasAnimated, reducedMotion])

  return (
    <section ref={sectionRef} className="landing-upload" aria-label="Upload demonstration">
      <div className="landing-container">
        <div className="demo-layout">
          <div className="demo-text">
            <AnimatedHeading
              text="Upload your document."
              tag="h2"
              duration={800}
            />
          </div>

          <div className="demo-visual">
            <div
              className="upload-screen kiosk-screen"
              style={{ opacity: 0, transform: 'scale(0.95)' }}
            >
              <div className="kiosk-screen__header">
                <span className="kiosk-screen__dot" />
                <span>Upload Document</span>
              </div>

              <div className="kiosk-screen__body">
                <div className="upload-methods">
                  <div
                    className="upload-qr upload-method"
                    style={{ opacity: 0, transform: 'scale(0.9)' }}
                  >
                    <div className="qr-placeholder">
                      <div className="qr-grid">
                        {Array.from({ length: 49 }).map((_, i) => (
                          <div
                            key={i}
                            className="qr-cell"
                            style={{
                              background: Math.random() > 0.4 ? '#111' : 'transparent',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="upload-method__label">Scan QR</span>
                  </div>

                  <div className="upload-method upload-usb">
                    <div className="usb-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 2v10M12 18v4M7 7l5 5 5-5M8 18a4 4 0 108 0" />
                      </svg>
                    </div>
                    <span className="upload-method__label">USB Drive</span>
                  </div>
                </div>

                <div
                  className="upload-file-row"
                  style={{ opacity: 0, transform: 'translateY(20px)' }}
                >
                  <div className="file-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
                      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                    </svg>
                  </div>
                  <div className="file-info">
                    <span className="file-name">assignment.pdf</span>
                    <span className="file-size">2.4 MB · 5 pages</span>
                  </div>
                </div>

                <div className="upload-progress">
                  <div className="upload-progress-track">
                    <div
                      className="upload-progress-fill"
                      style={{ transform: 'scaleX(0)', transformOrigin: 'left' }}
                    />
                  </div>
                </div>

                <div
                  className="upload-status"
                  style={{ opacity: 0, transform: 'translateY(10px)' }}
                >
                  <span className="status-check">✓</span>
                  <span>Document received</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
