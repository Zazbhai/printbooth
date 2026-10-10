import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Warning,
  Megaphone,
  Wrench,
  ShieldCheck,
  Broadcast,
  Check,
  X,
  CaretLeft,
  CaretRight,
  Clock,
  Storefront,
} from '@phosphor-icons/react'
import { getMerchantNotifications, markMerchantNotificationRead, getMerchantPaper } from '@/lib/api'
import { useActiveMerchant } from '@/lib/merchantContext'
import './MerchantBroadcastPopup.css'

const STORAGE_KEY_ACK = 'pb_ack_broadcast_ids'
const STORAGE_KEY_REMIND = 'pb_broadcast_remind_until'

const isOfflineNotification = (n: any): boolean => {
  const text = `${n.title || ''} ${n.message || ''} ${n.description || ''}`.toLowerCase()
  return (
    text.includes('offline') ||
    text.includes('powered off') ||
    text.includes('lost connection') ||
    text.includes('pi disconnected') ||
    text.includes('hardware disconnected') ||
    text.includes('spooler offline') ||
    text.includes('printer is currently offline') ||
    text.includes('not responding')
  )
}

export default function MerchantBroadcastPopup() {
  const { activeKioskId, activeMerchant, isHardwareOnline } = useActiveMerchant()
  const [unreadList, setUnreadList] = useState<any[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [acknowledging, setAcknowledging] = useState(false)

  // Get acknowledged IDs from localStorage
  const getAckIds = (): Set<string> => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ACK)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return new Set(parsed)
      }
    } catch {
      // Fallback
    }
    return new Set()
  }

  const saveAckId = (id: string) => {
    try {
      const current = getAckIds()
      current.add(id)
      localStorage.setItem(STORAGE_KEY_ACK, JSON.stringify(Array.from(current)))
    } catch {
      // Fallback
    }
  }

  const isRemindActive = (): boolean => {
    try {
      const remindTime = localStorage.getItem(STORAGE_KEY_REMIND)
      if (remindTime) {
        return Date.now() < Number(remindTime)
      }
    } catch {
      // Fallback
    }
    return false
  }

  const fetchUnreadBroadcasts = useCallback(async () => {
    if (!activeKioskId) return
    try {
      // Check real-time hardware status
      let hardwareOnline = isHardwareOnline
      try {
        const paper = await getMerchantPaper(activeKioskId)
        if (typeof paper?.isOnline === 'boolean') {
          hardwareOnline = paper.isOnline
        }
      } catch {}

      const data = await getMerchantNotifications(activeKioskId, activeMerchant?.merchantId)
      if (Array.isArray(data)) {
        const acked = getAckIds()
        const unread = data.filter((n) => {
          const id = n.notificationId || n._id
          const isOffline = isOfflineNotification(n)
          // When hardware is online, remove and auto-acknowledge all offline notifications
          if (hardwareOnline && isOffline) {
            saveAckId(id)
            markMerchantNotificationRead(id, activeMerchant?.merchantId).catch(() => {})
            return false
          }
          return !n.isRead && !acked.has(id)
        })

        setUnreadList(unread)

        // If there are unread announcements and remind interval is not active, open modal
        if (unread.length > 0 && !isRemindActive()) {
          setIsOpen(true)
        } else {
          setIsOpen(false)
        }
      }
    } catch (err) {
      console.warn('[MerchantBroadcastPopup] Failed to fetch broadcasts:', err)
    }
  }, [activeKioskId, activeMerchant?.merchantId, isHardwareOnline])

  // Automatically close popup and purge offline notifications the moment hardware gets online
  useEffect(() => {
    if (isHardwareOnline) {
      setUnreadList((prev) => {
        const offlineItems = prev.filter(isOfflineNotification)
        offlineItems.forEach((n) => {
          const id = n.notificationId || n._id
          saveAckId(id)
          markMerchantNotificationRead(id, activeMerchant?.merchantId).catch(() => {})
        })
        const remaining = prev.filter((n) => !isOfflineNotification(n))
        if (remaining.length === 0) {
          setIsOpen(false)
        }
        return remaining
      })
    }
  }, [isHardwareOnline, activeMerchant?.merchantId])

  // Listen for real-time hardware status changes
  useEffect(() => {
    const handleHwEvent = (e: any) => {
      if (e.detail?.isOnline) {
        setUnreadList((prev) => {
          const offlineItems = prev.filter(isOfflineNotification)
          offlineItems.forEach((n) => {
            const id = n.notificationId || n._id
            saveAckId(id)
            markMerchantNotificationRead(id, activeMerchant?.merchantId).catch(() => {})
          })
          const remaining = prev.filter((n) => !isOfflineNotification(n))
          if (remaining.length === 0) {
            setIsOpen(false)
          }
          return remaining
        })
      }
    }
    window.addEventListener('pb:hardware-status', handleHwEvent)
    return () => window.removeEventListener('pb:hardware-status', handleHwEvent)
  }, [activeMerchant?.merchantId])

  useEffect(() => {
    fetchUnreadBroadcasts()

    // 1. Regular 6-second polling
    const interval = setInterval(fetchUnreadBroadcasts, 6000)

    // 2. Storage event listener for immediate cross-tab synchronization
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'pb_last_broadcast_timestamp') {
        fetchUnreadBroadcasts()
      }
    }
    window.addEventListener('storage', handleStorageChange)

    // 3. BroadcastChannel listener
    let bc: BroadcastChannel | null = null
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('pb_broadcast_channel')
        bc.onmessage = () => {
          fetchUnreadBroadcasts()
        }
      }
    } catch {
      // Ignore in private browser storage
    }

    // 4. Custom event within same tab
    const handleLocalBroadcast = () => {
      fetchUnreadBroadcasts()
    }
    window.addEventListener('pb:broadcast-sent', handleLocalBroadcast)

    // 5. Visibility change
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchUnreadBroadcasts()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('pb:broadcast-sent', handleLocalBroadcast)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (bc) bc.close()
    }
  }, [fetchUnreadBroadcasts])

  // Current notification to display
  const currentNotif = useMemo(() => {
    if (unreadList.length === 0) return null
    const safeIndex = Math.min(currentIndex, unreadList.length - 1)
    return unreadList[safeIndex]
  }, [unreadList, currentIndex])

  const handleNext = () => {
    if (currentIndex < unreadList.length - 1) {
      setCurrentIndex((prev) => prev + 1)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
    }
  }

  const handleAcknowledge = async () => {
    if (!currentNotif) return
    setAcknowledging(true)
    const id = currentNotif.notificationId || currentNotif._id

    try {
      await markMerchantNotificationRead(id, activeMerchant?.merchantId)
      saveAckId(id)

      // Notify other views (like MerchantDashboardPage inline list)
      window.dispatchEvent(new CustomEvent('pb:notification-read', { detail: { id } }))

      // Remove from unread list
      setUnreadList((prev) => {
        const next = prev.filter((n) => (n.notificationId || n._id) !== id)
        if (next.length === 0) {
          setIsOpen(false)
        } else if (currentIndex >= next.length) {
          setCurrentIndex(next.length - 1)
        }
        return next
      })
    } catch (err) {
      console.error('[MerchantBroadcastPopup] Failed to acknowledge notification:', err)
      // Even if network fails, dismiss locally
      saveAckId(id)
      setUnreadList((prev) => prev.filter((n) => (n.notificationId || n._id) !== id))
      if (unreadList.length <= 1) setIsOpen(false)
    } finally {
      setAcknowledging(false)
    }
  }

  const handleRemindLater = () => {
    // Snooze popup for 10 minutes
    try {
      localStorage.setItem(STORAGE_KEY_REMIND, String(Date.now() + 10 * 60 * 1000))
    } catch {}
    setIsOpen(false)
  }

  const handleClose = () => {
    setIsOpen(false)
  }

  // Keyboard shortcut: Esc to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  if (!isOpen || !currentNotif) return null

  const notifType: 'INFO' | 'WARNING' | 'ALERT' | 'MAINTENANCE' | 'SYSTEM' = currentNotif.type || 'INFO'

  const typeIcon = {
    ALERT: <Warning size={15} weight="fill" />,
    WARNING: <Megaphone size={15} weight="fill" />,
    MAINTENANCE: <Wrench size={15} weight="fill" />,
    SYSTEM: <ShieldCheck size={15} weight="fill" />,
    INFO: <Broadcast size={15} weight="fill" />,
  }[notifType]

  const timeStr = currentNotif.createdAt
    ? new Date(currentNotif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Just now'

  return (
    <div
      className="merchant-broadcast-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="broadcast-modal-title"
      onClick={handleClose}
    >
      <div className="merchant-broadcast-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top Gradient Stripe */}
        <div className={`broadcast-accent-stripe ${notifType}`} />

        {/* Modal Header */}
        <div className="merchant-broadcast-header">
          <div>
            <div className="broadcast-badge-cluster">
              <span className={`broadcast-category-pill ${notifType}`}>
                <span className={`broadcast-beacon ${notifType}`} />
                {typeIcon}
                <span>{notifType} NOTICE</span>
              </span>

              <span className="broadcast-meta-dispatch">
                <Clock size={12} />
                <span>{timeStr}</span>
              </span>
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
              Official Fleet Dispatch • PrintBooth Operations Command
            </div>
          </div>

          <button
            type="button"
            className="broadcast-modal-close-btn"
            onClick={handleClose}
            title="Dismiss popup for now"
            aria-label="Dismiss popup"
          >
            <X size={17} weight="bold" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="merchant-broadcast-body">
          <h2 id="broadcast-modal-title" className="broadcast-headline">
            {currentNotif.title}
          </h2>

          <div className="broadcast-narrative-card">
            {currentNotif.message}
          </div>

          {/* Trust and Target Strip */}
          <div className="broadcast-trust-bar">
            <div className="broadcast-trust-bar__left">
              <Storefront size={15} weight="bold" color="#dc2626" />
              <span>
                {currentNotif.target === 'ALL'
                  ? 'All Licensed Store Partner Portals'
                  : `Targeted to Station ${activeKioskId}`}
              </span>
            </div>
            <div className="broadcast-trust-bar__right">
              ID: {currentNotif.notificationId || (currentNotif._id ? String(currentNotif._id).slice(-6) : 'SYS')}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="merchant-broadcast-footer">
          {/* Multiple notifications pagination */}
          {unreadList.length > 1 ? (
            <div className="broadcast-pagination-pills">
              <button
                type="button"
                className="broadcast-page-btn"
                onClick={handlePrev}
                disabled={currentIndex === 0}
                title="Previous Announcement"
              >
                <CaretLeft size={13} weight="bold" />
              </button>
              <span>
                {currentIndex + 1} of {unreadList.length}
              </span>
              <button
                type="button"
                className="broadcast-page-btn"
                onClick={handleNext}
                disabled={currentIndex === unreadList.length - 1}
                title="Next Announcement"
              >
                <CaretRight size={13} weight="bold" />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#059669', fontWeight: 600 }}>
              <ShieldCheck size={16} weight="fill" />
              <span>Verified Dispatch</span>
            </div>
          )}

          <div className="broadcast-action-group">
            <button
              type="button"
              className="broadcast-btn-remind"
              onClick={handleRemindLater}
              title="Snooze for 10 minutes"
            >
              Remind Later
            </button>

            <button
              type="button"
              className={`broadcast-btn-ack ${notifType}`}
              onClick={handleAcknowledge}
              disabled={acknowledging}
            >
              <Check size={15} weight="bold" />
              <span>{acknowledging ? 'Acknowledging...' : 'Acknowledge Notice'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
