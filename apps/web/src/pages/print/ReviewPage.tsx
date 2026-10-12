import { useEffect, useMemo, useState } from 'react'
import { usePrintNavigate as useNavigate, usePrintFlow } from './PrintFlowContext'
import {
  File,
  MapPin,
  Printer,
  CurrencyInr,
  ArrowLeft,
  CheckCircle,
  Files,
  FileText,
  Palette,
  SlidersHorizontal,
} from '@phosphor-icons/react'
import DocumentLightGallery, { type DocumentPageItem } from '../../components/ui/DocumentLightGallery'
import { ShinyButton } from '../../components/ui/ShinyButton'
import { getUploadedDoc, hasRealUploadedDoc } from '../../lib/documentStore'
import { getAllFiles, hasAnyReadyFile, computeTotalPrice, parsePageRange, calcFileTotalSheets, type FileSettings, type ManagedFile } from '../../lib/multiFileStore'
import { isCanonicalKioskFormat, VERIFIED_KIOSKS } from '@/lib/kioskValidation'
import { Skeleton, ConfirmDocPagesBoneyardFallback } from '../../components/ui/PrintBoneyardSkeleton'
import { kioskSession } from '../../lib/kioskSession'
import './ReviewPage.css'

export default function ReviewPage() {
  const navigate = useNavigate()
  const flow = usePrintFlow()
  const fileName   = sessionStorage.getItem('pb_file_name') || ''
  const kioskId    = flow?.printerId || sessionStorage.getItem('pb_kiosk_id') || ''
  const kioskName  = flow?.kioskName || sessionStorage.getItem('pb_kiosk_name') || (kioskId && VERIFIED_KIOSKS[kioskId]?.name) || 'PrintBooth Station'
  const kioskLocation = sessionStorage.getItem('pb_kiosk_location') || (kioskId && VERIFIED_KIOSKS[kioskId]?.location) || 'Walk-up Print Station'
  const rawSettings = sessionStorage.getItem('pb_settings')
  const pageCount  = Number(sessionStorage.getItem('pb_page_count') || 1)
  const storedTotal = Number(sessionStorage.getItem('pb_total_price') || 0)
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
    pageCopies: undefined,
  }
  if (rawSettings) {
    try {
      settings = { ...settings, ...JSON.parse(rawSettings) }
    } catch (e) {
      console.warn('[ReviewPage] Failed to parse settings from session:', e)
    }
  }

  // Multi-file state
  const [multiFiles, setMultiFiles] = useState<ManagedFile[]>(() => getAllFiles().filter(f => f.status === 'ready'))

  useEffect(() => {
    const handleStoreChange = () => {
      setMultiFiles(getAllFiles().filter(f => f.status === 'ready'))
    }
    window.addEventListener('printbooth:multifile-change', handleStoreChange)
    return () => window.removeEventListener('printbooth:multifile-change', handleStoreChange)
  }, [])

  const isMultiFile = multiFiles.length > 1
  const [activePreviewIdx, setActivePreviewIdx] = useState(0)

  const computedPrice = computeTotalPrice()
  const totalPrice = computedPrice > 0 ? computedPrice : (storedTotal || 10)

  useEffect(() => {
    if (totalPrice > 0) {
      sessionStorage.setItem('pb_total_price', String(totalPrice))
    }
  }, [totalPrice])

  useEffect(() => {
    if (!kioskId || !isCanonicalKioskFormat(kioskId)) {
      navigate('/print/kiosk')
      return
    }
    const hasFiles =
      hasRealUploadedDoc() ||
      hasAnyReadyFile() ||
      multiFiles.length > 0 ||
      Boolean(typeof window !== 'undefined' && (sessionStorage.getItem('pb_files') || sessionStorage.getItem('pb_file_name')))
    if (!hasFiles) {
      navigate('/print/upload', { replace: true })
      return
    }
    if (!sessionStorage.getItem('pb_settings') && multiFiles.length === 0) {
      navigate('/print/settings')
    }
  }, [kioskId, navigate, multiFiles.length])

  // Build doc pages from active preview file's real pages or legacy single file
  const docPages: DocumentPageItem[] = useMemo(() => {
    if (isMultiFile && multiFiles[activePreviewIdx]) {
      const f = multiFiles[activePreviewIdx]
      const isBW = (f.settings?.colour ?? settings.colour) === 'BW'
      return f.realPages.map((p, idx) => ({
        url: p.url,
        title: p.title || `Page ${idx + 1}`,
        pageNumber: idx + 1,
        isBW,
      }))
    }
    const realPages = getUploadedDoc().realPages
    if (realPages && realPages.length > 0) {
      const isBW = settings.colour === 'BW'
      return realPages.map((p, idx) => ({
        url: p.url,
        title: p.title || `Page ${idx + 1}`,
        pageNumber: idx + 1,
        isBW,
      }))
    }
    return []
  }, [activePreviewIdx, isMultiFile, multiFiles, settings.colour])

  // Report REVIEWING state to kiosk display companion
  useEffect(() => {
    if (kioskSession.isKioskSession()) {
      kioskSession.reportReviewing({
        fileName: fileName || multiFiles[0]?.fileName || 'Document.pdf',
        totalPages: pageCount,
        copies: settings.copies,
        colourMode: settings.colour,
        amount: totalPrice,
        files: multiFiles.map(f => ({
          id: f.id,
          fileName: f.fileName,
          fileSize: f.fileSize,
          fileType: f.fileType,
          pageCount: f.pageCount || 1,
          copies: f.settings?.copies || settings.copies || 1,
          colour: f.settings?.colour || settings.colour || 'BW',
          duplex: f.settings?.duplex || settings.duplex || 'SINGLE',
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
      })
    }
  }, [fileName, pageCount, settings.copies, settings.colour, totalPrice, multiFiles])

  function handlePay() {
    sessionStorage.setItem('pb_print_step', 'payment')
    sessionStorage.setItem('pb_total_price', String(totalPrice))
    if (kioskSession.isKioskSession()) {
      kioskSession.reportPaying({
        fileName: fileName || multiFiles[0]?.fileName || 'Document.pdf',
        totalPages: pageCount,
        amount: totalPrice,
        files: multiFiles.map(f => ({
          id: f.id,
          fileName: f.fileName,
          fileSize: f.fileSize,
          fileType: f.fileType,
          pageCount: f.pageCount || 1,
          copies: f.settings?.copies || settings.copies || 1,
          colour: f.settings?.colour || settings.colour || 'BW',
          duplex: f.settings?.duplex || settings.duplex || 'SINGLE',
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
      })
    }
    if (flow?.goToStep) {
      flow.goToStep('payment')
    } else {
      navigate('/print/payment')
    }
  }

  // For multi-file: show active file's settings in summary
  const activeMultiFile = isMultiFile ? multiFiles[activePreviewIdx] : null
  const activeSettings  = activeMultiFile?.settings ?? settings
  const activeColour = activeSettings.colour === 'BW' ? 'Black & White' : 'Colour'
  const activeDuplex = activeSettings.duplex === 'DOUBLE' ? 'Double-sided' : 'Single-sided'
  const activePageCount = activeMultiFile?.pageCount ?? pageCount
  const selectedPgs = parsePageRange(activeSettings.pages, activePageCount)

  const activeSheets = activeMultiFile
    ? calcFileTotalSheets(activeMultiFile)
    : (activeSettings.duplex === 'DOUBLE'
        ? Math.max(1, Math.ceil((selectedPgs.length * activeSettings.copies) / 2))
        : selectedPgs.length * activeSettings.copies)

  const summaryRows = [
    {
      icon: <MapPin size={15} weight="bold" />,
      label: 'Print Booth Location',
      value: `${kioskName} (${kioskId}) · ${kioskLocation}`,
    },
    {
      icon: isMultiFile ? <Files size={15} weight="bold" /> : <File size={15} weight="bold" />,
      label: 'Total Files',
      value: isMultiFile
        ? `${multiFiles.length} files (${multiFiles.reduce((s, f) => s + f.pageCount, 0)} total pages)`
        : `${fileName || '1 file'} (${pageCount} ${pageCount === 1 ? 'page' : 'pages'})`,
    },
    {
      icon: <Printer size={15} weight="bold" />,
      label: 'Number of Prints',
      value: `${activeSheets} ${activeSheets === 1 ? 'sheet' : 'sheets'} to print · ${activeSettings.copies} ${activeSettings.copies === 1 ? 'copy' : 'copies'} · ${activeDuplex}`,
    },
    {
      icon: <FileText size={15} weight="bold" />,
      label: 'File Pages to Print',
      value: activeSettings.pages === 'ALL'
        ? `All ${activePageCount} pages (1–${activePageCount})`
        : `Custom: Pages ${activeSettings.pages} (${selectedPgs.length} of ${activePageCount} pages selected)`,
    },
    {
      icon: <Palette size={15} weight="bold" />,
      label: 'Color of Pages',
      value: activeColour === 'Black & White' ? 'Black & White (Monochrome Laser)' : 'Full Colour (High Quality)',
    },
    {
      icon: <SlidersHorizontal size={15} weight="bold" />,
      label: 'Format & Print Quality',
      value: `${activeSettings.paperSize || 'A4'} · Fit to Paper · Standard Laser Quality`,
    },
  ]

  return (
    <div className="rv-root">
      {/* ── Left: Document gallery (Double-Bezel) ── */}
      <div className="rv-gallery-shell">
        <div className="rv-gallery-col">
          <div className="rv-gallery-label">
            <span className="rv-gallery-dot" />
            <span>Document Preview</span>
            {isMultiFile && (
              <span className="rv-gallery-count">{multiFiles[activePreviewIdx]?.fileName}</span>
            )}
            {!isMultiFile && (
              <span className="rv-gallery-count">{pageCount} pages</span>
            )}
          </div>

          {/* Multi-file tab strip */}
          {isMultiFile && (
            <div className="rv-file-tabs">
              {multiFiles.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  className={`rv-file-tab ${i === activePreviewIdx ? 'active' : ''}`}
                  onClick={() => setActivePreviewIdx(i)}
                  title={f.fileName}
                >
                  <span className="rv-file-tab-num">{i + 1}</span>
                  <span className="rv-file-tab-name">{f.fileName}</span>
                </button>
              ))}
            </div>
          )}

          <div className="rv-gallery-stage">
            <Skeleton
              name="review-doc-pages"
              loading={docPages.length === 0}
              fallback={<ConfirmDocPagesBoneyardFallback count={4} />}
            >
              {docPages.length > 0 ? (
                <DocumentLightGallery
                  pages={docPages}
                  fileName={isMultiFile ? multiFiles[activePreviewIdx]?.fileName : fileName}
                  colorMode={activeSettings.colour}
                  duplex={activeSettings.duplex}
                  id="review-gallery-container"
                />
              ) : (
                <div className="rv-gallery-empty">
                  <File size={40} weight="duotone" />
                  <span>Preview not available</span>
                </div>
              )}
            </Skeleton>
          </div>
        </div>
      </div>

      {/* ── Right: Order summary + actions (Double-Bezel) ── */}
      <div className="rv-summary-shell">
        <div className="rv-summary-col">
          <div className="rv-summary-header">
            <h1 className="rv-title">Confirm Your Order</h1>
            <p className="rv-subtitle">Inspect print specifications before proceeding to payment.</p>
          </div>

        {/* Multi-file list (if applicable) */}
        {isMultiFile && (
          <div className="rv-multi-file-list">
            {multiFiles.map((f, i) => (
              <div
                key={f.id}
                className={`rv-mf-row ${i === activePreviewIdx ? 'active' : ''}`}
                onClick={() => setActivePreviewIdx(i)}
              >
                <span className="rv-mf-num">{i + 1}</span>
                <div className="rv-mf-info">
                  <span className="rv-mf-name">{f.fileName}</span>
                  <span className="rv-mf-meta">
                    {f.settings.colour === 'BW' ? 'B&W' : 'Colour'} ·{' '}
                    {f.settings.duplex === 'SINGLE' ? '1-Sided' : '2-Sided'} ·{' '}
                    {f.settings.copies} {f.settings.copies === 1 ? 'copy' : 'copies'}
                  </span>
                </div>
                <span className="rv-mf-pages">{f.pageCount} pgs</span>
              </div>
            ))}
          </div>
        )}

        <div className="rv-card">
          {summaryRows.map((row, i) => (
            <div className="rv-row" key={i}>
              <span className="rv-row__icon">{row.icon}</span>
              <div className="rv-row__body">
                <span className="rv-row__label">{row.label}</span>
                <span className="rv-row__value">{row.value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Price */}
        <div className="rv-price-block">
          <div className="rv-price-row">
            <span className="rv-price-label">Total amount</span>
            <div className="rv-price-amount">
              <CurrencyInr size={22} weight="bold" />
              <span>{totalPrice}</span>
            </div>
          </div>
          <p className="rv-price-note">
            All taxes included • Instant print collection
          </p>
        </div>

        {/* Actions */}
        <div className="rv-actions">
          <ShinyButton
            variant="ghost"
            className="rv-btn"
            id="review-back"
            onClick={() => navigate('/print/settings')}
            type="button"
          >
            <ArrowLeft size={15} weight="bold" className="btn-arrow btn-arrow--left" />
            <span>Back</span>
          </ShinyButton>

          <ShinyButton
            variant="primary"
            className="rv-btn rv-btn--pay-shiny"
            onClick={handlePay}
            id="review-pay-now"
            type="button"
          >
            <span className="rv-pay-text">
              {kioskSession.isKioskSession() ? `Pay on Machine · ₹${totalPrice}` : `Pay · ₹${totalPrice}`}
            </span>
            <span className="rv-pay-circle">
              <CheckCircle size={15} weight="fill" />
            </span>
          </ShinyButton>
        </div>
      </div>
    </div>
  </div>
  )
}
