/**
 * PrintBooth Kiosk Liveness & Hardware Reachability Engine
 * ==========================================================
 * Provides unified, cryptographic & WebSocket-level reachability verification
 * for all Raspberry Pi kiosks across the fleet.
 *
 * If a Raspberry Pi is powered off, loses Wi-Fi/LAN, or fails heartbeat SLA (< 45s):
 *  1. Instantly marks kiosk & printer status as OFFLINE in MongoDB, Redis, and memory.
 *  2. Generates a CRITICAL Alert and merchant Notification advising merchant to check power/network.
 *  3. Broadcasts KIOSK_OFFLINE event via WebSocket Relay to merchant and admin dashboards.
 *  4. Provides pre-flight check for Razorpay, UPI Express, and print order routes to reject
 *     or safely hold orders instead of sending to an unreachable machine.
 */

import { isDbConnected } from '../db.js'
import { Kiosk } from '../models/Kiosk.js'
import { Device } from '../models/Device.js'
import { Alert } from '../models/Alert.js'
import { Notification } from '../models/Notification.js'
import { Merchant } from '../models/Merchant.js'
import { fallbackKiosks, fallbackMerchants } from '../fallbackData.js'
import { cacheSet, cacheGet } from '../redis.js'
import { isKioskOnline as isDeviceGatewayOnline } from './deviceGateway.js'
import { isKioskRelayConnected, broadcastToAdmins } from './wsRelay.js'

// SLA window for considering a heartbeat "fresh" (in milliseconds)
const HEARTBEAT_FRESHNESS_MS = 60 * 1000 // 60 seconds

export interface KioskReachabilityResult {
  isReachable: boolean
  reason?: string
  lastSeenAt?: Date | null
  via?: 'ws_relay' | 'device_gateway' | 'heartbeat' | 'simulation' | 'none'
  kioskId: string
  merchantId?: string
}

/**
 * Checks whether a Raspberry Pi kiosk is currently alive, powered on,
 * and reachable by the central server.
 */
