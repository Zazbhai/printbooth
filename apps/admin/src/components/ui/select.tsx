import React, { useEffect, useState, useRef } from "react"
import { AnimatePresence, motion, MotionConfig } from "motion/react"
import { ChevronDown, X } from "lucide-react"

export type TSelectData = {
  id: string
  label: string
  value: string
  description?: string
  icon?: string | React.ReactNode
  disabled?: boolean
  custom?: React.ReactNode
}

export type SelectProps = {
  data?: TSelectData[]
  onChange?: (value: string) => void
  defaultValue?: string
  value?: string
  title?: string
  placeholder?: string
  className?: string
  dropdownWidth?: number | string
  size?: "sm" | "md" | "lg"
  align?: "left" | "right" | "auto"
}

export const Select = ({
  data = [],
  defaultValue,
  value,
  onChange,
  title = "Select Option",
  placeholder,
  className = "",
  dropdownWidth = 360,
  size = "md",
  align = "auto",
}: SelectProps) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<TSelectData | undefined>(() => {
    const initialVal = value !== undefined ? value : defaultValue
    if (initialVal) {
      return data.find((i) => i.value === initialVal) || data[0]
    }
    return data[0]
  })

  // Synchronize when external value or defaultValue changes
  useEffect(() => {
    const targetVal = value !== undefined ? value : defaultValue
    if (targetVal !== undefined) {
      const item = data.find((i) => i.value === targetVal)
      if (item) {
        setSelected(item)
      }
    } else if (!selected && data.length > 0) {
      setSelected(data[0])
    }
  }, [value, defaultValue, data])

  // Handle outside click to close
  useEffect(() => {
    if (!open) return
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleOutsideClick)
    document.addEventListener("touchstart", handleOutsideClick)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick)
      document.removeEventListener("touchstart", handleOutsideClick)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  const onSelect = (val: string) => {
    const item = data.find((i) => i.value === val)
    if (item?.disabled) return
    setSelected(item)
    setOpen(false)
    onChange?.(val)
  }

  // Auto-detect boundary alignment if auto
  const [computedAlign, setComputedAlign] = useState<"left" | "right">("right")

  useEffect(() => {
    if (!open) return
    if (align === "right") {
      setComputedAlign("right")
    } else if (align === "left") {
      setComputedAlign("left")
    } else if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const widthVal = typeof dropdownWidth === "number" ? dropdownWidth : 280
      const spaceRight = window.innerWidth - rect.left
      if (spaceRight < widthVal + 24 || rect.left > window.innerWidth / 2) {
        setComputedAlign("right")
      } else {
        setComputedAlign("left")
      }
    }
  }, [open, align, dropdownWidth])

  // Size styling tokens
  const isSmall = size === "sm"

  return (
    <MotionConfig
      transition={{
        type: "spring",
        stiffness: 340,
        damping: 28,
        mass: 0.8,
      }}
    >
      <div
        ref={containerRef}
        className={`relative inline-block max-w-full text-left ${className}`}
        style={{ zIndex: open ? 70 : 1 }}
      >
        <AnimatePresence mode="popLayout">
          {!open ? (
            <motion.div
              whileTap={{ scale: 0.97 }}
              whileHover={{ borderColor: "rgba(220, 38, 38, 0.4)" }}
              animate={{
                borderRadius: isSmall ? 20 : 26,
              }}
              layout
              layoutId={`dropdown-${title.replace(/\s+/g, "-")}`}
              onClick={() => setOpen(true)}
              className="cursor-pointer select-none overflow-hidden border border-input bg-background shadow-sm transition-colors hover:shadow w-full max-w-full"
              style={{
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
              }}
            >
              <SelectItem
                item={selected}
                placeholder={placeholder}
                size={size}
              />
            </motion.div>
          ) : (
            <>
              {/* Optional click capture backdrop */}
              <div
                className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px] md:bg-transparent"
                onClick={() => setOpen(false)}
              />

              <motion.div
                layout
                animate={{
                  borderRadius: 16,
                  opacity: 1,
                  scale: 1,
                }}
                initial={{
                  opacity: 0.8,
                  scale: 0.98,
                }}
                exit={{
                  opacity: 0,
                  scale: 0.96,
                }}
                layoutId={`dropdown-${title.replace(/\s+/g, "-")}`}
                className={`absolute ${computedAlign === 'right' ? 'right-0' : 'left-0'} top-0 z-50 overflow-hidden border border-border bg-card py-2 shadow-xl`}
                style={{
                  width: typeof dropdownWidth === "number" ? `min(${dropdownWidth}px, calc(100vw - 32px))` : dropdownWidth,
                  maxWidth: "calc(100vw - 32px)",
                  boxShadow: "0 16px 36px -4px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(0, 0, 0, 0.08)",
                }}
              >
                <Head title={title} setOpen={setOpen} />
                <div className="w-full max-h-[300px] overflow-y-auto px-1">
                  {data.map((item) => (
                    <SelectItem
                      key={item.id}
                      order={item.value}
                      noDescription={false}
                      item={item}
                      isSelected={selected?.value === item.value}
                      onChange={onSelect}
                      size={size}
                    />
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}

export default Select

const Head = ({
  title,
  setOpen,
}: {
  title: string
  setOpen: (open: boolean) => void
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ delay: 0.05 }}
      layout
      className="flex items-center justify-between border-b border-border/60 px-4 py-2.5"
    >
      <motion.strong layout className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </motion.strong>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(false)
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        aria-label="Close dropdown"
      >
        <X size={12} />
      </button>
    </motion.div>
  )
}

type SelectItemProps = {
  item?: TSelectData
  placeholder?: string
  noDescription?: boolean
  order?: string
  isSelected?: boolean
  onChange?: (val: string) => void
  size?: "sm" | "md" | "lg"
}

const animation = {
  hidden: {
    opacity: 0,
    y: 8,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.22,
    },
  },
  exit: {
    opacity: 0,
    y: 6,
    transition: {
      duration: 0.15,
    },
  },
}

const SelectItem = ({
  item,
  placeholder = "Select...",
  noDescription = true,
  order,
  isSelected = false,
  onChange,
  size = "md",
}: SelectItemProps) => {
  const isSmall = size === "sm"

  return (
    <motion.div
      className={`group flex cursor-pointer select-none items-center justify-between gap-2 transition-colors w-full min-w-0 max-w-full ${
        noDescription
          ? isSmall
            ? "px-3 py-1.5"
            : "px-3.5 py-2"
          : "rounded-lg px-3 py-2.5 hover:bg-accent hover:text-accent-foreground"
      } ${isSelected && !noDescription ? "bg-accent/80 font-semibold" : ""}`}
      variants={animation}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={() => {
        if (order !== undefined) {
          onChange?.(order)
        }
      }}
    >
      <div className="flex flex-1 items-center gap-2.5 min-w-0 overflow-hidden">
        {item?.icon && (
          <motion.div
            layout
            layoutId={noDescription ? `icon-${item.id}` : undefined}
            className={`flex shrink-0 items-center justify-center rounded-full border border-input bg-card shadow-2xs ${
              isSmall ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm"
            }`}
          >
            {typeof item.icon === "string" ? (
              <span>{item.icon}</span>
            ) : (
              item.icon
            )}
          </motion.div>
        )}
        <motion.div layout className="flex flex-col min-w-0 flex-1 overflow-hidden">
          <motion.strong
            layoutId={noDescription && item?.id ? `label-${item.id}` : undefined}
            className={`truncate font-medium text-foreground block w-full max-w-full ${
              isSmall ? "text-xs" : "text-sm"
            }`}
          >
            {item ? item.label : placeholder}
          </motion.strong>
          {!noDescription && item?.description && (
            <span className="truncate text-[11px] text-muted-foreground mt-0.5 block w-full max-w-full">
              {item.description}
            </span>
          )}
        </motion.div>
      </div>

      {noDescription ? (
        <motion.div
          layout
          className="flex shrink-0 items-center justify-center pl-1 text-muted-foreground transition-transform group-hover:text-foreground"
        >
          <ChevronDown size={isSmall ? 14 : 16} />
        </motion.div>
      ) : item?.custom ? (
        <div className="shrink-0 pl-2">{item.custom}</div>
      ) : isSelected ? (
        <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
      ) : null}
    </motion.div>
  )
}
