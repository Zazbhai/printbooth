/**
 * Device detection utility for PrintBooth.
 * Checks whether the current user is accessing via a smartphone or tablet.
 */

export function isSmartphoneOrTablet(): boolean {
  if (typeof window === 'undefined') return true

  // 1. Check developer/testing bypass in query params or session storage
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('allowDesktop') === 'true' || params.get('dev') === '1') {
      return true
    }
    if (sessionStorage.getItem('pb_allow_desktop') === 'true') {
      return true
    }
  } catch {}

  const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase()

  // 2. Standard Mobile & Tablet User-Agent Regex
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet|silk|kindle|playbook|bb10/i
  if (mobileRegex.test(ua)) {
    return true
  }

  // 3. Apple iPadOS 13+ spoofing as macOS Safari
  // (iPadOS reports navigator.userAgent as Macintosh, but has multi-touch)
  const isIpadOS = /macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1
  if (isIpadOS) {
    return true
  }

  // 4. Android tablets that only say Android
  if (/android/i.test(ua)) {
    return true
  }

  // 5. Touchscreen devices with tablet-sized viewports (<= 1024px width with coarse pointer)
  const hasTouchScreen = (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) || ('ontouchstart' in window)
  if (hasTouchScreen && window.innerWidth <= 1024) {
    return true
  }

  // Device is a desktop PC, laptop, or workstation
  return false
}

export function setAllowDesktopBypass(allow: boolean = true) {
  try {
    if (allow) {
      sessionStorage.setItem('pb_allow_desktop', 'true')
    } else {
      sessionStorage.removeItem('pb_allow_desktop')
    }
  } catch {}
}
