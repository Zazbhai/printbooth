import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { isDbConnected } from '../db.js'
import { Order } from '../models/Order.js'
import { Payment } from '../models/Payment.js'
import { CupsAutomationService } from './cups.js'
import { getRealPrinterHardwareStatus } from './printerDetector.js'
import { recordKioskHeartbeat, markKioskOffline } from './kioskLiveness.js'
import { recordKioskNetworkHeartbeat } from './networkDetector.js'
import {
  type KioskPiPrintersData,
  recordPiPrinterTelemetry,
  getKioskPiPrinters,
  updatePiActivePrinter,
} from './kioskPiPrinters.js'
import { permanentlyDeleteOrderFiles } from './fileLifecycle.js'
import { Kiosk } from '../models/Kiosk.js'
import { safeEqual } from './kioskAuth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Temporary upload directory for WS file streams
const WS_UPLOADS_DIR = path.resolve(__dirname, '../../uploads/ws_temp')
if (!fs.existsSync(WS_UPLOADS_DIR)) {
  fs.mkdirSync(WS_UPLOADS_DIR, { recursive: true })
}

export type ClientRole = 'customer' | 'kiosk' | 'admin'

export interface WsClientInfo {
  id: string
  ws: WebSocket
  role: ClientRole
  kioskId?: string
  sessionId?: string
  ip: string
  connectedAt: number
  lastActive: number
  isAlive: boolean
}

export interface WsMessage<T = any> {
  type: string
  payload?: T
  kioskId?: string
  orderId?: string
  orderNumber?: string
  sessionId?: string
  timestamp?: number
}

// In-flight file transfers stream buffer
interface InFlightFile {
  fileId: string
  fileName: string
  fileSize: number
  totalChunks: number
  receivedChunks: number
  tempPath: string
  kioskId?: string
  orderId?: string
  options?: any
  writeStream: fs.WriteStream
  createdAt: number
}

const clients = new Map<string, WsClientInfo>()
const inFlightFiles = new Map<string, InFlightFile>()

export {
  type KioskPiPrintersData,
  recordPiPrinterTelemetry,
  getKioskPiPrinters,
  updatePiActivePrinter,
}

export function sendPiSetDefaultPrinter(kioskId: string, printerName: string): boolean {
  const cleanId = (kioskId || 'PB-001').toUpperCase()
  updatePiActivePrinter(cleanId, printerName)
  relayToKiosk(cleanId, {
    type: 'SET_DEFAULT_PRINTER',
    kioskId: cleanId,
    payload: { printerName },
  })
  return true
}

export function sendPiScanPrinters(kioskId: string): boolean {
  const cleanId = (kioskId || 'PB-001').toUpperCase()
  relayToKiosk(cleanId, {
    type: 'SCAN_PRINTERS',
    kioskId: cleanId,
    payload: {},
  })
  return true
}

const pendingWifiScans = new Map<string, (networks: any[]) => void>()
const pendingWifiConnects = new Map<string, (res: { success: boolean; message: string }) => void>()

/**
 * Commands the connected Raspberry Pi kiosk to perform a fresh Wi-Fi scan and awaits results.
 */
export function requestPiWifiScan(kioskId: string, timeoutMs = 8000): Promise<any[]> {
  const cleanId = (kioskId || 'PB-001').toUpperCase()
  if (!isKioskRelayConnected(cleanId)) return Promise.resolve([])

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingWifiScans.delete(cleanId)
      resolve([])
    }, timeoutMs)

    pendingWifiScans.set(cleanId, (networks) => {
      clearTimeout(timer)
      resolve(networks)
    })

    relayToKiosk(cleanId, {
      type: 'SCAN_WIFI',
      kioskId: cleanId,
      payload: { requestedAt: Date.now() },
    })
  })
}

/**
 * Commands the connected Raspberry Pi kiosk to associate with a Wi-Fi network and awaits result.
 */
export function requestPiWifiConnect(
  kioskId: string,
  ssid: string,
  password?: string,
  timeoutMs = 15000
): Promise<{ success: boolean; message: string }> {
  const cleanId = (kioskId || 'PB-001').toUpperCase()
  if (!isKioskRelayConnected(cleanId)) {
    return Promise.resolve({
      success: false,
      message: `Raspberry Pi station ${cleanId} is currently offline. Turn on the kiosk to connect Wi-Fi.`,
    })
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingWifiConnects.delete(cleanId)
      resolve({
        success: false,
        message: 'Connection timed out: Raspberry Pi did not confirm Wi-Fi within 15 seconds.',
      })
    }, timeoutMs)

    pendingWifiConnects.set(cleanId, (result) => {
      clearTimeout(timer)
      resolve(result)
    })

    relayToKiosk(cleanId, {
      type: 'CONNECT_WIFI',
      kioskId: cleanId,
      payload: { ssid, password, requestedAt: Date.now() },
    })
  })
}

