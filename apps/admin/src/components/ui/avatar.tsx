import * as React from 'react'
import { cn } from '@/lib/utils'

export function Avatar({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('relative flex size-9 shrink-0 overflow-hidden rounded-lg bg-secondary', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function AvatarImage({ src, alt, className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src={src}
      alt={alt}
      className={cn('aspect-square size-full object-cover', className)}
      {...props}
    />
  )
}

export function AvatarFallback({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex size-full items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
