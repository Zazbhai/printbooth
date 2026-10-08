import { animate } from 'animejs'
import { stagger } from 'animejs/utils'

export function animateNavIn(navElement: HTMLElement) {
  const logo = navElement.querySelector('.landing-nav__brand')
  const links = navElement.querySelectorAll('.landing-nav__link')
  const cta = navElement.querySelector('.landing-nav__cta')

  if (logo) {
    animate(logo, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 800,
      ease: 'outQuad',
      delay: 200,
    })
  }

  if (links.length > 0) {
    animate(links, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 600,
      ease: 'outQuad',
      delay: stagger(60, { start: 400 }),
    })
  }

  if (cta) {
    animate(cta, {
      opacity: { to: 1 },
      scale: { to: 1 },
      duration: 600,
      ease: 'outQuad',
      delay: 700,
    })
  }
}

export function animateNavBackground(
  navElement: HTMLElement,
  scrolled: boolean
) {
  animate(navElement, {
    backgroundColor: scrolled
      ? 'rgba(255, 255, 255, 0.95)'
      : 'rgba(255, 255, 255, 0)',
    duration: 400,
    ease: 'outQuad',
  })
}
