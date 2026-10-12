/**
 * PrintBooth — Kiosk Session Client
 *
 * Used by the web app (/print) when loaded via a kiosk-generated QR code.
 * The QR code URL contains a ?session=<token> parameter.
 *
 * This module:
 * 1. Detects the session token in the URL
 * 2. Claims the session (locking it to this user)
 * 3. Reports progress back to the kiosk as the user advances through steps
 * 4. Sends the OTP to the kiosk session so it can be displayed on screen
 */

import { getApiBase as getApiBaseFromApi } from './api'
import { prepareKioskPreviews } from './kioskThumbnail'
import { setKioskVariant } from './multiFileStore'

export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      const base = getApiBaseFromApi()
      if (base && !base.includes('printbooth.co.in')) {
        return base
      }
      return 'http://localhost:5000'
    }
    if (window.location.hostname.includes('printbooth')) {
      return 'https://api.printbooth.co.in'
    }
  }
  const base = getApiBaseFromApi()
  if (base.includes(':5200')) {
    return base.replace(':5200', ':5000')
  }
  return base || 'http://localhost:5000'
}

async function parseJsonResponse(res: Response): Promise<any> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    console.warn('[kioskSession] Received non-JSON response from server:', text.slice(0, 150))
    return {
      success: false,
      error: res.status >= 500
        ? `Server error (${res.status}). Please try again shortly.`
        : res.status === 404
        ? 'Session endpoint not found. Please refresh or re-scan.'
        : `Unexpected response from server (${res.status})`
    }
  }
}

export type KioskSessionPhase =
  | 'UPLOADING'
  | 'CONFIRMING'
  | 'CONFIGURING'
  | 'REVIEWING'
  | 'PAYING'
  | 'OTP_READY'
  | 'PRINTING'
  | 'DONE'

interface SessionProgressPayload {
  state: KioskSessionPhase
  phase: string
  phaseStep: number
  otp?: string
  orderId?: string
  fileName?: string
  totalPages?: number
  copies?: number
  colourMode?: string
  amount?: number
  progressData?: Record<string, any>
  settings?: Record<string, any>
  files?: Array<{
    id?: string
    fileName: string
    fileSize?: number
    fileType?: string
    pageCount?: number
    copies?: number
    colour?: string
    duplex?: string
    previews?: any[]
  }>
}

let _activeSessionId: string | null = null
let _activeToken: string | null = null
let _claimed = false

const _expiredTokens = new Set<string>()

/**
 * Mark a session token as permanently expired so it is never re-claimed or re-read
 */
export function markTokenExpired(token: string): void {
  if (!token) return
  _expiredTokens.add(token)
  try {
    sessionStorage.setItem(`pb_expired_token_${token}`, '1')
  } catch {}
  clearActiveKioskSession()
  if (typeof window !== 'undefined' && window.location.search.includes('session=')) {
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('session')
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash)
    } catch {}
  }
}

/**
 * Check if a session token is known to be expired
 */
export function isTokenExpired(token: string): boolean {
  if (!token) return false
  if (_expiredTokens.has(token)) return true
  try {
    return sessionStorage.getItem(`pb_expired_token_${token}`) === '1'
  } catch {
    return false
  }
}

/**
 * Get or create a persistent client secret unique to this browser device / session
 */
export function getClientClaimSecret(sessionId?: string): string {
  if (typeof window === 'undefined') return 'server_claim_secret'
  const key = sessionId ? `pb_claim_secret_${sessionId}` : 'pb_claim_secret_active'
  let secret = sessionStorage.getItem(key) || localStorage.getItem(key)
  if (!secret) {
    secret = 'cs_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36)
    try {
      sessionStorage.setItem(key, secret)
      localStorage.setItem(key, secret)
    } catch {}
  }
  return secret
}

export function saveClientClaimSecret(sessionId: string, secret: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(`pb_claim_secret_${sessionId}`, secret)
    localStorage.setItem(`pb_claim_secret_${sessionId}`, secret)
    sessionStorage.setItem('pb_claim_secret_active', secret)
    localStorage.setItem('pb_claim_secret_active', secret)
  } catch {}
}

export function clearActiveKioskSession(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem('pb_kiosk_session_id')
    sessionStorage.removeItem('pb_kiosk_session_token')
    sessionStorage.removeItem('pb_kiosk_id_from_session')
    sessionStorage.removeItem('pb_files')
    sessionStorage.removeItem('pb_file_name')
    sessionStorage.removeItem('pb_settings')
    sessionStorage.removeItem('pb_print_step')
    sessionStorage.removeItem('pb_total_price')
    sessionStorage.removeItem('pb_page_count')
    sessionStorage.removeItem('pb_confirm_mode')
    sessionStorage.removeItem('pb_claim_secret_active')
    localStorage.removeItem('pb_kiosk_session_token')
    localStorage.removeItem('pb_kiosk_session_id')
    localStorage.removeItem('pb_claim_secret_active')
  } catch {}
  _activeSessionId = null
  _activeToken = null
  _claimed = false

  if (typeof window !== 'undefined' && window.location.search.includes('session=')) {
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('session')
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash)
    } catch {}
  }
}

