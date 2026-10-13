import { rateLimit } from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import { getRedisClient, isRedisConnected } from '../redis.js'
import type { Request, Response } from 'express'

function getClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip']
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim()

  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }

  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()

  return req.ip || req.socket.remoteAddress || '127.0.0.1'
}

function isLocalOrInternal(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost'
}

/**
 * Creates a rate limiter with Redis backing when available,
 * falling back seamlessly to an in-memory store.
 */
function createLimiter(customOptions: {
  windowMs: number
  max: number
  prefix: string
  message: string
  skipPolling?: boolean
}) {
  const client = getRedisClient()
  const store = isRedisConnected() && client
    ? new RedisStore({
        sendCommand: (...args: string[]) => (client as any).call(...args),
        prefix: `rl:${customOptions.prefix}:`,
      })
    : undefined

  return rateLimit({
    windowMs: customOptions.windowMs,
    max: process.env.NODE_ENV === 'production' ? customOptions.max : 10000,
    store,
    passOnStoreError: true, // If Redis blips, requests are NOT blocked
    standardHeaders: 'draft-7', // returns RateLimit-* headers
    legacyHeaders: false,
    keyGenerator: (req: Request) => getClientIp(req),
    skip: (req: Request) => {
      const ip = getClientIp(req)
      // Never rate-limit loopback/localhost services (Kiosk Pi agent, local CLI, internal tunnel)
      if (isLocalOrInternal(ip)) return true

      if (customOptions.skipPolling) {
        const path = (req.originalUrl || req.url || '').toLowerCase()
        if (
          path.includes('/health') ||
          path.includes('/config') ||
          path.includes('/kiosks') ||
          path.includes('/print/detect') ||
          path.includes('/print/status') ||
          path.includes('/redis/stats')
        ) {
          return true
        }
      }
      return false
    },
    handler: (req: Request, res: Response) => {
      const resetTime = (req as any).rateLimit?.resetTime
      const retryAfterSec = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(customOptions.windowMs / 1000)

      res.status(429).json({
        success: false,
        error: customOptions.message,
        retryAfter: retryAfterSec,
      })
    },
  })
}

/**
 * General API Limiter: 3,000 requests per 15 minutes per IP
 * Excludes live UI polling (kiosks status, print detect, health telemetry)
 */
export const globalApiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  prefix: 'api',
  message: 'Too many requests from this IP. Please slow down and try again shortly.',
  skipPolling: true,
})

/**
 * Print Execution Limiter: 25 print jobs per 5 minutes per IP
 * Protects physical hardware printer spooler from flooding / DoS attacks
 */
export const printExecutionLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 25,
  prefix: 'print',
  message: 'Print submission rate limit exceeded. Please wait a few minutes before submitting more jobs.',
})

/**
 * Payment Limiter: 40 requests per 5 minutes per IP
 * Protects Razorpay / UPI Express payment endpoints
 */
export const paymentLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 40,
  prefix: 'pay',
  message: 'Payment verification rate limit exceeded. Please wait a moment before trying again.',
})

/**
 * Order Creation Limiter: 30 orders per 10 minutes per IP
 */
export const orderLimiter = createLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  prefix: 'orders',
  message: 'Order creation rate limit reached. Please wait before creating additional orders.',
})

/**
 * Sensitive / Auth Limiter: 15 attempts per 15 minutes per IP
 */
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  prefix: 'auth',
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
})

/**
 * Kiosk Session Claim Limiter: 30 attempts per 5 minutes per IP
 * Protects against brute-forcing session tokens or automated session hijacking
 */
export const kioskSessionClaimLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  prefix: 'kiosk_claim',
  message: 'Too many kiosk session claim attempts. Please wait a moment before trying again.',
})

/**
 * Kiosk Session Creation Limiter: 60 attempts per 5 minutes per IP
 * Protects against rogue session generation flooding
 */
export const kioskSessionCreateLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 60,
  prefix: 'kiosk_create',
  message: 'Too many kiosk sessions created. Please wait a moment before trying again.',
})

