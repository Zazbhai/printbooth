import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { Kiosk, IKiosk } from '../models/Kiosk.js'
import { isDbConnected } from '../db.js'

declare global {
  namespace Express {
    interface Request {
      kiosk?: IKiosk
      merchantId?: string
    }
  }
}

/**
 * Generates a high-entropy cryptographically secure device secret for a Raspberry Pi kiosk.
 * Example: pb_sec_a1b2c3d4e5f6... (192 bits of entropy)
 */
export function generateKioskSecret(): string {
  return 'pb_sec_' + crypto.randomBytes(24).toString('hex')
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Middleware that authenticates a Raspberry Pi IoT device before granting access to:
 * - Heartbeat ingestion
 * - Polling customer print orders
 * - Downloading customer print files
 * - Updating telemetry / print job completion
 */
export async function verifyKioskSecret(req: Request, res: Response, next: NextFunction) {
  try {
    const rawId =
      (req.headers['x-kiosk-id'] as string) ||
      (req.params.id as string) ||
      (req.params.kioskId as string) ||
      (req.query.kioskId as string) ||
      (req.query.id as string) ||
      ''

    const kioskId = rawId.trim().toUpperCase()
    if (!kioskId || !/^PB-\d{3}$/.test(kioskId)) {
      return res.status(400).json({
        success: false,
        error: `Invalid kiosk ID format '${rawId}'. PrintBooth station IDs must match PB-XXX format.`,
      })
    }

    // Extract device secret from custom header or standard Authorization: Bearer
    let providedSecret = (req.headers['x-kiosk-secret'] as string) || ''
    if (!providedSecret && req.headers.authorization?.startsWith('Bearer ')) {
      providedSecret = req.headers.authorization.slice(7).trim()
    }

    if (!isDbConnected()) {
      // In offline/fallback mode, allow if matches default PB-001 dev fallback
      if (kioskId === 'PB-001') {
        req.merchantId = 'M-001'
        return next()
      }
      return res.status(503).json({ success: false, error: 'Database disconnected; cannot verify kiosk credentials.' })
    }

    const kiosk = await Kiosk.findOne({ kioskId })
    if (!kiosk) {
      return res.status(404).json({
        success: false,
        error: `Station '${kioskId}' is not registered in the PrintBooth fleet.`,
      })
    }

    // Auto-seed secret if legacy kiosk doesn't have one stored yet
    if (!kiosk.deviceSecret) {
      kiosk.deviceSecret = generateKioskSecret()
      await kiosk.save()
      console.log(`[Device Auth] 🔑 Auto-generated device secret for existing station ${kioskId}: ${kiosk.deviceSecret}`)
    }

    // If a secret is provided, verify it strictly
    if (!providedSecret) {
      // If legacy PB-001 on localhost/LAN or during development, permit while logging
      const ip = ((req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || '').trim()
      const isLocalOrLan =
        ip === '127.0.0.1' ||
        ip === '::1' ||
        ip === '::ffff:127.0.0.1' ||
        ip.includes('127.0.0.1') ||
        ip.startsWith('192.168.') ||
        ip.startsWith('::ffff:192.168.') ||
        ip.startsWith('10.') ||
        ip.startsWith('::ffff:10.') ||
        ip.startsWith('172.') ||
        process.env.NODE_ENV !== 'production'

      if (kioskId === 'PB-001' && isLocalOrLan) {
        req.kiosk = kiosk
        req.merchantId = kiosk.merchantId
        return next()
      }

      return res.status(401).json({
        success: false,
        error: `Unauthorized: Missing device secret for station ${kioskId}. Provide 'X-Kiosk-Secret' header or 'Authorization: Bearer <secret>'.`,
      })
    }

    if (!safeEqual(providedSecret, kiosk.deviceSecret)) {
      console.warn(`[Device Auth] ⚠️ Authentication failed for kiosk ${kioskId} from IP ${req.ip}`)
      return res.status(401).json({
        success: false,
        error: `Unauthorized: Invalid device secret for station ${kioskId}.`,
      })
    }

    // Attach verified kiosk and merchant context
    req.kiosk = kiosk
    req.merchantId = kiosk.merchantId

    // Record last IP & timestamp
    const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || '').trim()
    kiosk.lastIp = clientIp
    kiosk.lastSeenAt = new Date()
    kiosk.save().catch(() => {})

    return next()
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message })
  }
}

import os from 'os'

/**
 * Resolves the API base URL suitable for a Raspberry Pi.
 * If the incoming request originated from localhost / 127.0.0.1, resolves to the host machine's
 * real LAN IPv4 address (e.g. http://192.168.1.4:5000/api) so that the Raspberry Pi can connect.
 */
export function resolveKioskApiBaseUrl(req: any): string {
  const host = req?.get ? (req.get('host') || 'localhost:5000') : 'localhost:5000'
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')

  if (isLocalhost) {
    try {
      const interfaces = os.networkInterfaces()
      for (const devName of Object.keys(interfaces)) {
        const ifaceList = interfaces[devName]
        if (ifaceList) {
          for (const iface of ifaceList) {
            if (iface.family === 'IPv4' && !iface.internal) {
              const port = host.split(':')[1] || '5000'
              return `http://${iface.address}:${port}/api`
            }
          }
        }
      }
    } catch {}
  }

  const proto = req?.protocol || 'http'
  return `${proto}://${host}/api`
}

/**
 * Formats a ready-to-use .env configuration string for a Raspberry Pi.
 */
export function generatePiEnvContent(kiosk: {
  kioskId: string
  name: string
  deviceSecret: string
  merchantId?: string
}, apiBaseUrl: string): string {
  return `# ========================================================
# PrintBooth Kiosk Brain IoT Configuration
# Station ID  : ${kiosk.kioskId}
# Station Name: ${kiosk.name}
# Merchant ID : ${kiosk.merchantId || 'M-001'}
# ========================================================

KIOSK_ID=${kiosk.kioskId}
KIOSK_NAME=${kiosk.name}
KIOSK_SECRET=${kiosk.deviceSecret}
PRINTBOOTH_API_URL=${apiBaseUrl.replace(/\/+$/, '')}
PRINTER_NAME=auto

POLL_INTERVAL_SECONDS=3
HEARTBEAT_INTERVAL_SECONDS=10
TEMP_JOBS_DIR=/tmp/printbooth_jobs
`
}
