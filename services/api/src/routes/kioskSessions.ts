/**
 * PrintBooth — Kiosk QR Session API
 *
 * Manages encrypted single-use QR upload sessions.
 * Each kiosk generates one active session at a time.
 * Only the user who scans the QR can upload.
 * After completion, a new session token is issued automatically.
 *
 * State machine:
 *   IDLE → QR_READY → CLAIMED → UPLOADING → CONFIGURING → PAYING → OTP_READY → PRINTING → DONE → QR_READY
 */

import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { cacheGet, cacheSet } from '../redis.js'
import { dispatchPrintJob, syncJobState, type PrintJobState } from './print.js'
import { Order } from '../models/Order.js'
import { Kiosk } from '../models/Kiosk.js'
import { Merchant } from '../models/Merchant.js'
import { Payment } from '../models/Payment.js'
import { fallbackKiosks, fallbackMerchants } from '../fallbackData.js'
import { isDbConnected } from '../db.js'
import {
  createUpiExpressOrder,
  generateUniqueClientTxnId,
  resolveUpiKeyForKiosk,
  resolveMerchantUpiIdForKiosk,
} from './upiexpress.js'
import { relayToKiosk, relayPaymentCaptured } from '../modules/wsRelay.js'
import { markKioskOffline } from '../modules/kioskLiveness.js'
import { kioskSessionClaimLimiter, kioskSessionCreateLimiter } from '../middleware/rateLimiter.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const kioskSessionsRouter = Router()

const KIOSK_UPLOADS_DIR = path.resolve(__dirname, '../../uploads/kiosk_sessions')
if (!fs.existsSync(KIOSK_UPLOADS_DIR)) {
  fs.mkdirSync(KIOSK_UPLOADS_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, KIOSK_UPLOADS_DIR)
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${unique}_${safeName}`)
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    fieldSize: 25 * 1024 * 1024,
  },
})

export interface KioskDocumentPreview {
  pageNumber: number
  url: string
  title?: string
}

export interface KioskDocumentItem {
  id?: string
  fileName: string
  fileSize?: number
  fileType?: string
  pageCount?: number
  copies?: number
  colour?: string
  duplex?: string
  pages?: string
  pageRange?: string
  selectedPages?: number[]
  paperSize?: string
  scaling?: string
  pagesPerSheet?: number
  dpi?: string
  orientation?: string
  pageColours?: Record<number, string>
  pageCopies?: Record<number, number>
  settings?: any
  filePath?: string
  fileUrl?: string
  previews?: KioskDocumentPreview[]
}

export interface KioskDocumentData {
  fileName: string
  fileSize: number
  fileType: string
  pageCount: number
  filePath?: string
  fileUrl?: string
  pages?: KioskDocumentPreview[]
  pageRange?: string
  selectedPages?: number[]
  uploadedAt: number
  files?: KioskDocumentItem[]
}

export interface KioskPrintSettingsData {
  colour: 'BW' | 'COLOUR'
  duplex: 'SINGLE' | 'DOUBLE'
  copies: number
  pageRange: string
  pages?: string
  selectedPages?: number[]
  paperSize: string
  pricePerPage: number
  totalAmount: number
  settingsMode?: 'GLOBAL' | 'PER_PAGE'
  nUpLayout?: 1 | 2 | 4
  duplexBinding?: 'LONG_EDGE' | 'SHORT_EDGE'
  printDpi?: '600' | '1200'
  paperWeight?: '75GSM' | '100GSM'
  scaling?: string
  orientation?: string
  dpi?: string
  margins?: string
  contrastMode?: string
  pageBorder?: boolean
  pageColours?: Record<number, string>
  pageCopies?: Record<number, number>
  pageCustomizations?: Record<number, {
    colour: 'BW' | 'COLOUR'
    skipped: boolean
    orientation?: 'PORTRAIT' | 'LANDSCAPE'
  }>
}

// ── In-memory session store (backed by Redis for multi-process safety) ────────
export interface KioskSession {
  sessionId: string
  kioskId: string
  kioskVariant?: 'pro' | 'lite'
  token: string          // base64url-encoded signed payload
  state: KioskSessionState
  createdAt: number
  expiresAt: number
  claimedAt?: number
  claimedIp?: string
  phase?: string         // Human-readable phase label shown on kiosk display
  phaseStep?: number     // 0-6 numeric step
  otp?: string           // 4-digit OTP sent to user; displayed large on kiosk
  releasePin?: string
  pickupCode?: string
  orderId?: string
  orderNumber?: string
  fileName?: string
  totalPages?: number
  copies?: number
  colourMode?: string
  amount?: number
  completedAt?: number
  document?: KioskDocumentData
  files?: KioskDocumentItem[]
  settings?: KioskPrintSettingsData
  claimSecret?: string   // Client claim secret ensuring only original scanner can resume
  lastPhoneActivityAt?: number // Timestamp of last touch/interaction strictly on user's phone
  lastActivityAt?: number      // Timestamp of any user activity (phone or kiosk)
  currentSectionEnteredAt?: number // Timestamp when current section was entered
  expiredReason?: string       // Reason why session expired (e.g. 'INACTIVITY_TIMEOUT')
  phoneDisconnected?: boolean  // True when user pressed back or left the connected session on their phone
  phoneDisconnectedAt?: number // Timestamp when user went back / disconnected
  phoneDisconnectGraceMs?: number // 5000ms grace period before resetting kiosk back
  // Progress data relayed from web app
  progressData?: Record<string, any>
  upiQrValue?: string
  paymentUrl?: string
  upiIntentUrl?: string
  isBackwardNav?: boolean
  merchantUpiId?: string
  gateway?: string
  paymentError?: string
  merchantError?: string
  merchantRecommendation?: string
  qrAmount?: number
  paymentEpoch?: number
  isSyncing?: boolean
  syncMessage?: string
}

export type KioskSessionState =
  | 'QR_READY'
  | 'CLAIMED'
  | 'UPLOADING'
  | 'CONFIRMING'
  | 'CONFIGURING'
  | 'REVIEWING'
  | 'PAYING'
  | 'OTP_READY'
  | 'PRINTING'
  | 'DONE'
  | 'CANCELLED'
  | 'EXPIRED'

const SESSION_TTL_SECONDS = 24 * 60 * 60  // Fixed QR code on screen while in QR_READY: valid until customer scans it
const SESSION_DONE_TTL_SECONDS = 30  // Keep DONE state visible briefly
const HMAC_SECRET = process.env.KIOSK_SESSION_SECRET || 'pb_kiosk_session_hmac_secret_2024'
const SECTION_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes inactivity timeout per section

// Per-kiosk active session index: kioskId → sessionId
const activeSessionByKiosk = new Map<string, string>()
// Session data store
const sessions = new Map<string, KioskSession>()

// ── Crypto helpers ─────────────────────────────────────────────────────────────

function signPayload(payload: Record<string, any>): string {
  const data = JSON.stringify(payload)
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(data).digest('hex')
  const full = { ...payload, sig }
  return Buffer.from(JSON.stringify(full)).toString('base64url')
}

function verifyToken(token: string): { valid: boolean; payload?: Record<string, any>; error?: string } {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8')
    const full = JSON.parse(raw)
    const { sig, ...payload } = full
    const expected = crypto.createHmac('sha256', HMAC_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return { valid: false, error: 'Invalid signature' }
    }
    if (Date.now() > payload.exp) {
      return { valid: false, error: 'Session expired' }
    }
    return { valid: true, payload }
  } catch (e: any) {
    return { valid: false, error: `Malformed token: ${e.message}` }
  }
}

function getKioskVariantSync(kioskId: string): 'pro' | 'lite' {
  const fb = fallbackKiosks.find((k: any) => (k.kioskId || k.id) === kioskId)
  if (fb && fb.kioskVariant) return fb.kioskVariant === 'lite' ? 'lite' : 'pro'
  return 'pro'
}

function generateSession(kioskId: string, webBaseUrl: string): KioskSession {
  const sessionId = `sess_${kioskId}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
  const now = Date.now()
  const exp = now + SESSION_TTL_SECONDS * 1000

  const payload = {
    sessionId,
    kioskId,
    nonce: crypto.randomBytes(8).toString('hex'),
    exp,
    iat: now,
  }

  const token = signPayload(payload)

  // The QR encodes the full web URL with the session embedded
  const cleanBase = 'https://printbooth.co.in'
  const qrUrl = `${cleanBase}/print?id=${encodeURIComponent(kioskId)}&session=${encodeURIComponent(token)}`
  const kioskVariant = getKioskVariantSync(kioskId)

  const session: KioskSession = {
    sessionId,
    kioskId,
    kioskVariant,
    token,
    state: 'QR_READY',
    createdAt: now,
    expiresAt: exp,
    lastPhoneActivityAt: now,
    lastActivityAt: now,
    currentSectionEnteredAt: now,
    phase: 'Waiting for user to scan QR',
    phaseStep: 0,
    progressData: { qrUrl },
  }

  // Asynchronously refresh variant from DB if available
  if (isDbConnected()) {
    Kiosk.findOne({ kioskId }).select('kioskVariant').lean().then((doc: any) => {
      if (doc && doc.kioskVariant) {
        session.kioskVariant = doc.kioskVariant === 'lite' ? 'lite' : 'pro'
        saveSession(session)
      }
    }).catch(() => {})
  }

  sessions.set(sessionId, session)
  activeSessionByKiosk.set(kioskId, sessionId)

  // Persist to Redis for multi-process
  cacheSet(`ks:${sessionId}`, session, SESSION_TTL_SECONDS + 60).catch(() => {})
  cacheSet(`ks:active:${kioskId}`, sessionId, SESSION_TTL_SECONDS + 60).catch(() => {})

  console.log(`[KioskSession] ✦ Created ${sessionId} for kiosk ${kioskId} | expires at ${new Date(exp).toLocaleTimeString('en-IN')}`)
  return session
}

function getSession(sessionId: string): KioskSession | null {
  if (!sessionId) return null
  let s = sessions.get(sessionId)
  if (s) return s

  // 1. Check if token was provided instead of sessionId
  if (sessionId.includes('.') || sessionId.length > 50) {
    try {
      const { valid, payload } = verifyToken(sessionId)
      if (valid && payload?.sessionId) {
        s = sessions.get(payload.sessionId)
        if (s) return s
      }
    } catch {}
  }

  // 2. Check if kioskId was provided (e.g. PB-001)
  const activeId = activeSessionByKiosk.get(sessionId.toUpperCase())
  if (activeId) {
    s = sessions.get(activeId)
    if (s) return s
  }

  return null
}

function saveSession(session: KioskSession) {
  sessions.set(session.sessionId, session)
  const ttl = session.state === 'DONE' ? SESSION_DONE_TTL_SECONDS : SESSION_TTL_SECONDS
  cacheSet(`ks:${session.sessionId}`, session, ttl + 60).catch(() => {})
}

export function getActiveSession(kioskId: string): KioskSession | null {
  const id = activeSessionByKiosk.get(kioskId)
  if (!id) return null
  const s = getSession(id)
  if (!s) return null
  // Check if expired (all non-DONE states strictly expire after expiresAt)
  if (s.state !== 'DONE' && Date.now() > s.expiresAt) {
    return null
  }
  return s
}

// Helper to resolve the effective page range from multiple candidates,
// prioritizing specific page selections over generic defaults like 'ALL', '*', or empty strings.
export function resolveEffectivePageRange(...candidates: any[]): string {
  for (const candidate of candidates) {
    if (!candidate) continue
    if (Array.isArray(candidate)) {
      const valid = candidate.map(Number).filter(n => !isNaN(n) && n > 0).sort((a, b) => a - b)
      if (valid.length > 0) return valid.join(',')
      continue
    }
    const str = String(candidate).trim()
    if (!str || str.toUpperCase() === 'ALL' || str === '*') continue
    if (str.startsWith('[') && str.endsWith(']')) {
      try {
        const arr = JSON.parse(str)
        if (Array.isArray(arr)) {
          const valid = arr.map(Number).filter(n => !isNaN(n) && n > 0).sort((a, b) => a - b)
          if (valid.length > 0) return valid.join(',')
        }
      } catch {}
    }
    return str
  }
  return 'ALL'
}

// Helper to normalize page ranges (strings, numbers, arrays, or JSON strings) into standard comma-delimited ranges e.g. "1,2,3"
export function formatPageRange(candidate: any): string {
  return resolveEffectivePageRange(candidate)
}

// Resolve web base URL from request or env (canonical: https://printbooth.co.in)
function resolveWebBaseUrl(_req: Request): string {
  return 'https://printbooth.co.in'
}

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/kiosk-sessions/create
 * Called by kiosk UI to generate a new encrypted QR session.
 * Creates a fresh session; invalidates any previous session for this kiosk.
 */
kioskSessionsRouter.post('/create', kioskSessionCreateLimiter, (req: Request, res: Response) => {
  const kioskId = String(
    req.body?.kioskId || req.headers['x-kiosk-id'] || 'PB-001'
  ).toUpperCase().trim()

  const webBase = 'https://printbooth.co.in'
  const force = Boolean(req.body?.force)

  // If an active session is currently underway (e.g. uploading, reviewing, configuring, paying),
  // preserve it unless explicitly forced to rotate
  const prevId = activeSessionByKiosk.get(kioskId)
  if (prevId && !force) {
    const prev = sessions.get(prevId)
    if (prev && prev.state !== 'DONE' && Date.now() < prev.expiresAt) {
      // Sanitize stale qrUrl: ensure it uses https://printbooth.co.in
      const prevQrUrl = prev.progressData?.qrUrl || ''
      if (!prevQrUrl.startsWith('https://printbooth.co.in') && prev.token) {
        const freshQrUrl = `https://printbooth.co.in/print?id=${encodeURIComponent(kioskId)}&session=${encodeURIComponent(prev.token)}`
        if (prev.progressData) prev.progressData.qrUrl = freshQrUrl
        saveSession(prev)
        console.log(`[KioskSession] Refreshed stale qrUrl for session ${prev.sessionId}: ${freshQrUrl}`)
      }
      return res.json({
        success: true,
        sessionId: prev.sessionId,
        token: prev.token,
        qrUrl: prev.progressData?.qrUrl,
        expiresAt: prev.expiresAt,
        state: prev.state,
        session: prev,
      })
    }
  }

  // Invalidate any prior active session for this kiosk
  if (prevId) {
    const prev = sessions.get(prevId)
    if (prev && prev.state !== 'DONE') {
      prev.state = 'DONE'
      prev.completedAt = Date.now()
      saveSession(prev)
    }
  }

  const session = generateSession(kioskId, webBase)

  res.json({
    success: true,
    sessionId: session.sessionId,
    kioskVariant: session.kioskVariant,
    token: session.token,
    qrUrl: session.progressData?.qrUrl,
    expiresAt: session.expiresAt,
    state: session.state,
    session,
  })
})

/**
 * GET /api/kiosk-sessions/active/:kioskId
 * Kiosk polls this to get current session state + any progress data.
 * This is the primary endpoint the kiosk display polls every 1-2 seconds.
 */
