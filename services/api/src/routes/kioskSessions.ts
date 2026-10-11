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
import { fallbackKiosks } from '../fallbackData.js'
import { isDbConnected } from '../db.js'
import {
  createUpiExpressOrder,
  resolveUpiKeyForKiosk,
  resolveMerchantUpiIdForKiosk,
} from './upiexpress.js'

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
    fileSize: 100 * 1024 * 1024, // 100MB
    fieldSize: 50 * 1024 * 1024, // 50MB
  },
})

export interface KioskDocumentPreview {
  pageNumber: number
  url: string
  title?: string
}

export interface KioskDocumentData {
  fileName: string
  fileSize: number
  fileType: string
  pageCount: number
  filePath?: string
  fileUrl?: string
  pages?: KioskDocumentPreview[]
  uploadedAt: number
}

export interface KioskPrintSettingsData {
  colour: 'BW' | 'COLOUR'
  duplex: 'SINGLE' | 'DOUBLE'
  copies: number
  pageRange: string
  paperSize: string
  pricePerPage: number
  totalAmount: number
  settingsMode?: 'GLOBAL' | 'PER_PAGE'
  nUpLayout?: 1 | 2 | 4
  duplexBinding?: 'LONG_EDGE' | 'SHORT_EDGE'
  printDpi?: '600' | '1200'
  paperWeight?: '75GSM' | '100GSM'
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
  orderId?: string
  fileName?: string
  totalPages?: number
  copies?: number
  colourMode?: string
  amount?: number
  completedAt?: number
  document?: KioskDocumentData
  settings?: KioskPrintSettingsData
  claimSecret?: string   // Client claim secret ensuring only original scanner can resume
  // Progress data relayed from web app
  progressData?: Record<string, any>
  upiQrValue?: string
  paymentUrl?: string
  upiIntentUrl?: string
  merchantUpiId?: string
  gateway?: string
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

const SESSION_TTL_SECONDS = 5 * 60  // 5 minutes before auto-rotate
const SESSION_DONE_TTL_SECONDS = 30  // Keep DONE state visible briefly
const HMAC_SECRET = process.env.KIOSK_SESSION_SECRET || 'pb_kiosk_session_hmac_secret_2024'

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
  const cleanBase = webBaseUrl.replace(/\/+$/, '')
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
  return sessions.get(sessionId) || null
}

function saveSession(session: KioskSession) {
  sessions.set(session.sessionId, session)
  const ttl = session.state === 'DONE' ? SESSION_DONE_TTL_SECONDS : SESSION_TTL_SECONDS
  cacheSet(`ks:${session.sessionId}`, session, ttl + 60).catch(() => {})
}

function getActiveSession(kioskId: string): KioskSession | null {
  const id = activeSessionByKiosk.get(kioskId)
  if (!id) return null
  const s = getSession(id)
  if (!s) return null
  // Check if expired
  if (Date.now() > s.expiresAt && s.state !== 'DONE') {
    return null
  }
  return s
}

// Resolve web base URL from request or env
function resolveWebBaseUrl(req: Request): string {
  return (
    process.env.SITE_URL ||
    process.env.WEB_URL ||
    process.env.CLIENT_WEB_URL ||
    `http://${req.get('host') || 'localhost:5200'}`
  ).replace(/\/+$/, '')
}

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/kiosk-sessions/create
 * Called by kiosk UI to generate a new encrypted QR session.
 * Creates a fresh session; invalidates any previous session for this kiosk.
 */
