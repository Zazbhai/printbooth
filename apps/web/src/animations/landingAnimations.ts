/**
 * PrintBooth Landing Page Animation Bridge
 * Coordinates with the hardware-accelerated CSS Kinetic Typography & Text Revealing Engine.
 * Ensures zero layout shifts, zero main-thread jank, and instantaneous GPU compositor execution.
 */

export const isMobileOrTouch = (): boolean => {
  if (typeof window === 'undefined') return false
  return (
    window.innerWidth <= 1024 ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1024px)').matches) ||
    'ontouchstart' in window
  )
}

/**
 * Resets inline styles so hardware CSS keyframe animations execute cleanly.
 */
export function clearInlineStyles(container: HTMLElement, selectors: string[]) {
  selectors.forEach((sel) => {
    container.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      el.style.opacity = ''
      el.style.transform = ''
      el.style.filter = ''
    })
  })
}

/**
 * Fallback immediate reveal for touch/reduced motion.
 */
export function revealAllOnMobile(container: HTMLElement, selectors: string[]) {
  clearInlineStyles(container, selectors)
}

/* ─────────────────────────────────────────────────────────────
   HERO SECTION (Section 0)
   ───────────────────────────────────────────────────────────── */
export function animateHeroIn(container: HTMLElement) {
  clearInlineStyles(container, [
    '.hero-badge',
    '.hero-line',
    '.hero-subtitle',
    '.hero-desc',
    '.hero-specs-strip',
    '.hero-ctas',
  ])
  return null
}

export function animateHeroOut(container: HTMLElement) {
  clearInlineStyles(container, [
    '.hero-badge',
    '.hero-line',
    '.hero-subtitle',
    '.hero-desc',
    '.hero-specs-strip',
    '.hero-ctas',
  ])
  return null
}

export const animateHeroEntrance = animateHeroIn

/* ─────────────────────────────────────────────────────────────
   PROBLEM SECTION (Section 1)
   ───────────────────────────────────────────────────────────── */
export function animateProblemIn(container: HTMLElement) {
  clearInlineStyles(container, [
    '.problem-eyebrow',
    '.problem-heading',
    '.problem-word',
    '.problem-stat-badge',
    '.problem-fault-card',
    '.problem-item',
  ])
  return null
}

export function animateProblemOut(container: HTMLElement) {
  clearInlineStyles(container, [
    '.problem-eyebrow',
    '.problem-heading',
    '.problem-word',
    '.problem-fault-card',
    '.problem-item',
  ])
  return null
}

export const animateProblemReveal = animateProblemIn

/* ─────────────────────────────────────────────────────────────
   PRODUCT SECTION (Section 2)
   ───────────────────────────────────────────────────────────── */
export function animateProductIn(container: HTMLElement) {
  clearInlineStyles(container, [
    '.product-eyebrow',
    '.product-heading',
    '.product-sub',
    '.product-spec-card',
    '.glass-label',
  ])
  return null
}

export function animateProductOut(container: HTMLElement) {
  clearInlineStyles(container, [
    '.product-eyebrow',
    '.product-heading',
    '.product-sub',
    '.product-spec-card',
    '.glass-label',
  ])
  return null
}

/* ─────────────────────────────────────────────────────────────
   HOW IT WORKS SECTION (Section 3)
   ───────────────────────────────────────────────────────────── */
export function animateWorkflowIn(container: HTMLElement) {
  clearInlineStyles(container, [
    '.workflow-eyebrow',
    '.workflow-header',
    '.workflow-title',
    '.workflow-subtitle',
    '.workflow-step-item',
    '.roadmap-spine',
    '.roadmap-step-card',
  ])
  return null
}

export function animateWorkflowOut(container: HTMLElement) {
  clearInlineStyles(container, [
    '.workflow-header',
    '.workflow-title',
    '.workflow-subtitle',
    '.roadmap-step-card',
  ])
  return null
}

export const animateWorkflowReveal = animateWorkflowIn

/* ─────────────────────────────────────────────────────────────
   COMPARISON SECTION (Section 4)
   ───────────────────────────────────────────────────────────── */
export function animateComparisonIn(container: HTMLElement) {
  clearInlineStyles(container, [
    '.cmp-eyebrow',
    '.cmp-header',
    '.cmp-heading',
    '.cmp-frosted-stage',
    '.cmp-item-row',
    '.cmp-stat-card',
  ])
  return null
}

export function animateComparisonOut(container: HTMLElement) {
  clearInlineStyles(container, [
    '.cmp-header',
    '.cmp-heading',
    '.cmp-frosted-stage',
    '.cmp-stat-card',
  ])
  return null
}

/* ─────────────────────────────────────────────────────────────
   DEALER SECTION (Section 5)
   ───────────────────────────────────────────────────────────── */
export function animateDealerIn(container: HTMLElement) {
  clearInlineStyles(container, [
    '.dlr-eyebrow',
    '.dlr-heading',
    '.dlr-sub',
    '.dlr-pillar-card',
    '.dlr-rule',
    '.dlr-cta',
  ])
  return null
}

export function animateDealerOut(container: HTMLElement) {
  clearInlineStyles(container, [
    '.dlr-heading',
    '.dlr-sub',
    '.dlr-pillar-card',
    '.dlr-cta',
  ])
  return null
}

/* ─────────────────────────────────────────────────────────────
   TECHNOLOGY SECTION (Section 6)
   ───────────────────────────────────────────────────────────── */
export function animateTechIn(container: HTMLElement) {
  clearInlineStyles(container, [
    '.tech-eyebrow',
    '.tech-heading',
    '.tech-sub',
    '.tech-component',
    '.tech-module-card',
    '.tech-item',
  ])
  return null
}

export function animateTechOut(container: HTMLElement) {
  clearInlineStyles(container, [
    '.tech-heading',
    '.tech-sub',
    '.tech-component',
    '.tech-item',
  ])
  return null
}

/* ─────────────────────────────────────────────────────────────
   FINAL CTA SECTION (Section 7)
   ───────────────────────────────────────────────────────────── */
export function animateFinalIn(container: HTMLElement) {
  clearInlineStyles(container, [
    '.final-launch-header',
    '.final-launch-title',
    '.final-launch-subtitle',
    '.final-bento-card',
    '.final-trust-strip',
  ])
  return null
}

/* ─────────────────────────────────────────────────────────────
   UTILITY FOR REDUCED MOTION
   ───────────────────────────────────────────────────────────── */
export function showAllImmediately(container: HTMLElement, selectors: string[]) {
  selectors.forEach((sel) => {
    container.querySelectorAll(sel).forEach((el) => {
      const htmlEl = el as HTMLElement
      htmlEl.style.opacity = '1'
      htmlEl.style.transform = 'none'
      htmlEl.style.filter = 'none'
    })
  })
}