export async function isKioskPiReachable(rawKioskId?: string): Promise<KioskReachabilityResult> {
  if (!rawKioskId) {
    return { isReachable: false, reason: 'No kioskId specified', kioskId: '', via: 'none' }
  }

  const kioskId = rawKioskId.trim().toUpperCase()

  // 1. Direct WebSocket Relay connection check (ws_kiosk_client.py on /ws)
  if (isKioskRelayConnected(kioskId)) {
    return {
      isReachable: true,
      reason: 'Active WebSocket relay session connected',
      via: 'ws_relay',
      kioskId,
    }
  }

  // 2. Direct Device Gateway connection check (agent on /device)
  if (isDeviceGatewayOnline(kioskId)) {
    return {
      isReachable: true,
      reason: 'Active authenticated Ed25519 device session connected',
      via: 'device_gateway',
      kioskId,
    }
  }

  // 3. Database lastSeenAt heartbeat freshness check
  if (isDbConnected()) {
    try {
      const kDoc: any = await Kiosk.findOne({ kioskId }).lean()
      if (kDoc) {
        if (kDoc.status === 'OFFLINE' || kDoc.printerStatus === 'OFFLINE') {
          return {
            isReachable: false,
            reason: `Station ${kioskId} is marked OFFLINE in system.`,
            via: 'none',
            kioskId,
          }
        }
        const isTestMode = (process.env.PRINT_MODE || 'real').toLowerCase() === 'test'
        if (isTestMode && kDoc.lastSeenAt) {
          const elapsed = Date.now() - new Date(kDoc.lastSeenAt).getTime()
          if (elapsed < HEARTBEAT_FRESHNESS_MS) {
            // Heartbeat received within SLA
            return {
              isReachable: true,
              reason: `Fresh heartbeat received ${Math.round(elapsed / 1000)}s ago`,
              lastSeenAt: kDoc.lastSeenAt,
              via: 'heartbeat',
              kioskId,
              merchantId: kDoc.merchantId,
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Kiosk Liveness] DB check error for ${kioskId}:`, err.message)
    }
  }

  // 4. Fallback check for offline state
  // Neither WebSocket nor fresh heartbeat exists: The Raspberry Pi is OFF or disconnected!
  return {
    isReachable: false,
    reason: `Raspberry Pi station ${kioskId} supervisor (start_kiosk.sh) is not running or lost connection.`,
    via: 'none',
    kioskId,
  }
}

/**
 * Marks a kiosk and its printer as OFFLINE across MongoDB, Redis, and sends notifications.
 */
export async function markKioskOffline(rawKioskId: string, reason = 'Hardware powered off or lost internet connection'): Promise<void> {
  const kioskId = rawKioskId.trim().toUpperCase()
  console.warn(`[Kiosk Liveness] 🚨 Marking Kiosk ${kioskId} as OFFLINE. Reason: ${reason}`)

  // 1. Update MongoDB Kiosk record
  let merchantId = 'M-001'
  if (isDbConnected()) {
    try {
      const updated: any = await Kiosk.findOneAndUpdate(
        { kioskId },
        {
          $set: {
            status: 'OFFLINE',
            printerStatus: 'OFFLINE',
            lastSeenAt: null,
          },
        },
        { new: true }
      ).lean()
      if (updated?.merchantId) {
        merchantId = updated.merchantId
      }
    } catch (err: any) {
      console.warn(`[Kiosk Liveness] Failed to update Kiosk status:`, err.message)
    }

    try {
      await Device.findOneAndUpdate(
        { kioskId },
        { $set: { status: 'OFFLINE' } }
      )
    } catch {}
  }

  // 2. Update Redis Cache
  try {
    await cacheSet(`kiosk:${kioskId}:status`, 'OFFLINE', 3600)
    await cacheSet(`device:${kioskId}:status`, 'OFFLINE', 3600)
  } catch {}

  // 3. Update fallback in-memory records
  const fb = fallbackKiosks.find((k) => (k.kioskId || k.id) === kioskId)
  if (fb) {
    fb.status = 'OFFLINE'
    fb.printerStatus = 'OFFLINE'
    if (fb.merchantId) merchantId = fb.merchantId
  }

  // 4. Create an Alert for Admin and Ops
  if (isDbConnected()) {
    try {
      const recentAlert = await Alert.findOne({
        kioskId,
        type: 'KIOSK_OFFLINE',
        acknowledged: false,
        createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
      })

      if (!recentAlert) {
        await Alert.create({
          alertId: `ALT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
          kioskId,
          type: 'KIOSK_OFFLINE',
          severity: 'CRITICAL',
          message: `Station ${kioskId} is Offline: Raspberry Pi controller is powered off or disconnected. Customers cannot print. Kindly check power and network cables.`,
          acknowledged: false,
        })
      }
    } catch (err: any) {
      console.warn(`[Kiosk Liveness] Failed to persist Alert:`, err.message)
    }
  }

  // 5. Create a high-priority Notification for the Merchant
  if (isDbConnected()) {
    try {
      const recentNotif = await Notification.findOne({
        targetKioskId: kioskId,
        type: 'ALERT',
        title: { $regex: /Machine Offline/i },
        createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
      })

      if (!recentNotif) {
        await Notification.create({
          notificationId: `NOTIF-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
          title: `⚠️ Machine Offline: Station ${kioskId} is Powered Off`,
          message: `Your PrintBooth machine (${kioskId}) has lost connection to the server. Customers cannot print. Kindly check the power switch, Raspberry Pi power cable, and shop Wi-Fi / Ethernet connection immediately.`,
          type: 'ALERT',
          target: merchantId,
          targetMerchantId: merchantId,
          targetKioskId: kioskId,
          createdBy: 'Hardware Watchdog',
          readBy: [],
        })
      }
    } catch (err: any) {
      console.warn(`[Kiosk Liveness] Failed to persist Notification:`, err.message)
    }
  }

  // 6. Broadcast via WebSocket to Admins and Merchant portal
  try {
    broadcastToAdmins('KIOSK_OFFLINE', {
      kioskId,
      reason,
      status: 'OFFLINE',
      printerStatus: 'OFFLINE',
      timestamp: Date.now(),
    })
  } catch {}
}

/**
 * Records a successful heartbeat received from Raspberry Pi hardware daemon.
 */
export async function recordKioskHeartbeat(
  rawKioskId: string,
  telemetry: {
    status?: string
    printerStatus?: string
    activePrinter?: string
    printerModel?: string
    paperLevel?: number
    tonerLevel?: number
    diagnostics?: any
    usbConnected?: boolean
    usbDevice?: string
  } = {}
): Promise<void> {
  const kioskId = rawKioskId.trim().toUpperCase()
  const now = new Date()

  const isUsbDisconnected = telemetry.usbConnected === false
  const pStat = String(telemetry.printerStatus || '').toUpperCase()
  const kStat = String(telemetry.status || '').toUpperCase()
  const isPrinterOffline =
    isUsbDisconnected ||
    kStat === 'OFFLINE' ||
    pStat === 'OFFLINE' ||
    pStat === 'ERROR' ||
    pStat === 'STOPPED' ||
    pStat === 'DISCONNECTED'

  const onlineStatus = isPrinterOffline ? 'OFFLINE' : 'ONLINE'
  const printerStatus = isPrinterOffline ? (pStat || 'OFFLINE') : 'READY'

  if (isDbConnected()) {
    try {
      await Kiosk.findOneAndUpdate(
        { kioskId },
        {
          $set: {
            lastSeenAt: now,
            status: onlineStatus,
            printerStatus,
            ...(telemetry.activePrinter ? { printerModel: telemetry.activePrinter } : {}),
            ...(telemetry.usbConnected !== undefined ? { usbConnected: telemetry.usbConnected } : {}),
            ...(telemetry.usbDevice !== undefined ? { usbDevice: telemetry.usbDevice } : {}),
            ...(typeof telemetry.paperLevel === 'number' ? { paperLevel: telemetry.paperLevel } : {}),
            ...(typeof telemetry.tonerLevel === 'number' ? { tonerLevel: telemetry.tonerLevel } : {}),
          },
        }
      )

      await Device.findOneAndUpdate(
        { kioskId },
        {
          $set: {
            lastSeen: now,
            status: onlineStatus,
          },
        }
      )

      // Auto-acknowledge any past KIOSK_OFFLINE alerts since hardware is now reporting
      if (onlineStatus === 'ONLINE') {
        await Alert.updateMany(
          { kioskId, type: 'KIOSK_OFFLINE', acknowledged: false },
          { $set: { acknowledged: true, acknowledgedAt: now } }
        )

        // Automatically clear any stale machine offline notifications
        await Notification.deleteMany({
          targetKioskId: kioskId,
          $or: [
            { title: { $regex: /Offline|Powered Off|Lost Connection|Disconnected/i } },
            { message: { $regex: /Offline|Powered Off|lost connection|not responding/i } },
          ],
        }).catch(() => {})
      }
    } catch (err: any) {
      console.warn(`[Kiosk Liveness] Failed to update heartbeat in DB:`, err.message)
    }
  }

  // Update Redis cache
  try {
    await cacheSet(`kiosk:${kioskId}:status`, onlineStatus, 60)
    await cacheSet(`device:${kioskId}:status`, onlineStatus, 60)
  } catch {}

  // Update fallback in-memory records
  const fb = fallbackKiosks.find((k) => (k.kioskId || k.id) === kioskId)
  if (fb) {
    fb.status = onlineStatus as any
    fb.printerStatus = printerStatus as any
    (fb as any).lastSeenAt = now
    if (typeof telemetry.paperLevel === 'number') fb.paperLevel = telemetry.paperLevel
    if (typeof telemetry.tonerLevel === 'number') fb.tonerLevel = telemetry.tonerLevel
  }
}