kioskSessionsRouter.post('/create', (req: Request, res: Response) => {
  const kioskId = String(
    req.body?.kioskId || req.headers['x-kiosk-id'] || 'PB-001'
  ).toUpperCase().trim()

  const webBase = req.body?.webBaseUrl || resolveWebBaseUrl(req)
  const force = Boolean(req.body?.force)

  // If an active session is currently underway (e.g. uploading, reviewing, configuring, paying),
  // preserve it unless explicitly forced to rotate
  const prevId = activeSessionByKiosk.get(kioskId)
  if (prevId && !force) {
    const prev = sessions.get(prevId)
    if (prev && prev.state !== 'DONE' && Date.now() < prev.expiresAt) {
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

  // Check for expiry (rotate automatically in status response)
  const isExpired = Date.now() > session.expiresAt && session.state !== 'DONE'

  res.json({
    success: true,
    hasActiveSession: true,
    isExpired,
    session: {
      sessionId: session.sessionId,
      kioskId: session.kioskId,
      kioskVariant: session.kioskVariant || getKioskVariantSync(session.kioskId),
      token: session.token,
      qrUrl: session.progressData?.qrUrl,
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
      completedAt: session.completedAt,
      document: session.document,
      settings: session.settings,
      progressData: session.progressData,
      upiQrValue: session.upiQrValue,
      paymentUrl: session.paymentUrl,
      upiIntentUrl: session.upiIntentUrl,
      merchantUpiId: session.merchantUpiId,
      gateway: session.gateway,
    },
  })
})

/**
 * POST /api/kiosk-sessions/:token/claim
 * Called by the web app when user scans the QR.
 * First caller wins — subsequent callers get "session taken".
 */
kioskSessionsRouter.post('/:token/claim', (req: Request, res: Response) => {
  const { token } = req.params
  const clientIp = String(req.ip || req.socket?.remoteAddress || 'unknown')
  const clientClaimToken = String(
    req.body?.clientClaimToken || req.headers['x-client-claim-token'] || ''
  ).trim()

  const { valid, payload, error } = verifyToken(token)
  if (!valid || !payload) {
    return res.status(400).json({ success: false, error: error || 'Invalid token' })
  }

  const { sessionId, kioskId } = payload
  const session = getSession(sessionId)

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found. It may have expired.' })
  }

  if (session.state === 'DONE') {
    return res.status(410).json({
      success: false,
      error: 'SESSION_COMPLETED',
      code: 'SESSION_COMPLETED',
      message: 'This print session has already completed. Please scan the new QR code on screen.',
      kioskId: session.kioskId,
    })
  }

  if (Date.now() > session.expiresAt) {
    return res.status(410).json({
      success: false,
      error: 'SESSION_EXPIRED',
      code: 'SESSION_EXPIRED',
      message: 'Session has expired. Please scan the new QR code.',
      kioskId: session.kioskId,
    })
  }

  if (session.state !== 'QR_READY') {
    // Session is already claimed / in-flight!
    // Check if the current request is coming from the owner who originally claimed it
    const isOwner = Boolean(
      session.claimSecret &&
      clientClaimToken &&
      session.claimSecret === clientClaimToken
    )

    if (isOwner) {
      return res.json({
        success: true,
        isOwner: true,
        sessionId,
        kioskId,
        state: session.state,
        claimSecret: session.claimSecret,
        message: 'Session resumed.',
      })
    }

    // Another user or different device is attempting to access an active session!
    console.warn(`[KioskSession] ⚠️ Access blocked: Machine ${kioskId} (session ${sessionId}) is already in use by another user.`)
    return res.status(409).json({
      success: false,
      error: 'MACHINE_ALREADY_IN_USE',
      code: 'MACHINE_ALREADY_IN_USE',
      message: 'Machine already in use',
      kioskId: session.kioskId,
      state: session.state,
    })
  }

  // Claim the session for this user
  const assignedSecret = clientClaimToken || crypto.randomBytes(16).toString('hex')
  session.claimSecret = assignedSecret
  session.state = 'CLAIMED'
  session.claimedAt = Date.now()
  session.claimedIp = clientIp
  session.phase = 'User scanning and opening upload page…'
  session.phaseStep = 1
  saveSession(session)

  console.log(`[KioskSession] ✓ Claimed ${sessionId} by IP ${clientIp} for kiosk ${kioskId}`)

  res.json({
    success: true,
    isOwner: true,
    sessionId,
    kioskId,
    claimSecret: assignedSecret,
    message: 'Session claimed. You may now upload your document.',
  })
})

/**
 * POST /api/kiosk-sessions/:sessionId/progress
 * Called by the web app to push progress updates to the kiosk display.
 * Supports states: UPLOADING, CONFIGURING, PAYING, OTP_READY, PRINTING, DONE
 */
kioskSessionsRouter.post('/:sessionId/progress', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' })
  }

  const clientClaimToken = String(
    req.body?.clientClaimToken || req.headers['x-client-claim-token'] || ''
  ).trim()

  if (session.claimSecret && clientClaimToken && session.claimSecret !== clientClaimToken) {
    return res.status(409).json({
      success: false,
      error: 'MACHINE_ALREADY_IN_USE',
      code: 'MACHINE_ALREADY_IN_USE',
      message: 'Machine is already in use by another customer.',
    })
  }

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
  } = req.body

  // Validate state transitions
  const VALID_STATES: KioskSessionState[] = [
    'UPLOADING', 'CONFIRMING', 'CONFIGURING', 'REVIEWING', 'PAYING', 'OTP_READY', 'PRINTING', 'DONE'
  ]

  if (state && VALID_STATES.includes(state as KioskSessionState)) {
    session.state = state as KioskSessionState
  }

  if (phase) session.phase = phase
  if (typeof phaseStep === 'number') session.phaseStep = phaseStep
  if (otp) session.otp = otp
  if (orderId) session.orderId = orderId
  if (fileName) session.fileName = fileName
  if (typeof totalPages === 'number') session.totalPages = totalPages
  if (typeof copies === 'number') session.copies = copies
  if (colourMode) session.colourMode = colourMode
  if (typeof amount === 'number') session.amount = amount
  if (progressData) session.progressData = { ...session.progressData, ...progressData }
  if (settings && typeof settings === 'object') {
    session.settings = { ...session.settings, ...settings }
  }

  if (state === 'DONE') {
    session.completedAt = Date.now()
  }

  saveSession(session)

  console.log(`[KioskSession] ↑ Progress ${sessionId}: state=${session.state} phase="${session.phase}"`)

  res.json({ success: true, state: session.state })
})

