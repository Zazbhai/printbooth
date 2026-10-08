import { animate } from 'animejs'
import { stagger } from 'animejs/utils'

export function animateProductSpecs(container: HTMLElement) {
  const specs = container.querySelectorAll('.spec-item')
  if (specs.length > 0) {
    animate(specs, {
      opacity: { to: 1 },
      translateX: { to: 0 },
      duration: 600,
      ease: 'outQuad',
      delay: stagger(80, { start: 200 }),
    })
  }
}

export function animateProductEnter(container: HTMLElement) {
  const heading = container.querySelector('.product-heading')
  const subheading = container.querySelector('.product-subheading')

  if (heading) {
    animate(heading, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 900,
      ease: 'outQuad',
      delay: 100,
    })
  }

  if (subheading) {
    animate(subheading, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 800,
      ease: 'outQuad',
      delay: 300,
    })
  }
}
