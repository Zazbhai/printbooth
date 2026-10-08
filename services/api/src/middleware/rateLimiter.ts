import { rateLimit } from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import { getRedisClient, isRedisConnected } from '../redis.js'
import type { Request, Response } from 'express'

/**
 * Creates a rate limiter with Redis backing when available,
 * falling back seamlessly to an in-memory store.
 */
function createLimiter(customOptions: {
  windowMs: number
  max: number
  prefix: string
  message: string
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
    max: process.env.NODE_ENV === 'production' ? customOptions.max : 5000,
    store,
    passOnStoreError: true, // If Redis blips, requests are NOT blocked
    standardHeaders: 'draft-7', // returns RateLimit-* headers
    legacyHeaders: false,
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
 * General API Limiter: 300 requests per 15 minutes per IP
 */
export const globalApiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  prefix: 'api',
  message: 'Too many requests from this IP. Please slow down and try again shortly.',
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
