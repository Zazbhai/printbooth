import { useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { useLocation } from 'react-router-dom'

// Apple HIG spring presets
const SPRING_ENTER = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.9 }
const SPRING_EXIT  = { type: 'spring' as const, stiffness: 400, damping: 38, mass: 0.8 }

const pageVariants = {
  initial: { opacity: 0, y: 12, scale: 0.992, filter: 'blur(2px)' },
  enter:   {
    opacity: 1, y: 0, scale: 1, filter: 'blur(0px)',
    transition: { ...SPRING_ENTER, opacity: { duration: 0.18, ease: [0.16, 1, 0.3, 1] }, filter: { duration: 0.2, ease: 'easeOut' } },
  },
  exit: {
    opacity: 0, y: -8, scale: 0.996, filter: 'blur(1px)',
    transition: { ...SPRING_EXIT, duration: 0.15, opacity: { duration: 0.12, ease: 'easeIn' } },
  },
}

const reducedVariants = {
  initial: { opacity: 0 },
  enter:   { opacity: 1, transition: { duration: 0.12 } },
  exit:    { opacity: 0, transition: { duration: 0.08 } },
}

interface PageTransitionProps {
  children: React.ReactNode
  animKey?: string
  disabled?: boolean
}

export default function PageTransition({ children, animKey, disabled = false }: PageTransitionProps) {
  const location = useLocation()
  const shouldReduceMotion = useReducedMotion()
  const key = animKey ?? location.pathname
  if (disabled) return <>{children}</>
  const variants = shouldReduceMotion ? reducedVariants : pageVariants
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div key={key} variants={variants} initial="initial" animate="enter" exit="exit"
        style={{ width: '100%', willChange: 'transform, opacity' }}>
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export function RevealOnScroll({ children, delay = 0, className }: {
  children: React.ReactNode; delay?: number; className?: string
}) {
  const shouldReduceMotion = useReducedMotion()
  if (shouldReduceMotion) return <div className={className}>{children}</div>
  return (
    <motion.div className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  )
}

export function StaggerReveal({ children, stagger = 0.07, className }: {
  children: React.ReactNode[]; stagger?: number; className?: string
}) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <div className={className}>
      {children.map((child, i) =>
        shouldReduceMotion ? <div key={i}>{child}</div> : (
          <motion.div key={i}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.5, delay: i * stagger, ease: [0.16, 1, 0.3, 1] }}>
            {child}
          </motion.div>
        )
      )}
    </div>
  )
}

export function Pressable({ children, className, onClick, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  const shouldReduceMotion = useReducedMotion()
  if (shouldReduceMotion) return <div className={className} onClick={onClick} {...rest}>{children}</div>
  return (
    <motion.div className={className} onClick={onClick}
      whileHover={{ scale: 1.015, y: -1 }}
      whileTap={{ scale: 0.975, y: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      style={{ cursor: 'pointer' }}
      {...(rest as any)}>
      {children}
    </motion.div>
  )
}

export function useSmoothScroll() {
  const lenisRef = useRef<any>(null)
  useEffect(() => {
    let raf: number
    async function init() {
      try {
        const { default: Lenis } = await import('lenis')
        const lenis = new Lenis({
          duration: 1.15,
          easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          smoothWheel: true,
          wheelMultiplier: 0.85,
          touchMultiplier: 1.8,
          infinite: false,
        })
        lenisRef.current = lenis
        function animate(time: number) { lenis.raf(time); raf = requestAnimationFrame(animate) }
        raf = requestAnimationFrame(animate)
      } catch { /* lenis not available — native scroll */ }
    }
    init()
    return () => { cancelAnimationFrame(raf); lenisRef.current?.destroy() }
  }, [])
  return lenisRef
}