/**
 * POST /api/kiosk-sessions/:sessionId/upload
 * Called by the mobile web app when user selects and uploads their file from phone.
 * Passes the document and pre-rendered preview pages to the kiosk display.
 */
kioskSessionsRouter.post('/:sessionId/upload', (req: Request, res: Response, next) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      console.error('[KioskSession] Multer upload error:', err)
      return res.status(400).json({
        success: false,
        error: err.code === 'LIMIT_FILE_SIZE'
          ? 'File too large (max 100MB)'
          : err.code === 'LIMIT_FIELD_VALUE'
          ? 'Form field value too large'
          : err.message || 'File upload failed',
      })
    }
    next()
  })
}, (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found or expired' })
  }

  const clientClaimToken = String(
    req.body?.clientClaimToken || req.headers['x-client-claim-token'] || ''
  ).trim()

  if (session.claimSecret && (!clientClaimToken || session.claimSecret !== clientClaimToken)) {
    return res.status(409).json({
      success: false,
      error: 'MACHINE_ALREADY_IN_USE',
      code: 'MACHINE_ALREADY_IN_USE',
      message: 'Machine is already in use by another customer.',
    })
  }

  const file = req.file
  const fileName = file?.originalname || req.body.fileName || 'Document.pdf'
  const fileSize = file?.size || Number(req.body.fileSize) || 0
  const fileType = req.body.fileType || 'pdf'
  const rawPageCount = Number(req.body.pageCount)

  let previews: KioskDocumentPreview[] = []
  if (req.body.previews) {
    try {
      const raw = typeof req.body.previews === 'string' ? JSON.parse(req.body.previews) : req.body.previews
      if (Array.isArray(raw)) {
        previews = raw.slice(0, 6).map((p: any, idx: number) => ({
          pageNumber: Number(p.pageNumber) || idx + 1,
          url: typeof p.url === 'string' ? (p.url.length > 250000 ? p.url.slice(0, 250000) : p.url) : '',
          title: String(p.title || `Page ${idx + 1}`),
        }))
      }
    } catch {}
  }

  const pageCount = Math.max(1, !isNaN(rawPageCount) && rawPageCount > 0 ? rawPageCount : (previews.length || 1))
  const filePath = file?.path || ''
  const fileUrl = file ? `/api/kiosk-sessions/${sessionId}/file` : undefined

  const docData: KioskDocumentData = {
    fileName,
    fileSize,
    fileType,
    pageCount,
    filePath,
    fileUrl,
    pages: previews,
    uploadedAt: Date.now(),
  }

  session.document = docData
  session.fileName = fileName
  session.totalPages = pageCount
  session.copies = session.copies || 1
  session.colourMode = session.colourMode || 'BW'
  session.state = 'CONFIRMING'
  session.phase = 'Document uploaded. Review document on mobile.'
  session.phaseStep = 2

  saveSession(session)

  console.log(`[KioskSession] 📄 Document "${fileName}" (${pageCount} pages) uploaded for session ${sessionId} on ${session.kioskId}`)

  res.json({
    success: true,
    sessionId,
    state: session.state,
    document: session.document,
    message: 'Document successfully transferred to kiosk screen.',
  })
})