kioskSessionsRouter.get('/active/:kioskId', async (req: Request, res: Response) => {
  const kioskId = req.params.kioskId.toUpperCase()

  let session = getActiveSession(kioskId)

  // Try Redis fallback if not in memory
  if (!session) {
    try {
      const cachedId = await cacheGet<string>(`ks:active:${kioskId}`)
      if (cachedId) {
        const cachedSession = await cacheGet<KioskSession>(`ks:${cachedId}`)
        if (cachedSession) {
          sessions.set(cachedSession.sessionId, cachedSession)
          activeSessionByKiosk.set(kioskId, cachedSession.sessionId)
          session = cachedSession
        }
      }
    } catch {}
  }

  if (!session) {
    return res.json({ success: true, session: null, hasActiveSession: false })
  }

  const webBase = resolveWebBaseUrl(req)

  if (session.state === 'CANCELLED') {
    const freshSession = generateSession(kioskId, webBase)
    return res.json({
      success: true,
      hasActiveSession: true,
      isExpired: false,
      isPhoneInactive: false,
      isPhoneDisconnectedExpired: true,
      phoneDisconnected: false,
      phoneGraceRemainingSec: 0,
      session: {
        sessionId: freshSession.sessionId,
        kioskId: freshSession.kioskId,
        kioskVariant: freshSession.kioskVariant || getKioskVariantSync(freshSession.kioskId),
        token: freshSession.token,
        qrUrl: freshSession.progressData?.qrUrl,
        state: freshSession.state,
        phase: freshSession.phase,
        phaseStep: freshSession.phaseStep,
        createdAt: freshSession.createdAt,
        expiresAt: freshSession.expiresAt,
        lastPhoneActivityAt: freshSession.lastPhoneActivityAt,
        files: [],
      },
    })
  }

  const isPrePrintState = session.state !== 'QR_READY' &&
                          session.state !== 'PRINTING' &&
                          session.state !== 'DONE'

  // Check phone disconnect timeout (when user went back from their phone):
  if (isPrePrintState && session.phoneDisconnected && session.phoneDisconnectedAt) {
    // If a document has already been uploaded or user is in active flow, NEVER disconnect or reset!
    if (session.document || (session.files && session.files.length > 0) || session.state === 'CONFIRMING' || session.state === 'CONFIGURING' || session.state === 'REVIEWING' || session.state === 'PAYING') {
      session.phoneDisconnected = false
      session.phoneDisconnectedAt = undefined
      saveSession(session)
    } else {
      const elapsed = Date.now() - session.phoneDisconnectedAt
      const graceMs = session.phoneDisconnectGraceMs || 180000 // 3 minutes grace for customer to browse and select files on device
      if (elapsed >= graceMs) {
        console.log(`[KioskSession] ⏱️ Phone disconnect grace expired for ${session.sessionId} on ${kioskId}. Refreshing kiosk session back to QR_READY.`)
        session.state = 'CANCELLED'
        session.completedAt = Date.now()
        session.document = undefined
        saveSession(session)

        const freshSession = generateSession(kioskId, webBase)
        return res.json({
          success: true,
          hasActiveSession: true,
          isExpired: false,
          isPhoneInactive: false,
          isPhoneDisconnectedExpired: true,
          phoneDisconnected: false,
          phoneGraceRemainingSec: 0,
          session: {
            sessionId: freshSession.sessionId,
            kioskId: freshSession.kioskId,
            kioskVariant: freshSession.kioskVariant || getKioskVariantSync(freshSession.kioskId),
            token: freshSession.token,
            qrUrl: freshSession.progressData?.qrUrl,
            state: freshSession.state,
            phase: freshSession.phase,
            phaseStep: freshSession.phaseStep,
            createdAt: freshSession.createdAt,
            expiresAt: freshSession.expiresAt,
            lastPhoneActivityAt: freshSession.lastPhoneActivityAt,
            files: [],
          },
        })
      }
    }
  }

  // Check section inactivity timeout:
  // Auto reset the session if there is no response/activity on user's phone for 1 minute (60 seconds) in each section.
  const lastPhoneActivity = Math.max(
    session.lastPhoneActivityAt || 0,
    session.currentSectionEnteredAt || 0,
    session.claimedAt || 0,
    session.createdAt || 0
  )
  const elapsedPhoneInactivity = Date.now() - lastPhoneActivity
  const remainingInactivityMs = Math.max(0, SECTION_INACTIVITY_TIMEOUT_MS - elapsedPhoneInactivity)
  const inactivityRemainingSec = Math.ceil(remainingInactivityMs / 1000)
  const resetAt = lastPhoneActivity + SECTION_INACTIVITY_TIMEOUT_MS
  const isInactiveTimeout = isPrePrintState && Boolean(lastPhoneActivity) && (elapsedPhoneInactivity >= SECTION_INACTIVITY_TIMEOUT_MS)

  if (isInactiveTimeout) {
    console.log(`[KioskSession] ⏱️ 1-minute phone inactivity timeout reached for ${session.sessionId} in section ${session.state} on ${kioskId}. Marking previous session as EXPIRED and refreshing kiosk.`)
    session.state = 'EXPIRED'
    session.expiredReason = 'INACTIVITY_TIMEOUT'
    session.completedAt = Date.now()
    saveSession(session)
    activeSessionByKiosk.delete(kioskId)

    const webBase = resolveWebBaseUrl(req)
    const freshSession = generateSession(kioskId, webBase)
    return res.json({
      success: true,
      hasActiveSession: true,
      isExpired: true,
      isPhoneInactive: true,
      isInactiveTimeout: true,
      inactivityRemainingSec: 0,
      resetAt,
      isInactiveWarning: false,
      session: {
        sessionId: freshSession.sessionId,
        kioskId: freshSession.kioskId,
        kioskVariant: freshSession.kioskVariant || getKioskVariantSync(freshSession.kioskId),
        token: freshSession.token,
        qrUrl: freshSession.progressData?.qrUrl,
        state: freshSession.state,
        phase: freshSession.phase,
        phaseStep: freshSession.phaseStep,
        createdAt: freshSession.createdAt,
        expiresAt: freshSession.expiresAt,
        lastPhoneActivityAt: freshSession.lastPhoneActivityAt,
        lastActivityAt: freshSession.lastActivityAt,
        inactivityRemainingSec: 60,
        resetAt: freshSession.createdAt + SECTION_INACTIVITY_TIMEOUT_MS,
        isInactiveWarning: false,
      },
    })
  }

  // Check for expiry (QR_READY sessions are fixed and do not auto-rotate)
  const isExpired = session.state === 'EXPIRED' || (session.state !== 'QR_READY' && session.state !== 'DONE' && Date.now() > session.expiresAt)

  const phoneGraceRemainingSec = isPrePrintState && session.phoneDisconnected && session.phoneDisconnectedAt
    ? Math.max(1, Math.ceil(((session.phoneDisconnectGraceMs || 5000) - (Date.now() - session.phoneDisconnectedAt)) / 1000))
    : 0

  const isInactiveWarning = isPrePrintState && inactivityRemainingSec <= 15 && inactivityRemainingSec > 0

  res.json({
    success: true,
    hasActiveSession: true,
    isExpired,
    isPhoneInactive: false,
    inactivityRemainingSec: isPrePrintState ? inactivityRemainingSec : 60,
    resetAt: isPrePrintState ? resetAt : Date.now() + SECTION_INACTIVITY_TIMEOUT_MS,
    isInactiveWarning,
    phoneDisconnected: isPrePrintState && Boolean(session.phoneDisconnected),
    phoneGraceRemainingSec,
    session: {
      sessionId: session.sessionId,
      kioskId: session.kioskId,
      kioskVariant: session.kioskVariant || getKioskVariantSync(session.kioskId),
      token: session.state === 'QR_READY' ? session.token : undefined,
      qrUrl: session.state === 'QR_READY' ? session.progressData?.qrUrl : undefined,
      state: session.state,
      phase: session.phase,
      phaseStep: session.phaseStep,
      otp: session.otp,
      orderId: session.orderId,
      fileName: session.fileName,
      totalPages: session.totalPages,
      copies: session.copies,
      colourMode: session.colourMode,
      amount: session.amount,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      claimedAt: session.claimedAt,
      lastPhoneActivityAt: session.lastPhoneActivityAt,
      currentSectionEnteredAt: session.currentSectionEnteredAt,
      inactivityRemainingSec: isPrePrintState ? inactivityRemainingSec : 60,
      resetAt: isPrePrintState ? resetAt : Date.now() + SECTION_INACTIVITY_TIMEOUT_MS,
      isInactiveWarning,
      phoneDisconnected: isPrePrintState && Boolean(session.phoneDisconnected),
      phoneGraceRemainingSec,
      completedAt: session.completedAt,
      document: session.document,
      files: session.files || session.document?.files || [],
      settings: session.settings,
      progressData: session.progressData,
      upiQrValue: session.upiQrValue,
      paymentUrl: session.paymentUrl,
      upiIntentUrl: session.upiIntentUrl,
      merchantUpiId: session.merchantUpiId,
      gateway: session.gateway,
      qrAmount: session.qrAmount,
      paymentError: session.paymentError,
      merchantError: session.merchantError,
      merchantRecommendation: session.merchantRecommendation,
      isSyncing: session.isSyncing,
      syncMessage: session.syncMessage,
    },
  })
})

/**
 * POST /api/kiosk-sessions/:token/claim
 * Called by the web app when user scans the QR.
 * First caller wins — subsequent callers get "session taken".
 */
kioskSessionsRouter.post('/:token/claim', kioskSessionClaimLimiter, (req: Request, res: Response) => {
  const { token } = req.params
  const clientClaimToken = String(
    req.body?.clientClaimToken || req.headers['x-client-claim-token'] || ''
  ).trim()

  const { valid, payload, error } = verifyToken(token)
  const targetKioskId = String(payload?.kioskId || req.body?.kioskId || 'PB-001').toUpperCase().trim()

  // 1. Strict security: Invalid or expired signatures must NEVER auto-generate fresh sessions
  if (!valid || !payload) {
    const isExpired = error?.toLowerCase().includes('expired')
    console.warn(`[KioskSession] 🔒 Rejected invalid/expired token claim for ${targetKioskId}: ${error}`)
    return res.status(isExpired ? 410 : 400).json({
      success: false,
      isExpired: Boolean(isExpired),
      error: isExpired ? 'SESSION_EXPIRED' : 'INVALID_TOKEN',
      message: isExpired
        ? 'This QR code has expired. Please scan the current live QR code on the kiosk screen.'
        : 'Invalid or forged QR code token. Please scan the official QR code on the kiosk screen.',
      kioskId: targetKioskId,
    })
  }

  const { sessionId, kioskId } = payload
  const currentActiveId = activeSessionByKiosk.get(kioskId)

  // 2. If requested token is not for currentActiveId:
  if (currentActiveId && currentActiveId !== sessionId) {
    const activeSess = sessions.get(currentActiveId)
    // If the active session is currently claimed or in progress by another customer:
    if (activeSess && activeSess.state !== 'QR_READY' && activeSess.state !== 'DONE' && activeSess.state !== 'CANCELLED' && Date.now() < activeSess.expiresAt) {
      console.log(`[KioskSession] ⚠️ Kiosk ${kioskId} is active with session ${currentActiveId} in state ${activeSess.state}. Rejecting claim for ${sessionId}.`)
      return res.status(409).json({
        success: false,
        machineInUse: true,
        error: 'MACHINE_ALREADY_IN_USE',
        code: 'MACHINE_ALREADY_IN_USE',
        message: 'This printer is currently in use by another customer. Please wait until they are finished.',
        kioskId,
        state: activeSess.state,
      })
    }

    return res.status(410).json({
      success: false,
      isExpired: true,
      error: 'SESSION_EXPIRED',
      message: 'This QR code has expired. Please scan the current live QR code on the kiosk screen.',
      kioskId,
    })
  }

  let session = getSession(sessionId)

  // If session is expired or completed, return 410
  if (!session || session.state === 'DONE' || session.state === 'CANCELLED' || Date.now() > session.expiresAt) {
    return res.status(410).json({
      success: false,
      isExpired: true,
      error: 'SESSION_EXPIRED',
      message: 'This session has expired. Please scan the current live QR code on the kiosk screen.',
      kioskId,
    })
  }

  // 3. One customer at a time: If session is already claimed, only the owner with matching claimSecret can access
  const isAlreadyClaimed = (session.state !== 'QR_READY' && Boolean(session.claimedAt))
  const isOwner = Boolean(session.claimSecret && clientClaimToken && session.claimSecret === clientClaimToken)

  if (isAlreadyClaimed && !isOwner) {
    console.log(`[KioskSession] ⚠️ Session ${sessionId} on ${kioskId} is already claimed by another user. State: ${session.state}`)
    return res.status(409).json({
      success: false,
      machineInUse: true,
      error: 'MACHINE_ALREADY_IN_USE',
      code: 'MACHINE_ALREADY_IN_USE',
      message: 'This printer is currently in use by another customer. Please wait until they are finished.',
      kioskId: session.kioskId,
      state: session.state,
    })
  }

  const resolvedVariant = session.kioskVariant || getKioskVariantSync(session.kioskId)

  // 4. Pre-payment or matching owner: assign claim secret & lock session
  const assignedSecret = clientClaimToken || session.claimSecret || crypto.randomBytes(16).toString('hex')
  session.claimSecret = assignedSecret
  session.claimedAt = session.claimedAt || Date.now()
  session.lastPhoneActivityAt = Date.now()
  session.lastActivityAt = Date.now()
  session.phoneDisconnected = false
  session.phoneDisconnectedAt = undefined
  if (session.state === 'QR_READY') {
    session.state = 'CLAIMED'
    session.phase = 'Phone connected. Select your document on phone.'
    session.phaseStep = 1
  }
  saveSession(session)

  return res.json({
    success: true,
    isOwner: true,
    sessionId: session.sessionId,
    kioskId: session.kioskId,
    kioskVariant: resolvedVariant,
    variant: resolvedVariant,
    state: session.state,
    claimSecret: assignedSecret,
    token: session.token,
    message: 'Session claimed. You may now upload your document.',
  })
})

/**
 * POST /api/kiosk-sessions/:sessionId/phone-activity
 * Called by the phone web app whenever the user touches, scrolls, or types on their phone.
 * Updates lastPhoneActivityAt.
 * CRITICAL: Tapping/touching the kiosk display must NOT call this endpoint!
 */
kioskSessionsRouter.post('/:sessionId/phone-activity', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)

  if (!session || session.state === 'EXPIRED' || session.state === 'DONE' || session.state === 'CANCELLED') {
    return res.status(410).json({ success: false, isExpired: true, error: 'Session expired or ended' })
  }

  const clientClaimToken = String(
    req.body?.clientClaimToken || req.headers['x-client-claim-token'] || ''
  ).trim()

  if (session.claimSecret && clientClaimToken && session.claimSecret !== clientClaimToken) {
    return res.status(403).json({ success: false, error: 'Unauthorized device' })
  }

  const backdate = Number(req.body?.backdateMs) || 0
  const now = Date.now() - backdate
  session.lastPhoneActivityAt = now
  session.lastActivityAt = now
  if (backdate > 0) {
    if (session.currentSectionEnteredAt && session.currentSectionEnteredAt > now) {
      session.currentSectionEnteredAt = now
    }
    if (session.claimedAt && session.claimedAt > now) {
      session.claimedAt = now
    }
    if (session.createdAt && session.createdAt > now) {
      session.createdAt = now
    }
  }

  // If session had pending disconnect countdown, immediately cancel it because phone is active
  if (session.phoneDisconnected) {
    session.phoneDisconnected = false
    session.phoneDisconnectedAt = undefined
    console.log(`[KioskSession] 📱 Phone re-engaged with session ${sessionId}. 5s countdown cancelled.`)
  }

  saveSession(session)

  res.json({
    success: true,
    sessionId,
    lastPhoneActivityAt: now,
    phoneDisconnected: false,
  })
})

