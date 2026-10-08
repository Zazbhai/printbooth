import * as React from 'react'
import { cn } from '@/lib/utils'

interface DropdownContextType {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

const DropdownContext = React.createContext<DropdownContextType>({
  open: false,
  setOpen: () => {},
})

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('pointerdown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
    }
  }, [open])

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div ref={menuRef} className="relative inline-block text-left" data-slot="dropdown-menu">
        {children}
      </div>
    </DropdownContext.Provider>
  )
}

export function DropdownMenuTrigger({ asChild: _asChild, children, className, ...props }: any) {
  const { setOpen } = React.useContext(DropdownContext)
  return (
    <div
      data-slot="dropdown-menu-trigger"
      onClick={() => setOpen((prev) => !prev)}
      className={cn('inline-flex cursor-pointer', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function DropdownMenuContent({ align = 'end', className, children, ...props }: any) {
  const { open } = React.useContext(DropdownContext)
  if (!open) return null

  return (
    <div
      data-slot="dropdown-menu-content"
      className={cn(
        'absolute z-50 mt-1 min-w-[9rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl backdrop-blur-md animate-in fade-in-80',
        align === 'end' ? 'right-0' : 'left-0',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function DropdownMenuItem({ className, children, onClick, ...props }: any) {
  const { setOpen } = React.useContext(DropdownContext)
  return (
    <div
      data-slot="dropdown-menu-item"
      onClick={(e) => {
        onClick?.(e)
        setOpen(false)
      }}
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2.5 py-1.5 text-xs text-foreground/90 outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
