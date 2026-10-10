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
import RecentPrintsPage from './RecentPrintsPage'
import ErrorBoundary from '../../components/ui/ErrorBoundary'
import PageTransition3D from '../../components/ui/PageTransition3D'
import { InvalidKioskView } from '../../components/ui/InvalidKioskView'
import { MachineInUseView } from '../../components/ui/MachineInUseView'
import PrinterErrorOverlay from '../../components/ui/PrinterErrorOverlay'
import NotFoundPage from '../NotFoundPage'
import { getLiveKiosks, getKioskDetails, checkPrinterHardwareStatus } from '@/lib/api'
import { wsRelayClient } from '@/lib/wsRelayClient'
import { hasRealUploadedDoc } from '@/lib/documentStore'
import {
  hasAnyReadyFile,
  setKioskPricing,
  getAllFiles,
  calcFileTotalSheets,
  computeTotalPrice,
} from '@/lib/multiFileStore'
import {
  isCanonicalKioskFormat,
  normalizeKioskTypo,
  validateKioskId,
  VERIFIED_KIOSKS,
  type KioskValidationResult,
} from '@/lib/kioskValidation'
import SEO from '../../components/common/SEO'
import { kioskSession, getSessionTokenFromUrl, claimKioskSession } from '@/lib/kioskSession'
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
  const urlId = searchParams.get('id') || searchParams.get('printer_id')
  const paramStep = searchParams.get('step') as PrintStep | null
  const savedKioskId = typeof window !== 'undefined'
    ? (sessionStorage.getItem('pb_kiosk_id') || localStorage.getItem('pb_kiosk_id'))
    : null

  // Determine if there is an active document being processed in this session
  const hasActiveJob =
    hasRealUploadedDoc() ||
    hasAnyReadyFile() ||
    Boolean(typeof window !== 'undefined' && (sessionStorage.getItem('pb_files') || sessionStorage.getItem('pb_file_name')))

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
    if (validation.status === 'VALID') {
      return validation.kioskId
    }
    if (savedKioskId && isCanonicalKioskFormat(savedKioskId)) {
      return savedKioskId.trim().toUpperCase()
    }
    return ''
  })

  const [kioskName, setKioskName] = useState<string>(() => {
    if (validation.status === 'VALID' && validation.meta) {
      return validation.meta.name
    }
    if (typeof window !== 'undefined') {
      return (sessionStorage.getItem('pb_kiosk_name') || localStorage.getItem('pb_kiosk_name')) || ''
    }
    return ''
  })

  // Machine Already In Use state (when another user claimed the kiosk session)
  const [machineInUseState, setMachineInUseState] = useState<{
    inUse: boolean
    kioskId?: string
    token?: string
  } | null>(null)

  useEffect(() => {
    const handleMachineInUseEvent = (e: any) => {
      setMachineInUseState({
        inUse: true,
        kioskId: e.detail?.kioskId || printerId || 'PB-001',
        token: e.detail?.token,
      })
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

  // Clean URL: keep address bar clean as /print without exposing internal query params (e.g. ?id=PB-001&step=payment)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      if (paramStep === 'kiosk') return
      // CRITICAL: Do NOT wipe URL parameters if kiosk session is present!
      if (searchParams.get('session') || getSessionTokenFromUrl()) return
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [paramStep, searchParams])

  // ── Kiosk QR Session: claim on mount if ?session= param present ──
  useEffect(() => {
    const token = getSessionTokenFromUrl() || (typeof window !== 'undefined' ? sessionStorage.getItem('pb_kiosk_session_token') : null)
    if (!token) return
    claimKioskSession(token).then(result => {
      if (result.machineInUse) {
        setMachineInUseState({
          inUse: true,
          kioskId: result.kioskId || printerId || 'PB-001',
          token,
        })
      } else if (result.success) {
        setMachineInUseState(null)
      } else {
        console.warn('[KioskSession] Claim result:', result.error)
      }
    })
  }, [printerId])

  // ── Step management (Preserves stage and files across page refresh) ──
  const [currentStep, setCurrentStep] = useState<PrintStep>(() => {
    // 0. If opened via kiosk QR session, always lock to upload on mobile phone
    if (kioskSession.isKioskSession() || getSessionTokenFromUrl()) {
      return 'upload'
    }

    const activeKiosk = (urlId || savedKioskId || '').trim().toUpperCase()
    const hasSelectedKiosk = isCanonicalKioskFormat(activeKiosk)
    const savedStep = typeof window !== 'undefined' ? (sessionStorage.getItem('pb_print_step') as PrintStep | null) : null

    // 1. Explicit requested step in query parameter (e.g. /print?step=kiosk)
    if (paramStep && ['status', 'success', 'payment', 'review', 'settings', 'confirm', 'upload', 'kiosk', 'history'].includes(paramStep)) {
      if (paramStep === 'kiosk') {
        return 'kiosk'
      }
      if (!hasActiveJob && ['confirm', 'settings', 'review', 'payment'].includes(paramStep)) {
        return hasSelectedKiosk ? 'upload' : 'kiosk'
      }
      return paramStep
    }

    // 2. If a specific physical machine was scanned via QR code or already selected in storage
    if (hasSelectedKiosk) {
      if (savedStep && (hasActiveJob || ['status', 'success', 'upload'].includes(savedStep))) {
        return savedStep
      }
      return 'upload'
    }

    // 3. User is actively continuing an existing print flow with files in progress
    if (hasActiveJob && savedStep && ['payment', 'review', 'settings', 'confirm', 'upload'].includes(savedStep)) {
      return savedStep
    }
    if (savedStep && ['status', 'success', 'history'].includes(savedStep)) {
      return savedStep
    }

    // 4. Default: User clicked "Start Printing" without a selected machine yet.
    // Let user select kiosk first!
    return 'kiosk'
  })

  // ── Kiosk QR Session: report step changes back to kiosk display ──
  useEffect(() => {
    if (!kioskSession.isKioskSession()) return
    const readyFiles = getAllFiles().filter(f => f.status === 'ready')
    const primaryFile = readyFiles[0]
    const fileName = readyFiles.length > 1
      ? `${primaryFile?.fileName} (+${readyFiles.length - 1} more)`
      : primaryFile?.fileName
    const totalSheets = readyFiles.reduce((acc, f) => acc + (calcFileTotalSheets(f) || f.pageCount || 1), 0)
    const amount = computeTotalPrice()
    const colourMode = readyFiles.some(f => f.settings?.colour === 'COLOUR') ? 'COLOUR' : 'BW'
    const copies = readyFiles[0]?.settings?.copies || 1

    switch (currentStep) {
      case 'upload':
        kioskSession.reportUploading(fileName)
        break
      case 'confirm':
      case 'settings':
      case 'review':
        kioskSession.reportConfiguring({
          fileName,
          totalPages: totalSheets || undefined,
          copies,
          colourMode,
          amount: amount || undefined,
        })
        break
      case 'payment':
        kioskSession.reportPaying({
          fileName,
          totalPages: totalSheets || undefined,
          amount: amount || undefined,
        })
        break
      default:
        break
    }
  }, [currentStep])

  const goToStep = useCallback((step: PrintStep) => {
    setCurrentStep(step)
    sessionStorage.setItem('pb_print_step', step)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (step === 'kiosk') {
        next.set('step', 'kiosk')
      } else {
        next.delete('step')
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

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
      } else if (result.success) {
        setMachineInUseState(null)
        goToStep('upload')
      }
    })
  }, [machineInUseState?.token, printerId, goToStep])

  // Guard against direct parameter access like ?step=confirm when no files exist
  useEffect(() => {
    const hasActiveFiles =
      hasRealUploadedDoc() ||
      hasAnyReadyFile() ||
      Boolean(typeof window !== 'undefined' && (sessionStorage.getItem('pb_files') || sessionStorage.getItem('pb_file_name')))

    if (!hasActiveFiles && paramStep && ['confirm', 'settings', 'review', 'payment'].includes(paramStep)) {
      // Clear stale session file flags
      sessionStorage.removeItem('pb_file_name')
      sessionStorage.removeItem('pb_files')
      sessionStorage.removeItem('pb_settings')
      // Auto redirect back to upload (or kiosk selector if no kiosk selected yet)
      const hasKiosk = isCanonicalKioskFormat((urlId || printerId || savedKioskId || '').trim().toUpperCase())
      goToStep(hasKiosk ? 'upload' : 'kiosk')
      return
    }

    if (paramStep && ['upload', 'confirm', 'settings', 'review', 'payment', 'status', 'success', 'kiosk', 'history'].includes(paramStep)) {
      if (paramStep !== currentStep) {
        setCurrentStep(paramStep)
        sessionStorage.setItem('pb_print_step', paramStep)
      }
    }
  }, [paramStep, currentStep, goToStep, urlId, printerId, savedKioskId])

  // If truly no files are present and step is beyond upload/status/success/kiosk, reset to upload or kiosk
  useEffect(() => {
    const hasFiles =
      hasRealUploadedDoc() ||
      hasAnyReadyFile() ||
      Boolean(typeof window !== 'undefined' && (sessionStorage.getItem('pb_files') || sessionStorage.getItem('pb_file_name')))
    if (!hasFiles && ['confirm', 'settings', 'review', 'payment'].includes(currentStep)) {
      const hasKiosk = isCanonicalKioskFormat((urlId || printerId || savedKioskId || '').trim().toUpperCase())
      goToStep(hasKiosk ? 'upload' : 'kiosk')
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
    const targetStep = hasFiles ? 'settings' : 'upload'
    setCurrentStep(targetStep)
    sessionStorage.setItem('pb_print_step', targetStep)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('step')
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
  const isKioskSession = kioskSession.isKioskSession() || Boolean(getSessionTokenFromUrl())
  const effectiveStep: PrintStep = isKioskSession ? 'upload' : (validSteps.includes(currentStep) ? currentStep : 'upload')

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
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg, #e0e5ec)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(220, 38, 38, 0.2)', borderTopColor: '#dc2626', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Locating PrintBooth Station...</span>
        </div>
      </div>
    )
  }

  const isInvalidMachine = !urlId && (validation.status === 'INVALID_FORMAT' || validation.status === 'NOT_FOUND')

  const stepTitles: Record<string, string> = {
    upload: 'Upload Documents & Print Online',
    confirm: confirmMode === 'final' ? 'Confirm Print Order' : 'Review Uploaded Documents',
    kiosk: 'Choose Print Station & Kiosk Location',
    settings: 'Configure Print Settings',
    review: 'Final Order Review',
    payment: 'Pay with UPI QR',
    status: 'Live Print Progress & Spooling',
    success: 'Print Completed & Collect Documents',
  }
  const pageTitle = stepTitles[effectiveStep] || 'Self-Service Print Station'
  const isPrivateStep = ['payment', 'status', 'success'].includes(effectiveStep)

  const [isNetworkOffline, setIsNetworkOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  const [isStationOffline, setIsStationOffline] = useState(false)
  const [stationOfflineReason, setStationOfflineReason] = useState('PRINTER OFFLINE')
  const [stationOfflineDetail, setStationOfflineDetail] = useState('')

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

  // 1. WebSocket real-time hardware status listener
  useEffect(() => {
    const handleKioskOffline = (payload: any) => {
      const offlineKiosk = (payload?.kioskId || '').toUpperCase()
      if (!offlineKiosk || offlineKiosk === activeStationId) {
        setIsStationOffline(true)
        setStationOfflineReason('PRINTER OFFLINE')
        setStationOfflineDetail(payload?.reason || 'Printing station is currently offline.')
      }
    }
    const handleKioskOnline = (payload: any) => {
      const onlineKiosk = (payload?.kioskId || '').toUpperCase()
      if (!onlineKiosk || onlineKiosk === activeStationId) {
        setIsStationOffline(false)
        setStationOfflineDetail('')
      }
    }

    const unsubOffline = wsRelayClient.on('KIOSK_OFFLINE', handleKioskOffline)
    const unsubDisc = wsRelayClient.on('KIOSK_DISCONNECTED', handleKioskOffline)
    const unsubOnline = wsRelayClient.on('KIOSK_ONLINE', handleKioskOnline)
    const unsubInit = wsRelayClient.on('KIOSK_INITIALIZED', handleKioskOnline)

    return () => {
      unsubOffline()
      unsubDisc()
      unsubOnline()
      unsubInit()
    }
  }, [activeStationId])

  // 2. Continuous telemetry check for active station (polls every 3s to detect start_kiosk.sh)
  useEffect(() => {
    let mounted = true
    const checkStationStatus = async () => {
      // Don't block kiosk selection step or history
      if (effectiveStep === 'kiosk' || effectiveStep === 'history') {
        if (mounted) setIsStationOffline(false)
        return
      }

      // Check liveKiosks registry first if available
      if (liveKiosks && Array.isArray(liveKiosks) && liveKiosks.length > 0) {
        const matching = liveKiosks.find((k: any) => (k.id || k.kioskId) === activeStationId)
        if (matching) {
          const isKioskDown = matching.status === 'OFFLINE' || matching.printerStatus === 'OFFLINE'
          const isHwDown = matching.hardwareDetails && (matching.hardwareDetails.isAvailable === false || matching.hardwareDetails.isOnline === false)
          if (isKioskDown || isHwDown) {
            if (mounted) {
              setIsStationOffline(true)
              setStationOfflineReason('PRINTER OFFLINE')
              setStationOfflineDetail(`Station ${matching.name || activeStationId} is currently offline. Printing will resume automatically once start_kiosk.sh is running.`)
            }
            return
          }
        }
      }

      // Direct hardware detection endpoint check
      try {
        const check = await checkPrinterHardwareStatus(activeStationId)
        if (!mounted) return
        if (!check.isAvailable) {
          setIsStationOffline(true)
          setStationOfflineReason('PRINTER OFFLINE')
          setStationOfflineDetail(check.detail || `Station ${check.kioskName || activeStationId} is offline. Please wait or choose another kiosk.`)
        } else {
          setIsStationOffline(false)
          setStationOfflineDetail('')
        }
      } catch {
        if (!mounted) return
        setIsStationOffline(true)
        setStationOfflineReason('PRINTER OFFLINE')
        setStationOfflineDetail('Unable to communicate with printing station spooler.')
      }
    }

    checkStationStatus()
    const interval = setInterval(checkStationStatus, 3000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [activeStationId, effectiveStep, liveKiosks])

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
      <PrinterErrorOverlay
        isOpen={!machineInUseState?.inUse && (isNetworkOffline || (isStationOffline && effectiveStep !== 'kiosk'))}
        title={isNetworkOffline ? 'NO INTERNET' : stationOfflineReason || 'PRINTER OFFLINE'}
        detail={isNetworkOffline ? 'Please check your internet connection.' : stationOfflineDetail || `Station ${kioskName || activeStationId} is currently offline.`}
        kioskName={kioskName}
        onFindKiosk={() => {
          setIsStationOffline(false)
          goToStep('kiosk')
        }}
      />
      <SEO
        title={`${pageTitle} | PrintBooth`}
        description="Print files instantly at your nearest PrintBooth self-service kiosk. Upload directly in browser, pay via UPI, and collect within 90 seconds."
        canonicalUrl="https://printbooth.in/print"
        noIndex={isPrivateStep}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Print Terminal', url: '/print' },
        ]}
      />
      <PrintLayout>
        {machineInUseState?.inUse ? (
          <MachineInUseView
            kioskId={machineInUseState.kioskId || printerId || 'PB-001'}
            kioskName={kioskName}
            token={machineInUseState.token}
            onRetry={handleRetrySession}
            onSelectOtherKiosk={() => {
              setMachineInUseState(null)
              goToStep('kiosk')
              setSearchParams(prev => {
                const next = new URLSearchParams(prev)
                next.delete('id')
                next.delete('session')
                next.set('step', 'kiosk')
                return next
              }, { replace: true })
            }}
            onGoHome={() => navigate('/')}
          />
        ) : isInvalidMachine ? (
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
              {effectiveStep === 'history'  && <RecentPrintsPage />}
            </ErrorBoundary>
          </PageTransition3D>
        )}
      </PrintLayout>
    </PrintFlowContext.Provider>
  )
}
