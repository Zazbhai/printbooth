import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { PrintFlowContext, type PrintStep } from './PrintFlowContext'
import PrintLayout from '../../components/layout/PrintLayout'
import MultiFilePage from './MultiFilePage'
import ConfirmPage from './ConfirmPage'
import SelectKioskPage from './SelectKioskPage'
import PrintSettingsPage from './PrintSettingsPage'
import ReviewPage from './ReviewPage'
import PaymentPage from './PaymentPage'
import StatusPage from './StatusPage'
import SuccessPage from './SuccessPage'
import KioskDisplayQrScanner from '../../components/print/KioskDisplayQrScanner'
import ErrorBoundary from '../../components/ui/ErrorBoundary'
import PageTransition3D from '../../components/ui/PageTransition3D'
import { InvalidKioskView } from '../../components/ui/InvalidKioskView'
import { MachineInUseView } from '../../components/ui/MachineInUseView'
import { SessionExpiredView } from '../../components/ui/SessionExpiredView'
import PrinterErrorOverlay from '../../components/ui/PrinterErrorOverlay'
import PrintingBoothLoader from '../../components/ui/PrintingBoothLoader'
import NotFoundPage from '../NotFoundPage'
import { getLiveKiosks, getKioskDetails, checkPrinterHardwareStatus } from '@/lib/api'
import { wsRelayClient } from '@/lib/wsRelayClient'
import { hasRealUploadedDoc, clearUploadedDoc } from '@/lib/documentStore'
import {
  hasAnyReadyFile,
  setKioskPricing,
  setKioskVariant,
  getAllFiles,
  calcFileTotalSheets,
  computeTotalPrice,
  clearAllFiles,
} from '@/lib/multiFileStore'
import {
  isCanonicalKioskFormat,
  normalizeKioskTypo,
  validateKioskId,
  VERIFIED_KIOSKS,
  type KioskValidationResult,
} from '@/lib/kioskValidation'
import SEO from '../../components/common/SEO'
import {
  kioskSession,
  getSessionTokenFromUrl,
  claimKioskSession,
  clearActiveKioskSession,
  markTokenExpired,
  isTokenExpired,
  getApiBase,
  decodeTokenSessionId,
} from '@/lib/kioskSession'
import PleaseUsePhoneView from '../../components/print/PleaseUsePhoneView'
import { isSmartphoneOrTablet } from '@/lib/deviceDetect'
import './PrintNeomorphism.css'

const STEP_ORDER: Record<string, number> = {
  upload: 0,
  confirm_doc: 1,
  kiosk: 1.5,
  settings: 2,
  confirm_final: 3,
  review: 3,
  payment: 4,
  status: 5,
  success: 6,
}

const getStepRank = (step: PrintStep): number => {
  const confirmMode = typeof window !== 'undefined' ? (sessionStorage.getItem('pb_confirm_mode') || 'doc') : 'doc'
  if (step === 'confirm') return confirmMode === 'final' ? 3 : 1
  return STEP_ORDER[step] ?? 0
}

