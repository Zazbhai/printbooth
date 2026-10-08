import React, { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { ChevronDown, X, Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import './Select.css'

export type TSelectData = {
  id: string
  label: string
  value: string
  description?: string
  icon?: string | React.ReactNode
  disabled?: boolean
}

export type SelectProps = {
  id?: string
  data?: TSelectData[]
  defaultValue?: string
  value?: string
  onChange?: (value: string) => void
  title?: string
  placeholder?: string
  className?: string
  dropdownWidth?: number | string
  align?: 'left' | 'right' | 'auto'
}

const itemVariants = {
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

export const Select: React.FC<SelectProps> = ({
  id,
  data = [],
  defaultValue,
  value,
  onChange,
  title = 'Select Option',
  placeholder = 'Select...',
  className = '',
  dropdownWidth,
  align = 'auto',
}) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedItem = data.find((i) => i.value === (value !== undefined ? value : defaultValue)) || data[0]

  // Outside click & ESC dismissal
  useEffect(() => {
    if (!open) return

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('touchstart', handleOutsideClick)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('touchstart', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleSelect = (val: string) => {
    const item = data.find((i) => i.value === val)
    if (item?.disabled) return
    setOpen(false)
    onChange?.(val)
  }

  // Alignment detection
  const [computedAlign, setComputedAlign] = useState<'left' | 'right'>('left')

  useEffect(() => {
    if (!open) return
    if (align === 'right') {
      setComputedAlign('right')
    } else if (align === 'left') {
      setComputedAlign('left')
    } else if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const widthVal = typeof dropdownWidth === 'number' ? dropdownWidth : 300
      const spaceRight = window.innerWidth - rect.left
      if (spaceRight < widthVal + 24 || rect.left > window.innerWidth / 2) {
        setComputedAlign('right')
      } else {
        setComputedAlign('left')
      }
    }
  }, [open, align, dropdownWidth])

  const layoutIdentifier = `dropdown-${(id || title).replace(/\s+/g, '-')}`

  return (
    <MotionConfig
      transition={{
        type: 'spring',
        stiffness: 340,
        damping: 28,
        mass: 0.8,
      }}
    >
      <div
        ref={containerRef}
        id={id}
        className={cn('pb-select-container', className)}
        style={{ zIndex: open ? 70 : 1 }}
      >
        <AnimatePresence mode="popLayout">
          {!open ? (
            <motion.div
              key="trigger"
              layout
              layoutId={layoutIdentifier}
              whileTap={{ scale: 0.98 }}
              whileHover={{ borderColor: 'rgba(220, 38, 38, 0.45)' }}
              onClick={() => setOpen(true)}
              className="pb-select-trigger"
              role="combobox"
              aria-expanded={false}
              aria-haspopup="listbox"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  setOpen(true)
                }
              }}
            >
              <div className="pb-select-trigger-content">
                {selectedItem?.icon && (
                  <span className="pb-select-trigger-icon">
                    {typeof selectedItem.icon === 'string' ? selectedItem.icon : selectedItem.icon}
                  </span>
                )}
                <span className={selectedItem ? 'pb-select-trigger-label' : 'pb-select-trigger-placeholder'}>
                  {selectedItem ? selectedItem.label : placeholder}
                </span>
              </div>
              <div className="pb-select-trigger-arrow">
                <ChevronDown size={16} />
              </div>
            </motion.div>
          ) : (
            <>
              {/* Soft Frosted Backdrop */}
              <div
                className="pb-select-backdrop"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />

              {/* Elevated Dropdown Popover */}
              <motion.div
                key="popover"
                layout
                layoutId={layoutIdentifier}
                initial={{ opacity: 0.8, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1, borderRadius: 16 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className={cn('pb-select-popover', computedAlign === 'right' ? 'align-right' : 'align-left')}
                style={{
                  width: dropdownWidth ? (typeof dropdownWidth === 'number' ? `min(${dropdownWidth}px, 92vw)` : dropdownWidth) : '100%',
                  right: computedAlign === 'right' ? 0 : 'auto',
                  left: computedAlign === 'left' ? 0 : 'auto',
                }}
                role="listbox"
                aria-label={title}
              >
                {/* Header */}
                <motion.div
                  layout
                  className="pb-select-header"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.04 }}
                >
                  <span className="pb-select-title">{title}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpen(false)
                    }}
                    className="pb-select-close-btn"
                    aria-label="Close dropdown"
                  >
                    <X size={13} />
                  </button>
                </motion.div>

                {/* Items List */}
                <div className="pb-select-list">
                  {data.map((item) => {
                    const isSelected = selectedItem?.value === item.value

                    return (
                      <motion.div
                        key={item.id || item.value}
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        onClick={() => handleSelect(item.value)}
                        className={cn(
                          'pb-select-item',
                          isSelected && 'is-selected',
                          item.disabled && 'is-disabled'
                        )}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <div className="pb-select-item-main">
                          {item.icon && (
                            <span className="pb-select-item-icon">
                              {typeof item.icon === 'string' ? item.icon : item.icon}
                            </span>
                          )}
                          <div className="pb-select-item-text">
                            <span className="pb-select-item-label">{item.label}</span>
                            {item.description && (
                              <span className="pb-select-item-desc">{item.description}</span>
                            )}
                          </div>
                        </div>

                        <div className="pb-select-item-indicator">
                          {isSelected ? (
                            <Check size={14} strokeWidth={2.5} />
                          ) : null}
                        </div>
                      </motion.div>
                    )
                  })}
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
