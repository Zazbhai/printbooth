import { useState, useEffect, useCallback, useRef } from 'react'

export interface KioskTelemetry {
  kioskId: string
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE'
  printerStatus: 'READY' | 'BUSY' | 'PAPER_JAM' | 'OFFLINE'
  paperLevel: number
  tonerLevel: number
  lastSeen: number
  diagnostics: {
    cpuTempC: number
    memUsedPct: number
    diskFreeGb: number
  }
  activeJob?: {
    orderId: string
    page: number
    totalPages: number
    percent: number
  }
}

const DEFAULT_KIOSKS: Record<string, KioskTelemetry> = {
  'PB-001': {
    kioskId: 'PB-001',
    status: 'ONLINE',
    printerStatus: 'READY',
    paperLevel: 88,
    tonerLevel: 74,
    lastSeen: Date.now(),
    diagnostics: {
      cpuTempC: 48,
      memUsedPct: 34,
      diskFreeGb: 18.2,
    },
  },
  'PB-002': {
    kioskId: 'PB-002',
    status: 'ONLINE',
    printerStatus: 'READY',
    paperLevel: 62,
    tonerLevel: 45,
    lastSeen: Date.now() - 5000,
    diagnostics: {
      cpuTempC: 52,
      memUsedPct: 41,
      diskFreeGb: 22.4,
    },
  },
}

export function useKioskTelemetry() {
  const [kiosks, setKiosks] = useState<Map<string, KioskTelemetry>>(() => {
    const map = new Map<string, KioskTelemetry>()
    Object.entries(DEFAULT_KIOSKS).forEach(([id, k]) => map.set(id, k))
    return map
  })
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('connected')
  const [lastEvent, setLastEvent] = useState<any>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.hostname}:5000/device?kioskId=ADMIN_MONITOR`
      setWsStatus('connecting')
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('connected')
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          setLastEvent(msg)
          if (msg.type === 'TELEMETRY' && msg.kioskId) {
            setKiosks(prev => {
              const next = new Map(prev)
              next.set(msg.kioskId, {
                kioskId: msg.kioskId,
                status: msg.status || 'ONLINE',
                printerStatus: msg.printerStatus || 'READY',
                paperLevel: msg.paperLevel ?? 80,
                tonerLevel: msg.tonerLevel ?? 80,
                lastSeen: Date.now(),
                diagnostics: {
                  cpuTempC: msg.diagnostics?.cpuTempC ?? 45,
                  memUsedPct: msg.diagnostics?.memUsedPct ?? 35,
                  diskFreeGb: msg.diagnostics?.diskFreeGb ?? 20,
                },
                activeJob: msg.activeJob,
              })
              return next
            })
          }
        } catch {
          // ignore parsing error
        }
      }

      ws.onerror = () => {
        setWsStatus('error')
      }

      ws.onclose = () => {
        setWsStatus('disconnected')
      }
    } catch {
      setWsStatus('error')
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])

  return {
    kiosks,
    wsStatus,
    lastEvent,
    reconnect: connect,
  }
}
