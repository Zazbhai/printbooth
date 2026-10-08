import * as React from 'react'
import { cn } from '@/lib/utils'

interface SidebarContextType {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  openMobile: boolean
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextType>({
  open: true,
  setOpen: () => {},
  openMobile: false,
  setOpenMobile: () => {},
  isMobile: false,
  toggleSidebar: () => {},
})

export function useSidebar() {
  return React.useContext(SidebarContext)
}

export function SidebarProvider({
  defaultOpen = true,
  className,
  style,
  children,
}: {
  defaultOpen?: boolean
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const [openMobile, setOpenMobile] = React.useState(false)
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 1024)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((prev) => !prev)
    } else {
      setOpen((prev) => !prev)
    }
  }, [isMobile])

  return (
    <SidebarContext.Provider
      value={{
        open,
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile,
        toggleSidebar,
      }}
    >
      <div
        data-slot="sidebar-wrapper"
        style={style}
        className={cn('group/sidebar-wrapper flex min-h-svh w-full text-sidebar-foreground', className)}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

export function Sidebar({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { openMobile, setOpenMobile, isMobile } = useSidebar()

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && openMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity"
          onClick={() => setOpenMobile(false)}
        />
      )}

      <aside
        data-slot="sidebar"
        data-mobile={isMobile ? 'true' : 'false'}
        className={cn(
          'flex flex-col bg-sidebar border-r border-sidebar-border text-sidebar-foreground transition-all duration-300 z-50',
          isMobile
            ? cn(
                'fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl transform',
                openMobile ? 'translate-x-0' : '-translate-x-full'
              )
            : 'relative w-[var(--sidebar-width,16rem)] shrink-0 min-h-svh',
          className
        )}
        {...props}
      >
        {children}
      </aside>
    </>
  )
}

export function SidebarHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn('flex flex-col gap-2 p-4 border-b border-sidebar-border/40', className)}
      {...props}
    />
  )
}

export function SidebarContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-4 custom-scrollbar-x', className)}
      {...props}
    />
  )
}

export function SidebarFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn('flex flex-col gap-2 p-4 border-t border-sidebar-border/40', className)}
      {...props}
    />
  )
}

export function SidebarGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
      {...props}
    />
  )
}

export function SidebarGroupLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        'duration-200 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none',
        className
      )}
      {...props}
    />
  )
}

export function SidebarGroupContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-group-content"
      className={cn('w-full text-sm', className)}
      {...props}
    />
  )
}

export function SidebarMenu({
  className,
  ...props
}: React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn('flex w-full min-w-0 flex-col gap-1 list-none p-0 m-0', className)}
      {...props}
    />
  )
}

export function SidebarMenuItem({
  className,
  ...props
}: React.HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn('group/menu-item relative list-none', className)}
      {...props}
    />
  )
}

export interface SidebarMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string
}

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ asChild: _asChild, isActive, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        data-slot="sidebar-menu-button"
        data-active={isActive ? 'true' : 'false'}
        className={cn(
          'peer/menu-button flex w-full items-center gap-3 overflow-hidden rounded-md p-2 text-left text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 cursor-pointer border-0 bg-transparent',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
SidebarMenuButton.displayName = 'SidebarMenuButton'

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { toggleSidebar } = useSidebar()
  return (
    <button
      data-slot="sidebar-trigger"
      type="button"
      onClick={(e) => {
        onClick?.(e)
        toggleSidebar()
      }}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer border border-border/40 bg-secondary/30',
        className
      )}
      {...props}
    >
      <svg
        className="size-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
      <span className="sr-only">Toggle Sidebar</span>
    </button>
  )
}
