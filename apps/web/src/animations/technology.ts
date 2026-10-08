import { animate } from 'animejs'
import { stagger } from 'animejs/utils'

export function animateTechComponents(container: HTMLElement) {
  const components = container.querySelectorAll('.tech-component')

  if (components.length > 0) {
    animate(components, {
      opacity: { to: 1 },
      translateY: { to: 0 },
      duration: 700,
      ease: 'outQuad',
      delay: stagger(100, { start: 200 }),
    })
  }
}

export function animateArchitectureFlow(container: HTMLElement) {
  const nodes = container.querySelectorAll('.arch-node')
  const connectors = container.querySelectorAll('.arch-connector')
  const packets = container.querySelectorAll('.arch-packet')

  if (nodes.length > 0) {
    animate(nodes, {
      opacity: { to: 1 },
      scale: { to: 1 },
      duration: 500,
      ease: 'outQuad',
      delay: stagger(120, { start: 100 }),
    })
  }

  if (connectors.length > 0) {
    animate(connectors, {
      scaleY: { to: 1 },
      duration: 400,
      ease: 'outQuad',
      delay: stagger(120, { start: 300 }),
    })
  }

  if (packets.length > 0) {
    animate(packets, {
      translateY: { to: 40 },
      opacity: [
        { to: 1, duration: 200 },
        { to: 0, duration: 200, delay: 200 },
      ],
      duration: 1200,
      ease: 'inOutQuad',
      loop: true,
      delay: stagger(300, { start: 800 }),
    })
  }
}

export function animateMonitoringDashboard(container: HTMLElement) {
  const values = container.querySelectorAll('.monitor-value')
  const bars = container.querySelectorAll('.monitor-bar-fill')

  if (values.length > 0) {
    animate(values, {
      opacity: { to: 1 },
      duration: 600,
      ease: 'outQuad',
      delay: stagger(80, { start: 200 }),
    })
  }

  if (bars.length > 0) {
    animate(bars, {
      scaleX: { to: 1 },
      duration: 800,
      ease: 'outQuad',
      delay: stagger(100, { start: 400 }),
    })
  }
}