/**
 * Extract session token from current page URL (?session=...)
 */
export function getSessionTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('session')
}

/**
 * Decode full token payload (base64 or base64url)
 */
export function decodeTokenPayload(token: string): any | null {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/')
    const pad = (4 - (b64.length % 4)) % 4
    const padded = pad === 4 ? b64 : b64 + '='.repeat(pad)
    const raw = atob(padded)
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Extract sessionId from a verified token payload (base64url decode)
 */
export function decodeTokenSessionId(token: string): string | null {
  const payload = decodeTokenPayload(token)
  return payload?.sessionId || null
}

/**
 * Synchronously populate session memory and sessionStorage from URL or storage
 */
export function initSessionFromEnvironment(): void {
  if (typeof window === 'undefined') return

  try {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('session')
    const kioskId = params.get('id')

    if (token) {
      if (isTokenExpired(token)) {
        // Strip expired session token from URL immediately to prevent reload loop
        const url = new URL(window.location.href)
        url.searchParams.delete('session')
        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash)
        _activeSessionId = null
        _activeToken = null
        _claimed = false
        return
      }

      _activeToken = token
      sessionStorage.setItem('pb_kiosk_session_token', token)
      const payload = decodeTokenPayload(token)
      if (payload?.sessionId) {
        _activeSessionId = payload.sessionId
        sessionStorage.setItem('pb_kiosk_session_id', payload.sessionId)
      }
      if (payload?.kioskId) {
        sessionStorage.setItem('pb_kiosk_id', payload.kioskId)
        sessionStorage.setItem('pb_kiosk_id_from_session', payload.kioskId)
      }
    }

    if (kioskId) {
      sessionStorage.setItem('pb_kiosk_id', kioskId)
      sessionStorage.setItem('pb_kiosk_id_from_session', kioskId)
    }

    let savedId = sessionStorage.getItem('pb_kiosk_session_id') || localStorage.getItem('pb_kiosk_session_id')
    const savedToken = sessionStorage.getItem('pb_kiosk_session_token') || localStorage.getItem('pb_kiosk_session_token')
    if (savedToken && isTokenExpired(savedToken)) {
      clearActiveKioskSession()
    } else if (savedToken) {
      if (!savedId) {
        savedId = decodeTokenSessionId(savedToken)
        if (savedId) {
          sessionStorage.setItem('pb_kiosk_session_id', savedId)
        }
      }
      _activeSessionId = savedId
      _activeToken = savedToken
      _claimed = true
    } else if (savedId) {
      _activeSessionId = savedId
      _claimed = true
    }
  } catch (e) {
    console.warn('[kioskSession] initSessionFromEnvironment error:', e)
  }
}

// Run immediately on script evaluation
initSessionFromEnvironment()

/**
 * Claim the kiosk session — must be called when user opens the print page via QR.
 * Returns sessionId on success, or machineInUse: true if already occupied.
 */