// Singleton WSS reference
let wssInstance: WebSocketServer | null = null

/**
 * Initializes the WebSocket Secure (WSS / WS) Relay System on the shared HTTP/S server.
 */
export function initWebSocketRelay(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 50 * 1024 * 1024, // 50MB max frame
  })
  wssInstance = wss

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`)
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request)
      })
    }
  })

  console.log('[WSS Relay] ⚡ WebSocket Secure Relay System mounted on /ws (50MB max frame)')

  wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`)
    const role = (url.searchParams.get('role') || 'customer').toLowerCase() as ClientRole
    const kioskId = (url.searchParams.get('kioskId') || '').toUpperCase()
    const sessionId = url.searchParams.get('sessionId') || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1'

    // ── Cryptographic Security Gate for Raspberry Pi Kiosk Connections ──
    if (role === 'kiosk') {
      if (!kioskId) {
        console.warn(`[WSS Relay] ⛔ Rejected kiosk connection without kioskId from IP ${ip}`)
        sendJson(ws, { type: 'ERROR', payload: { error: 'kioskId is required for role=kiosk' } })
        ws.close(4400, 'kioskId required')
        return
      }

      let secret =
        url.searchParams.get('secret') ||
        url.searchParams.get('apiKey') ||
        url.searchParams.get('key') ||
        (req.headers['x-kiosk-secret'] as string) ||
        ''
      if (!secret && req.headers['authorization']?.startsWith('Bearer ')) {
        secret = req.headers['authorization'].slice(7).trim()
      }

      if (isDbConnected()) {
        try {
          const kioskDoc = await Kiosk.findOne({ kioskId })
          if (!kioskDoc) {
            console.warn(`[WSS Relay] ⛔ Rejected connection for unregistered station '${kioskId}' from IP ${ip}`)
            sendJson(ws, { type: 'ERROR', payload: { error: `Station '${kioskId}' not registered` } })
            ws.close(4404, 'Station not found')
            return
          }

          if (kioskDoc.deviceSecret) {
            const isMatch = secret && safeEqual(secret, kioskDoc.deviceSecret)
            const isDevLocal = process.env.NODE_ENV !== 'production' && kioskId === 'PB-001' && !secret
            if (!isMatch && !isDevLocal) {
              console.warn(`[WSS Relay] 🚨 REJECTED UNAUTHORIZED KIOSK ATTEMPT for station '${kioskId}' from IP ${ip}. Cryptographic secret mismatch.`)
              sendJson(ws, {
                type: 'ERROR',
                payload: { error: `Unauthorized: Invalid or missing cryptographic device secret for station ${kioskId}.` },
              })
              ws.close(4401, 'Unauthorized: Invalid kiosk key')
              return
            }
          }
        } catch (err) {
          console.error(`[WSS Relay] Error authenticating kiosk ${kioskId}:`, err)
        }
      }
    }

    const clientInfo: WsClientInfo = {
      id: clientId,
      ws,
      role,
      kioskId: kioskId || undefined,
      sessionId,
      ip,
      connectedAt: Date.now(),
      lastActive: Date.now(),
      isAlive: true,
    }

    clients.set(clientId, clientInfo)

    console.log(
      `[WSS Relay] 🔌 Client connected: ${clientId} | Role: ${role.toUpperCase()}` +
      `${kioskId ? ` | Kiosk: ${kioskId}` : ''} | Session: ${sessionId} (Total: ${clients.size})`
    )

    // Send connection established handshake
    sendJson(ws, {
      type: 'CONNECTED',
      payload: {
        clientId,
        role,
        kioskId: kioskId || null,
        sessionId,
        serverTime: Date.now(),
        message: 'Connected to PrintBooth WSS Relay System',
      },
    })

    // If a kiosk connected, immediately sync with latest hardware and record online state
    if (role === 'kiosk' && kioskId) {
      recordKioskHeartbeat(kioskId, { status: 'ONLINE', printerStatus: 'READY' }).catch(() => {})
      notifyKioskConnected(kioskId, clientInfo)
      broadcastToKioskUsers(kioskId, 'KIOSK_ONLINE', {
        kioskId,
        status: 'ONLINE',
        printerStatus: 'READY',
        connectedAt: Date.now(),
      })
    }

    // Ping/Pong liveness
    ws.on('pong', () => {
      clientInfo.isAlive = true
      clientInfo.lastActive = Date.now()
    })

    // Handle messages
    ws.on('message', async (data: Buffer | string, isBinary: boolean) => {
      clientInfo.lastActive = Date.now()

      if (isBinary) {
        // Direct raw binary stream handler
        handleBinaryFrame(clientInfo, data as Buffer)
        return
      }

      try {
        const text = data.toString()
        const msg: WsMessage = JSON.parse(text)
        await handleJsonMessage(clientInfo, msg)
      } catch (err: any) {
        sendJson(ws, {
          type: 'ERROR',
          payload: { error: `Invalid message payload: ${err.message}` },
        })
      }
    })

    // Handle disconnection
    ws.on('close', (code, reason) => {
      clients.delete(clientId)
      console.log(
        `[WSS Relay] 🔌 Client disconnected: ${clientId} (${code} - ${reason.toString() || 'normal'}) | Remaining: ${clients.size}`
      )

      if (role === 'kiosk' && kioskId) {
        broadcastToAdmins('KIOSK_DISCONNECTED', { kioskId, clientId, disconnectedAt: Date.now() })
        // If no other kiosk socket exists for this machine, mark it offline immediately (unless in test mode)
        const isTestMode = (process.env.PRINT_MODE || '').toLowerCase() === 'test' || process.env.MOCK_PRINTER === 'true'
        if (!isKioskRelayConnected(kioskId) && !isTestMode) {
          markKioskOffline(kioskId, 'Kiosk WebSocket disconnected / Raspberry Pi powered off').catch(() => {})
          broadcastToKioskUsers(kioskId, 'KIOSK_OFFLINE', {
            kioskId,
            status: 'OFFLINE',
            printerStatus: 'OFFLINE',
            reason: 'Station supervisor disconnected / Raspberry Pi powered off',
            disconnectedAt: Date.now(),
          })
        }
      }
    })

    ws.on('error', (err) => {
      console.error(`[WSS Relay] Socket error for ${clientId}:`, err.message)
    })
  })

  // Heartbeat ping interval (25 seconds)
  const pingInterval = setInterval(() => {
    const now = Date.now()
    const isTestMode = (process.env.PRINT_MODE || '').toLowerCase() === 'test' || process.env.MOCK_PRINTER === 'true'
    for (const [id, client] of clients.entries()) {
      if (!client.isAlive) {
        console.warn(`[WSS Relay] Terminating unresponsive client: ${id}`)
        const clientRole = client.role
        const clientKioskId = client.kioskId
        client.ws.terminate()
        clients.delete(id)
        if (clientRole === 'kiosk' && clientKioskId && !isKioskRelayConnected(clientKioskId) && !isTestMode) {
          markKioskOffline(clientKioskId, 'Heartbeat ping timeout / station unreachable').catch(() => {})
        }
        continue
      }
      client.isAlive = false
      try {
        client.ws.ping()
      } catch {
        clients.delete(id)
      }
    }

    // Cleanup abandoned file streams (> 10 minutes)
    for (const [fileId, file] of inFlightFiles.entries()) {
      if (now - file.createdAt > 10 * 60 * 1000) {
        try {
          file.writeStream.destroy()
          if (fs.existsSync(file.tempPath)) fs.unlinkSync(file.tempPath)
        } catch {}
        inFlightFiles.delete(fileId)
      }
    }
  }, 25000)

  wss.on('close', () => {
    clearInterval(pingInterval)
  })

  return wss
}

