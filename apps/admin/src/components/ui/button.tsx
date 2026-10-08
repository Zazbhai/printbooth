import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild: _asChild, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
          variant === 'default' && 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
          variant === 'secondary' && 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 border border-border',
          variant === 'destructive' && 'bg-destructive text-white shadow-xs hover:bg-destructive/90',
          variant === 'outline' && 'border border-border bg-card text-foreground shadow-xs hover:bg-secondary hover:text-foreground',
          variant === 'ghost' && 'hover:bg-accent hover:text-accent-foreground',
          variant === 'link' && 'text-primary underline-offset-4 hover:underline',
          size === 'default' && 'h-9 px-4 py-2',
          size === 'sm' && 'h-8 rounded-md px-3 text-xs',
          size === 'lg' && 'h-10 rounded-md px-8',
          size === 'icon' && 'size-8 p-0',
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