/**
 * POST /api/kiosk-sessions/kiosk/:kioskId/phone-activity
 * Fallback to update phone activity by kiosk ID (e.g. PB-001).
 */
kioskSessionsRouter.post('/kiosk/:kioskId/phone-activity', (req: Request, res: Response) => {
  const kioskId = String(req.params.kioskId || '').trim().toUpperCase()
  const activeId = activeSessionByKiosk.get(kioskId)
  if (!activeId) {
    return res.json({ success: true, message: 'No active session' })
  }
  const session = getSession(activeId)
  if (!session || session.state === 'EXPIRED' || session.state === 'DONE' || session.state === 'CANCELLED') {
    return res.status(410).json({ success: false, isExpired: true, error: 'Session expired or ended' })
  }

  const backdate = Number(req.body?.backdateMs) || 0
  const now = Date.now() - backdate
  session.lastPhoneActivityAt = now
  session.lastActivityAt = now
  if (backdate > 0) {
    if (session.currentSectionEnteredAt && session.currentSectionEnteredAt > now) {
      session.currentSectionEnteredAt = now
    }
    if (session.claimedAt && session.claimedAt > now) {
      session.claimedAt = now
    }
    if (session.createdAt && session.createdAt > now) {
      session.createdAt = now
    }
  }

  if (session.phoneDisconnected) {
    session.phoneDisconnected = false
    session.phoneDisconnectedAt = undefined
  }

  saveSession(session)

  res.json({
    success: true,
    kioskId,
    sessionId: session.sessionId,
    lastPhoneActivityAt: now,
    phoneDisconnected: false,
  })
})

/**
 * POST /api/kiosk-sessions/:sessionId/section
 * POST /api/kiosk-sessions/kiosk/:kioskId/section
 * Called whenever a section is entered on kiosk or mobile.
 * Resets the 1-minute inactivity countdown specifically for the newly entered section.
 */
kioskSessionsRouter.post(['/:sessionId/section', '/kiosk/:kioskId/section'], (req: Request, res: Response) => {
  const { sessionId, kioskId } = req.params
  const resolvedId = sessionId || (kioskId ? activeSessionByKiosk.get(kioskId.toUpperCase()) : null)
  const session = resolvedId ? getSession(resolvedId) : null

  if (session && session.state !== 'DONE' && session.state !== 'EXPIRED' && session.state !== 'CANCELLED' && session.state !== 'PRINTING') {
    const now = Date.now()
    session.currentSectionEnteredAt = now
    session.lastPhoneActivityAt = now
    session.lastActivityAt = now

    const section = req.body?.section
    const isPayingOrHigher = (session.state as string) === 'PAYING' || (session.state as string) === 'OTP_READY'

    if (section === '/payment' && session.state !== 'PAYING') {
      session.state = 'PAYING'
      console.log(`[KioskSession] 🔄 Synced session ${session.sessionId} to state PAYING from section ${section}`)
    } else if (!isPayingOrHigher) {
      if (section === '/review' && session.state !== 'REVIEWING') {
        session.state = 'REVIEWING'
        console.log(`[KioskSession] 🔄 Synced session ${session.sessionId} to state REVIEWING from section ${section}`)
      } else if (section === '/settings' && session.state !== 'CONFIGURING') {
        session.state = 'CONFIGURING'
        console.log(`[KioskSession] 🔄 Synced session ${session.sessionId} to state CONFIGURING from section ${section}`)
      }
    }

    saveSession(session)
    console.log(`[KioskSession] ⏱️ Reset 1-minute timer for section on session ${session.sessionId}`)
    return res.json({
      success: true,
      sessionId: session.sessionId,
      state: session.state,
      currentSectionEnteredAt: now,
      inactivityRemainingSec: 60,
      resetAt: now + SECTION_INACTIVITY_TIMEOUT_MS,
    })
  }

  res.json({ success: false, error: 'Session not active' })
})

/**
 * POST /api/kiosk-sessions/kiosk/:kioskId/phone-disconnect
 * Called by the phone web app as a reliable fallback when user leaves or goes back
 * even if sessionId has not yet been resolved or claimed.
 */
kioskSessionsRouter.post('/kiosk/:kioskId/phone-disconnect', (req: Request, res: Response) => {
  const kioskId = String(req.params.kioskId || '').trim().toUpperCase()
  const activeId = activeSessionByKiosk.get(kioskId)
  if (!activeId) {
    return res.json({ success: true, message: 'No active session' })
  }
  const session = getSession(activeId)
  if (!session) {
    return res.json({ success: true, message: 'Session not found' })
  }
  if (session.state === 'PRINTING' || session.state === 'DONE' || session.document || session.state === 'CONFIRMING' || session.state === 'CONFIGURING' || session.state === 'REVIEWING' || session.state === 'PAYING') {
    return res.json({ success: true, ignored: true, state: session.state })
  }

  const now = Date.now()
  session.phoneDisconnected = true
  session.phoneDisconnectedAt = now
  session.phoneDisconnectGraceMs = 15000
  saveSession(session)

  console.log(`[KioskSession] 📱 Phone went back / left kiosk ${kioskId} (session ${session.sessionId}). 15s countdown started.`)

  try {
    relayToKiosk(kioskId, {
      type: 'PHONE_DISCONNECTED',
      kioskId,
      sessionId: session.sessionId,
      payload: { graceMs: 15000 },
    } as any)
  } catch {}

  res.json({
    success: true,
    kioskId,
    sessionId: session.sessionId,
    phoneDisconnected: true,
    phoneDisconnectedAt: now,
    graceRemainingMs: 15000,
  })
})

/**
 * POST /api/kiosk-sessions/:sessionId/phone-disconnect
 * Called by the phone web app when user goes back or leaves an active session.
 * Starts a 15-second countdown on the kiosk screen before resetting back to idle.
 */
kioskSessionsRouter.post('/:sessionId/phone-disconnect', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' })
  }

  // If already printing, done, or document is active, don't interrupt
  if (session.state === 'PRINTING' || session.state === 'DONE' || session.document || session.state === 'CONFIRMING' || session.state === 'CONFIGURING' || session.state === 'REVIEWING' || session.state === 'PAYING') {
    return res.json({ success: true, ignored: true, state: session.state })
  }

  const now = Date.now()
  session.phoneDisconnected = true
  session.phoneDisconnectedAt = now
  session.phoneDisconnectGraceMs = 15000
  saveSession(session)

  console.log(`[KioskSession] 📱 Phone went back / left session ${sessionId}. 15s countdown started.`)

  try {
    relayToKiosk(session.kioskId, {
      type: 'PHONE_DISCONNECTED',
      kioskId: session.kioskId,
      sessionId,
      payload: { graceMs: 15000 },
    } as any)
  } catch {}

  res.json({
    success: true,
    sessionId,
    phoneDisconnected: true,
    phoneDisconnectedAt: now,
    graceRemainingMs: 15000,
  })
})

/**
 * POST /api/kiosk-sessions/:sessionId/progress
 * Called by the web app to push progress updates to the kiosk display.
 * Supports states: UPLOADING, CONFIGURING, PAYING, OTP_READY, PRINTING, DONE
 */
kioskSessionsRouter.post('/:sessionId/progress', async (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)

  if (!session || session.state === 'DONE' || session.state === 'CANCELLED' || session.state === 'EXPIRED' || Date.now() > session.expiresAt) {
    return res.status(410).json({
      success: false,
      isExpired: true,
      error: 'SESSION_EXPIRED',
      code: 'SESSION_EXPIRED',
      message: 'This print session has expired due to inactivity. Please scan the current live QR code on the kiosk screen.',
    })
  }

  const clientClaimToken = String(
    req.body?.clientClaimToken || req.headers['x-client-claim-token'] || ''
  ).trim()

  const isPrePayment = session.state !== 'PAYING' && session.state !== 'PRINTING'

  if (session.claimSecret && clientClaimToken && session.claimSecret !== clientClaimToken && !isPrePayment) {
    return res.status(409).json({
      success: false,
      error: 'MACHINE_ALREADY_IN_USE',
      code: 'MACHINE_ALREADY_IN_USE',
      message: 'Machine is already in use by another customer.',
    })
  }

  if (!session.claimSecret || isPrePayment) {
    if (clientClaimToken) session.claimSecret = clientClaimToken
  }

  // Update activity timestamps
  const now = Date.now()
  session.lastPhoneActivityAt = now
  session.lastActivityAt = now
  session.phoneDisconnected = false
  session.phoneDisconnectedAt = undefined

  const {
    state,
    phase,
    phaseStep,
    otp,
    orderId,
    fileName,
    totalPages,
    copies,
    colourMode,
    amount,
    progressData,
    settings,
    files,
  } = req.body

  // Validate state transitions
  const VALID_STATES: KioskSessionState[] = [
    'UPLOADING', 'CONFIRMING', 'CONFIGURING', 'REVIEWING', 'PAYING', 'OTP_READY', 'PRINTING', 'DONE'
  ]

  const STATE_PROGRESSION_RANK: Record<string, number> = {
    'CLAIMED': 1,
    'UPLOADING': 2,
    'CONFIRMING': 3,
    'CONFIGURING': 4,
    'REVIEWING': 5,
    'PAYING': 6,
    'OTP_READY': 6,
    'PRINTING': 7,
    'DONE': 8,
  }

  const isBackwardNav = Boolean(req.body?.isBackwardNav)
  let stateTransitionBlocked = false

  if (state && VALID_STATES.includes(state as KioskSessionState)) {
    const currentRank = STATE_PROGRESSION_RANK[session.state] || 0
    const incomingRank = STATE_PROGRESSION_RANK[state as string] || 0

    // Monotonic guard 1: once session enters PRINTING, never allow regressing backwards
    if (session.state === 'PRINTING' && state !== 'PRINTING' && state !== 'DONE') {
      console.log(`[KioskSession] 🛑 Blocked state regression on session ${session.sessionId}: current=${session.state}, rejected incoming=${state}`)
      stateTransitionBlocked = true
    }
    // Monotonic guard 2: once session enters PAYING or OTP_READY, never allow regressing backwards to REVIEWING/CONFIGURING/etc.
    // unless this was an explicit user-initiated backward navigation from phone
    else if (currentRank >= 6 && incomingRank < currentRank && !isBackwardNav) {
      console.log(`[KioskSession] 🛑 Blocked stale state regression on session ${session.sessionId}: current=${session.state} (rank ${currentRank}), rejected incoming=${state} (rank ${incomingRank})`)
      stateTransitionBlocked = true
    } else {
      if (session.state !== state) {
        session.currentSectionEnteredAt = now
      }
      session.state = state as KioskSessionState
      session.isBackwardNav = incomingRank >= 6 ? false : isBackwardNav

      // If user legitimately navigated back from Payment to configure or review, invalidate any previously generated QR code
      if (['UPLOADING', 'CONFIRMING', 'CONFIGURING', 'REVIEWING'].includes(state as string)) {
        session.upiQrValue = ''
        session.upiIntentUrl = ''
        session.paymentUrl = ''
        session.qrAmount = undefined
        session.paymentEpoch = (session.paymentEpoch || 0) + 1
      }
    }
  }

  // Only apply phase / phaseStep if state transition was not blocked
  if (!stateTransitionBlocked) {
    if (phase) session.phase = phase
    if (typeof phaseStep === 'number') session.phaseStep = phaseStep
  }
  if (otp) session.otp = otp
  if (orderId && !session.orderId) session.orderId = orderId
  if (fileName) session.fileName = fileName
  if (typeof totalPages === 'number') session.totalPages = totalPages
  if (typeof copies === 'number') session.copies = copies
  else if (settings && typeof settings.copies === 'number') session.copies = settings.copies
  if (colourMode) session.colourMode = colourMode
  else if (settings && typeof settings.colour === 'string') session.colourMode = settings.colour
  const newAmount = typeof amount === 'number'
    ? amount
    : (settings && typeof settings.totalAmount === 'number' ? settings.totalAmount : undefined)

  if (typeof newAmount === 'number' && typeof session.qrAmount === 'number' && Math.abs(session.qrAmount - newAmount) > 0.25) {
    session.upiQrValue = ''
    session.upiIntentUrl = ''
    session.paymentUrl = ''
    session.qrAmount = undefined
  }

  if (typeof newAmount === 'number') {
    session.amount = newAmount
  }

  if (req.body.isSyncing !== undefined) {
    session.isSyncing = Boolean(req.body.isSyncing)
    session.syncMessage = req.body.syncMessage || session.phase || 'Syncing with phone…'
  }

  if (progressData) session.progressData = { ...session.progressData, ...progressData }
  if (settings && typeof settings === 'object') {
    session.settings = { ...session.settings, ...settings }
  }

  const rawIncomingPages = req.body.pageRange || req.body.pages || req.body.selectedPages || settings?.pageRange || settings?.pages || settings?.selectedPages
  if (rawIncomingPages) {
    const formattedPages = formatPageRange(rawIncomingPages)
    session.settings = {
      ...(session.settings || {}),
      pageRange: formattedPages,
      pages: formattedPages,
      ...(Array.isArray(rawIncomingPages) ? { selectedPages: rawIncomingPages } : {}),
    } as KioskPrintSettingsData
  }

  if (files && Array.isArray(files) && files.length > 0) {
    session.files = files
    if (session.document) {
      session.document.files = files
    }
  }

  // If session document is not yet initialized but progress ping has document metadata, synthesize doc
  if (!session.document && (fileName || session.fileName)) {
    session.document = {
      fileName: fileName || session.fileName || 'Document.pdf',
      fileSize: 0,
      fileType: 'pdf',
      pageCount: typeof totalPages === 'number' ? totalPages : (session.totalPages || 1),
      filePath: '',
      pages: [],
      uploadedAt: Date.now(),
      files: session.files || (files && Array.isArray(files) ? files : []),
    }
  }

  if (state === 'DONE') {
    session.completedAt = Date.now()
  }

  // Auto-generate UPI Express payment QR code as soon as state moves to PAYING (if not yet generated or amount updated)
  if (session.state === 'PAYING') {
    const isQrCurrent = Boolean(session.upiQrValue) && typeof session.qrAmount === 'number' && typeof session.amount === 'number' && Math.abs(session.qrAmount - session.amount) <= 0.25
    if (!isQrCurrent) {
      try {
        await initiatePaymentForSession(session, req, typeof amount === 'number' ? amount : session.amount)
      } catch (payErr) {
        console.warn(`[KioskSession] Auto payment initialization warning:`, payErr)
      }
    }
  }

  saveSession(session)

  console.log(`[KioskSession] ↑ Progress ${sessionId}: state=${session.state} phase="${session.phase}"`)

  res.json({ success: true, state: session.state, upiQrValue: session.upiQrValue })
})

