import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { usePrintNavigate as useNavigate, usePrintFlow } from './PrintFlowContext'
import {
  Clock,
  XCircle,
  CreditCard,
  Lock,
  QrCode,
  ShieldCheck,
  ArrowLeft,
  Wallet,
  Bank,
  CaretRight,
  Lightning,
  CaretDown,
  Printer,
} from '@phosphor-icons/react'
import { createPrintOrder, sendPrintJob } from '@/lib/api'
import { getAllFiles, clearAllFiles, hasAnyReadyFile, computeTotalPrice, parsePageRange, type FileSettings, type ManagedFile } from '@/lib/multiFileStore'
import { getUploadedFileAsync, hasRealUploadedDoc, clearUploadedDoc } from '@/lib/documentStore'
import { getFileFromCache } from '@/lib/fileCache'
import { isCanonicalKioskFormat } from '@/lib/kioskValidation'
import { Skeleton, PaymentBoneyardFallback } from '@/components/ui/PrintBoneyardSkeleton'
import { wsRelay } from '@/lib/wsRelayClient'
import { saveRecentPrint } from '@/lib/recentPrintsStore'
import { getApiHostUrl } from '@/lib/config'
import { PaymentStatusModal } from '@/components/ui/PaymentStatusModal'
import { kioskSession } from '@/lib/kioskSession'
import './PaymentPage.css'

const API = getApiHostUrl()

type PaymentStatus = 'WAITING' | 'PROCESSING' | 'SUCCESS' | 'FAILED'
type LogLevel = 'info' | 'success' | 'error' | 'warn'
type GatewayType = 'razorpay' | 'upiexpress'

interface UpiExpressOrder {
  orderId: string | number
  paymentUrl: string
  upiIntentUrl?: string
  upiIdHash: string
  upiIntent: {
    bhim_link?: string
    phonepe_link?: string
    paytm_link?: string
    gpay_link?: string
  }
  clientTxnId: string
  amount: number
}