/**
 * GET /api/kiosk-sessions/:sessionId/file
 * Downloads or serves the uploaded document for this kiosk session.
 */
kioskSessionsRouter.get('/:sessionId/file', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)
  if (!session || !session.document?.filePath || !fs.existsSync(session.document.filePath)) {
    const sample = path.resolve(__dirname, '../../../../test_sample.pdf')
    if (fs.existsSync(sample)) {
      return res.sendFile(sample)
    }
    return res.status(404).json({ error: 'File not found' })
  }
  res.sendFile(session.document.filePath)
})

/**
 * POST /api/kiosk-sessions/:sessionId/settings
 * Called by kiosk touchscreen when user configures print options (Colour, Sides, Copies, Pages).
 */
kioskSessionsRouter.post('/:sessionId/settings', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' })
  }

  const {
    colour,
    duplex,
    copies,
    pageRange,
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

  session.settings = {
    colour: colour === 'COLOUR' ? 'COLOUR' : 'BW',
    duplex: duplex === 'DOUBLE' ? 'DOUBLE' : 'SINGLE',
    copies: resolvedCopies,
    pageRange: pageRange || 'ALL',
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

  session.copies = session.settings.copies
  session.colourMode = session.settings.colour
  session.amount = session.settings.totalAmount

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
  } else {
    session.state = 'CONFIGURING'
    session.phase = 'Configuring print settings on mobile'
    session.phaseStep = 3
  }

  saveSession(session)
  res.json({ success: true, session })
})

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
    if (!session || !session.sessionId) return
    const orderId = session.orderId || `ORD-${session.sessionId.slice(-6)}`
    const orderNumber = `PB-2026-${orderId.replace(/[^0-9]/g, '').slice(-4) || Math.floor(1000 + Math.random() * 9000)}`
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
            amount,
            merchantCut,
            pickupCode: session.otp,
            releasePin: session.otp,
            otp: session.otp,
            customerIp: session.claimedIp || '127.0.0.1',
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

/**
 * POST /api/kiosk-sessions/:sessionId/pay
 * Called by kiosk touchscreen when moving to or completing payment.
 */
kioskSessionsRouter.post('/:sessionId/pay', async (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' })
  }

  const { amount } = req.body
  const orderId = session.orderId || `ORD-${Date.now().toString().slice(-6)}`
  const otp = session.otp || Math.floor(1000 + Math.random() * 9000).toString()

  session.orderId = orderId
  session.otp = otp
  if (typeof amount === 'number' && amount > 0) session.amount = amount
  session.state = 'PAYING'
  session.phase = 'Scan UPI QR code on kiosk display to pay'
  session.phaseStep = 4

  // Dynamically resolve merchant UPI Express API key and generate real order & dynamic QR
  try {
    const effectiveAmount = typeof session.amount === 'number' && session.amount > 0 ? session.amount : 2
    const upiResult = await createUpiExpressOrder(
      {
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

    if (upiResult.success && upiResult.data) {
      session.upiQrValue = upiResult.data.upiIntentUrl || upiResult.data.paymentUrl
      session.paymentUrl = upiResult.data.paymentUrl
      session.upiIntentUrl = upiResult.data.upiIntentUrl
      session.merchantUpiId = upiResult.data.merchantUpiId
      session.gateway = 'upiexpress'
    } else {
      const fallbackVpa = await resolveMerchantUpiIdForKiosk(session.kioskId)
      session.merchantUpiId = fallbackVpa
      session.upiQrValue = `upi://pay?pa=${encodeURIComponent(fallbackVpa)}&pn=${encodeURIComponent('PrintBooth ' + session.kioskId)}&am=${effectiveAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(orderId)}`
      session.gateway = 'upiexpress'
    }
  } catch (err) {
    console.warn('[KioskSession] Error generating UPI Express QR:', err)
  }

  saveSession(session)
  syncSessionToOrder(session)
  res.json({
    success: true,
    orderId,
    otp,
    upiQrValue: session.upiQrValue,
    paymentUrl: session.paymentUrl,
    upiIntentUrl: session.upiIntentUrl,
    merchantUpiId: session.merchantUpiId,
    session,
  })
})

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

  const orderId = session.orderId || `ORD-${Date.now().toString().slice(-6)}`
  session.orderId = orderId
  session.state = 'PRINTING'
  session.phase = 'Printing document on Brother hardware…'
  session.phaseStep = 5

  const fileName = session.document?.fileName || session.fileName || 'PrintBooth_Document.pdf'
  const filePath = session.document?.filePath || path.resolve(__dirname, '../../../../test_sample.pdf')
  const copies = session.settings?.copies || session.copies || 1
  const colourMode = session.settings?.colour || session.colourMode || 'BW'
  const duplex = session.settings?.duplex || 'SINGLE'
  const pageRange = session.settings?.pageRange || 'ALL'
  const totalPages = session.document?.pageCount || session.totalPages || 1

  const jobState: PrintJobState = {
    orderId,
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
  saveSession(session)
  syncSessionToOrder(session)

  try {
    dispatchPrintJob(jobState)
  } catch (err: any) {
    console.error(`[KioskSession] Error dispatching print job for ${sessionId}:`, err)
  }

  res.json({ success: true, orderId, state: session.state, message: 'Print job dispatched to printer' })
})