/**
 * POST /api/kiosk-sessions/:sessionId/upload
 * Called by the mobile web app when user selects and uploads their file from phone.
 * Passes the document and pre-rendered preview pages to the kiosk display.
 */
kioskSessionsRouter.post('/:sessionId/upload', (req: Request, res: Response, next) => {
  upload.any()(req, res, (err: any) => {
    if (err) {
      console.error('[KioskSession] Multer upload error:', err)
      return res.status(400).json({
        success: false,
        error: err.code === 'LIMIT_FILE_SIZE'
          ? 'File too large (maximum size is 10MB)'
          : err.code === 'LIMIT_FIELD_VALUE'
          ? 'Form field value too large'
          : err.message || 'File upload failed',
      })
    }
    next()
  })
}, (req: Request, res: Response) => {
  const { sessionId } = req.params
  let session = getSession(sessionId)

  if (!session || session.state === 'DONE' || session.state === 'CANCELLED' || session.state === 'EXPIRED' || Date.now() > session.expiresAt) {
    const targetKioskId = String(req.body?.kioskId || (sessionId.includes('PB-') ? sessionId.split('_')[1] : null) || 'PB-001').toUpperCase().trim()
    const activeId = activeSessionByKiosk.get(targetKioskId)
    if (activeId && sessions.has(activeId)) {
      session = sessions.get(activeId)!
    } else {
      console.log(`[KioskSession] ✦ Upload auto-recovery: generating active session for ${targetKioskId}`)
      const webBase = resolveWebBaseUrl(req)
      session = generateSession(targetKioskId, webBase)
      activeSessionByKiosk.set(targetKioskId, session.sessionId)
    }
  }

  const clientClaimToken = String(
    req.body?.clientClaimToken || req.headers['x-client-claim-token'] || ''
  ).trim()

  const isPrePayment = session.state !== 'PAYING' && session.state !== 'PRINTING'

  if (session.claimSecret && clientClaimToken && session.claimSecret !== clientClaimToken && !isPrePayment) {
    return res.status(409).json({
      success: false,
      error: 'MACHINE_ALREADY_IN_USE',
      code: 'MACHINE_ALREADY_IN_USE',
      message: 'Machine is already in use by another customer.',
    })
  }

  if (!session.claimSecret || isPrePayment) {
    session.claimSecret = clientClaimToken || session.claimSecret || crypto.randomBytes(16).toString('hex')
  }

  // Extract all uploaded files from Multer
  const uploadedFiles: Express.Multer.File[] = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : req.file
    ? [req.file]
    : []

  const MAX_COMBINED_BYTES = 10 * 1024 * 1024
  const totalUploadedBytes = uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0)
  const reqTotalBytes = Number(req.body.fileSize) || 0

  if (totalUploadedBytes > MAX_COMBINED_BYTES || reqTotalBytes > MAX_COMBINED_BYTES) {
    for (const f of uploadedFiles) {
      try {
        if (f.path && fs.existsSync(f.path)) {
          fs.unlinkSync(f.path)
        }
      } catch {}
    }
    const attemptedBytes = Math.max(totalUploadedBytes, reqTotalBytes)
    const attemptedMB = (attemptedBytes / (1024 * 1024)).toFixed(1)
    console.warn(`[KioskSession] 🛑 Combined file size exceeded: ${attemptedMB} MB > 10 MB for session ${sessionId}`)
    return res.status(400).json({
      success: false,
      error: 'LIMIT_COMBINED_FILE_SIZE',
      message: `The combined file size of all uploaded files cannot exceed 10 MB (received ${attemptedMB} MB).`,
    })
  }

  const file = uploadedFiles.find(f => f.fieldname === 'file') || uploadedFiles[0]
  const fileName = file?.originalname || req.body.fileName || 'Document.pdf'
  const fileSize = file?.size || Number(req.body.fileSize) || 0
  const fileType = req.body.fileType || 'pdf'
  const rawPageCount = Number(req.body.pageCount)

  let previews: KioskDocumentPreview[] = []
  if (req.body.previews) {
    try {
      const raw = typeof req.body.previews === 'string' ? JSON.parse(req.body.previews) : req.body.previews
      if (Array.isArray(raw)) {
        previews = raw.slice(0, 10).map((p: any, idx: number) => ({
          pageNumber: Number(p.pageNumber) || idx + 1,
          url: typeof p.url === 'string' ? p.url : '',
          title: String(p.title || `Page ${idx + 1}`),
        }))
      }
    } catch {}
  }

  const rawFilesData = req.body.filesMetadata || req.body.files
  let filesList: KioskDocumentItem[] = []
  if (rawFilesData) {
    try {
      const rawFiles = typeof rawFilesData === 'string' ? JSON.parse(rawFilesData) : rawFilesData
      if (Array.isArray(rawFiles)) {
        filesList = rawFiles.map((f: any) => ({
          id: f.id,
          fileName: String(f.fileName || 'Document'),
          fileSize: Number(f.fileSize) || 0,
          fileType: String(f.fileType || 'pdf'),
          pageCount: Number(f.pageCount) || 1,
          copies: Number(f.copies || f.settings?.copies) || 1,
          colour: f.colour || f.settings?.colour || 'BW',
          duplex: f.duplex || f.settings?.duplex || 'SINGLE',
          pages: f.pages || f.pageRange || f.settings?.pages || 'ALL',
          pageRange: f.pageRange || f.pages || f.settings?.pageRange || 'ALL',
          paperSize: f.paperSize || f.settings?.paperSize || 'A4',
          scaling: f.scaling || f.settings?.scaling || 'FIT',
          pagesPerSheet: Number(f.pagesPerSheet || f.settings?.pagesPerSheet) || 1,
          dpi: f.dpi || f.settings?.dpi || '600',
          orientation: f.orientation || f.settings?.orientation || 'AUTO',
          pageColours: f.pageColours || f.settings?.pageColours,
          pageCopies: f.pageCopies || f.settings?.pageCopies,
          settings: f.settings,
          filePath: f.filePath,
          fileUrl: f.fileUrl,
          previews: Array.isArray(f.previews) ? f.previews : undefined,
        }))
      }
    } catch {}
  }

  const totalMetadataBytes = filesList.reduce((sum, f) => sum + (f.fileSize || 0), 0)
  if (totalMetadataBytes > MAX_COMBINED_BYTES) {
    for (const f of uploadedFiles) {
      try {
        if (f.path && fs.existsSync(f.path)) {
          fs.unlinkSync(f.path)
        }
      } catch {}
    }
    const attemptedMB = (totalMetadataBytes / (1024 * 1024)).toFixed(1)
    return res.status(400).json({
      success: false,
      error: 'LIMIT_COMBINED_FILE_SIZE',
      message: `The combined file size of all uploaded files cannot exceed 10 MB (received ${attemptedMB} MB).`,
    })
  }

  // Correlate each item in filesList with its distinct uploaded binary
  const binaryFiles = uploadedFiles.filter(uf => uf.fieldname === 'fileBinaries' || uf.fieldname === 'files')
  const multiUploadPool = binaryFiles.length > 0 ? binaryFiles : uploadedFiles

  filesList = filesList.map((f, idx) => {
    const matched =
      multiUploadPool.find(uf => uf.originalname === f.fileName) ||
      uploadedFiles.find(uf => uf.originalname === f.fileName) ||
      multiUploadPool[idx] ||
      uploadedFiles[idx] ||
      file

    const resolvedPath = matched?.path || f.filePath || ''
    const resolvedUrl = matched ? `/api/kiosk-sessions/${sessionId}/file/${idx}` : f.fileUrl
    const resolvedSize = f.fileSize || matched?.size || 0

    return {
      ...f,
      filePath: resolvedPath,
      fileUrl: resolvedUrl,
      fileSize: resolvedSize,
    }
  })

  const pageCount = Math.max(1, !isNaN(rawPageCount) && rawPageCount > 0 ? rawPageCount : (previews.length || 1))
  const filePath = (filesList.length > 0 && filesList[0]?.filePath) ? filesList[0].filePath : (file?.path || '')
  const fileUrl = file ? `/api/kiosk-sessions/${sessionId}/file` : (filesList[0]?.filePath ? `/api/kiosk-sessions/${sessionId}/file/0` : undefined)

  // Auto-generate preview from uploaded image file if previews array has no valid non-empty previews
  const hasValidPreviews = Array.isArray(previews) && previews.some((p: any) => p && typeof p.url === 'string' && p.url.trim().length > 0)
  if (!hasValidPreviews && file && /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(fileName)) {
    previews = [{
      pageNumber: 1,
      url: `/api/kiosk-sessions/${sessionId}/file`,
      title: fileName,
    }]
  }

  const docData: KioskDocumentData = {
    fileName,
    fileSize,
    fileType,
    pageCount,
    filePath,
    fileUrl,
    pages: previews,
    uploadedAt: Date.now(),
    ...(filesList.length > 0 ? { files: filesList } : {}),
  }

  session.document = docData
  session.fileName = fileName
  session.totalPages = pageCount
  if (filesList.length > 0) {
    session.files = filesList
  }
  session.copies = session.copies || 1
  session.colourMode = session.colourMode || 'BW'
  const now = Date.now()
  session.lastPhoneActivityAt = now
  session.lastActivityAt = now
  session.currentSectionEnteredAt = now
  session.phoneDisconnected = false
  session.phoneDisconnectedAt = undefined

  // Only transition to CONFIRMING if session hasn't already advanced past it
  const isPastConfirming = ['CONFIGURING', 'REVIEWING', 'PAYING', 'PRINTING', 'DONE'].includes(session.state)
  if (!isPastConfirming) {
    session.state = 'CONFIRMING'
    session.phase = 'Document uploaded. Review document on mobile.'
    session.phaseStep = 2
  }

  saveSession(session)

  console.log(`[KioskSession] 📄 Document "${fileName}" (${pageCount} pages, ${filesList.length} files) uploaded for session ${sessionId} on ${session.kioskId}`)

  try {
    relayToKiosk(session.kioskId, {
      type: 'SESSION_STATE_CHANGED',
      kioskId: session.kioskId,
      sessionId: session.sessionId,
      payload: {
        state: 'CONFIRMING',
        phase: session.phase,
        document: session.document,
        files: session.files,
        totalPages: pageCount,
        fileName,
      },
    } as any)
  } catch {}

  res.json({
    success: true,
    sessionId,
    state: session.state,
    phase: session.phase,
    nextStep: 'settings',
    document: session.document,
    files: session.files,
    message: 'Document successfully transferred to kiosk screen.',
  })
})

/**
 * POST /api/kiosk-sessions/:sessionId/next-phase
 * POST /api/kiosk-sessions/:sessionId/advance
 * Deterministic next-phase transition endpoint.
 * Immediately advances session state (e.g. to CONFIRMING or CONFIGURING)
 * and relays document metadata and previews to the kiosk display.
 */
kioskSessionsRouter.post(['/:sessionId/next-phase', '/:sessionId/advance'], async (req: Request, res: Response) => {
  const { sessionId } = req.params
  let session = getSession(sessionId)

  if (!session || session.state === 'DONE' || session.state === 'CANCELLED' || session.state === 'EXPIRED' || Date.now() > session.expiresAt) {
    const targetKioskId = String(req.body?.kioskId || (sessionId.includes('PB-') ? sessionId.split('_')[1] : null) || 'PB-001').toUpperCase().trim()
    const activeId = activeSessionByKiosk.get(targetKioskId)
    if (activeId && sessions.has(activeId)) {
      session = sessions.get(activeId)!
    } else {
      console.log(`[KioskSession] ✦ Next-phase auto-recovery: generating active session for ${targetKioskId}`)
      const webBase = resolveWebBaseUrl(req)
      session = generateSession(targetKioskId, webBase)
      activeSessionByKiosk.set(targetKioskId, session.sessionId)
    }
  }

  const {
    targetState,
    fileName,
    fileSize,
    fileType,
    pageCount,
    totalPages,
    previews,
    files,
    settings,
  } = req.body

  const MAX_COMBINED_BYTES = 10 * 1024 * 1024
  let combinedNextBytes = Number(fileSize) || 0
  if (Array.isArray(files) && files.length > 0) {
    const sum = files.reduce((acc: number, f: any) => acc + (Number(f.fileSize) || 0), 0)
    combinedNextBytes = Math.max(combinedNextBytes, sum)
  }
  if (combinedNextBytes > MAX_COMBINED_BYTES) {
    const attemptedMB = (combinedNextBytes / (1024 * 1024)).toFixed(1)
    return res.status(400).json({
      success: false,
      error: 'LIMIT_COMBINED_FILE_SIZE',
      message: `The combined file size cannot exceed 10 MB (received ${attemptedMB} MB).`,
    })
  }

  const now = Date.now()
  session.lastPhoneActivityAt = now
  session.lastActivityAt = now
  session.phoneDisconnected = false
  session.phoneDisconnectedAt = undefined
  session.currentSectionEnteredAt = now

  const nextState: KioskSessionState = (targetState as KioskSessionState) || 'CONFIRMING'
  const isPayingOrAbove = session.state === 'PAYING' || session.state === 'OTP_READY' || session.state === 'PRINTING' || session.state === 'DONE'
  const incomingIsEarlier = ['QR_READY', 'CLAIMED', 'UPLOADING', 'CONFIRMING', 'CONFIGURING', 'REVIEWING'].includes(nextState)

  if (isPayingOrAbove && incomingIsEarlier) {
    console.log(`[KioskSession] 🛑 Session ${session.sessionId} is currently in ${session.state}. Ignoring next-phase state override to ${nextState}.`)
  } else {
    session.state = nextState
  }

  if (nextState === 'CONFIRMING') {
    session.phase = 'Document uploaded. Review document on mobile.'
    session.phaseStep = 2
  } else if (nextState === 'CONFIGURING') {
    session.phase = 'Print settings on mobile.'
    session.phaseStep = 3
  } else if (nextState === 'REVIEWING') {
    session.phase = 'Reviewing order on mobile.'
    session.phaseStep = 4
  } else if (nextState === 'PAYING') {
    session.phase = 'Scan UPI QR on kiosk display to pay'
    session.phaseStep = 5
  }

  if (fileName) session.fileName = fileName
  const resolvedPages = Math.max(1, Number(pageCount || totalPages) || session.totalPages || 1)
  session.totalPages = resolvedPages

  if (files && Array.isArray(files) && files.length > 0) {
    session.files = files
  }

  if (settings && typeof settings === 'object') {
    session.settings = { ...session.settings, ...settings }
  }

  let formattedPreviews: KioskDocumentPreview[] = []
  if (Array.isArray(previews)) {
    formattedPreviews = previews.slice(0, 10).map((p: any, idx: number) => ({
      pageNumber: Number(p.pageNumber) || idx + 1,
      url: typeof p.url === 'string' ? p.url : '',
      title: String(p.title || `Page ${idx + 1}`),
    }))
  }

  const hasNextValidPreviews = formattedPreviews.some(p => p && p.url && p.url.trim().length > 0)
  if (!hasNextValidPreviews && (session.document?.fileUrl || (session.document?.fileName && /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(session.document.fileName)))) {
    const directUrl = session.document?.fileUrl || `/api/kiosk-sessions/${sessionId}/file`
    formattedPreviews = [{
      pageNumber: 1,
      url: directUrl,
      title: session.document?.fileName || fileName || 'Document',
    }]
  }

  // Synthesize or update session.document so kiosk display immediately detects it
  session.document = {
    fileName: fileName || session.fileName || 'Document.pdf',
    fileSize: Number(fileSize) || session.document?.fileSize || 0,
    fileType: fileType || session.document?.fileType || 'pdf',
    pageCount: resolvedPages,
    filePath: session.document?.filePath || '',
    fileUrl: session.document?.fileUrl || '',
    pages: formattedPreviews.length > 0 ? formattedPreviews : (session.document?.pages || []),
    uploadedAt: session.document?.uploadedAt || now,
    files: session.files || session.document?.files || [],
  }

  saveSession(session)

  try {
    relayToKiosk(session.kioskId, {
      type: 'SESSION_STATE_CHANGED',
      kioskId: session.kioskId,
      sessionId: session.sessionId,
      payload: {
        state: session.state,
        phase: session.phase,
        document: session.document,
        files: session.files,
        totalPages: session.totalPages,
        fileName: session.fileName,
      },
    } as any)
  } catch {}

  console.log(`[KioskSession] 🚀 Next-phase advanced ${session.sessionId} on ${session.kioskId} -> ${session.state} ("${session.phase}")`)

  res.json({
    success: true,
    sessionId: session.sessionId,
    state: session.state,
    phase: session.phase,
    nextStep: nextState === 'CONFIRMING' ? 'confirm' : (nextState === 'CONFIGURING' ? 'settings' : (nextState === 'PAYING' ? 'payment' : 'review')),
    document: session.document,
    files: session.files,
    session,
  })
})