export async function claimKioskSession(token: string): Promise<{
  success: boolean
  isExpired?: boolean
  machineInUse?: boolean
  sessionId?: string
  kioskId?: string
  error?: string
  message?: string
}> {
  const decodedPayload = decodeTokenPayload(token)
  const decodedKioskId = decodedPayload?.kioskId
  const decodedId = decodeTokenSessionId(token)

  if (isTokenExpired(token)) {
    clearActiveKioskSession()
    return {
      success: false,
      isExpired: true,
      machineInUse: false,
      kioskId: decodedKioskId || 'PB-001',
      error: 'SESSION_EXPIRED',
      message: 'This QR code has expired. Please scan the current live QR code on the kiosk screen.',
    }
  }

  const clientClaimToken = getClientClaimSecret(decodedId || undefined)

  try {
    const apiBase = getApiBase()
    const res = await fetch(`${apiBase}/api/kiosk-sessions/${encodeURIComponent(token)}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-claim-token': clientClaimToken,
      },
      body: JSON.stringify({ clientClaimToken }),
    })
    const data = await parseJsonResponse(res)

    // 409 Conflict: Machine is already claimed and in use by another person!
    if (res.status === 409 || data.code === 'MACHINE_ALREADY_IN_USE' || data.error === 'MACHINE_ALREADY_IN_USE') {
      clearActiveKioskSession()
      return {
        success: false,
        machineInUse: true,
        isExpired: false,
        kioskId: data.kioskId || decodedKioskId,
        error: 'MACHINE_ALREADY_IN_USE',
        message: data.message || 'Machine already in use',
      }
    }

    // 410 Gone / 404 Not Found / Session Expired / Completed
    const isExpiredError =
      res.status === 410 ||
      res.status === 404 ||
      data.code === 'SESSION_EXPIRED' ||
      data.code === 'SESSION_COMPLETED' ||
      data.error === 'SESSION_EXPIRED' ||
      data.error === 'SESSION_COMPLETED' ||
      String(data.error || '').toLowerCase().includes('expired') ||
      String(data.message || '').toLowerCase().includes('expired')

    if (isExpiredError) {
      markTokenExpired(token)
      clearActiveKioskSession()
      return {
        success: false,
        isExpired: true,
        machineInUse: false,
        kioskId: data.kioskId || decodedKioskId,
        error: data.error || data.code || 'SESSION_EXPIRED',
        message: data.message || 'This QR code has expired. Please scan the current live QR code on the kiosk screen.',
      }
    }

    if (data.success && data.sessionId) {
      _activeSessionId = data.sessionId
      _activeToken = token
      _claimed = true
      if (data.claimSecret) {
        saveClientClaimSecret(data.sessionId, data.claimSecret)
      }
      sessionStorage.setItem('pb_kiosk_session_id', data.sessionId)
      localStorage.setItem('pb_kiosk_session_id', data.sessionId)
      sessionStorage.setItem('pb_kiosk_session_token', token)
      localStorage.setItem('pb_kiosk_session_token', token)
      sessionStorage.setItem('pb_kiosk_id_from_session', data.kioskId || '')
      if (data.kioskId) {
        sessionStorage.setItem('pb_kiosk_id', data.kioskId)
        localStorage.setItem('pb_kiosk_id', data.kioskId)
      }
      if (data.kioskVariant || data.variant) {
        setKioskVariant(data.kioskVariant || data.variant, data.kioskId)
      }
      return { ...data, machineInUse: false, isExpired: false }
    }

    clearActiveKioskSession()
    return {
      success: false,
      isExpired: true,
      machineInUse: false,
      kioskId: data.kioskId || decodedKioskId,
      error: data.error || 'Failed to connect to kiosk session',
    }
  } catch (err: any) {
    console.warn('[kioskSession] Claim request failed:', err)
    return {
      success: false,
      machineInUse: false,
      error: `Network error: ${err.message}`,
    }
  }
}

let _lastPhoneActivityTimestamp = Date.now()
let _lastActivityReportedAt = 0

/**
 * Returns epoch timestamp of user's latest touch/interaction on their phone
 */
export function getLastPhoneActivityTimestamp(): number {
  return _lastPhoneActivityTimestamp
}

/**
 * Record user touch/interaction strictly on their phone.
 * Throttles network pings to POST /api/kiosk-sessions/:sessionId/phone-activity
 * to at most once every 3.5 seconds.
 */
export function recordPhoneActivity(): void {
  _lastPhoneActivityTimestamp = Date.now()
  const { sessionId } = getActiveKioskSession()
  if (!sessionId) return

  const now = Date.now()
  if (now - _lastActivityReportedAt < 3500) return
  _lastActivityReportedAt = now

  const clientClaimToken = getClientClaimSecret(sessionId)
  const apiBase = getApiBase()
  fetch(`${apiBase}/api/kiosk-sessions/${encodeURIComponent(sessionId)}/phone-activity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-claim-token': clientClaimToken,
    },
    body: JSON.stringify({ clientClaimToken }),
  }).catch(() => {
    // Non-blocking best effort
  })
}

// Automatically register touch listeners on the user's phone
if (typeof window !== 'undefined') {
  const PHONE_TOUCH_EVENTS = [
    'touchstart',
    'touchend',
    'touchmove',
    'pointerdown',
    'pointerup',
    'click',
    'mousedown',
    'mouseup',
    'keydown',
    'scroll',
    'input',
    'change',
  ]
  PHONE_TOUCH_EVENTS.forEach(evt => {
    window.addEventListener(evt, () => recordPhoneActivity(), { passive: true, capture: true })
  })

  // Periodically send phone heartbeat every 5s while active in a kiosk session
  setInterval(() => {
    if (kioskSession.isKioskSession()) {
      recordPhoneActivity()
    }
  }, 5000)
}

/**
 * Get the currently active session (from state, session storage, or URL)
 */
export function getActiveKioskSession(): { sessionId: string | null; token: string | null; claimed: boolean } {
  if (_activeSessionId) return { sessionId: _activeSessionId, token: _activeToken, claimed: _claimed }

  initSessionFromEnvironment()

  if (_activeSessionId) return { sessionId: _activeSessionId, token: _activeToken, claimed: _claimed }

  if (typeof window !== 'undefined') {
    let sId = sessionStorage.getItem('pb_kiosk_session_id') || localStorage.getItem('pb_kiosk_session_id')
    const sTok = sessionStorage.getItem('pb_kiosk_session_token') || localStorage.getItem('pb_kiosk_session_token') || getSessionTokenFromUrl()
    if (!sId && sTok) {
      sId = decodeTokenSessionId(sTok)
      if (sId) {
        sessionStorage.setItem('pb_kiosk_session_id', sId)
      }
    }
    if (sId) {
      _activeSessionId = sId
      _activeToken = sTok || null
      _claimed = true
      return { sessionId: sId, token: sTok || null, claimed: true }
    }
  }

  return { sessionId: null, token: null, claimed: false }
}

