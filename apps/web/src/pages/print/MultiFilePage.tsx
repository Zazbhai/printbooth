import { useState, useRef, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePrintNavigate as useNavigate, usePrintFlow } from './PrintFlowContext'
import {
  WarningCircle,
  ArrowRight,
  Files,
  Trash,
  FilePdf,
  FileImage,
  FileDoc,
  FilePpt,
  File as FileIcon,
} from '@phosphor-icons/react'
import {
  addFile,
  getAllFiles,
  setActiveFile,
  getActiveFileId,
  updateFile,
  removeFile,
  clearAllFiles,
  getFileType,
  getMaxFileSizeMB,
  isSupportedFileType,
  persistAllFilesToSession,
  persistActiveFileToSession,
  type ManagedFile,
} from '../../lib/multiFileStore'
import { clearUploadedDoc, setUploadedDoc, getUploadedFileAsync } from '../../lib/documentStore'
import { kioskSession } from '../../lib/kioskSession'
import { ClearDocumentModal } from '../../components/ui/ClearDocumentModal'
import { renderFilePages } from '../../lib/multiFileRenderer'
import { generateDocumentPages } from '../../lib/documentPreview'
import { checkPrinterHardwareStatus } from '../../lib/api'
import {
  SendToPrinterUpload,
  type SendToPrinterUploadHandle,
} from '../../components/ui/SendToPrinterUpload'
import PrinterErrorOverlay from '../../components/ui/PrinterErrorOverlay'
import './MultiFilePage.css'

const MAX_FILES = 10

function FileTypeBadge({ type }: { type: string }) {
  if (type === 'pdf') return <span className="mfp-file-type-badge pdf">PDF</span>
  if (type === 'image') return <span className="mfp-file-type-badge image">IMG</span>
  if (type === 'docx') return <span className="mfp-file-type-badge docx">DOCX</span>
  if (type === 'ppt') return <span className="mfp-file-type-badge ppt">PPT</span>
  return <span className="mfp-file-type-badge pdf">FILE</span>
}

function FileTypeThumbIcon({ type, size = 22 }: { type: string; size?: number }) {
  if (type === 'pdf') return <FilePdf size={size} weight="fill" color="#dc2626" />
  if (type === 'image') return <FileImage size={size} weight="fill" color="#059669" />
  if (type === 'docx') return <FileDoc size={size} weight="fill" color="#2563eb" />
  if (type === 'ppt') return <FilePpt size={size} weight="fill" color="#ea580c" />
  return <FileIcon size={size} weight="fill" color="#94a3b8" />
}