/**
 * GET /api/kiosk-sessions/:sessionId/file
 * GET /api/kiosk-sessions/:sessionId/file/:index
 * Downloads or serves the uploaded document for this kiosk session (or specific file for multi-file).
 */
kioskSessionsRouter.get(['/:sessionId/file', '/:sessionId/file/:index'], (req: Request, res: Response) => {
  const { sessionId, index } = req.params
  const session = getSession(sessionId)
  let targetPath = session?.document?.filePath

  const targetIdx = index !== undefined
    ? Number(index)
    : (req.query.index !== undefined ? Number(req.query.index) : (req.query.sub !== undefined ? Number(req.query.sub) - 1 : undefined))

  if (targetIdx !== undefined && !isNaN(targetIdx) && session?.files && session.files[targetIdx]) {
    const specificFile = session.files[targetIdx]
    if (specificFile.filePath && fs.existsSync(specificFile.filePath)) {
      targetPath = specificFile.filePath
    }
  }

  if (!targetPath || !fs.existsSync(targetPath)) {
    const sample = path.resolve(__dirname, '../../../../test_sample.pdf')
    if (fs.existsSync(sample)) {
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Access-Control-Allow-Origin', '*')
      return res.sendFile(sample)
    }
    return res.status(404).json({ error: 'File not found' })
  }

  const ext = path.extname(targetPath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
  }
  if (mimeTypes[ext]) {
    res.setHeader('Content-Type', mimeTypes[ext])
  }
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.sendFile(targetPath)
})

/**
 * POST /api/kiosk-sessions/:sessionId/settings
 * Called by kiosk touchscreen when user configures print options (Colour, Sides, Copies, Pages).
 */
const handleUpdateKioskSessionSettings = (req: Request, res: Response) => {
  const { sessionId, kioskId: paramKioskId } = req.params
  let session = sessionId ? getSession(sessionId) : null
  if (!session && paramKioskId) {
    session = getActiveSession(paramKioskId.toUpperCase().trim())
  }
  if (!session && req.body?.kioskId) {
    session = getActiveSession(String(req.body.kioskId).toUpperCase().trim())
  }
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' })
  }

  const {
    colour,
    duplex,
    copies,
    pageRange,
    pages,
    selectedPages,
    paperSize,
    pricePerPage,
    totalAmount,
    nextState,
    settingsMode,
    nUpLayout,
    duplexBinding,
    printDpi,
    paperWeight,
    pageCustomizations,
  } = req.body

  const totalPages = session.document?.pageCount || session.totalPages || 1
  const resolvedCopies = Math.max(1, Number(copies) || 1)
  const resolvedPrice = Number(pricePerPage) || (colour === 'COLOUR' ? 8 : 2)
  const computedTotal = Number(totalAmount) || (resolvedPrice * resolvedCopies * totalPages)
  const resolvedPageRange = resolveEffectivePageRange(
    selectedPages,
    pages,
    pageRange,
    session.settings?.selectedPages,
    session.settings?.pages,
    session.settings?.pageRange
  )

  const effectiveSelectedPages = Array.isArray(selectedPages)
    ? selectedPages
    : (Array.isArray(session.settings?.selectedPages) ? session.settings.selectedPages : undefined)

  session.settings = {
    ...(session.settings || {}),
    colour: colour === 'COLOUR' ? 'COLOUR' : 'BW',
    duplex: duplex === 'DOUBLE' ? 'DOUBLE' : 'SINGLE',
    copies: resolvedCopies,
    pageRange: resolvedPageRange,
    pages: resolvedPageRange,
    ...(effectiveSelectedPages ? { selectedPages: effectiveSelectedPages } : {}),
    paperSize: paperSize || 'A4',
    pricePerPage: resolvedPrice,
    totalAmount: computedTotal,
    settingsMode: settingsMode || 'GLOBAL',
    nUpLayout: nUpLayout || 1,
    duplexBinding: duplexBinding || 'LONG_EDGE',
    printDpi: printDpi || '600',
    paperWeight: paperWeight || '75GSM',
    pageCustomizations: pageCustomizations || {},
  }

  if (Array.isArray(req.body.files) && req.body.files.length > 0) {
    session.files = req.body.files
    if (session.document) {
      session.document.files = req.body.files
    }
  }

  session.copies = session.settings!.copies
  session.colourMode = session.settings!.colour
  session.amount = session.settings!.totalAmount

  if (typeof session.qrAmount === 'number' && session.qrAmount !== computedTotal) {
    session.upiQrValue = ''
    session.upiIntentUrl = ''
    session.paymentUrl = ''
    session.qrAmount = undefined
  }

  if (session.state === 'PAYING' || session.state === 'OTP_READY' || session.state === 'PRINTING' || session.state === 'DONE') {
    if (nextState !== 'PAYING') {
      console.log(`[KioskSession] 🛑 Session ${session.sessionId} is in ${session.state}. Skipping state regression in settings update.`)
      saveSession(session)
      return res.json({ success: true, session })
    }
  }

  if (nextState !== 'PAYING' && session.state !== 'PAYING' && session.state !== 'OTP_READY') {
    session.upiQrValue = ''
    session.upiIntentUrl = ''
    session.paymentUrl = ''
    session.qrAmount = undefined
  }

  if (nextState && ['CONFIRMING', 'CONFIGURING', 'REVIEWING', 'PAYING'].includes(nextState)) {
    session.state = nextState as KioskSessionState
    session.phase = nextState === 'PAYING'
      ? 'Scan QR on kiosk display to pay'
      : nextState === 'REVIEWING'
      ? 'Reviewing order on mobile'
      : nextState === 'CONFIGURING'
      ? 'Configuring print settings on mobile'
      : 'Reviewing document on mobile'
    session.phaseStep = nextState === 'PAYING' ? 4 : nextState === 'REVIEWING' ? 3.5 : 3
  } else if (session.state !== 'PAYING' && session.state !== 'OTP_READY' && session.state !== 'PRINTING' && session.state !== 'DONE') {
    session.state = 'CONFIGURING'
    session.phase = 'Configuring print settings on mobile'
    session.phaseStep = 3
  }

  const settingsNow = Date.now()
  session.lastPhoneActivityAt = settingsNow
  session.lastActivityAt = settingsNow
  session.currentSectionEnteredAt = settingsNow
  session.phoneDisconnected = false
  session.phoneDisconnectedAt = undefined

  saveSession(session)
  res.json({ success: true, session })
}

kioskSessionsRouter.post('/:sessionId/settings', handleUpdateKioskSessionSettings)
kioskSessionsRouter.post('/kiosk/:kioskId/settings', handleUpdateKioskSessionSettings)

/**
 * POST /api/kiosk-sessions/:sessionId/state
 * Explicitly updates the state of a session.
 */
kioskSessionsRouter.post('/:sessionId/state', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' })
  }

  const { state } = req.body
  const validStates: KioskSessionState[] = [
    'QR_READY',
    'CLAIMED',
    'UPLOADING',
    'CONFIRMING',
    'CONFIGURING',
    'REVIEWING',
    'PAYING',
    'PRINTING',
    'DONE',
  ]

  if (state && validStates.includes(state)) {
    const isPayingOrAbove = session.state === 'PAYING' || session.state === 'OTP_READY' || session.state === 'PRINTING' || session.state === 'DONE'
    const incomingIsEarlier = ['QR_READY', 'CLAIMED', 'UPLOADING', 'CONFIRMING', 'CONFIGURING', 'REVIEWING'].includes(state)
    if (isPayingOrAbove && incomingIsEarlier) {
      console.log(`[KioskSession] 🛑 Blocked state regression on session ${session.sessionId}: current=${session.state}, rejected incoming=${state}`)
      return res.json({ success: true, state: session.state, session })
    }
    session.state = state as KioskSessionState
    if (state === 'CONFIRMING') {
      session.phase = 'Reviewing Document on Mobile'
      session.phaseStep = 2
    } else if (state === 'CONFIGURING') {
      session.phase = 'Print Settings on Mobile'
      session.phaseStep = 3
    } else if (state === 'REVIEWING') {
      session.phase = 'Reviewing Order on Mobile'
      session.phaseStep = 4
    } else if (state === 'PAYING') {
      session.phase = 'Pay & Print'
      session.phaseStep = 5
    } else if (state === 'QR_READY') {
      session.phase = 'Scan QR to start uploading'
      session.phaseStep = 0
    }
    saveSession(session)
  }

  res.json({ success: true, session })
})

/**
 * Persists/syncs kiosk session state into the main Order database so
 * it immediately appears on Merchant Store Orders and Admin Dashboard.
 */
export async function syncSessionToOrder(session: KioskSession) {
  try {
    const orderId = session.orderId || generateUniqueClientTxnId('PB')
    session.orderId = orderId
    const orderNumber = orderId
    const fileName = session.document?.fileName || session.fileName || 'Kiosk_Document.pdf'
    const fileSize = session.document?.fileSize || 0
    const pageCount = session.document?.pageCount || session.totalPages || 1
    const copies = session.settings?.copies || session.copies || 1
    const colourMode = (session.settings?.colour || session.colourMode || 'BW').toUpperCase()
    const duplex = (session.settings?.duplex || 'SINGLE').toUpperCase()
    const paperSize = session.settings?.paperSize || 'A4'
    const amount = typeof session.amount === 'number' && session.amount > 0 ? session.amount : 2 * pageCount * copies
    const merchantCut = Number((amount * 0.18).toFixed(2))

    let status: any = 'PAID'
    if (session.state === 'DONE') status = 'COMPLETED'
    else if (session.state === 'PRINTING') status = 'PRINTING'
    else if (session.state === 'PAYING') status = 'PAYMENT_PENDING'

    if (isDbConnected()) {
      await Order.findOneAndUpdate(
        { orderId },
        {
          $set: {
            orderId,
            orderNumber,
            kioskId: session.kioskId,
            fileName,
            fileSize,
            status,
            pageCount,
            copies,
            colourMode,
            duplex,
            paperSize,
            pageRange: formatPageRange(session.settings?.pageRange || session.settings?.pages || session.settings?.selectedPages || 'ALL'),
            pages: formatPageRange(session.settings?.pages || session.settings?.pageRange || session.settings?.selectedPages || 'ALL'),
            amount,
            merchantCut,
            pickupCode: session.otp,
            releasePin: session.otp,
            otp: session.otp,
            customerIp: session.claimedIp || '127.0.0.1',
            files: session.files || session.document?.files,
            printSettings: {
              ...(session.settings || {}),
              pageRange: formatPageRange(session.settings?.pageRange || session.settings?.pages || session.settings?.selectedPages || 'ALL'),
              pages: formatPageRange(session.settings?.pages || session.settings?.pageRange || session.settings?.selectedPages || 'ALL'),
              files: session.files || session.document?.files,
            },
            paidAt: session.state === 'PAYING' ? undefined : new Date(),
            completedAt: session.state === 'DONE' ? new Date() : undefined,
            paymentConfirmation: {
              status: 'CONFIRMED',
              confirmedAt: new Date(),
              confirmedBy: 'Touchscreen UPI / Direct',
            },
          },
          $setOnInsert: {
            createdAt: new Date(session.createdAt || Date.now()),
          },
        },
        { upsert: true, new: true }
      )
    }
  } catch (err) {
    console.warn('[KioskSession] Failed to sync session to Order:', err)
  }
}

async function resolveGatewayForKiosk(kioskId: string): Promise<{
  gateway: 'upiexpress' | 'razorpay'
  upiExpressApiKey: string
  razorpayKeyId: string
  razorpayKeySecret: string
}> {
  const cleanId = kioskId.trim().toUpperCase()
  let kiosk: any = null
  let merchant: any = null

  if (isDbConnected()) {
    try {
      kiosk = await Kiosk.findOne({ kioskId: cleanId }).lean()
      merchant = await Merchant.findOne({ kioskId: cleanId }).lean()
      if (!merchant && kiosk?.merchantId) {
        merchant = await Merchant.findOne({ merchantId: kiosk.merchantId }).lean()
      }
    } catch {}
  }

  if (!kiosk) {
    kiosk = fallbackKiosks.find((k: any) => (k.kioskId || k.id) === cleanId)
  }
  if (!merchant) {
    merchant = fallbackMerchants.find((m: any) => m.kioskId === cleanId || (kiosk?.merchantId && m.merchantId === kiosk.merchantId))
  }

  const gateway = (kiosk?.paymentGateway || merchant?.paymentGateway || 'upiexpress') as 'upiexpress' | 'razorpay'
  const upiExpressApiKey = kiosk?.upiExpressApiKey || merchant?.upiExpressApiKey || (process.env.UPIEXPRESS_API_KEY || '').trim()
  const razorpayKeyId = kiosk?.razorpayKeyId || merchant?.razorpayKeyId || ''
  const razorpayKeySecret = kiosk?.razorpayKeySecret || merchant?.razorpayKeySecret || ''

  return {
    gateway,
    upiExpressApiKey,
    razorpayKeyId,
    razorpayKeySecret,
  }
}

/**
 * Helper to initiate payment on a kiosk session (Razorpay link or UPI Express dynamic order).
 */