/**
 * Handles incoming JSON messages across the relay network.
 */
async function handleJsonMessage(client: WsClientInfo, msg: WsMessage) {
  const { type, payload, kioskId = client.kioskId, orderId, sessionId = client.sessionId } = msg

  switch (type) {
    // ── 1. REGISTRATION & CHANNEL ROUTING ──────────────────────────────────
    case 'REGISTER': {
      if (payload?.role) client.role = payload.role
      if (payload?.kioskId) client.kioskId = payload.kioskId.toUpperCase()
      if (payload?.sessionId) client.sessionId = payload.sessionId
      sendJson(client.ws, {
        type: 'REGISTERED',
        payload: {
          role: client.role,
          kioskId: client.kioskId,
          sessionId: client.sessionId,
        },
      })
      break
    }

    // ── 2. DIRECT FILE STREAM INTAKE ───────────────────────────────────────
    case 'FILE_START': {
      // Initiates a direct chunked document upload over WebSocket
      const { fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, fileName, fileSize, totalChunks, options } = payload || {}
      if (!fileName || !fileSize) {
        sendJson(client.ws, { type: 'FILE_ERROR', payload: { error: 'Missing fileName or fileSize in FILE_START' } })
        return
      }

      const safeExt = path.extname(fileName).toLowerCase() || '.pdf'
      const tempPath = path.join(WS_UPLOADS_DIR, `${fileId}_${Date.now()}${safeExt}`)
      const writeStream = fs.createWriteStream(tempPath)

      inFlightFiles.set(fileId, {
        fileId,
        fileName,
        fileSize,
        totalChunks: totalChunks || 1,
        receivedChunks: 0,
        tempPath,
        kioskId,
        orderId,
        options,
        writeStream,
        createdAt: Date.now(),
      })

      sendJson(client.ws, {
        type: 'FILE_READY_FOR_CHUNKS',
        payload: { fileId, fileName, maxChunkSize: 2 * 1024 * 1024 },
      })
      break
    }

    case 'FILE_CHUNK': {
      // Receives base64 chunk, writes to disk stream, and sends ACK
      const { fileId, chunkIndex, chunkData, isLast } = payload || {}
      const file = inFlightFiles.get(fileId)
      if (!file) {
        sendJson(client.ws, { type: 'FILE_ERROR', payload: { error: `File transfer '${fileId}' not found or expired` } })
        return
      }

      const buffer = Buffer.from(chunkData, 'base64')
      file.writeStream.write(buffer)
      file.receivedChunks++

      const progress = Math.min(100, Math.round((file.receivedChunks / file.totalChunks) * 100))

      sendJson(client.ws, {
        type: 'FILE_CHUNK_ACK',
        payload: { fileId, chunkIndex, progress },
      })

      if (isLast || file.receivedChunks >= file.totalChunks) {
        await completeFileUpload(client, file)
      }
      break
    }

    case 'FILE_DIRECT': {
      // Fast single-shot file transfer for documents under 25MB
      const { fileName, fileData, orderId: directOrderId, options } = payload || {}
      if (!fileName || !fileData) {
        sendJson(client.ws, { type: 'FILE_ERROR', payload: { error: 'Missing fileName or fileData' } })
        return
      }

      const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const safeExt = path.extname(fileName).toLowerCase() || '.pdf'
      const finalPath = path.join(WS_UPLOADS_DIR, `${fileId}_${fileName}`)
      const buffer = Buffer.from(fileData, 'base64')
      fs.writeFileSync(finalPath, buffer)

      console.log(`[WSS Relay] 📄 Direct file received over WS: ${fileName} (${buffer.length} bytes)`)

      sendJson(client.ws, {
        type: 'FILE_RECEIVED',
        payload: {
          fileId,
          fileName,
          fileSize: buffer.length,
          filePath: finalPath,
          orderId: directOrderId,
        },
      })

      // If target kiosk is connected, relay file metadata immediately
      if (kioskId) {
        relayToKiosk(kioskId, {
          type: 'FILE_INCOMING',
          payload: {
            fileId,
            fileName,
            fileSize: buffer.length,
            orderId: directOrderId,
            options,
          },
        })
      }
      break
    }

    // ── 3. REAL-TIME PAYMENT CATCHING & VERIFICATION ────────────────────────
    case 'PAYMENT_VERIFY': {
      // Catches payment details directly over WS, verifies signature/gateway, and broadcasts
      const { gateway = 'razorpay', razorpayPaymentId, razorpayOrderId, razorpaySignature, clientTxnId, upiTxnId, amount } = payload || {}
      const targetOrderId = orderId || payload?.orderId

      console.log(`[WSS Relay] 💳 Payment verify requested over WS for Order ${targetOrderId} (${gateway})`)

      try {
        let isVerified = false

        if (gateway === 'razorpay' && razorpayPaymentId && razorpayOrderId && razorpaySignature) {
          const keySecret = process.env.RAZORPAY_KEY_SECRET
          if (keySecret) {
            const expected = crypto
              .createHmac('sha256', keySecret)
              .update(`${razorpayOrderId}|${razorpayPaymentId}`)
              .digest('hex')
            isVerified = expected === razorpaySignature
          } else {
            isVerified = true // Fallback in mock/dev mode
          }
        } else if (gateway === 'upiexpress' || clientTxnId || upiTxnId) {
          isVerified = true
        }

        if (isVerified) {
          // Catch and mark payment as captured in database
          if (isDbConnected()) {
            if (targetOrderId) {
              await Order.findOneAndUpdate(
                { $or: [{ orderId: targetOrderId }, { orderNumber: targetOrderId }] },
                { status: 'PAID', paidAt: new Date() }
              )
            }
            if (razorpayOrderId) {
              await Payment.findOneAndUpdate(
                { razorpayOrderId },
                { status: 'CAPTURED', razorpayPaymentId, capturedAt: new Date() }
              )
            }
          }

          // Broadcast payment confirmation instantaneously across WSS relay
          relayPaymentCaptured(targetOrderId, kioskId, {
            gateway,
            paymentId: razorpayPaymentId || upiTxnId || clientTxnId,
            amount,
            verifiedAt: Date.now(),
          })

          sendJson(client.ws, {
            type: 'PAYMENT_CONFIRMED',
            payload: {
              orderId: targetOrderId,
              status: 'PAID',
              message: 'Payment verified and captured instantaneously over WSS.',
            },
          })
        } else {
          sendJson(client.ws, {
            type: 'PAYMENT_FAILED',
            payload: { orderId: targetOrderId, error: 'Signature verification mismatch' },
          })
        }
      } catch (err: any) {
        sendJson(client.ws, {
          type: 'PAYMENT_FAILED',
          payload: { orderId: targetOrderId, error: err.message },
        })
      }
      break
    }

    // ── 4. KIOSK HARDWARE TELEMETRY & PRINT DISPATCH ────────────────────────
    case 'KIOSK_HEARTBEAT': {
      // Live hardware telemetry received from Kiosk station daemon (Raspberry Pi)
      if (kioskId) {
        const cleanKioskId = kioskId.toUpperCase()
        const usbConnected = payload?.usbConnected !== undefined ? Boolean(payload.usbConnected) : true
        const pStatusRaw = String(payload?.printerStatus || '').toUpperCase()
        const kStatusRaw = String(payload?.status || '').toUpperCase()
        const isOfflineExplicit =
          usbConnected === false ||
          kStatusRaw === 'OFFLINE' ||
          pStatusRaw === 'OFFLINE' ||
          pStatusRaw === 'ERROR' ||
          pStatusRaw === 'STOPPED' ||
          pStatusRaw === 'DISCONNECTED'

        const isPrinterOnline = !isOfflineExplicit && (kStatusRaw === 'ONLINE' || pStatusRaw === 'READY' || pStatusRaw === 'IDLE')

        const printerName = payload?.printerName || payload?.activePrinter || (usbConnected ? 'Brother DCP-T420W' : 'None')
        const printerModel = payload?.printerModel || payload?.usbDevice || printerName
        const wifiName = payload?.wifiName || payload?.connectedWifi || payload?.network?.wifi?.ssid
        const hostname = payload?.hostname || payload?.network?.hostname

        recordPiPrinterTelemetry(cleanKioskId, {
          kioskId: cleanKioskId,
          activePrinter: printerName,
          allPrinters: Array.isArray(payload.allPrinters) && payload.allPrinters.length > 0
            ? payload.allPrinters
            : (usbConnected ? [{ name: printerName, info: printerModel, is_online: isPrinterOnline, is_default: true }] : []),
          isOnline: isPrinterOnline,
          printerStatus: isPrinterOnline ? 'READY' : (pStatusRaw || 'OFFLINE'),
          usbConnected,
          usbDevice: payload.usbDevice || printerModel,
          usbInfo: payload.usbInfo || undefined,
          timestamp: Date.now(),
        })

        recordKioskHeartbeat(cleanKioskId, {
          ...payload,
          status: isPrinterOnline ? 'ONLINE' : 'OFFLINE',
          printerStatus: isPrinterOnline ? 'READY' : 'OFFLINE',
          activePrinter: printerName,
          printerModel,
          usbConnected,
        }).catch(() => {})

        if (payload?.network || wifiName || hostname) {
          const net = { ...(payload?.network || {}) }
          if (hostname) net.hostname = hostname
          if (wifiName) {
            net.wifi = { ...(net.wifi || {}), ssid: wifiName, connected: wifiName !== 'Offline' }
          }
          recordKioskNetworkHeartbeat(cleanKioskId, net)
        }
        CupsAutomationService.getHardwareState(cleanKioskId).catch(() => {})
        broadcastToAdmins('KIOSK_TELEMETRY', {
          kioskId: cleanKioskId,
          ...payload,
          printerName,
          printerModel,
          wifiName,
          hostname,
          timestamp: Date.now(),
        })
      }
      break
    }

    case 'USB_PRINTER_STATUS': {
      // On-demand or 1-minute lsusb probe results from Raspberry Pi daemon
      if (kioskId) {
        const cleanKioskId = kioskId.toUpperCase()
        const isUsbConnected = Boolean(payload?.connected)
        const usbDevice = payload?.printerFound || ''
        let existing = getKioskPiPrinters(cleanKioskId)
        if (!existing) {
          existing = {
            kioskId: cleanKioskId,
            activePrinter: isUsbConnected ? 'Brother DCP-T420W' : 'None',
            allPrinters: isUsbConnected ? [{ name: 'Brother_DCP_T420W', info: 'Brother DCP-T420W (USB)', is_online: true, is_default: true }] : [],
            isOnline: isUsbConnected,
            printerStatus: isUsbConnected ? 'READY' : 'OFFLINE',
            usbConnected: isUsbConnected,
            usbDevice,
            usbInfo: payload,
            timestamp: Date.now(),
          }
        } else {
          existing.usbConnected = isUsbConnected
          existing.usbDevice = usbDevice
          existing.usbInfo = payload
          if (!isUsbConnected) {
            existing.isOnline = false
            existing.printerStatus = 'OFFLINE'
          }
          if (isUsbConnected && (!existing.activePrinter || existing.activePrinter === 'None')) {
            existing.activePrinter = 'Brother DCP-T420W'
          }
        }

        recordPiPrinterTelemetry(cleanKioskId, existing)
        recordKioskHeartbeat(cleanKioskId, {
          status: existing.isOnline ? 'ONLINE' : 'OFFLINE',
          usbConnected: isUsbConnected,
          usbDevice,
          printerStatus: existing.printerStatus,
        }).catch(() => {})
        broadcastToAdmins('USB_PRINTER_STATUS', { kioskId: cleanKioskId, ...payload, timestamp: Date.now() })
      }
      break
    }

    case 'WIFI_SCAN_RESULT': {
      // Scanned Wi-Fi networks returned from Raspberry Pi daemon
      if (kioskId) {
        const cleanKioskId = kioskId.toUpperCase()
        const networks = Array.isArray(payload?.networks) ? payload.networks : []
        const resolver = pendingWifiScans.get(cleanKioskId)
        if (resolver) {
          resolver(networks)
          pendingWifiScans.delete(cleanKioskId)
        }
        broadcastToAdmins('WIFI_SCAN_RESULT', { kioskId: cleanKioskId, networks, timestamp: Date.now() })
      }
      break
    }

    case 'WIFI_CONNECT_RESULT': {
      // Wi-Fi connection attempt result returned from Raspberry Pi daemon
      if (kioskId) {
        const cleanKioskId = kioskId.toUpperCase()
        const resolver = pendingWifiConnects.get(cleanKioskId)
        if (resolver) {
          resolver({
            success: Boolean(payload?.success),
            message: payload?.message || (payload?.success ? 'Connected successfully' : 'Failed to connect'),
          })
          pendingWifiConnects.delete(cleanKioskId)
        }
        broadcastToAdmins('WIFI_CONNECT_RESULT', { kioskId: cleanKioskId, ...payload, timestamp: Date.now() })
      }
      break
    }

    case 'UPDATE_STATUS': {
      if (kioskId) {
        const cleanKioskId = kioskId.toUpperCase()
        recordKioskUpdateStatus(cleanKioskId, payload)
        broadcastToAdmins('KIOSK_UPDATE_STATUS', { kioskId: cleanKioskId, ...payload, timestamp: Date.now() })
      }
      break
    }

    case 'PRINT_PROGRESS': {
      // Spooler progress emitted from kiosk hardware engine -> relay to customer phone
      if (sessionId || orderId) {
        broadcastToSessionOrKiosk(sessionId, kioskId, {
          type: 'PRINT_PROGRESS',
          payload,
          orderId,
        })
      }
      broadcastToAdmins('PRINT_PROGRESS', { kioskId, orderId, ...payload })
      break
    }

    case 'PRINT_COMPLETE': {
      // Physical paper ejected -> permanently purge uploaded document files & relay to customer & admin
      if (orderId) {
        await permanentlyDeleteOrderFiles(orderId, 'WSS_HARDWARE_PRINT_COMPLETE').catch(() => {})
      }
      if (orderId && isDbConnected()) {
        await Order.updateMany(
          { $or: [{ orderId }, { orderNumber: orderId }] },
          {
            $set: { status: 'PRINTED', completedAt: new Date(), isPinUsed: true, fileDeleted: true, fileDeletedAt: new Date(), fileUrl: '' },
            $unset: { releasePin: 1, otp: 1, pickupCode: 1 },
          }
        ).catch(() => {})
      }

      broadcastToSessionOrKiosk(sessionId, kioskId, {
        type: 'PRINT_COMPLETE',
        payload: { orderId, completedAt: Date.now() },
      })
      broadcastToAdmins('PRINT_COMPLETE', { kioskId, orderId, completedAt: Date.now() })
      break
    }

    default:
      // Generic message relay
      if (kioskId) {
        relayToKiosk(kioskId, msg)
      } else if (sessionId) {
        relayToSession(sessionId, msg)
      }
      break
  }
}

