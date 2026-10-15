import { useEffect, useMemo, useState } from 'react'
import { usePrintFlow, usePrintNavigate as useNavigate } from './PrintFlowContext'
import {
  ArrowRight,
  ArrowLeft,
  FilePdf,
  FileImage,
  FileDoc,
  FilePpt,
  File as FileIcon,
  Plus,
  ArrowsClockwise,
  X,
  MapPin,
  CaretLeft,
  CaretRight,
  MagnifyingGlassPlus,
  FileText,
} from '@phosphor-icons/react'
import DocumentLightGallery, { type DocumentPageItem } from '../../components/ui/DocumentLightGallery'
import { ShinyButton } from '../../components/ui/ShinyButton'
import { ClearDocumentModal } from '../../components/ui/ClearDocumentModal'
import { Skeleton, ConfirmDocPagesBoneyardFallback } from '../../components/ui/PrintBoneyardSkeleton'
import {
  getAllFiles,
  getActiveFileId,
  setActiveFile,
  removeFile,
  clearAllFiles,
  persistAllFilesToSession,
  persistActiveFileToSession,
  computeTotalPrice,
  calcFileTotalSheets,
  calcFileTotalPrice,
  getKioskPricing,
  parsePageRange,
  type ManagedFile,
} from '../../lib/multiFileStore'
import { getUploadedDoc, clearUploadedDoc } from '../../lib/documentStore'
import { generateDocumentPages } from '../../lib/documentPreview'
import { kioskSession } from '../../lib/kioskSession'
import './ConfirmPage.css'

function FileTypeIcon({ type, size = 18 }: { type: string; size?: number }) {
  if (type === 'pdf') return <FilePdf size={size} weight="fill" color="#dc2626" />
  if (type === 'image') return <FileImage size={size} weight="fill" color="#059669" />
  if (type === 'docx') return <FileDoc size={size} weight="fill" color="#2563eb" />
  if (type === 'ppt') return <FilePpt size={size} weight="fill" color="#ea580c" />
  return <FileIcon size={size} weight="fill" color="#94a3b8" />
}

