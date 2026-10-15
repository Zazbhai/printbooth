import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import './SendToPrinterUpload.css'

export interface SendToPrinterUploadHandle {
  triggerAnimation: () => void
  triggerFileInput: () => void
  reset: () => void
}

interface SendToPrinterUploadProps {
  onFileSelect?: (files: FileList | File[]) => void
  onComplete?: () => void
  isProcessing?: boolean
  processingStatus?: string
  accept?: string
  multiple?: boolean
  label?: string
  completedLabel?: string
  disabled?: boolean
}

const SVGNS = 'http://www.w3.org/2000/svg'

const FOLD = {
  a: [
    '8,6 30,6 52,6 52,64 30,64 8,64',
    '8,26 30,6 52,26 52,64 30,64 8,64',
    '19,22 30,6 41,22 41,64 30,64 19,64',
    '5,50 30,4 55,50 34,64 30,54 26,64',
  ],
  b: [
    '30,6 30,6 52,6 52,64 30,64 30,64',
    '30,6 30,6 52,26 52,64 30,64 30,64',
    '30,6 30,6 41,22 41,64 30,64 30,64',
    '30,4 30,4 55,50 34,64 30,54 30,54',
  ],
}

export const SendToPrinterUpload = forwardRef<SendToPrinterUploadHandle, SendToPrinterUploadProps>(
  (
    {
      onFileSelect,
      onComplete,
      isProcessing = false,
      processingStatus = '',
      accept = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*',
      multiple = true,
      label = 'Upload',
      completedLabel = 'UPLOAD COMPLETE',
      disabled = false,
    },
    ref
  ) => {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLDivElement>(null)
    const checkboxRef = useRef<HTMLInputElement>(null)
    const pctTextRef = useRef<HTMLSpanElement>(null)
    const polyARef = useRef<SVGPolygonElement>(null)
    const polyBRef = useRef<SVGPolygonElement>(null)

    const [isAnimating, setIsAnimating] = useState(false)
    const [isWaiting, setIsWaiting] = useState(false)
    const [percent, setPercent] = useState(0)

    const onCompleteRef = useRef(onComplete)
    onCompleteRef.current = onComplete

    const timersRef = useRef<{ pctTimer?: any; pctDelay?: any; completeTimeout?: any }>({})

    // Auto-detect client device (phone vs PC)
    const resolvedDevice = React.useMemo(() => {
      if (typeof window === 'undefined') return 'pc'
      const ua = navigator.userAgent || ''
      const touchOnly =
        window.matchMedia &&
        matchMedia('(pointer: coarse)').matches &&
        !matchMedia('(hover: hover)').matches
      return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua) || touchOnly ? 'phone' : 'pc'
    }, [])

    // SMIL polygon morph helper — snappy 0.28s paper fold
    function foldPaper(poly: SVGPolygonElement | null, st: string[]) {
      if (!poly) return
      poly.setAttribute('points', st[0])
      while (poly.firstChild) poly.removeChild(poly.firstChild)
      const anim = document.createElementNS(SVGNS, 'animate')
      anim.setAttribute('attributeName', 'points')
      anim.setAttribute('dur', '0.28s')
      anim.setAttribute('begin', 'indefinite')
      anim.setAttribute('fill', 'freeze')
      anim.setAttribute('calcMode', 'spline')
      anim.setAttribute('keyTimes', '0;0.12;0.4;0.68;1')
      anim.setAttribute('keySplines', '0 0 1 1;.45 0 .2 1;.45 0 .2 1;.3 .8 .3 1')
      anim.setAttribute('values', [st[0], st[0], st[1], st[2], st[3]].join(';'))
      poly.appendChild(anim)
      try {
        ;(anim as any).beginElementAt(0.78)
      } catch (e) {}
      setTimeout(() => {
        try {
          ;(anim as any).beginElement()
        } catch (e) {}
      }, 780)
    }

    // Trigger animation sequence
    const startAnimation = useCallback(() => {
      const btn = buttonRef.current
      const container = containerRef.current
      if (!btn || !container) return

      // Measure the actual available width inside the dropzone container
      const parentWidth = container.parentElement ? container.parentElement.clientWidth : container.clientWidth
      // Clamp to available space with comfortable safe margin so it stays 100% inside the dropzone
      const availableW = Math.max(280, Math.min(540, (parentWidth || 560) - 24))

      const isMobile = window.innerWidth <= 540 || availableW < 420
      const isTablet = window.innerWidth <= 768 && !isMobile

      // Dynamically calibrated component dimensions for perfect containment
      let sw = 86  // sender width (laptop)
      let pw = 114 // printer width
      let kw = 46  // file/airplane width

      if (resolvedDevice === 'phone') {
        sw = isMobile ? 40 : 52
        pw = isMobile ? 80 : 104
        kw = isMobile ? 30 : 40
      } else if (isMobile) {
        sw = 58
        pw = 76
        kw = 30
      } else if (isTablet) {
        sw = 72
        pw = 98
        kw = 38
      }

      btn.style.setProperty('--w', `${availableW}px`)
      btn.style.setProperty('--sw', `${sw}px`)
      btn.style.setProperty('--pw', `${pw}px`)
      btn.style.setProperty('--kw', `${kw}px`)

      // Calculate exact travel distance from file starting offset to the printer intake slot
      const senderMargin = isMobile ? 10 : 16
      const printerMargin = isMobile ? 10 : 14
      const fileOffset = isMobile ? 10 : 20
      
      const fileStartX = senderMargin + sw + fileOffset
      const printerTargetX = availableW - printerMargin - pw + (pw * 0.28)
      const travel = Math.max(60, Math.round(printerTargetX - fileStartX))

      btn.style.setProperty('--travel', `${travel}px`)

      // Start folding
      foldPaper(polyARef.current, FOLD.a)
      foldPaper(polyBRef.current, FOLD.b)

      // Reset progress & trigger checked state
      setIsAnimating(true)
      if (checkboxRef.current) checkboxRef.current.checked = true
      if (pctTextRef.current) pctTextRef.current.textContent = '0%'
      setPercent(0)

      // Clear any existing timers
      clearInterval(timersRef.current.pctTimer)
      clearTimeout(timersRef.current.pctDelay)
      clearTimeout(timersRef.current.completeTimeout)

      // Live smooth count up 0% -> 100% (starting at 1.05s, finishes at ~1.55s)
      timersRef.current.pctDelay = setTimeout(() => {
        let p = 0
        timersRef.current.pctTimer = setInterval(() => {
          p += 2
          if (p > 100) p = 100
          if (pctTextRef.current) pctTextRef.current.textContent = `${p}%`
          setPercent(p)
          if (p >= 100) clearInterval(timersRef.current.pctTimer)
        }, 9)
      }, 1050)

      // Snappy completion transition at 2.0s (was 5.6s)
      timersRef.current.completeTimeout = setTimeout(() => {
        setIsAnimating(false)
        onCompleteRef.current?.()
      }, 2000)
    }, [resolvedDevice])

    // Reset animation state
    const resetAnimation = useCallback(() => {
      clearInterval(timersRef.current.pctTimer)
      clearTimeout(timersRef.current.pctDelay)
      clearTimeout(timersRef.current.completeTimeout)
      if (checkboxRef.current) checkboxRef.current.checked = false
      if (pctTextRef.current) pctTextRef.current.textContent = '0%'
      setPercent(0)
      setIsAnimating(false)
    }, [])

    const openFilePicker = useCallback(() => {
      if (disabled || isAnimating || isProcessing) return
      fileInputRef.current?.click()
    }, [disabled, isAnimating, isProcessing])

    useImperativeHandle(ref, () => ({
      triggerAnimation: () => {
        startAnimation()
      },
      triggerFileInput: () => {
        openFilePicker()
      },
      reset: resetAnimation,
    }))

    useEffect(() => {
      return () => {
        clearInterval(timersRef.current.pctTimer)
        clearTimeout(timersRef.current.pctDelay)
        clearTimeout(timersRef.current.completeTimeout)
      }
    }, [])

    // Window focus & cancel listener to reset waiting state if user cancels dialog
    useEffect(() => {
      const onFocus = () => {
        setTimeout(() => {
          setIsWaiting(w => {
            if (w && !isAnimating) return false
            return w
          })
        }, 400)
      }
      const onCancel = () => setIsWaiting(false)
      const inputEl = fileInputRef.current
      if (inputEl) {
        inputEl.addEventListener('cancel', onCancel)
      }
      window.addEventListener('focus', onFocus)
      return () => {
        if (inputEl) {
          inputEl.removeEventListener('cancel', onCancel)
        }
        window.removeEventListener('focus', onFocus)
      }
    }, [isAnimating])

    // Handle file input change
    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
      setIsWaiting(false)
      const fileList = e.target.files
      if (!fileList || fileList.length === 0) return
      const filesArray = Array.from(fileList)
      e.target.value = ''
      onFileSelect?.(filesArray)
    }

    // Split completed text into animated letters
    const letters = completedLabel.split('').map((char, index) => (
      <span key={index} className="stpu-l" style={{ ['--i' as any]: index }}>
        {char === ' ' ? '\u00A0' : char}
      </span>
    ))

    const isBtnDisabled = disabled || isAnimating || isProcessing

    return (
      <div
        ref={containerRef}
        className="stpu-container"
        data-device={resolvedDevice}
      >
        <input
          ref={checkboxRef}
          type="checkbox"
          id="stpu-checkbox-trigger"
          className="stpu-checkbox"
          readOnly
        />

        <div className="stpu-label">
          <div
            ref={buttonRef}
            className={`stpu-button${disabled ? ' disabled' : ''}`}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            aria-label={label}
            aria-valuenow={percent}
          >
            {/* Native file input directly covers the entire button with top z-index */}
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              multiple={multiple}
              onChange={handleInputChange}
              id="stpu-native-file-input"
              disabled={isBtnDisabled}
              aria-label={label || 'Select files'}
              tabIndex={0}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: isBtnDisabled ? 'default' : 'pointer',
                zIndex: 999,
                pointerEvents: isBtnDisabled ? 'none' : 'auto',
              }}
            />
            {/* Check icon upon completion */}
            <div className="stpu-check-container">
              <svg viewBox="0 0 60 60" aria-hidden="true">
                <path d="M14 31 L26 43 L47 18" fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Stage Background with Ambient Glow */}
            <div className="stpu-stage-bg">
              <i className="stpu-orb o1" />
              <i className="stpu-orb o2" />
              <i className="stpu-orb o3" />

              <i className="stpu-mote m1" />
              <i className="stpu-mote m2" />
              <i className="stpu-mote m3" />
              <i className="stpu-mote m4" />
              <i className="stpu-mote m5" />
            </div>

            {/* Laser Track */}
            <div className="stpu-track" />

            {/* Packets */}
            <div className="stpu-packets">
              <i /><i /><i /><i />
            </div>

            {/* Celebration Ring & Confetti */}
            <div className="stpu-ring" />
            <div className="stpu-confetti">
              <i style={{ ['--x' as any]: '-70px', ['--y' as any]: '-60px', ['--c' as any]: '#ef4444' }} />
              <i style={{ ['--x' as any]: '70px', ['--y' as any]: '-64px', ['--c' as any]: '#ffffff' }} />
              <i style={{ ['--x' as any]: '-85px', ['--y' as any]: '5px', ['--c' as any]: '#10b981' }} />
              <i style={{ ['--x' as any]: '88px', ['--y' as any]: '10px', ['--c' as any]: '#f59e0b' }} />
              <i style={{ ['--x' as any]: '-50px', ['--y' as any]: '70px', ['--c' as any]: '#ef4444' }} />
              <i style={{ ['--x' as any]: '52px', ['--y' as any]: '68px', ['--c' as any]: '#10b981' }} />
              <i style={{ ['--x' as any]: '0px', ['--y' as any]: '-85px', ['--c' as any]: '#ffffff' }} />
              <i style={{ ['--x' as any]: '0px', ['--y' as any]: '82px', ['--c' as any]: '#f59e0b' }} />
            </div>

            {/* Sender: MacBook PC OR Modern Smartphone */}
            <div className="stpu-sender-container">
              {/* PC MacBook SVG */}
              <svg className="stpu-pc-svg" viewBox="0 0 120 90" aria-hidden="true">
                <g className="stpu-lid">
                  <rect x="14" y="4" width="92" height="58" rx="6" fill="#1e293b" stroke="#0f172a" strokeWidth="3" />
                  <rect x="20" y="10" width="80" height="46" rx="3" fill="#ffffff" />
                  <rect x="20" y="10" width="80" height="8" fill="#f8fafc" />
                  <circle cx="26" cy="14" r="1.8" fill="#ef4444" />
                  <circle cx="32" cy="14" r="1.8" fill="#f59e0b" />
                  <circle cx="38" cy="14" r="1.8" fill="#10b981" />
                  <g className="stpu-screen-card">
                    <rect x="30" y="23" width="24" height="27" rx="3" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
                    <rect x="34" y="29" width="16" height="2.5" rx="1" fill="#dc2626" />
                    <rect x="34" y="34" width="12" height="2" rx="1" fill="#94a3b8" />
                    <rect x="34" y="38" width="16" height="2" rx="1" fill="#94a3b8" />
                    <rect x="34" y="42" width="10" height="2" rx="1" fill="#cbd5e1" />
                  </g>
                  <g className="stpu-send-btn">
                    <rect x="62" y="30" width="32" height="12" rx="6" fill="#dc2626" />
                    <text x="78" y="39" textAnchor="middle" fill="#ffffff" fontFamily="var(--font-sans)" fontSize="8" fontWeight="800">
                      PRINT
                    </text>
                  </g>
                  <circle className="stpu-tap-ripple" cx="78" cy="36" r="5" />
                  <rect x="62" y="47" width="32" height="3.5" rx="1.75" fill="#e2e8f0" />
                  <rect className="stpu-sprog" x="62" y="47" width="32" height="3.5" rx="1.75" fill="#dc2626" />
                  <path className="stpu-pointer" d="M78 36 v11 l3 -3 l3 6 l2.5 -1 l-3 -6 h4.5z" fill="#ffffff" stroke="#0f172a" strokeWidth="1.2" strokeLinejoin="round" />
                </g>
                <path d="M4 66 H116 L110 82 Q109 84 106 84 H14 Q11 84 10 82Z" fill="#94a3b8" stroke="#475569" strokeWidth="2" strokeLinejoin="round" />
                <g className="stpu-keys">
                  <rect x="16" y="69" width="10" height="3" rx="1" /><rect x="30" y="69" width="10" height="3" rx="1" /><rect x="44" y="69" width="10" height="3" rx="1" />
                  <rect x="58" y="69" width="10" height="3" rx="1" /><rect x="72" y="69" width="10" height="3" rx="1" /><rect x="86" y="69" width="10" height="3" rx="1" />
                  <rect x="22" y="74" width="10" height="3" rx="1" /><rect x="36" y="74" width="10" height="3" rx="1" /><rect x="74" y="74" width="10" height="3" rx="1" /><rect x="88" y="74" width="10" height="3" rx="1" />
                </g>
                <rect x="49" y="76" width="22" height="4" rx="2" fill="#64748b" />
              </svg>

              {/* Phone SVG */}
              <svg className="stpu-phone-svg" viewBox="0 0 60 110" aria-hidden="true">
                <g className="stpu-phone-body">
                  <rect x="3" y="3" width="54" height="104" rx="11" fill="#0f172a" stroke="#334155" strokeWidth="2.5" />
                  <rect x="8" y="12" width="44" height="86" rx="6" fill="#ffffff" />
                  <rect x="22" y="6" width="16" height="3.5" rx="1.75" fill="#334155" />
                  <rect x="8" y="12" width="44" height="9" fill="#f8fafc" />
                  <rect x="14" y="15" width="16" height="3" rx="1.5" fill="#dc2626" />
                  <g className="stpu-screen-card">
                    <rect x="15" y="29" width="30" height="32" rx="3" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1.5" />
                    <rect x="20" y="36" width="20" height="2.5" rx="1" fill="#dc2626" />
                    <rect x="20" y="42" width="14" height="2" rx="1" fill="#94a3b8" />
                    <rect x="20" y="48" width="18" height="2" rx="1" fill="#cbd5e1" />
                  </g>
                  <g className="stpu-send-btn">
                    <rect x="14" y="68" width="32" height="12" rx="6" fill="#dc2626" />
                    <text x="30" y="77" textAnchor="middle" fill="#ffffff" fontFamily="var(--font-sans)" fontSize="8" fontWeight="800">
                      PRINT
                    </text>
                  </g>
                  <circle className="stpu-tap-ripple" cx="30" cy="74" r="5" />
                  <rect x="14" y="85" width="32" height="3.5" rx="1.75" fill="#e2e8f0" />
                  <rect className="stpu-sprog" x="14" y="85" width="32" height="3.5" rx="1.75" fill="#dc2626" />
                  <circle className="stpu-pointer" cx="30" cy="74" r="5" fill="#fca5a5" stroke="#dc2626" strokeWidth="1.5" />
                </g>
              </svg>
            </div>

            {/* Radio Waves */}
            <div className="stpu-waves">
              <svg viewBox="0 0 22 40" aria-hidden="true">
                <path d="M4 12 Q10 20 4 28" /><path d="M9 8 Q19 20 9 32" /><path d="M14 4 Q28 20 14 36" />
              </svg>
            </div>

            {/* Flying File (Origami Paper Airplane) */}
            <div className="stpu-file-container">
              <div className="stpu-plane-arc">
                <div className="stpu-plane-wrap">
                  <svg className="stpu-plane-svg" viewBox="0 0 60 70" aria-hidden="true">
                    <polygon
                      ref={polyARef}
                      className="stpu-pl-a"
                      points="8,6 30,6 52,6 52,64 30,64 8,64"
                      fill="#ffffff"
                      stroke="#0f172a"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                    />
                    <polygon
                      ref={polyBRef}
                      className="stpu-pl-b"
                      points="30,6 30,6 52,6 52,64 30,64 30,64"
                      fill="#f1f5f9"
                    />
                    <path className="stpu-crease" d="M30 5 V54" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" opacity="0" />
                    <g className="stpu-paper-lines">
                      <rect className="stpu-ln" style={{ ['--d' as any]: '0s' }} x="14" y="16" width="32" height="3.5" rx="1.5" />
                      <rect className="stpu-ln" style={{ ['--d' as any]: '.06s' }} x="14" y="25" width="24" height="3.5" rx="1.5" />
                      <rect className="stpu-ln" style={{ ['--d' as any]: '.12s' }} x="14" y="34" width="32" height="3.5" rx="1.5" />
                      <rect className="stpu-ln" style={{ ['--d' as any]: '.18s' }} x="14" y="43" width="18" height="3.5" rx="1.5" />
                    </g>
                  </svg>
                </div>
                <div className="stpu-pct">
                  <span ref={pctTextRef} id="stpu-percentage-text">
                    0%
                  </span>
                </div>
              </div>
            </div>

            {/* Printer */}
            <div className="stpu-printer-container">
              <svg viewBox="0 0 130 125" aria-hidden="true">
                <rect x="30" y="2" width="70" height="28" rx="3" fill="#fff" stroke="#000" strokeWidth="5" />
                <rect x="40" y="10" width="50" height="3" fill="#bbb" />
                <rect x="40" y="18" width="50" height="3" fill="#bbb" />
                <g className="stpu-out-paper">
                  <rect x="32" y="72" width="66" height="50" fill="#fff" stroke="#000" strokeWidth="4" />
                  <rect x="40" y="90" width="50" height="4" fill="#666" />
                  <rect x="40" y="99" width="38" height="4" fill="#999" />
                  <rect x="40" y="108" width="44" height="4" fill="#999" />
                </g>
                <rect x="4" y="26" width="122" height="48" rx="9" fill="#4a4f5c" stroke="#000" strokeWidth="5" />
                <rect x="14" y="34" width="46" height="16" rx="3" fill="#0f2a1f" stroke="#000" strokeWidth="2" />
                <rect className="stpu-pbar" x="17" y="40" width="40" height="5" rx="2" fill="#3ddc84" />
                <circle cx="74" cy="42" r="4" fill="#ffe27a" stroke="#000" strokeWidth="2" />
                <circle cx="88" cy="42" r="4" fill="#fff" stroke="#000" strokeWidth="2" />
                <circle className="stpu-led" cx="108" cy="42" r="5" fill="#3ddc84" stroke="#000" strokeWidth="3" />
                <rect x="14" y="58" width="102" height="4" rx="2" fill="#333" />
                <rect x="20" y="68" width="90" height="12" rx="3" fill="#2b2f38" stroke="#000" strokeWidth="4" />
              </svg>
            </div>

            {/* Default Button Label / Simple Loading Animation */}
            <div className="stpu-text">
              {isWaiting || isProcessing ? (
                <div className="stpu-waiting-content" aria-label="Loading">
                  <svg className="stpu-waiting-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="2.5" />
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="2.5"
                      strokeDasharray="56.5"
                      strokeDashoffset="42"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              ) : (
                <span>{label || 'Upload'}</span>
              )}
            </div>
          </div>
        </div>

        {/* Pop-in letters for UPLOAD COMPLETE */}
        <div className="stpu-complete-text">{letters}</div>

        {/* Live Processing Status */}
        {isProcessing && processingStatus && (
          <div className="stpu-processing-status">
            <span>{processingStatus}</span>
          </div>
        )}
      </div>
    )
  }
)

SendToPrinterUpload.displayName = 'SendToPrinterUpload'
export default SendToPrinterUpload
