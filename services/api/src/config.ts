import type { Request } from 'express'

/**
 * Resolves the public customer web URL (e.g. 'https://printbooth.in' or 'http://localhost:5200').
 * Reads environment variables: SITE_URL or CLIENT_WEB_URL, or derives from incoming request.
 */
export function getPublicWebUrl(req?: Request): string {
  const envUrl = process.env.SITE_URL || process.env.CLIENT_WEB_URL
  if (envUrl) {
    const clean = envUrl.trim().replace(/\/+$/, '')
    // Don't use legacy 5201 port default if it wasn't explicitly desired
    if (clean !== 'http://localhost:5201') {
      return clean
    }
  }

  // If request origin or referer header is provided from client browser
  if (req) {
    const origin = req.headers?.origin || req.headers?.referer
    if (typeof origin === 'string' && origin) {
      try {
        const parsed = new URL(origin)
        // Ensure not admin console (port 5174 or admin. subdomain)
        if (!parsed.port.includes('5174') && !parsed.hostname.startsWith('admin.')) {
          return `${parsed.protocol}//${parsed.host}`
        }
      } catch {}
    }

    // Try host header if reverse proxied
    const host = req.headers?.host
    if (host && !host.includes('5000') && !host.includes('5174')) {
      const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
      return `${proto}://${host}`
    }
  }

  return envUrl ? envUrl.trim().replace(/\/+$/, '') : 'http://localhost:5200'
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
