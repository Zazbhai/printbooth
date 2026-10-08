import { animate } from 'animejs'
import { stagger } from 'animejs/utils'

/**
 * Animate text reveal: words rise from behind a clipping mask.
 * Elements should have overflow:hidden with inner spans starting at translateY(110%).
 */
export function animateTextReveal(
  elements: NodeListOf<Element> | Element[],
  options?: {
    delay?: number
    staggerMs?: number
    duration?: number
    ease?: string
  }
) {
  const {
    delay = 0,
    staggerMs = 60,
    duration = 800,
    ease = 'outQuad',
  } = options ?? {}

  animate(elements, {
    opacity: { to: 1 },
    translateY: { to: 0 },
    duration,
    ease,
    delay: stagger(staggerMs, { start: delay }),
  })
}

/**
 * Animate a counter from 0 to target value.
 */
export function animateCounter(
  element: HTMLElement,
  targetValue: number,
  options?: {
    duration?: number
    suffix?: string
    prefix?: string
  }
) {
  const { duration = 1200, suffix = '', prefix = '' } = options ?? {}
  const obj = { value: 0 }

  animate(obj, {
    value: { to: targetValue },
    duration,
    ease: 'outQuad',
    onRender: () => {
      element.textContent = `${prefix}${Math.round(obj.value)}${suffix}`
    },
  })
}

/**
 * Animate elements entering from a direction.
 */
export function animateEnter(
  elements: NodeListOf<Element> | Element[] | Element,
  direction: 'up' | 'down' | 'left' | 'right' = 'up',
  options?: {
    delay?: number
    duration?: number
    staggerMs?: number
    distance?: number
  }
) {
  const {
    delay = 0,
    duration = 800,
    staggerMs = 80,
    distance = 60,
  } = options ?? {}

  const translateProp =
    direction === 'up' || direction === 'down' ? 'translateY' : 'translateX'
  const from = direction === 'up' || direction === 'left' ? distance : -distance

  const targets =
    elements instanceof Element ? elements : elements

  animate(targets, {
    opacity: { to: 1 },
    [translateProp]: { from, to: 0 },
    duration,
    ease: 'outQuad',
    delay:
      targets instanceof Element
        ? delay
        : stagger(staggerMs, { start: delay }),
  })
}

/**
 * Fade out elements.
 */
export function animateExit(
  elements: NodeListOf<Element> | Element[] | Element,
  options?: {
    duration?: number
    delay?: number
  }
) {
  const { duration = 400, delay = 0 } = options ?? {}

  animate(elements, {
    opacity: { to: 0 },
    duration,
    ease: 'outQuad',
    delay,
  })
}
