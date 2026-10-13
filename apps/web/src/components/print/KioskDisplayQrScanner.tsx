import { useEffect, useRef, useState, useCallback } from 'react'
import jsQR from 'jsqr'
import {
  Lightning,
  ArrowsClockwise,
  WarningCircle,
  CheckCircle,
  ShieldCheck,
  ArrowLeft,
  Printer,
  Clock,
  User,
} from '@phosphor-icons/react'
import { claimKioskSession, getApiBase, decodeTokenSessionId } from '@/lib/kioskSession'
import './KioskDisplayQrScanner.css'

interface KioskDisplayQrScannerProps {
  kioskId: string
  kioskName?: string
  onSessionClaimed: (token: string, verifiedKioskId: string) => void
  onMachineInUse?: (kioskId: string, token: string) => void
  onSessionExpired?: (message: string) => void
  onCancel?: () => void
}

type PrinterBusyState = 'loading' | 'free' | 'busy' | 'printing' | 'paying' | 'error'

interface PrinterStatus {
  state: PrinterBusyState
  sessionState?: string
  occupiedSince?: number
  estimatedWait?: number
}

function getPrinterStatusDisplay(status: PrinterStatus): {
  label: string
  sublabel: string
  color: string
  dot: string
  animate: boolean
} {
  switch (status.state) {
    case 'loading':
      return {
        label: 'Checking station…',
        sublabel: 'Fetching live printer status',
        color: '#64748b',
        dot: '#64748b',
        animate: false,
      }
    case 'free':
      return {
        label: 'Printer Available',
        sublabel: 'Station is ready — scan the kiosk QR to start printing',
        color: '#16a34a',
        dot: '#16a34a',
        animate: true,
      }
    case 'busy':
    case 'paying':
      return {
        label: 'Station Currently Busy',
        sublabel: 'Someone is using this kiosk right now. Estimated wait: 2–3 min',
        color: '#f59e0b',
        dot: '#f59e0b',
        animate: true,
      }
    case 'printing':
      return {
        label: 'Printing in Progress',
        sublabel: 'Pages are being printed. Station frees up in ~1 min',
        color: '#dc2626',
        dot: '#dc2626',
        animate: true,
      }
    case 'error':
    default:
      return {
        label: 'Status Unknown',
        sublabel: 'Cannot connect to station — try scanning anyway',
        color: '#94a3b8',
        dot: '#94a3b8',
        animate: false,
      }
  }
}