export async function initiatePaymentForSession(
  session: KioskSession,
  req?: Request,
  amount?: number
): Promise<void> {
  // Amount determination: Use fresh amount if provided, or existing session amount, with minimum 2
  const reqAmount = typeof amount === 'number' && amount > 0 ? amount : undefined
  const existingAmount = typeof session.amount === 'number' && session.amount > 0 ? session.amount : undefined
  const effectiveAmount = reqAmount || existingAmount || 2
  const startEpoch = session.paymentEpoch || 0

  // An active QR is valid only if it was explicitly generated for this exact amount
  const isQrCurrentForAmount =
    Boolean(session.upiQrValue) &&
    typeof session.qrAmount === 'number' &&
    Math.abs(session.qrAmount - effectiveAmount) <= 0.25

  session.amount = effectiveAmount

  // If session already has an active, valid UPI QR for this exact amount, reuse it without hitting gateway again!
  if (isQrCurrentForAmount && (session.upiIntentUrl || session.upiQrValue) && session.orderId) {
    const fresh = getSession(session.sessionId)
    if (fresh && (fresh.state === 'PRINTING' || fresh.state === 'DONE')) {
      console.log(`[KioskSession] 🛑 Session ${session.sessionId} is currently in ${fresh.state}. Skipping state override to PAYING.`)
      return
    }
    console.log(`[KioskSession] Reusing active dynamic UPI QR for session ${session.sessionId} (order ${session.orderId}) for ₹${effectiveAmount}`)
    session.state = 'PAYING'
    session.phase = `Scan QR code on kiosk display to pay ₹${effectiveAmount.toFixed(2)}`
    session.phaseStep = 5
    saveSession(session)
    syncSessionToOrder(session)
    return
  }

  // Amount has changed (or no valid QR exists): generate a brand new order with updated amount
  console.log(`[KioskSession] Amount changed or QR missing. Generating fresh order for session ${session.sessionId}: ₹${effectiveAmount} (previous qrAmount: ₹${session.qrAmount ?? 'none'})`)
  session.qrAmount = effectiveAmount
  session.upiQrValue = ''
  session.upiIntentUrl = ''
  session.paymentUrl = ''
  session.paymentError = undefined

  // Preserve existing orderId if one is already associated with this session or request!
  const incomingOrderId = (req as any)?.body?.orderId
  const orderId = session.orderId || incomingOrderId || generateUniqueClientTxnId('PB')
  const otp = session.otp || Math.floor(1000 + Math.random() * 9000).toString()

  session.orderId = orderId
  session.otp = otp

  const freshBeforeGate = getSession(session.sessionId)
  if (freshBeforeGate && (freshBeforeGate.state === 'PRINTING' || freshBeforeGate.state === 'DONE')) {
    console.log(`[KioskSession] 🛑 Session ${session.sessionId} is currently in ${freshBeforeGate.state}. Not generating payment before user proceeds to pay.`)
    return
  }

  const gwInfo = await resolveGatewayForKiosk(session.kioskId)
  session.gateway = gwInfo.gateway

  if (gwInfo.gateway === 'razorpay') {
    // ── RAZORPAY DYNAMIC PAYMENT ORDER / LINK ──
    const keyId = gwInfo.razorpayKeyId
    const keySecret = gwInfo.razorpayKeySecret

    if (!keyId || !keySecret) {
      const err = `Razorpay credentials are not configured for Station ${session.kioskId}. Please contact the merchant.`
      const rec = '1. Enter Razorpay Key ID & Key Secret in Merchant Settings.\n2. Ensure API permissions are enabled.\n3. Click "Start Printer Again" in Kiosk Status.'
      session.paymentError = err
      session.merchantError = err
      session.merchantRecommendation = rec
      session.upiQrValue = ''
      session.upiIntentUrl = ''
      session.paymentUrl = ''
      session.qrAmount = undefined
      console.warn(`[KioskSession] Razorpay credentials missing for kiosk ${session.kioskId}`)
    } else {
      session.paymentError = undefined
      session.merchantError = undefined
      session.merchantRecommendation = undefined
      let link: any = null
      let lastErr = ''
      const MAX_ATTEMPTS = 3

      try {
        const RazorpayModule: any = await import('razorpay')
        const Razorpay = RazorpayModule.default ?? RazorpayModule
        const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret })
        const amountPaise = Math.round(effectiveAmount * 100)

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            link = await rzp.paymentLink.create({
              amount: amountPaise,
              currency: 'INR',
              accept_partial: false,
              reference_id: orderId,
              description: `PrintBooth Station ${session.kioskId} - Order ${orderId}`,
              customer: {
                name: 'Kiosk Customer',
                email: 'kiosk@printbooth.co.in',
                contact: '9999999999',
              },
              notify: { sms: false, email: false },
              notes: {
                orderId,
                kioskId: session.kioskId,
              },
            })
            if (link?.short_url) {
              break
            }
          } catch (rErr: any) {
            lastErr = rErr?.message || 'Razorpay order creation failed'
            console.warn(`[KioskSession] Razorpay attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastErr}`)
            if (attempt < MAX_ATTEMPTS) {
              await new Promise((resolve) => setTimeout(resolve, attempt * 600))
            }
          }
        }

        if (link?.short_url) {
          session.paymentUrl = link.short_url
          session.upiQrValue = link.short_url
          session.upiIntentUrl = link.short_url
          session.qrAmount = effectiveAmount
          session.paymentError = undefined
          session.merchantError = undefined
          session.merchantRecommendation = undefined

          if (isDbConnected()) {
            try {
              await Payment.create({
                paymentId: `PAY-${Date.now().toString().slice(-8)}`,
                razorpayOrderId: link.id,
                orderId,
                amount: effectiveAmount,
                currency: 'INR',
                status: 'CREATED',
                description: `Razorpay payment link for ${orderId}`,
                notes: { gateway: 'razorpay', orderId, kioskId: session.kioskId },
              })
            } catch {}
          }
        } else {
          const merchantError = `Razorpay Payment Gateway Error: ${lastErr || 'Order creation failed after 3 attempts'}`
          const merchantRecommendation =
            '1. Verify Razorpay Key ID and Key Secret in Merchant Settings.\n2. Ensure your Razorpay account is in Live Mode and KYC is active.\n3. Verify API Key permissions include Order Creation.\n4. Once verified, click "Start Printer Again" in Kiosk Status to resume printer operations.'

          session.upiQrValue = ''
          session.upiIntentUrl = ''
          session.paymentUrl = ''
          session.qrAmount = undefined
          session.paymentError = merchantError
          session.merchantError = merchantError
          session.merchantRecommendation = merchantRecommendation
        }
      } catch (err: any) {
        session.upiQrValue = ''
        session.upiIntentUrl = ''
        session.paymentUrl = ''
        session.qrAmount = undefined
        const merchantError = `Razorpay Exception: ${err?.message || 'Failed to initialize payment order.'}`
        const merchantRecommendation =
          '1. Verify Razorpay credentials in Merchant Settings.\n2. Check network connectivity.\n3. Click "Start Printer Again" in Kiosk Status.'
        session.paymentError = merchantError
        session.merchantError = merchantError
        session.merchantRecommendation = merchantRecommendation
        console.warn(`[KioskSession] Error generating Razorpay payment link for ${session.kioskId}:`, err)
      }
    }
  } else {
    // ── UPI EXPRESS DYNAMIC ORDER & DYNAMIC QR ──
    if (!gwInfo.upiExpressApiKey) {
      const err = `UPI Express API Key is not configured for Station ${session.kioskId}. Please contact the merchant.`
      const rec = '1. Go to Merchant Settings.\n2. Enter your UPI Express API Key and UPI VPA ID.\n3. Save settings and click "Start Printer Again" in Kiosk Status.'
      session.paymentError = err
      session.merchantError = err
      session.merchantRecommendation = rec
      session.upiQrValue = ''
      session.upiIntentUrl = ''
      session.paymentUrl = ''
      session.qrAmount = undefined
      console.warn(`[KioskSession] UPI Express API key missing for kiosk ${session.kioskId}`)
    } else {
      session.paymentError = undefined
      session.merchantError = undefined
      session.merchantRecommendation = undefined
      try {
        const upiResult = await createUpiExpressOrder(
          {
            apiKey: gwInfo.upiExpressApiKey,
            kioskId: session.kioskId,
            clientTxnId: orderId,
            amount: effectiveAmount,
            customerName: 'Kiosk Customer',
            customerEmail: 'kiosk@printbooth.co.in',
            customerMobile: '9999999999',
            note: `PrintBooth Station ${session.kioskId} - ${orderId}`,
            skipReachabilityCheck: true,
          },
          req
        )

        if (upiResult.success && upiResult.data && upiResult.data.upiIntentUrl) {
          session.upiQrValue = upiResult.data.upiIntentUrl
          session.upiIntentUrl = upiResult.data.upiIntentUrl
          session.paymentUrl = upiResult.data.paymentUrl || ''
          session.orderId = upiResult.data.clientTxnId || orderId
          session.qrAmount = effectiveAmount
          session.paymentError = undefined
          session.merchantError = undefined
          session.merchantRecommendation = undefined
        } else {
          session.upiQrValue = ''
          session.upiIntentUrl = ''
          session.qrAmount = undefined
          session.paymentError = upiResult.merchantError || upiResult.error || `Payment gateway credentials are not configured properly for Station ${session.kioskId}.`
          session.merchantError = upiResult.merchantError
          session.merchantRecommendation = upiResult.merchantRecommendation
          console.warn(`[KioskSession] UPI Express order creation could not obtain upiintent:`, upiResult.error)
        }
      } catch (err: any) {
        session.upiQrValue = ''
        session.upiIntentUrl = ''
        session.qrAmount = undefined
        const merchantError = `UPI Express Exception: ${err?.message || 'Failed to initialize UPI Express payment order.'}`
        const merchantRecommendation =
          '1. Verify UPI Express credentials in Merchant Settings.\n2. Ensure UPI Express plan is active.\n3. Click "Start Printer Again" in Kiosk Status.'
        session.paymentError = merchantError
        session.merchantError = merchantError
        session.merchantRecommendation = merchantRecommendation
        console.warn(`[KioskSession] Error generating UPI Express QR for ${session.kioskId}:`, err)
      }
    }
  }

  const freshAfterGate = getSession(session.sessionId)
  if (freshAfterGate && (freshAfterGate.state === 'PRINTING' || freshAfterGate.state === 'DONE' || (typeof freshAfterGate.paymentEpoch === 'number' && freshAfterGate.paymentEpoch !== startEpoch))) {
    console.log(`[KioskSession] 🛑 Session ${session.sessionId} moved to ${freshAfterGate.state} (or epoch changed) during gateway generation. Preserving user phase!`)
    freshAfterGate.orderId = session.orderId
    freshAfterGate.otp = session.otp
    freshAfterGate.gateway = session.gateway
    saveSession(freshAfterGate)
    syncSessionToOrder(freshAfterGate)
    return
  }

  if (session.state === 'PRINTING' || session.state === 'DONE') {
    console.log(`[KioskSession] 🛑 Session ${session.sessionId} is already ${session.state}. Skipping state reset to PAYING.`)
    return
  }

  session.state = 'PAYING'
  session.phase = `Scan QR code on kiosk display to pay ₹${effectiveAmount.toFixed(2)}`
  session.phaseStep = 5

  saveSession(session)
  syncSessionToOrder(session)
}

/**
 * POST /api/kiosk-sessions/:sessionId/pay
 * Called by kiosk touchscreen when moving to or completing payment.
 */
kioskSessionsRouter.post('/:sessionId/pay', async (req: Request, res: Response) => {
  const { sessionId } = req.params
  let session = getSession(sessionId)

  if (!session) {
    const fallbackKioskId = String(
      req.body?.kioskId ||
      (sessionId.startsWith('init-') ? sessionId.replace('init-', '') : sessionId) ||
      'PB-001'
    ).toUpperCase().trim()

    session = getActiveSession(fallbackKioskId)
    if (!session && fallbackKioskId) {
      session = generateSession(fallbackKioskId, resolveWebBaseUrl(req))
    }
  }

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' })
  }

  if (session.state === 'DONE' || session.state === 'CANCELLED' || Date.now() > session.expiresAt) {
    return res.status(410).json({
      success: false,
      error: 'SESSION_EXPIRED',
      code: 'SESSION_EXPIRED',
      message: 'This print session has expired or ended. Please scan the current live QR code on the kiosk screen.',
    })
  }

  if (session.state === 'PRINTING') {
    return res.json({
      success: true,
      state: 'PRINTING',
      message: 'Session is already in PRINTING',
      session,
    })
  }

  const { amount, orderId: reqOrderId } = req.body
  if (reqOrderId && !session.orderId) {
    session.orderId = reqOrderId
  }

  // Explicit /pay transitions session into PAYING state
  session.state = 'PAYING'
  session.phase = 'Scan QR code on kiosk display to pay'
  session.phaseStep = 5
  saveSession(session)

  await initiatePaymentForSession(session, req, amount)

  res.json({
    success: true,
    orderId: session.orderId,
    otp: session.otp,
    amount: session.amount,
    gateway: session.gateway,
    upiQrValue: session.upiQrValue,
    paymentUrl: session.paymentUrl,
    upiIntentUrl: session.upiIntentUrl,
    merchantUpiId: session.merchantUpiId,
    session,
  })
})

/**
 * POST /api/kiosk-sessions/:sessionId/simulate-payment
 * POST /api/kiosk-sessions/kiosk/:kioskId/simulate-payment
 * POST /api/kiosk-sessions/simulate-payment
 * Simulates payment confirmation for testing the physical print pipeline without charging real money.
 */
const handleSimulatePayment = (req: Request, res: Response) => {
  const { sessionId: paramSessionId, kioskId: paramKioskId } = req.params
  let session: KioskSession | null = null

  if (paramSessionId) {
    session = getSession(paramSessionId)
  }
  if (!session && req.body?.sessionId) {
    session = getSession(req.body.sessionId)
  }
  if (!session && (paramKioskId || req.body?.kioskId)) {
    const kid = String(paramKioskId || req.body.kioskId).toUpperCase().trim()
    session = getActiveSession(kid)
  }
  if (!session && req.body?.orderId) {
    for (const s of sessions.values()) {
      if (s.orderId === req.body.orderId) {
        session = s
        break
      }
    }
  }

  const effectiveKioskId = (session?.kioskId || paramKioskId || req.body?.kioskId || 'PB-001').toUpperCase().trim()
  const effectiveOrderId = session?.orderId || req.body?.orderId || `ORD-SIM-${Date.now().toString().slice(-6)}`

  if (session) {
    session.orderId = effectiveOrderId
    session.state = 'PRINTING'
    session.phase = 'Simulated payment confirmed! Printing document on Brother hardware…'
    session.phaseStep = 5
    saveSession(session)
  }

  console.log(`[KioskSession] 🧪 SIMULATED PAYMENT CONFIRMED: orderId=${effectiveOrderId}, kioskId=${effectiveKioskId}, session=${session?.sessionId || 'NONE'}`)

  // 1. Broadcast payment captured to WebSocket relay for kiosk screen & web client
  relayPaymentCaptured(effectiveOrderId, effectiveKioskId, {
    method: 'SIMULATED',
    status: 'PAID',
    isSimulated: true,
    amount: session?.amount || req.body?.amount || 0,
    timestamp: Date.now(),
  })

  // 2. Dispatch hardware print job via triggerSessionPrintOnPayment
  const dispatched = triggerSessionPrintOnPayment(effectiveOrderId, effectiveKioskId, {
    method: 'SIMULATED',
    isSuccess: true,
  })

  res.json({
    success: true,
    message: 'Simulated payment confirmed! Hardware print job dispatched.',
    orderId: effectiveOrderId,
    kioskId: effectiveKioskId,
    dispatched,
    session,
  })
}

