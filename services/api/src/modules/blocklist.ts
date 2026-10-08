import { BlockedUser } from '../models/BlockedUser.js'
import { isDbConnected } from '../db.js'
import { cacheGet, cacheSet, cacheDel } from '../redis.js'

// In-memory fallback blocklist cache when operating in fallback mode
const inMemoryBlocklist: Array<{
  id: string
  kioskId: string
  ip?: string
  mac?: string
  reason?: string
  blockedBy?: string
  active: boolean
  createdAt: Date
}> = []

/**
 * Normalizes IP addresses (handles ::ffff:127.0.0.1, localhost, etc.)
 */
export function normalizeIp(rawIp?: string): string {
  if (!rawIp) return ''
  let ip = rawIp.trim()
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7)
  }
  if (ip === '::1') return '127.0.0.1'
  return ip
}

/**
 * Checks whether a given IP or MAC address is blocked for a specific kiosk
 */
export async function isUserBlocked(kioskId: string, ip?: string, mac?: string): Promise<boolean> {
  const normIp = normalizeIp(ip)
  const cleanMac = mac?.trim().toLowerCase()

  if (!normIp && !cleanMac) return false

  // 1. Check Redis cache first for sub-millisecond response
  if (normIp) {
    const cachedIp = await cacheGet<boolean>(`blocked:${kioskId}:ip:${normIp}`)
    if (cachedIp !== null) return cachedIp
  }
  if (cleanMac) {
    const cachedMac = await cacheGet<boolean>(`blocked:${kioskId}:mac:${cleanMac}`)
    if (cachedMac !== null) return cachedMac
  }

  // 2. Check Database / in-memory store
  if (!isDbConnected()) {
    const isBlocked = inMemoryBlocklist.some(
      (b) =>
        b.kioskId === kioskId &&
        b.active &&
        ((normIp && b.ip && normalizeIp(b.ip) === normIp) ||
          (cleanMac && b.mac && b.mac.toLowerCase() === cleanMac))
    )
    if (normIp) cacheSet(`blocked:${kioskId}:ip:${normIp}`, isBlocked, 60).catch(() => {})
    if (cleanMac) cacheSet(`blocked:${kioskId}:mac:${cleanMac}`, isBlocked, 60).catch(() => {})
    return isBlocked
  }

  try {
    const query: any = { kioskId, active: true, $or: [] }
    if (normIp) query.$or.push({ ip: normIp })
    if (cleanMac) query.$or.push({ mac: cleanMac })

    if (query.$or.length === 0) return false

    const doc = await BlockedUser.findOne(query).lean()
    const isBlocked = Boolean(doc)

    if (normIp) cacheSet(`blocked:${kioskId}:ip:${normIp}`, isBlocked, 60).catch(() => {})
    if (cleanMac) cacheSet(`blocked:${kioskId}:mac:${cleanMac}`, isBlocked, 60).catch(() => {})

    return isBlocked
  } catch (err: any) {
    console.warn('[Blocklist] Query failed, defaulting to allowed:', err.message)
    return false
  }
}

/**
 * Blocks a user by IP and/or MAC for a given kiosk
 */
export async function blockUser(
  kioskId: string,
  params: { ip?: string; mac?: string; reason?: string; blockedBy?: string }
) {
  const normIp = normalizeIp(params.ip)
  const cleanMac = params.mac?.trim().toLowerCase()
  const reason = params.reason || 'Blocked by merchant partner'
  const blockedBy = params.blockedBy || 'merchant'

  if (!normIp && !cleanMac) {
    throw new Error('Either IP address or MAC address is required to block user.')
  }

  // Invalidate Redis cache
  if (normIp) await cacheSet(`blocked:${kioskId}:ip:${normIp}`, true, 86400)
  if (cleanMac) await cacheSet(`blocked:${kioskId}:mac:${cleanMac}`, true, 86400)

  if (!isDbConnected()) {
    const existing = inMemoryBlocklist.find(
      (b) =>
        b.kioskId === kioskId &&
        ((normIp && b.ip === normIp) || (cleanMac && b.mac === cleanMac))
    )
    if (existing) {
      existing.active = true
      existing.reason = reason
      return existing
    }
    const newEntry = {
      id: `BLK-${Date.now()}`,
      kioskId,
      ip: normIp,
      mac: cleanMac,
      reason,
      blockedBy,
      active: true,
      createdAt: new Date(),
    }
    inMemoryBlocklist.unshift(newEntry)
    return newEntry
  }

  const updated = await BlockedUser.findOneAndUpdate(
    {
      kioskId,
      $or: [
        ...(normIp ? [{ ip: normIp }] : []),
        ...(cleanMac ? [{ mac: cleanMac }] : []),
      ],
    },
    {
      $set: {
        kioskId,
        ip: normIp || undefined,
        mac: cleanMac || undefined,
        reason,
        blockedBy,
        active: true,
      },
    },
    { upsert: true, new: true }
  )

  return updated
}

/**
 * Unblocks / allows a previously blocked user
 */
export async function unblockUser(
  kioskId: string,
  params: { ip?: string; mac?: string }
): Promise<boolean> {
  const normIp = normalizeIp(params.ip)
  const cleanMac = params.mac?.trim().toLowerCase()

  // Invalidate Redis cache
  if (normIp) await cacheDel(`blocked:${kioskId}:ip:${normIp}`)
  if (cleanMac) await cacheDel(`blocked:${kioskId}:mac:${cleanMac}`)

  if (!isDbConnected()) {
    const idx = inMemoryBlocklist.findIndex(
      (b) =>
        b.kioskId === kioskId &&
        ((normIp && b.ip === normIp) || (cleanMac && b.mac === cleanMac))
    )
    if (idx !== -1) {
      inMemoryBlocklist[idx].active = false
      return true
    }
    return false
  }

  const query: any = { kioskId, $or: [] }
  if (normIp) query.$or.push({ ip: normIp })
  if (cleanMac) query.$or.push({ mac: cleanMac })

  if (query.$or.length === 0) return false

  await BlockedUser.updateMany(query, { $set: { active: false } })
  return true
}

/**
 * Retrieves all blocked users for a kiosk
 */
export async function getBlockedUsers(kioskId: string): Promise<any[]> {
  if (!isDbConnected()) {
    return inMemoryBlocklist.filter((b) => b.kioskId === kioskId && b.active)
  }
  return BlockedUser.find({ kioskId, active: true }).sort({ createdAt: -1 }).lean()
}
