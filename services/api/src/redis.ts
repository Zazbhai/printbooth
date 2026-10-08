import { Redis, type RedisOptions } from 'ioredis'
import type { Request, Response, NextFunction } from 'express'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PrintBooth Redis Cache & High-Throughput Processing Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * - Connects to local or remote Redis instance (e.g., Memurai on Windows or cloud Redis).
 * - Automatic graceful degradation: If Redis is unavailable or disconnected,
 *   transparently switches to an in-memory TTL cache without failing or crashing requests.
 * - Supports automatic cache invalidation, key pattern purging, and Express cache middleware.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

// ── In-Memory Fallback Cache Store ──
interface CacheEntry {
  val: string
  expiresAt: number | null
}

const memoryStore = new Map<string, CacheEntry>()

// Periodic memory store cleanup every 60s
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt !== null && entry.expiresAt <= now) {
      memoryStore.delete(key)
    }
  }
}, 60000).unref()

let redisClient: Redis | null = null
let isConnected = false
let connectionAttempted = false

export function initRedis(): Redis | null {
  if (redisClient) return redisClient

  try {
    const options: RedisOptions = {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
      connectTimeout: 4000,
      retryStrategy: (times) => {
        if (times > 8) {
          // Fall back gracefully after repeated failures
          return null
        }
        return Math.min(times * 300, 2000)
      },
    }

    redisClient = new Redis(REDIS_URL, options)

    redisClient.on('connect', () => {
      isConnected = true
      console.log(`[Redis] ⚡ Connected to Redis at ${REDIS_URL}`)
    })

    redisClient.on('ready', () => {
      isConnected = true
      console.log('[Redis] ✓ Redis connection ready for fast data processing & caching')
    })

    redisClient.on('error', (err: any) => {
      isConnected = false
      if (!connectionAttempted) {
        console.warn(`[Redis] Notice: Redis not reachable (${err.message}). Using high-performance in-memory cache fallback.`)
      }
      connectionAttempted = true
    })

    redisClient.on('close', () => {
      isConnected = false
    })

    return redisClient
  } catch (err: any) {
    console.warn(`[Redis] Initialization notice: ${err.message}. Operating with in-memory cache.`)
    return null
  }
}

// Initialize on module import
initRedis()

export function isRedisConnected(): boolean {
  return isConnected && redisClient !== null && redisClient.status === 'ready'
}

export function getRedisClient(): Redis | null {
  return redisClient
}

/**
 * Retrieves a cached item and parses it as JSON (or raw string).
 */
export async function cacheGet<T = any>(key: string): Promise<T | null> {
  try {
    if (isRedisConnected() && redisClient) {
      const data = await redisClient.get(key)
      if (!data) return null
      try {
        return JSON.parse(data) as T
      } catch {
        return data as unknown as T
      }
    }
  } catch (err: any) {
    console.warn(`[Redis Cache] GET error for ${key} (${err.message}), checking memory fallback`)
  }

  // Memory fallback
  const entry = memoryStore.get(key)
  if (!entry) return null
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    memoryStore.delete(key)
    return null
  }
  try {
    return JSON.parse(entry.val) as T
  } catch {
    return entry.val as unknown as T
  }
}

/**
 * Stores an item in cache with an optional TTL in seconds.
 */
export async function cacheSet(key: string, value: any, ttlSeconds?: number): Promise<void> {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)

  try {
    if (isRedisConnected() && redisClient) {
      if (ttlSeconds && ttlSeconds > 0) {
        await redisClient.set(key, serialized, 'EX', ttlSeconds)
      } else {
        await redisClient.set(key, serialized)
      }
      return
    }
  } catch (err: any) {
    console.warn(`[Redis Cache] SET error for ${key} (${err.message}), falling back to memory`)
  }

  // Memory fallback
  memoryStore.set(key, {
    val: serialized,
    expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
  })
}

/**
 * Deletes one or more specific keys from cache.
 */
export async function cacheDel(keyOrKeys: string | string[]): Promise<void> {
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]
  if (keys.length === 0) return

  try {
    if (isRedisConnected() && redisClient) {
      await redisClient.del(...keys)
    }
  } catch (err: any) {
    console.warn(`[Redis Cache] DEL error (${err.message})`)
  }

  for (const k of keys) {
    memoryStore.delete(k)
  }
}

/**
 * Purges keys matching a pattern (e.g. 'kiosks:*' or 'print:job:*').
 */
export async function cachePurgePattern(pattern: string): Promise<number> {
  let count = 0

  try {
    if (isRedisConnected() && redisClient) {
      const keys = await redisClient.keys(pattern)
      if (keys.length > 0) {
        await redisClient.del(...keys)
        count = keys.length
      }
    }
  } catch (err: any) {
    console.warn(`[Redis Cache] Purge pattern error (${err.message})`)
  }

  // Purge from memory store matching regex
  const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
  for (const k of Array.from(memoryStore.keys())) {
    if (regexPattern.test(k)) {
      memoryStore.delete(k)
      count++
    }
  }

  return count
}

/**
 * Returns telemetry and health stats about Redis and the cache layer.
 */
export async function getCacheStats() {
  const isOnline = isRedisConnected()
  let info: Record<string, string> = {}
  let totalKeys = memoryStore.size

  if (isOnline && redisClient) {
    try {
      const rawInfo = await redisClient.info()
      totalKeys = await redisClient.dbsize()
      rawInfo.split('\r\n').forEach((line: string) => {
        const [k, v] = line.split(':')
        if (k && v) info[k.trim()] = v.trim()
      })
    } catch {}
  }

  return {
    provider: isOnline ? 'Redis / Memurai' : 'In-Memory Fallback Store',
    connected: isOnline,
    totalKeys,
    version: info['redis_version'] || '6.2.0-compatible',
    uptimeSeconds: info['uptime_in_seconds'] || '0',
    usedMemoryHuman: info['used_memory_human'] || `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}M`,
    connectedClients: info['connected_clients'] || '1',
  }
}

/**
 * Express Middleware for caching GET endpoints.
 */
export function cacheMiddleware(options?: {
  ttlSeconds?: number
  keyPrefix?: string
  keyGenerator?: (req: Request) => string
  shouldCache?: (req: Request, res: Response) => boolean
}) {
  const ttl = options?.ttlSeconds ?? 10
  const prefix = options?.keyPrefix ?? 'api:cache:'

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next()
    }

    // Bypass cache if client requested fresh data
    if (req.query.nocache === 'true' || req.query.refresh === 'true') {
      res.setHeader('X-Cache', 'BYPASS')
      return next()
    }

    const key = options?.keyGenerator
      ? options.keyGenerator(req)
      : `${prefix}${req.baseUrl || ''}${req.path}:${JSON.stringify(req.query)}`

    try {
      const cached = await cacheGet(key)
      if (cached !== null) {
        res.setHeader('X-Cache', 'HIT')
        res.setHeader('X-Cache-TTL', String(ttl))
        return res.json(cached)
      }
    } catch (err) {
      console.warn(`[Cache Middleware] Read error on key ${key}:`, err)
    }

    res.setHeader('X-Cache', 'MISS')

    // Capture response to cache it
    const originalJson = res.json.bind(res)
    res.json = (body: any) => {
      // Only cache successful JSON responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (!options?.shouldCache || options.shouldCache(req, res)) {
          cacheSet(key, body, ttl).catch((e) => {
            console.warn(`[Cache Middleware] Failed to cache key ${key}:`, e)
          })
        }
      }
      return originalJson(body)
    }

    next()
  }
}
