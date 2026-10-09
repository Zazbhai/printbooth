/**
 * Strict Kiosk / Machine Parameter Validation
 * Enforces canonical PB-XXX format and verified network registration.
 * Eliminates false parameters like 'p-002', 'fake', etc.
 */

export const CANONICAL_KIOSK_REGEX = /^PB-\d{3}$/

export interface KioskMeta {
  id: string
  name: string
  location: string
  city: string
  status: 'ONLINE' | 'WARNING' | 'OFFLINE' | 'MAINTENANCE'
}

export const VERIFIED_KIOSKS: Record<string, KioskMeta> = {
  'PB-001': {
    id: 'PB-001',
    name: 'PrintBooth — MIT ADT University',
    location: 'Loni Kalbhor, Pune',
    city: 'Pune',
    status: 'ONLINE',
  },
}

/**
 * Checks if a string satisfies the strict canonical PrintBooth kiosk ID format:
 * Exactly 'PB-' followed by 3 numeric digits. E.g. 'PB-001', 'PB-002'.
 * Rejects 'p-002', 'pb-002', 'PB002', 'dummy', null, undefined, etc.
 */
export function isCanonicalKioskFormat(id: unknown): id is string {
  if (typeof id !== 'string') return false
  return CANONICAL_KIOSK_REGEX.test(id.trim().toUpperCase())
}

/**
 * Normalizes common user or link typos (e.g., 'p-002' -> 'PB-002', 'pb002' -> 'PB-002').
 * Returns the canonical equivalent if it matches a known pattern, otherwise null.
 */
export function normalizeKioskTypo(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const clean = raw.trim()
  if (!clean) return null

  const upper = clean.toUpperCase()

  // If already canonical, return as-is
  if (CANONICAL_KIOSK_REGEX.test(upper)) {
    return upper
  }

  // Match 'P-002', 'P002', 'PB002', 'PB-2', etc.
  const numMatch = upper.match(/^(?:P|PB)[-_]?(\d{1,3})$/)
  if (numMatch) {
    const padded = numMatch[1].padStart(3, '0')
    const candidate = `PB-${padded}`
    return candidate
  }

  return null
}

export type KioskValidationResult =
  | { status: 'VALID'; kioskId: string; meta?: KioskMeta }
  | { status: 'INVALID_FORMAT'; attemptedId: string; suggestion: string | null }
  | { status: 'NOT_FOUND'; attemptedId: string; suggestion: string | null }
  | { status: 'MISSING' }

/**
 * Strictly validates a raw kiosk parameter against the network registry.
 */
export function validateKioskId(
  rawId: string | null | undefined,
  liveKiosks?: Array<{ id?: string; kioskId?: string }> | null,
  isLoading: boolean = false
): KioskValidationResult {
  if (!rawId || !rawId.trim()) {
    return { status: 'MISSING' }
  }

  const trimmed = rawId.trim().toUpperCase()

  // Format check
  if (!CANONICAL_KIOSK_REGEX.test(trimmed)) {
    const suggestion = normalizeKioskTypo(trimmed)
    return {
      status: 'INVALID_FORMAT',
      attemptedId: trimmed,
      suggestion,
    }
  }

  // Network registry check
  const inVerified = VERIFIED_KIOSKS[trimmed]
  const inLive = liveKiosks?.some(k => ((k.kioskId || k.id || '').toUpperCase()) === trimmed)

  if (inVerified || inLive) {
    return {
      status: 'VALID',
      kioskId: trimmed,
      meta: inVerified,
    }
  }

  // While live kiosks are still loading or empty, do not prematurely fail canonical IDs
  if (isLoading || liveKiosks === null || liveKiosks === undefined || liveKiosks.length === 0) {
    return {
      status: 'VALID',
      kioskId: trimmed,
    }
  }

  // Matches PB-XXX format but doesn't exist in network after list is verified loaded
  return {
    status: 'NOT_FOUND',
    attemptedId: trimmed,
    suggestion: normalizeKioskTypo(trimmed),
  }
}
