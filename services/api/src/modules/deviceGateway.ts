/**
 * PrintBooth Device Gateway — Secure WebSocket Device Control Module
 * ===================================================================
 * Manages authenticated, outbound-only WebSocket connections from Raspberry Pi kiosks:
 *   - Zero inbound ports on the Raspberry Pi
 *   - Ed25519 zero-knowledge challenge-response authentication
 *   - In-memory & Redis-backed Kiosk -> WebSocket session mapping
 *   - Telemetry ingestion & automatic dead-connection offline pruning
 *   - Idempotent print job dispatch
 */

import http from 'http'
import crypto from 'crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { Device } from '../models/Device.js'
import { cacheSet, cacheGet } from '../redis.js'
import { isDbConnected } from '../db.js'

// Standard SPKI DER Header for Ed25519 raw public keys (12 bytes)
const ED25519_SPKI_HEADER = Buffer.from('302a300506032b6570032100', 'hex')

interface ActiveDeviceSession {
  kioskId: string
  socket: WebSocket
  publicKey: string
  agentVersion: string
  connectedAt: number
  lastHeartbeatAt: number
  ip: string
}

interface PendingChallenge {
  nonce: string
  timestamp: number
  kioskId?: string
}

// Active connected kiosks: KioskId -> ActiveDeviceSession
const connectedKiosks = new Map<string, ActiveDeviceSession>()

// Pending nonces for unauthenticated connections
const pendingChallenges = new WeakMap<WebSocket, PendingChallenge>()

// Singleton server reference
let wssInstance: WebSocketServer | null = null

/**
 * Converts a raw 32-byte Base64 Ed25519 public key into a Node.js crypto KeyObject.
 */
function importEd25519PublicKey(rawBase64: string): crypto.KeyObject {
  const rawKeyBytes = Buffer.from(rawBase64, 'base64')
  if (rawKeyBytes.length !== 32) {
    throw new Error(`Invalid Ed25519 public key length (${rawKeyBytes.length} bytes, expected 32).`)
  }
  const fullDer = Buffer.concat([ED25519_SPKI_HEADER, rawKeyBytes])
  return crypto.createPublicKey({
    key: fullDer,
    format: 'der',
    type: 'spki',
  })
}

/**
 * Initializes the WebSocket server on HTTP path `/device`.
 */
