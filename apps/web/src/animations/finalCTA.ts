import { animate } from 'animejs'

export function animateFinalCTA(container: HTMLElement) {
  const heading = container.querySelector('.final-heading')
  const subtext = container.querySelector('.final-subtext')
  const buttons = container.querySelectorAll('.final-cta-btn')

  if (heading) {
    animate(heading, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 1000,
      ease: 'outQuad',
      delay: 100,
    })
  }

  if (subtext) {
    animate(subtext, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 800,
      ease: 'outQuad',
      delay: 400,
    })
  }

  if (buttons.length > 0) {
    animate(buttons, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 600,
      ease: 'outQuad',
      delay: 700,
    })
  }
}
