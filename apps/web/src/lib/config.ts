/**
 * Centralized Domain & URL Configuration for Customer Web App
 * Supports environment overrides via .env (VITE_SITE_URL, VITE_CLIENT_WEB_URL, VITE_API_URL)
 * and dynamically defaults to current browser window.location.origin.
 */

export function getSiteUrl(): string {
  const envUrl = import.meta.env.VITE_SITE_URL || import.meta.env.VITE_CLIENT_WEB_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin.replace(/\/+$/, '')
  }
  return 'https://printbooth.in'
}

export function getKioskPrintUrl(kioskId: string): string {
  const base = getSiteUrl()
  return `${base}/print?id=${encodeURIComponent(kioskId)}`
}

export function getAdminConsoleUrl(): string {
  const envUrl = import.meta.env.VITE_CLIENT_ADMIN_URL || import.meta.env.VITE_ADMIN_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    // If domain is printbooth.in -> https://admin.printbooth.in
    const host = window.location.hostname.replace(/^www\./, '')
    return `${window.location.protocol}//admin.${host}`
  }
  return 'http://localhost:5174'
}

export function getMerchantPortalUrl(): string {
  return `${getAdminConsoleUrl()}/merchant`
}

export function getApiBaseUrl(): string {
  // When accessed from another device on the network (e.g. phone at 192.168.x.x, domain, or ngrok),
  // NEVER use a localhost URL from .env, because 'localhost' on a phone points to the phone itself.
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
 * Returns the host root without trailing /api, ensuring mobile devices route to window.location.origin
 */
export function getApiHostUrl(): string {
  const base = getApiBaseUrl()
  return base.replace(/\/api\/?$/, '')
}

/**
 * Returns the WebSocket URL for the WSS relay.
 * When on LAN / mobile (e.g. 192.168.x.x), connects to the current host/port (/ws) which Vite proxies.
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