/**
 * Report current progress to the kiosk display.
 * Fire-and-forget — doesn't block the UI.
 */
export async function reportKioskProgress(payload: SessionProgressPayload): Promise<void> {
  _lastPhoneActivityTimestamp = Date.now()
  _lastActivityReportedAt = Date.now()

  let { sessionId } = getActiveKioskSession()
  const apiBase = getApiBase()

  if (!sessionId) {
    const kioskId =
      kioskSession.getKioskId() ||
      (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null) ||
      (typeof window !== 'undefined' ? (sessionStorage.getItem('pb_kiosk_id') || localStorage.getItem('pb_kiosk_id')) : null) ||
      'PB-001'

    try {
      const activeRes = await fetch(`${apiBase}/api/kiosk-sessions/active/${encodeURIComponent(kioskId)}`)
      const activeData = await parseJsonResponse(activeRes)
      if (activeData.success && activeData.session?.sessionId) {
        sessionId = activeData.session.sessionId
        _activeSessionId = sessionId
        sessionStorage.setItem('pb_kiosk_session_id', sessionId)
        sessionStorage.setItem('pb_kiosk_id_from_session', kioskId)
        if (activeData.session.token) {
          _activeToken = activeData.session.token
          sessionStorage.setItem('pb_kiosk_session_token', activeData.session.token)
        }
      }
    } catch {}
  }

  if (!sessionId) return

  const clientClaimToken = getClientClaimSecret(sessionId)
  try {
    const res = await fetch(`${apiBase}/api/kiosk-sessions/${sessionId}/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-claim-token': clientClaimToken,
      },
      body: JSON.stringify({ ...payload, clientClaimToken }),
    })
    if (res.status === 410 || res.status === 404) {
      const data = await parseJsonResponse(res)
      if (data.code === 'SESSION_EXPIRED' || data.error === 'SESSION_EXPIRED' || data.isExpired) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pb:session-expired', { detail: data }))
        }
      }
    }
  } catch {
    // Silently ignore — kiosk display is best-effort
  }
}

/**
 * Convenience helpers for each print flow step
 */
export const kioskSession = {
  reportUploading(fileName?: string, customPhase?: string) {
    const isPpt = fileName && /\.(pptx?)$/i.test(fileName)
    const isDocx = fileName && /\.(docx?)$/i.test(fileName)
    const defaultPhase = isPpt
      ? 'Processing PPT… Converting presentation to PDF'
      : isDocx
      ? 'Processing DOCX… Converting Word document to PDF'
      : (fileName ? `Uploading ${fileName}…` : 'Uploading your document…')

    reportKioskProgress({
      state: 'UPLOADING',
      phase: customPhase || defaultPhase,
      phaseStep: 1,
      ...(fileName ? { fileName } : {}),
    })
  },

  reportProcessing(fileName?: string, format?: 'PPT' | 'DOCX' | string) {
    const fmt = format || (fileName && /\.(pptx?)$/i.test(fileName) ? 'PPT' : 'DOCX')
    reportKioskProgress({
      state: 'UPLOADING',
      phase: `Processing ${fmt}… Converting document to PDF`,
      phaseStep: 1,
      ...(fileName ? { fileName } : {}),
    })
  },

  reportConfirming(opts?: {
    fileName?: string
    totalPages?: number
    files?: any[]
  }) {
    reportKioskProgress({
      state: 'CONFIRMING',
      phase: 'Reviewing document on mobile…',
      phaseStep: 2,
      ...(opts?.fileName ? { fileName: opts.fileName } : {}),
      ...(opts?.totalPages ? { totalPages: opts.totalPages } : {}),
      ...(opts?.files ? { files: opts.files } : {}),
    })
  },

  reportConfiguring(opts?: {
    fileName?: string
    totalPages?: number
    copies?: number
    colourMode?: string
    duplex?: string
    amount?: number
    settings?: Record<string, any>
    files?: any[]
  }) {
    reportKioskProgress({
      state: 'CONFIGURING',
      phase: 'Configuring print settings on mobile…',
      phaseStep: 3,
      ...(opts?.fileName ? { fileName: opts.fileName } : {}),
      ...(opts?.totalPages ? { totalPages: opts.totalPages } : {}),
      ...(opts?.copies ? { copies: opts.copies } : {}),
      ...(opts?.colourMode ? { colourMode: opts.colourMode } : {}),
      ...(opts?.amount ? { amount: opts.amount } : {}),
      ...(opts?.files ? { files: opts.files } : {}),
      settings: {
        ...(opts?.colourMode ? { colour: opts.colourMode } : {}),
        ...(opts?.duplex ? { duplex: opts.duplex } : {}),
        ...(opts?.copies ? { copies: opts.copies } : {}),
        ...(opts?.amount ? { totalAmount: opts.amount } : {}),
        ...(opts?.settings || {}),
      },
    })
  },

  reportReviewing(opts?: {
    fileName?: string
    totalPages?: number
    copies?: number
    colourMode?: string
    duplex?: string
    amount?: number
    orderId?: string
    settings?: Record<string, any>
    files?: any[]
  }) {
    reportKioskProgress({
      state: 'REVIEWING',
      phase: 'Reviewing order on mobile…',
      phaseStep: 4,
      ...(opts?.fileName ? { fileName: opts.fileName } : {}),
      ...(opts?.totalPages ? { totalPages: opts.totalPages } : {}),
      ...(opts?.copies ? { copies: opts.copies } : {}),
      ...(opts?.colourMode ? { colourMode: opts.colourMode } : {}),
      ...(opts?.amount ? { amount: opts.amount } : {}),
      ...(opts?.orderId ? { orderId: opts.orderId } : {}),
      ...(opts?.files ? { files: opts.files } : {}),
      settings: {
        ...(opts?.colourMode ? { colour: opts.colourMode } : {}),
        ...(opts?.duplex ? { duplex: opts.duplex } : {}),
        ...(opts?.copies ? { copies: opts.copies } : {}),
        ...(opts?.amount ? { totalAmount: opts.amount } : {}),
        ...(opts?.settings || {}),
      },
    })
  },

  reportPaying(opts?: {
    fileName?: string
    totalPages?: number
    amount?: number
    orderId?: string
    colourMode?: string
    copies?: number
    duplex?: string
    files?: any[]
  }) {
    reportKioskProgress({
      state: 'PAYING',
      phase: 'Scan UPI QR on kiosk display to pay',
      phaseStep: 5,
      ...(opts?.fileName ? { fileName: opts.fileName } : {}),
      ...(opts?.totalPages ? { totalPages: opts.totalPages } : {}),
      ...(opts?.copies ? { copies: opts.copies } : {}),
      ...(opts?.colourMode ? { colourMode: opts.colourMode } : {}),
      ...(opts?.amount ? { amount: opts.amount } : {}),
      ...(opts?.orderId ? { orderId: opts.orderId } : {}),
      ...(opts?.files ? { files: opts.files } : {}),
      settings: {
        ...(opts?.colourMode ? { colour: opts.colourMode } : {}),
        ...(opts?.duplex ? { duplex: opts.duplex } : {}),
        ...(opts?.copies ? { copies: opts.copies } : {}),
        ...(opts?.amount ? { totalAmount: opts.amount } : {}),
      },
    })

    if (opts?.amount) {
      initiateKioskPayment(opts.amount, opts.orderId).catch(() => {})
    }
  },

  reportOtpReady(otp: string, orderId?: string, totalPages?: number) {
    reportKioskProgress({
      state: 'OTP_READY',
      phase: 'Your OTP is ready — check kiosk screen',
      phaseStep: 5,
      otp,
      ...(orderId ? { orderId } : {}),
      ...(totalPages ? { totalPages } : {}),
    })
  },

  reportPrinting(opts?: string | { orderId?: string; fileName?: string; phase?: string }) {
    const orderId = typeof opts === 'string' ? opts : opts?.orderId
    const fileName = typeof opts === 'object' ? opts?.fileName : undefined
    const isPpt = fileName && /\.(pptx?)$/i.test(fileName)
    const isDocx = fileName && /\.(docx?)$/i.test(fileName)
    const customPhase = typeof opts === 'object' ? opts?.phase : undefined
    const defaultPhase = isPpt
      ? 'Processing PPT into print PDF…'
      : isDocx
      ? 'Processing DOCX into print PDF…'
      : 'Printing your document on Brother hardware…'

    reportKioskProgress({
      state: 'PRINTING',
      phase: customPhase || defaultPhase,
      phaseStep: 6,
      ...(orderId ? { orderId } : {}),
      ...(fileName ? { fileName } : {}),
    })
  },

  reportDone() {
    reportKioskProgress({
      state: 'DONE',
      phase: 'Print completed!',
      phaseStep: 7,
    })
    // Clear session from storage
    sessionStorage.removeItem('pb_kiosk_session_id')
    sessionStorage.removeItem('pb_kiosk_session_token')
    sessionStorage.removeItem('pb_kiosk_id_from_session')
    _activeSessionId = null
    _activeToken = null
    _claimed = false
  },

  /**
   * Returns true ONLY when there is a live, non-expired QR session active.
   * A bare ?id= param or a saved pb_kiosk_id does NOT count as a kiosk session.
   * This prevents upload failures (no sessionId) and expired-session bypasses.
   */
  isKioskSession(): boolean {
    if (typeof window === 'undefined') return false

    // 1. In-memory active session
    if (_activeSessionId && _activeToken && !isTokenExpired(_activeToken)) return true
    if (_claimed && _activeSessionId) return true

    // 2. URL token: must be present and not marked expired
    const urlToken = getSessionTokenFromUrl()
    if (urlToken && !isTokenExpired(urlToken)) return true

    // 3. Stored token in sessionStorage or localStorage
    const storedToken = sessionStorage.getItem('pb_kiosk_session_token') || localStorage.getItem('pb_kiosk_session_token')
    if (storedToken && !isTokenExpired(storedToken)) return true

    // 4. Stored session ID
    const storedId = sessionStorage.getItem('pb_kiosk_session_id') || localStorage.getItem('pb_kiosk_session_id')
    if (storedId) return true

    return false
  },

  /** Get the kiosk ID associated with this session */
  getKioskId(): string | null {
    return sessionStorage.getItem('pb_kiosk_id_from_session')
  },

  /** Upload document to the connected kiosk station */
  uploadDocument: uploadDocumentToKiosk,

  /** Advance session to next phase */
  advanceToNextPhase,

  /** Cancel the connected kiosk session */
  cancel: cancelKioskSession,

  /** Notify kiosk that user went back or left the connected session from phone */
  notifyPhoneBackOrExit,

  /** Notify kiosk that phone reconnected or user is actively touching phone */
  notifyPhoneReconnect,

  /** Fetch status of the connected kiosk session */
  getStatus: fetchKioskSessionStatus,

  /** Initiate payment on connected kiosk session (displays UPI QR code on screen) */
  initiatePayment: initiateKioskPayment,
}

/**
 * Initiate payment on the connected kiosk session, generating merchant UPI Express QR on the screen
 */
export async function initiateKioskPayment(amount: number, orderId?: string): Promise<{
  success: boolean
  sessionId?: string
  orderId?: string
  otp?: string
  amount?: number
  upiQrValue?: string
  paymentUrl?: string
  upiIntentUrl?: string
  merchantUpiId?: string
  gateway?: string
  error?: string
}> {
  let { sessionId } = getActiveKioskSession()
  const apiBase = getApiBase()

  if (!sessionId) {
    const kioskId =
      kioskSession.getKioskId() ||
      (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null) ||
      (typeof window !== 'undefined' ? (sessionStorage.getItem('pb_kiosk_id') || localStorage.getItem('pb_kiosk_id')) : null) ||
      'PB-001'

    try {
      const activeRes = await fetch(`${apiBase}/api/kiosk-sessions/active/${encodeURIComponent(kioskId)}`)
      const activeData = await parseJsonResponse(activeRes)
      if (activeData.success && activeData.session?.sessionId) {
        sessionId = activeData.session.sessionId
        _activeSessionId = sessionId
        sessionStorage.setItem('pb_kiosk_session_id', sessionId)
        sessionStorage.setItem('pb_kiosk_id_from_session', kioskId)
      }
    } catch {}
  }

  if (!sessionId) {
    return { success: false, error: 'No active kiosk session' }
  }

  const clientClaimToken = getClientClaimSecret(sessionId)
  try {
    const res = await fetch(`${apiBase}/api/kiosk-sessions/${encodeURIComponent(sessionId)}/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-claim-token': clientClaimToken,
      },
      body: JSON.stringify({ amount, orderId, clientClaimToken }),
    })
    const data = await parseJsonResponse(res)
    return data
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Upload document directly to the connected Raspberry Pi kiosk session
 */