export default function KioskDisplayQrScanner({
  kioskId,
  kioskName = 'PrintBooth Station',
  onSessionClaimed,
  onMachineInUse,
  onSessionExpired,
  onCancel,
}: KioskDisplayQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)

  const [hasCamera, setHasCamera] = useState<boolean>(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState<boolean>(true)
  const [torchAvailable, setTorchAvailable] = useState<boolean>(false)
  const [torchOn, setTorchOn] = useState<boolean>(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [scannedSuccess, setScannedSuccess] = useState<boolean>(false)
  const [statusMessage, setStatusMessage] = useState<string>('Point camera at the kiosk screen QR code')

  // ── Printer busy state ──
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus>({ state: 'loading' })
  const busyPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPrinterStatus = useCallback(async () => {
    if (!kioskId) return
    try {
      const apiBase = getApiBase()
      const res = await fetch(`${apiBase}/api/kiosk-sessions/active/${encodeURIComponent(kioskId)}`)
      if (!res.ok) {
        setPrinterStatus({ state: 'error' })
        return
      }
      const data = await res.json()
      if (!data.success || !data.session) {
        // No active session = printer is free
        setPrinterStatus({ state: 'free' })
        return
      }
      const sessionState = (data.session.state || '').toUpperCase()
      if (sessionState === 'QR_READY' || sessionState === 'EXPIRED') {
        setPrinterStatus({ state: 'free' })
      } else if (sessionState === 'PRINTING') {
        setPrinterStatus({
          state: 'printing',
          sessionState,
          occupiedSince: data.session.createdAt,
        })
      } else if (sessionState === 'PAYING') {
        setPrinterStatus({
          state: 'paying',
          sessionState,
          occupiedSince: data.session.createdAt,
        })
      } else if (sessionState === 'DONE' || sessionState === 'CANCELLED') {
        setPrinterStatus({ state: 'free' })
      } else {
        // CLAIMED, UPLOADING, CONFIRMING, CONFIGURING, REVIEWING = busy
        setPrinterStatus({
          state: 'busy',
          sessionState,
          occupiedSince: data.session.createdAt,
        })
      }
    } catch {
      setPrinterStatus({ state: 'error' })
    }
  }, [kioskId])

  useEffect(() => {
    fetchPrinterStatus()
    busyPollRef.current = setInterval(fetchPrinterStatus, 3000)
    return () => {
      if (busyPollRef.current) clearInterval(busyPollRef.current)
    }
  }, [fetchPrinterStatus])

  // Parse scanned text into a session token and kioskId
  const processQrContent = useCallback((content: string): boolean => {
    if (!content || typeof content !== 'string') return false
    const trimmed = content.trim()

    let extractedToken: string | null = null
    let extractedKioskId: string | null = null

    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const url = new URL(trimmed)
        extractedToken = url.searchParams.get('session')
        extractedKioskId = url.searchParams.get('id') || url.searchParams.get('printer_id')
      } else if (trimmed.includes('session=')) {
        const tokenMatch = trimmed.match(/session=([^&]+)/)
        if (tokenMatch) extractedToken = decodeURIComponent(tokenMatch[1])
        const idMatch = trimmed.match(/[?&]id=([^&]+)/)
        if (idMatch) extractedKioskId = decodeURIComponent(idMatch[1])
      } else if (trimmed.startsWith('ey') || trimmed.length > 30) {
        // Direct JWT or cryptographic session token
        extractedToken = trimmed
      }
    } catch {
      // Fallback regex matching
      const tokenMatch = trimmed.match(/session=([^&]+)/)
      if (tokenMatch) extractedToken = decodeURIComponent(tokenMatch[1])
    }

    if (extractedToken) {
      const targetId = (extractedKioskId || kioskId || 'PB-001').toUpperCase()
      setScannedSuccess(true)
      setStatusMessage('✓ QR Code Scanned! Connecting…')

      if (navigator.vibrate) {
        try { navigator.vibrate([40, 60, 40]) } catch {}
      }

      // Stop camera streams
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }

      // Stop busy polling
      if (busyPollRef.current) clearInterval(busyPollRef.current)

      claimKioskSession(extractedToken).then((result) => {
        if (result.machineInUse) {
          if (onMachineInUse) {
            onMachineInUse(targetId, extractedToken!)
          } else {
            setStatusMessage('⚠️ Kiosk is currently in use by another person.')
          }
          return
        }
        if (result.isExpired) {
          if (onSessionExpired) {
            onSessionExpired(result.message || 'This QR code has expired.')
          } else {
            setStatusMessage('⚠️ QR Code has expired. Point at the live QR on kiosk screen.')
            setScannedSuccess(false)
          }
          return
        }
        if (result.success) {
          const sessId = result.sessionId || decodeTokenSessionId(extractedToken!) || ''
          sessionStorage.setItem('pb_kiosk_session_token', extractedToken!)
          localStorage.setItem('pb_kiosk_session_token', extractedToken!)
          if (sessId) {
            sessionStorage.setItem('pb_kiosk_session_id', sessId)
            localStorage.setItem('pb_kiosk_session_id', sessId)
          }
          sessionStorage.setItem('pb_kiosk_id', targetId)
          localStorage.setItem('pb_kiosk_id', targetId)
          sessionStorage.setItem('pb_kiosk_id_from_session', targetId)
          onSessionClaimed(extractedToken!, targetId)
        } else {
          setStatusMessage(result.message || 'Unable to claim session. Please try again.')
          setScannedSuccess(false)
        }
      }).catch((err) => {
        console.warn('[KioskDisplayQrScanner] Claim failed:', err)
        setStatusMessage('Connection failed. Please retry scanning.')
        setScannedSuccess(false)
      })

      return true
    }

    return false
  }, [kioskId, onSessionClaimed, onMachineInUse, onSessionExpired])

  // Process video frames with jsQR
  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || scannedSuccess) return

    const video = videoRef.current
    const canvas = canvasRef.current

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        })

        if (code && code.data) {
          const success = processQrContent(code.data)
          if (success) return
        }
      }
    }

    if (!scannedSuccess) {
      animFrameRef.current = requestAnimationFrame(scanFrame)
    }
  }, [scannedSuccess, processQrContent])

  // Initialize camera stream
  const startCamera = useCallback(async (mode: 'environment' | 'user') => {
    setCameraError(null)
    setIsScanning(true)

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasCamera(false)
      setCameraError('Camera access is required to scan the kiosk screen QR code. Please enable camera permissions in your browser.')
      return
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.setAttribute('playsinline', 'true')
        await videoRef.current.play()
      }

      // Check for torch capability
      const track = stream.getVideoTracks()[0]
      if (track) {
        const capabilities = (track.getCapabilities && track.getCapabilities()) as any
        setTorchAvailable(Boolean(capabilities?.torch))
      }

      animFrameRef.current = requestAnimationFrame(scanFrame)
    } catch (err: any) {
      console.warn('[KioskDisplayQrScanner] Camera error:', err)
      setHasCamera(false)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission denied. Please allow camera access in your browser settings to scan the kiosk QR code.')
      } else {
        setCameraError('Unable to open camera on this device. Please check camera permissions in your browser.')
      }
    }
  }, [scanFrame])

  // Toggle torch / flashlight
  const toggleTorch = async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    if (track) {
      try {
        const newTorch = !torchOn
        await (track as any).applyConstraints({
          advanced: [{ torch: newTorch }],
        })
        setTorchOn(newTorch)
      } catch (e) {
        console.warn('[KioskDisplayQrScanner] Torch error:', e)
      }
    }
  }

  // Switch camera between front and back
  const flipCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextMode)
    startCamera(nextMode)
  }

  useEffect(() => {
    startCamera(facingMode)
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [facingMode, startCamera])

  const statusDisplay = getPrinterStatusDisplay(printerStatus)
  const isBusy = printerStatus.state === 'busy' || printerStatus.state === 'printing' || printerStatus.state === 'paying'

  return (
    <div className="pb-qr-scanner-root">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Top Bar with Station Indicator */}
      <div className="pb-qr-scanner-header">
        {onCancel && (
          <button
            type="button"
            className="pb-scanner-back-btn"
            onClick={onCancel}
            title="Go Back"
            aria-label="Go Back"
          >
            <ArrowLeft size={16} weight="bold" />
            <span>Back</span>
          </button>
        )}

        <div className="pb-scanner-station-pill">
          <span className="pb-scanner-dot-live" />
          <span>{kioskId} • {kioskName}</span>
        </div>
      </div>

      {/* ── Live Printer Status Banner ── */}
      <div className={`pb-printer-status-banner ${printerStatus.state}`}>
        <div className="pb-printer-status-left">
          <div
            className="pb-printer-status-icon"
            style={{ background: `${statusDisplay.color}18`, border: `1.5px solid ${statusDisplay.color}30` }}
          >
            {printerStatus.state === 'loading'
              ? <div className="pb-printer-status-spinner" />
              : printerStatus.state === 'free'
              ? <Printer size={18} weight="fill" color={statusDisplay.color} />
              : printerStatus.state === 'printing'
              ? <Printer size={18} weight="fill" color={statusDisplay.color} />
              : <User size={18} weight="fill" color={statusDisplay.color} />
            }
          </div>
          <div>
            <div
              className="pb-printer-status-label"
              style={{ color: statusDisplay.color }}
            >
              {statusDisplay.label}
            </div>
            <div className="pb-printer-status-sub">{statusDisplay.sublabel}</div>
          </div>
        </div>

        <div
          className={`pb-printer-status-dot-outer ${statusDisplay.animate ? 'animate' : ''}`}
          style={{
            background: `${statusDisplay.color}20`,
          }}
        >
          <div
            className="pb-printer-status-dot-inner"
            style={{ background: statusDisplay.color }}
          />
        </div>
      </div>

      {/* ── Busy Warning Card — only shown when station is occupied ── */}
      {isBusy && (
        <div className="pb-busy-warning-card">
          <Clock size={15} weight="fill" color="#f59e0b" style={{ flexShrink: 0 }} />
          <span>
            {printerStatus.state === 'printing'
              ? 'Pages currently printing — station frees up in about 1 minute. You can scan now to queue next.'
              : "Another customer is at this station. Scan now and you'll start automatically when it's free."}
          </span>
        </div>
      )}

      {/* Main Scanner Shell */}
      <div className="pb-qr-scanner-card">
        <div className="pb-scanner-intro">
          <div className="pb-scanner-intro-icon">
            <Printer size={24} weight="bold" color="#dc2626" />
          </div>
          <div>
            <h1 className="pb-scanner-title">Scan Kiosk Display to Continue</h1>
            <p className="pb-scanner-subtitle">
              Look at the physical PrintBooth screen ({kioskId}) and scan the QR code to pair your phone.
            </p>
          </div>
        </div>

        {/* Viewfinder Camera Box */}
        <div className={`pb-scanner-viewport ${scannedSuccess ? 'success' : ''}`}>
          {hasCamera ? (
            <video
              ref={videoRef}
              className="pb-scanner-video"
              muted
              playsInline
              autoPlay
            />
          ) : (
            <div className="pb-scanner-placeholder">
              <WarningCircle size={42} weight="fill" color="#dc2626" />
              <p className="pb-scanner-placeholder-text">
                {cameraError || 'Camera unavailable'}
              </p>
            </div>
          )}

          {/* Viewfinder Target HUD Overlay */}
          <div className="pb-scanner-hud">
            <div className="pb-scanner-corner pb-corner-tl" />
            <div className="pb-scanner-corner pb-corner-tr" />
            <div className="pb-scanner-corner pb-corner-bl" />
            <div className="pb-scanner-corner pb-corner-br" />

            {/* Sweeping Laser Scanner Line */}
            {isScanning && !scannedSuccess && (
              <div className="pb-scanner-laser-line" />
            )}

            {/* Success Overlay Indicator */}
            {scannedSuccess && (
              <div className="pb-scanner-success-badge animate-scaleUp">
                <CheckCircle size={56} weight="fill" color="#16a34a" />
                <span>Connected!</span>
              </div>
            )}
          </div>

          {/* In-Viewfinder Camera Controls */}
          {hasCamera && !scannedSuccess && (
            <div className="pb-scanner-hud-controls">
              {torchAvailable && (
                <button
                  type="button"
                  className={`pb-scanner-hud-btn ${torchOn ? 'active' : ''}`}
                  onClick={toggleTorch}
                  title="Toggle Flashlight"
                  aria-label="Toggle Flashlight"
                >
                  <Lightning size={18} weight="bold" />
                </button>
              )}

              <button
                type="button"
                className="pb-scanner-hud-btn"
                onClick={flipCamera}
                title="Switch Camera"
                aria-label="Switch Camera"
              >
                <ArrowsClockwise size={18} weight="bold" />
              </button>
            </div>
          )}
        </div>

        {/* Status Callout Bar */}
        <div className={`pb-scanner-status-bar ${scannedSuccess ? 'success' : ''}`}>
          <span className="pb-scanner-status-dot" />
          <span className="pb-scanner-status-text">{statusMessage}</span>
        </div>

        {/* Security & Zero-Touch Assurance */}
        <div className="pb-scanner-trust-footer">
          <ShieldCheck size={14} weight="fill" color="#16a34a" />
          <span>Encrypted One-Time Kiosk Session • No App Required</span>
        </div>
      </div>
    </div>
  )
}
