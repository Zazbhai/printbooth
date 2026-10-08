/**
 * PrintBooth WSS (WebSocket Secure) Client Relay
 * ===============================================
 * Connects directly to central API WSS Relay to:
 * 1. Stream & accept documents directly over high-speed WebSocket chunks.
 * 2. Catch payments instantaneously (sub-50ms) without slow HTTP polling.
 * 3. Stream real-time printer spooler telemetry and hardware status.
 */

import { getWsRelayUrl } from './config'

export interface WsRelayConfig {
  role?: 'customer' | 'kiosk' | 'admin'
  kioskId?: string
  sessionId?: string
}

export type WsEventListener = (payload: any, rawMsg: any) => void

class WsRelayClient {
  private ws: WebSocket | null = null
  private config: WsRelayConfig = { role: 'customer' }
  private listeners: Map<string, Set<WsEventListener>> = new Map()
  public isConnecting = false
  private reconnectTimer: any = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private isExplicitlyClosed = false

  public isConnected = false

  constructor() {
    // Generate or retrieve persistent customer session ID
    if (typeof window !== 'undefined') {
      let sess = sessionStorage.getItem('pb_ws_session')
      if (!sess) {
        sess = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        sessionStorage.setItem('pb_ws_session', sess)
      }
      this.config.sessionId = sess

      // Gracefully close active WebSocket connection on page unload/refresh
      const handleUnload = () => {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
          this.isExplicitlyClosed = true
          try {
            this.ws.close(1000, 'Page navigating')
          } catch {}
        }
      }
      window.addEventListener('beforeunload', handleUnload)
      window.addEventListener('pagehide', handleUnload)
    }
  }

  public connect(configOverrides?: Partial<WsRelayConfig>) {
    if (typeof window === 'undefined') return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    if (configOverrides) {
      this.config = { ...this.config, ...configOverrides }
    }

    this.isExplicitlyClosed = false
    this.isConnecting = true

    const params = new URLSearchParams()
    if (this.config.role) params.set('role', this.config.role)
    if (this.config.kioskId) params.set('kioskId', this.config.kioskId)
    if (this.config.sessionId) params.set('sessionId', this.config.sessionId)

    const wsBase = getWsRelayUrl()
    const fullUrl = `${wsBase}?${params.toString()}`

    try {
      this.ws = new WebSocket(fullUrl)

      this.ws.onopen = () => {
        this.isConnected = true
        this.isConnecting = false
        this.reconnectAttempts = 0
        console.log('[WSS Relay Client] ⚡ Connected to WSS Relay:', fullUrl)
        this.emit('CONNECTED', { serverTime: Date.now() }, {})
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const type = msg.type || 'MESSAGE'
          this.emit(type, msg.payload, msg)
        } catch (e) {
          console.warn('[WSS Relay Client] Non-JSON frame:', event.data)
        }
      }

      this.ws.onclose = (event) => {
        this.isConnected = false
        this.isConnecting = false
        console.log(`[WSS Relay Client] 🔌 Disconnected (${event.code} - ${event.reason || 'normal'})`)
        this.emit('DISCONNECTED', { code: event.code, reason: event.reason }, {})

        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (err) => {
        console.warn('[WSS Relay Client] WebSocket error:', err)
        this.emit('ERROR', { error: err }, {})
      }
    } catch (err) {
      console.warn('[WSS Relay Client] Connection failure:', err)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[WSS Relay Client] Max reconnect attempts reached.')
      return
    }

    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000)
    this.reconnectAttempts++
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }

  public disconnect() {
    this.isExplicitlyClosed = true
    clearTimeout(this.reconnectTimer)
    if (this.ws) {
      try {
        this.ws.close()
      } catch {}
      this.ws = null
    }
    this.isConnected = false
  }

  public send(type: string, payload?: any, extra?: { orderId?: string; kioskId?: string }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WSS Relay Client] Socket not open; queueing/dropping message:', type)
      return false
    }

    const message = {
      type,
      payload,
      kioskId: extra?.kioskId || this.config.kioskId,
      orderId: extra?.orderId,
      sessionId: this.config.sessionId,
      timestamp: Date.now(),
    }

    try {
      this.ws.send(JSON.stringify(message))
      return true
    } catch (err) {
      console.error('[WSS Relay Client] Send error:', err)
      return false
    }
  }

  public on(type: string, listener: WsEventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(listener)

    return () => {
      this.listeners.get(type)?.delete(listener)
    }
  }

  public off(type: string, listener: WsEventListener): void {
    this.listeners.get(type)?.delete(listener)
  }


  private emit(type: string, payload: any, rawMsg: any) {
    const list = this.listeners.get(type)
    if (list) {
      list.forEach((fn) => {
        try {
          fn(payload, rawMsg)
        } catch (e) {
          console.error(`[WSS Relay Client] Listener error for ${type}:`, e)
        }
      })
    }
  }

  /**
   * Catches payment in real-time. Calls `onPaid` immediately when captured.
   */
  public catchPayment(orderId: string, onPaid: (payload: any) => void): () => void {
    const cleanup1 = this.on('PAYMENT_CAPTURED', (payload) => {
      if (!orderId || payload?.orderId === orderId) {
        onPaid(payload)
      }
    })
    const cleanup2 = this.on('PAYMENT_CONFIRMED', (payload) => {
      if (!orderId || payload?.orderId === orderId) {
        onPaid(payload)
      }
    })

    return () => {
      cleanup1()
      cleanup2()
    }
  }

  /**
   * Streams a document file directly over WebSocket chunks (64 KB chunks)
   * with progress tracking.
   */
  public async streamFile(
    file: File,
    options?: {
      orderId?: string
      kioskId?: string
      printOptions?: any
      onProgress?: (percent: number) => void
    }
  ): Promise<{ fileId: string; filePath: string }> {
    if (!this.isConnected) {
      this.connect({ kioskId: options?.kioskId })
      await new Promise((resolve) => setTimeout(resolve, 300))
    }

    const CHUNK_SIZE = 64 * 1024 // 64 KB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
    const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    return new Promise((resolve, reject) => {
      let resolved = false

      // Listen for completion
      const cleanupAck = this.on('FILE_CHUNK_ACK', (ack) => {
        if (ack?.fileId === fileId && options?.onProgress) {
          options.onProgress(ack.progress || 0)
        }
      })

      const cleanupDone = this.on('FILE_RECEIVED', (res) => {
        if (res?.fileId === fileId && !resolved) {
          resolved = true
          cleanupAck()
          cleanupDone()
          cleanupErr()
          if (options?.onProgress) options.onProgress(100)
          resolve(res)
        }
      })

      const cleanupErr = this.on('FILE_ERROR', (err) => {
        if (!resolved) {
          resolved = true
          cleanupAck()
          cleanupDone()
          cleanupErr()
          reject(new Error(err?.error || 'File transfer failed'))
        }
      })

      // Send FILE_START
      this.send(
        'FILE_START',
        {
          fileId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          totalChunks,
          options: options?.printOptions,
        },
        { orderId: options?.orderId, kioskId: options?.kioskId }
      )

      // Read & stream chunks
      let currentChunk = 0
      const reader = new FileReader()

      const readNextChunk = () => {
        const start = currentChunk * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        const slice = file.slice(start, end)
        reader.readAsArrayBuffer(slice)
      }

      reader.onload = (e) => {
        if (!e.target?.result) return
        const buffer = e.target.result as ArrayBuffer
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64Chunk = btoa(binary)
        const isLast = currentChunk === totalChunks - 1

        this.send(
          'FILE_CHUNK',
          {
            fileId,
            chunkIndex: currentChunk,
            chunkData: base64Chunk,
            isLast,
          },
          { orderId: options?.orderId, kioskId: options?.kioskId }
        )

        currentChunk++
        if (currentChunk < totalChunks) {
          readNextChunk()
        }
      }

      reader.onerror = (err) => {
        cleanupAck()
        cleanupDone()
        cleanupErr()
        reject(err)
      }

      readNextChunk()
    })
  }
}

// Global Singleton Instance
export const wsRelay = new WsRelayClient()
export const wsRelayClient = wsRelay

// Auto-connect on browser mount
if (typeof window !== 'undefined') {
  wsRelay.connect()
}