export async function uploadDocumentToKiosk(opts: {
  file?: File | null
  fileName: string
  fileSize: number
  fileType: string
  pageCount: number
  previews?: Array<{ pageNumber: number; url: string; title?: string }>
  files?: Array<{
    id?: string
    fileName: string
    fileSize?: number
    fileType?: string
    pageCount?: number
    copies?: number
    colour?: string
    duplex?: string
    previews?: Array<{ pageNumber: number; url: string; title?: string }>
  }>
}): Promise<{ success: boolean; error?: string; session?: any; machineInUse?: boolean }> {
  let { sessionId } = getActiveKioskSession()
  const apiBase = getApiBase()

  // Check if the stored session token is expired — if so, clear it so we can re-sync with active session
  const storedToken = sessionStorage.getItem('pb_kiosk_session_token')
  if (storedToken && isTokenExpired(storedToken)) {
    sessionStorage.removeItem('pb_kiosk_session_token')
    sessionStorage.removeItem('pb_kiosk_session_id')
    sessionId = null
    _activeSessionId = null
    _activeToken = null
  }

  // Resilient fallback: If sessionId not found yet, query active session directly for current kiosk station
  if (!sessionId) {
    const kioskId =
      kioskSession.getKioskId() ||
      (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null) ||
      (typeof window !== 'undefined' ? (sessionStorage.getItem('pb_kiosk_id') || localStorage.getItem('pb_kiosk_id')) : null) ||
      'PB-001'

    try {
      const activeRes = await fetch(`${apiBase}/api/kiosk-sessions/active/${encodeURIComponent(kioskId)}`)
      const activeData = await parseJsonResponse(activeRes)
      if (activeData.success && activeData.session?.sessionId) {
        sessionId = activeData.session.sessionId
        _activeSessionId = sessionId
        sessionStorage.setItem('pb_kiosk_session_id', sessionId)
        sessionStorage.setItem('pb_kiosk_id_from_session', kioskId)
        if (activeData.session.token) {
          _activeToken = activeData.session.token
          sessionStorage.setItem('pb_kiosk_session_token', activeData.session.token)
        }
      }
    } catch (e) {
      console.warn('[uploadDocumentToKiosk] Station fallback error:', e)
    }
  }

  if (!sessionId) {
    return { success: false, error: 'No active kiosk session found. Please scan the QR code on the kiosk screen again.' }
  }
  const formData = new FormData()

  if (opts.file) {
    formData.append('file', opts.file, opts.fileName)
  }
  formData.append('fileName', opts.fileName)
  formData.append('fileSize', String(opts.fileSize))
  formData.append('fileType', opts.fileType)
  formData.append('pageCount', String(opts.pageCount))
  if (opts.previews && opts.previews.length > 0) {
    try {
      const compactPreviews = await Promise.race([
        prepareKioskPreviews(opts.previews, 5),
        new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('preview_timeout')), 1500))
      ])
      formData.append('previews', JSON.stringify(compactPreviews))
    } catch {
      // Safe fallback: send lightweight previews (< 32KB) without huge uncompressed base64
      const safeCompact = opts.previews.slice(0, 5).map((p, idx) => ({
        pageNumber: p.pageNumber || idx + 1,
        url: p.url && (p.url.startsWith('data:image/svg') || p.url.length < 32000) ? p.url : '',
        title: p.title || `Page ${idx + 1}`,
      }))
      formData.append('previews', JSON.stringify(safeCompact))
    }
  }

  if (opts.files && opts.files.length > 0) {
    // Strip redundant bulky base64 data URLs from file metadata array (< 2KB total)
    const cleanFiles = opts.files.map(f => {
      const { previews, ...rest } = f as any
      return rest
    })
    formData.append('files', JSON.stringify(cleanFiles))
  }

  const clientClaimToken = getClientClaimSecret(sessionId)
  formData.append('clientClaimToken', clientClaimToken)

  try {
    const res = await fetch(`${apiBase}/api/kiosk-sessions/${encodeURIComponent(sessionId)}/upload`, {
      method: 'POST',
      headers: {
        'x-client-claim-token': clientClaimToken,
      },
      body: formData,
    })
    const data = await parseJsonResponse(res)
    if (res.status === 409 || data.code === 'MACHINE_ALREADY_IN_USE') {
      clearActiveKioskSession()
      return { success: false, machineInUse: true, error: 'Machine already in use' }
    }
    if (data && data.success) {
      return data
    }
    console.warn('[uploadDocumentToKiosk] Multipart upload returned non-success, attempting JSON next-phase fallback:', data?.error)
    return await advanceToNextPhase({
      targetState: 'CONFIRMING',
      fileName: opts.fileName,
      fileSize: opts.fileSize,
      fileType: opts.fileType,
      pageCount: opts.pageCount,
      previews: opts.previews,
      files: opts.files,
    })
  } catch (err: any) {
    console.warn('[uploadDocumentToKiosk] Network error during upload, falling back to JSON next-phase sync:', err)
    return await advanceToNextPhase({
      targetState: 'CONFIRMING',
      fileName: opts.fileName,
      fileSize: opts.fileSize,
      fileType: opts.fileType,
      pageCount: opts.pageCount,
      previews: opts.previews,
      files: opts.files,
    })
  }
}

