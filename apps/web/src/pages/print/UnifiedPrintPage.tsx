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
import NotFoundPage from '../NotFoundPage'
import { getLiveKiosks, getKioskDetails } from '@/lib/api'
import { hasRealUploadedDoc } from '@/lib/documentStore'
import { hasAnyReadyFile, setKioskPricing } from '@/lib/multiFileStore'
import {
  isCanonicalKioskFormat,
  validateKioskId,
  VERIFIED_KIOSKS,
  type KioskValidationResult,
} from '@/lib/kioskValidation'
import SEO from '../../components/common/SEO'
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
  const savedKioskId = typeof window !== 'undefined'
    ? (sessionStorage.getItem('pb_kiosk_id') || localStorage.getItem('pb_kiosk_id'))
    : null
  // Preserve selected machine on refresh: use URL id if present, otherwise fall back to saved kiosk session
  const rawId = urlId || savedKioskId
  const paramStep = searchParams.get('step') as PrintStep | null

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
    return savedKioskId || ''
  })

  const [kioskName, setKioskName] = useState<string>(() => {
    if (validation.status === 'VALID' && validation.meta) {
      return validation.meta.name
    }
    return (typeof window !== 'undefined'
      ? (sessionStorage.getItem('pb_kiosk_name') || localStorage.getItem('pb_kiosk_name'))
      : '') || ''
  })

  // Purge corrupt machine IDs ONLY if confirmed invalid AFTER live kiosks have finished loading
  useEffect(() => {
    if (!isLiveKiosksLoading && (validation.status === 'INVALID_FORMAT' || (validation.status === 'NOT_FOUND' && urlId))) {
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

  // Fetch live kiosks for registry verification & pricing
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
    return () => {
      mounted = false
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
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  // ── Step management (Preserves stage and files across page refresh) ──
  const [currentStep, setCurrentStep] = useState<PrintStep>(() => {
    if (validation.status === 'INVALID_FORMAT' || validation.status === 'NOT_FOUND') {
      return 'upload'
    }

    const hasActiveFiles =
      hasRealUploadedDoc() ||
      hasAnyReadyFile() ||
      Boolean(typeof window !== 'undefined' && (sessionStorage.getItem('pb_files') || sessionStorage.getItem('pb_file_name')))

    const saved = typeof window !== 'undefined' ? (sessionStorage.getItem('pb_print_step') as PrintStep | null) : null

    // If explicit query step is provided, honor it (guarding document steps only if no files exist at all)
    if (paramStep && ['status', 'success', 'payment', 'review', 'settings', 'confirm', 'upload', 'kiosk', 'history'].includes(paramStep)) {
      if (!hasActiveFiles && ['confirm', 'settings', 'review', 'payment'].includes(paramStep)) {
        return rawId ? 'upload' : 'kiosk'
      }
      return paramStep
    }

    // Preserve active step on browser refresh (e.g. payment, review, settings, confirm)
    if (saved && ['status', 'success', 'payment', 'review', 'settings', 'confirm', 'upload', 'kiosk', 'history'].includes(saved)) {
      if (hasActiveFiles || ['status', 'success', 'kiosk', 'history', 'upload'].includes(saved)) {
        return saved
      }
    }

    // When directly accessing /print without a machine parameter (?id=) and no session, choose machine
    if (!rawId) {
      return 'kiosk'
    }

    return 'upload'
  })

  const goToStep = useCallback((step: PrintStep) => {
    setCurrentStep(step)
    sessionStorage.setItem('pb_print_step', step)
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

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
      // Auto redirect back to upload page
      goToStep('upload')
      return
    }

    if (paramStep && ['upload', 'confirm', 'settings', 'review', 'payment', 'status', 'success', 'kiosk', 'history'].includes(paramStep)) {
      if (paramStep !== currentStep) {
        setCurrentStep(paramStep)
        sessionStorage.setItem('pb_print_step', paramStep)
      }
    }
  }, [paramStep, currentStep, goToStep])

  // If truly no files are present and step is beyond upload/status/success/kiosk, reset to upload
  useEffect(() => {
    const hasFiles =
      hasRealUploadedDoc() ||
      hasAnyReadyFile() ||
      Boolean(typeof window !== 'undefined' && (sessionStorage.getItem('pb_files') || sessionStorage.getItem('pb_file_name')))
    if (!hasFiles && ['confirm', 'settings', 'review', 'payment'].includes(currentStep)) {
      goToStep('upload')
    }
  }, [currentStep, goToStep])

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
    if (!isCanonicalKioskFormat(newId)) {
      console.warn(`[UnifiedPrintPage] Blocked setting non-canonical kioskId: ${newId}`)
      return
    }
    const cleanId = newId.trim().toUpperCase()
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
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

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
  const effectiveStep = validSteps.includes(currentStep) ? currentStep : 'upload'

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
