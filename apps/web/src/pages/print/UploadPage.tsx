import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  WarningCircle,
  CloudArrowUp,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  WarningOctagon,
} from '@phosphor-icons/react'
import DocumentLightGallery from '../../components/ui/DocumentLightGallery'
import { ShinyButton } from '../../components/ui/ShinyButton'
import { ClearDocumentModal } from '../../components/ui/ClearDocumentModal'
import { renderFilePages } from '../../lib/multiFileRenderer'
import { getFileType, isSupportedFileType, getMaxFileSizeMB } from '../../lib/multiFileStore'
import { setUploadedDoc, getUploadedDoc, clearUploadedDoc } from '../../lib/documentStore'
import { checkPrinterHardwareStatus } from '../../lib/api'
import type { DocumentPagePreview } from '../../lib/documentPreview'
import PrinterErrorOverlay from '../../components/ui/PrinterErrorOverlay'
import { Skeleton, UploadDropzoneBoneyardFallback } from '../../components/ui/PrintBoneyardSkeleton'
import { kioskSession } from '../../lib/kioskSession'
import './UploadPage.css'

const MAX_SIZE_MB = 10

interface UploadState {
  file: File | null
  progress: number
  error: string | null
  status: 'idle' | 'uploading' | 'confirm' | 'error'
  fileName: string
  fileSize: number
  pageCount: number
  realPages: DocumentPagePreview[] | null
  isExtracting: boolean
}