/**
 * Explicitly advance session to next phase with metadata and previews.
 * Guaranteed to succeed even when binary file upload is delayed.
 */
export async function advanceToNextPhase(opts: {
  targetState?: KioskSessionPhase
  fileName?: string
  fileSize?: number
  fileType?: string
  pageCount?: number
  totalPages?: number
  previews?: Array<{ pageNumber: number; url: string; title?: string }>
  files?: any[]
  settings?: any
}): Promise<{ success: boolean; state?: string; nextStep?: string; error?: string }> {
  let { sessionId } = getActiveKioskSession()
  const apiBase = getApiBase()

  if (!sessionId) {
    const kioskId =
      kioskSession.getKioskId() ||
      (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null) ||
      (typeof window !== 'undefined' ? (sessionStorage.getItem('pb_kiosk_id') || localStorage.getItem('pb_kiosk_id')) : null) ||
      'PB-001'

    try {
      const activeRes = await fetch(`${apiBase}/api/kiosk-sessions/active/${encodeURIComponent(kioskId)}`)
      const activeData = await parseJsonResponse(activeRes)
      if (activeData.success && activeData.session?.sessionId) {
        sessionId = activeData.session.sessionId
        _activeSessionId = sessionId
        sessionStorage.setItem('pb_kiosk_session_id', sessionId)
      }
    } catch {}
  }

  if (!sessionId) {
    return { success: false, error: 'No active kiosk session' }
  }

  const clientClaimToken = getClientClaimSecret(sessionId)
  try {
    const res = await fetch(`${apiBase}/api/kiosk-sessions/${encodeURIComponent(sessionId)}/next-phase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-claim-token': clientClaimToken,
      },
      body: JSON.stringify({
        targetState: opts.targetState || 'CONFIRMING',
        fileName: opts.fileName,
        fileSize: opts.fileSize,
        fileType: opts.fileType,
        pageCount: opts.pageCount || opts.totalPages,
        totalPages: opts.totalPages || opts.pageCount,
        previews: opts.previews,
        files: opts.files,
        settings: opts.settings,
        clientClaimToken,
      }),
    })
    return await parseJsonResponse(res)
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Fetch live status of the connected kiosk session
 */
export async function fetchKioskSessionStatus(): Promise<{
  success: boolean
  machineInUse?: boolean
  state?: string
  phase?: string
  phaseStep?: number
  isExpired?: boolean
  document?: any
  settings?: any
  otp?: string
  orderId?: string
}> {
  const { sessionId } = getActiveKioskSession()
  if (!sessionId) return { success: false }

  const apiBase = getApiBase()
  try {
    const res = await fetch(`${apiBase}/api/kiosk-sessions/${encodeURIComponent(sessionId)}/status`)
    if (res.status === 410) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('pb:session-expired', {
            detail: { isExpired: true, message: 'Session expired due to 1 minute of inactivity.' },
          })
        )
      }
      return { success: false, isExpired: true }
    }
    if (!res.ok) return { success: false }
    const data = await parseJsonResponse(res)
    if (data.isExpired) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pb:session-expired', { detail: data }))
      }
    }
    return data
  } catch {
    return { success: false }
  }
}

/**
 * Cancel the active kiosk session (used when user chooses to cancel or upload a new file)
 */
export async function cancelKioskSession(): Promise<{ success: boolean; error?: string }> {
  let { sessionId } = getActiveKioskSession()
  const apiBase = getApiBase()

  if (!sessionId) {
    const kioskId =
      kioskSession.getKioskId() ||
      (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null) ||
      (typeof window !== 'undefined' ? (sessionStorage.getItem('pb_kiosk_id') || localStorage.getItem('pb_kiosk_id')) : null) ||
      'PB-001'

    try {
      const activeRes = await fetch(`${apiBase}/api/kiosk-sessions/active/${encodeURIComponent(kioskId)}`)
      const activeData = await parseJsonResponse(activeRes)
      if (activeData.success && activeData.session?.sessionId) {
        sessionId = activeData.session.sessionId
      }
    } catch {}
  }

  if (!sessionId) {
    clearActiveKioskSession()
    return { success: false, error: 'No active session found' }
  }

  const clientClaimToken = getClientClaimSecret(sessionId)

  try {
    const res = await fetch(`${apiBase}/api/kiosk-sessions/${encodeURIComponent(sessionId)}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-claim-token': clientClaimToken,
      },
      body: JSON.stringify({ clientClaimToken }),
    })
    const data = await parseJsonResponse(res)
    clearActiveKioskSession()
    return data
  } catch (err: any) {
    clearActiveKioskSession()
    return { success: false, error: err.message }
  }
}

