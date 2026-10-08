"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import {
  Bell,
  MessageCircle,
  Award,
  Calendar,
  Tag,
  CheckSquare,
  ChevronUp,
  Check,
  CheckCheck,
  X,
  ArrowUpRight,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import "./activity-dropdown.css"
import { getActivities } from '@/lib/api'

export interface Activity {
  id: string | number
  icon?: React.ReactNode
  iconBg?: string
  title: string
  description: string
  time: string
  isRead?: boolean
  type?: string
  source?: string
  category?: string
  actionUrl?: string
  actionLabel?: string
  meta?: Record<string, any>
}

export interface ActivityDropdownProps {
  items?: Activity[]
  title?: string
  subtitle?: string
  className?: string
  defaultOpen?: boolean
  onMarkRead?: (id: string | number) => void
  onMarkUnread?: (id: string | number) => void
  onMarkAllRead?: () => void
  onOpenItem?: (activity: Activity) => void
}

const DEFAULT_FLEET_ACTIVITIES: Activity[] = [
  {
    id: 'ACT-001',
    icon: <Award className="h-4 w-4" />,
    iconBg: 'bg-emerald-50 text-emerald-600',
    title: 'Zero Commission Payout Engine Activated',
    description: 'PrintBooth operates on a 100% direct merchant revenue model. All student and customer print payments transfer directly to merchant partner accounts nationwide with 0% platform commission cut.',
    time: '2h ago',
    isRead: false,
    type: 'COMMISSION',
    source: 'National Revenue Settlement Daemon',
  },
  {
    id: 'ACT-002',
    icon: <Calendar className="h-4 w-4" />,
    iconBg: 'bg-blue-50 text-blue-600',
    title: 'IPO Readiness Cohort Telemetry Synchronized',
    description: 'Daily, monthly, and lifetime unified footfall, page counts, and financial aggregation data are active. Real-time exports in CSV format enabled for investment prospectus.',
    time: '4h ago',
    isRead: false,
    type: 'IPO',
    source: 'Executive Telemetry Core',
  },
  {
    id: 'ACT-003',
    icon: <CheckSquare className="h-4 w-4" />,
    iconBg: 'bg-slate-50 text-slate-600',
    title: 'Hardware & CUPS Daemons Nominal',
    description: 'Automated health probes across all enrolled kiosks report normal operational parameters: toner and paper supplies above threshold with zero spooler stalls.',
    time: '1d ago',
    isRead: true,
    type: 'HARDWARE',
    source: 'Fleet IoT Automation System',
  },
]