declare global {
  interface Window { Razorpay: any }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise(resolve => {
    if (window.Razorpay) { resolve(true); return }
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}


/** Detect mobile device */
function isMobileDevice() {
  if (typeof window === 'undefined') return false
  const ua = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)
  const touch = (navigator.maxTouchPoints > 0) || ('ontouchstart' in window)
  const smallScreen = window.innerWidth <= 768
  return ua || (touch && smallScreen)
}

export default function PaymentPage() {
  const navigate = useNavigate()
  const flow = usePrintFlow()

  // ── Session data ──
  const storedPrice = Number(sessionStorage.getItem('pb_total_price') ?? 10)
  const liveComputedPrice = computeTotalPrice()
  const totalPrice = liveComputedPrice > 0 ? liveComputedPrice : storedPrice

  useEffect(() => {
    if (totalPrice > 0) {
      sessionStorage.setItem('pb_total_price', String(totalPrice))
    }
  }, [totalPrice])
  const fileName    = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pb_file_name') : null) ?? 'document.pdf'
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const kioskId     = searchParams?.get('kioskId') || searchParams?.get('id') || flow?.printerId || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pb_kiosk_id') : '') || 'PB-001'
  const kioskName   = flow?.kioskName || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pb_kiosk_name') : '') || 'PrintBooth'
  const pageCount   = Number(sessionStorage.getItem('pb_page_count') || 1)

  // Persist kioskId in session for consistent cross-step tracking
  if (typeof sessionStorage !== 'undefined' && kioskId) {
    sessionStorage.setItem('pb_kiosk_id', kioskId)
  }
  const rawSettings = sessionStorage.getItem('pb_settings')
  let settings: FileSettings = {
    copies: 1,
    colour: 'BW',
    duplex: 'SINGLE',
    pages: 'ALL',
    paperSize: 'A4',
    scaling: 'FIT',
    dpi: '600',
    orientation: 'AUTO',
    pagesPerSheet: 1,
    margins: 'STANDARD',
    contrastMode: 'BALANCED',
  }
  if (rawSettings) {
    try {
      const parsed = JSON.parse(rawSettings)
      settings = {
        copies:        Number(parsed.copies) || 1,
        colour:        parsed.colour === 'COLOUR' ? 'COLOUR' : 'BW',
        duplex:        parsed.duplex === 'DOUBLE' ? 'DOUBLE' : 'SINGLE',
        pages:         String(parsed.pages || 'ALL'),
        paperSize:     ['A3', 'LETTER', 'LEGAL', 'LEDGER', 'A5'].includes(parsed.paperSize) ? parsed.paperSize : 'A4',
        scaling:       parsed.scaling || 'FIT',
        customScalePercent: Number(parsed.customScalePercent) || 100,
        dpi:           parsed.dpi || '600',
        orientation:   parsed.orientation || 'AUTO',
        pagesPerSheet: ([1, 2, 4, 6, 9, 16].includes(Number(parsed.pagesPerSheet)) ? Number(parsed.pagesPerSheet) : 1) as any,
        margins:       parsed.margins || 'STANDARD',
        contrastMode:  parsed.contrastMode || 'BALANCED',
        pageBorder:    Boolean(parsed.pageBorder),
        pageColours:   parsed.pageColours && typeof parsed.pageColours === 'object' ? parsed.pageColours : undefined,
        pageCopies:    parsed.pageCopies  && typeof parsed.pageCopies  === 'object' ? parsed.pageCopies  : undefined,
      }
    } catch (e) {
      console.warn('[PaymentPage] Failed to parse settings from session:', e)
    }
  }

  // Multi-file
  const [multiFiles, setMultiFiles] = useState<ManagedFile[]>(() => getAllFiles().filter(f => f.status === 'ready'))

  useEffect(() => {
    const handleStoreChange = () => {
      setMultiFiles(getAllFiles().filter(f => f.status === 'ready'))
    }
    window.addEventListener('printbooth:multifile-change', handleStoreChange)
    return () => window.removeEventListener('printbooth:multifile-change', handleStoreChange)
  }, [])

  const isMultiFile = multiFiles.length > 1

  const orderId = useRef((() => {
    if (typeof sessionStorage !== 'undefined') {
      const existing = sessionStorage.getItem('pb_order_id')
      if (existing && existing.startsWith('PB-')) return existing
    }
    const fresh = 'PB-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' +
      String(Math.floor(100000 + Math.random() * 900000))
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('pb_order_id', fresh)
    }
    return fresh
  })()).current

  // ── State ──
  const [status,          setStatus]          = useState<PaymentStatus>('WAITING')
  const [timeLeft,        setTimeLeft]        = useState(10 * 60)
  const [gatewayErrorMsg, setGatewayErrorMsg] = useState<string>('')
  const setErrorMsg = (msg: string) => setGatewayErrorMsg(msg)
  const [rzpKeyId,        setRzpKeyId]        = useState<string>('')
  const [razorpayReady,   setRazorpayReady]   = useState(false)
  const [apiOnline,       setApiOnline]       = useState(false)

  const [selectedGateway, setSelectedGateway] = useState<GatewayType>(() => {
    const cached = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pb_assigned_gateway') : null
    if (cached === 'razorpay' || cached === 'upiexpress') return cached
    return 'upiexpress'
  })
  const [upieConfigured,  setUpieConfigured]  = useState(false)
  const [isInitializing,  setIsInitializing]  = useState(true)

  // Tracks whether auto-fire has already been attempted
  const autoFiredRef = useRef(false)

  const [activeMethod,    setActiveMethod]    = useState<'upi' | 'card' | 'wallet' | 'netbanking' | 'all' | null>(null)

  // UPI Express specific
  const [upieOrder,       setUpieOrder]       = useState<UpiExpressOrder | null>(null)
  const [upiePolling,     setUpiePolling]      = useState(false)

  // ── Reactive Device Type Detection & Kiosk Mode ──
  const [isMobile,        setIsMobile]        = useState<boolean>(isMobileDevice)
  const [showMoreMethods, setShowMoreMethods] = useState<boolean>(false)
  const isKioskMode = kioskSession.isKioskSession()

  useEffect(() => {
    const handleDeviceCheck = () => {
      setIsMobile(isMobileDevice())
    }
    window.addEventListener('resize', handleDeviceCheck)
    return () => window.removeEventListener('resize', handleDeviceCheck)
  }, [])

  const timerRef    = useRef<ReturnType<typeof setInterval>>()
  const pollingRef  = useRef<ReturnType<typeof setInterval>>()

  // ── Logging helper ──
  const log = useCallback((msg: string, level: LogLevel = 'info') => {
    const ts = new Date().toLocaleTimeString('en-IN', { hour12: false })
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      `[PaymentPage ${ts}] [${level.toUpperCase()}] ${msg}`
    )
  }, [])

  // ── Timer ──
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  // ── Init: fetch keys from backend, load Razorpay SDK ──
  useEffect(() => {
    async function init() {
      log('Initializing payment session…')
      log(`Order ID: ${orderId}`)
      log(`Amount: ₹${totalPrice}`)

      // Fetch Kiosk-specific Payment Config
      if (kioskId) {
        try {
          log(`Fetching station payment configuration for ${kioskId}…`)
          const r = await fetch(`${API}/api/kiosks/${encodeURIComponent(kioskId)}/payment-config`)
          const j = await r.json()
          if (j.success && j.data?.paymentGateway) {
            const gw = j.data.paymentGateway as GatewayType
            setSelectedGateway(gw)
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem('pb_assigned_gateway', gw)
            }
            log(`✓ Station ${kioskId} assigned gateway: ${gw.toUpperCase()}`, 'success')
            if (j.data.razorpayKeyId) {
              setRzpKeyId(j.data.razorpayKeyId)
            } else {
              setRzpKeyId('')
            }
            if (j.data.upiExpressConfigured !== undefined) {
              setUpieConfigured(Boolean(j.data.upiExpressConfigured))
            }
            if (j.data.isConfigured === false) {
              setGatewayErrorMsg(j.data.errorMessage || `Payment gateway (${gw.toUpperCase()}) credentials are not configured for Station ${kioskId}. Please notify the merchant.`)
            } else {
              setGatewayErrorMsg('')
            }
          }
        } catch (err) {
          log(`Station payment config fetch failed: ${err}`, 'warn')
        }
      }

      // Fetch Razorpay config
      try {
        const url = kioskId ? `${API}/api/razorpay/config?kioskId=${encodeURIComponent(kioskId)}` : `${API}/api/razorpay/config`
        log(`Fetching Razorpay config from ${url}…`)
        const r = await fetch(url)
        const j = await r.json()
        if (j.success && j.data.keyIdConfigured) {
          setRzpKeyId(j.data.keyId)
          setApiOnline(true)
          log(`✓ Backend online — Razorpay Key: ${j.data.keyId.slice(0, 12)}… Mode: ${j.data.mode}`, 'success')
        } else {
          setRzpKeyId('')
          log('Backend responded but Razorpay key not configured', 'warn')
        }
      } catch (err) {
        log('Backend offline or Razorpay config unavailable', 'error')
      }

      // Fetch UPI Express config
      try {
        const url = kioskId ? `${API}/api/upiexpress/config?kioskId=${encodeURIComponent(kioskId)}` : `${API}/api/upiexpress/config`
        log(`Fetching UPI Express config from ${url}…`)
        const r = await fetch(url)
        const j = await r.json()
        if (j.success && j.data.configured) {
          setUpieConfigured(true)
          log(`✓ UPI Express configured — Key: ${j.data.apiKeyPrefix}`, 'success')
        } else {
          log('UPI Express key not configured', 'warn')
        }
      } catch (err) {
        log('UPI Express config fetch failed (backend offline?)', 'warn')
      }

      // Fetch print mode
      try {
        const r = await fetch(`${API}/api/print/mode`)
        const j = await r.json()
        if (j.success) {
          log(`🖨 Print mode: ${j.mode.toUpperCase()} — ${j.label}`, j.mode === 'test' ? 'warn' : 'success')
        }
      } catch {
        log('Could not fetch print mode from backend', 'warn')
      }

      // Load Razorpay checkout.js
      log('Loading Razorpay checkout.js SDK…')
      try {
        const loaded = await loadRazorpayScript()
        setRazorpayReady(loaded)
        if (loaded) {
          log('✓ Razorpay SDK loaded successfully', 'success')
        } else {
          log('✗ Failed to load Razorpay SDK (network issue?)', 'error')
        }
      } catch (err) {
        log('Razorpay SDK load exception', 'warn')
      } finally {
        setIsInitializing(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Cleanup polling and pending payment on unmount ──
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (kioskSession.isKioskSession()) {
        kioskSession.abortPendingPayment()
      }
    }
  }, [])

  // ── Auto-fire payment gateway once init completes or when order amount updates ──
  useEffect(() => {
    if (isInitializing) return          // still loading
    if (status !== 'WAITING') return     // already in progress / done

    if (selectedGateway === 'upiexpress' && upieConfigured) {
      const orderAmountMatches = upieOrder && Math.abs(Number(upieOrder.amount) - Number(totalPrice)) <= 0.25
      if (!upieOrder || !orderAmountMatches) {
        log(`Auto-launching UPI Express payment gateway for ₹${totalPrice}…`)
        handleUpiExpressPayment()
      }
    } else if (selectedGateway === 'razorpay' && razorpayReady && rzpKeyId) {
      if (!autoFiredRef.current) {
        autoFiredRef.current = true
        log('✓ Dynamic Razorpay direct payment hub active on screen', 'info')
      }
    } else {
      // Fallback: if gateway not ready yet, nothing to do — user can tap manually
      log('Gateway ready for direct method selection', 'info')
      autoFiredRef.current = false  // allow retry when user taps
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitializing, upieConfigured, razorpayReady, rzpKeyId, selectedGateway, totalPrice])

  // ── WSS Relay: Catch payments in real-time with sub-50ms latency ──
  useEffect(() => {
    wsRelay.connect({ kioskId })
    log(`⚡ [WSS Relay] Connected & listening for instant payment on Order ${orderId}…`, 'info')

    const unsubscribe = wsRelay.catchPayment(orderId, async (payload) => {
      log(`⚡ [WSS Relay] Real-time payment caught! ID: ${payload?.payment?.paymentId || orderId}`, 'success')
      if (pollingRef.current) clearInterval(pollingRef.current)
      setUpiePolling(false)
      setStatus('SUCCESS')
      clearInterval(timerRef.current)
      await recordOrder(payload?.payment?.paymentId || orderId)
    })

    return () => {
      unsubscribe()
    }
  }, [orderId, kioskId])

  // ── In Kiosk Companion Mode: Notify Kiosk & Listen for Hardware Printing ──
  const hasReportedPayingRef = useRef<string | null>(null)
  useEffect(() => {
    if (kioskSession.isKioskSession()) {
      if (status === 'SUCCESS') return
      const paySig = `${orderId}_${totalPrice}`
      if (hasReportedPayingRef.current === paySig) return
      hasReportedPayingRef.current = paySig
      kioskSession.reportPaying({
        fileName: isMultiFile ? `${multiFiles.length} files` : fileName,
        totalPages: isMultiFile
          ? multiFiles.reduce((s, f) => s + f.pageCount * (f.settings?.copies || 1), 0)
          : pageCount * settings.copies,
        copies: settings.copies,
        colourMode: settings.colour,
        duplex: settings.duplex,
        pages: settings.pages || 'ALL',
        pageRange: settings.pages || 'ALL',
        amount: totalPrice,
        orderId,
        settings: {
          ...settings,
          pages: settings.pages || 'ALL',
          pageRange: settings.pages || 'ALL',
        },
        files: isMultiFile
          ? multiFiles.map(f => ({
              id: f.id,
              fileName: f.fileName,
              fileSize: f.fileSize,
              fileType: f.fileType,
              pageCount: f.pageCount || 1,
              copies: f.settings?.copies || settings.copies || 1,
              colour: f.settings?.colour || settings.colour || 'BW',
              duplex: f.settings?.duplex || settings.duplex || 'SINGLE',
              pages: f.settings?.pages || settings.pages || 'ALL',
              pageRange: f.settings?.pages || settings.pages || 'ALL',
              paperSize: f.settings?.paperSize || 'A4',
              scaling: f.settings?.scaling || 'FIT',
              pagesPerSheet: f.settings?.pagesPerSheet || 1,
              orientation: f.settings?.orientation || 'AUTO',
              dpi: f.settings?.dpi || '600',
              settings: f.settings,
            }))
          : undefined,
      })
    }
  }, [fileName, pageCount, settings.copies, settings.colour, settings.duplex, settings.pages, totalPrice, orderId, isMultiFile, multiFiles, status, settings])

  useEffect(() => {
    if (!kioskSession.isKioskSession() || status === 'SUCCESS') return

    const sessionStatusInterval = setInterval(async () => {
      try {
        const s = await kioskSession.getStatus()
        if (s.success && (s.state === 'PRINTING' || s.state === 'DONE')) {
          clearInterval(sessionStatusInterval)
          setStatus('SUCCESS')
          if (timerRef.current) clearInterval(timerRef.current)
          await recordOrder(s.orderId || orderId)
        }
      } catch {}
    }, 1500)

    return () => clearInterval(sessionStatusInterval)
  }, [status, orderId])

  // Auto redirect to upload only if truly no document exists anywhere in store or session
  useEffect(() => {
    const hasDoc =
      hasRealUploadedDoc() ||
      hasAnyReadyFile() ||
      multiFiles.length > 0 ||
      Boolean(typeof window !== 'undefined' && (sessionStorage.getItem('pb_files') || sessionStorage.getItem('pb_file_name')))
    if (!hasDoc) {
      navigate('/print/upload', { replace: true })
    }
  }, [multiFiles.length, navigate])

  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0')
  const seconds = (timeLeft % 60).toString().padStart(2, '0')
  const isUrgent = timeLeft < 60

  // ── Create print order record & dispatch physical print ──
  const isRecordingOrderRef = useRef(false)
  const orderRecordedSuccessfullyRef = useRef(false)

  async function recordOrder(paymentRef?: string) {
    if (isRecordingOrderRef.current || orderRecordedSuccessfullyRef.current) {
      log('ℹ Order dispatch already processed or in-flight; skipping duplicate trigger.', 'info')
      return
    }
    isRecordingOrderRef.current = true

    if (!kioskId || !isCanonicalKioskFormat(kioskId)) {
      isRecordingOrderRef.current = false
      log(`✗ Blocked: Invalid or false station ID "${kioskId}". Orders must specify a valid canonical station (e.g. PB-001).`, 'error')
      setErrorMsg(`Invalid PrintBooth station: ${kioskId || 'none'}. Please select a verified active kiosk.`)
      return
    }
    log('Securing print order…')
    let finalOrderId = orderId
    let releasePin = ''

    const activeFileSetting = multiFiles.find(f => f.status === 'ready')?.settings
    const effectiveSettings: FileSettings = activeFileSetting ? { ...settings, ...activeFileSetting } : settings

    const hasCustomPageColours = effectiveSettings.pageColours && Object.keys(effectiveSettings.pageColours).length > 0
    const hasAnyColourPage = hasCustomPageColours
      ? Object.values(effectiveSettings.pageColours!).some(c => c === 'COLOUR')
      : effectiveSettings.colour === 'COLOUR'
    const effectiveColourMode = hasAnyColourPage ? 'COLOUR' : 'BW'
    if (kioskSession.isKioskSession()) {
      kioskSession.reportPrinting({
        orderId,
        fileName: fileName || (multiFiles[0]?.fileName) || 'document.pdf',
        phase: 'Payment confirmed! Preparing print job…',
      })
    }

    try {
      const selectedPgs = parsePageRange(effectiveSettings.pages || 'ALL', pageCount)
      const effectivePageCount = selectedPgs.length

      const created = await createPrintOrder({
        kioskId,
        fileName,
        pageCount: effectivePageCount,
        copies: effectiveSettings.copies || 1,
        colourMode: effectiveColourMode,
        duplex: effectiveSettings.duplex || 'SINGLE',
        paperSize: effectiveSettings.paperSize || 'A4',
        pageRange: effectiveSettings.pages || 'ALL',
        amount: totalPrice,
        pageColours: effectiveSettings.pageColours,
        pageCopies: effectiveSettings.pageCopies,
        printSettings: {
          pageRange: effectiveSettings.pages || 'ALL',
          pages: effectiveSettings.pages || 'ALL',
          selectedPages: selectedPgs,
          pageCount: effectivePageCount,
          totalDocPages: pageCount,
          docPageCount: pageCount,
          copies: effectiveSettings.copies || 1,
          colourMode: effectiveColourMode,
          colour: effectiveColourMode,
          duplex: effectiveSettings.duplex || 'SINGLE',
          paperSize: effectiveSettings.paperSize || 'A4',
          scaling: effectiveSettings.scaling || 'FIT',
          customScalePercent: effectiveSettings.customScalePercent || 100,
          dpi: effectiveSettings.dpi || '600',
          orientation: effectiveSettings.orientation || 'AUTO',
          pagesPerSheet: effectiveSettings.pagesPerSheet || 1,
          margins: effectiveSettings.margins || 'STANDARD',
          contrastMode: settings.contrastMode || 'BALANCED',
          pageBorder: Boolean(settings.pageBorder),
          pageCopies: settings.pageCopies,
          pageColours: settings.pageColours,
          files: multiFiles.map(f => ({
            id: f.id,
            fileName: f.fileName,
            fileSize: f.fileSize,
            fileType: f.fileType,
            pageCount: f.pageCount,
            copies: f.settings?.copies ? Number(f.settings.copies) : 1,
            colour: (f.settings?.colour || settings.colour || 'BW') as 'BW' | 'COLOUR',
            colourMode: (f.settings?.colour || settings.colour || 'BW') as 'BW' | 'COLOUR',
            duplex: (f.settings?.duplex || settings.duplex || 'SINGLE') as 'SINGLE' | 'DOUBLE',
            pages: f.settings?.pages || 'ALL',
            pageRange: f.settings?.pages || 'ALL',
            paperSize: f.settings?.paperSize || 'A4',
            scaling: f.settings?.scaling || 'FIT',
            pagesPerSheet: f.settings?.pagesPerSheet || 1,
            orientation: f.settings?.orientation || 'AUTO',
            dpi: f.settings?.dpi || '600',
            margins: f.settings?.margins || 'STANDARD',
            contrastMode: f.settings?.contrastMode || 'BALANCED',
            pageBorder: Boolean(f.settings?.pageBorder),
            pageCopies: f.settings?.pageCopies,
            pageColours: f.settings?.pageColours,
            settings: f.settings,
          })),
        },
      })
      finalOrderId = created?.orderNumber || orderId
      releasePin = created?.releasePin || created?.otp || created?.pickupCode || ''
      if (!releasePin) {
        releasePin = Math.floor(1000 + Math.random() * 9000).toString()
      }
      sessionStorage.setItem('pb_order_id', finalOrderId)
      sessionStorage.setItem('pb_release_pin', releasePin)
      if (paymentRef) sessionStorage.setItem('pb_payment_ref', paymentRef)
      log(`✓ Order recorded: ${finalOrderId}`, 'success')
    } catch (e) {
      log(`Order record failed (non-blocking): ${e}`, 'warn')
      if (!releasePin) {
        releasePin = Math.floor(1000 + Math.random() * 9000).toString()
      }
      sessionStorage.setItem('pb_order_id', orderId)
      sessionStorage.setItem('pb_release_pin', releasePin)
    }

    // ── Save to Recent Prints Store ──
    try {
      const recordedFiles = multiFiles.length > 0
        ? multiFiles.map(f => ({
            id: f.id,
            fileName: f.fileName,
            fileType: f.fileType,
            fileSize: f.fileSize,
            pageCount: f.pageCount,
            copies: f.settings?.copies || settings.copies || 1,
            colour: (f.settings?.colour || settings.colour || 'BW') as 'BW' | 'COLOUR',
            duplex: (f.settings?.duplex || settings.duplex || 'SINGLE') as 'SINGLE' | 'DOUBLE',
            pages: f.settings?.pages || settings.pages || 'ALL',
            thumbnail: f.thumbnail || f.realPages?.[0]?.url,
          }))
        : [{
            fileName: fileName || 'Document',
            fileType: 'doc',
            fileSize: 1024,
            pageCount: pageCount || 1,
            copies: settings.copies || 1,
            colour: (settings.colour || 'BW') as 'BW' | 'COLOUR',
            duplex: (settings.duplex || 'SINGLE') as 'SINGLE' | 'DOUBLE',
            pages: settings.pages || 'ALL',
          }]

      const computedSheets = isMultiFile
        ? multiFiles.reduce((acc, f) => acc + parsePageRange(f.settings?.pages || 'ALL', f.pageCount || 1).length * (f.settings?.copies || settings.copies || 1), 0)
        : Math.max(1, parsePageRange(settings.pages || 'ALL', pageCount || 1).length * (settings.copies || 1))

      saveRecentPrint({
        orderId: finalOrderId || orderId,
        otp: releasePin,
        kioskId,
        kioskName,
        totalPrice,
        totalSheets: computedSheets,
        totalPages: isMultiFile
          ? multiFiles.reduce((s, f) => s + parsePageRange(f.settings?.pages || 'ALL', f.pageCount || 1).length, 0)
          : parsePageRange(settings.pages || 'ALL', pageCount || 1).length,
        status: 'PRINTING',
        files: recordedFiles,
        paymentRef: paymentRef || undefined,
      })
    } catch (saveErr) {
      console.warn('[PaymentPage] Failed to save recent print record:', saveErr)
    }

    // ── Dispatch to physical / simulated printer engine ──
    // Ensure all ready files have their physical File blobs hydrated from IndexedDB cache
    for (const mf of multiFiles) {
      if (!mf.file || mf.file.size === 0) {
        const cached = (await getFileFromCache(mf.id)) || (await getFileFromCache('active_doc'))
        if (cached && cached.size > 0) {
          mf.file = cached
        }
      }
    }
    const multiFilesReady = multiFiles.filter(f => f.status === 'ready' && f.file && f.file.size > 0)
    const singleFile = await getUploadedFileAsync()
    let dispatchSuccess = false
    let lastError = ''

    if (multiFilesReady.length > 0) {
      log(`🖨 Transmitting ${multiFilesReady.length} document(s) with exact customized settings to printer…`, 'info')
      for (let idx = 0; idx < multiFilesReady.length; idx++) {
        const mf = multiFilesReady[idx]
        if (mf.file) {
          try {
            const mfSettings = mf.settings || settings
            const mfHasCustomColour = mfSettings.pageColours && Object.keys(mfSettings.pageColours).length > 0
            const mfHasAnyColour = mfHasCustomColour
              ? Object.values(mfSettings.pageColours!).some(c => c === 'COLOUR')
              : mfSettings.colour === 'COLOUR'
            const mfColourMode = mfHasAnyColour ? 'COLOUR' : 'BW'
            const subOrderId = multiFilesReady.length > 1 ? `${finalOrderId}_sub_${idx + 1}` : finalOrderId
            const exactMfCopies = Math.max(1, Number(mf.settings?.copies || 1))
            log(`Sending [${idx + 1}/${multiFilesReady.length}] "${mf.fileName}" (${exactMfCopies} copies, ${mfColourMode}, ${mfSettings.duplex || 'SINGLE'}, pages: ${mfSettings.pages || 'ALL'}, ${mfSettings.paperSize || 'A4'}, ${mfSettings.dpi || '600'} DPI)…`)
            const res = await sendPrintJob({
              file: mf.file,
              fileName: mf.fileName,
              orderId: subOrderId,
              masterOrderId: finalOrderId,
              fileIndex: idx + 1,
              totalFiles: multiFilesReady.length,
              kioskId,
              releasePin,
              copies:             exactMfCopies,
              pageCount:          mf.pageCount                  || 1,
              totalPages:         (mf.pageCount || 1) * exactMfCopies,
              colourMode:         mfColourMode,
              pages:              mfSettings.pages              || 'ALL',
              duplex:             mfSettings.duplex             || 'SINGLE',
              paperSize:          mfSettings.paperSize          || 'A4',
              scaling:            mfSettings.scaling            || 'FIT',
              customScalePercent: mfSettings.customScalePercent || 100,
              dpi:                mfSettings.dpi                || '600',
              orientation:        mfSettings.orientation        || 'AUTO',
              pagesPerSheet:      mfSettings.pagesPerSheet      || 1,
              margins:            mfSettings.margins            || 'STANDARD',
              contrastMode:       mfSettings.contrastMode       || 'BALANCED',
              pageBorder:         Boolean(mfSettings.pageBorder),
              pageColours:        mfSettings.pageColours,
              pageCopies:         mfSettings.pageCopies,
              isImmediate:        true,
              immediate:          true,
            })
            if (res && res.success !== false) {
              dispatchSuccess = true
              log(`✓ [${idx + 1}/${multiFilesReady.length}] "${mf.fileName}" dispatched with specified settings!`, 'success')
            } else {
              lastError = res?.error || 'Failed to dispatch print job'
              log(`✗ Print dispatch response error: ${lastError}`, 'error')
            }
          } catch (err: any) {
            lastError = err?.message || String(err)
            log(`Print transmission error: ${lastError}`, 'error')
          }
        }
      }
    } else if (singleFile) {
      log(`🖨 Transmitting document "${singleFile.name}" with selected settings to printer…`, 'info')
      try {
        const res = await sendPrintJob({
          file: singleFile,
          fileName: singleFile.name,
          orderId: finalOrderId,
          kioskId,
          releasePin,
          isImmediate:        true,
          immediate:          true,
          copies:             effectiveSettings.copies             || 1,
          pageCount:          pageCount                            || 1,
          totalPages:         (pageCount || 1) * (effectiveSettings.copies || 1),
          colourMode:         effectiveColourMode,
          pages:              effectiveSettings.pages              || 'ALL',
          duplex:             effectiveSettings.duplex             || 'SINGLE',
          paperSize:          effectiveSettings.paperSize          || 'A4',
          scaling:            effectiveSettings.scaling            || 'FIT',
          customScalePercent: effectiveSettings.customScalePercent || 100,
          dpi:                effectiveSettings.dpi                || '600',
          orientation:        effectiveSettings.orientation        || 'AUTO',
          pagesPerSheet:      effectiveSettings.pagesPerSheet      || 1,
          margins:            effectiveSettings.margins            || 'STANDARD',
          contrastMode:       effectiveSettings.contrastMode       || 'BALANCED',
          pageBorder:         Boolean(effectiveSettings.pageBorder),
          pageColours:        effectiveSettings.pageColours,
          pageCopies:         effectiveSettings.pageCopies,
        })
        if (res && res.success !== false) {
          dispatchSuccess = true
          log(`✓ "${singleFile.name}" dispatched for instant autonomous printing!`, 'success')
        } else {
          lastError = res?.error || 'Failed to dispatch print job'
          log(`✗ Print dispatch response error: ${lastError}`, 'error')
        }
      } catch (err: any) {
        lastError = err?.message || String(err)
        log(`Print dispatch error: ${lastError}`, 'error')
      }
    } else {
      log('No local File in store, dispatching session document with selected settings to printer…', 'info')
      try {
        const res = await sendPrintJob({
          fileName,
          orderId: finalOrderId,
          kioskId,
          releasePin,
          copies:             settings.copies             || 1,
          pageCount:          pageCount                   || 1,
          totalPages:         (pageCount || 1) * (settings.copies || 1),
          colourMode:         effectiveColourMode,
          pages:              settings.pages              || 'ALL',
          duplex:             settings.duplex             || 'SINGLE',
          paperSize:          settings.paperSize          || 'A4',
          scaling:            settings.scaling            || 'FIT',
          customScalePercent: settings.customScalePercent || 100,
          dpi:                settings.dpi                || '600',
          orientation:        settings.orientation        || 'AUTO',
          pagesPerSheet:      settings.pagesPerSheet      || 1,
          margins:            settings.margins            || 'STANDARD',
          contrastMode:       settings.contrastMode       || 'BALANCED',
          pageBorder:         Boolean(settings.pageBorder),
          pageColours:        settings.pageColours,
          pageCopies:         settings.pageCopies,
        })
        if (res && res.success !== false) {
          dispatchSuccess = true
          log(`✓ "${fileName}" dispatched for instant autonomous printing!`, 'success')
        } else {
          lastError = res?.error || 'Failed to dispatch print job'
          log(`✗ Print dispatch notice: ${lastError}`, 'warn')
        }
      } catch (err: any) {
        lastError = err?.message || String(err)
        log(`Print dispatch notice: ${lastError}`, 'warn')
      }
    }

    if (!dispatchSuccess && lastError) {
      sessionStorage.setItem('pb_print_dispatch_error', lastError)
    }

    orderRecordedSuccessfullyRef.current = true
    isRecordingOrderRef.current = false

    // Clean up local document stores for the completed job
    clearAllFiles()
    clearUploadedDoc()
    sessionStorage.removeItem('pb_files')
    sessionStorage.removeItem('pb_file_name')
    sessionStorage.removeItem('pb_file_size')
    sessionStorage.removeItem('pb_page_count')
    sessionStorage.removeItem('pb_settings')
    sessionStorage.removeItem('pb_confirm_mode')
    sessionStorage.removeItem('pb_order_id')
    sessionStorage.removeItem('pb_client_txn_id')

    // Preserve the user's selected kiosk ID
    const targetKioskId = kioskId || sessionStorage.getItem('pb_kiosk_id') || localStorage.getItem('pb_kiosk_id') || 'PB-001'
    sessionStorage.setItem('pb_kiosk_id', targetKioskId)
    localStorage.setItem('pb_kiosk_id', targetKioskId)
    sessionStorage.setItem('pb_print_step', 'upload')

    const activeToken = sessionStorage.getItem('pb_kiosk_session_token')
    const redirectUrl = activeToken
      ? `/print?id=${encodeURIComponent(targetKioskId)}&session=${encodeURIComponent(activeToken)}&step=upload`
      : `/print?id=${encodeURIComponent(targetKioskId)}&step=upload`

    setTimeout(() => {
      window.location.replace(redirectUrl)
    }, 1200)
  }

  // ── Test Mode: Simulate Payment to test hardware printing without paying ──
  const [isSimulating, setIsSimulating] = useState(false)

  async function handleSimulatePayment() {
    if (isSimulating || isRecordingOrderRef.current || orderRecordedSuccessfullyRef.current) return
    setIsSimulating(true)
    setStatus('PROCESSING')
    log('🧪 [Test Mode] Simulating payment for hardware printing verification…', 'info')

    try {
      const activeSessionId = kioskSession.getSessionId() || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pb_kiosk_session_id') : null)

      // Notify backend simulation endpoint to transition kiosk session & trigger hardware print
      try {
        const endpoint = activeSessionId
          ? `${API}/api/kiosk-sessions/${encodeURIComponent(activeSessionId)}/simulate-payment`
          : `${API}/api/kiosk-sessions/kiosk/${encodeURIComponent(kioskId)}/simulate-payment`

        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: activeSessionId,
            kioskId,
            orderId,
            amount: totalPrice,
            isSimulated: true,
          }),
        })
      } catch (simErr) {
        log(`Simulation session ping notice: ${simErr}`, 'warn')
      }

      setStatus('SUCCESS')
      if (timerRef.current) clearInterval(timerRef.current)
      await recordOrder('SIMULATED_TEST_PAYMENT')
    } catch (err: any) {
      log(`Simulation execution failed: ${err?.message || err}`, 'error')
      setIsSimulating(false)
      setStatus('WAITING')
    }
  }

  const renderSimulatePaymentCard = () => (
    <div className="test-simulate-card" id="test-simulate-payment-card">
      <div className="test-simulate-top">
        <div className="test-simulate-badge">
          <Lightning size={13} weight="fill" />
          <span>HARDWARE TEST MODE</span>
        </div>
        <span className="test-simulate-zero-cost">₹0 TEST RUN</span>
      </div>
      <div className="test-simulate-body">
        <div className="test-simulate-info">
          <h4 className="test-simulate-title">Simulate Payment (Test Print)</h4>
          <p className="test-simulate-desc">
            Test printer hardware feed, B&W / Colour output, and print settings immediately without paying.
          </p>
        </div>
        <button
          type="button"
          className={`test-simulate-btn ${isSimulating ? 'loading' : ''}`}
          id="simulate-payment-btn"
          onClick={handleSimulatePayment}
          disabled={isSimulating}
        >
          <Printer size={18} weight="bold" />
          <span>{isSimulating ? 'Simulating & Printing…' : 'Simulate Payment & Print'}</span>
        </button>
      </div>
    </div>
  )

  // ── Main Razorpay payment handler (with direct method routing) ──
  async function handleRazorpayPayment(targetMethod?: 'upi' | 'card' | 'wallet' | 'netbanking') {
    if (!razorpayReady) {
      log('Cannot proceed — Razorpay SDK not loaded', 'error')
      setGatewayErrorMsg('Razorpay SDK not loaded. Check internet connection.')
      return
    }
    if (!rzpKeyId) {
      log('Cannot proceed — no Razorpay Key ID', 'error')
      setGatewayErrorMsg(`Razorpay Key ID and Secret are not configured for Station ${kioskId}. Please contact the merchant.`)
      return
    }

    setStatus('PROCESSING')
    setActiveMethod(targetMethod || 'all')
    setGatewayErrorMsg('')
    log(`Initiating direct checkout for method: ${targetMethod || 'all'}…`)

    let razorpayOrderId: string | undefined
    let amountInPaise = totalPrice * 100

    if (apiOnline) {
      try {
        log(`POST ${API}/api/razorpay/create-order — amount: ₹${totalPrice}`)
        const r = await fetch(`${API}/api/razorpay/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, amount: totalPrice, kioskId }),
        })
        const j = await r.json()
        if (j.success) {
          razorpayOrderId = j.data.razorpayOrderId
          amountInPaise   = j.data.amount
          log(`✓ Razorpay order created: ${razorpayOrderId}`, 'success')
        } else {
          log(`Backend order creation failed: ${j.error}`, 'warn')
          if (j.kioskOffline) {
            setStatus('FAILED')
            setActiveMethod(null)
            setErrorMsg(j.error || 'This station is currently offline or powered off. Please ask store staff or choose another station.')
            return
          }
        }
      } catch (err) {
        log(`Could not create backend order: ${err}`, 'warn')
      }
    } else {
      log('Backend offline — opening Razorpay in key-only mode', 'warn')
    }

    const options: any = {
      key: rzpKeyId,
      amount: amountInPaise,
      currency: 'INR',
      name: 'PrintBooth Kiosk',
      description: isMultiFile
        ? `${multiFiles.length} files · ${kioskName}`
        : `${pageCount * settings.copies} page(s) · ${fileName}`,
      notes: { orderId, kioskId, kioskMode: 'anonymous', selectedMethod: targetMethod || 'all' },
      theme: { color: '#dc2626' },
      prefill: {
        name: 'Kiosk Guest',
        email: 'guest@kiosk.printbooth',
        contact: '9999999999',
        ...(targetMethod ? { method: targetMethod } : {}),
      },
      readonly: { name: true, email: true, contact: true },
      config: {
        display: {
          hide: [{ method: 'emi' }, { method: 'paylater' }],
          preferences: { show_default_blocks: !targetMethod },
          ...(targetMethod ? {
            blocks: {
              chosen: {
                name: targetMethod === 'upi' ? 'UPI & QR Code' : targetMethod === 'card' ? 'Cards' : targetMethod === 'wallet' ? 'Wallets' : 'Net Banking',
                instruments: [{ method: targetMethod }],
              },
            },
            sequence: ['block.chosen'],
          } : {}),
        },
      },
      send_sms_hash: false,
      modal: {
        ondismiss: () => {
          log('Payment window closed by user', 'warn')
          if (status === 'PROCESSING') setStatus('WAITING')
          setActiveMethod(null)
        },
      },
      handler: async (response: any) => {
        log(`✓ Payment captured — ID: ${response.razorpay_payment_id}`, 'success')
        log(`  Order ID: ${response.razorpay_order_id}`)
        log(`  Signature: ${response.razorpay_signature?.slice(0, 20)}…`)

        if (apiOnline && razorpayOrderId) {
          try {
            log(`POST ${API}/api/razorpay/verify — verifying HMAC signature…`)
            const vr = await fetch(`${API}/api/razorpay/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                orderId,
                kioskId,
              }),
            })
            const vj = await vr.json()
            if (vj.success) {
              log('✓ Signature verified — payment authentic', 'success')
              setStatus('SUCCESS')
              clearInterval(timerRef.current)
              await recordOrder(response.razorpay_payment_id)
            } else {
              log(`✗ Signature verification failed: ${vj.error}`, 'error')
              setStatus('FAILED')
              setActiveMethod(null)
              setErrorMsg('Payment verification failed. Please contact staff.')
            }
          } catch (err) {
            log(`Verify request failed: ${err}`, 'error')
            setStatus('SUCCESS')
            clearInterval(timerRef.current)
            await recordOrder(response.razorpay_payment_id)
          }
        } else {
          log('Backend offline — marking success based on Razorpay callback', 'warn')
          setStatus('SUCCESS')
          clearInterval(timerRef.current)
          await recordOrder(response.razorpay_payment_id)
        }
      },
    }

    if (razorpayOrderId) options.order_id = razorpayOrderId

    try {
      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', (response: any) => {
        log(`✗ Payment failed: ${response.error?.description}`, 'error')
        setStatus('FAILED')
        setActiveMethod(null)
        setErrorMsg(response.error?.description || 'Payment was not completed. Please try again.')
      })
      log(`Opening Razorpay Checkout for ${targetMethod || 'all'}…`)
      rzp.open()
    } catch (err: any) {
      log(`Failed to open Razorpay: ${err.message}`, 'error')
      setStatus('FAILED')
      setActiveMethod(null)
      setErrorMsg(`Could not launch payment gateway: ${err.message}`)
    }
  }

  // ── UPI Express: Create Order ──
  async function handleUpiExpressPayment() {
    if (!upieConfigured) {
      log('Cannot proceed — UPI Express not configured', 'error')
      setGatewayErrorMsg(`UPI Express API Key is not configured for Station ${kioskId}. Please contact the merchant.`)
      return
    }

    setStatus('PROCESSING')
    setGatewayErrorMsg('')
    log('Creating UPI Express order…')

    try {
      // Use the stable orderId for UPI Express clientTxnId so order IDs match exactly
      const effectiveClientTxnId = orderId || ('PB-' + Array.from(crypto.getRandomValues(new Uint8Array(10)))
        .map(b => b.toString(16).padStart(2, '0')).join(''))

      const r = await fetch(`${API}/api/upiexpress/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientTxnId:     effectiveClientTxnId,
          amount:          String(totalPrice),
          customerName:    'Kiosk Guest',
          customerEmail:   'guest@kiosk.printbooth',
          customerMobile:  '9999999999',
          redirectUrl:     `${window.location.origin}/print?id=${encodeURIComponent(kioskId || 'PB-001')}&step=upload`,
          webhookUrl:      `${API}/api/upiexpress/webhook`,
          note:            'PrintBooth',
          kioskId,
        }),
      })
      const j = await r.json()

      if (!j.success) {
        setStatus('FAILED')
        setGatewayErrorMsg(j.error || (j.kioskOffline ? 'This station is currently offline or powered off.' : 'Failed to create UPI Express order.'))
        return
      }

      setUpieOrder({ ...j.data, amount: String(totalPrice) })
      setStatus('WAITING')
      log(`✓ UPI Express order created: #${j.data.orderId}`, 'success')
      log(`Payment URL ready — awaiting UPI scan…`, 'info')

      // Start polling for payment status using the exact clientTxnId
      const pollingClientTxnId = j.data?.clientTxnId || effectiveClientTxnId
      startUpiExpressPolling(pollingClientTxnId)
    } catch (err: any) {
      log(`UPI Express order creation failed: ${err.message}`, 'error')
      setStatus('FAILED')
      setGatewayErrorMsg(err.message || 'Failed to create UPI Express order.')
    }
  }

  // ── UPI Express: Poll for payment status ──
  function startUpiExpressPolling(clientTxnId: string) {
    if (pollingRef.current) clearInterval(pollingRef.current)
    setUpiePolling(true)
    log('Polling UPI Express for payment status (every 4s)…', 'info')

    let attempts = 0
    const MAX_ATTEMPTS = 75 // ~5 min at 4s intervals

    pollingRef.current = setInterval(async () => {
      attempts++
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(pollingRef.current)
        setUpiePolling(false)
        log('Payment polling timed out', 'warn')
        return
      }

      try {
        const r = await fetch(`${API}/api/upiexpress/check-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientTxnId, kioskId }),
        })
        const j = await r.json()

        if (j.success && j.data?.status === 'success') {
          clearInterval(pollingRef.current)
          setUpiePolling(false)
          log(`✓ UPI payment confirmed — UPI TXN: ${j.data.upi_txn_id}`, 'success')
          setStatus('SUCCESS')
          clearInterval(timerRef.current)
          await recordOrder(j.data.upi_txn_id || clientTxnId)
        } else if (j.data?.status === 'failed') {
          clearInterval(pollingRef.current)
          setUpiePolling(false)
          log('✗ UPI payment failed', 'error')
          setStatus('FAILED')
          setErrorMsg('Payment failed. Please try again.')
        } else {
          log(`Polling attempt ${attempts}/${MAX_ATTEMPTS} — status: ${j.data?.status || 'pending'}…`, 'info')
        }
      } catch (err) {
        log(`Polling error (attempt ${attempts}): ${err}`, 'warn')
      }
    }, 4000)
  }

  // Strictly use upiintent returned from UPI Express API without modifying anything (matching test.py)
  const upiIntentString = useMemo(() => {
    if (upieOrder && upieOrder.amount && Math.abs(Number(upieOrder.amount) - Number(totalPrice)) > 0.25) {
      return ''
    }
    const raw = upieOrder?.upiIntentUrl || (upieOrder as any)?.upiintent
    if (raw && typeof raw === 'string' && raw.trim().startsWith('upi://')) {
      return raw.trim()
    }
    return ''
  }, [upieOrder, totalPrice])

  const displayName  = isMultiFile ? `${multiFiles.length} files` : fileName

  // ── Mobile UPI Directs Component (PhonePe, Google Pay, Paytm, Other UPI) ──
  function MobileUpiDirects({
    gateway,
    intent,
  }: {
    gateway: GatewayType
    intent?: UpiExpressOrder['upiIntent']
  }) {
    const rawPaymentUrl = upieOrder?.paymentUrl || ''
    const baseUpi = upiIntentString || rawPaymentUrl

    const makeSchemeLink = (scheme: string, standardLink?: string) => {
      if (standardLink) return standardLink
      if (baseUpi.startsWith('upi://pay?')) {
        return `${scheme}://${baseUpi.replace(/^upi:\/\//, '')}`
      }
      return baseUpi
    }

    const items = [
      {
        id: 'phonepe-btn',
        label: 'PhonePe',
        sublabel: 'Fastest · 1-Tap UPI App Pay',
        logo: '/upi/phonepay.png',
        link: gateway === 'upiexpress' ? (intent?.phonepe_link || makeSchemeLink('phonepe', baseUpi)) : undefined,
        onClick: () => {
          log('Opening PhonePe direct UPI…', 'info')
          if (gateway === 'razorpay') {
            handleRazorpayPayment('upi')
          } else {
            if (!upiePolling) setUpiePolling(true)
          }
        },
        badge: 'Fastest',
      },
      {
        id: 'gpay-btn',
        label: 'Google Pay',
        sublabel: 'Instant transfer via Google Pay',
        logo: '/upi/gpay.png',
        link: gateway === 'upiexpress' ? (intent?.gpay_link || makeSchemeLink('tez', baseUpi)) : undefined,
        onClick: () => {
          log('Opening Google Pay direct UPI…', 'info')
          if (gateway === 'razorpay') {
            handleRazorpayPayment('upi')
          } else {
            if (!upiePolling) setUpiePolling(true)
          }
        },
        badge: 'Instant',
      },
      {
        id: 'paytm-btn',
        label: 'Paytm',
        sublabel: 'Pay via Paytm UPI or Wallet',
        logo: '/upi/paytm.png',
        link: gateway === 'upiexpress' ? (intent?.paytm_link || makeSchemeLink('paytmmp', baseUpi)) : undefined,
        onClick: () => {
          log('Opening Paytm direct UPI…', 'info')
          if (gateway === 'razorpay') {
            handleRazorpayPayment('upi')
          } else {
            if (!upiePolling) setUpiePolling(true)
          }
        },
        badge: 'Instant',
      },
      {
        id: 'other-upi-btn',
        label: 'Other UPI Apps',
        sublabel: 'BHIM, Cred, Navi, Amazon Pay & all apps',
        icon: <Lightning size={20} weight="fill" color="#dc2626" />,
        link: gateway === 'upiexpress' ? (intent?.bhim_link || baseUpi || rawPaymentUrl) : undefined,
        onClick: () => {
          log('Opening UPI app selector…', 'info')
          if (gateway === 'razorpay') {
            handleRazorpayPayment('upi')
          } else {
            if (!upiePolling) setUpiePolling(true)
          }
        },
        badge: 'All Apps',
      },
    ]

    return (
      <div className="mobile-upi-direct-container">
        <div className="mobile-upi-header">
          <div className="mobile-upi-title-row">
            <Lightning size={18} weight="fill" color="#dc2626" />
            <span className="mobile-upi-title">Tap your UPI App to Pay ₹{totalPrice}</span>
          </div>
          <p className="mobile-upi-subtitle">No QR scanning required — launch and approve directly on your phone</p>
        </div>

        <div className="mobile-upi-cards-list">
          {items.map(item => {
            if (item.link) {
              return (
                <a
                  key={item.id}
                  id={item.id}
                  href={item.link}
                  className="mobile-upi-card"
                  target="_top"
                  onClick={item.onClick}
                >
                  <div className="mobile-upi-card-left">
                    <div className={`mobile-upi-card-logo ${item.icon ? 'icon' : ''}`}>
                      {item.logo ? (
                        <img src={item.logo} alt={item.label} />
                      ) : (
                        item.icon
                      )}
                    </div>
                    <div className="mobile-upi-card-info">
                      <span className="mobile-upi-card-name">{item.label}</span>
                      <span className="mobile-upi-card-sub">{item.sublabel}</span>
                    </div>
                  </div>
                  <span className="mobile-upi-card-badge">{item.badge}</span>
                </a>
              )
            }
            return (
              <button
                key={item.id}
                id={item.id}
                type="button"
                className="mobile-upi-card"
                onClick={item.onClick}
              >
                <div className="mobile-upi-card-left">
                  <div className={`mobile-upi-card-logo ${item.icon ? 'icon' : ''}`}>
                    {item.logo ? (
                      <img src={item.logo} alt={item.label} />
                    ) : (
                      item.icon
                    )}
                  </div>
                  <div className="mobile-upi-card-info">
                    <span className="mobile-upi-card-name">{item.label}</span>
                    <span className="mobile-upi-card-sub">{item.sublabel}</span>
                  </div>
                </div>
                <span className="mobile-upi-card-badge">{item.badge}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="kiosk-pay-root">
      {/* ── Kiosk Location & Anonymous Guarantee ── */}
      <div className="kiosk-badge-row">
        <span className="kiosk-station-pill">
          {kioskName} · Station {kioskId}
        </span>
        <span className="kiosk-privacy-pill">
          <Lock size={12} weight="bold" />
          100% Anonymous Kiosk
        </span>
      </div>

      {/* ── Admin-Specified Payment Gateway Header (Locked / Enforced) ── */}
      {status === 'WAITING' && !isKioskMode && (
        <div className="gateway-assigned-banner" id="gateway-assigned-banner">
          <div className="gateway-assigned-left">
            <div className={`gateway-assigned-icon ${selectedGateway}`}>
              {selectedGateway === 'razorpay' ? (
                <CreditCard size={20} weight="bold" />
              ) : (
                <QrCode size={20} weight="bold" />
              )}
            </div>
            <div className="gateway-assigned-info">
              <div className="gateway-assigned-title-row">
                <span className="gateway-assigned-badge">
                  <ShieldCheck size={12} weight="fill" />
                  VERIFIED GATEWAY
                </span>
                <span className="gateway-assigned-station">Station {kioskId}</span>
              </div>
              <div className="gateway-assigned-title">
                {selectedGateway === 'razorpay' ? 'Razorpay Secure Checkout' : 'UPI Express Instant Gateway'}
              </div>
              <div className="gateway-assigned-sub">
                {selectedGateway === 'razorpay'
                  ? 'Credit/Debit Cards · Net Banking · UPI · Verified Account'
                  : 'Direct Bank-to-Bank UPI Transfer · Zero Gateway Surcharge'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Double-Bezel Hardware Kiosk Card Shell ── */}
      <div className="kiosk-card-shell">
        <div className="kiosk-card">
          <Skeleton
            name="payment-details-card"
            loading={isInitializing}
            animate="shimmer"
            fallback={<PaymentBoneyardFallback />}
          >
            {/* ── KIOSK SESSION MODE: ZERO-TOUCH COMPANION CARD ── */}
            {isKioskMode ? (
              <div className="kiosk-companion-view" id="kiosk-companion-view">
                {/* Hero Header with exact required prompt text */}
                <div className="kiosk-companion-header">
                  <div className="kiosk-companion-icon-wrap">
                    <Printer size={32} weight="bold" color="#dc2626" />
                  </div>
                  <h1 className="kiosk-companion-headline">Please check machine display for payment</h1>
                  <p className="kiosk-companion-sub">
                    After payment, your print will dispense automatically.
                  </p>
                </div>

                {/* Details Card */}
                <div className="kiosk-companion-summary-card">
                  <div className="kiosk-companion-summary-row">
                    <span className="kiosk-companion-row-label">Amount Payable</span>
                    <span className="kiosk-companion-price">₹{totalPrice.toFixed(2)}</span>
                  </div>
                  <div className="kiosk-companion-divider" />
                  <div className="kiosk-companion-summary-row">
                    <span className="kiosk-companion-row-label">Document</span>
                    <span className="kiosk-companion-row-val truncate">{isMultiFile ? `${multiFiles.length} files` : fileName}</span>
                  </div>
                  <div className="kiosk-companion-summary-row">
                    <span className="kiosk-companion-row-label">Configuration</span>
                    <span className="kiosk-companion-row-val">
                      {settings.colour === 'COLOUR' ? 'Full Colour' : 'Black & White'} · {settings.copies} {settings.copies === 1 ? 'copy' : 'copies'} · {isMultiFile ? multiFiles.reduce((s, f) => s + f.pageCount * (f.settings?.copies || 1), 0) : pageCount * settings.copies} sheets
                    </span>
                  </div>
                  <div className="kiosk-companion-summary-row">
                    <span className="kiosk-companion-row-label">Station</span>
                    <span className="kiosk-companion-row-val">
                      {kioskName || kioskId}
                    </span>
                  </div>
                </div>

                {/* Live Waiting Pulse Banner or Gateway Warning */}
                {gatewayErrorMsg ? (
                  <div className="gateway-unconfigured-notice" id="gateway-unconfigured-notice" style={{ margin: '14px 0' }}>
                    <XCircle size={22} weight="bold" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13px' }}>Gateway Not Configured</div>
                      <div style={{ fontSize: '11.5px', opacity: 0.85, marginTop: '2px', lineHeight: 1.4 }}>
                        {gatewayErrorMsg}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="kiosk-companion-pulse-box">
                    <span className="kiosk-companion-pulse-dot" />
                    <div className="kiosk-companion-pulse-content">
                      <strong>Payment QR is active on kiosk display</strong>
                      <span>Scan with any UPI app on the machine to complete payment…</span>
                    </div>
                  </div>
                )}

                {/* Information Callout */}
                <div className="kiosk-companion-notice" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(220, 38, 38, 0.05)',
                  border: '1px solid rgba(220, 38, 38, 0.18)',
                  color: '#991b1b',
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}>
                  <span>⚡ After payment, your print will dispense automatically from the collection tray.</span>
                </div>

                {/* ── Test Mode Payment Simulation Card ── */}
                {renderSimulatePaymentCard()}

                {/* Timer & Privacy footer */}
                <div className="kiosk-footer-status" style={{ marginTop: 16 }}>
                  <div className={`kiosk-timer-pill${isUrgent ? ' urgent' : ''}`}>
                    <Clock size={13} weight="bold" />
                    <span>Session: {minutes}:{seconds}</span>
                  </div>
                  <span className="kiosk-no-info-text">
                    Instant Automated Dispense • PrintBooth Kiosk
                  </span>
                </div>
              </div>
            ) : selectedGateway === 'razorpay' ? (
              <div className="rzp-dynamic-screen" id="rzp-dynamic-screen">
                <div className="rzp-summary-box">
                  <div className="rzp-summary-left">
                    <span className="rzp-summary-label">ORDER TOTAL</span>
                    <span className="rzp-summary-price">₹{totalPrice}</span>
                  </div>
                  <div className="rzp-summary-right">
                    <div className="rzp-summary-timer">
                      <Clock size={13} weight="bold" />
                      <span style={{ color: isUrgent ? '#dc2626' : undefined }}>{minutes}:{seconds}</span>
                    </div>
                    <span className="rzp-summary-station">Station {kioskId || 'PB-001'}</span>
                  </div>
                </div>

                {(!isInitializing && (!rzpKeyId || Boolean(gatewayErrorMsg))) && (
                  <div className="gateway-unconfigured-notice" id="gateway-unconfigured-notice" style={{ margin: '14px 0' }}>
                    <XCircle size={22} weight="bold" />
                    <div>
                      <div style={{ fontWeight: 700 }}>Razorpay Gateway Pending Setup</div>
                      <div style={{ fontSize: '11.5px', opacity: 0.85, marginTop: '2px', lineHeight: 1.4 }}>
                        {gatewayErrorMsg || `Merchant API credentials (Key ID) for Station ${kioskId} have not been configured yet.`}
                      </div>
                    </div>
                  </div>
                )}

                {isMobile ? (
                  /* ── Mobile: ONLY UPI Directs, NO QR Code ── */
                  <div className="mobile-rzp-wrap">
                    <MobileUpiDirects gateway="razorpay" />

                    <div className="mobile-more-options-wrap">
                      <button
                        type="button"
                        className="mobile-toggle-more-btn"
                        onClick={() => setShowMoreMethods(v => !v)}
                      >
                        <CreditCard size={15} weight="bold" />
                        <span>{showMoreMethods ? 'Hide Other Payment Options' : 'Cards, Wallets & Net Banking'}</span>
                        <CaretDown
                          size={14}
                          weight="bold"
                          style={{
                            transform: showMoreMethods ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                          }}
                        />
                      </button>

                      {showMoreMethods && (
                        <div className="rzp-methods-list animate-fadeIn" style={{ marginTop: 10 }}>
                          {/* Cards */}
                          <div
                            className={`rzp-method-item card ${activeMethod === 'card' ? 'loading' : ''}`}
                            onClick={() => handleRazorpayPayment('card')}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="rzp-method-top">
                              <div className="rzp-method-icon card">
                                <CreditCard size={20} weight="bold" />
                              </div>
                              <div className="rzp-method-details">
                                <span className="rzp-method-title">Credit &amp; Debit Cards</span>
                                <span className="rzp-method-desc">Visa, Mastercard, RuPay</span>
                              </div>
                              <CaretRight size={16} weight="bold" className="rzp-method-arrow" />
                            </div>
                          </div>

                          {/* Wallets */}
                          <div
                            className={`rzp-method-item wallet ${activeMethod === 'wallet' ? 'loading' : ''}`}
                            onClick={() => handleRazorpayPayment('wallet')}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="rzp-method-top">
                              <div className="rzp-method-icon wallet">
                                <Wallet size={20} weight="bold" />
                              </div>
                              <div className="rzp-method-details">
                                <span className="rzp-method-title">Digital Wallets</span>
                                <span className="rzp-method-desc">Paytm, PhonePe, Mobikwik</span>
                              </div>
                              <CaretRight size={16} weight="bold" className="rzp-method-arrow" />
                            </div>
                          </div>

                          {/* Net Banking */}
                          <div
                            className={`rzp-method-item bank ${activeMethod === 'netbanking' ? 'loading' : ''}`}
                            onClick={() => handleRazorpayPayment('netbanking')}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="rzp-method-top">
                              <div className="rzp-method-icon bank">
                                <Bank size={20} weight="bold" />
                              </div>
                              <div className="rzp-method-details">
                                <span className="rzp-method-title">Net Banking</span>
                                <span className="rzp-method-desc">50+ Major Banks</span>
                              </div>
                              <CaretRight size={16} weight="bold" className="rzp-method-arrow" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ── PC / Laptop: Show QR Code, Wallets, Cards, Net Banking ── */
                  <>
                    <div className="rzp-dynamic-header">
                      <p className="rzp-dynamic-heading">Payment Options for Laptop / PC</p>
                      <p className="rzp-dynamic-sub">Scan the QR code with your phone or select cards/wallets below:</p>
                    </div>

                    <div className="rzp-methods-list">
                      {/* 1. UPI & QR Code */}
                      <div
                        className={`rzp-method-item upi ${activeMethod === 'upi' ? 'loading' : ''}`}
                        onClick={() => handleRazorpayPayment('upi')}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="rzp-method-top">
                          <div className="rzp-method-icon upi">
                            <QrCode size={22} weight="bold" />
                          </div>
                          <div className="rzp-method-details">
                            <div className="rzp-method-title-row">
                              <span className="rzp-method-title">UPI &amp; Dynamic QR Code</span>
                              <span className="rzp-badge-fast">
                                <Lightning size={10} weight="fill" />
                                FASTEST · 0% FEE
                              </span>
                            </div>
                            <span className="rzp-method-desc">Scan Dynamic QR Code via PhonePe, GPay, Paytm or BHIM</span>
                          </div>
                          <CaretRight size={18} weight="bold" className="rzp-method-arrow" />
                        </div>

                        <div className="rzp-upi-direct-chips">
                          <button
                            type="button"
                            className="rzp-app-chip"
                            onClick={(e) => { e.stopPropagation(); handleRazorpayPayment('upi') }}
                            title="Pay with PhonePe"
                          >
                            <img src="/upi/phonepay.png" alt="PhonePe" className="upi-app-chip-img" />
                            <span>PhonePe</span>
                          </button>
                          <button
                            type="button"
                            className="rzp-app-chip"
                            onClick={(e) => { e.stopPropagation(); handleRazorpayPayment('upi') }}
                            title="Pay with Google Pay"
                          >
                            <img src="/upi/gpay.png" alt="Google Pay" className="upi-app-chip-img" />
                            <span>Google Pay</span>
                          </button>
                          <button
                            type="button"
                            className="rzp-app-chip"
                            onClick={(e) => { e.stopPropagation(); handleRazorpayPayment('upi') }}
                            title="Pay with Paytm"
                          >
                            <img src="/upi/paytm.png" alt="Paytm" className="upi-app-chip-img" />
                            <span>Paytm</span>
                          </button>
                          <button
                            type="button"
                            className="rzp-app-chip qr-chip"
                            onClick={(e) => { e.stopPropagation(); handleRazorpayPayment('upi') }}
                            title="Scan Dynamic QR Code"
                          >
                            <QrCode size={13} weight="bold" />
                            <span>Scan QR</span>
                          </button>
                        </div>
                      </div>

                      {/* 2. Wallets */}
                      <div
                        className={`rzp-method-item wallet ${activeMethod === 'wallet' ? 'loading' : ''}`}
                        onClick={() => handleRazorpayPayment('wallet')}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="rzp-method-top">
                          <div className="rzp-method-icon wallet">
                            <Wallet size={22} weight="bold" />
                          </div>
                          <div className="rzp-method-details">
                            <div className="rzp-method-title-row">
                              <span className="rzp-method-title">Digital Wallets</span>
                              <span className="rzp-badge-muted">1-TAP</span>
                            </div>
                            <span className="rzp-method-desc">Paytm, PhonePe, Mobikwik, Amazon Pay</span>
                          </div>
                          <CaretRight size={18} weight="bold" className="rzp-method-arrow" />
                        </div>
                      </div>

                      {/* 3. Cards */}
                      <div
                        className={`rzp-method-item card ${activeMethod === 'card' ? 'loading' : ''}`}
                        onClick={() => handleRazorpayPayment('card')}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="rzp-method-top">
                          <div className="rzp-method-icon card">
                            <CreditCard size={22} weight="bold" />
                          </div>
                          <div className="rzp-method-details">
                            <div className="rzp-method-title-row">
                              <span className="rzp-method-title">Credit &amp; Debit Cards</span>
                              <span className="rzp-badge-muted">3D SECURE</span>
                            </div>
                            <span className="rzp-method-desc">Visa, Mastercard, RuPay, Maestro</span>
                          </div>
                          <CaretRight size={18} weight="bold" className="rzp-method-arrow" />
                        </div>
                      </div>

                      {/* 4. Net Banking */}
                      <div
                        className={`rzp-method-item bank ${activeMethod === 'netbanking' ? 'loading' : ''}`}
                        onClick={() => handleRazorpayPayment('netbanking')}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="rzp-method-top">
                          <div className="rzp-method-icon bank">
                            <Bank size={22} weight="bold" />
                          </div>
                          <div className="rzp-method-details">
                            <div className="rzp-method-title-row">
                              <span className="rzp-method-title">Net Banking</span>
                              <span className="rzp-badge-muted">50+ BANKS</span>
                            </div>
                            <span className="rzp-method-desc">SBI, HDFC, ICICI, Axis &amp; All Major Banks</span>
                          </div>
                          <CaretRight size={18} weight="bold" className="rzp-method-arrow" />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {activeMethod && status === 'PROCESSING' && (
                  <div className="rzp-connecting-pill">
                    <div className="kiosk-spinner" style={{ width: '14px', height: '14px' }} />
                    <span>Opening {activeMethod === 'upi' ? 'UPI' : activeMethod === 'card' ? 'Card Checkout' : activeMethod === 'wallet' ? 'Wallets' : 'Net Banking'}…</span>
                  </div>
                )}

                {/* ── Test Mode Payment Simulation Card ── */}
                {renderSimulatePaymentCard()}

                <div className="rzp-waiting-actions" style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    className="rzp-waiting-cancel-btn"
                    id="payment-back-to-review"
                    onClick={() => {
                      setUpieOrder(null)
                      navigate('/print/review')
                    }}
                  >
                    <ArrowLeft size={14} weight="bold" />
                    <span>Review Order & Print Options</span>
                  </button>
                </div>
              </div>
            ) : (
              /* ── UPI EXPRESS GATEWAY: ALL UPI DIRECTS & DYNAMIC QR ── */
              <>
                {/* Amount Hero */}
                <div className="kiosk-amount-hero">
                  <span className="kiosk-amount-label">Total to Pay</span>
                  <div className="kiosk-amount-value">
                    <span className="kiosk-currency">₹</span>
                    {totalPrice}
                  </div>
                  <span className="kiosk-amount-sub">No extra taxes or convenience fees</span>
                </div>

                {/* Compact Spec Grid */}
                <div className="kiosk-specs-strip">
                  <div className="kiosk-spec-item">
                    <span className="kiosk-spec-label">{isMultiFile ? 'Files' : 'Document'}</span>
                    <span className="kiosk-spec-value" title={displayName}>
                      {isMultiFile ? `${multiFiles.length} uploaded` : displayName}
                    </span>
                  </div>
                  <div className="kiosk-spec-divider" />
                  <div className="kiosk-spec-item">
                    <span className="kiosk-spec-label">Pages</span>
                    <span className="kiosk-spec-value">
                      {isMultiFile
                        ? `${multiFiles.reduce((s, f) => s + f.pageCount * (f.settings?.copies || 1), 0)} total`
                        : `${pageCount * settings.copies} (${settings.copies} ${settings.copies === 1 ? 'copy' : 'copies'})`}
                    </span>
                  </div>
                  <div className="kiosk-spec-divider" />
                  <div className="kiosk-spec-item">
                    <span className="kiosk-spec-label">Print Mode</span>
                    <span className="kiosk-spec-value">
                      {settings.colour === 'BW' ? 'B&W' : 'Colour'} · {settings.duplex === 'SINGLE' ? '1-Sided' : '2-Sided'}
                    </span>
                  </div>
                </div>

                {/* Action Area: QR Code + All UPI Directs */}
                <div className="kiosk-action-area">
                  {/* If UPI Express is unconfigured */}
                  {!isInitializing && (!upieConfigured || Boolean(gatewayErrorMsg)) && !upieOrder && (
                    <div className="gateway-unconfigured-notice" id="gateway-unconfigured-notice">
                      <XCircle size={22} weight="bold" />
                      <div>
                        <div style={{ fontWeight: 700 }}>UPI Express Gateway Pending Setup</div>
                        <div style={{ fontSize: '11.5px', opacity: 0.85, marginTop: '2px', lineHeight: 1.4 }}>
                          {gatewayErrorMsg || `Merchant API credentials for Station ${kioskId} have not been configured yet.`}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="upie-payment-ui">
                    {isMobile ? (
                      /* Mobile: ONLY UPI Directs, NO QR Code */
                      <MobileUpiDirects gateway="upiexpress" intent={upieOrder?.upiIntent} />
                    ) : (
                      /* PC / Laptop: Show QR Code ONLY */
                      <div className="upie-qr-block">
                        <div className="upie-qr-label">
                          <QrCode size={18} weight="bold" />
                          <span>Scan with any UPI app to pay ₹{totalPrice}</span>
                        </div>
                        <div className="upie-qr-frame">
                          {upiIntentString ? (
                            <QRCodeSVG
                              value={upiIntentString}
                              size={220}
                              level="M"
                              includeMargin={true}
                              fgColor="#09090b"
                              bgColor="#ffffff"
                              className="upie-qr-svg"
                            />
                          ) : (
                            <div style={{ width: 220, height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                              <div className="kiosk-spinner" />
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Generating payment QR…</span>
                            </div>
                          )}
                          {(upiePolling || status === 'PROCESSING') && Boolean(upiIntentString) && (
                            <div className="upie-qr-pulse-ring" />
                          )}
                        </div>

                        {/* Supported Apps Badges under QR code */}
                        <div className="upie-qr-supported-row">
                          <span className="upie-qr-supported-text">Supported Apps:</span>
                          <div className="upie-qr-supported-logos">
                            <div className="upie-qr-supported-badge" title="PhonePe">
                              <img src="/upi/phonepay.png" alt="PhonePe" />
                              <span>PhonePe</span>
                            </div>
                            <div className="upie-qr-supported-badge" title="Google Pay">
                              <img src="/upi/gpay.png" alt="Google Pay" />
                              <span>GPay</span>
                            </div>
                            <div className="upie-qr-supported-badge" title="Paytm">
                              <img src="/upi/paytm.png" alt="Paytm" />
                              <span>Paytm</span>
                            </div>
                            <div className="upie-qr-supported-badge generic" title="BHIM / Any UPI">
                              <span>+ Any UPI</span>
                            </div>
                          </div>
                        </div>

                        <div className="upie-qr-hint">
                          Open PhonePe, Google Pay, Paytm, or any UPI app on your phone
                          <br />and scan the QR above to pay ₹{totalPrice}
                        </div>
                      </div>
                    )}

                    {/* Polling status indicator */}
                    <div className="upie-polling-status">
                      {upiePolling ? (
                        <>
                          <div className="kiosk-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                          <span>Waiting for payment confirmation…</span>
                        </>
                      ) : (
                        <span>{isMobile ? 'Tap your UPI app above to complete payment' : 'Scan the QR code above to complete payment'}</span>
                      )}
                    </div>
                  </div>

                  {/* ── Test Mode Payment Simulation Card ── */}
                  {renderSimulatePaymentCard()}

                  {/* Back to Review Order button */}
                  <div className="rzp-waiting-actions" style={{ marginTop: '12px', marginBottom: '4px' }}>
                    <button
                      type="button"
                      className="rzp-waiting-cancel-btn"
                      id="upie-back-to-review"
                      onClick={() => {
                        setUpieOrder(null)
                        navigate('/print/review')
                      }}
                    >
                      <ArrowLeft size={14} weight="bold" />
                      <span>Review Order & Print Options</span>
                    </button>
                  </div>

                  {/* Timer & Privacy footer */}
                  <div className="kiosk-footer-status">
                    <div className={`kiosk-timer-pill${isUrgent ? ' urgent' : ''}`}>
                      <Clock size={13} weight="bold" />
                      <span>Session: {minutes}:{seconds}</span>
                    </div>
                    <span className="kiosk-no-info-text">
                      No phone number or personal details required
                    </span>
                  </div>

                </div>
              </>
            )}
          </Skeleton>
        </div>
      </div>

      {/* ── Minimalist Centered Payment Success / Failure Popup Modal ── */}
      <PaymentStatusModal
        status={status === 'SUCCESS' ? 'SUCCESS' : status === 'FAILED' ? 'FAILED' : null}
        onClose={() => {
          setStatus('WAITING')
          setErrorMsg('')
          setUpieOrder(null)
          if (pollingRef.current) clearInterval(pollingRef.current)
        }}
      />
    </div>
  )
}
