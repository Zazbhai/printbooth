import React, { forwardRef, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './ShimmerButton.css'

export interface ShimmerButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string
  shimmerSize?: string
  borderRadius?: string
  shimmerDuration?: string
  background?: string
  variant?: 'primary' | 'stealth' | 'ghost'
  className?: string
  children?: ReactNode
  to?: string
  href?: string
}

export const ShimmerButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ShimmerButtonProps
>(
  (
    {
      shimmerColor,
      shimmerSize = '1.5px',
      shimmerDuration = '2.8s',
      borderRadius = '3px',
      background,
      variant = 'primary',
      className = '',
      children,
      to,
      href,
      style,
      ...props
    },
    ref
  ) => {
    // Default theme colors based on variant
    let defaultShimmer = shimmerColor
    let defaultBg = background

    if (!defaultShimmer) {
      if (variant === 'primary') defaultShimmer = '#ffffff'
      else if (variant === 'ghost') defaultShimmer = 'rgba(220, 38, 38, 0.65)'
      else defaultShimmer = '#dc2626'
    }

    if (!defaultBg) {
      if (variant === 'primary') defaultBg = '#dc2626'
      else if (variant === 'ghost') defaultBg = '#ffffff'
      else defaultBg = '#ffffff'
    }

    const customStyles: CSSProperties = {
      '--spread': '90deg',
      '--shimmer-color': defaultShimmer,
      '--radius': borderRadius,
      '--speed': shimmerDuration,
      '--cut': shimmerSize,
      '--bg': defaultBg,
      ...style,
    } as CSSProperties

    const combinedClassName = `shimmer-button shimmer-button--${variant} ${className}`.trim()

    const innerContent = (
      <>
        {/* Spark container */}
        <div className="shimmer-spark-container" aria-hidden="true">
          <div className="shimmer-spark">
            <div className="shimmer-spark-spin" />
          </div>
        </div>

        {/* Content */}
        <span className="shimmer-button__content">{children}</span>

        {/* Highlight Layer */}
        <div className="shimmer-highlight" aria-hidden="true" />

        {/* Inner Backdrop (masks center, exposing perimeter gap) */}
        <div className="shimmer-backdrop" aria-hidden="true" />
      </>
    )

    if (to) {
      return (
        <Link
          to={to}
          style={customStyles}
          className={combinedClassName}
          ref={ref as React.Ref<HTMLAnchorElement>}
          {...(props as any)}
        >
          {innerContent}
        </Link>
      )
    }

    if (href) {
      return (
        <a
          href={href}
          style={customStyles}
          className={combinedClassName}
          ref={ref as React.Ref<HTMLAnchorElement>}
          {...(props as any)}
        >
          {innerContent}
        </a>
      )
    }

    return (
      <button
        style={customStyles}
        className={combinedClassName}
        ref={ref as React.Ref<HTMLButtonElement>}
        {...props}
      >
        {innerContent}
      </button>
    )
  }
)

ShimmerButton.displayName = 'ShimmerButton'

export default ShimmerButton