export function ActivityDropdown({
  items: controlledItems,
  title,
  subtitle,
  className,
  defaultOpen = false,
  onMarkRead,
  onMarkUnread,
  onMarkAllRead,
  onOpenItem,
}: ActivityDropdownProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [internalItems, setInternalItems] = useState<Activity[]>([])
  const [localReadIds, setLocalReadIds] = useState<Set<string | number>>(new Set())
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load activities if not controlled by parent
  useEffect(() => {
    if (controlledItems) return

    let mounted = true
    async function loadActivities() {
      try {
        const data = await getActivities()
        if (mounted) {
          if (Array.isArray(data) && data.length > 0) {
            const mapped: Activity[] = data.map((a: any) => ({
              id: a.activityId || a._id,
              icon:
                a.iconType === 'award' ? (
                  <Award className="h-4 w-4" />
                ) : a.iconType === 'calendar' ? (
                  <Calendar className="h-4 w-4" />
                ) : a.iconType === 'tag' ? (
                  <Tag className="h-4 w-4" />
                ) : a.iconType === 'task' ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                ),
              iconBg: 'bg-slate-100 text-slate-700',
              title: a.title,
              description: a.description || a.message || '',
              time: a.timeAgo || 'Just Now',
              isRead: Boolean(a.isRead),
              type: a.type || 'SYSTEM',
              source: a.createdBy || 'Platform Fleet Operations',
            }))
            setInternalItems(mapped)
          } else {
            setInternalItems(DEFAULT_FLEET_ACTIVITIES)
          }
        }
      } catch {
        if (mounted) {
          setInternalItems(DEFAULT_FLEET_ACTIVITIES)
        }
      }
    }
    loadActivities()
    return () => {
      mounted = false
    }
  }, [controlledItems])

  const activeItems = controlledItems ?? internalItems

  // Determine unread items
  const unreadItems = activeItems.filter((item) => {
    if (controlledItems) {
      return !item.isRead
    }
    return !item.isRead && !localReadIds.has(item.id)
  })

  const unreadCount = unreadItems.length

  const displayTitle = title ?? (
    unreadCount > 0
      ? `${unreadCount} New Activit${unreadCount === 1 ? 'y' : 'ies'}`
      : 'All Caught Up'
  )

  const displaySubtitle = subtitle ?? (
    unreadCount > 0
      ? `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`
      : "You're completely up to date"
  )

  // Handle opening an individual notification in full
  const handleOpenFullNotification = (activity: Activity) => {
    setSelectedActivity(activity)
    const isCurrentlyRead = controlledItems
      ? Boolean(activity.isRead)
      : Boolean(activity.isRead || localReadIds.has(activity.id))

    if (!isCurrentlyRead) {
      if (onMarkRead) {
        onMarkRead(activity.id)
      } else {
        setLocalReadIds((prev) => new Set([...prev, activity.id]))
      }
    }

    if (onOpenItem) {
      onOpenItem(activity)
    }
  }

  // Handle closing modal
  const handleCloseFullNotification = () => {
    setSelectedActivity(null)
  }

  // Handle marking an individual item read without opening modal
  const handleMarkItemRead = (e: React.MouseEvent, id: string | number) => {
    e.stopPropagation()
    if (onMarkRead) {
      onMarkRead(id)
    } else {
      setLocalReadIds((prev) => new Set([...prev, id]))
    }
  }

  // Toggle read status from inside the full modal
  const handleToggleModalReadStatus = (activityId: string | number) => {
    const isCurrentlyRead = controlledItems
      ? Boolean(activeItems.find((i) => i.id === activityId)?.isRead)
      : localReadIds.has(activityId) || Boolean(activeItems.find((i) => i.id === activityId)?.isRead)

    if (isCurrentlyRead) {
      if (onMarkUnread) {
        onMarkUnread(activityId)
      } else {
        setLocalReadIds((prev) => {
          const next = new Set(prev)
          next.delete(activityId)
          return next
        })
      }
    } else {
      if (onMarkRead) {
        onMarkRead(activityId)
      } else {
        setLocalReadIds((prev) => new Set([...prev, activityId]))
      }
    }
  }

  // Handle mark all read
  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onMarkAllRead) {
      onMarkAllRead()
    } else {
      setLocalReadIds(new Set(activeItems.map((i) => i.id)))
    }
  }

  // Close smoothly on outside click
  useEffect(() => {
    function handleClickOutside(event: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("pointerdown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside)
    }
  }, [isOpen])

  // Close modal on Escape key
  useEffect(() => {
    if (!selectedActivity) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedActivity(null)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedActivity])

  return (
    <>
      <div
        ref={dropdownRef}
        className={cn(
          "activity-dropdown-root",
          "w-full max-w-md rounded-2xl shadow-md overflow-hidden cursor-pointer select-none",
          "bg-white border border-slate-200",
          "transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
          isOpen ? "rounded-3xl is-open" : "rounded-2xl",
          className,
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        {/* Header */}
        <div className="activity-dropdown__header flex items-center gap-3.5 p-3.5">
          <div className="activity-dropdown__bell-wrap">
            <Bell className="h-5 w-5 text-slate-700" />
            {unreadCount > 0 && (
              <span className="activity-dropdown__badge">{unreadCount}</span>
            )}
          </div>
          <div className="activity-dropdown__titles flex-1 overflow-hidden">
            <h3 className="activity-dropdown__title text-sm font-semibold text-slate-900">
              {displayTitle}
            </h3>
            <p
              className={cn(
                "activity-dropdown__sub",
                "text-xs text-slate-500",
                "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                isOpen ? "opacity-0 max-h-0 mt-0 sub-open" : "opacity-100 max-h-5 mt-0.5 sub-closed",
              )}
            >
              {displaySubtitle}
            </p>
          </div>
          <div className="activity-dropdown__chevron-wrap flex h-7 w-7 items-center justify-center">
            <ChevronUp
              className={cn(
                "activity-dropdown__chevron",
                "h-4 w-4 text-slate-400 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                isOpen ? "rotate-0" : "rotate-180",
              )}
            />
          </div>
        </div>

        {/* Activity List */}
        <div
          className={cn(
            "activity-dropdown__content-grid",
            "grid",
            "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            isOpen ? "grid-rows-[1fr] opacity-100 grid-open" : "grid-rows-[0fr] opacity-0 grid-closed",
          )}
        >
          <div className="activity-dropdown__inner overflow-hidden">
            <div className="activity-dropdown__list-pad px-2 pb-2">
              <div className="activity-dropdown__space space-y-1">
                {activeItems.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    No recent activities recorded.
                  </div>
                ) : (
                  activeItems.map((activity, index) => {
                    const isRead = controlledItems
                      ? Boolean(activity.isRead)
                      : Boolean(activity.isRead || localReadIds.has(activity.id))

                    return (
                      <div
                        key={activity.id}
                        className={cn(
                          "activity-item",
                          isRead ? "is-read" : "is-unread",
                          "flex items-start gap-2.5 rounded-xl p-2.5",
                          "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                          isOpen ? "translate-y-0 opacity-100 item-open" : "translate-y-3 opacity-0 item-closed",
                        )}
                        style={{
                          transitionDelay: isOpen ? `${index * 35}ms` : "0ms",
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenFullNotification(activity)
                        }}
                        title="Click to open notification in full"
                      >
                        <div className="activity-item__icon-box flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition-colors duration-200">
                          <span>{activity.icon || <Bell className="h-4 w-4" />}</span>
                        </div>
                        <div className="activity-item__info flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <h4 className="activity-item__headline text-xs font-semibold text-slate-900 truncate">
                              {activity.title}
                            </h4>
                            {isRead ? (
                              <span className="activity-item__read-badge badge-done">
                                <Check className="h-3 w-3" /> Read
                              </span>
                            ) : (
                              <span className="activity-item__read-badge badge-new">
                                New
                              </span>
                            )}
                          </div>
                          <p className="activity-item__desc text-xs text-slate-500 line-clamp-2">
                            {activity.description}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
                          <span className="activity-item__time text-[10.5px] text-slate-400">
                            {activity.time}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="activity-item__open-hint">
                              Open <ArrowUpRight className="h-2.5 w-2.5" />
                            </span>
                            {!isRead && (
                              <button
                                type="button"
                                className="activity-item__mark-btn text-[10px] text-blue-600 hover:text-blue-800 font-semibold underline"
                                onClick={(e) => handleMarkItemRead(e, activity.id)}
                                title="Mark as read without opening"
                              >
                                Mark Read
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Footer with Mark All Read action */}
            <div className="activity-dropdown__footer">
              <span className="text-[11px] text-slate-500">
                {unreadCount > 0 ? `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}` : 'All messages caught up'}
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="activity-dropdown__footer-btn"
                  onClick={handleMarkAllRead}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Mark all as read</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full Notification Modal (Rendered in Portal for Zero Layout Shift) */}
      {selectedActivity &&
        createPortal(
          <div
            className="activity-modal-backdrop"
            onClick={handleCloseFullNotification}
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-modal-title"
          >
            <div
              className="activity-modal-card"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Accent Stripe */}
              <div
                className={cn(
                  "activity-modal-stripe",
                  selectedActivity.type === 'ALERT'
                    ? 'stripe-danger'
                    : selectedActivity.type === 'WARNING' || selectedActivity.type === 'MAINTENANCE'
                    ? 'stripe-warning'
                    : selectedActivity.type === 'IPO' || selectedActivity.type === 'COMMISSION'
                    ? 'stripe-emerald'
                    : 'stripe-primary'
                )}
              />

              {/* Modal Header */}
              <div className="activity-modal-header">
                <div className="activity-modal-icon-wrap">
                  {selectedActivity.icon || <Bell className="h-5 w-5" />}
                </div>

                <div className="activity-modal-header-meta">
                  <div className="activity-modal-badges">
                    <span className="activity-modal-badge activity-modal-badge--type">
                      {selectedActivity.type || 'NOTIFICATION'}
                    </span>
                    <span
                      className={cn(
                        "activity-modal-badge",
                        (controlledItems
                          ? selectedActivity.isRead
                          : localReadIds.has(selectedActivity.id) || selectedActivity.isRead)
                          ? 'activity-modal-badge--read'
                          : 'activity-modal-badge--new'
                      )}
                    >
                      {(controlledItems
                        ? selectedActivity.isRead
                        : localReadIds.has(selectedActivity.id) || selectedActivity.isRead) ? (
                        <>
                          <Check className="h-3 w-3" /> Read
                        </>
                      ) : (
                        'New'
                      )}
                    </span>
                    <span className="activity-modal-time">
                      <Clock className="h-3 w-3" /> {selectedActivity.time}
                    </span>
                  </div>

                  <h2 id="activity-modal-title" className="activity-modal-title">
                    {selectedActivity.title}
                  </h2>
                </div>

                <button
                  type="button"
                  className="activity-modal-close-btn"
                  onClick={handleCloseFullNotification}
                  aria-label="Close notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Body — Full Unclipped Description */}
              <div className="activity-modal-body">
                <p className="activity-modal-description">
                  {selectedActivity.description}
                </p>

                {/* Context Information Box */}
                <div className="activity-modal-context-box">
                  <div className="activity-modal-context-row">
                    <span className="context-label">Notification ID:</span>
                    <span className="context-value font-mono">{String(selectedActivity.id)}</span>
                  </div>
                  <div className="activity-modal-context-row">
                    <span className="context-label">Origin / Scope:</span>
                    <span className="context-value">
                      {selectedActivity.source || 'PrintBooth Operations & Fleet Automation'}
                    </span>
                  </div>
                  <div className="activity-modal-context-row">
                    <span className="context-label">Status:</span>
                    <span className="context-value text-emerald-600 font-semibold flex items-center gap-1">
                      <Check className="h-3 w-3" /> Acknowledged & Logged
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="activity-modal-footer">
                <div className="activity-modal-footer-left">
                  <button
                    type="button"
                    className="activity-modal-unread-toggle"
                    onClick={() => handleToggleModalReadStatus(selectedActivity.id)}
                  >
                    {(controlledItems
                      ? selectedActivity.isRead
                      : localReadIds.has(selectedActivity.id) || selectedActivity.isRead) ? (
                      'Mark as Unread'
                    ) : (
                      'Mark as Read'
                    )}
                  </button>
                </div>

                <div className="activity-modal-footer-right">
                  <button
                    type="button"
                    className="activity-modal-done-btn"
                    onClick={handleCloseFullNotification}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

export default function DemoOne() {
  return <ActivityDropdown />
}