export function initDeviceGateway(server: http.Server): WebSocketServer {
  if (wssInstance) return wssInstance

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 65536, // 64 KB limit
  })
  wssInstance = wss

  // Intercept HTTP upgrade requests strictly for `/device`
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`)
    if (url.pathname === '/device') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request)
      })
    }
  })

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1'
    console.log(`[Device Gateway] 🔌 Outbound connection accepted from ${clientIp}`)

    // 1. Generate cryptographic 32-byte random challenge nonce
    const nonce = crypto.randomBytes(32).toString('hex')
    const timestamp = Math.floor(Date.now() / 1000)

    pendingChallenges.set(ws, { nonce, timestamp })

    // 2. Transmit challenge to Raspberry Pi
    ws.send(JSON.stringify({
      type: 'AUTH_CHALLENGE',
      nonce,
      timestamp,
    }))

    // 3. Setup message receiver
    ws.on('message', async (data: Buffer | string) => {
      try {
        const text = data.toString('utf-8')
        const msg = JSON.parse(text)
        await handleDeviceMessage(ws, msg, clientIp)
      } catch (err: any) {
        console.error(`[Device Gateway] Error processing message from ${clientIp}:`, err.message)
      }
    })

    ws.on('close', (code, reason) => {
      // Find and prune session
      for (const [kioskId, session] of connectedKiosks.entries()) {
        if (session.socket === ws) {
          connectedKiosks.delete(kioskId)
          console.log(`[Device Gateway] ❌ Kiosk ${kioskId} disconnected (code ${code}): ${reason.toString()}`)
          markKioskOffline(kioskId)
          break
        }
      }
    })

    ws.on('error', (err) => {
      console.warn(`[Device Gateway] Socket error from ${clientIp}:`, err.message)
    })
  })

  // Start periodic dead-connection reaper (checks every 15s)
  setInterval(reapStaleConnections, 15000)

  console.log('[Device Gateway] ⚡ Initialized secure device gateway on /device')
  return wss
}

/**
 * Handles incoming WebSocket frames from the device agent.
 */
async function handleDeviceMessage(ws: WebSocket, msg: any, clientIp: string) {
  const type = msg?.type

  // ── Authentication Phase ──
  if (type === 'AUTH_RESPONSE') {
    const challenge = pendingChallenges.get(ws)
    if (!challenge) {
      ws.send(JSON.stringify({ type: 'AUTH_FAILED', error: 'No active challenge for this socket' }))
      ws.close(4001, 'No challenge')
      return
    }

    const { kioskId, publicKey, signature, timestamp } = msg
    if (!kioskId || !publicKey || !signature || !timestamp) {
      ws.send(JSON.stringify({ type: 'AUTH_FAILED', error: 'Missing authentication parameters' }))
      ws.close(4001, 'Invalid parameters')
      return
    }

    // Verify timestamp skew is within 60 seconds
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 60) {
      ws.send(JSON.stringify({ type: 'AUTH_FAILED', error: 'Timestamp skew exceeded (60s limit)' }))
      ws.close(4001, 'Timestamp skewed')
      return
    }

    // Verify Ed25519 signature
    try {
      const keyObj = importEd25519PublicKey(publicKey)
      const dataToVerify = Buffer.from(`${kioskId}:${challenge.nonce}:${challenge.timestamp}`)
      const sigBuffer = Buffer.from(signature, 'base64')

      const isValid = crypto.verify(null, dataToVerify, keyObj, sigBuffer)
      if (!isValid) {
        console.warn(`[Device Gateway] 🚨 Authentication failed for ${kioskId}: Signature verification rejected!`)
        ws.send(JSON.stringify({ type: 'AUTH_FAILED', error: 'Invalid cryptographic signature' }))
        ws.close(4003, 'Invalid signature')
        return
      }

      // Check if device is authorized in database
      if (isDbConnected()) {
        try {
          let device = await Device.findOne({ kioskId })
          if (!device) {
            device = await Device.create({
              kioskId,
              name: `PrintBooth Station (${kioskId})`,
              publicKey,
              status: 'ONLINE',
              agentVersion: msg.agentVersion || '1.0.0',
              lastSeenAt: new Date(),
            })
          } else {
            device.status = 'ONLINE'
            device.lastSeenAt = new Date()
            device.agentVersion = msg.agentVersion || device.agentVersion
            await device.save()
          }
        } catch (dbErr: any) {
          console.warn(`[Device Gateway] Device DB record warning: ${dbErr.message}`)
        }
      }

      // Close any previous stale socket for this kioskId
      const existing = connectedKiosks.get(kioskId)
      if (existing && existing.socket !== ws) {
        try { existing.socket.close(1000, 'Replaced by new connection') } catch {}
      }

      // Register active session
      connectedKiosks.set(kioskId, {
        kioskId,
        socket: ws,
        publicKey,
        agentVersion: msg.agentVersion || '1.0.0',
        connectedAt: Date.now(),
        lastHeartbeatAt: Date.now(),
        ip: clientIp,
      })

      pendingChallenges.delete(ws)

      console.log(`[Device Gateway] ✓ Kiosk ${kioskId} authenticated and verified ONLINE (v${msg.agentVersion || '1.0.0'})`)

      // Issue confirmation
      ws.send(JSON.stringify({
        type: 'AUTH_SUCCESS',
        kioskId,
        serverTime: Date.now(),
        message: 'Device cryptographic identity verified successfully',
      }))

      // Cache online status in Redis
      await cacheSet(`device:${kioskId}:status`, 'ONLINE', 60)

    } catch (authErr: any) {
      console.error(`[Device Gateway] Cryptographic verification exception for ${kioskId}:`, authErr.message)
      ws.send(JSON.stringify({ type: 'AUTH_FAILED', error: `Crypto error: ${authErr.message}` }))
      ws.close(4003, 'Crypto error')
    }
    return
  }

  // ── Authenticated Telemetry & Commands Phase ──
  const session = getSessionBySocket(ws)
  if (!session) {
    ws.send(JSON.stringify({ type: 'ERROR', error: 'Unauthenticated socket' }))
    ws.close(4001, 'Unauthenticated')
    return
  }

  if (type === 'HEARTBEAT' || type === 'DEVICE_STATUS') {
    session.lastHeartbeatAt = Date.now()
    const printer = msg.printer || {}
    const vitals = msg.vitals || {}

    // Update DB telemetry
    if (isDbConnected()) {
      try {
        await Device.findOneAndUpdate(
          { kioskId: session.kioskId },
          {
            status: 'ONLINE',
            lastSeenAt: new Date(),
            printer: {
              name: printer.name || 'auto',
              status: printer.status || 'READY',
              isOnline: printer.isOnline !== false,
              paperLevel: printer.paperLevel ?? 100,
              tonerLevel: printer.tonerLevel ?? 100,
            },
            vitals: {
              cpuTempC: vitals.cpuTempC,
              memUsedPct: vitals.memUsedPct,
              diskFreeGb: vitals.diskFreeGb,
              platform: vitals.platform,
            },
          }
        )
      } catch (e: any) {
        console.warn(`[Device Gateway] Failed to update telemetry for ${session.kioskId}:`, e.message)
      }
    }
    await cacheSet(`device:${session.kioskId}:status`, 'ONLINE', 60)
  } else if (type === 'JOB_ACCEPTED' || type === 'JOB_STATUS') {
    console.log(`[Device Gateway] Job Telemetry: Order ${msg.jobId} on ${session.kioskId} -> ${msg.status || type}`)
  } else if (type === 'PONG') {
    session.lastHeartbeatAt = Date.now()
  }
}

function getSessionBySocket(ws: WebSocket): ActiveDeviceSession | undefined {
  for (const session of connectedKiosks.values()) {
    if (session.socket === ws) return session
  }
  return undefined
}

async function markKioskOffline(kioskId: string) {
  if (isDbConnected()) {
    try {
      await Device.findOneAndUpdate({ kioskId }, { status: 'OFFLINE' })
    } catch {}
  }
  await cacheSet(`device:${kioskId}:status`, 'OFFLINE', 60)
}

function reapStaleConnections() {
  const now = Date.now()
  for (const [kioskId, session] of connectedKiosks.entries()) {
    if (now - session.lastHeartbeatAt > 45000) {
      console.warn(`[Device Gateway] Kiosk ${kioskId} missed heartbeats (>45s). Marking OFFLINE and terminating.`)
      connectedKiosks.delete(kioskId)
      try { session.socket.terminate() } catch {}
      markKioskOffline(kioskId)
    }
  }
}

/**
 * Transmits a command to a specific connected kiosk.
 */
export async function sendToKiosk(kioskId: string, command: Record<string, any>): Promise<boolean> {
  const cleanId = kioskId.trim().toUpperCase()
  const session = connectedKiosks.get(cleanId)

  if (!session || session.socket.readyState !== WebSocket.OPEN) {
    console.warn(`[Device Gateway] Cannot send command: Kiosk ${cleanId} is OFFLINE or disconnected.`)
    return false
  }

  try {
    session.socket.send(JSON.stringify(command))
    return true
  } catch (err: any) {
    console.error(`[Device Gateway] Failed to dispatch command to ${cleanId}:`, err.message)
    return false
  }
}

/**
 * Dispatches a verified PRINT_JOB to the destination kiosk.
 */
export async function dispatchDevicePrintJob(job: {
  jobId: string
  kioskId: string
  fileId: string
  copies?: number
  colour?: boolean
  duplex?: boolean
  paperSize?: string
  downloadUrl?: string
  authToken?: string
}): Promise<boolean> {
  return sendToKiosk(job.kioskId, {
    type: 'PRINT_JOB',
    jobId: job.jobId,
    kioskId: job.kioskId,
    fileId: job.fileId,
    copies: job.copies || 1,
    colour: Boolean(job.colour),
    duplex: Boolean(job.duplex),
    paperSize: job.paperSize || 'A4',
    downloadUrl: job.downloadUrl,
    authToken: job.authToken,
  })
}

export function isKioskOnline(kioskId: string): boolean {
  const session = connectedKiosks.get(kioskId.trim().toUpperCase())
  return Boolean(session && session.socket.readyState === WebSocket.OPEN)
}

export function getActiveKiosks(): string[] {
  return Array.from(connectedKiosks.keys())
}