kioskSessionsRouter.post('/:sessionId/simulate-payment', handleSimulatePayment)
kioskSessionsRouter.post('/kiosk/:kioskId/simulate-payment', handleSimulatePayment)
kioskSessionsRouter.post('/simulate-payment', handleSimulatePayment)

/**
 * POST /api/kiosk-sessions/:sessionId/execute-print
 * Dispatches physical/relay print job when payment is confirmed on kiosk display.
 */
kioskSessionsRouter.post('/:sessionId/execute-print', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' })
  }

  // Idempotency: if already printing or done, don't re-dispatch print jobs!
  if (session.state === 'PRINTING' || session.state === 'DONE') {
    console.log(`[KioskSession] Session ${sessionId} already in state '${session.state}', skipping duplicate execute-print dispatch`)
    return res.json({ success: true, message: 'Already printing or complete', state: session.state })
  }

  const orderId = session.orderId || `ORD-${Date.now().toString().slice(-6)}`
  session.orderId = orderId

  const files = session.files && session.files.length > 0 ? session.files : (session.document?.files || [])
  const isMultiFile = Array.isArray(files) && files.length > 1

  const allCandidateFileNames = [
    ...(session.fileName ? [session.fileName] : []),
    ...(session.document?.fileName ? [session.document.fileName] : []),
    ...files.map((f: any) => f.fileName || ''),
  ]
  const isPptSession = allCandidateFileNames.some(fn => /\.(pptx?|ppsx?)$/i.test(fn))
  const isDocxSession = allCandidateFileNames.some(fn => /\.(docx?|doc)$/i.test(fn))

  session.state = 'PRINTING'
  session.phase = isPptSession
    ? 'Payment confirmed! Processing PPT into print PDF…'
    : isDocxSession
    ? 'Payment confirmed! Processing DOCX into print PDF…'
    : 'Payment confirmed! Printing document on Brother hardware…'
  session.phaseStep = 5

  if (isMultiFile) {
    console.log(`[KioskSession] 🖨️ Multi-file print execution triggered for session ${sessionId} (${files.length} files)`)
    for (let idx = 0; idx < files.length; idx++) {
      const f = files[idx]
      const subOrderId = `${orderId}_sub_${idx + 1}`
      const fileSettings = f.settings || {}
      const fCopies = Math.max(1, Number(fileSettings.copies || f.copies || session.settings?.copies || 1))
      const fColour = String(fileSettings.colour || f.colour || session.settings?.colour || 'BW').toUpperCase()
      const fDuplex = String(fileSettings.duplex || f.duplex || session.settings?.duplex || 'SINGLE').toUpperCase()
      const fPageRange = resolveEffectivePageRange(
        fileSettings.selectedPages,
        fileSettings.pages,
        fileSettings.pageRange,
        f.selectedPages,
        f.pages,
        f.pageRange,
        session.settings?.selectedPages,
        session.settings?.pages,
        session.settings?.pageRange,
      )
      const fPaperSize = String(fileSettings.paperSize || f.paperSize || session.settings?.paperSize || 'A4').trim()
      const fScaling = String(fileSettings.scaling || f.scaling || 'FIT').trim()
      const fPagesPerSheet = Number(fileSettings.pagesPerSheet || f.pagesPerSheet || 1)
      const fOrientation = String(fileSettings.orientation || f.orientation || 'AUTO').toUpperCase().trim()
      const fTotalPages = Math.max(1, Number(f.pageCount || 1))

      const subJobState: PrintJobState = {
        orderId: subOrderId,
        masterOrderId: orderId,
        orderNumber: session.orderNumber || orderId,
        releasePin: session.releasePin || session.otp || session.pickupCode,
        fileIndex: idx + 1,
        totalFiles: files.length,
        fileName: f.fileName || `Document_${idx + 1}.pdf`,
        filePath: f.filePath || (session.files && session.files[idx]?.filePath) || (idx === 0 ? session.document?.filePath : '') || path.resolve(__dirname, '../../../../test_sample.pdf'),
        fileUrl: f.fileUrl || (session.files && session.files[idx]?.fileUrl) || `/api/print/download/${subOrderId}`,
        copies: fCopies,
        colourMode: fColour === 'COLOUR' ? 'COLOUR' : 'BW',
        pageRange: fPageRange,
        duplex: fDuplex,
        paperSize: fPaperSize,
        scaling: fScaling,
        pagesPerSheet: fPagesPerSheet,
        orientation: fOrientation,
        dpi: fileSettings.dpi || f.dpi || '600',
        pageColours: fileSettings.pageColours || f.pageColours,
        pageCopies: fileSettings.pageCopies || f.pageCopies,
        status: 'PRINTING',
        printedPages: 0,
        totalPages: fTotalPages,
        percent: 0,
        startedAt: Date.now(),
        kioskId: session.kioskId,
      }

      syncJobState(subJobState)
      try {
        dispatchPrintJob(subJobState)
      } catch (err: any) {
        console.error(`[KioskSession] Error dispatching sub print job ${subOrderId}:`, err)
      }
    }
  } else {
    const f0: any = (files && files.length > 0) ? files[0] : (session.files && session.files.length > 0 ? session.files[0] : (session.document?.files && session.document.files.length > 0 ? session.document.files[0] : null))
    const f0Settings: any = f0?.settings || {}
    const fileName = f0?.fileName || session.document?.fileName || session.fileName || 'PrintBooth_Document.pdf'
    const filePath = f0?.filePath || session.document?.filePath || path.resolve(__dirname, '../../../../test_sample.pdf')
    const copies = session.settings?.copies || session.copies || f0Settings.copies || 1
    const colourMode = session.settings?.colour || session.colourMode || f0Settings.colour || 'BW'
    const duplex = session.settings?.duplex || f0Settings.duplex || 'SINGLE'
    const pageRange = resolveEffectivePageRange(
      f0Settings.selectedPages,
      f0Settings.pages,
      f0Settings.pageRange,
      f0?.selectedPages,
      f0?.pages,
      f0?.pageRange,
      session.settings?.selectedPages,
      session.settings?.pages,
      session.settings?.pageRange,
      session.document?.selectedPages,
      session.document?.pages,
      session.document?.pageRange,
      (session as any).selectedPages,
      (session as any).pages,
    )
    const totalPages = session.document?.pageCount || session.totalPages || f0?.pageCount || 1

    const jobState: PrintJobState = {
      orderId,
      orderNumber: session.orderNumber || orderId,
      releasePin: session.releasePin || session.otp || session.pickupCode,
      fileName,
      filePath,
      copies,
      colourMode,
      pageRange,
      duplex,
      paperSize: session.settings?.paperSize || 'A4',
      status: 'PRINTING',
      printedPages: 0,
      totalPages,
      percent: 0,
      startedAt: Date.now(),
      kioskId: session.kioskId,
    }

    syncJobState(jobState)
    try {
      dispatchPrintJob(jobState)
    } catch (err: any) {
      console.error(`[KioskSession] Error dispatching print job for ${sessionId}:`, err)
    }
  }

  saveSession(session)
  syncSessionToOrder(session)

  res.json({ success: true, orderId, state: session.state, message: 'Print job dispatched to printer' })
})

/**
 * POST /api/kiosk-sessions/:sessionId/complete
 * POST /api/kiosk-sessions/kiosk/:kioskId/complete
 * Marks job complete and shows collection screen.
 */
const handleCompleteKioskSession = (req: Request, res: Response) => {
  const { sessionId, kioskId: paramKioskId } = req.params
  let session = sessionId ? getSession(sessionId) : null
  if (!session && paramKioskId) {
    session = getActiveSession(paramKioskId.toUpperCase().trim())
  }
  if (!session && req.body?.kioskId) {
    session = getActiveSession(String(req.body.kioskId).toUpperCase().trim())
  }
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' })
  }

  session.state = 'DONE'
  session.phase = 'Print complete! Collect from tray.'
  session.phaseStep = 6
  session.completedAt = Date.now()

  saveSession(session)
  syncSessionToOrder(session)
  res.json({ success: true, state: session.state, session })
}

kioskSessionsRouter.post('/:sessionId/complete', handleCompleteKioskSession)
kioskSessionsRouter.post('/kiosk/:kioskId/complete', handleCompleteKioskSession)

/**
 * POST /api/kiosk-sessions/:sessionId/reset
 * POST /api/kiosk-sessions/kiosk/:kioskId/reset
 * Resets or generates fresh session after collection.
 */
const handleResetKioskSession = (req: Request, res: Response) => {
  const { sessionId, kioskId: paramKioskId } = req.params
  let session = sessionId ? getSession(sessionId) : null
  const kioskId = (paramKioskId || session?.kioskId || req.body?.kioskId || 'PB-001').toUpperCase().trim()

  if (session) {
    session.state = 'DONE'
    session.completedAt = Date.now()
    saveSession(session)
  }

  const newSession = generateSession(kioskId, resolveWebBaseUrl(req))
  activeSessionByKiosk.set(kioskId, newSession.sessionId)
  res.json({ success: true, session: newSession })
}

kioskSessionsRouter.post('/:sessionId/reset', handleResetKioskSession)
kioskSessionsRouter.post('/kiosk/:kioskId/reset', handleResetKioskSession)

/**
 * GET /api/kiosk-sessions/:sessionId/status
 * Direct status check by sessionId (used by web app to confirm session is still active)
 */
kioskSessionsRouter.get('/:sessionId/status', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)

  if (!session) {
    return res.status(404).json({ success: false, isExpired: true, error: 'Session not found or expired' })
  }

  const isPrePrintState = session.state !== 'PRINTING' && session.state !== 'DONE' && session.state !== 'CANCELLED' && session.state !== 'EXPIRED'
  const lastPhoneActivity = Math.max(
    session.lastPhoneActivityAt || 0,
    session.currentSectionEnteredAt || 0,
    session.claimedAt || 0,
    session.createdAt || 0
  )
  const elapsedPhoneInactivity = Date.now() - lastPhoneActivity
  const remainingInactivityMs = Math.max(0, SECTION_INACTIVITY_TIMEOUT_MS - elapsedPhoneInactivity)
  const inactivityRemainingSec = Math.ceil(remainingInactivityMs / 1000)
  const resetAt = lastPhoneActivity + SECTION_INACTIVITY_TIMEOUT_MS
  const isInactiveTimeout = isPrePrintState && Boolean(lastPhoneActivity) && (elapsedPhoneInactivity >= SECTION_INACTIVITY_TIMEOUT_MS)

  if (isInactiveTimeout && session.state !== 'EXPIRED') {
    session.state = 'EXPIRED'
    session.expiredReason = 'INACTIVITY_TIMEOUT'
    session.completedAt = Date.now()
    saveSession(session)
    if (session.kioskId) {
      activeSessionByKiosk.delete(session.kioskId)
    }
  }

  const isExpired = session.state === 'EXPIRED' || (session.state !== 'QR_READY' && session.state !== 'DONE' && Date.now() > session.expiresAt)
  const isInactiveWarning = isPrePrintState && inactivityRemainingSec <= 15 && inactivityRemainingSec > 0

  res.json({
    success: true,
    sessionId,
    state: session.state,
    phase: session.phase,
    phaseStep: session.phaseStep,
    isExpired,
    expiredReason: session.expiredReason,
    expiresAt: session.expiresAt,
    inactivityRemainingSec: isPrePrintState ? inactivityRemainingSec : 60,
    resetAt: isPrePrintState ? resetAt : Date.now() + SECTION_INACTIVITY_TIMEOUT_MS,
    isInactiveWarning,
    document: session.document,
    files: session.files || session.document?.files || [],
    settings: session.settings,
    otp: session.otp,
    orderId: session.orderId,
    upiQrValue: session.upiQrValue,
    paymentUrl: session.paymentUrl,
    upiIntentUrl: session.upiIntentUrl,
    merchantUpiId: session.merchantUpiId,
    gateway: session.gateway,
  })
})

/**
 * POST /api/kiosk-sessions/:sessionId/expire
 * Explicitly expires a session (e.g. when 1-minute inactivity timeout fires on kiosk or phone).
 */
kioskSessionsRouter.post('/:sessionId/expire', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)

  if (session) {
    session.state = 'EXPIRED'
    session.expiredReason = req.body?.reason || 'INACTIVITY_TIMEOUT'
    session.completedAt = Date.now()
    saveSession(session)
    if (session.kioskId) {
      activeSessionByKiosk.delete(session.kioskId)
    }
    console.log(`[KioskSession] ⏱️ Session ${sessionId} marked as EXPIRED (reason: ${session.expiredReason})`)
  }

  res.json({ success: true, state: 'EXPIRED' })
})

/**
 * POST /api/kiosk-sessions/:sessionId/activity
 * Records user activity (from kiosk touchscreen or phone interaction).
 */
kioskSessionsRouter.post('/:sessionId/activity', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)

  if (session && session.state !== 'DONE' && session.state !== 'EXPIRED') {
    const now = Date.now()
    session.lastActivityAt = now
    if (req.body?.source === 'phone') {
      session.lastPhoneActivityAt = now
      session.phoneDisconnected = false
    }
    saveSession(session)
    return res.json({ success: true, lastActivityAt: now })
  }

  res.json({ success: false, isExpired: true, error: 'Session not active' })
})

/**
 * POST /api/kiosk-sessions/:sessionId/cancel
 * Cancel/Reset current session and allow immediate fresh upload.
 */
kioskSessionsRouter.post('/:sessionId/cancel', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)

  if (session) {
    session.state = 'CANCELLED'
    session.completedAt = Date.now()
    session.document = undefined
    saveSession(session)
    if (session.kioskId) {
      activeSessionByKiosk.delete(session.kioskId)
    }
    console.log(`[KioskSession] ✗ Cancelled session ${sessionId}`)
  }

  res.json({ success: true, message: 'Session cancelled' })
})

/**
 * DELETE /api/kiosk-sessions/:sessionId
 * Kiosk can manually invalidate a session (e.g., user walked away).
 */
kioskSessionsRouter.delete('/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' })
  }

  session.state = 'DONE'
  session.completedAt = Date.now()
  session.document = undefined
  saveSession(session)
  if (session.kioskId) {
    activeSessionByKiosk.delete(session.kioskId)
  }

  console.log(`[KioskSession] ✗ Invalidated ${sessionId}`)

  res.json({ success: true, message: 'Session invalidated' })
})

// ── Exported Service Helpers (Called by print.ts on hardware/queue events) ──

/**
 * Called by print.ts when a valid release PIN/OTP is submitted on kiosk.
 * Advances session to PRINTING state so kiosk display immediately shows printing progress.
 */
