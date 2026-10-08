import { useState, useEffect, useRef, useCallback } from 'react'
import { usePrintFlow, usePrintNavigate as useNavigate } from './PrintFlowContext'
import { getAllFiles, clearAllFiles, parsePageRange } from '@/lib/multiFileStore'
import { getUploadedDoc, clearUploadedDoc } from '@/lib/documentStore'
import { getPrintJobStatus } from '@/lib/api'
import { wsRelayClient } from '@/lib/wsRelayClient'
import gsap from 'gsap'
import {
  CheckCircle,
  Printer,
  MapPin,
  ArrowRight,
  ArrowsClockwise,
  Sparkle,
  FileText,
  Check,
} from '@phosphor-icons/react'
import CustomerPrintOtpScreen from '@/components/print/CustomerPrintOtpScreen'
import { markPrintCompleted, updatePrintStatus, saveRecentPrint } from '@/lib/recentPrintsStore'
import './StatusPage.css'

interface PrintSheet {
  fileId: string
  fileName: string
  pageIndex: number
  copyIndex: number
  imageUrl?: string
  mode: 'mono' | 'color'
}

const R = (a: number, b: number) => a + Math.random() * (b - a)

function generateFallbackArt(n: number, m: 'mono' | 'color') {
  const k = Math.floor(R(0, 5))
  const ph = R(0, 6)
  const h = R(0, 360)
  const col = m === 'color'
  const c = [
    col ? `hsl(${h},88%,52%)` : '#1e293b',
    col ? `hsl(${h + 45},92%,56%)` : '#1e293b',
    col ? `hsl(${h + 190},80%,46%)` : '#1e293b',
  ]
  let g = ''
  if (k === 0) {
    for (let i = 0; i < 9; i++) {
      g += `<circle cx="100" cy="150" r="${14 + i * 11}" fill="${i ? 'none' : c[1]}" stroke="${c[i % 3]}" stroke-width="${1.5 + i % 3}"/>`
    }
  }
  if (k === 1) {
    for (let i = 0; i < 16; i++) {
      const hh = R(20, 150)
      g += `<rect x="${14 + i * 11}" y="${232 - hh}" width="7" height="${hh}" rx="1" fill="${c[i % 3]}"/>`
    }
  }
  if (k === 2) {
    for (let y = 0; y < 14; y++) {
      for (let x = 0; x < 10; x++) {
        const d = Math.hypot(x - 4.5, y - 6.5)
        g += `<circle cx="${20 + x * 18}" cy="${52 + y * 14.5}" r="${Math.max(0.8, 6.2 - d * 0.85)}" fill="${c[(x + y) % 3]}"/>`
      }
    }
  }
  if (k === 3) {
    for (let i = 0; i < 14; i++) {
      let q = `M0 ${70 + i * 12}`
      for (let x = 0; x <= 200; x += 8) {
        q += `L${x} ${70 + i * 12 + Math.sin(x / 22 + i * 0.45 + ph) * 9}`
      }
      g += `<path d="${q}" fill="none" stroke="${c[i % 3]}" stroke-width="${1.8}"/>`
    }
  }
  if (k === 4) {
    for (let i = -6; i < 14; i++) {
      g += `<path d="${i * 18} 270L${i * 18 + 90} 40" stroke="${c[i % 2]}" stroke-width="${3 + i % 3 * 2}"/>`
    }
    g += `<circle cx="100" cy="150" r="46" fill="#f1f5f9"/><circle cx="100" cy="150" r="30" fill="${c[2]}"/>`
  }
  const tag = col ? `<rect x="0" y="0" width="200" height="8" fill="${c[0]}"/>` : ''
  return `<svg viewBox="0 0 200 270">${tag}<g>${g}</g><text x="14" y="28" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="15" letter-spacing="2" fill="#0f172a">PAGE ${String(n).padStart(3, '0')}</text><rect x="14" y="250" width="172" height="2" fill="#0f172a"/><rect x="172" y="15" width="14" height="14" fill="#dc2626"/></svg>`
}

