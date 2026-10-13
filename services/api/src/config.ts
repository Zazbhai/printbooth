import type { Request } from 'express'

/**
 * Resolves the public customer web URL (e.g. 'https://printbooth.in' or 'http://localhost:5200').
 * Reads environment variables: SITE_URL or CLIENT_WEB_URL, or derives from incoming request.
 */
export function getPublicWebUrl(_req?: Request): string {
  const envUrl = process.env.SITE_URL || process.env.CLIENT_WEB_URL || process.env.VITE_SITE_URL || process.env.VITE_CLIENT_WEB_URL
  if (envUrl && envUrl.trim()) {
    const clean = envUrl.trim().replace(/\/+$/, '')
    if (clean && !clean.includes('192.168.') && clean !== 'http://localhost:5201' && clean !== 'http://localhost:5200') {
      return clean
    }
  }
  return 'https://printbooth.co.in'
}

/**
 * Returns canonical QR code / direct print URL for a kiosk
 */
export function getKioskPrintUrl(kioskId: string, req?: Request): string {
  const base = getPublicWebUrl(req)
  return `${base}/print?id=${encodeURIComponent(kioskId)}`
}

/**
 * Resolves the admin / merchant console URL
 */
export function getAdminConsoleUrl(req?: Request): string {
  const envUrl = process.env.CLIENT_ADMIN_URL
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '')
  }
  return 'http://localhost:5174'
}
