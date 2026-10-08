import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { useLocation } from 'react-router-dom'

const SPRING_ENTER = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.9 }
const SPRING_EXIT  = { type: 'spring' as const, stiffness: 400, damping: 38, mass: 0.8 }

const pageVariants = {
  initial: { opacity: 0, y: 10, scale: 0.994, filter: 'blur(1.5px)' },
  enter:   {
    opacity: 1, y: 0, scale: 1, filter: 'blur(0px)',
    transition: { ...SPRING_ENTER, opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] }, filter: { duration: 0.18 } },
  },
  exit: {
    opacity: 0, y: -6, scale: 0.997,
    transition: { ...SPRING_EXIT, duration: 0.13, opacity: { duration: 0.1, ease: 'easeIn' } },
  },
}

const reducedVariants = {
  initial: { opacity: 0 },
  enter:   { opacity: 1, transition: { duration: 0.1 } },
  exit:    { opacity: 0, transition: { duration: 0.07 } },
}

interface PageTransitionProps {
  children: React.ReactNode
  animKey?: string
}

export default function PageTransition({ children, animKey }: PageTransitionProps) {
  const location = useLocation()
  const shouldReduceMotion = useReducedMotion()
  const key = animKey ?? location.pathname
  const variants = shouldReduceMotion ? reducedVariants : pageVariants
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div key={key} variants={variants} initial="initial" animate="enter" exit="exit"
        style={{ width: '100%', flex: 1, willChange: 'transform, opacity' }}>
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
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  )
}

export function StaggerReveal({ children, stagger = 0.06, className }: {
  children: React.ReactNode[]; stagger?: number; className?: string
}) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <div className={className}>
      {children.map((child, i) =>
        shouldReduceMotion ? <div key={i}>{child}</div> : (
          <motion.div key={i}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.4, delay: i * stagger, ease: [0.16, 1, 0.3, 1] }}>
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
      whileHover={{ scale: 1.012, y: -1 }}
      whileTap={{ scale: 0.978, y: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      style={{ cursor: 'pointer' }}
      {...(rest as any)}>
      {children}
    </motion.div>
  )
}