export default function StatusPage() {
  const navigate = useNavigate()
  const flow = usePrintFlow()

  // References
  const stageRef = useRef<HTMLDivElement>(null)
  const printerRef = useRef<HTMLDivElement>(null)
  const planeRef = useRef<HTMLDivElement>(null)
  const isPrintingRef = useRef(false)
  const hasMountedRef = useRef(false)

  // GSAP Thanks Page Refs
  const thanksCardRef = useRef<HTMLDivElement>(null)
  const thanksBadgeRef = useRef<HTMLDivElement>(null)
  const thanksTitleRef = useRef<HTMLHeadingElement>(null)
  const thanksSubtitleRef = useRef<HTMLParagraphElement>(null)
  const thanksDetailsRef = useRef<HTMLDivElement>(null)
  const thanksActionsRef = useRef<HTMLDivElement>(null)
  const confettiContainerRef = useRef<HTMLDivElement>(null)

  // Document and order data
  const orderId = sessionStorage.getItem('pb_order_id') || 'PB-000001'
  const [releasePin, setReleasePin] = useState(() => sessionStorage.getItem('pb_release_pin') || '')
  const kioskId = sessionStorage.getItem('pb_kiosk_id') || 'PB-001'
  const rawSettings = sessionStorage.getItem('pb_settings')
  const globalSettings = rawSettings
    ? JSON.parse(rawSettings)
    : { copies: 1, colour: 'BW', pages: 'ALL', duplex: 'SINGLE' }

  const primaryMode: 'mono' | 'color' =
    globalSettings.colour === 'COLOUR' ? 'color' : 'mono'

  const selectedPrinterName =
    sessionStorage.getItem('pb_printer_name') ||
    sessionStorage.getItem('pb_printer') ||
    'Brother DCP-T420W Printer'

  const kioskName =
    sessionStorage.getItem('pb_kiosk_name') ||
    'PrintBooth — MIT ADT'

  // Verification state: if a releasePin exists, wait for kiosk verification
  const [isPinVerified, setIsPinVerified] = useState<boolean>(!releasePin)

  // Construct print sheets queue based on user's exact selections
  const [sheetsQueue] = useState<PrintSheet[]>(() => {
    const readyFiles = getAllFiles().filter(f => f.status === 'ready')
    const queue: PrintSheet[] = []

    if (readyFiles.length > 0) {
      for (const f of readyFiles) {
        const s = f.settings || globalSettings
        const total = f.pageCount || (f.realPages ? f.realPages.length : 1)
        const selectedPages = parsePageRange(s.pages || 'ALL', total)

        for (const p of selectedPages) {
          const copies =
            s.pageCopies && s.pageCopies[String(p)]
              ? Number(s.pageCopies[String(p)])
              : Number(s.copies || 1)
          const imgUrl = f.realPages && f.realPages[p - 1]?.url
          const pageColour = s.pageColours?.[String(p)] || s.colour
          const mode = pageColour === 'COLOUR' ? 'color' : 'mono'

          for (let c = 1; c <= copies; c++) {
            queue.push({
              fileId: f.id,
              fileName: f.fileName,
              pageIndex: p,
              copyIndex: c,
              imageUrl: imgUrl,
              mode,
            })
          }
        }
      }
    } else {
      const doc = getUploadedDoc()
      const total = doc.pageCount || (doc.realPages ? doc.realPages.length : 1)
      const selectedPages = parsePageRange(globalSettings.pages || 'ALL', total)

      for (const p of selectedPages) {
        const copies =
          globalSettings.pageCopies && globalSettings.pageCopies[String(p)]
            ? Number(globalSettings.pageCopies[String(p)])
            : Number(globalSettings.copies || 1)
        const imgUrl = doc.realPages && doc.realPages[p - 1]?.url
        const pageColour = globalSettings.pageColours?.[String(p)] || globalSettings.colour
        const mode = pageColour === 'COLOUR' ? 'color' : 'mono'

        for (let c = 1; c <= copies; c++) {
          queue.push({
            fileId: 'doc',
            fileName: doc.fileName || 'document.pdf',
            pageIndex: p,
            copyIndex: c,
            imageUrl: imgUrl,
            mode,
          })
        }
      }
    }

    if (queue.length === 0) {
      const count = Number(sessionStorage.getItem('pb_page_count') || 1)
      const copies = Number(globalSettings.copies || 1)
      for (let p = 1; p <= count; p++) {
        for (let c = 1; c <= copies; c++) {
          queue.push({
            fileId: 'fallback',
            fileName: 'Document',
            pageIndex: p,
            copyIndex: c,
            mode: primaryMode,
          })
        }
      }
    }

    return queue
  })

  // State
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)
  const [showThanks, setShowThanks] = useState(false)
  const [lcdText, setLcdText] = useState(isPinVerified ? 'PRINTING' : 'ENTER PIN')
  const [lcdNumber, setLcdNumber] = useState('001')


  // WebSocket relay listener for instant PIN_VERIFIED transition (<50ms)
  useEffect(() => {
    if (isPinVerified) return

    wsRelayClient.connect({ role: 'customer', kioskId, sessionId: orderId })

    const handlePinVerified = (payload: any) => {
      console.log('[StatusPage] ⚡ Received PIN_VERIFIED over WSS Relay:', payload)
      setIsPinVerified(true)
      setLcdText('VERIFIED')
      if (orderId) updatePrintStatus(orderId, 'PRINTING')
    }

    wsRelayClient.on('PIN_VERIFIED', handlePinVerified)
    wsRelayClient.on('PRINT_PROGRESS', handlePinVerified)

    return () => {
      wsRelayClient.off('PIN_VERIFIED', handlePinVerified)
      wsRelayClient.off('PRINT_PROGRESS', handlePinVerified)
    }
  }, [isPinVerified, kioskId, orderId])

  // Background polling for print status or external release
  useEffect(() => {
    if (isPinVerified || !orderId) return
    const pollInterval = setInterval(async () => {
      try {
        const res = await getPrintJobStatus(orderId)
        if (res?.data?.status === 'PRINTING' || res?.data?.status === 'PRINTED') {
          setIsPinVerified(true)
          setLcdText('PRINTING')
          if (res?.data?.status === 'PRINTED') {
            markPrintCompleted(orderId)
          } else {
            updatePrintStatus(orderId, 'PRINTING')
          }
        }
      } catch {}
    }, 2000)
    return () => clearInterval(pollInterval)
  }, [isPinVerified, orderId])



  // Top feeder animation
  const feedSheet = useCallback(() => {
    const printer = printerRef.current
    if (!printer) return
    const f = document.createElement('div')
    f.className = 'mono-feed'
    printer.prepend(f)

    f.animate(
      [
        { transform: 'translate(-50%,0) rotate(-6deg)' },
        { transform: 'translate(-50%,0) rotate(-6deg)', offset: 0.15 },
        { transform: 'translate(-50%,150%) rotate(0deg)' },
      ],
      { duration: 900, easing: 'cubic-bezier(.5,0,.8,.7)', fill: 'forwards' }
    ).finished.then(() => f.remove())
  }, [])

  // Print single sheet animation:
  // EXACT TIMING ENFORCEMENT: 5 seconds for mono, 10 seconds for color
  const printSheet = useCallback(
    async (sheet: PrintSheet, sheetNumber: number) => {
      const printer = printerRef.current
      const plane = planeRef.current
      if (!printer || !plane) return

      setLcdNumber(String(sheetNumber).padStart(3, '0'))
      setLcdText('PRINTING')
      feedSheet()

      const p = document.createElement('div')
      p.className = 'mono-paper'
      p.dataset.m = sheet.mode

      const isMono = sheet.mode === 'mono'
      if (sheet.imageUrl) {
        p.innerHTML = `
          <div class="mono-paper-content">
            <img src="${sheet.imageUrl}" class="mono-paper-img ${sheet.mode}" style="${isMono ? 'filter: grayscale(100%) contrast(108%);' : ''}" alt="Page ${sheet.pageIndex}" />
          </div>
          <div class="mono-cover"></div>
        `
      } else {
        p.innerHTML = generateFallbackArt(sheetNumber, sheet.mode) + '<div class="mono-cover"></div>'
      }

      plane.appendChild(p)

      // Keep maximum 40 paper elements in DOM
      while (plane.querySelectorAll('.mono-paper').length > 40) {
        plane.querySelector('.mono-paper')?.remove()
      }

      // 5 seconds for mono, 10 seconds for color as requested
      const D = sheet.mode === 'color' ? 10000 : 5000
      const E = 'cubic-bezier(.45,.05,.35,1)'
      const end = 'translate(0,6%) rotate(0deg)'

      await new Promise(r => setTimeout(r, 400))

      const coverEl = p.querySelector('.mono-cover')
      if (coverEl) {
        coverEl.animate(
          [
            { transform: 'translateY(0)' },
            { transform: 'translateY(-102%)', offset: 0.85 },
            { transform: 'translateY(-102%)' },
          ],
          { duration: D, easing: E, fill: 'forwards' }
        )
      }

      const em = p.animate(
        [{ transform: 'translate(0,-100%)' }, { transform: end }],
        { duration: D, easing: E, fill: 'forwards' }
      )

      await em.finished
      p.style.transform = end
      em.cancel()

      // Stacking onto output tray with organic variance
      const k = Math.min(sheetNumber - 1, 36)
      const fx = R(-1.2, 1.2)
      const fy = 70 - k * 0.55
      const fr = R(-0.7, 0.7)
      const fin = `translate(${fx}%,${fy}%) rotate(${fr}deg)`

      p.animate(
        [
          { transform: end },
          { transform: `translate(${fx}%,${fy * 0.55}%) rotate(${fr * 0.5}deg) scale(1.025)`, offset: 0.5 },
          { transform: fin },
        ],
        { duration: 1100, easing: 'cubic-bezier(.35,.1,.2,1)', fill: 'forwards' }
      ).finished.then(() => {
        p.style.transform = fin
        p.getAnimations().forEach(a => a.cancel())
      })
    },
    [feedSheet]
  )

  // Sequential execution of user's print queue (waits for PIN verification if releasePin exists)
  useEffect(() => {
    if (!isPinVerified || hasMountedRef.current || isPrintingRef.current || sheetsQueue.length === 0) return
    hasMountedRef.current = true
    isPrintingRef.current = true

    const stage = stageRef.current
    const printer = printerRef.current
    const plane = planeRef.current

    if (stage) stage.classList.add('printing')
    if (printer) printer.classList.add('printing')
    if (plane) plane.classList.add('printing')

    async function runQueue() {
      for (let i = 0; i < sheetsQueue.length; i++) {
        setCurrentSheetIndex(i + 1)
        await printSheet(sheetsQueue[i], i + 1)
        // Brief natural gap between sheets
        if (i < sheetsQueue.length - 1) {
          await new Promise(r => setTimeout(r, 500))
        }
      }

      // Finish printing
      isPrintingRef.current = false
      if (stage) stage.classList.remove('printing')
      if (printer) printer.classList.remove('printing')
      if (plane) plane.classList.remove('printing')

      setLcdText('DONE')
      setLcdNumber(String(sheetsQueue.length).padStart(3, '0'))
      setIsCompleted(true)
      if (orderId) markPrintCompleted(orderId)

      // Smooth transition to Thanks page after seeing final stack
      setTimeout(() => {
        setShowThanks(true)
      }, 1200)
    }

    runQueue()
  }, [isPinVerified, sheetsQueue, printSheet])

  // GSAP Entrance Animations for Thanks Page
  useEffect(() => {
    if (!showThanks) return

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

    tl.fromTo(
      thanksBadgeRef.current,
      { scale: 0, rotation: -25, opacity: 0 },
      { scale: 1, rotation: 0, opacity: 1, duration: 0.9, ease: 'back.out(2)' }
    )
      .fromTo(
        thanksTitleRef.current,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7 },
        '-=0.5'
      )
      .fromTo(
        thanksSubtitleRef.current,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7 },
        '-=0.4'
      )
      .fromTo(
        thanksDetailsRef.current,
        { y: 35, opacity: 0, scale: 0.97 },
        { y: 0, opacity: 1, scale: 1, duration: 0.8 },
        '-=0.4'
      )
      .fromTo(
        thanksActionsRef.current,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6 },
        '-=0.3'
      )

    // GSAP Confetti celebration particles
    if (confettiContainerRef.current) {
      const pieces = confettiContainerRef.current.querySelectorAll('.thanks-confetti-piece')
      gsap.fromTo(
        pieces,
        {
          y: -40,
          x: () => gsap.utils.random(-120, 120),
          rotation: () => gsap.utils.random(-180, 180),
          opacity: 0,
          scale: () => gsap.utils.random(0.6, 1.3),
        },
        {
          y: () => gsap.utils.random(100, 360),
          x: () => `+=${gsap.utils.random(-80, 80)}`,
          rotation: () => `+=${gsap.utils.random(180, 720)}`,
          opacity: 1,
          duration: () => gsap.utils.random(2.0, 3.5),
          stagger: 0.05,
          ease: 'power1.out',
        }
      )
    }

    return () => {
      tl.kill()
    }
  }, [showThanks])

  // Real hardware telemetry in background
  useEffect(() => {
    if (!orderId) return
    const timer = setInterval(async () => {
      try {
        await getPrintJobStatus(orderId)
      } catch {}
    }, 4000)
    return () => clearInterval(timer)
  }, [orderId])

  // Reset and return to print again
  const handlePrintAgain = useCallback(() => {
    clearAllFiles()
    clearUploadedDoc()
    sessionStorage.removeItem('pb_files')
    sessionStorage.removeItem('pb_print_step')
    sessionStorage.removeItem('pb_file_name')
    sessionStorage.removeItem('pb_file_size')
    sessionStorage.removeItem('pb_page_count')
    sessionStorage.removeItem('pb_settings')
    sessionStorage.removeItem('pb_total_price')
    sessionStorage.removeItem('pb_order_id')
    sessionStorage.removeItem('pb_release_pin')
    if (flow?.goToStep) {
      flow.goToStep('upload')
    }
    navigate('/print/upload')
  }, [flow, navigate])

  const handleFinish = () => {
    clearAllFiles()
    clearUploadedDoc()
    navigate('/')
  }

  // Pre-generate confetti pieces
  const confettiColors = ['#dc2626', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899']

  return (
    <div
      ref={stageRef}
      className="mono-stage printing"
      data-mode={primaryMode}
      id="mono-print-stage"
    >
      {/* 3D Perspective Desk Plane with Grid & Output Tray */}
      <div ref={planeRef} className="mono-plane printing" id="mono-plane">
        <div className="mono-desk" />
        <div className="mono-tray" />
        <div className="mono-glow" />
        <div className="mono-pshadow" />
      </div>

      {/* Center Mechanical Printer Chassis */}
      <div ref={printerRef} className="mono-printer printing" id="mono-printer">
        <div className="mono-stk b" />
        <div className="mono-stk a" />
        <div className="mono-top" />
        <div className="mono-body">
          <div className="mono-brand">PRINTBOOTH</div>
          <div className="mono-leds">
            <div className="mono-led g">
              <u />
              PWR
            </div>
            <div className="mono-led g rdy">
              <u />
              RDY
            </div>
            <div className="mono-led r">
              <u />
              BSY
            </div>
          </div>
          <div className="mono-seam" />
          <div className="mono-lcd">
            <small>{lcdText}</small>
            <b>{lcdNumber}</b>
            <i />
          </div>
          <button
            type="button"
            className="mono-btn"
            aria-label="Print Status"
          >
            <svg viewBox="0 0 24 24">
              <path d="M12 3.5v8" />
              <path d="M7 6.6a8 8 0 1 0 10 0" />
            </svg>
          </button>
          <div className="mono-vent" />
          <div className="mono-lip">
            <div className="mono-scan" />
          </div>
        </div>
      </div>

      {/* Floating Centered HUD at Bottom (during printing) */}
      {!showThanks && (
        <div className="mono-hud">
          <div className="mono-status-pill">
            <span className={`mono-status-dot${isCompleted ? ' done' : ''}`} />
            <span>
              {isCompleted
                ? `Printed ${sheetsQueue.length} ${sheetsQueue.length === 1 ? 'Page' : 'Pages'} · In Tray`
                : `Printing Page ${currentSheetIndex} of ${sheetsQueue.length} · ${(sheetsQueue[Math.max(0, currentSheetIndex - 1)]?.mode || primaryMode) === 'color' ? 'Color (10s)' : 'Mono (5s)'}`}
            </span>
          </div>

          {isCompleted && (
            <button
              type="button"
              className="mono-hud-btn"
              onClick={handlePrintAgain}
            >
              Print Again
            </button>
          )}
        </div>
      )}

      {/* ── Release PIN / OTP Kiosk Verification Screen ── */}
      {!isPinVerified && Boolean(releasePin) && (
        <CustomerPrintOtpScreen
          code={releasePin}
          kioskId={kioskId}
          kioskName={kioskName}
          orderId={orderId}
          onCodeChange={(newPin) => {
            setReleasePin(newPin)
            sessionStorage.setItem('pb_release_pin', newPin)
            if (orderId) saveRecentPrint({ orderId, otp: newPin })
          }}
          onReprint={handlePrintAgain}
        />
      )}

      {/* ── GSAP Full-Screen "Thanks for Using" Celebration Overlay ── */}
      {showThanks && (
        <div className="thanks-overlay animate-fadeIn" id="thanks-celebration-screen">
          {/* Confetti Container */}
          <div ref={confettiContainerRef} className="thanks-confetti-box">
            {Array.from({ length: 32 }).map((_, i) => (
              <span
                key={i}
                className="thanks-confetti-piece"
                style={{
                  backgroundColor: confettiColors[i % confettiColors.length],
                  width: `${6 + (i % 5) * 2}px`,
                  height: `${8 + (i % 4) * 3}px`,
                  left: `${5 + (i * 3) % 90}%`,
                  borderRadius: i % 3 === 0 ? '50%' : '3px',
                }}
              />
            ))}
          </div>

          {/* Celebration Card */}
          <div ref={thanksCardRef} className="thanks-card">
            {/* Success Badge */}
            <div ref={thanksBadgeRef} className="thanks-badge-wrap">
              <div className="thanks-badge-glow" />
              <div className="thanks-badge-circle">
                <Check size={38} weight="bold" color="#ffffff" />
              </div>
            </div>

            {/* Typography */}
            <div className="thanks-header">
              <h1 ref={thanksTitleRef} className="thanks-title">
                Thanks for Using PrintBooth!
              </h1>
              <p ref={thanksSubtitleRef} className="thanks-subtitle">
                Your {sheetsQueue.length} {sheetsQueue.length === 1 ? 'page has' : 'pages have'} been successfully printed and {sheetsQueue.length === 1 ? 'is' : 'are'} in the tray.
              </p>
            </div>

            {/* Job Summary Receipt Box */}
            <div ref={thanksDetailsRef} className="thanks-job-card">
              <div className="thanks-job-row">
                <div className="thanks-job-item">
                  <span className="thanks-job-label">
                    <Printer size={13} weight="bold" /> Machine
                  </span>
                  <span className="thanks-job-value">
                    {selectedPrinterName}
                  </span>
                </div>
                <div className="thanks-job-item">
                  <span className="thanks-job-label">
                    <MapPin size={13} weight="fill" /> Station
                  </span>
                  <span className="thanks-job-value">
                    {kioskName}
                  </span>
                </div>
              </div>

              <div className="thanks-job-divider" />

              <div className="thanks-job-row">
                <div className="thanks-job-item">
                  <span className="thanks-job-label">
                    <FileText size={13} /> Pages Printed
                  </span>
                  <span className="thanks-job-value">
                    {sheetsQueue.length} {sheetsQueue.length === 1 ? 'Sheet' : 'Sheets'} ({primaryMode === 'color' ? 'Full Colour' : 'B&W Mono'})
                  </span>
                </div>
                <div className="thanks-job-item">
                  <span className="thanks-job-label">
                    <Sparkle size={13} weight="fill" /> Status
                  </span>
                  <span className="thanks-job-badge">
                    <CheckCircle size={14} weight="fill" /> Finished
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div ref={thanksActionsRef} className="thanks-actions">
              <button
                type="button"
                className="thanks-btn primary"
                onClick={handlePrintAgain}
                id="thanks-print-again-btn"
              >
                <ArrowsClockwise size={16} weight="bold" />
                <span>Print Again</span>
                <ArrowRight size={14} weight="bold" />
              </button>

              <button
                type="button"
                className="thanks-btn secondary"
                onClick={handleFinish}
                id="thanks-finish-btn"
              >
                <span>Go Home</span>
              </button>
            </div>

            <span className="thanks-footnote">
              Zero Cloud Retention · Your temporary files have been permanently cleared for privacy.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