export default function UploadPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [showClearModal, setShowClearModal] = useState(false)

  const activeKioskId =
    searchParams.get('id') ||
    searchParams.get('printer_id') ||
    (typeof window !== 'undefined' ? sessionStorage.getItem('pb_kiosk_id') : null) ||
    'PB-001'

  // Live printer hardware status check
  const [printerIssue, setPrinterIssue] = useState<{
    hasIssue: boolean
    reason: string
    detail: string
    kioskName?: string
    printerName?: string
  } | null>(null)
  const [isCheckingPrinter, setIsCheckingPrinter] = useState(false)
  const [userDismissedNotice, setUserDismissedNotice] = useState(false)
  const userDismissedRef = useRef(false)
  userDismissedRef.current = userDismissedNotice

  const verifyPrinter = useCallback(async (allowAutoPopup = true) => {
    setIsCheckingPrinter(true)
    try {
      const check = await checkPrinterHardwareStatus(activeKioskId)
      if (!check.isAvailable) {
        if (allowAutoPopup || !userDismissedRef.current) {
          setPrinterIssue({
            hasIssue: true,
            reason: check.reason || 'Printer is not available',
            detail: check.detail || 'Hardware printer is disconnected or reporting an issue.',
          })
        }
      } else {
        setPrinterIssue(null)
        setUserDismissedNotice(false)
      }
    } catch {
      if (allowAutoPopup || !userDismissedRef.current) {
        setPrinterIssue({
          hasIssue: true,
          reason: 'Hardware connection check failed',
          detail: 'Cannot reach the local printer hardware daemon.',
        })
      }
    } finally {
      setIsCheckingPrinter(false)
    }
  }, [])

  useEffect(() => {
    verifyPrinter(true)
    const timer = setInterval(() => verifyPrinter(false), 10000)
    return () => clearInterval(timer)
  }, [verifyPrinter])

  const [uploadState, setUploadState] = useState<UploadState>(() => {
    const cached = getUploadedDoc()
    // Only restore into confirm state if we have REAL rendered PDF pages
    if (cached.file && cached.realPages && cached.realPages.length > 0) {
      return {
        file: cached.file,
        progress: 100,
        error: null,
        status: 'confirm',
        fileName: cached.fileName,
        fileSize: cached.fileSize,
        pageCount: cached.pageCount,
        realPages: cached.realPages,
        isExtracting: false,
      }
    }
    // Clean idle upload drop zone by default — NO sample preview
    return {
      file: null,
      progress: 0,
      error: null,
      status: 'idle',
      fileName: '',
      fileSize: 0,
      pageCount: 0,
      realPages: null,
      isExtracting: false,
    }
  })

  useEffect(() => {
    const handleReset = () => {
      handleClear()
    }
    window.addEventListener('printbooth:reset-upload', handleReset)
    return () => window.removeEventListener('printbooth:reset-upload', handleReset)
  }, [])

  // Dynamic preview pages: ONLY use real extracted PDF pages
  const previewPages = useMemo(() => {
    if (uploadState.realPages && uploadState.realPages.length > 0) {
      return uploadState.realPages
    }
    return []
  }, [uploadState.realPages])

  function validateFile(file: File): string | null {
    const fileType = getFileType(file)
    if (!isSupportedFileType(fileType)) {
      return 'Please upload a supported format: PDF, PNG, JPG, or WEBP.'
    }
    const maxMB = getMaxFileSizeMB(fileType)
    if (file.size > maxMB * 1024 * 1024) {
      return `File is too large. Maximum size is ${maxMB} MB.`
    }
    return null
  }

  async function handleFile(file: File) {
    if (printerIssue?.hasIssue && !userDismissedRef.current) {
      setUploadState(s => ({
        ...s,
        file: null,
        progress: 0,
        error: `Cannot upload: ${printerIssue.reason}. Please resolve printer issues before uploading.`,
        status: 'error',
        realPages: null,
        isExtracting: false,
      }))
      return
    }
    const error = validateFile(file)
    if (error) {
      setUploadState(s => ({
        ...s,
        file: null,
        progress: 0,
        error,
        status: 'error',
        realPages: null,
        isExtracting: false,
      }))
      return
    }

    // Set extracting / uploading state immediately
    // Set extracting / uploading state immediately
    setUploadState(s => ({
      ...s,
      file,
      fileName: file.name,
      fileSize: file.size,
      error: null,
      status: 'uploading',
      progress: 5,
      isExtracting: true,
      realPages: null,
    }))

    if (kioskSession.isKioskSession()) {
      kioskSession.reportUploading(file.name, `Preparing ${file.name}…`, 5)
    }

    try {
      const fileType = getFileType(file)
      const RENDER_TIMEOUT_MS = 30000 // 30s max — prevents infinite hang on phones
      const extractedPages = await Promise.race([
        renderFilePages(file, fileType, (current, total) => {
          const prepPercent = Math.min(45, Math.max(5, Math.round((current / Math.max(1, total)) * 45)))
          setUploadState(s => ({ ...s, progress: prepPercent }))
          if (kioskSession.isKioskSession()) {
            kioskSession.reportUploading(file.name, `Preparing pages (${current}/${total})…`, prepPercent)
          }
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Document processing timed out. Please try again or use a smaller file.')),
            RENDER_TIMEOUT_MS
          )
        ),
      ])
      const pageCount = extractedPages.length || 1

      // Save real document & real rendered page data URLs
      setUploadedDoc({
        file,
        fileName: file.name,
        fileSize: file.size,
        pageCount,
        realPages: extractedPages,
      })

      // Sync real document and rendered preview pages to connected kiosk session
      if (kioskSession.isKioskSession()) {
        await kioskSession.uploadDocument({
          file,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || fileType,
          pageCount,
          previews: extractedPages.map((p, idx) => ({
            pageNumber: p.pageNumber || idx + 1,
            url: p.url,
            title: p.title || `Page ${idx + 1}`,
          })),
          onProgress: ({ percent }) => {
            const overallPercent = Math.min(99, 45 + Math.round(percent * 0.54))
            setUploadState(s => ({ ...s, progress: overallPercent }))
          },
        }).catch(err => console.warn('[UploadPage] Kiosk upload sync failed:', err))
      }

      setUploadState({
        file,
        progress: 100,
        error: null,
        status: 'confirm',
        fileName: file.name,
        fileSize: file.size,
        pageCount,
        realPages: extractedPages,
        isExtracting: false,
      })
    } catch (e) {
      console.error('Failed to parse and render file pages', e)
      setUploadState(s => ({
        ...s,
        file: null,
        progress: 0,
        status: 'error',
        error: 'Unable to render pages from this file. Please ensure it is a valid document or image.',
        realPages: null,
        isExtracting: false,
      }))
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function handleClear() {
    clearUploadedDoc()
    setUploadState({
      file: null,
      progress: 0,
      error: null,
      status: 'idle',
      fileName: '',
      fileSize: 0,
      pageCount: 0,
      realPages: null,
      isExtracting: false,
    })
  }

  function handleProceedToKiosk() {
    if (kioskSession.isKioskSession()) {
      kioskSession.reportConfiguring({
        fileName: uploadState.fileName,
        totalPages: uploadState.pageCount,
      })
      navigate('/print/settings')
      return
    }
    navigate('/print/kiosk')
  }

  const { error, status, fileName, fileSize, isExtracting } = uploadState

  return (
    <div className="upload-page animate-fadeInUp">
      {/* Full-Screen Printer Unavailable / Error Overlay */}
      <PrinterErrorOverlay
        isOpen={Boolean(printerIssue?.hasIssue)}
        title={
          printerIssue?.reason?.toUpperCase().includes('USB')
            ? 'PRINTER DISCONNECTED'
            : printerIssue?.reason?.toUpperCase().includes('PAPER')
            ? 'OUT OF PAPER'
            : (printerIssue?.reason?.toUpperCase().includes('DISCONNECTED') || printerIssue?.reason?.toUpperCase().includes('OFFLINE')
                ? 'PRINTER OFFLINE'
                : 'PRINTER ERROR')
        }
        reason={printerIssue?.reason || 'The printer is not connected or reporting an active hardware issue.'}
        detail={printerIssue?.detail || 'Printing is temporarily paused until the printer is powered on and connected.'}
        kioskName={printerIssue?.kioskName}
        printerName={printerIssue?.printerName}
        isChecking={isCheckingPrinter}
        onRetry={() => {
          setUserDismissedNotice(false)
          verifyPrinter(true)
        }}
        onDismiss={() => {
          setPrinterIssue(null)
          setUserDismissedNotice(true)
        }}
      />

      {status !== 'confirm' ? (
        <>
          <div className="page-header">
            <h1 className="page-title">Upload Document</h1>
            <p className="page-subtitle">
              PDF format supported. Maximum {MAX_SIZE_MB} MB.
            </p>
          </div>

          {/* Drop zone */}
          {printerIssue?.hasIssue && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 18px',
              background: '#fef2f2',
              border: '1px solid #f87171',
              borderRadius: '12px',
              color: '#991b1b',
              marginBottom: '16px',
              fontSize: '13px',
              fontWeight: 500,
            }}>
              <WarningOctagon size={24} weight="fill" color="#dc2626" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <strong style={{ display: 'block', color: '#7f1d1d' }}>Printer Hardware Error</strong>
                <span>{printerIssue.reason}: {printerIssue.detail}. Uploading is disabled until resolved.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUserDismissedNotice(false)
                  verifyPrinter(true)
                }}
                disabled={isCheckingPrinter}
                style={{
                  padding: '6px 12px',
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isCheckingPrinter ? 'Checking...' : 'Retry'}
              </button>
            </div>
          )}

          <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''} ${isExtracting ? 'is-loading' : ''} ${status === 'error' || printerIssue?.hasIssue ? 'has-error' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !isExtracting && !printerIssue?.hasIssue && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload area — click to browse or drag and drop a file"
            onKeyDown={e => e.key === 'Enter' && !isExtracting && !printerIssue?.hasIssue && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
              onChange={handleInputChange}
              style={{ display: 'none' }}
              id="file-input"
            />

            {isExtracting ? (
              <Skeleton
                name="upload-doc-extracting"
                loading={isExtracting}
                animate="shimmer"
                fallback={<UploadDropzoneBoneyardFallback />}
              >
                <div className="drop-zone__extracting" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '36px 20px', width: '100%', maxWidth: '360px', margin: '0 auto' }}>
                  {/* Radial animated SVG ring with exact percent */}
                  <div style={{ position: 'relative', width: '74px', height: '74px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="74" height="74" viewBox="0 0 74 74" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="37" cy="37" r="32" fill="none" stroke="#fee2e2" strokeWidth="5" />
                      <circle
                        cx="37"
                        cy="37"
                        r="32"
                        fill="none"
                        stroke="#dc2626"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={201}
                        strokeDashoffset={201 - (201 * Math.min(100, Math.max(5, uploadState.progress))) / 100}
                        style={{ transition: 'stroke-dashoffset 0.25s ease' }}
                      />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '17px', fontWeight: 800, color: '#dc2626', fontFamily: 'inherit' }}>
                        {uploadState.progress}%
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <span style={{ color: '#0f172a', fontSize: '16px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                      {uploadState.progress < 45 ? 'Preparing Document…' : 'Uploading to Print Station…'}
                    </span>
                    <span style={{ color: '#64748b', fontSize: '13px', display: 'block', marginBottom: '12px' }}>
                      {uploadState.fileName ? `${uploadState.fileName} (${(uploadState.fileSize / (1024 * 1024)).toFixed(1)} MB)` : 'Extracting pages for confirmation'}
                    </span>

                    {/* Linear Progress Bar */}
                    <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.max(5, uploadState.progress)}%`,
                          background: 'linear-gradient(90deg, #dc2626 0%, #ef4444 60%, #f87171 100%)',
                          borderRadius: '999px',
                          transition: 'width 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                          boxShadow: '0 0 10px rgba(220, 38, 38, 0.4)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Skeleton>
            ) : (
              <div className="drop-zone__idle">
                <div className="drop-zone__icon">
                  <CloudArrowUp size={44} weight="duotone" />
                </div>
                <div className="drop-zone__text">
                  <span className="drop-zone__primary">Drop your PDF or image here</span>
                  <span className="drop-zone__secondary">or click to browse from device</span>
                </div>
                <div className="drop-zone__formats">
                  <span className="format-tag">PDF</span>
                  <span className="format-tag">JPG / PNG / WEBP</span>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="upload-error" role="alert">
              <WarningCircle size={16} weight="fill" />
              <span>{error}</span>
            </div>
          )}
        </>
      ) : (
        /* CONFIRM FILE SECTION WITH RADIAL CAROUSEL */
        <div className="confirm-file-section animate-fadeIn">
          {/* Header */}
          <div className="confirm-header">
            <div className="confirm-status-badge">
              <CheckCircle size={15} weight="fill" className="confirm-badge-icon" />
              <span>Upload Successful</span>
            </div>
            <h1 className="confirm-title">Confirm Document</h1>
            <p className="confirm-subtitle">
              {fileName} &nbsp;·&nbsp; {previewPages.length} Pages &nbsp;·&nbsp; {(fileSize / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>

          {/* Document LightGallery Preview */}
          <div className="confirm-gallery-wrap">
            <DocumentLightGallery
              pages={previewPages.map((p, idx) => ({
                url: p.url,
                title: p.title || `Page ${idx + 1}`,
                pageNumber: idx + 1,
              }))}
              fileName={fileName}
              fileSizeMB={(fileSize / 1024 / 1024).toFixed(2)}
              id="upload-gallery-container"
            />
          </div>

          {/* Action Bar */}
          <div className="confirm-action-bar">
            <ShinyButton
              type="button"
              variant="ghost"
              className="confirm-change-btn"
              onClick={() => setShowClearModal(true)}
              id="confirm-back"
            >
              <ArrowLeft size={16} weight="bold" className="btn-arrow btn-arrow--left" />
              <span>Back</span>
            </ShinyButton>

            <ShinyButton
              type="button"
              variant="primary"
              className="confirm-proceed-btn"
              onClick={handleProceedToKiosk}
              id="confirm-continue"
            >
              <span>Confirm</span>
              <ArrowRight size={16} weight="bold" className="btn-arrow btn-arrow--right" />
            </ShinyButton>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Warn that going back clears the uploaded document */}
      <ClearDocumentModal
        isOpen={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={() => {
          setShowClearModal(false)
          handleClear()
        }}
        title="Clear Uploaded Document?"
        description="Going back will clear your uploaded document. Are you sure you want to upload a different document?"
        confirmText="Clear Document"
        cancelText="Stay Here"
      />
    </div>
  )
}
