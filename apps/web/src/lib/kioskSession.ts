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
  if (base.includes('localhost:5200')) {
    return 'http://localhost:5000'
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
}

let _activeSessionId: string | null = null
let _activeToken: string | null = null
let _claimed = false

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
  } catch {}
  _activeSessionId = null
  _activeToken = null
  _claimed = false
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

    const savedId = sessionStorage.getItem('pb_kiosk_session_id')
    const savedToken = sessionStorage.getItem('pb_kiosk_session_token')
    if (savedId && savedToken) {
      _activeSessionId = savedId
      _activeToken = savedToken
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
  machineInUse?: boolean
  sessionId?: string
  kioskId?: string
  error?: string
  message?: string
}> {
  const decodedId = decodeTokenSessionId(token)
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
        kioskId: data.kioskId || (decodedId ? decodeTokenPayload(token)?.kioskId : undefined),
        error: 'MACHINE_ALREADY_IN_USE',
        message: data.message || 'Machine already in use',
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
      sessionStorage.setItem('pb_kiosk_session_token', token)
      sessionStorage.setItem('pb_kiosk_id_from_session', data.kioskId || '')
      return { ...data, machineInUse: false }
    }

    clearActiveKioskSession()
    return {
      success: false,
      machineInUse: false,
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
}

/**
 * Get the currently active session (from state, session storage, or URL)
 */
export function getActiveKioskSession(): { sessionId: string | null; token: string | null; claimed: boolean } {
  if (_activeSessionId) return { sessionId: _activeSessionId, token: _activeToken, claimed: _claimed }

  initSessionFromEnvironment()

  if (_activeSessionId) return { sessionId: _activeSessionId, token: _activeToken, claimed: _claimed }

  return { sessionId: null, token: null, claimed: false }
}

/**
 * Report current progress to the kiosk display.
 * Fire-and-forget — doesn't block the UI.
 */
export function reportKioskProgress(payload: SessionProgressPayload): void {
  _lastPhoneActivityTimestamp = Date.now()
  _lastActivityReportedAt = Date.now()

  const { sessionId } = getActiveKioskSession()
  if (!sessionId) return

  const clientClaimToken = getClientClaimSecret(sessionId)
  const apiBase = getApiBase()
  fetch(`${apiBase}/api/kiosk-sessions/${sessionId}/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-claim-token': clientClaimToken,
    },
    body: JSON.stringify({ ...payload, clientClaimToken }),
  }).catch(() => {
    // Silently ignore — kiosk display is best-effort
  })
}

/**
 * Convenience helpers for each print flow step
 */
export const kioskSession = {
  reportUploading(fileName?: string) {
    reportKioskProgress({
      state: 'UPLOADING',
      phase: 'Uploading your document…',
      phaseStep: 1,
      ...(fileName ? { fileName } : {}),
    })
  },

  reportConfirming(opts?: {
    fileName?: string
    totalPages?: number
  }) {
    reportKioskProgress({
      state: 'CONFIRMING',
      phase: 'Reviewing document on mobile…',
      phaseStep: 2,
      ...(opts?.fileName ? { fileName: opts.fileName } : {}),
      ...(opts?.totalPages ? { totalPages: opts.totalPages } : {}),
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
  }) {
    reportKioskProgress({
      state: 'CONFIGURING',
      phase: 'Configuring print settings on mobile…',
      phaseStep: 2,
      ...(opts?.fileName ? { fileName: opts.fileName } : {}),
      ...(opts?.totalPages ? { totalPages: opts.totalPages } : {}),
      ...(opts?.copies ? { copies: opts.copies } : {}),
      ...(opts?.colourMode ? { colourMode: opts.colourMode } : {}),
      ...(opts?.amount ? { amount: opts.amount } : {}),
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
    amount?: number
    orderId?: string
  }) {
    reportKioskProgress({
      state: 'REVIEWING',
      phase: 'Reviewing order on mobile…',
      phaseStep: 3,
      ...(opts?.fileName ? { fileName: opts.fileName } : {}),
      ...(opts?.totalPages ? { totalPages: opts.totalPages } : {}),
      ...(opts?.copies ? { copies: opts.copies } : {}),
      ...(opts?.colourMode ? { colourMode: opts.colourMode } : {}),
      ...(opts?.amount ? { amount: opts.amount } : {}),
      ...(opts?.orderId ? { orderId: opts.orderId } : {}),
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
  }) {
    reportKioskProgress({
      state: 'PAYING',
      phase: 'Scan UPI QR on kiosk display to pay',
      phaseStep: 4,
      ...(opts?.fileName ? { fileName: opts.fileName } : {}),
      ...(opts?.totalPages ? { totalPages: opts.totalPages } : {}),
      ...(opts?.amount ? { amount: opts.amount } : {}),
      ...(opts?.orderId ? { orderId: opts.orderId } : {}),
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

  reportPrinting(orderId?: string) {
    reportKioskProgress({
      state: 'PRINTING',
      phase: 'Printing your document…',
      phaseStep: 6,
      ...(orderId ? { orderId } : {}),
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

  /** Check if user opened the web app via a kiosk QR session */
  isKioskSession(): boolean {
    return Boolean(getSessionTokenFromUrl() || sessionStorage.getItem('pb_kiosk_session_id'))
  },

  /** Get the kiosk ID associated with this session */
  getKioskId(): string | null {
    return sessionStorage.getItem('pb_kiosk_id_from_session')
  },

  /** Upload document to the connected kiosk station */
  uploadDocument: uploadDocumentToKiosk,

  /** Cancel the connected kiosk session */
  cancel: cancelKioskSession,

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
}): Promise<{ success: boolean; error?: string; session?: any; machineInUse?: boolean }> {
  let { sessionId } = getActiveKioskSession()
  const apiBase = getApiBase()

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

  // Only attach raw file blob if small (<2MB); large files are transferred directly to print engine upon payment
  if (opts.file && opts.file.size < 2 * 1024 * 1024) {
    formData.append('file', opts.file, opts.fileName)
  }
  formData.append('fileName', opts.fileName)
  formData.append('fileSize', String(opts.fileSize))
  formData.append('fileType', opts.fileType)
  formData.append('pageCount', String(opts.pageCount))
  if (opts.previews && opts.previews.length > 0) {
    const compactPreviews = await prepareKioskPreviews(opts.previews, 5)
    formData.append('previews', JSON.stringify(compactPreviews))
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
    return data
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
    if (!res.ok) return { success: false }
    return await parseJsonResponse(res)
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
