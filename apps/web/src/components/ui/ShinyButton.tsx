"use client";

import React from "react";
import { motion, type MotionProps } from "motion/react";
import "./ShinyButton.css";

// ─── ShinyButton ─────────────────────────────────────────────────────────────
// Magic UI ShinyButton with vibrant PrintBooth red theme and animated arrows.
// ─────────────────────────────────────────────────────────────────────────────

const animationProps: MotionProps = {
  initial: { "--x": "100%", scale: 0.8 } as never,
  animate: { "--x": "-100%", scale: 1 } as never,
  whileTap: { scale: 0.96 } as never,
  transition: {
    repeat: Infinity,
    repeatType: "loop",
    repeatDelay: 1,
    type: "spring",
    stiffness: 20,
    damping: 15,
    mass: 2,
    scale: {
      type: "spring",
      stiffness: 200,
      damping: 5,
      mass: 0.5,
    },
  },
};

interface ShinyButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof MotionProps>,
    MotionProps {
  children: React.ReactNode;
  className?: string;
  /** Variant: primary (crimson red) | ghost (dark glass with red hover) */
  variant?: "primary" | "ghost";
}

export const ShinyButton = React.forwardRef<HTMLButtonElement, ShinyButtonProps>(
  ({ children, className = "", variant = "primary", style, ...props }, ref) => {
    const isPrimary = variant === "primary";

    return (
      <motion.button
        ref={ref}
        className={`shiny-btn shiny-btn--${variant} ${className}`}
        style={
          {
            ...style,
          } as React.CSSProperties
        }
        {...animationProps}
        {...props}
      >
        {/* Clean text and content layer — 100% visible */}
        <span className="shiny-btn__text">
          {children}
        </span>

        {/* Dynamic moving sheen highlight overlay */}
        <span
          className="shiny-btn__sheen"
          style={{
            backgroundImage: isPrimary
              ? `linear-gradient(-75deg, transparent calc(var(--x) + 15%), rgba(255,255,255,0.45) calc(var(--x) + 25%), transparent calc(var(--x) + 35%))`
              : `linear-gradient(-75deg, transparent calc(var(--x) + 15%), rgba(220,38,38,0.18) calc(var(--x) + 25%), transparent calc(var(--x) + 35%))`,
          }}
        />

        {/* Animated border sheen laser overlay */}
        <span
          className="shiny-btn__border"
          style={{
            mask: "linear-gradient(rgb(0,0,0), rgb(0,0,0)) content-box exclude, linear-gradient(rgb(0,0,0), rgb(0,0,0))",
            WebkitMask:
              "linear-gradient(rgb(0,0,0), rgb(0,0,0)) content-box exclude, linear-gradient(rgb(0,0,0), rgb(0,0,0))",
            backgroundImage: isPrimary
              ? `linear-gradient(-75deg, rgba(239,68,68,0.2) calc(var(--x) + 20%), rgba(255,255,255,0.95) calc(var(--x) + 25%), rgba(239,68,68,0.2) calc(var(--x) + 100%))`
              : `linear-gradient(-75deg, rgba(0,0,0,0.04) calc(var(--x) + 20%), rgba(220,38,38,0.6) calc(var(--x) + 25%), rgba(0,0,0,0.04) calc(var(--x) + 100%))`,
          }}
        />
      </motion.button>
    );
  }
);

ShinyButton.displayName = "ShinyButton";