export function advanceSessionOnPinVerified(kioskId: string, _pin: string, orderId?: string): void {
  const normKiosk = kioskId.toUpperCase()
  const session = getActiveSession(normKiosk)
  if (!session) return

  session.state = 'PRINTING'
  session.phase = 'Printing your document…'
  session.phaseStep = 5
  if (orderId) session.orderId = orderId
  saveSession(session)
  console.log(`[KioskSession] ➔ Session ${session.sessionId} advanced to PRINTING via PIN verify on kiosk ${normKiosk}`)
}

/**
 * Called when hardware printing completes.
 * Advances session to DONE state, triggering auto-rotation to next encrypted QR.
 */
export function completeKioskSession(kioskId: string, orderId?: string): void {
  const normKiosk = kioskId.toUpperCase()
  const session = getActiveSession(normKiosk)
  if (!session) return

  session.state = 'DONE'
  session.phase = 'Print complete!'
  session.phaseStep = 6
  session.completedAt = Date.now()
  if (orderId) session.orderId = orderId
  saveSession(session)
  console.log(`[KioskSession] ✓ Session ${session.sessionId} completed on kiosk ${normKiosk}`)
}

/**
 * Automatically triggers hardware printing for an active kiosk session
 * when payment confirmation is received via UPI Express / Razorpay webhook or status check.
 */
export function triggerSessionPrintOnPayment(orderId: string, kioskId?: string, paymentDetails?: any): boolean {
  if (!orderId && !kioskId) return false

  console.log(`[KioskSession] ⚡ triggerSessionPrintOnPayment invoked: orderId=${orderId}, kioskId=${kioskId || 'N/A'}`)

  // 1. Locate session: try exact orderId, partial match, or kioskId
  let targetSession: KioskSession | null = null

  if (orderId) {
    for (const s of sessions.values()) {
      if (s.orderId === orderId || (s.sessionId && orderId.includes(s.sessionId.slice(-6)))) {
        targetSession = s
        break
      }
    }
  }

  if (!targetSession && kioskId) {
    const active = getActiveSession(kioskId.trim().toUpperCase())
    if (active && ['PAYING', 'REVIEWING', 'CONFIGURING', 'CONFIRMING', 'CLAIMED', 'UPLOADING'].includes(active.state)) {
      targetSession = active
    }
  }

  // Fallback: check most recently active session in PAYING or REVIEWING state
  if (!targetSession) {
    for (const s of sessions.values()) {
      if (s.state === 'PAYING' || s.state === 'REVIEWING') {
        targetSession = s
        break
      }
    }
  }

  if (!targetSession) {
    console.warn(`[KioskSession] No active session found to auto-print for order ${orderId} (kiosk ${kioskId})`)
    return false
  }

  // Idempotency: if already printing or done, don't re-dispatch
  if (targetSession.state === 'PRINTING' || targetSession.state === 'DONE') {
    console.log(`[KioskSession] Session ${targetSession.sessionId} already in state ${targetSession.state}, skipping duplicate print dispatch`)
    return true
  }

  const effectiveOrderId = orderId || targetSession.orderId || `ORD-${Date.now().toString().slice(-6)}`
  targetSession.orderId = effectiveOrderId

  const files = targetSession.files && targetSession.files.length > 0 ? targetSession.files : (targetSession.document?.files || [])
  const isMultiFile = Array.isArray(files) && files.length > 1

  const allCandidateFileNames = [
    ...(targetSession.fileName ? [targetSession.fileName] : []),
    ...(targetSession.document?.fileName ? [targetSession.document.fileName] : []),
    ...files.map((f: any) => f.fileName || ''),
  ]
  const isPptSession = allCandidateFileNames.some(fn => /\.(pptx?|ppsx?)$/i.test(fn))
  const isDocxSession = allCandidateFileNames.some(fn => /\.(docx?|doc)$/i.test(fn))

  targetSession.state = 'PRINTING'
  targetSession.phase = isPptSession
    ? 'Payment confirmed! Processing PPT into print PDF…'
    : isDocxSession
    ? 'Payment confirmed! Processing DOCX into print PDF…'
    : 'Payment confirmed! Printing document on Brother hardware…'
  targetSession.phaseStep = 5

  if (isMultiFile) {
    console.log(`[KioskSession] 🖨️ AUTO-DISPATCHING MULTI-FILE PRINT on payment confirmed: session ${targetSession.sessionId} on kiosk ${targetSession.kioskId} (${files.length} files)`)
    for (let idx = 0; idx < files.length; idx++) {
      const f = files[idx]
      const subOrderId = `${effectiveOrderId}_sub_${idx + 1}`
      const fileSettings = f.settings || {}
      const fCopies = Math.max(1, Number(fileSettings.copies || f.copies || targetSession.settings?.copies || 1))
      const fColour = String(fileSettings.colour || f.colour || targetSession.settings?.colour || 'BW').toUpperCase()
      const fDuplex = String(fileSettings.duplex || f.duplex || targetSession.settings?.duplex || 'SINGLE').toUpperCase()
      const fPageRange = resolveEffectivePageRange(
        fileSettings.selectedPages,
        fileSettings.pages,
        fileSettings.pageRange,
        f.selectedPages,
        f.pages,
        f.pageRange,
        targetSession.settings?.selectedPages,
        targetSession.settings?.pages,
        targetSession.settings?.pageRange,
      )
      const fPaperSize = String(fileSettings.paperSize || f.paperSize || targetSession.settings?.paperSize || 'A4').trim()
      const fScaling = String(fileSettings.scaling || f.scaling || 'FIT').trim()
      const fPagesPerSheet = Number(fileSettings.pagesPerSheet || f.pagesPerSheet || 1)
      const fOrientation = String(fileSettings.orientation || f.orientation || 'AUTO').toUpperCase().trim()
      const fTotalPages = Math.max(1, Number(f.pageCount || 1))

      const subJobState: PrintJobState = {
        orderId: subOrderId,
        masterOrderId: effectiveOrderId,
        fileIndex: idx + 1,
        totalFiles: files.length,
        fileName: f.fileName || `Document_${idx + 1}.pdf`,
        filePath: f.filePath || (targetSession.files && targetSession.files[idx]?.filePath) || (idx === 0 ? targetSession.document?.filePath : '') || '',
        fileUrl: f.fileUrl || (targetSession.files && targetSession.files[idx]?.fileUrl) || `/api/print/download/${subOrderId}`,
        copies: fCopies,
        colourMode: fColour === 'COLOUR' ? 'COLOUR' : 'BW',
        pageRange: fPageRange,
        duplex: fDuplex,
        paperSize: fPaperSize,
        scaling: fScaling,
        pagesPerSheet: fPagesPerSheet,
        orientation: fOrientation,
        dpi: fileSettings.dpi || f.dpi || '600',
        pageColours: fileSettings.pageColours || f.pageColours,
        pageCopies: fileSettings.pageCopies || f.pageCopies,
        status: 'PRINTING',
        printedPages: 0,
        totalPages: fTotalPages,
        percent: 0,
        startedAt: Date.now(),
        kioskId: targetSession.kioskId,
      }

      const candPath = subJobState.filePath
      if (!candPath || !fs.existsSync(candPath)) {
        console.log(`[KioskSession] No physical document on server disk for subJob ${subOrderId}. Awaiting client upload via sendPrintJob...`)
        continue
      }

      syncJobState(subJobState)
      try {
        dispatchPrintJob(subJobState)
      } catch (err: any) {
        console.error(`[KioskSession] Error dispatching sub print job ${subOrderId}:`, err)
      }
    }
  } else {
    const f0: any = (files && files.length > 0) ? files[0] : (targetSession.files && targetSession.files.length > 0 ? targetSession.files[0] : (targetSession.document?.files && targetSession.document.files.length > 0 ? targetSession.document.files[0] : null))
    const f0Settings: any = f0?.settings || {}
    const sSettings: any = targetSession.settings || {}

    const fileName = f0?.fileName || targetSession.document?.fileName || targetSession.fileName || 'PrintBooth_Document.pdf'
    const filePath = f0?.filePath || targetSession.document?.filePath || ''
    const fileUrl = f0?.fileUrl || targetSession.document?.fileUrl || `/api/print/download/${effectiveOrderId}`

    if (!filePath || !fs.existsSync(filePath)) {
      console.log(`[KioskSession] No physical document on server disk for session ${targetSession.sessionId}. Awaiting client upload via sendPrintJob...`)
      return true
    }

    const copies = Math.max(1, Number(f0Settings.copies || f0?.copies || sSettings.copies || targetSession.copies || 1))
    const rawCol = String(f0Settings.colour || f0?.colour || sSettings.colour || targetSession.colourMode || 'BW').toUpperCase()
    const colourMode = (rawCol === 'COLOUR' || rawCol === 'COLOR') ? 'COLOUR' : 'BW'
    const duplex = String(f0Settings.duplex || f0?.duplex || sSettings.duplex || 'SINGLE').toUpperCase()
    const pageRange = resolveEffectivePageRange(
      f0Settings.selectedPages,
      f0Settings.pages,
      f0Settings.pageRange,
      f0?.selectedPages,
      f0?.pages,
      f0?.pageRange,
      sSettings.selectedPages,
      sSettings.pages,
      sSettings.pageRange,
      targetSession.document?.selectedPages,
      targetSession.document?.pages,
      targetSession.document?.pageRange,
      (targetSession as any).selectedPages,
      (targetSession as any).pages,
    )
    const paperSize = String(f0Settings.paperSize || sSettings.paperSize || 'A4').trim()
    const scaling = String(f0Settings.scaling || sSettings.scaling || 'FIT').trim()
    const pagesPerSheet = Number(f0Settings.pagesPerSheet || sSettings.pagesPerSheet || 1)
    const orientation = String(f0Settings.orientation || sSettings.orientation || 'AUTO').toUpperCase().trim()
    const dpi = String(f0Settings.dpi || sSettings.dpi || '600')
    const pageColours = f0Settings.pageColours || f0?.pageColours || sSettings.pageColours
    const pageCopies = f0Settings.pageCopies || f0?.pageCopies || sSettings.pageCopies
    const totalPages = Math.max(1, Number(f0?.pageCount || targetSession.document?.pageCount || targetSession.totalPages || 1))

    const jobState: PrintJobState = {
      orderId: effectiveOrderId,
      orderNumber: targetSession.orderNumber || effectiveOrderId,
      releasePin: targetSession.releasePin || targetSession.otp || targetSession.pickupCode,
      fileName,
      filePath,
      fileUrl,
      copies,
      colourMode,
      pageRange,
      duplex,
      paperSize,
      scaling,
      pagesPerSheet,
      orientation,
      dpi,
      pageColours,
      pageCopies,
      status: 'PRINTING',
      printedPages: 0,
      totalPages,
      percent: 0,
      startedAt: Date.now(),
      kioskId: targetSession.kioskId,
    }

    syncJobState(jobState)
    try {
      dispatchPrintJob(jobState)
    } catch (err: any) {
      console.error(`[KioskSession] Error in dispatchPrintJob for session ${targetSession.sessionId}:`, err)
    }
  }

  saveSession(targetSession)
  syncSessionToOrder(targetSession)

  console.log(`[KioskSession] 🖨️ AUTO-DISPATCHING PRINT on payment confirmed: session ${targetSession.sessionId} on kiosk ${targetSession.kioskId} (order ${effectiveOrderId})`)

  return true
}

/**
 * Searches in-memory kiosk sessions for a file path associated with the order ID, session ID, or short hash.
 * Also checks the active session on the specified kiosk if direct ID match is not found.
 */
export function findSessionFilePath(orderOrSessionId: string, kioskId?: string): string | null {
  if (!orderOrSessionId && !kioskId) return null
  const cleanId = orderOrSessionId ? (orderOrSessionId.includes('_sub_') ? orderOrSessionId.split('_sub_')[0] : orderOrSessionId) : ''
  const subIdx = orderOrSessionId && orderOrSessionId.includes('_sub_') ? (parseInt(orderOrSessionId.split('_sub_')[1], 10) - 1) : 0

  if (cleanId) {
    for (const s of sessions.values()) {
      const isMatch =
        s.orderId === orderOrSessionId ||
        s.orderId === cleanId ||
        s.orderNumber === orderOrSessionId ||
        s.orderNumber === cleanId ||
        s.sessionId === orderOrSessionId ||
        s.sessionId === cleanId ||
        (orderOrSessionId && orderOrSessionId.includes(s.sessionId.slice(-6))) ||
        (s.orderId && orderOrSessionId.includes(s.orderId)) ||
        (s.orderNumber && orderOrSessionId.includes(s.orderNumber))

      if (isMatch) {
        // Check multi-file array first if sub-index specified
        if (Array.isArray(s.files) && s.files.length > 0) {
          const targetFile = s.files[subIdx]
          if (targetFile?.filePath && fs.existsSync(targetFile.filePath)) {
            return targetFile.filePath
          }
          if (targetFile?.fileUrl && fs.existsSync(targetFile.fileUrl)) {
            return targetFile.fileUrl
          }
          if (targetFile?.fileName) {
            const cleanName = targetFile.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
            try {
              const uploads = fs.readdirSync(KIOSK_UPLOADS_DIR)
              const matched = uploads.find(u => u.includes(cleanName) || (u.includes(s.sessionId) && u.includes(cleanName.slice(0, 8))))
              if (matched) {
                const fullP = path.join(KIOSK_UPLOADS_DIR, matched)
                if (fs.existsSync(fullP) && fs.statSync(fullP).size > 0) return fullP
              }
            } catch {}
          }
          // Do NOT fall back to File 1 if this is a sub-job > 0
          if (subIdx > 0) {
            return null
          }
        }
        if (subIdx === 0) {
          if (s.document?.filePath && fs.existsSync(s.document.filePath)) {
            return s.document.filePath
          }
          if (s.files && s.files[0]?.filePath && fs.existsSync(s.files[0].filePath)) {
            return s.files[0].filePath
          }
        }
      }
    }
  }

  // Fallback: If kioskId provided, check active session on that station
  if (kioskId) {
    const active = getActiveSession(kioskId.trim().toUpperCase())
    if (active) {
      if (Array.isArray(active.files) && active.files.length > 0) {
        const targetFile = active.files[subIdx]
        if (targetFile?.filePath && fs.existsSync(targetFile.filePath)) {
          return targetFile.filePath
        }
        if (targetFile?.fileUrl && fs.existsSync(targetFile.fileUrl)) {
          return targetFile.fileUrl
        }
        if (targetFile?.fileName) {
          const cleanName = targetFile.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
          try {
            const uploads = fs.readdirSync(KIOSK_UPLOADS_DIR)
            const matched = uploads.find(u => u.includes(cleanName))
            if (matched) {
              const fullP = path.join(KIOSK_UPLOADS_DIR, matched)
              if (fs.existsSync(fullP) && fs.statSync(fullP).size > 0) return fullP
            }
          } catch {}
        }
        if (subIdx > 0) {
          return null
        }
      }
      if (subIdx === 0 && active.document?.filePath && fs.existsSync(active.document.filePath)) {
        return active.document.filePath
      }
    }
  }

  return null
}

