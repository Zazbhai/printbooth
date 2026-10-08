import { stagger } from 'animejs/utils'
import { createTimeline } from 'animejs/timeline'

export function animateUploadDemo(container: HTMLElement) {
  const tl = createTimeline({
    defaults: { ease: 'outQuad', duration: 600 },
  })

  const qr = container.querySelector('.upload-qr')
  const fileIcon = container.querySelector('.upload-file-icon')
  const progressBar = container.querySelector('.upload-progress-fill')
  const statusText = container.querySelector('.upload-status')

  if (qr) {
    tl.add(qr, {
      opacity: { to: 1 },
      scale: { to: 1 },
    })
  }

  if (fileIcon) {
    tl.add(fileIcon, {
      opacity: { to: 1 },
      translateY: { to: 0 },
    }, '+=200')
  }

  if (progressBar) {
    tl.add(progressBar, {
      scaleX: { to: 1 },
      duration: 1200,
      ease: 'inOutQuad',
    }, '+=100')
  }

  if (statusText) {
    tl.add(statusText, {
      opacity: { to: 1 },
      translateY: { to: 0 },
    }, '+=200')
  }

  return tl
}

export function animatePaymentFlow(container: HTMLElement) {
  const tl = createTimeline({
    defaults: { ease: 'outQuad', duration: 500 },
  })

  const orderDetails = container.querySelectorAll('.payment-order-line')
  const total = container.querySelector('.payment-total')
  const qr = container.querySelector('.payment-qr')
  const scanLine = container.querySelector('.payment-scan-line')
  const confirmation = container.querySelector('.payment-confirmed')

  if (orderDetails.length > 0) {
    tl.add(orderDetails, {
      opacity: { to: 1 },
      translateX: { to: 0 },
      delay: stagger(80),
    })
  }

  if (total) {
    tl.add(total, {
      opacity: { to: 1 },
      scale: { to: 1 },
    }, '+=100')
  }

  if (qr) {
    tl.add(qr, {
      opacity: { to: 1 },
      scale: { to: 1 },
      duration: 700,
    }, '+=200')
  }

  if (scanLine) {
    tl.add(scanLine, {
      translateY: { to: 160 },
      duration: 1200,
      ease: 'inOutQuad',
      loop: 2,
      alternate: true,
    }, '+=100')
  }

  if (confirmation) {
    tl.add(confirmation, {
      opacity: { to: 1 },
      scale: { to: 1 },
      duration: 600,
    }, '+=200')
  }

  return tl
}

export function animatePrintingProgress(container: HTMLElement) {
  const tl = createTimeline({
    defaults: { ease: 'outQuad', duration: 400 },
  })

  const pages = container.querySelectorAll('.printing-page-status')

  pages.forEach((page, i) => {
    tl.add(page, {
      opacity: { to: 1 },
      translateX: { to: 0 },
    }, `+=${i === 0 ? 300 : 500}`)
  })

  const complete = container.querySelector('.printing-complete')
  if (complete) {
    tl.add(complete, {
      opacity: { to: 1 },
      scale: { to: 1 },
      duration: 700,
    }, '+=400')
  }

  return tl
}