export default function MultiFilePage() {
  const navigate = useNavigate()
  const flow = usePrintFlow()
  const [searchParams, setSearchParams] = useSearchParams()
  const uploadAnimRef = useRef<SendToPrinterUploadHandle>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isUploadAnimating, setIsUploadAnimating] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [showClearAllModal, setShowClearAllModal] = useState(false)

  // Kiosk Remote Upload state: when user opened via kiosk QR
  const isKioskMode = kioskSession.isKioskSession()
  const [isTransferredToKiosk, setIsTransferredToKiosk] = useState(false)
  const [kioskLiveStatus, setKioskLiveStatus] = useState<any>(null)

  useEffect(() => {
    if (!isTransferredToKiosk) return
    let active = true
    const poll = async () => {
      const status = await kioskSession.getStatus()
      if (active && status.success) {
        setKioskLiveStatus(status)
      }
    }
    poll()
    const timer = setInterval(poll, 1500)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [isTransferredToKiosk])

  // Synchronization refs for guaranteed full animation playback
  const processingCompleteRef = useRef(false)
  const animationCompleteRef = useRef(false)
  const safetyTimeoutRef = useRef<any>(null)

  // Printer availability state
  const [printerIssue, setPrinterIssue] = useState<{
    hasIssue: boolean
    reason: string
    detail: string
    kioskName?: string
    printerName?: string
  } | null>(null)
  const [connectedPrinterName, setConnectedPrinterName] = useState<string | null>(null)
  const [isCheckingPrinter, setIsCheckingPrinter] = useState(false)
  const [userDismissedNotice, setUserDismissedNotice] = useState(false)
  const userDismissedRef = useRef(false)
  userDismissedRef.current = userDismissedNotice

  // Check hardware & paper status before allowing upload
  const checkPrinterStatus = useCallback(async (allowAutoPopup = true) => {
    setIsCheckingPrinter(true)

    // 1. Direct query parameter overrides (for testing, simulation & IoT kiosk dispatch)
    const qPaper = searchParams.get('paper')
    const qIssue = searchParams.get('issue')
    const qStatus = searchParams.get('status')
    const qPrinter = searchParams.get('printer')

    if (qPaper === '0') {
      if (allowAutoPopup || !userDismissedRef.current) {
        setPrinterIssue({
          hasIssue: true,
          reason: 'Paper tray is empty (0 pages left)',
          detail: 'The selected printer has run out of paper. Please visit later once restocked, or select another active kiosk station.',
          kioskName: 'PrintBooth Station',
        })
      }
      setIsCheckingPrinter(false)
      return
    }

    if (qIssue || (qStatus && qStatus.toLowerCase() !== 'online' && qStatus.toLowerCase() !== 'ready')) {
      const issueLabel = (qIssue || qStatus || 'Hardware Issue').toUpperCase()
      if (allowAutoPopup || !userDismissedRef.current) {
        setPrinterIssue({
          hasIssue: true,
          reason: `Hardware Alert: ${issueLabel}`,
          detail: 'The printer is reporting an active hardware condition. Document intake is temporarily suspended for your safety.',
          kioskName: 'PrintBooth Station',
        })
      }
      setIsCheckingPrinter(false)
      return
    }

    // 2. Query hardware status & kiosk telemetry via backend API & Python GDI engine
    try {
      const assignedId = searchParams.get('id') || searchParams.get('printer_id') || sessionStorage.getItem('pb_kiosk_id') || 'PB-001'
      const preferredPrinter = qPrinter || sessionStorage.getItem('pb_printer_name') || undefined
      const check = await checkPrinterHardwareStatus(assignedId, preferredPrinter)

      if (!check.isAvailable) {
        if (allowAutoPopup || !userDismissedRef.current) {
          setPrinterIssue({
            hasIssue: true,
            reason: check.reason || 'Printer not available right now, visit later',
            detail: check.detail || 'Hardware printer is offline, disconnected or reporting an issue. Please visit later.',
            kioskName: check.kioskName || 'PrintBooth Station',
            printerName: check.printerName,
          })
        }
        setConnectedPrinterName(check.printerName || null)
        setIsCheckingPrinter(false)
        return
      }

      setConnectedPrinterName(check.printerName || 'Laser Print Engine')
      setPrinterIssue(null)
      setUserDismissedNotice(false)
    } catch (err) {
      console.warn('[MultiFilePage] Error checking printer availability:', err)
      if (allowAutoPopup || !userDismissedRef.current) {
        setPrinterIssue({
          hasIssue: true,
          reason: 'Hardware connection check failed',
          detail: 'Cannot establish connection to local hardware printer daemon. Please ensure printer is connected and backend daemon is running.',
          kioskName: 'PrintBooth Station',
        })
      }
    } finally {
      setIsCheckingPrinter(false)
    }
  }, [
    searchParams.get('paper'),
    searchParams.get('issue'),
    searchParams.get('status'),
    searchParams.get('printer'),
  ])

  useEffect(() => {
    checkPrinterStatus(true)
    const timer = setInterval(() => {
      checkPrinterStatus(false)
    }, 8000)
    return () => clearInterval(timer)
  }, [checkPrinterStatus])

  // Multi-file state
  const [files, setFiles] = useState<ManagedFile[]>(() => getAllFiles())

  useEffect(() => {
    const sync = () => {
      setFiles([...getAllFiles()])
    }
    window.addEventListener('printbooth:multifile-change', sync)
    return () => window.removeEventListener('printbooth:multifile-change', sync)
  }, [])

  const readyCount = files.filter(f => f.status === 'ready').length

  async function processFile(file: File) {
    if (printerIssue?.hasIssue && !userDismissedRef.current) {
      setDropError(`Cannot upload: ${printerIssue.reason}. Please connect the printer before uploading.`)
      return false
    }

    const fileType = getFileType(file)
    const maxMB = getMaxFileSizeMB(fileType)

    if (!isSupportedFileType(fileType)) {
      setDropError(`"${file.name}" is not a supported format. Use PDF, PNG, JPG, DOCX or PPT.`)
      return false
    }
    if (file.size > maxMB * 1024 * 1024) {
      setDropError(`"${file.name}" exceeds the ${maxMB} MB limit for ${fileType.toUpperCase()} files.`)
      return false
    }
    if (getAllFiles().length >= MAX_FILES) {
      setDropError(`You can upload a maximum of ${MAX_FILES} files at once.`)
      return false
    }

    setDropError(null)
    const entry = addFile(file)
    if (!entry) {
      setDropError(`"${file.name}" is already in your list or could not be added.`)
      return false
    }

    updateFile(entry.id, { status: 'processing' })
    setProcessingStatus(`Rendering pages for ${file.name}…`)

    try {
      const pages = await renderFilePages(file, fileType, () => {})
      const safePages = pages && pages.length > 0 ? pages : generateDocumentPages(file.name, 1)
      updateFile(entry.id, {
        status: 'ready',
        pageCount: safePages.length || 1,
        realPages: safePages,
        thumbnail: safePages[0]?.url,
      })

      setUploadedDoc({
        file,
        fileName: file.name,
        fileSize: file.size,
        pageCount: safePages.length || 1,
        realPages: safePages,
      })

      if (!getActiveFileId() || getAllFiles().filter(f => f.status === 'ready').length === 1) {
        setActiveFile(entry.id)
      }
      return true
    } catch (e) {
      console.warn('File render fallback activated:', e)
      const fallbackPages = generateDocumentPages(file.name, 1)
      updateFile(entry.id, {
        status: 'ready',
        pageCount: 1,
        realPages: fallbackPages,
        thumbnail: fallbackPages[0]?.url,
      })
      setUploadedDoc({
        file,
        fileName: file.name,
        fileSize: file.size,
        pageCount: 1,
        realPages: fallbackPages,
      })
      if (!getActiveFileId() || getAllFiles().filter(f => f.status === 'ready').length === 1) {
        setActiveFile(entry.id)
      }
      return true
    }
  }

  const handleUploadToKiosk = useCallback(async () => {
    const ready = getAllFiles().filter(f => f.status === 'ready')
    if (ready.length === 0) return

    const primary = ready[0]
    const file = primary.file || (await getUploadedFileAsync())

    const previews = primary.realPages?.map((p, idx) => ({
      pageNumber: p.pageNumber || idx + 1,
      url: p.url,
      title: p.title || `Page ${idx + 1}`,
    })) || []

    // Fire non-blocking background upload to kiosk display
    kioskSession.uploadDocument({
      file,
      fileName: primary.fileName,
      fileSize: primary.fileSize,
      fileType: primary.fileType,
      pageCount: primary.pageCount || 1,
      previews,
    }).then(result => {
      if ((result as any)?.machineInUse) {
        window.dispatchEvent(new CustomEvent('kiosk:machine_in_use', {
          detail: { kioskId: kioskSession.getKioskId() || 'PB-001' }
        }))
      }
    }).catch(err => {
      console.warn('[MultiFilePage] Background kiosk transfer error:', err)
    })
  }, [])

  const transitionToConfirm = useCallback(() => {
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current)
      safetyTimeoutRef.current = null
    }
    setIsUploadAnimating(false)
    setIsProcessing(false)
    persistAllFilesToSession()
    persistActiveFileToSession()

    const ready = getAllFiles().filter(f => f.status === 'ready')
    if (ready.length > 0) {
      const first = ready[0]
      sessionStorage.setItem('pb_file_name', first.fileName)
      sessionStorage.setItem('pb_file_size', String(first.fileSize))
      sessionStorage.setItem('pb_page_count', String(first.pageCount))
      sessionStorage.setItem('pb_settings', JSON.stringify(first.settings))
    }
    sessionStorage.setItem('pb_confirm_mode', 'doc')
    sessionStorage.setItem('pb_print_step', 'confirm')

    // In Kiosk QR Mode: initiate fast transfer to kiosk in background
    if (isKioskMode) {
      handleUploadToKiosk()
    }

    if (flow?.goToStep) {
      flow.goToStep('confirm')
    } else {
      navigate('/print/confirm')
    }
  }, [flow, navigate, isKioskMode, handleUploadToKiosk])

  // Cleanup safety timeout on unmount
  useEffect(() => {
    return () => {
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current)
      }
    }
  }, [])

  async function handleFiles(fileList: FileList | File[]) {
    if (printerIssue?.hasIssue && !userDismissedRef.current) {
      setDropError(`Cannot upload: ${printerIssue.reason}. Uploading is disabled.`)
      return
    }

    const arr = Array.from(fileList)
    if (arr.length === 0) return

    // Quick pre-validation
    const invalidType = arr.find(f => !isSupportedFileType(getFileType(f)))
    if (invalidType) {
      setDropError(`"${invalidType.name}" is not a supported format. Use PDF, PNG, JPG, DOCX or PPT.`)
      uploadAnimRef.current?.reset()
      return
    }

    const oversized = arr.find(f => f.size > getMaxFileSizeMB(getFileType(f)) * 1024 * 1024)
    if (oversized) {
      const t = getFileType(oversized)
      setDropError(`"${oversized.name}" exceeds the ${getMaxFileSizeMB(t)} MB limit for ${t.toUpperCase()} files.`)
      uploadAnimRef.current?.reset()
      return
    }

    const currentFiles = getAllFiles()
    if (currentFiles.length + arr.length > MAX_FILES) {
      setDropError(`You can upload a maximum of ${MAX_FILES} files. You already have ${currentFiles.length} file${currentFiles.length === 1 ? '' : 's'} in queue.`)
      uploadAnimRef.current?.reset()
      return
    }

    setDropError(null)
    setIsUploadAnimating(true)
    setIsProcessing(true)
    processingCompleteRef.current = false
    animationCompleteRef.current = false

    // Safety fallback: if for any reason onComplete doesn't fire after 9s, proceed to settings
    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current)
    safetyTimeoutRef.current = setTimeout(() => {
      if (processingCompleteRef.current) {
        transitionToConfirm()
      }
    }, 9000)

    uploadAnimRef.current?.triggerAnimation()
    setProcessingStatus(`Uploading ${arr.length} ${arr.length === 1 ? 'file' : 'files'}…`)

    let anySuccess = false
    for (let i = 0; i < arr.length; i++) {
      setProcessingStatus(`Processing (${i + 1}/${arr.length}): ${arr[i].name}…`)
      const ok = await processFile(arr[i])
      if (ok) anySuccess = true
    }

    const currentAll = getAllFiles()
    setFiles([...currentAll])

    const isAddMode = searchParams.get('add') === 'true'
    if (isAddMode) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.delete('add')
        return next
      }, { replace: true })
    }

    setIsProcessing(false)
    setProcessingStatus('')

    if (!anySuccess) {
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current)
      setIsUploadAnimating(false)
      uploadAnimRef.current?.reset()
      return
    }

    // Mark processing as done and cache ready files to session
    processingCompleteRef.current = true
    persistAllFilesToSession()
    persistActiveFileToSession()

    // INSTANT TRANSITION: Move to confirm page immediately with zero delay
    transitionToConfirm()
  }

  function handleRemoveFile(id: string) {
    removeFile(id)
    const remaining = getAllFiles()
    setFiles([...remaining])
    if (remaining.length === 0) {
      clearUploadedDoc()
      uploadAnimRef.current?.reset()
    }
  }

  function handleClearAll() {
    clearAllFiles()
    clearUploadedDoc()
    setFiles([])
    setShowClearAllModal(false)
    uploadAnimRef.current?.reset()
  }

  const handleCancelAndNewUpload = useCallback(async () => {
    clearAllFiles()
    clearUploadedDoc()
    setFiles([])
    setIsTransferredToKiosk(false)
    uploadAnimRef.current?.reset()
    try {
      await kioskSession.cancel()
    } catch {}
  }, [])

  const handleUploadComplete = useCallback(() => {
    animationCompleteRef.current = true
    if (processingCompleteRef.current) {
      transitionToConfirm()
    }
  }, [transitionToConfirm])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (isProcessing || isUploadAnimating) return
    if (printerIssue?.hasIssue) {
      setDropError(`Cannot upload: ${printerIssue.reason}. Please resolve printer errors first.`)
      return
    }
    await handleFiles(e.dataTransfer.files)
  }, [isProcessing, isUploadAnimating, printerIssue, handleFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!isProcessing && !isUploadAnimating && !printerIssue?.hasIssue) setDragOver(true)
  }, [isProcessing, isUploadAnimating, printerIssue])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  if (isTransferredToKiosk) {
    const ready = getAllFiles().filter(f => f.status === 'ready')
    const primary = ready[0]
    const assignedKiosk = searchParams.get('id') || kioskSession.getKioskId() || 'PB-001'

    const stateDesc = (() => {
      switch (kioskLiveStatus?.state) {
        case 'CONFIRMING':
          return '👀 Kiosk Touchscreen: Reviewing pages on screen...'
        case 'CONFIGURING':
          return '⚙️ Kiosk Touchscreen: Selecting print options (Colour, Copies, Duplex)...'
        case 'PAYING':
          return '💳 Kiosk Touchscreen: UPI Payment in progress...'
        case 'PRINTING':
          return '🖨️ Kiosk: Printing your document on Brother hardware...'
        case 'DONE':
          return '🎉 Print complete! Please collect your document from the tray below.'
        default:
          return '🖥️ Connected to Kiosk Touchscreen — Awaiting user interaction'
      }
    })()

    return (
      <div className="mfp-root">
        <div className="mfp-transferred-card">
          <div className="mfp-transferred-icon-wrap">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>

          <h2 className="mfp-transferred-title">Document Sent to Kiosk!</h2>
          <p className="mfp-transferred-sub">
            Your document has been sent directly to the <strong>Station {assignedKiosk}</strong> touchscreen.
            Please look at the kiosk display to review pages, customize print settings, and pay.
          </p>

          {primary && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#f8fafc', padding: '10px 18px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600 }}>
              <FileTypeThumbIcon type={primary.fileType} size={18} />
              <span style={{ color: '#09090b' }}>{primary.fileName}</span>
              <span style={{ color: '#64748b' }}>• {primary.pageCount} Pages</span>
            </div>
          )}

          <div className="mfp-kiosk-live-pill">
            <div className="mfp-kiosk-live-label">
              <span className="mfp-kiosk-banner-dot" />
              <span>Live Kiosk Display Status</span>
            </div>
            <div className="mfp-kiosk-live-phase">
              {stateDesc}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px', width: '100%', maxWidth: '380px' }}>
            <button
              type="button"
              className="mfp-upload-another-btn"
              style={{ flex: 1 }}
              onClick={handleCancelAndNewUpload}
              id="mfp-upload-another-btn"
            >
              Upload New Document
            </button>
            <button
              type="button"
              onClick={handleCancelAndNewUpload}
              id="mfp-cancel-transfer-btn"
              style={{
                padding: '12px 18px',
                borderRadius: '12px',
                border: '1px solid #fee2e2',
                background: '#fff1f2',
                color: '#dc2626',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mfp-root">
      {/* Full-Screen Printer Unavailable / Error Overlay (Yellow Gradient Animation) */}
      <PrinterErrorOverlay
        isOpen={Boolean(printerIssue?.hasIssue)}
        title={
          printerIssue?.reason?.toUpperCase().includes('PAPER')
            ? 'OUT OF PAPER'
            : (printerIssue?.reason?.toUpperCase().includes('DISCONNECTED') || printerIssue?.reason?.toUpperCase().includes('OFFLINE')
                ? 'PRINTER OFFLINE'
                : 'PRINTER ERROR')
        }
        reason={printerIssue?.reason || 'The printer is not connected or reporting an active hardware issue.'}
        detail={printerIssue?.detail || 'Printing is temporarily paused until the printer is powered on and connected.'}
        kioskName={printerIssue?.kioskName}
        printerName={printerIssue?.printerName || connectedPrinterName || undefined}
        isChecking={isCheckingPrinter}
        onRetry={() => {
          setUserDismissedNotice(false)
          checkPrinterStatus(true)
        }}
        onDismiss={() => {
          setPrinterIssue(null)
          setUserDismissedNotice(true)
        }}
      />

      {/* Kiosk Mode Banner when customer is uploading remotely via QR */}
      {isKioskMode && (
        <div className="mfp-kiosk-mode-banner">
          <div className="mfp-kiosk-banner-left">
            <span className="mfp-kiosk-banner-dot" />
            <div>
              <div className="mfp-kiosk-banner-title">Connected to Station {searchParams.get('id') || kioskSession.getKioskId() || 'PB-001'}</div>
              <div className="mfp-kiosk-banner-sub">Upload file here. Preview, settings & payment will show on Kiosk touchscreen.</div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mfp-header">
        <h1 className="mfp-title">Upload Documents</h1>
        <p className="mfp-subtitle">
          Upload single or multiple files to print. Instant client-side page rendering.
        </p>

        {flow?.printerId && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '12px',
              padding: '6px 14px',
              background: 'rgba(255, 255, 255, 0.75)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(226, 232, 240, 0.9)',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-main, #334155)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            }}
          >
            <span>Station: <strong>{flow.kioskName || flow.printerId}</strong> ({flow.printerId})</span>
            <button
              type="button"
              onClick={() => flow.goToStep('kiosk')}
              style={{
                background: 'none',
                border: 'none',
                color: '#4f46e5',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                padding: '0 0 0 4px',
                textDecoration: 'underline',
              }}
            >
              Change
            </button>
          </div>
        )}
      </div>





      {/* ── Uploaded Documents List with Individual Delete & Clear All ── */}
      {files.length > 0 && !isProcessing && !isUploadAnimating && (
        <div className="mfp-file-list" style={{ width: '100%', maxWidth: '580px' }}>
          <div className="mfp-file-list-header">
            <span className="mfp-file-list-title">
              Uploaded Documents ({files.length} / {MAX_FILES})
            </span>
            <button
              type="button"
              className="mfp-clear-all-btn"
              onClick={() => setShowClearAllModal(true)}
              id="mfp-clear-all-btn"
              title="Remove all uploaded documents from queue"
            >
              <Trash size={13} weight="bold" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Clear All
            </button>
          </div>

          {files.map((f) => (
            <div key={f.id} className={`mfp-file-card ${f.status === 'ready' ? '' : 'processing'}`}>
              <div className="mfp-file-thumb">
                {f.thumbnail ? (
                  <img src={f.thumbnail} alt={f.fileName} />
                ) : (
                  <FileTypeThumbIcon type={f.fileType} />
                )}
              </div>

              <div className="mfp-file-info">
                <span className="mfp-file-name" title={f.fileName}>{f.fileName}</span>
                <div className="mfp-file-meta">
                  <FileTypeBadge type={f.fileType} />
                  <span>·</span>
                  <span>{f.pageCount} {f.pageCount === 1 ? 'page' : 'pages'}</span>
                  <span>·</span>
                  <span>{(f.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
                  {f.status !== 'ready' && (
                    <span className="mfp-file-status processing">Processing…</span>
                  )}
                </div>
              </div>

              <div className="mfp-file-actions">
                <button
                  type="button"
                  className="mfp-file-remove-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveFile(f.id)
                  }}
                  title={`Delete ${f.fileName}`}
                  aria-label={`Delete ${f.fileName}`}
                >
                  <Trash size={14} weight="bold" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Double-Bezel Drop Zone (Available while under file limit) */}
      {files.length < MAX_FILES ? (
        <div className="mfp-dropzone-shell">
          <div
            className={`mfp-dropzone${dragOver ? ' drag-over' : ''}${isProcessing || isUploadAnimating ? ' processing' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {/* Animated Hardware Send-To-Printer Upload Component */}
            <SendToPrinterUpload
              ref={uploadAnimRef}
              onFileSelect={handleFiles}
              onComplete={handleUploadComplete}
              isProcessing={isProcessing || isUploadAnimating}
              processingStatus={processingStatus}
              label={files.length > 0 ? 'Add Documents' : 'Upload Documents'}
              completedLabel="UPLOAD COMPLETE"
              disabled={Boolean(printerIssue?.hasIssue)}
            />

            <div className="mfp-dropzone-text-group">
              <span className="mfp-dropzone-secondary">
                {files.length > 0
                  ? 'Or drag & drop additional files into this zone'
                  : 'Or drag & drop files anywhere into this zone'}
              </span>
            </div>

            {/* Formats Pill Strip */}
            <div className="mfp-formats">
              <span className="mfp-format-tag pdf">PDF</span>
              <span className="mfp-format-tag img">PNG / JPG</span>
              <span className="mfp-format-tag doc">DOCX</span>
              <span className="mfp-format-tag ppt">PPT</span>
              <span className="mfp-format-tag cap">Max {MAX_FILES} files · 50MB</span>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            maxWidth: '580px',
            padding: '16px 20px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.7)',
            border: '1px dashed rgba(203, 213, 225, 0.9)',
            textAlign: 'center',
            fontSize: '13px',
            color: '#64748b',
          }}
        >
          Maximum limit reached (<strong>{MAX_FILES} files</strong>). Remove a file above if you want to upload a different document.
        </div>
      )}

      {/* Error Notice */}
      {dropError && (
        <div className="mfp-error">
          <WarningCircle size={16} weight="fill" />
          <span>{dropError}</span>
        </div>
      )}

      {/* Quick Specs Footnote */}
      <div className="mfp-upload-hints">
        <div className="mfp-hint-item">
          <Files size={15} weight="bold" />
          <span>Multi-page &amp; multi-file support</span>
        </div>
        <div className="mfp-hint-divider" />
        <div className="mfp-hint-item">
          <span>Max 50MB per file</span>
        </div>
        <div className="mfp-hint-divider" />
        <div className="mfp-hint-item">
          <span>Zero cloud retention · 100% private</span>
        </div>
      </div>

      {/* Sticky Bottom Action Bar when files are uploaded & ready */}
      {readyCount > 0 && !isProcessing && !isUploadAnimating && !printerIssue?.hasIssue && (
        <div className="mfp-action-bar">
          <div className="mfp-action-info">
            <span className="mfp-action-count">
              <span>{readyCount} {readyCount === 1 ? 'File' : 'Files'} · {files.reduce((s, f) => s + f.pageCount, 0)} Total Pages</span>
            </span>
          </div>

          <button
            type="button"
            onClick={transitionToConfirm}
            className="mfp-view-confirm-link"
            style={{ border: 'none', cursor: 'pointer' }}
            id="mfp-continue-btn"
          >
            <span>Continue</span>
            <span className="mfp-btn-icon-circle">
              <ArrowRight size={13} weight="bold" />
            </span>
          </button>
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      <ClearDocumentModal
        isOpen={showClearAllModal}
        onClose={() => setShowClearAllModal(false)}
        onConfirm={handleClearAll}
        title="Clear All Uploaded Files?"
        description="Are you sure you want to remove all files? This will clear your current print queue so you can start fresh."
        confirmText="Clear All"
        cancelText="Keep Files"
      />
    </div>
  )
}