export default function ConfirmPage() {
  const navigate = useNavigate()
  const flow = usePrintFlow()
  const [showClearModal, setShowClearModal] = useState(false)
  const [activePageIdx, setActivePageIdx] = useState(0)
  const [zoomModalOpen, setZoomModalOpen] = useState(false)

  // Multi-file store with guaranteed deduplication by filename + filesize
  const [rawFiles, setFiles] = useState<ManagedFile[]>(() => {
    const ready = getAllFiles().filter(f => f.status === 'ready')
    if (ready.length > 0) return ready
    const all = getAllFiles()
    if (all.length > 0) return all.map(f => ({ ...f, status: 'ready' }))
    return []
  })
  const [activeId, setActiveId] = useState<string | null>(() => getActiveFileId())

  // Ensure strict deduplication so identical uploads never register twice
  const files = useMemo(() => {
    const seen = new Set<string>()
    return rawFiles.filter(f => {
      const key = `${f.fileName}_${f.fileSize}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [rawFiles])

  // Single-file legacy fallback
  const singleDoc = getUploadedDoc()
  const hasFiles =
    files.length > 0 ||
    rawFiles.length > 0 ||
    getAllFiles().length > 0 ||
    Boolean(singleDoc.fileName || singleDoc.file || (singleDoc.realPages && singleDoc.realPages.length > 0)) ||
    Boolean(typeof window !== 'undefined' && (sessionStorage.getItem('pb_files') || sessionStorage.getItem('pb_file_name')))

  // Ensure state sync if files is empty on mount but ready files exist
  useEffect(() => {
    if (files.length === 0) {
      const all = getAllFiles()
      if (all.length > 0) {
        const ready = all.map(f => ({ ...f, status: 'ready' as const }))
        setFiles(ready)
        setActiveId(getActiveFileId() || ready[0].id)
      }
    }
  }, [files.length])

  // Redirect to upload only if truly no files exist anywhere in store or session storage
  useEffect(() => {
    if (!hasFiles) {
      const timer = setTimeout(() => {
        const stillNoFiles = getAllFiles().length === 0 && !sessionStorage.getItem('pb_files') && !sessionStorage.getItem('pb_file_name')
        if (stillNoFiles) {
          if (flow?.goToStep) {
            flow.goToStep('upload')
          } else {
            navigate('/print/upload', { replace: true })
          }
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [hasFiles, flow, navigate])

  // Sync when multiFileStore emits change
  useEffect(() => {
    const handleStoreChange = () => {
      const ready = getAllFiles().filter(f => f.status === 'ready')
      setFiles(ready)
      setActiveId(getActiveFileId())
    }
    window.addEventListener('printbooth:multifile-change', handleStoreChange)
    return () => window.removeEventListener('printbooth:multifile-change', handleStoreChange)
  }, [])

  // Currently active file
  const activeFile = useMemo(() => {
    if (files.length > 0) {
      return files.find(f => f.id === activeId) || files[0]
    }
    return null
  }, [files, activeId])

  // Active file settings or session fallback
  const rawSettings = sessionStorage.getItem('pb_settings')
  const activeSettings = useMemo(() => {
    if (activeFile?.settings) return activeFile.settings
    if (rawSettings) {
      try {
        return JSON.parse(rawSettings)
      } catch (e) {}
    }
    return {
      pages: 'ALL',
      copies: 1,
      colour: 'BW' as const,
      duplex: 'SINGLE' as const,
      paperSize: 'A4' as const,
      scaling: 'FIT' as const,
      pageCopies: undefined as Record<string, number> | undefined,
    }
  }, [activeFile, rawSettings])

  const kioskPricing = getKioskPricing()
  const prices: Record<string, number> = useMemo(() => ({
    BW_SINGLE: kioskPricing.bwSingle,
    BW_DOUBLE: kioskPricing.bwDouble,
    COLOUR_SINGLE: kioskPricing.colorSingle,
    COLOUR_DOUBLE: kioskPricing.colorDouble,
  }), [kioskPricing.bwSingle, kioskPricing.bwDouble, kioskPricing.colorSingle, kioskPricing.colorDouble])

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const queryMode = searchParams?.get('mode')
  // Confirm mode: 'doc' (confirm documents right after upload) vs 'final' (order review before payment)
  const confirmMode = (queryMode === 'final' || sessionStorage.getItem('pb_confirm_mode') === 'final') ? 'final' : 'doc'

  useEffect(() => {
    setActivePageIdx(0)
  }, [activeId])

  const priceRateKey = `${activeSettings.colour}_${activeSettings.duplex}`
  const pricePerSheet = prices[priceRateKey] ?? prices.BW_SINGLE
  const previewPages = useMemo(() => {
    if (activeFile && activeFile.realPages && activeFile.realPages.length > 0) {
      return activeFile.realPages
    }
    if (activeFile?.thumbnail) {
      return [{
        id: 1,
        pageNumber: 1,
        title: activeFile.fileName,
        subtitle: `${activeFile.pageCount || 1} page`,
        url: activeFile.thumbnail,
      }]
    }
    if (singleDoc.realPages && singleDoc.realPages.length > 0) {
      return singleDoc.realPages
    }
    const readyFiles = getAllFiles().filter(f => f.status === 'ready')
    if (readyFiles.length > 0) {
      const current = readyFiles.find(f => f.id === activeId) || readyFiles[0]
      if (current.realPages && current.realPages.length > 0) return current.realPages
      if (current.thumbnail) {
        return [{
          id: 1,
          pageNumber: 1,
          title: current.fileName,
          subtitle: `${current.pageCount || 1} page`,
          url: current.thumbnail,
        }]
      }
    }
    const sessionFileName = sessionStorage.getItem('pb_file_name')
    if (sessionFileName) {
      const cnt = parseInt(sessionStorage.getItem('pb_doc_page_count') || sessionStorage.getItem('pb_page_count') || '1', 10)
      return generateDocumentPages(sessionFileName, cnt)
    }
    return []
  }, [activeFile, singleDoc, activeId])

  const activePageCount = activeFile?.pageCount || parseInt(sessionStorage.getItem('pb_doc_page_count') || '', 10) || singleDoc.pageCount || 1

  const selectedPagesList = useMemo(() => {
    return parsePageRange(activeSettings.pages || 'ALL', activePageCount)
  }, [activeSettings.pages, activePageCount])

  // Document pages for LightGallery
  const docPages: DocumentPageItem[] = useMemo(() => {
    // In 'final' mode: only show the selected pages with per-page colour applied
    const pagesToShow = confirmMode === 'final'
      ? previewPages.filter((p, idx) => {
          const pNum = p.pageNumber || (idx + 1)
          return selectedPagesList.includes(pNum)
        })
      : previewPages

    return pagesToShow.map((p, idx) => {
      const pNum = p.pageNumber || (idx + 1)
      // Only apply BW filter in 'final' mode (after print settings have been configured).
      // In 'doc' mode the user hasn't set print settings yet — show the real file colors.
      const isBW = confirmMode === 'final'
        ? ((activeSettings.pageColours?.[String(pNum)] ?? activeSettings.colour) === 'BW')
        : false
      return {
        url: p.url,
        title: p.title || `Page ${pNum}`,
        pageNumber: pNum,
        isBW,
        width: p.width,
        height: p.height,
      }
    })
  }, [previewPages, activeSettings, confirmMode, selectedPagesList])

  const currentPageItem = docPages[activePageIdx] || docPages[0]

  const totalPages = files.length > 0
    ? files.reduce((sum, f) => sum + (f.pageCount || 1), 0)
    : (parseInt(sessionStorage.getItem('pb_doc_page_count') || '', 10) || singleDoc.pageCount || 1)


  const totalSizeMB = files.length > 0
    ? (files.reduce((sum, f) => sum + f.fileSize, 0) / (1024 * 1024)).toFixed(2)
    : (singleDoc.fileSize / (1024 * 1024)).toFixed(2)

  const isMulti = files.length > 1

  // Compute total printed sheets
  const totalSheets = useMemo(() => {
    if (isMulti) {
      return files.reduce((acc, f) => acc + calcFileTotalSheets(f), 0)
    }
    if (activeFile) {
      return calcFileTotalSheets(activeFile)
    }
    const selectedPgs = parsePageRange(activeSettings.pages, totalPages)
    let count = selectedPgs.length * Math.max(1, activeSettings.copies)
    if (activeSettings.pageCopies && Object.keys(activeSettings.pageCopies).length > 0) {
      count = selectedPgs.reduce((sum, p) => sum + (activeSettings.pageCopies?.[String(p)] || activeSettings.copies || 1), 0)
    }
    if (activeSettings.duplex === 'DOUBLE') {
      return Math.max(1, Math.ceil(count / 2))
    }
    return Math.max(1, count)
  }, [isMulti, files, activeFile, activeSettings, totalPages])

  // Grand Total Payable
  const grandTotal = useMemo(() => {
    if (isMulti) {
      return computeTotalPrice()
    }
    if (activeFile) {
      return calcFileTotalPrice(activeFile)
    }
    const stored = Number(sessionStorage.getItem('pb_total_price'))
    if (!isNaN(stored) && stored > 0) return stored
    return totalSheets * pricePerSheet
  }, [isMulti, activeFile, totalSheets, pricePerSheet])

  useEffect(() => {
    if (kioskSession.isKioskSession()) {
      if (confirmMode === 'final') {
        kioskSession.reportReviewing({
          fileName: activeFile?.fileName || 'Document.pdf',
          totalPages: activePageCount,
          copies: activeSettings.copies,
          colourMode: activeSettings.colour,
          amount: grandTotal,
        })
      } else {
        kioskSession.reportConfirming({
          fileName: activeFile?.fileName || 'Document.pdf',
          totalPages: activePageCount,
        })

        // Verify if session on kiosk already has document; if not, upload it now
        kioskSession.getStatus().then(status => {
          if (!status?.document && (files.length > 0 || singleDoc.file || singleDoc.fileName)) {
            const ready = getAllFiles().filter(f => f.status === 'ready')
            const primary = ready[0] || singleDoc
            const file = (primary as any).file
            const combinedFileName = ready.length > 1
              ? `${ready.length} Files: ${ready.map(f => f.fileName).join(', ')}`
              : primary.fileName
            const totalSize = ready.reduce((acc, f) => acc + (f.fileSize || 0), 0) || primary.fileSize || 0

            const allPreviews = docPages.slice(0, 5).map((p, idx) => ({
              pageNumber: p.pageNumber || idx + 1,
              url: p.url && (p.url.startsWith('data:image/svg') || p.url.length < 32000) ? p.url : '',
              title: p.title || `Page ${idx + 1}`,
            }))

            const filesMetadata = ready.map(f => ({
              id: f.id,
              fileName: f.fileName,
              fileSize: f.fileSize,
              fileType: f.fileType,
              pageCount: f.pageCount || 1,
              copies: f.settings?.copies || 1,
              colour: f.settings?.colour || 'BW',
              duplex: f.settings?.duplex || 'SINGLE',
            }))

            const filesBinaries = ready.map(f => f.file).filter(Boolean) as File[]
            kioskSession.uploadDocument({
              file,
              filesList: filesBinaries.length > 0 ? filesBinaries : undefined,
              fileName: combinedFileName || 'Document.pdf',
              fileSize: totalSize,
              fileType: ready.length > 1 ? 'multifile' : (primary as any).fileType || 'pdf',
              pageCount: totalPages,
              previews: allPreviews,
              files: filesMetadata,
            }).catch(e => {
              console.warn('[ConfirmPage] Kiosk document sync error:', e)
            })
          }
        }).catch(() => {})
      }
    }
  }, [confirmMode, activeFile?.fileName, activePageCount, activeSettings.copies, activeSettings.colour, grandTotal, files.length, docPages, totalPages, singleDoc])

  const printFlow = usePrintFlow()
  // Kiosk Location Info
  const kioskId = printFlow?.printerId || sessionStorage.getItem('pb_kiosk_id') || ''
  const kioskName = printFlow?.kioskName || sessionStorage.getItem('pb_kiosk_name') || 'PrintBooth Station'

  const KIOSK_LOCATIONS: Record<string, { location: string; campus: string }> = {
    'PB-001': {
      location: 'MIT ADT University, Loni Kalbhor, Pune',
      campus: 'Ground Floor · Central Reading Hall',
    },
    'PB-002': {
      location: 'Fergusson College Road, Shivajinagar, Pune',
      campus: 'Station 2 · Entrance Lobby',
    },
    'PB-003': {
      location: 'Viman Nagar, Pune',
      campus: 'Main Corridor',
    },
    'PB-004': {
      location: 'COEP Technological University, Shivajinagar, Pune',
      campus: 'Academic Complex · Ground Floor',
    },
  }
  const kioskCampus =
    KIOSK_LOCATIONS[kioskId]?.campus || 'Central Station'

  const pagesToPrintSummary = useMemo(() => {
    if (activeSettings.pages === 'ALL') {
      return `All ${activePageCount} ${activePageCount === 1 ? 'Page' : 'Pages'}`
    }
    return `Pages ${activeSettings.pages}`
  }, [activeSettings.pages, activePageCount])

  const pagesRangeText = useMemo(() => {
    if (activeSettings.pages === 'ALL') {
      return `Full document (Pgs 1–${activePageCount})`
    }
    return `${selectedPagesList.length} of ${activePageCount} pages selected`
  }, [activeSettings.pages, selectedPagesList.length, activePageCount])

  const colourModeSummary = useMemo(() => {
    if (activeSettings.pageColours && Object.keys(activeSettings.pageColours).length > 0) {
      const vals = Object.values(activeSettings.pageColours)
      const bw = vals.filter(c => c === 'BW').length
      const col = vals.filter(c => c === 'COLOUR').length
      return `Custom Mix (${bw} B&W, ${col} Colour)`
    }
    return activeSettings.colour === 'BW' ? 'Black & White' : 'Full Colour'
  }, [activeSettings.colour, activeSettings.pageColours])

  const colourDetailsText = useMemo(() => {
    if (activeSettings.pageColours && Object.keys(activeSettings.pageColours).length > 0) {
      return 'Per-page color configuration applied'
    }
    return activeSettings.colour === 'BW' ? 'Monochrome Laser (Grayscale)' : 'High-Quality Vibrant Colour'
  }, [activeSettings.colour, activeSettings.pageColours])

  function handleSelectFile(id: string) {
    setActiveFile(id)
    setActiveId(id)
  }

  function handleRemoveFile(id: string) {
    removeFile(id)
    const remaining = getAllFiles().filter(f => f.status === 'ready')
    setFiles(remaining)
    if (remaining.length === 0) {
      clearUploadedDoc()
      clearAllFiles()
      navigate('/print/upload')
    } else {
      const nextId = getActiveFileId() || remaining[0].id
      setActiveFile(nextId)
      setActiveId(nextId)
    }
  }


  function handleConfirmDocuments() {
    persistAllFilesToSession()
    persistActiveFileToSession()
    if (kioskSession.isKioskSession()) {
      kioskSession.reportConfiguring({
        fileName: activeFile?.fileName || 'Document.pdf',
        totalPages: activePageCount,
        copies: activeSettings.copies,
        colourMode: activeSettings.colour,
      })

      // Ensure document is transferred to kiosk display
      const ready = getAllFiles().filter(f => f.status === 'ready')
      if (ready.length > 0) {
        const first = ready[0]
        const allPreviews = docPages.slice(0, 8).map((p, idx) => ({
          pageNumber: p.pageNumber || idx + 1,
          url: p.url,
          title: p.title || `Page ${idx + 1}`,
        }))
        const filesBinaries = ready.map(f => f.file).filter(Boolean) as File[]
        kioskSession.uploadDocument({
          file: first.file,
          filesList: filesBinaries.length > 0 ? filesBinaries : undefined,
          fileName: ready.length > 1 ? `${ready.length} Files: ${ready.map(f => f.fileName).join(', ')}` : first.fileName,
          fileSize: ready.reduce((acc, f) => acc + (f.fileSize || 0), 0),
          fileType: ready.length > 1 ? 'multifile' : first.fileType,
          pageCount: totalPages,
          previews: allPreviews,
          files: ready.map(f => ({
            id: f.id,
            fileName: f.fileName,
            fileSize: f.fileSize,
            fileType: f.fileType,
            pageCount: f.pageCount || 1,
            copies: f.settings?.copies || (f as any).copies || 1,
            colour: f.settings?.colour || 'BW',
            duplex: f.settings?.duplex || 'SINGLE',
          })),
        }).catch(() => {})
      }
    }
    sessionStorage.setItem('pb_print_step', 'settings')
    if (flow?.goToStep) {
      flow.goToStep('settings')
    } else {
      navigate('/print/settings')
    }
  }

  function handleAddMore() {
    if (flow?.goToStep) {
      flow.goToStep('upload')
    } else {
      navigate('/print/upload?add=true')
    }
  }

  function handleProceedToPayment() {
    persistAllFilesToSession()
    persistActiveFileToSession()
    sessionStorage.setItem('pb_total_price', String(grandTotal))
    sessionStorage.setItem('pb_print_step', 'payment')
    if (kioskSession.isKioskSession()) {
      kioskSession.reportPaying({
        fileName: activeFile?.fileName || 'Document.pdf',
        totalPages: activePageCount,
        amount: grandTotal,
      })
    }
    if (flow?.goToStep) {
      flow.goToStep('payment')
    } else {
      navigate('/print/payment')
    }
  }

  function handleBackToSettings() {
    sessionStorage.setItem('pb_print_step', 'settings')
    if (flow?.goToStep) {
      flow.goToStep('settings')
    } else {
      navigate('/print/settings')
    }
  }

  function handleClearAll() {
    clearAllFiles()
    clearUploadedDoc()
    setShowClearModal(false)
    if (flow?.goToStep) {
      flow.goToStep('upload')
    } else {
      navigate('/print/upload')
    }
  }

  if (!hasFiles) {
    return null
  }

  // File type label
  const fileTypeLabel = activeFile?.fileType?.toUpperCase() ?? 'DOC'

  return (
    <div className="cfp-root">

      {/* ── Compact Header ── */}
      <div className="cfp-header">
        <div className="cfp-header-left">
          <span className="cfp-eyebrow">
            {confirmMode === 'doc' ? 'Document Inspection' : 'Order Summary'}
          </span>
          <h1 className="cfp-title">
            {confirmMode === 'doc' ? 'Review Your Documents' : 'Review Your Order'}
          </h1>
          <p className="cfp-subtitle">
            {confirmMode === 'doc' ? (
              isMulti ? (
                <>
                  <strong>{files.length} files</strong>&nbsp;·&nbsp;{totalPages} pages&nbsp;·&nbsp;{totalSizeMB} MB
                </>
              ) : (
                <>
                  <strong>{activeFile?.fileName || singleDoc.fileName}</strong>&nbsp;·&nbsp;{totalPages} {totalPages === 1 ? 'pg' : 'pgs'}&nbsp;·&nbsp;{totalSizeMB} MB
                </>
              )
            ) : (
              <>{kioskName}&nbsp;·&nbsp;{selectedPagesList.length} {selectedPagesList.length === 1 ? 'page' : 'pages'}</>
            )}
          </p>
        </div>
      </div>

      {/* ── Multi-File Document Switcher ── */}
      {isMulti && (
        <div className="cfp-tabs-wrapper">
          <div className="cfp-tabs">
            {files.map((f) => {
              const isSelected = (activeFile?.id ?? files[0].id) === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`cfp-tab ${isSelected ? 'active' : ''}`}
                  onClick={() => handleSelectFile(f.id)}
                  title={f.fileName}
                >
                  <span className="cfp-tab-icon">
                    <FileTypeIcon type={f.fileType} size={14} />
                  </span>
                  <span className="cfp-tab-title">{f.fileName}</span>
                  <span className="cfp-tab-badge">{f.pageCount}p</span>
                  {files.length > 1 && (
                    <span
                      className="cfp-tab-remove"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveFile(f.id)
                      }}
                      title="Remove file"
                    >
                      <X size={10} weight="bold" />
                    </span>
                  )}
                </button>
              )
            })}

            <button
              type="button"
              className="cfp-tab-add"
              onClick={handleAddMore}
              title="Add another file"
            >
              <Plus size={12} weight="bold" />
              <span>Add File</span>
            </button>
          </div>
        </div>
      )}

      {/* ── FINAL ORDER PREVIEW (After Print Settings) ── */}
      {confirmMode === 'final' ? (
        <>
          {/* 1. Page Image Preview ON TOP (Little small, not too small) */}
          <div className="cfp-preview-top-card" id="order-page-preview">
            <div className="cfp-preview-top-header">
              <div className="cfp-preview-top-meta">
                <FileText size={15} weight="bold" color="#dc2626" />
                <span className="cfp-preview-top-name" title={activeFile?.fileName || singleDoc.fileName}>
                  {activeFile?.fileName || singleDoc.fileName}
                </span>
              </div>
              <div className="cfp-preview-top-right">
                {docPages.length > 1 && (
                  <span className="cfp-preview-page-pill">
                    Page {activePageIdx + 1} of {docPages.length}
                  </span>
                )}
                <button
                  type="button"
                  className="cfp-preview-zoom-btn"
                  onClick={() => setZoomModalOpen(true)}
                  title="Inspect full page"
                  aria-label="Inspect full page"
                >
                  <MagnifyingGlassPlus size={15} weight="bold" />
                </button>
              </div>
            </div>

            <div className="cfp-preview-sheet-stage">
              {docPages.length > 1 && (
                <button
                  type="button"
                  className="cfp-preview-nav-btn prev"
                  disabled={activePageIdx === 0}
                  onClick={() => setActivePageIdx(i => Math.max(0, i - 1))}
                  aria-label="Previous Page"
                >
                  <CaretLeft size={16} weight="bold" />
                </button>
              )}

              <div
                className="cfp-preview-sheet-frame"
                onClick={() => setZoomModalOpen(true)}
                title="Click to view full preview"
              >
                {currentPageItem?.url ? (
                  <img
                    src={currentPageItem.url}
                    alt={`Preview of Page ${currentPageItem.pageNumber || activePageIdx + 1}`}
                    className={`cfp-preview-sheet-img ${currentPageItem.isBW ? 'is-bw' : ''}`}
                  />
                ) : (
                  <div className="cfp-preview-sheet-placeholder">
                    <ArrowsClockwise size={20} className="cfp-spin" />
                    <span>Loading Page {activePageIdx + 1}…</span>
                  </div>
                )}
                <span className={`cfp-preview-sheet-corner-tag ${currentPageItem?.isBW ? 'bw' : 'colour'}`}>
                  {currentPageItem?.isBW ? 'B&W' : 'Colour'}
                </span>
              </div>

              {docPages.length > 1 && (
                <button
                  type="button"
                  className="cfp-preview-nav-btn next"
                  disabled={activePageIdx >= docPages.length - 1}
                  onClick={() => setActivePageIdx(i => Math.min(docPages.length - 1, i + 1))}
                  aria-label="Next Page"
                >
                  <CaretRight size={16} weight="bold" />
                </button>
              )}
            </div>

            {/* Multi-page mini thumbnail track */}
            {docPages.length > 1 && (
              <div className="cfp-preview-thumb-strip">
                {docPages.map((page, idx) => (
                  <button
                    key={page.pageNumber || idx}
                    type="button"
                    className={`cfp-preview-thumb-btn ${idx === activePageIdx ? 'active' : ''}`}
                    onClick={() => setActivePageIdx(idx)}
                    title={`Jump to Page ${idx + 1}`}
                  >
                    {page.url && (
                      <img
                        src={page.url}
                        alt={`P.${idx + 1}`}
                        className={`cfp-preview-thumb-img ${page.isBW ? 'is-bw' : ''}`}
                      />
                    )}
                    <span className="cfp-preview-thumb-num">{idx + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2. Compact Order Summary (All details shown cleanly) */}
          <div className="cfp-compact-summary-card">
            {/* Station / Kiosk Row */}
            <div className="cfp-summary-station-bar">
              <div className="cfp-summary-station-info">
                <MapPin size={14} weight="bold" color="#dc2626" />
                <span className="cfp-summary-station-name">{kioskName || kioskId}</span>
                {kioskCampus && (
                  <>
                    <span className="cfp-summary-station-sep">·</span>
                    <span className="cfp-summary-station-sub">{kioskCampus}</span>
                  </>
                )}
              </div>
            </div>

            {/* Compact 2x2 Specs Grid */}
            <div className="cfp-summary-grid">
              <div className="cfp-summary-cell">
                <span className="cfp-summary-cell-label">Pages</span>
                <span className="cfp-summary-cell-value">{pagesToPrintSummary}</span>
                <span className="cfp-summary-cell-sub">{pagesRangeText}</span>
              </div>

              <div className="cfp-summary-cell">
                <span className="cfp-summary-cell-label">Colour Mode</span>
                <span className={`cfp-summary-cell-value ${activeSettings.colour !== 'BW' ? 'accent-colour' : ''}`}>
                  {colourModeSummary}
                </span>
                <span className="cfp-summary-cell-sub">{colourDetailsText}</span>
              </div>

              <div className="cfp-summary-cell">
                <span className="cfp-summary-cell-label">Sides</span>
                <span className="cfp-summary-cell-value">
                  {activeSettings.duplex === 'DOUBLE' ? '2-Sided (Duplex)' : '1-Sided (Simplex)'}
                </span>
                <span className="cfp-summary-cell-sub">
                  {activeSettings.duplex === 'DOUBLE' ? 'Printed both sides' : 'Single-sided sheet'}
                </span>
              </div>

              <div className="cfp-summary-cell">
                <span className="cfp-summary-cell-label">Copies &amp; Paper</span>
                <span className="cfp-summary-cell-value">
                  {activeSettings.copies} {activeSettings.copies === 1 ? 'Copy' : 'Copies'}
                </span>
                <span className="cfp-summary-cell-sub">A4 · Fit to Paper</span>
              </div>
            </div>

            {/* Multi-file breakdown (if multiple files) */}
            {isMulti && (
              <div className="cfp-summary-multifile-block">
                <div className="cfp-summary-multifile-title">File Breakdown ({files.length} files)</div>
                {files.map((f, idx) => {
                  const fSheets = calcFileTotalSheets(f)
                  const fPrice = calcFileTotalPrice(f)
                  const fSettings = f.settings || activeSettings
                  return (
                    <div key={f.id} className="cfp-summary-multifile-row">
                      <span className="cfp-summary-mf-idx">{idx + 1}</span>
                      <span className="cfp-summary-mf-name">{f.fileName}</span>
                      <span className="cfp-summary-mf-meta">
                        {fSettings.colour === 'BW' ? 'B&W' : 'Colour'} · {fSheets}sh
                      </span>
                      <span className="cfp-summary-mf-price">₹{fPrice}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Compact Total Row */}
            <div className="cfp-summary-total-strip">
              <div className="cfp-summary-total-calc">
                <span className="cfp-summary-total-sheets">
                  {totalSheets} {totalSheets === 1 ? 'Sheet' : 'Sheets'}
                </span>
                <span className="cfp-summary-total-rate">
                  · ₹{pricePerSheet}/sheet
                </span>
              </div>
              <div className="cfp-summary-total-amount-box">
                <span className="cfp-summary-total-tag">Total Payable</span>
                <span className="cfp-summary-total-price">₹{grandTotal}.00</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Doc mode: gallery preview for uploaded document */
        <>
          {/* ── Doc Info Card (doc mode) ── */}
          <div className="cfp-doc-card">
            <div className="cfp-doc-icon-wrap">
              <FileTypeIcon type={activeFile?.fileType ?? 'pdf'} size={20} />
            </div>
            <div className="cfp-doc-meta">
              <span className="cfp-doc-name">
                {activeFile?.fileName || singleDoc.fileName}
              </span>
              <span className="cfp-doc-detail">
                {fileTypeLabel}&nbsp;·&nbsp;{totalSizeMB} MB
              </span>
            </div>
            <div className="cfp-doc-stats">
              <div className="cfp-doc-stat-pill">
                <span className="cfp-doc-stat-num">{totalPages}</span>
                <span className="cfp-doc-stat-lbl">{totalPages === 1 ? 'Pg' : 'Pgs'}</span>
              </div>
            </div>
          </div>

          <div className="cfp-gallery-section-head">
            <div className="cfp-gallery-section-title-wrap">
              <span className="cfp-gallery-section-title">Live Document Preview</span>
              <span className="cfp-gallery-section-hint">Tap any page to inspect in full detail</span>
            </div>
            <span className="cfp-gallery-page-count">{docPages.length} {docPages.length === 1 ? 'Page' : 'Pages'}</span>
          </div>

          <div className="cfp-gallery-shell">
            <Skeleton
              name="confirm-doc-pages"
              loading={docPages.length === 0}
              animate="shimmer"
              fallback={<ConfirmDocPagesBoneyardFallback count={4} />}
            >
              {docPages.length > 0 ? (
                <DocumentLightGallery
                  pages={docPages}
                  fileName={activeFile?.fileName || singleDoc.fileName}
                  fileSizeMB={totalSizeMB}
                  id="gallery-container"
                />
              ) : (
                <div className="cfp-gallery-empty">
                  <ArrowsClockwise size={24} />
                  <span>Rendering high-resolution document pages…</span>
                </div>
              )}
            </Skeleton>
          </div>
        </>
      )}

      {/* ── Action Buttons (2 words maximum) ── */}
      <div className="cfp-action-bar">
        {confirmMode === 'doc' ? (
          <>
            <ShinyButton
              type="button"
              variant="ghost"
              className="cfp-back-btn"
              onClick={handleAddMore}
              id="confirm-add-files"
            >
              <Plus size={15} weight="bold" className="btn-arrow btn-arrow--left" />
              <span>Add Files</span>
            </ShinyButton>

            <ShinyButton
              type="button"
              variant="primary"
              className="cfp-proceed-btn"
              onClick={handleConfirmDocuments}
              id="confirm-proceed-settings"
            >
              <span>Print Settings</span>
              <ArrowRight size={15} weight="bold" className="btn-arrow btn-arrow--right" />
            </ShinyButton>
          </>
        ) : (
          <>
            <ShinyButton
              type="button"
              variant="ghost"
              className="cfp-back-btn"
              onClick={handleBackToSettings}
              id="confirm-change-settings"
            >
              <ArrowLeft size={15} weight="bold" className="btn-arrow btn-arrow--left" />
              <span>Change Settings</span>
            </ShinyButton>

            <ShinyButton
              type="button"
              variant="primary"
              className="cfp-proceed-btn"
              onClick={handleProceedToPayment}
              id="confirm-proceed-payment"
            >
              <span>Pay · ₹{grandTotal}</span>
              <ArrowRight size={15} weight="bold" className="btn-arrow btn-arrow--right" />
            </ShinyButton>
          </>
        )}
      </div>

      {/* ── Zoom / Full Preview Dialog ── */}
      {zoomModalOpen && (
        <div className="cfp-zoom-backdrop" onClick={() => setZoomModalOpen(false)}>
          <div className="cfp-zoom-modal" onClick={e => e.stopPropagation()}>
            <div className="cfp-zoom-modal-header">
              <span className="cfp-zoom-modal-title">
                {activeFile?.fileName || singleDoc.fileName} · Page {activePageIdx + 1} of {docPages.length}
              </span>
              <button
                type="button"
                className="cfp-zoom-close-btn"
                onClick={() => setZoomModalOpen(false)}
                aria-label="Close"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
            <div className="cfp-zoom-modal-body">
              <img
                src={currentPageItem?.url}
                alt={`Page ${activePageIdx + 1}`}
                className={`cfp-zoom-modal-img ${currentPageItem?.isBW ? 'is-bw' : ''}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Clear Confirmation Modal ── */}
      <ClearDocumentModal
        isOpen={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={handleClearAll}
        title="Upload Different Document?"
        description="Going back will clear your uploaded files so you can start fresh."
        confirmText="Start Fresh"
        cancelText="Keep Files"
      />
    </div>
  )
}
