/**
 * Centralized Domain & URL Configuration for Admin & Merchant Console
 * Supports environment overrides via .env (VITE_CLIENT_WEB_URL, VITE_SITE_URL, VITE_API_URL)
 * and dynamically defaults to the production web app or current domain.
 */

export function getClientWebUrl(): string {
  const envUrl = import.meta.env.VITE_CLIENT_WEB_URL || import.meta.env.VITE_SITE_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    // If running on admin.printbooth.in -> https://printbooth.in
    const host = window.location.hostname.replace(/^admin\./, '')
    return `${window.location.protocol}//${host}`
  }
  return 'http://localhost:5200'
}

export function getKioskPrintUrl(kioskId: string): string {
  const base = getClientWebUrl()
  return `${base}/print?id=${encodeURIComponent(kioskId)}`
}

export function getAdminConsoleUrl(): string {
  const envUrl = import.meta.env.VITE_CLIENT_ADMIN_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin.replace(/\/+$/, '')
  }
  return 'http://localhost:5174'
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    if (!isLocalhost) {
      const envUrl = import.meta.env.VITE_API_URL
      if (envUrl && typeof envUrl === 'string' && envUrl.trim() && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
        const clean = envUrl.trim().replace(/\/+$/, '')
        return clean.endsWith('/api') ? clean : `${clean}/api`
      }
      return `${window.location.origin}/api`
    }
  }

  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    const clean = envUrl.trim().replace(/\/+$/, '')
    return clean.endsWith('/api') ? clean : `${clean}/api`
  }
  return 'http://localhost:5000/api'
}

/**
 * Returns the host root without trailing /api, ensuring mobile/LAN devices route to window.location.origin
 */
export function getApiHostUrl(): string {
  const base = getApiBaseUrl()
  return base.replace(/\/api\/?$/, '')
}

/**
 * Returns the WebSocket URL for the WSS relay.
 */
export function getWsRelayUrl(): string {
  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    if (!isLocalhost) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${proto}//${window.location.host}/ws`
    }
  }
  const host = getApiHostUrl()
  return host.replace(/^http/, 'ws') + '/ws'
}
