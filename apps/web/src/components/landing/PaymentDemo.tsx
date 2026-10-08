import { useRef, useEffect, useState } from 'react'
import { createTimeline } from 'animejs/timeline'
import { stagger } from 'animejs/utils'
import { useInView } from '../../hooks/useScrollProgress'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import AnimatedHeading from './AnimatedHeading'

const orderLines = [
  { label: 'assignment.pdf', value: '' },
  { label: '5 pages', value: '' },
  { label: 'A4 · B&W · Duplex', value: '' },
]

export default function PaymentDemo() {
  const sectionRef = useRef<HTMLElement>(null)
  const [hasAnimated, setHasAnimated] = useState(false)
  const isInView = useInView(sectionRef, 0.15)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!isInView || hasAnimated || !sectionRef.current) return
    setHasAnimated(true)

    const container = sectionRef.current

    if (reducedMotion) {
      container.querySelectorAll('[data-animate]').forEach((el) => {
        ;(el as HTMLElement).style.opacity = '1'
        ;(el as HTMLElement).style.transform = 'none'
      })
      // Also reveal non-data-animate items
      container.querySelectorAll('.payment-order-line, .payment-total, .payment-qr-wrap, .payment-scan-line, .payment-confirmed').forEach((el) => {
        ;(el as HTMLElement).style.opacity = '1'
        ;(el as HTMLElement).style.transform = 'none'
      })
      return
    }

    const tl = createTimeline({
      defaults: { ease: 'outQuad', duration: 500 },
    })

    const lines = container.querySelectorAll('.payment-order-line')
    const total = container.querySelector('.payment-total')
    const qr = container.querySelector('.payment-qr-wrap')
    const scanLine = container.querySelector('.payment-scan-line')
    const confirmed = container.querySelector('.payment-confirmed')

    if (lines.length > 0) {
      tl.add(lines, {
        opacity: { to: 1 },
        translateX: { to: 0 },
        delay: stagger(80),
      })
    }

    if (total) {
      tl.add(total, { opacity: { to: 1 }, scale: { to: 1 } }, '+=200')
    }

    if (qr) {
      tl.add(qr, { opacity: { to: 1 }, scale: { to: 1 }, duration: 700 }, '+=300')
    }

    if (scanLine) {
      tl.add(scanLine, {
        translateY: { to: 140 },
        duration: 1500,
        ease: 'inOutQuad',
        loop: 1,
        alternate: true,
      }, '+=100')
    }

    if (confirmed) {
      tl.add(confirmed, {
        opacity: { to: 1 },
        scale: { to: 1 },
        duration: 600,
      }, '+=400')
    }
  }, [isInView, hasAnimated, reducedMotion])

  return (
    <section ref={sectionRef} className="landing-payment" aria-label="Payment demonstration">
      <div className="landing-container">
        <div className="demo-layout">
          <div className="demo-text">
            <AnimatedHeading
              text="Pay in seconds."
              tag="h2"
              duration={800}
            />
          </div>

          <div className="demo-visual">
            <div className="payment-screen kiosk-screen kiosk-screen--dark">
              <div className="kiosk-screen__header">
                <span className="kiosk-screen__dot kiosk-screen__dot--light" />
                <span>Payment</span>
              </div>

              <div className="kiosk-screen__body">
                <div className="payment-order">
                  <div className="payment-order__label">ORDER</div>
                  {orderLines.map((line, i) => (
                    <div
                      key={i}
                      className="payment-order-line"
                      style={{ opacity: 0, transform: 'translateX(-20px)' }}
                    >
                      {line.label}
                    </div>
                  ))}
                </div>

                <div
                  className="payment-total"
                  style={{ opacity: 0, transform: 'scale(0.9)' }}
                >
                  <span className="payment-total__label">TOTAL</span>
                  <span className="payment-total__amount">₹10</span>
                </div>

                <div
                  className="payment-qr-wrap"
                  style={{ opacity: 0, transform: 'scale(0.9)' }}
                >
                  <div className="payment-qr">
                    <div className="qr-grid qr-grid--large">
                      {Array.from({ length: 81 }).map((_, i) => (
                        <div
                          key={i}
                          className="qr-cell"
                          style={{
                            background: Math.random() > 0.35 ? '#fff' : 'transparent',
                          }}
                        />
                      ))}
                    </div>
                    <div
                      className="payment-scan-line"
                      style={{ transform: 'translateY(0)' }}
                    />
                  </div>
                  <span className="payment-qr__label">UPI</span>
                </div>

                <div
                  className="payment-confirmed"
                  style={{ opacity: 0, transform: 'scale(0.8)' }}
                >
                  <span className="payment-confirmed__check">✓</span>
                  <span className="payment-confirmed__text">PAYMENT CONFIRMED</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