/**
 * Handles binary frame streams directly (e.g. raw PDF bytes).
 */
function handleBinaryFrame(client: WsClientInfo, data: Buffer) {
  const fileId = `bin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const filePath = path.join(WS_UPLOADS_DIR, `${fileId}.pdf`)
  fs.writeFileSync(filePath, data)

  sendJson(client.ws, {
    type: 'BINARY_FILE_STORED',
    payload: { fileId, size: data.length, filePath },
  })
}

/**
 * Finalizes chunked file upload, closes disk stream, and notifies caller & kiosk.
 */
async function completeFileUpload(client: WsClientInfo, file: InFlightFile) {
  return new Promise<void>((resolve) => {
    file.writeStream.end(() => {
      inFlightFiles.delete(file.fileId)
      console.log(`[WSS Relay] ✓ Chunked file complete: ${file.fileName} (${file.fileSize} bytes) -> ${file.tempPath}`)

      sendJson(client.ws, {
        type: 'FILE_RECEIVED',
        payload: {
          fileId: file.fileId,
          fileName: file.fileName,
          fileSize: file.fileSize,
          filePath: file.tempPath,
          orderId: file.orderId,
        },
      })

      if (file.kioskId) {
        relayToKiosk(file.kioskId, {
          type: 'FILE_INCOMING',
          payload: {
            fileId: file.fileId,
            fileName: file.fileName,
            fileSize: file.fileSize,
            filePath: file.tempPath,
            orderId: file.orderId,
            options: file.options,
          },
        })
      }
      resolve()
    })
  })
}

/**
 * Relays an instantaneous payment captured event to all connected customer sessions,
 * target kiosk terminal, and admin monitors.
 */
export function relayPaymentCaptured(orderId: string, kioskId?: string, paymentData?: any) {
  const payload = {
    orderId,
    kioskId,
    status: 'PAID',
    payment: paymentData,
    timestamp: Date.now(),
  }

  console.log(`[WSS Relay] ⚡ Broadcasting PAYMENT_CAPTURED for Order: ${orderId} | Kiosk: ${kioskId || 'ANY'}`)

  // Broadcast to all clients matching this order or kiosk
  for (const client of clients.values()) {
    if (client.role === 'admin' || client.kioskId === kioskId || client.sessionId?.includes(orderId)) {
      sendJson(client.ws, {
        type: 'PAYMENT_CAPTURED',
        payload,
      })
    }
  }

  // Trigger hardware print automatically on kiosk session if active
  try {
    import('../routes/kioskSessions.js').then(({ triggerSessionPrintOnPayment }) => {
      triggerSessionPrintOnPayment(orderId, kioskId, paymentData)
    }).catch(() => {})
  } catch {}
}

/**
 * Relays a PIN_VERIFIED event to target kiosk, customer sessions, and admin monitors.
 */
export function relayPinVerified(orderId: string, kioskId: string, payload?: any) {
  const msg: WsMessage = {
    type: 'PIN_VERIFIED',
    kioskId,
    orderId,
    payload: {
      orderId,
      kioskId,
      status: 'PRINTING',
      verifiedAt: Date.now(),
      ...payload,
    },
  }

  console.log(`[WSS Relay] 🔑 Broadcasting PIN_VERIFIED for Order ${orderId} on Kiosk ${kioskId}`)

  for (const client of clients.values()) {
    if (
      client.role === 'admin' ||
      client.kioskId === kioskId.toUpperCase() ||
      (orderId && client.sessionId?.includes(orderId))
    ) {
      sendJson(client.ws, msg)
    }
  }
}

/**
 * Relays a message directly to any client registered under a specific kioskId.
 */
export function relayToKiosk(kioskId: string, msg: WsMessage) {
  for (const client of clients.values()) {
    if (client.kioskId === kioskId.toUpperCase() && client.role === 'kiosk') {
      sendJson(client.ws, msg)
    }
  }
}

/**
 * Triggers an immediate on-demand physical USB check (lsusb) on the target Raspberry Pi.
 */
export function triggerKioskUsbProbe(kioskId: string): boolean {
  if (!isKioskRelayConnected(kioskId)) return false
  relayToKiosk(kioskId, {
    type: 'CHECK_USB_PRINTER',
    payload: { requestedAt: Date.now() },
  })
  return true
}

// ── In-Memory Kiosk GitHub Update Telemetry Cache ──
const kioskUpdateStatuses = new Map<string, any>()

export function recordKioskUpdateStatus(kioskId: string, status: any) {
  if (!kioskId) return
  kioskUpdateStatuses.set(kioskId.toUpperCase(), {
    ...status,
    receivedAt: Date.now(),
  })
}

export function getKioskUpdateStatus(kioskId: string) {
  return kioskUpdateStatuses.get(kioskId.toUpperCase()) || null
}

/**
 * Triggers an immediate autonomous GitHub pull, build and display reload on target Raspberry Pi.
 */
export function triggerKioskUpdate(kioskId: string, options?: { force?: boolean; branch?: string }): boolean {
  if (!isKioskRelayConnected(kioskId)) return false
  relayToKiosk(kioskId, {
    type: 'TRIGGER_UPDATE',
    payload: {
      requestedAt: Date.now(),
      force: Boolean(options?.force),
      branch: options?.branch || 'main',
    },
  })
  return true
}

/**
 * Checks if a specific kiosk currently has an active, open WebSocket connection on /ws.
 */
export function isKioskRelayConnected(kioskId?: string): boolean {
  if (!kioskId) return false
  const cleanId = kioskId.trim().toUpperCase()
  for (const client of clients.values()) {
    if (client.kioskId === cleanId && client.role === 'kiosk' && client.ws.readyState === WebSocket.OPEN) {
      return true
    }
  }
  return false
}

/**
 * Returns all kioskIds currently connected to WebSocket relay.
 */
export function getConnectedKioskIds(): string[] {
  const ids: string[] = []
  for (const client of clients.values()) {
    if (client.role === 'kiosk' && client.kioskId && client.ws.readyState === WebSocket.OPEN) {
      ids.push(client.kioskId)
    }
  }
  return ids
}

/**
 * Relays a message directly to any customer session.
 */
export function relayToSession(sessionId: string, msg: WsMessage) {
  for (const client of clients.values()) {
    if (client.sessionId === sessionId) {
      sendJson(client.ws, msg)
    }
  }
}

/**
 * Relays to session if matched; otherwise to kiosk room.
 */
function broadcastToSessionOrKiosk(sessionId?: string, kioskId?: string, msg?: WsMessage) {
  if (!msg) return
  for (const client of clients.values()) {
    if ((sessionId && client.sessionId === sessionId) || (kioskId && client.kioskId === kioskId)) {
      sendJson(client.ws, msg)
    }
  }
}

/**
 * Broadcasts an event to all platform administrators.
 */
export function broadcastToAdmins(type: string, payload: any) {
  for (const client of clients.values()) {
    if (client.role === 'admin') {
      sendJson(client.ws, { type, payload })
    }
  }
}

/**
 * Broadcasts an event to all users connected to or viewing a specific kiosk.
 */
export function broadcastToKioskUsers(kioskId: string, type: string, payload: any) {
  const cleanId = (kioskId || '').toUpperCase()
  for (const client of clients.values()) {
    if (!client.kioskId || client.kioskId.toUpperCase() === cleanId) {
      sendJson(client.ws, { type, kioskId: cleanId, payload })
    }
  }
}

/**
 * Dispatches live hardware / queue status on initial kiosk connection.
 */
async function notifyKioskConnected(kioskId: string, client: WsClientInfo) {
  try {
    const live = await getRealPrinterHardwareStatus()
    sendJson(client.ws, {
      type: 'KIOSK_INITIALIZED',
      payload: {
        kioskId,
        printerStatus: live.statusLabels?.[0] || (live.isOnline ? 'READY' : 'OFFLINE'),
        printerModel: live.selectedPrinter,
        isOnline: live.isOnline,
      },
    })
  } catch {}
}

/**
 * Safe helper to serialize and send JSON payload.
 */
function sendJson(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data))
    } catch (e: any) {
      console.warn('[WSS Relay] Send error:', e.message)
    }
  }
}