export default function UnifiedPrintPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const rawSearch = typeof window !== 'undefined' ? window.location.search : ''
  const directQueryMatch = rawSearch.match(/[?&](PB-[a-zA-Z0-9_-]+)/i)
  const directParamId = directQueryMatch ? directQueryMatch[1].toUpperCase() : null
  const rawIdParam = searchParams.get('id') || searchParams.get('printer_id') || searchParams.get('kiosk') || directParamId
  const urlId = rawIdParam ? rawIdParam.trim().toUpperCase() : null
  const paramStep = searchParams.get('step') as PrintStep | null
  const savedKioskId = typeof window !== 'undefined'
    ? (sessionStorage.getItem('pb_kiosk_id') || localStorage.getItem('pb_kiosk_id'))
    : null

  // Determine if there is an active document being processed in this session
  const hasActiveJob =
    hasRealUploadedDoc() ||
    hasAnyReadyFile() ||
    getAllFiles().length > 0 ||
    Boolean(typeof window !== 'undefined' && (
      sessionStorage.getItem('pb_files') ||
      sessionStorage.getItem('pb_file_name') ||
      sessionStorage.getItem('pb_uploaded_file')
    ))

  // Sanitize double ampersands from incoming URLs (e.g. ?id=PB-001&&step=upload)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('&&')) {
      const cleanSearch = window.location.search.replace(/&&+/g, '&')
      window.history.replaceState({}, '', `${window.location.pathname}${cleanSearch}`)
    }
  }, [])

  // Saved kiosk fallback (persisted in session)
  const rawId = urlId || savedKioskId || null

  const [liveKiosks, setLiveKiosks] = useState<any[] | null>(null)
  const [isLiveKiosksLoading, setIsLiveKiosksLoading] = useState<boolean>(true)

  // ── 1. Strict Kiosk Validation (Eliminates false machine parameters like p-002) ──
  const validation: KioskValidationResult = useMemo(() => {
    return validateKioskId(rawId, liveKiosks, isLiveKiosksLoading)
  }, [rawId, liveKiosks, isLiveKiosksLoading])

  // Active verified printerId
  const [printerId, setPrinterIdState] = useState<string>(() => {
    if (urlId && isCanonicalKioskFormat(urlId)) {
      return urlId.trim().toUpperCase()
    }
    if (validation.status === 'VALID') {
      return validation.kioskId
    }
    if (savedKioskId && isCanonicalKioskFormat(savedKioskId)) {
      return savedKioskId.trim().toUpperCase()
    }
    return ''
  })

  // Sync printerId if urlId becomes available
  useEffect(() => {
    if (urlId && isCanonicalKioskFormat(urlId)) {
      setPrinterIdState(urlId.trim().toUpperCase())
    }
  }, [urlId])

  const [kioskName, setKioskName] = useState<string>(() => {
    if (validation.status === 'VALID' && validation.meta) {
      return validation.meta.name
    }
    if (typeof window !== 'undefined') {
      return (sessionStorage.getItem('pb_kiosk_name') || localStorage.getItem('pb_kiosk_name')) || ''
    }
    return ''
  })

  // Device detection: Smartphone or tablet access check
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(() => isSmartphoneOrTablet())

  useEffect(() => {
    const handleDeviceCheck = () => {
      setIsMobileDevice(isSmartphoneOrTablet())
    }
    handleDeviceCheck()
    window.addEventListener('resize', handleDeviceCheck)
    return () => window.removeEventListener('resize', handleDeviceCheck)
  }, [])

  // When visiting raw /print?PB-00X or /print?id=PB-00X without a ?session= URL token,
  // user must scan the QR code on the kiosk machine before upload is unlocked.
  // CRITICAL FIX: If user explicitly requested upload (step=upload) or has files in progress,
  // NEVER hijack with the camera QR scanner!
  const urlSessionToken = searchParams.get('session') || (typeof window !== 'undefined' ? getSessionTokenFromUrl() : null)
  const isTargetingKiosk = Boolean(printerId && isCanonicalKioskFormat(printerId))
  const hasActiveSession = Boolean(urlSessionToken)

  // A session is verified ONLY when the user scanned a QR code providing a valid session token
  const hasVerifiedSession = Boolean(
    (urlSessionToken && !isTokenExpired(urlSessionToken)) ||
    (typeof window !== 'undefined' && sessionStorage.getItem('pb_kiosk_session_token') && !isTokenExpired(sessionStorage.getItem('pb_kiosk_session_token')!))
  )

  // Machine Already In Use state (when another user claimed the kiosk session or printer is busy)
  const [machineInUseState, setMachineInUseState] = useState<{
    inUse: boolean
    kioskId?: string
    token?: string
  } | null>(null)
  const [isPrinterBusy, setIsPrinterBusy] = useState(false)

  // Session Expired state (when QR code link is expired or completed)
  const [sessionExpiredState, setSessionExpiredState] = useState<{
    isExpired: boolean
    kioskId?: string
    message?: string
  } | null>(null)

  // Probe kiosk session and printer hardware status to detect if printer is in use by another customer
  useEffect(() => {
    let mounted = true
    const activeKioskId = printerId || 'PB-001'

    const checkPrinterBusy = async () => {
      try {
        const apiBase = getApiBase()
        const [sessRes, hwRes] = await Promise.all([
          fetch(`${apiBase}/api/kiosk-sessions/active/${encodeURIComponent(activeKioskId)}`).catch(() => null),
          fetch(`${apiBase}/api/printer/status?kioskId=${encodeURIComponent(activeKioskId)}`).catch(() => null),
        ])

        if (!mounted) return

        let sessionBusy = false
        if (sessRes && sessRes.ok) {
          const sessData = await sessRes.json().catch(() => null)
          if (
            sessData &&
            sessData.hasActiveSession &&
            sessData.session?.state &&
            sessData.session.state !== 'QR_READY' &&
            sessData.session.state !== 'DONE' &&
            sessData.session.state !== 'CANCELLED' &&
            sessData.session.state !== 'EXPIRED' &&
            !sessData.isExpired
          ) {
            // Check if current browser is the owner of this active session
            const myToken = urlSessionToken || (typeof window !== 'undefined' ? sessionStorage.getItem('pb_kiosk_session_token') : null)
            const mySessionId = typeof window !== 'undefined' ? sessionStorage.getItem('pb_kiosk_session_id') : null
            const isMySession =
              (myToken && sessData.session.token === myToken) ||
              (mySessionId && sessData.session.sessionId === mySessionId) ||
              (myToken && decodeTokenSessionId(myToken) === sessData.session.sessionId)

            if (!isMySession) {
              // Strictly enforce one person at a time: another customer has claimed the kiosk session
              sessionBusy = true
            } else {
              sessionBusy = false
              setIsPrinterBusy(false)
              setMachineInUseState(null)
            }
          }

          // If this browser claimed a session, check if it has expired
          const myToken = (typeof window !== 'undefined' ? sessionStorage.getItem('pb_kiosk_session_token') : null) || urlSessionToken
          const mySessionId = typeof window !== 'undefined' ? sessionStorage.getItem('pb_kiosk_session_id') : null
          if (mySessionId || myToken) {
            const matchesMySession = Boolean(
              (mySessionId && sessData?.session?.sessionId === mySessionId) ||
              (myToken && sessData?.session?.token === myToken)
            )

            // If kiosk state is QR_READY and session does not match ours, the kiosk rotated to fresh session.
            // Clear any stale local session keys so we don't trigger false expired loops.
            if (!matchesMySession && sessData?.session?.state === 'QR_READY') {
              clearActiveKioskSession()
            }

            const isSessionExpired = matchesMySession && (
              sessData?.isExpired === true ||
              sessData?.session?.state === 'EXPIRED'
            )

            const currentSavedStep = typeof window !== 'undefined' ? sessionStorage.getItem('pb_print_step') : null
            const isFinishedOrPrinting = currentSavedStep === 'status' || currentSavedStep === 'success' || paramStep === 'status' || paramStep === 'success'

            if (isSessionExpired && !isFinishedOrPrinting) {
              console.warn('[UnifiedPrintPage] ⏱️ Detected expired session during probe:', sessData)
              clearActiveKioskSession()
              clearAllFiles()
              clearUploadedDoc()
              setMachineInUseState(null)
              setSessionExpiredState({
                isExpired: true,
                kioskId: activeKioskId,
                message: 'This session has expired. Redirecting to print upload…',
              })
              return
            }
          }
        }

        let hwBusy = false
        if (hwRes && hwRes.ok) {
          const hwData = await hwRes.json().catch(() => null)
          if (hwData && (hwData.printerStatus === 'BUSY' || hwData.printerStatus === 'PRINTING' || hwData.isBusy === true)) {
            hwBusy = true
          }
        }

        const isBusyNow = sessionBusy || hwBusy
        setIsPrinterBusy(isBusyNow)
        if (sessionBusy) {
          setMachineInUseState({
            inUse: true,
            kioskId: activeKioskId,
          })
        } else if (!hwBusy) {
          setMachineInUseState(null)
        }
      } catch {
        // Non-blocking status probe
      }
    }

    checkPrinterBusy()
    const interval = setInterval(checkPrinterBusy, 2000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [printerId, urlSessionToken])

  useEffect(() => {
    const handleMachineInUseEvent = (e: any) => {
      setMachineInUseState({
        inUse: true,
        kioskId: e.detail?.kioskId || printerId || 'PB-001',
        token: e.detail?.token,
      })
      setIsPrinterBusy(true)
    }
    window.addEventListener('kiosk:machine_in_use', handleMachineInUseEvent)
    return () => window.removeEventListener('kiosk:machine_in_use', handleMachineInUseEvent)
  }, [printerId])

  // Purge corrupt machine IDs ONLY if confirmed invalid format (malformed / invalid characters)
  useEffect(() => {
    if (!isLiveKiosksLoading && validation.status === 'INVALID_FORMAT') {
      sessionStorage.removeItem('pb_kiosk_id')
      sessionStorage.removeItem('pb_kiosk_name')
      localStorage.removeItem('pb_kiosk_id')
      localStorage.removeItem('pb_kiosk_name')
      if (!urlId) {
        setPrinterIdState('')
        setKioskName('')
      }
    }
  }, [urlId, validation.status, isLiveKiosksLoading])

  // Fetch live kiosks for registry verification & pricing (polls every 5s to catch printers coming back online)
  useEffect(() => {
    let mounted = true
    async function fetchKiosks() {
      try {
        const kiosks = await getLiveKiosks()
        if (mounted) {
          if (kiosks && Array.isArray(kiosks)) {
            const activeOnly = kiosks.filter((k: any) => !k.isBlocked && !k.merchantBlocked && k.status !== 'BLOCKED')
            setLiveKiosks(activeOnly)
          } else {
            setLiveKiosks([])
          }
          setIsLiveKiosksLoading(false)
        }
      } catch (e) {
        console.warn('[UnifiedPrintPage] Live kiosks fetch error:', e)
        if (mounted) {
          setLiveKiosks([])
          setIsLiveKiosksLoading(false)
        }
      }
    }
    fetchKiosks()
    const pollInterval = setInterval(fetchKiosks, 5000)
    return () => {
      mounted = false
      clearInterval(pollInterval)
    }
  }, [])

  // Resolve kiosk details & pricing when valid printerId is active
  useEffect(() => {
    if (!printerId || !isCanonicalKioskFormat(printerId)) return
    let mounted = true

    async function resolveKiosk() {
      try {
        const details = await getKioskDetails(printerId)
        if (mounted && details) {
          if (details.name) {
            setKioskName(details.name)
            sessionStorage.setItem('pb_kiosk_name', details.name)
          }
          if (details.pricing) {
            setKioskPricing(details.pricing)
          }
          if (details.kioskVariant || details.variant) {
            setKioskVariant(details.kioskVariant || details.variant)
          }
          sessionStorage.setItem('pb_kiosk_id', details.kioskId || printerId)
          return
        }

        if (liveKiosks && Array.isArray(liveKiosks)) {
          const match = liveKiosks.find((k: any) => (k.id || k.kioskId) === printerId)
          if (match && mounted) {
            setKioskName(match.name)
            sessionStorage.setItem('pb_kiosk_id', match.id || printerId)
            sessionStorage.setItem('pb_kiosk_name', match.name)
            if (match.pricing) {
              setKioskPricing(match.pricing)
            }
            if (match.kioskVariant || match.variant) {
              setKioskVariant(match.kioskVariant || match.variant)
            }
            return
          }
        }
      } catch {
        // Fallback
      }

      if (mounted && VERIFIED_KIOSKS[printerId]) {
        const meta = VERIFIED_KIOSKS[printerId]
        setKioskName(meta.name)
        sessionStorage.setItem('pb_kiosk_id', printerId)
        localStorage.setItem('pb_kiosk_id', printerId)
        sessionStorage.setItem('pb_kiosk_name', meta.name)
        localStorage.setItem('pb_kiosk_name', meta.name)
      }
    }

    resolveKiosk()
    return () => {
      mounted = false
    }
  }, [printerId, liveKiosks])

  // Sync printerId state with rawId if rawId is valid
  useEffect(() => {
    if (validation.status === 'VALID' && validation.kioskId !== printerId) {
      setPrinterIdState(validation.kioskId)
      sessionStorage.setItem('pb_kiosk_id', validation.kioskId)
      localStorage.setItem('pb_kiosk_id', validation.kioskId)
      if (validation.meta?.name) {
        setKioskName(validation.meta.name)
        sessionStorage.setItem('pb_kiosk_name', validation.meta.name)
        localStorage.setItem('pb_kiosk_name', validation.meta.name)
      }
    }
  }, [validation, printerId])

  // ── Kiosk QR Session: claim on mount if ?session= or direct ?id= param present ──
  const claimedTokensRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const rawToken = getSessionTokenFromUrl() || (typeof window !== 'undefined' ? sessionStorage.getItem('pb_kiosk_session_token') : null)
    if (!rawToken) return
    const token = rawToken.trim()
    if (!token) return

    // Never re-claim tokens that are already claimed or marked expired (prevents infinite refresh loop)
    if (claimedTokensRef.current.has(token) || isTokenExpired(token)) {
      return
    }
    claimedTokensRef.current.add(token)

    claimKioskSession(token).then(result => {
      const activeKiosk = result.kioskId || printerId || (typeof window !== 'undefined' ? sessionStorage.getItem('pb_kiosk_id') : null) || 'PB-001'

      if (result.machineInUse) {
        // Machine is in use by another customer!
        console.warn(`[UnifiedPrintPage] Kiosk ${activeKiosk} is in use by another customer.`)
        clearActiveKioskSession()
        clearAllFiles()
        clearUploadedDoc()

        setPrinterIdState(activeKiosk)
        sessionStorage.setItem('pb_kiosk_id', activeKiosk)

        setMachineInUseState({
          inUse: true,
          kioskId: activeKiosk,
          token,
        })
        setIsPrinterBusy(true)

        // Clear session parameter from URL so the URL redirects cleanly to /print?id=PB-001
        setSearchParams(prev => {
          const next = new URLSearchParams(prev)
          next.delete('session')
          next.delete('step')
          next.set('id', activeKiosk)
          return next
        }, { replace: true })
        setCurrentStep('upload')
      } else if (result.isExpired) {
        // Security: Expired or completed session link!
        // Bulletproof handling: Lock screen to SessionExpiredView — DO NOT allow upload or bypass!
        console.warn(`[UnifiedPrintPage] 🔒 Expired/invalid session link detected for ${activeKiosk}:`, result.error)
        markTokenExpired(token)
        clearActiveKioskSession()
        clearAllFiles()
        clearUploadedDoc()

        // Clean the browser address bar immediately so stale ?session= NEVER persists
        if (typeof window !== 'undefined') {
          const cleanUrl = `/print?id=${encodeURIComponent(activeKiosk)}&step=upload`
          window.history.replaceState({}, '', cleanUrl)
        }

        setPrinterIdState(activeKiosk)
        sessionStorage.setItem('pb_kiosk_id', activeKiosk)
        setMachineInUseState(null)
        setSessionExpiredState({
          isExpired: true,
          kioskId: activeKiosk,
          message: result.message || 'This QR code has expired. Please scan the current live QR code on the kiosk screen.',
        })
      } else if (result.success) {
        setSessionExpiredState(null)
        setMachineInUseState(null)
        setIsPrinterBusy(false)
        const incomingVariant = (result as any).kioskVariant || (result as any).variant
        if (incomingVariant) {
          setKioskVariant(incomingVariant, activeKiosk)
        }
      }
    })
  }, [printerId])

  // ── Step management (Preserves stage and files across page refresh / back navigation) ──
  const [currentStep, setCurrentStep] = useState<PrintStep>(() => {
    const savedStep = typeof window !== 'undefined' ? (sessionStorage.getItem('pb_print_step') as PrintStep | null) : null
    const hasValidToken = Boolean(
      (urlSessionToken && !isTokenExpired(urlSessionToken)) ||
      (typeof window !== 'undefined' && sessionStorage.getItem('pb_kiosk_session_token') && !isTokenExpired(sessionStorage.getItem('pb_kiosk_session_token')!))
    )

    // 1. Explicit requested step in query parameter
    if (paramStep && ['status', 'success', 'payment', 'review', 'settings', 'confirm', 'upload', 'kiosk'].includes(paramStep)) {
      if (['upload', 'confirm', 'settings', 'review', 'payment'].includes(paramStep) && !hasValidToken) {
        return 'kiosk'
      }
      return paramStep
    }

    // 2. User is actively continuing an existing print flow with verified session
    if (hasValidToken && hasActiveJob && savedStep && ['payment', 'review', 'settings', 'confirm', 'upload'].includes(savedStep)) {
      return savedStep
    }
    if (hasValidToken && savedStep && ['status', 'success'].includes(savedStep)) {
      return savedStep
    }

    // 3. If verified session exists, unlock upload
    if (hasValidToken) {
      return 'upload'
    }

    // 4. Default: User must scan QR code on kiosk screen before upload is accessible
    return 'kiosk'
  })

  // ── Browser Back / Forward Button Handling (popstate listener) ──
  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search)
      const poppedStep = sp.get('step') as PrintStep | null
      const validList: PrintStep[] = ['upload', 'confirm', 'settings', 'review', 'payment', 'status', 'success', 'kiosk']
      if (poppedStep && validList.includes(poppedStep)) {
        lastTargetStepRef.current = poppedStep
        setCurrentStep(poppedStep)
        sessionStorage.setItem('pb_print_step', poppedStep)
      } else if (!poppedStep) {
        const hasFiles = hasRealUploadedDoc() || hasAnyReadyFile() || Boolean(typeof window !== 'undefined' && sessionStorage.getItem('pb_files'))
        const target: PrintStep = hasFiles ? 'upload' : 'kiosk'
        lastTargetStepRef.current = target
        setCurrentStep(target)
        sessionStorage.setItem('pb_print_step', target)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // ── Phone session lifecycle: reconnect on return, only notify exit on true page departure ──
  useEffect(() => {
    if (!kioskSession.isKioskSession()) return

    // When user returns from file picker, camera, or another app, immediately re-engage kiosk
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        kioskSession.notifyPhoneReconnect()
      }
    }

    const handleTruePageHide = (e: PageTransitionEvent) => {
      // Only notify if truly unloading/leaving the page, not caching in bfcache or opening file dialog
      if (!e.persisted) {
        const hasFiles = hasRealUploadedDoc() || hasAnyReadyFile()
        if (!hasFiles) {
          kioskSession.notifyPhoneBackOrExit()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handleTruePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handleTruePageHide)
    }
  }, [])

  // ── Session Expired Listener: Locks screen to SessionExpiredView if 1-min inactivity timeout occurs ──
  useEffect(() => {
    const handleExpiredEvent = (e: any) => {
      console.warn('[UnifiedPrintPage] ⏱️ Session expired due to inactivity:', e.detail)
      // Mark the active token as expired so it cannot be re-claimed
      const expiredToken = sessionStorage.getItem('pb_kiosk_session_token') || getSessionTokenFromUrl()
      if (expiredToken) markTokenExpired(expiredToken)
      clearActiveKioskSession()
      clearAllFiles()
      clearUploadedDoc()
      const kiosk = printerId || 'PB-001'
      setMachineInUseState(null)
      setSessionExpiredState({
        isExpired: true,
        kioskId: kiosk,
        message: e.detail?.message || 'Session expired due to 1 minute of inactivity. Please scan the current live QR code on the kiosk screen.',
      })
    }

    window.addEventListener('pb:session-expired', handleExpiredEvent)

    // Periodic check for session expiration while connected in kiosk mode
    let intervalId: any = null
    if (kioskSession.isKioskSession() && currentStep !== 'status' && !sessionExpiredState?.isExpired) {
      intervalId = setInterval(async () => {
        try {
          const status = await kioskSession.getStatus()
          if (status?.isExpired) {
            handleExpiredEvent({ detail: status })
          }
        } catch {}
      }, 3000)
    }

    return () => {
      window.removeEventListener('pb:session-expired', handleExpiredEvent)
      if (intervalId) clearInterval(intervalId)
    }
  }, [printerId, currentStep, sessionExpiredState?.isExpired])

  // ── Kiosk QR Session: report step changes back to kiosk display ──
  useEffect(() => {
    if (!kioskSession.isKioskSession()) return
    const readyFiles = getAllFiles().filter(f => f.status === 'ready')
    const primaryFile = readyFiles[0]
    const fileName = readyFiles.length > 1
      ? `${readyFiles.length} Files: ${readyFiles.map(f => f.fileName).join(', ')}`
      : primaryFile?.fileName
    const totalSheets = readyFiles.reduce((acc, f) => acc + (calcFileTotalSheets(f) || f.pageCount || 1), 0)
    const amount = computeTotalPrice()
    const colourMode = readyFiles.some(f => f.settings?.colour === 'COLOUR') ? 'COLOUR' : 'BW'
    const copies = readyFiles[0]?.settings?.copies || 1
    const filesList = readyFiles.map(f => ({
      id: f.id,
      fileName: f.fileName,
      fileSize: f.fileSize,
      fileType: f.fileType,
      pageCount: f.pageCount || 1,
      copies: f.settings?.copies || 1,
      colour: f.settings?.colour || 'BW',
      duplex: f.settings?.duplex || 'SINGLE',
    }))

    switch (currentStep) {
      case 'upload':
        if (fileName && readyFiles.length > 0) {
          kioskSession.reportUploading(fileName)
        }
        break
      case 'confirm':
        kioskSession.reportConfirming({
          fileName,
          totalPages: totalSheets || undefined,
          files: filesList,
        })
        break
      case 'settings':
        kioskSession.reportConfiguring({
          fileName,
          totalPages: totalSheets || undefined,
          copies,
          colourMode,
          duplex: readyFiles[0]?.settings?.duplex || 'SINGLE',
          amount: amount || undefined,
          files: filesList,
        })
        break
      case 'review': {
        const isBackwardNav = previousStepRef.current === 'payment'
        kioskSession.reportReviewing({
          fileName,
          totalPages: totalSheets || undefined,
          copies,
          colourMode,
          duplex: readyFiles[0]?.settings?.duplex || 'SINGLE',
          amount: amount || undefined,
          files: filesList,
          isBackwardNav,
        })
        break
      }
      case 'payment': {
        const savedOrderId = typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem('pb_order_id') || undefined) : undefined
        kioskSession.reportPaying({
          fileName,
          totalPages: totalSheets || undefined,
          copies,
          colourMode,
          duplex: readyFiles[0]?.settings?.duplex || 'SINGLE',
          amount: amount || undefined,
          orderId: savedOrderId,
          files: filesList,
        })
        break
      }
      default:
        break
    }
    previousStepRef.current = currentStep
  }, [currentStep])

  const previousStepRef = useRef<PrintStep | null>(null)
  const lastTargetStepRef = useRef<PrintStep | null>(null)

  const goToStep = useCallback((step: PrintStep, options?: { replace?: boolean }) => {
    lastTargetStepRef.current = step
    setCurrentStep(step)
    sessionStorage.setItem('pb_print_step', step)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      const curSession = next.get('session') || (typeof window !== 'undefined' ? (sessionStorage.getItem('pb_kiosk_session_token') || localStorage.getItem('pb_kiosk_session_token')) : null)
      const curKiosk = next.get('id') || printerId || (typeof window !== 'undefined' ? sessionStorage.getItem('pb_kiosk_id') : null)
      if (curSession && !isTokenExpired(curSession)) {
        next.set('session', curSession)
      }
      if (curKiosk) {
        next.set('id', curKiosk)
      }
      if (step === 'upload' && !curKiosk && !curSession) {
        next.delete('step')
      } else {
        next.set('step', step)
      }
      return next
    }, { replace: options?.replace ?? false })
  }, [setSearchParams, printerId])

  const handleRetrySession = useCallback(() => {
    const token =
      machineInUseState?.token ||
      getSessionTokenFromUrl() ||
      (typeof window !== 'undefined' ? sessionStorage.getItem('pb_kiosk_session_token') : null)
    if (!token) {
      setMachineInUseState(null)
      return
    }
    claimKioskSession(token).then(result => {
      if (result.machineInUse) {
        setMachineInUseState({
          inUse: true,
          kioskId: result.kioskId || printerId || 'PB-001',
          token,
        })
        setIsPrinterBusy(true)
      } else if (result.success) {
        setMachineInUseState(null)
        setIsPrinterBusy(false)
        goToStep('upload')
      } else {
        // Expired on retry: clear and strip session
        clearActiveKioskSession()
        clearAllFiles()
        clearUploadedDoc()
        setMachineInUseState(null)
        setIsPrinterBusy(false)
        setSearchParams(prev => {
          const next = new URLSearchParams(prev)
          next.delete('session')
          next.delete('step')
          return next
        }, { replace: true })
      }
    })
  }, [machineInUseState?.token, printerId, goToStep, setSearchParams])

  // Guard against direct parameter access like ?step=confirm when no files exist
  useEffect(() => {
    const hasActiveFiles =
      hasRealUploadedDoc() ||
      hasAnyReadyFile() ||
      getAllFiles().length > 0 ||
      Boolean(typeof window !== 'undefined' && (
        sessionStorage.getItem('pb_files') ||
        sessionStorage.getItem('pb_file_name') ||
        sessionStorage.getItem('pb_uploaded_file') ||
        sessionStorage.getItem('pb_kiosk_session_token')
      ))

    if (!hasActiveFiles && paramStep && ['confirm', 'settings', 'review', 'payment'].includes(paramStep)) {
      const hasStoredFiles = Boolean(
        typeof window !== 'undefined' && (
          sessionStorage.getItem('pb_files') ||
          sessionStorage.getItem('pb_file_name') ||
          sessionStorage.getItem('pb_uploaded_file')
        )
      )
      if (!hasStoredFiles && getAllFiles().length === 0) {
        goToStep('kiosk')
        return
      }
    }

    if (paramStep && ['upload', 'confirm', 'settings', 'review', 'payment', 'status', 'success', 'kiosk', 'history'].includes(paramStep)) {
      if (['upload', 'confirm', 'settings', 'review', 'payment'].includes(paramStep) && !hasVerifiedSession) {
        goToStep('kiosk')
        return
      }
      if (paramStep !== currentStep) {
        // If currentStep was just explicitly updated via goToStep or popstate and paramStep is lagging behind in searchParams, do not revert!
        const storedStep = typeof window !== 'undefined' ? (sessionStorage.getItem('pb_print_step') as PrintStep | null) : null
        if (storedStep === currentStep || (lastTargetStepRef.current && paramStep !== lastTargetStepRef.current)) {
          return
        }
        lastTargetStepRef.current = null
        setCurrentStep(paramStep)
        sessionStorage.setItem('pb_print_step', paramStep)
      } else {
        lastTargetStepRef.current = null
      }
    }
  }, [paramStep, currentStep, goToStep, urlId, printerId, savedKioskId])

  // If truly no files and no active session token are present and step is beyond upload/status/success/kiosk, reset to kiosk
  useEffect(() => {
    const hasFiles =
      hasRealUploadedDoc() ||
      hasAnyReadyFile() ||
      getAllFiles().length > 0 ||
      Boolean(typeof window !== 'undefined' && (
        sessionStorage.getItem('pb_files') ||
        sessionStorage.getItem('pb_file_name') ||
        sessionStorage.getItem('pb_uploaded_file') ||
        sessionStorage.getItem('pb_kiosk_session_token')
      ))
    if (!hasFiles && ['confirm', 'settings', 'review', 'payment'].includes(currentStep)) {
      const hasStoredFiles = Boolean(
        typeof window !== 'undefined' && (
          sessionStorage.getItem('pb_files') ||
          sessionStorage.getItem('pb_file_name') ||
          sessionStorage.getItem('pb_uploaded_file')
        )
      )
      if (!hasStoredFiles && getAllFiles().length === 0) {
        goToStep('kiosk')
      }
    }
  }, [currentStep, goToStep, urlId, printerId, savedKioskId])

  // Explicit simulation / hardware query override guard
  useEffect(() => {
    const qPaper = searchParams.get('paper')
    const qIssue = searchParams.get('issue')
    const qStatus = searchParams.get('status')

    if (qPaper === '0' || qIssue || (qStatus && qStatus.toLowerCase() !== 'online' && qStatus.toLowerCase() !== 'ready')) {
      if (currentStep !== 'upload' && currentStep !== 'status' && currentStep !== 'success') {
        goToStep('upload')
      }
    }
  }, [searchParams, currentStep, goToStep])

  const setPrinterId = useCallback((newId: string, newName?: string) => {
    const trimmed = (newId || '').trim()
    const cleanId = (normalizeKioskTypo(trimmed) || trimmed).toUpperCase()
    if (!isCanonicalKioskFormat(cleanId)) {
      console.warn(`[UnifiedPrintPage] Blocked setting non-canonical kioskId: ${newId}`)
      return
    }
    setPrinterIdState(cleanId)
    sessionStorage.setItem('pb_kiosk_id', cleanId)
    localStorage.setItem('pb_kiosk_id', cleanId)
    if (newName) {
      setKioskName(newName)
      sessionStorage.setItem('pb_kiosk_name', newName)
      localStorage.setItem('pb_kiosk_name', newName)
    }
    const hasFiles = hasRealUploadedDoc() || hasAnyReadyFile()
    const hasSession = kioskSession.isKioskSession()
    const targetStep = hasFiles ? 'settings' : (hasSession ? 'upload' : 'kiosk')
    setCurrentStep(targetStep)
    sessionStorage.setItem('pb_print_step', targetStep)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('id', cleanId)
      if (!hasSession && !hasFiles) {
        next.delete('step')
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const validSteps: PrintStep[] = [
    'upload',
    'confirm',
    'kiosk',
    'settings',
    'review',
    'payment',
    'status',
    'success',
    'history',
  ]
  const effectiveStep: PrintStep = (!hasVerifiedSession && isTargetingKiosk)
    ? 'kiosk'
    : (validSteps.includes(currentStep) ? currentStep : (hasVerifiedSession ? 'upload' : 'kiosk'))

  const shouldShowScanner =
    isTargetingKiosk &&
    !hasVerifiedSession &&
    !urlSessionToken

  const confirmMode = typeof window !== 'undefined' ? (sessionStorage.getItem('pb_confirm_mode') || 'doc') : 'doc'
  const pageKey = effectiveStep === 'confirm' ? `confirm_${confirmMode}` : effectiveStep

  const currentRank = getStepRank(effectiveStep)
  const prevRankRef = useRef<number>(currentRank)

  useEffect(() => {
    if (currentRank !== prevRankRef.current) {
      prevRankRef.current = currentRank
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
  }, [currentRank])

  // If user explicitly navigated to an unknown / unregistered kiosk (e.g. /print?id=PB-003):
  if (urlId && !isLiveKiosksLoading && (validation.status === 'NOT_FOUND' || validation.status === 'INVALID_FORMAT')) {
    return <NotFoundPage kioskId={validation.attemptedId || urlId} />
  }

  // If user accessed an unknown kiosk that isn't pre-verified and live list is still loading:
  if (urlId && !VERIFIED_KIOSKS[urlId] && isLiveKiosksLoading) {
    return <PrintingBoothLoader fullscreen message="Locating PrintBooth Station..." />
  }

  const isInvalidMachine = !urlId && (validation.status === 'INVALID_FORMAT' || validation.status === 'NOT_FOUND')

  const stepTitles: Record<string, string> = {
    upload: 'Upload',
    confirm: 'Confirm Order',
    kiosk: 'Select Station',
    settings: 'Print Settings',
    review: 'Review Order',
    payment: 'Payment',
    status: 'Printing',
    success: 'Complete',
    history: 'Recent Prints',
  }
  const pageTitle = stepTitles[effectiveStep] || 'Print Terminal'
  const isPrivateStep = ['payment', 'status', 'success'].includes(effectiveStep)

  const isEnvTestMode =
    (import.meta.env.VITE_PRINT_MODE || '').toLowerCase() === 'test' ||
    (typeof sessionStorage !== 'undefined' && (sessionStorage.getItem('pb_print_mode') || '').toLowerCase() === 'test')

  const [isNetworkOffline, setIsNetworkOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  const [isStationOffline, setIsStationOffline] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.get('offline') === '1' || urlParams.get('error') === '1' || urlParams.get('status') === 'offline') return true
    }
    return false
  })
  const [stationOfflineReason, setStationOfflineReason] = useState('PRINTER OFFLINE')
  const [stationOfflineDetail, setStationOfflineDetail] = useState('')
  const [stationOfflineRecommendation, setStationOfflineRecommendation] = useState('')
  const consecutiveFailuresRef = useRef<number>(0)

  const activeStationId = (printerId || urlId || savedKioskId || 'PB-001').trim().toUpperCase()

  useEffect(() => {
    const handleOffline = () => setIsNetworkOffline(true)
    const handleOnline = () => setIsNetworkOffline(false)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  // 1. WebSocket real-time hardware status & error listener
  useEffect(() => {
    const handleKioskOffline = (payload: any) => {
      if (isEnvTestMode) return
      const offlineKiosk = (payload?.kioskId || '').toUpperCase()
      if (!offlineKiosk || offlineKiosk === activeStationId) {
        if (hasActiveJob || hasVerifiedSession || Boolean(urlSessionToken)) {
          return
        }
        consecutiveFailuresRef.current += 1
        if (consecutiveFailuresRef.current >= 4) {
          setIsStationOffline(true)
          setIsPrinterBusy(false)
          setMachineInUseState(null)
          setStationOfflineReason(payload?.merchantError ? 'PAYMENT / PRINTER OFFLINE' : 'PRINTER OFFLINE')
          setStationOfflineDetail(payload?.merchantError || payload?.reason || payload?.detail || 'Printing station is currently offline.')
          setStationOfflineRecommendation(payload?.merchantRecommendation || payload?.recommendation || '')
        }
      }
    }
    const handlePrinterError = (payload: any) => {
      if (isEnvTestMode) return
      const target = (payload?.kioskId || '').toUpperCase()
      if (!target || target === activeStationId) {
        if (hasActiveJob || hasVerifiedSession || Boolean(urlSessionToken)) {
          return
        }
        consecutiveFailuresRef.current += 1
        if (consecutiveFailuresRef.current >= 4) {
          setIsStationOffline(true)
          setIsPrinterBusy(false)
          setMachineInUseState(null)
          setStationOfflineReason('PRINTER ERROR')
          setStationOfflineDetail(payload?.error || payload?.detail || payload?.reason || 'Printer hardware error reported. Station is temporarily paused.')
          setStationOfflineRecommendation(payload?.merchantRecommendation || payload?.recommendation || '')
        }
      }
    }
    const handleKioskOnline = (payload: any) => {
      const onlineKiosk = (payload?.kioskId || '').toUpperCase()
      if (!onlineKiosk || onlineKiosk === activeStationId) {
        consecutiveFailuresRef.current = 0
        setIsStationOffline(false)
        setStationOfflineDetail('')
        setStationOfflineRecommendation('')
      }
    }

    const unsubOffline = wsRelayClient.on('KIOSK_OFFLINE', handleKioskOffline)
    const unsubDisc = wsRelayClient.on('KIOSK_DISCONNECTED', handleKioskOffline)
    const unsubPrOffline = wsRelayClient.on('PRINTER_OFFLINE', handleKioskOffline)
    const unsubPrErr = wsRelayClient.on('PRINTER_ERROR', handlePrinterError)
    const unsubHwErr = wsRelayClient.on('HARDWARE_ERROR', handlePrinterError)
    const unsubOnline = wsRelayClient.on('KIOSK_ONLINE', handleKioskOnline)
    const unsubInit = wsRelayClient.on('KIOSK_INITIALIZED', handleKioskOnline)

    return () => {
      unsubOffline()
      unsubDisc()
      unsubPrOffline()
      unsubPrErr()
      unsubHwErr()
      unsubOnline()
      unsubInit()
    }
  }, [activeStationId, isEnvTestMode, hasActiveJob, hasVerifiedSession, urlSessionToken])

  // 2. Continuous telemetry check for active station (polls every 3s)
  useEffect(() => {
    let mounted = true
    const checkStationStatus = async () => {
      if (isEnvTestMode) {
        if (mounted) {
          setIsStationOffline(false)
          setStationOfflineDetail('')
          setStationOfflineRecommendation('')
        }
        return
      }

      // Don't block kiosk selection step or history
      if (effectiveStep === 'kiosk' || effectiveStep === 'history') {
        if (mounted) {
          consecutiveFailuresRef.current = 0
          setIsStationOffline(false)
        }
        return
      }

      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      if (urlParams?.get('offline') === '1' || urlParams?.get('error') === '1' || urlParams?.get('status') === 'offline') {
        if (mounted) {
          setIsStationOffline(true)
          setIsPrinterBusy(false)
          setMachineInUseState(null)
          setStationOfflineReason('PRINTER OFFLINE')
          setStationOfflineDetail(`Station ${activeStationId} is currently offline. Please choose another kiosk.`)
        }
        return
      }

      const isUserMidFlow = hasActiveJob || hasVerifiedSession || Boolean(urlSessionToken) || ['upload', 'confirm', 'settings', 'review', 'payment'].includes(effectiveStep)
      const failureThreshold = isUserMidFlow ? 6 : 4

      // Check liveKiosks registry first if available
      if (liveKiosks && Array.isArray(liveKiosks) && liveKiosks.length > 0) {
        const matching = liveKiosks.find((k: any) => (k.id || k.kioskId) === activeStationId)
        if (matching) {
          const isKioskTestMode = Boolean(matching.isTestMode || matching.hardwareDetails?.isTestMode)
          const pStat = String(matching.printerStatus || '').toUpperCase()
          const kStat = String(matching.status || '').toUpperCase()
          const hasErrorOrOffline = !isKioskTestMode && (
            kStat === 'OFFLINE' ||
            kStat === 'ERROR' ||
            kStat === 'MAINTENANCE' ||
            pStat === 'OFFLINE' ||
            pStat === 'ERROR' ||
            pStat === 'PAPER_JAM' ||
            pStat === 'PAPER_EMPTY' ||
            pStat === 'STOPPED' ||
            pStat === 'DISCONNECTED' ||
            pStat === 'PAUSED' ||
            Boolean(matching.merchantError) ||
            Boolean(matching.hardwareDetails && (
              matching.hardwareDetails.isAvailable === false ||
              matching.hardwareDetails.isOnline === false ||
              matching.hardwareDetails.error
            ))
          )
          if (hasErrorOrOffline) {
            consecutiveFailuresRef.current += 1
            if (consecutiveFailuresRef.current >= failureThreshold && mounted) {
              setIsStationOffline(true)
              setIsPrinterBusy(false)
              setMachineInUseState(null)
              const mErr = matching.merchantError
              const mRec = matching.merchantRecommendation
              setStationOfflineReason(
                mErr ? 'PAYMENT / PRINTER OFFLINE' :
                pStat === 'ERROR' || kStat === 'ERROR' ? 'PRINTER ERROR' :
                pStat === 'PAPER_JAM' ? 'PAPER JAM' :
                pStat === 'PAPER_EMPTY' ? 'OUT OF PAPER' :
                'PRINTER OFFLINE'
              )
              setStationOfflineDetail(
                mErr ||
                (pStat === 'PAPER_JAM' ? 'Printer paper jam detected. Station is temporarily paused.' :
                pStat === 'PAPER_EMPTY' ? 'Printer is out of paper. Station is temporarily paused.' :
                `Station ${matching.name || activeStationId} is currently offline. Please wait or choose another kiosk.`)
              )
              setStationOfflineRecommendation(mRec || '')
            }
            return
          } else {
            consecutiveFailuresRef.current = 0
            if (mounted && isStationOffline) {
              setIsStationOffline(false)
              setStationOfflineDetail('')
              setStationOfflineRecommendation('')
            }
          }
        }
      }

      // Direct hardware detection endpoint check
      try {
        const check = await checkPrinterHardwareStatus(activeStationId)
        if (!mounted) return
        if (!check.isAvailable) {
          consecutiveFailuresRef.current += 1
          if (consecutiveFailuresRef.current >= failureThreshold) {
            setIsStationOffline(true)
            setIsPrinterBusy(false)
            setMachineInUseState(null)
            setStationOfflineReason(check.reason ? (check.reason.toUpperCase().includes('OFFLINE') ? 'PRINTER OFFLINE' : check.reason.toUpperCase()) : 'PRINTER OFFLINE')
            setStationOfflineDetail(check.detail || `Station ${check.kioskName || activeStationId} is offline. Please wait or choose another kiosk.`)
            setStationOfflineRecommendation((check as any).recommendation || '')
          }
        } else {
          consecutiveFailuresRef.current = 0
          if (isStationOffline) {
            setIsStationOffline(false)
            setStationOfflineDetail('')
            setStationOfflineRecommendation('')
          }
        }
      } catch {
        if (!mounted) return
        consecutiveFailuresRef.current += 1
        if (consecutiveFailuresRef.current >= failureThreshold) {
          setIsStationOffline(true)
          setIsPrinterBusy(false)
          setMachineInUseState(null)
          setStationOfflineReason('PRINTER OFFLINE')
          setStationOfflineDetail(`Station ${activeStationId} is offline or unreachable. Please choose another kiosk.`)
          setStationOfflineRecommendation('')
        }
      }
    }

    checkStationStatus()
    const interval = setInterval(checkStationStatus, 3000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [activeStationId, effectiveStep, liveKiosks, isEnvTestMode, hasActiveJob, hasVerifiedSession, urlSessionToken, isStationOffline])

  // Desktop Intercept: When accessing print terminal from a desktop PC or laptop
  if (!isMobileDevice) {
    return (
      <>
        <SEO
          title="Mobile Only"
          description="Print files instantly at your nearest PrintBooth self-service kiosk."
          canonicalUrl="https://printbooth.co.in/print"
          noIndex={true}
        />
        <PleaseUsePhoneView
          kioskId={printerId}
          kioskName={kioskName}
          onBypass={() => setIsMobileDevice(true)}
        />
      </>
    )
  }

  // HARD LOCKOUT GUARD: When printer is offline or has ANY error, show ONLY the offline screen
  if (isNetworkOffline || (isStationOffline && effectiveStep !== 'kiosk')) {
    return (
      <>
        <SEO
          title="Printer Offline"
          description="Station is currently offline or experiencing a printer issue. Please choose another station."
          canonicalUrl="https://printbooth.co.in/print"
          noIndex={true}
        />
        <PrinterErrorOverlay
          isOpen={true}
          title={isNetworkOffline ? 'NO INTERNET' : stationOfflineReason || 'PRINTER OFFLINE'}
          detail={isNetworkOffline ? 'Please check your internet connection.' : stationOfflineDetail || `Station ${kioskName || activeStationId} is currently offline. Please choose another kiosk.`}
          recommendation={stationOfflineRecommendation}
          kioskName={kioskName}
          onFindKiosk={() => {
            setIsStationOffline(false)
            goToStep('kiosk')
          }}
        />
      </>
    )
  }

  // HARD LOCKOUT GUARD: When printer is busy / in use, show ONLY the busy screen
  // User cannot get past this screen using ANY query parameters (?step=..., ?dev=..., etc.)
  if (isPrinterBusy || machineInUseState?.inUse) {
    return (
      <>
        <SEO
          title="Printer Busy"
          description="Printer is in use. Please wait until the current print finishes."
          canonicalUrl="https://printbooth.co.in/print"
          noIndex={true}
        />
        <MachineInUseView
          kioskId={printerId || 'PB-001'}
          kioskName={kioskName}
          onPrinterFree={() => {
            setIsPrinterBusy(false)
            setMachineInUseState(null)
          }}
          onRetry={handleRetrySession}
        />
      </>
    )
  }

  // HARD LOCKOUT GUARD: When QR session has expired, show ONLY the expired screen
  // User cannot bypass this screen into upload or settings
  if (sessionExpiredState?.isExpired) {
    return (
      <>
        <SEO
          title="QR Expired"
          description="This print session QR code has expired. Please scan the current live QR code on the kiosk screen."
          canonicalUrl="https://printbooth.co.in/print"
          noIndex={true}
        />
        <SessionExpiredView
          kioskId={sessionExpiredState.kioskId || printerId || 'PB-001'}
          kioskName={kioskName}
          message={sessionExpiredState.message}
          onRescan={() => {
            const targetKiosk = (sessionExpiredState.kioskId || printerId || 'PB-001').trim().toUpperCase()
            clearActiveKioskSession()
            clearAllFiles()
            clearUploadedDoc()
            setSessionExpiredState(null)
            setMachineInUseState(null)
            setIsPrinterBusy(false)

            setPrinterIdState(targetKiosk)
            sessionStorage.setItem('pb_kiosk_id', targetKiosk)
            sessionStorage.setItem('pb_print_step', 'kiosk')

            // Hard redirect cleanly to scanner without any stale session token
            const cleanUrl = `/print?id=${encodeURIComponent(targetKiosk)}`
            window.location.replace(cleanUrl)
          }}
          onChooseStation={() => {
            setSessionExpiredState(null)
            clearActiveKioskSession()
            window.location.replace('/print?step=kiosk')
          }}
        />
      </>
    )
  }

  return (
    <PrintFlowContext.Provider
      value={{
        currentStep: effectiveStep,
        goToStep,
        printerId,
        kioskName,
        setPrinterId,
      }}
    >
      <SEO
        title={pageTitle}
        description="Print files instantly at your nearest PrintBooth self-service kiosk. Upload directly in browser, pay via UPI, and collect within 90 seconds."
        canonicalUrl="https://printbooth.co.in/print"
        noIndex={isPrivateStep}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Print Terminal', url: '/print' },
        ]}
      />
      <PrintLayout>
        {isInvalidMachine ? (
          <InvalidKioskView
            attemptedId={validation.attemptedId}
            reason={validation.status}
            suggestion={validation.suggestion}
            onResolveSuggestion={(canonicalId) => {
              setPrinterId(canonicalId)
              goToStep('upload')
            }}
            onOpenKioskSelector={() => {
              goToStep('kiosk')
              setSearchParams(prev => {
                const next = new URLSearchParams(prev)
                next.delete('id')
                next.delete('printer_id')
                next.set('step', 'kiosk')
                return next
              }, { replace: true })
            }}
            onGoHome={() => navigate('/')}
          />
        ) : (machineInUseState?.inUse || (isTargetingKiosk && isPrinterBusy && !hasActiveSession)) ? (
          <MachineInUseView
            kioskId={printerId || 'PB-001'}
            kioskName={kioskName}
            token={machineInUseState?.token}
            onPrinterFree={() => {
              setMachineInUseState(null)
              setIsPrinterBusy(false)
            }}
            onRetry={handleRetrySession}
            onSelectOtherKiosk={() => {
              goToStep('kiosk')
              setSearchParams(prev => {
                const next = new URLSearchParams(prev)
                next.delete('id')
                next.delete('printer_id')
                next.set('step', 'kiosk')
                return next
              }, { replace: true })
            }}
            onGoHome={() => navigate('/')}
          />
        ) : shouldShowScanner ? (
          <KioskDisplayQrScanner
            kioskId={printerId || 'PB-001'}
            kioskName={kioskName}
            onSessionClaimed={(token, verifiedId) => {
              const sessId = decodeTokenSessionId(token) || ''
              setPrinterIdState(verifiedId)
              sessionStorage.setItem('pb_kiosk_id', verifiedId)
              sessionStorage.setItem('pb_kiosk_id_from_session', verifiedId)
              localStorage.setItem('pb_kiosk_id', verifiedId)
              sessionStorage.setItem('pb_kiosk_session_token', token)
              localStorage.setItem('pb_kiosk_session_token', token)
              if (sessId) {
                sessionStorage.setItem('pb_kiosk_session_id', sessId)
                localStorage.setItem('pb_kiosk_session_id', sessId)
              }
              setIsPrinterBusy(false)
              setMachineInUseState(null)
              setCurrentStep('upload')
              sessionStorage.setItem('pb_print_step', 'upload')
              setSearchParams({ id: verifiedId, session: token, step: 'upload' }, { replace: true })
            }}
            onMachineInUse={(kioskId, token) => {
              setMachineInUseState({
                inUse: true,
                kioskId,
                token,
              })
              setIsPrinterBusy(true)
            }}
            onSessionExpired={(msg) => {
              setSessionExpiredState({
                isExpired: true,
                kioskId: printerId || 'PB-001',
                message: msg,
              })
            }}
            onCancel={() => {
              setPrinterIdState('')
              sessionStorage.removeItem('pb_kiosk_id')
              sessionStorage.removeItem('pb_kiosk_name')
              localStorage.removeItem('pb_kiosk_id')
              localStorage.removeItem('pb_kiosk_name')
              goToStep('kiosk')
              setSearchParams(prev => {
                const next = new URLSearchParams(prev)
                next.delete('id')
                next.delete('printer_id')
                next.delete('kiosk')
                next.set('step', 'kiosk')
                return next
              }, { replace: true })
            }}
          />
        ) : (
          <PageTransition3D pageKey={pageKey}>
            <ErrorBoundary key={pageKey}>
              {effectiveStep === 'upload'   && <MultiFilePage />}
              {effectiveStep === 'confirm'  && <ConfirmPage />}
              {effectiveStep === 'kiosk'    && <SelectKioskPage />}
              {effectiveStep === 'settings' && <PrintSettingsPage />}
              {effectiveStep === 'review'   && <ReviewPage />}
              {effectiveStep === 'payment'  && <PaymentPage />}
              {effectiveStep === 'status'   && <StatusPage />}
              {effectiveStep === 'success'  && <SuccessPage />}
            </ErrorBoundary>
          </PageTransition3D>
        )}
      </PrintLayout>
    </PrintFlowContext.Provider>
  )
}