/**
 * Notify that the user has gone back or exited the connected session from their phone.
 * Sends a lightweight keepalive beacon to initiate a 5-second countdown on the kiosk screen.
 */
export function notifyPhoneBackOrExit(): void {
  let { sessionId } = getActiveKioskSession()
  if (!sessionId) {
    sessionId = sessionStorage.getItem('pb_kiosk_session_id') || localStorage.getItem('pb_kiosk_session_id')
  }
  if (!sessionId) {
    const urlToken = getSessionTokenFromUrl()
    if (urlToken) {
      sessionId = decodeTokenSessionId(urlToken)
    }
  }

  const kioskId =
    sessionStorage.getItem('pb_kiosk_id_from_session') ||
    sessionStorage.getItem('pb_kiosk_id') ||
    (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null) ||
    'PB-001'

  const clientClaimToken = sessionId ? getClientClaimSecret(sessionId) : 'client_claim_beacon'
  const apiBase = getApiBase()
  const payload = JSON.stringify({ clientClaimToken, reason: 'phone_back_or_exit', kioskId })

  console.log(`[kioskSession] 📱 Phone went back/leaving session ${sessionId || kioskId} — notifying kiosk (5s grace window)`)

  const urls: string[] = []
  if (sessionId) {
    urls.push(`${apiBase}/api/kiosk-sessions/${encodeURIComponent(sessionId)}/phone-disconnect`)
  }
  if (kioskId) {
    urls.push(`${apiBase}/api/kiosk-sessions/kiosk/${encodeURIComponent(kioskId)}/phone-disconnect`)
  }

  for (const url of urls) {
    try {
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-claim-token': clientClaimToken,
        },
        body: payload,
        keepalive: true,
        mode: 'cors',
      }).catch(() => {})
    } catch {}

    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        // Plain text avoids CORS preflight failures on page unload
        const blob = new Blob([payload], { type: 'text/plain' })
        navigator.sendBeacon(url, blob)
      }
    } catch {}
  }
}

/**
 * Notify that phone has resumed/reconnected, immediately clearing any 5-second countdown.
 */
export function notifyPhoneReconnect(): void {
  recordPhoneActivity()
}