/**
 * POST /api/kiosk-sessions/:sessionId/complete
 * Marks job complete and shows collection screen.
 */
kioskSessionsRouter.post('/:sessionId/complete', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' })
  }

  session.state = 'DONE'
  session.phase = 'Print complete! Collect from tray.'
  session.phaseStep = 6
  session.completedAt = Date.now()

  saveSession(session)
  syncSessionToOrder(session)
  res.json({ success: true, state: session.state })
})

/**
 * POST /api/kiosk-sessions/:sessionId/reset
 * Resets or generates fresh session after collection.
 */
kioskSessionsRouter.post('/:sessionId/reset', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)
  if (session) {
    session.state = 'DONE'
    saveSession(session)
  }
  const kioskId = session?.kioskId || String(req.body?.kioskId || 'PB-001')
  const newSession = generateSession(kioskId, resolveWebBaseUrl(req))
  res.json({ success: true, session: newSession })
})

/**
 * GET /api/kiosk-sessions/:sessionId/status
 * Direct status check by sessionId (used by web app to confirm session is still active)
 */
kioskSessionsRouter.get('/:sessionId/status', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found or expired' })
  }

  const isExpired = Date.now() > session.expiresAt && session.state !== 'DONE'

  res.json({
    success: true,
    sessionId,
    state: session.state,
    phase: session.phase,
    phaseStep: session.phaseStep,
    isExpired,
    expiresAt: session.expiresAt,
    document: session.document,
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
 * POST /api/kiosk-sessions/:sessionId/cancel
 * Cancel/Reset current session and allow immediate fresh upload.
 */
kioskSessionsRouter.post('/:sessionId/cancel', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = getSession(sessionId)

  if (session) {
    session.state = 'DONE'
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
  targetSession.state = 'PRINTING'
  targetSession.phase = 'Payment confirmed! Printing document on Brother hardware…'
  targetSession.phaseStep = 5

  const fileName = targetSession.document?.fileName || targetSession.fileName || 'PrintBooth_Document.pdf'
  const filePath = targetSession.document?.filePath || path.resolve(__dirname, '../../../../test_sample.pdf')
  const copies = targetSession.settings?.copies || targetSession.copies || 1
  const colourMode = targetSession.settings?.colour || targetSession.colourMode || 'BW'
  const duplex = targetSession.settings?.duplex || 'SINGLE'
  const pageRange = targetSession.settings?.pageRange || 'ALL'
  const totalPages = targetSession.document?.pageCount || targetSession.totalPages || 1

  const jobState: PrintJobState = {
    orderId: effectiveOrderId,
    fileName,
    filePath,
    copies,
    colourMode,
    pageRange,
    duplex,
    paperSize: targetSession.settings?.paperSize || 'A4',
    status: 'PRINTING',
    printedPages: 0,
    totalPages,
    percent: 0,
    startedAt: Date.now(),
    kioskId: targetSession.kioskId,
  }

  syncJobState(jobState)
  saveSession(targetSession)
  syncSessionToOrder(targetSession)

  console.log(`[KioskSession] 🖨️ AUTO-DISPATCHING PRINT on payment confirmed: session ${targetSession.sessionId} on kiosk ${targetSession.kioskId} (order ${effectiveOrderId})`)

  try {
    dispatchPrintJob(jobState)
  } catch (err: any) {
    console.error(`[KioskSession] Error in dispatchPrintJob for session ${targetSession.sessionId}:`, err)
  }

  return true
}

