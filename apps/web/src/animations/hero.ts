import { animate } from 'animejs'
import { stagger } from 'animejs/utils'

export function animateHeroText(container: HTMLElement) {
  const lines = container.querySelectorAll('.hero-line')
  const subtitle = container.querySelector('.hero-subtitle')
  const desc = container.querySelector('.hero-desc')
  const ctas = container.querySelector('.hero-ctas')

  if (lines.length > 0) {
    animate(lines, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 1000,
      ease: 'outQuad',
      delay: stagger(120, { start: 600 }),
    })
  }

  if (subtitle) {
    animate(subtitle, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 800,
      ease: 'outQuad',
      delay: 1200,
    })
  }

  if (desc) {
    animate(desc, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 800,
      ease: 'outQuad',
      delay: 1400,
    })
  }

  if (ctas) {
    animate(ctas, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 600,
      ease: 'outQuad',
      delay: 1600,
    })
  }
}

export function animateHeroScrollOut(
  container: HTMLElement,
  progress: number
) {
  const lines = container.querySelectorAll('.hero-line')
  const subtitle = container.querySelector('.hero-subtitle') as HTMLElement
  const desc = container.querySelector('.hero-desc') as HTMLElement
  const ctas = container.querySelector('.hero-ctas') as HTMLElement

  lines.forEach((line, i) => {
    const el = line as HTMLElement
    const staggeredProgress = Math.max(0, Math.min((progress - i * 0.05) * 2, 1))
    el.style.opacity = `${1 - staggeredProgress}`
    el.style.transform = `translateY(${-staggeredProgress * 60}px)`
  })

  if (subtitle) {
    const p = Math.max(0, Math.min((progress - 0.1) * 3, 1))
    subtitle.style.opacity = `${1 - p}`
    subtitle.style.transform = `translateY(${-p * 40}px)`
  }

  if (desc) {
    const p = Math.max(0, Math.min((progress - 0.15) * 3, 1))
    desc.style.opacity = `${1 - p}`
    desc.style.transform = `translateY(${-p * 40}px)`
  }

  if (ctas) {
    const p = Math.max(0, Math.min((progress - 0.2) * 3, 1))
    ctas.style.opacity = `${1 - p}`
    ctas.style.transform = `translateY(${-p * 30}px)`
  }
}
