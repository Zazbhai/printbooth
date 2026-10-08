import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  SlidersHorizontal,
  CornersIn,
  CornersOut,
  ArrowsOutLineHorizontal,
  ArrowsInSimple,
  Gauge,
  DeviceRotate,
  GridFour,
  Check,
  X,
  Sparkle,
  Eye,
  BoundingBox,
  ArrowsClockwise,
  Printer,
} from '@phosphor-icons/react'
import type {
  FileSettings,
  PaperSize,
  ScalingMode,
  DpiMode,
  OrientationMode,
  PagesPerSheet,
  MarginMode,
} from '../../lib/multiFileStore'
import { parsePageRange } from '../../lib/multiFileStore'
import type { DocumentPagePreview } from '../../lib/documentPreview'
import { Skeleton, SheetPreviewBoneyardFallback } from '../../components/ui/PrintBoneyardSkeleton'
import './AdvancedPrintModal.css'

export interface AdvancedPrintModalProps {
  isOpen: boolean
  onClose: () => void
  settings: FileSettings
  onChange: (patch: Partial<FileSettings>) => void
  firstPageUrl?: string | null
  realPages?: DocumentPagePreview[]
  fileName?: string
  totalPageCount?: number
}

interface PaperSpec {
  value: PaperSize
  name: string
  dimensions: string
  widthMm: number
  heightMm: number
  tag?: string
}

const PAPER_SPECS: PaperSpec[] = [
  { value: 'LEDGER', name: 'Ledger', dimensions: '279.4 × 431.8 mm', widthMm: 279.4, heightMm: 431.8, tag: 'Tabloid / 11×17' },
  { value: 'A4', name: 'A4', dimensions: '210 × 297 mm', widthMm: 210, heightMm: 297, tag: 'Standard' },
  { value: 'LETTER', name: 'Letter', dimensions: '215.9 × 279.4 mm', widthMm: 215.9, heightMm: 279.4, tag: '8.5 × 11 in' },
  { value: 'LEGAL', name: 'Legal', dimensions: '215.9 × 355.6 mm', widthMm: 215.9, heightMm: 355.6, tag: '8.5 × 14 in' },
  { value: 'A3', name: 'A3', dimensions: '297 × 420 mm', widthMm: 297, heightMm: 420, tag: 'Poster' },
  { value: 'A5', name: 'A5', dimensions: '148 × 210 mm', widthMm: 148, heightMm: 210, tag: 'Booklet' },
]

export const AdvancedPrintModal: React.FC<AdvancedPrintModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
  firstPageUrl,
  realPages,
  fileName = 'Document.pdf',
  totalPageCount = 1,
}) => {
  const [activeSheetSide, setActiveSheetSide] = useState<'front' | 'back'>('front')
  const [docNaturalRatio, setDocNaturalRatio] = useState<number | null>(null)

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const activePaperSize: PaperSize = settings.paperSize || 'A4'
  const activeScaling: ScalingMode = settings.scaling || 'FIT'
  const customScalePercent: number = settings.customScalePercent || 100
  const activeDpi: DpiMode = settings.dpi || '600'
  const activeOrientation: OrientationMode = settings.orientation || 'AUTO'
  const activeNUp: PagesPerSheet = settings.pagesPerSheet || 1
  const activeMargins: MarginMode = settings.margins || 'STANDARD'
  const pageBorder: boolean = Boolean(settings.pageBorder)
  const isBW = settings.colour === 'BW'
  const isDuplex = settings.duplex === 'DOUBLE'

  // Selected page indices parsed from settings.pages (e.g. '1-3, 5' or 'ALL')
  const selectedPageNumbers = useMemo(() => {
    return parsePageRange(settings.pages || 'ALL', totalPageCount)
  }, [settings.pages, totalPageCount])

  // Detect whether document pages are naturally Landscape or Portrait
  const isDocLandscape = useMemo(() => {
    if (docNaturalRatio !== null) {
      return docNaturalRatio > 1.05
    }
    if (realPages && realPages[0] && realPages[0].width && realPages[0].height) {
      return realPages[0].width > realPages[0].height
    }
    return false
  }, [docNaturalRatio, realPages])

  // Determine effective paper sheet orientation
  // In AUTO mode, 2-Up & 6-Up of portrait pages flip the sheet to Landscape (matching Acrobat / Windows GDI spooler)
  const isLandscape = useMemo(() => {
    if (activeOrientation === 'LANDSCAPE') return true
    if (activeOrientation === 'PORTRAIT') return false
    // AUTO mode:
    if (activeNUp === 2 || activeNUp === 6) {
      return !isDocLandscape
    }
    return isDocLandscape
  }, [activeOrientation, activeNUp, isDocLandscape])

  // Physical aspect ratio calculation for paper sheet preview
  const currentPaperSpec = useMemo(() => {
    return PAPER_SPECS.find(p => p.value === activePaperSize) || PAPER_SPECS[1] // A4 fallback
  }, [activePaperSize])

  const paperRatio = useMemo(() => {
    const base = currentPaperSpec.widthMm / currentPaperSpec.heightMm
    return isLandscape ? 1 / base : base
  }, [currentPaperSpec, isLandscape])

  // Margin percentage around the physical paper
  // Calibrated to exact hardware print engine insets: 3.5% STANDARD (~7.5mm), 1.5% MINIMAL (~3.2mm), 0% BORDERLESS
  const marginPadding = useMemo(() => {
    if (activeMargins === 'BORDERLESS') return '0%'
    if (activeMargins === 'MINIMAL') return '1.5%'
    return '3.5%'
  }, [activeMargins])

  // Scale transform applied directly to document page image inside slot
  const pageImageStyle = useMemo<React.CSSProperties>(() => {
    if (activeScaling === 'STRETCH') {
      return {
        width: '100%',
        height: '100%',
        objectFit: 'fill',
        borderRadius: 2,
      }
    }
    if (activeScaling === 'ACTUAL') {
      return {
        maxWidth: '100%',
        maxHeight: '100%',
        width: 'auto',
        height: 'auto',
        objectFit: 'scale-down',
        borderRadius: 2,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
      }
    }
    if (activeScaling === 'SHRINK_OVERSIZED') {
      return {
        maxWidth: '100%',
        maxHeight: '100%',
        width: 'auto',
        height: 'auto',
        objectFit: 'scale-down',
        borderRadius: 2,
      }
    }
    if (activeScaling === 'CUSTOM') {
      return {
        maxWidth: 'none',
        maxHeight: 'none',
        width: `${customScalePercent}%`,
        height: `${customScalePercent}%`,
        objectFit: 'contain',
        transition: 'width 0.15s ease, height 0.15s ease',
        borderRadius: 2,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
      }
    }
    // FIT (Default: Proportional safety fit inside printable margins)
    return {
      maxWidth: '100%',
      maxHeight: '100%',
      width: 'auto',
      height: 'auto',
      objectFit: 'contain',
      borderRadius: 2,
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
    }
  }, [activeScaling, customScalePercent])

  // Real print texture and ink simulation
  const printInkFilter = useMemo(() => {
    if (isBW) {
      return 'grayscale(100%) contrast(114%) brightness(98%)'
    }
    return 'contrast(102%) saturate(105%)'
  }, [isBW])

  const scalingOptions: {
    value: ScalingMode
    label: string
    sub: string
    icon: typeof CornersIn
  }[] = [
    {
      value: 'FIT',
      label: 'Fit to printable area',
      sub: 'Proportional safety fit inside margins',
      icon: CornersIn,
    },
    {
      value: 'STRETCH',
      label: 'Fit to paper',
      sub: 'Edge-to-edge full paper coverage',
      icon: ArrowsOutLineHorizontal,
    },
    {
      value: 'ACTUAL',
      label: 'Actual size',
      sub: '1:1 True 100% document scale',
      icon: ArrowsInSimple,
    },
    {
      value: 'CUSTOM',
      label: 'Custom scale (%)',
      sub: `Current: ${customScalePercent}%`,
      icon: CornersOut,
    },
  ]

  const dpiOptions: {
    value: DpiMode
    label: string
    badge: string
    desc: string
  }[] = [
    {
      value: '150',
      label: '150 DPI',
      badge: 'Draft',
      desc: 'Eco ink saver & ultra-fast print cycle',
    },
    {
      value: '300',
      label: '300 DPI',
      badge: 'Normal',
      desc: 'Standard clean xerox for general reading',
    },
    {
      value: '600',
      label: '600 DPI',
      badge: 'High',
      desc: 'Sharp text, fine line-art & technical diagrams',
    },
    {
      value: '1200',
      label: '1200 DPI',
      badge: 'Ultra High',
      desc: 'Photo-grade glossy presentation finish',
    },
  ]

  const nUpOptions: {
    value: PagesPerSheet
    label: string
    tag: string
    gridClass: string
    cols: number
    rows: number
  }[] = [
    { value: 1, label: '1', tag: '1 Page / Sheet (Full Page)', gridClass: 'apm-nup-grid--1', cols: 1, rows: 1 },
    { value: 2, label: '2', tag: '2 Pages / Sheet (Save 50% Paper)', gridClass: 'apm-nup-grid--2', cols: 2, rows: 1 },
    { value: 4, label: '4', tag: '4 Pages / Sheet (2×2 Grid)', gridClass: 'apm-nup-grid--4', cols: 2, rows: 2 },
    { value: 6, label: '6', tag: '6 Pages / Sheet (3×2 Grid)', gridClass: 'apm-nup-grid--6', cols: 3, rows: 2 },
    { value: 9, label: '9', tag: '9 Pages / Sheet (3×3 Grid)', gridClass: 'apm-nup-grid--9', cols: 3, rows: 3 },
    { value: 16, label: '16', tag: '16 Pages / Sheet (Thumbnails)', gridClass: 'apm-nup-grid--16', cols: 4, rows: 4 },
  ]

  const orientationOptions: {
    value: OrientationMode
    label: string
  }[] = [
    { value: 'AUTO', label: 'Auto' },
    { value: 'PORTRAIT', label: 'Portrait' },
    { value: 'LANDSCAPE', label: 'Landscape' },
  ]

  const marginOptions: {
    value: MarginMode
    label: string
    desc: string
  }[] = [
    { value: 'STANDARD', label: 'Standard (5mm)', desc: 'Hardware safe printable margin' },
    { value: 'MINIMAL', label: 'Minimal (2.5mm)', desc: 'Narrow margin for max area' },
    { value: 'BORDERLESS', label: 'Borderless (0mm)', desc: 'Full bleed edge-to-edge' },
  ]

  // Render a simulated or real page item inside N-Up grid
  const renderPageItem = (index: number) => {
    const pageSlotIndex = (activeSheetSide === 'front' ? 0 : activeNUp) + index
    const isSlotEmpty = pageSlotIndex >= selectedPageNumbers.length
    const pageNum = selectedPageNumbers[pageSlotIndex]

    if (isSlotEmpty) {
      return (
        <div
          key={index}
          className="apm-page-slot apm-page-slot--empty"
        >
          <div className="apm-empty-slot-guide">
            <span>Blank Slot</span>
          </div>
        </div>
      )
    }

    // Load actual preview image for this page from realPages, or fallback to firstPageUrl
    const pagePreviewUrl =
      realPages?.find(p => p.pageNumber === pageNum)?.url ||
      (pageNum === 1 ? firstPageUrl : null)

    return (
      <div
        key={index}
        className={`apm-page-slot ${pageBorder ? 'apm-page-slot--bordered' : ''}`}
        style={{
          filter: printInkFilter,
        }}
      >
        {pagePreviewUrl ? (
          <div className="apm-page-img-wrapper">
            <img
              src={pagePreviewUrl}
              alt={`Printed Page ${pageNum}`}
              className="apm-preview-img"
              style={pageImageStyle}
              onLoad={e => {
                if (index === 0 && docNaturalRatio === null) {
                  const nw = e.currentTarget.naturalWidth
                  const nh = e.currentTarget.naturalHeight
                  if (nw > 0 && nh > 0) {
                    setDocNaturalRatio(nw / nh)
                  }
                }
              }}
            />
            <div className="apm-page-tag">P.{pageNum}</div>
          </div>
        ) : (
          <div className="apm-mock-doc pb-boneyard-bone" style={pageImageStyle}>
            <div className="apm-mock-header">
              <div className="apm-mock-title-bar pb-boneyard-bone" />
              <div className="apm-mock-badge">P.{pageNum}</div>
            </div>
            <div className="apm-mock-lines">
              <div className="apm-mock-line w-90 pb-boneyard-bone" />
              <div className="apm-mock-line w-75 pb-boneyard-bone" />
              <div className="apm-mock-line w-85 pb-boneyard-bone" />
            </div>
            <div className="apm-mock-visual-box pb-boneyard-bone" />
            <div className="apm-mock-lines">
              <div className="apm-mock-line w-100 pb-boneyard-bone" />
              <div className="apm-mock-line w-60 pb-boneyard-bone" />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="apm-portal" role="dialog" aria-modal="true" aria-label="Advanced Print Configuration">
          {/* Frosted Backdrop */}
          <motion.div
            className="apm-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Modal Card */}
          <motion.div
            className="apm-modal-card"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="apm-header">
              <div className="apm-header__left">
                <div className="apm-header__icon-badge">
                  <SlidersHorizontal size={18} weight="bold" />
                </div>
                <div>
                  <h3 className="apm-header__title">Advanced Print Configuration</h3>
                  <p className="apm-header__sub">
                    Live Hardware Precision & Realistic Printed Sheet Simulator
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="apm-close-btn"
                onClick={onClose}
                aria-label="Close settings popup"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {/* Split Body: Left = Live Sheet Preview, Right = Setting Controls */}
            <div className="apm-body">
              {/* ── Left Column: Live Physical Sheet Simulator ── */}
              <div className="apm-preview-col">
                <div className="apm-preview-top-bar">
                  <div className="apm-preview-label">
                    <Eye size={14} weight="bold" />
                    <span>Real Printed Output</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isDuplex && (
                      <button
                        type="button"
                        onClick={() => setActiveSheetSide(prev => prev === 'front' ? 'back' : 'front')}
                        className="apm-flip-btn"
                        title="Flip to inspect back of sheet"
                      >
                        <ArrowsClockwise size={12} weight="bold" />
                        <span>Flip ({activeSheetSide === 'front' ? 'Side 1' : 'Side 2'})</span>
                      </button>
                    )}
                    <span className={`apm-dpi-watermark apm-dpi-watermark--${activeDpi}`}>
                      <Gauge size={12} weight="bold" />
                      <span>{activeDpi} DPI</span>
                    </span>
                  </div>
                </div>

                {/* The Physical Sheet of Paper Simulation */}
                <div className="apm-stage-container">
                  <div
                    className={`apm-paper-sheet ${isLandscape ? 'apm-paper-sheet--landscape' : 'apm-paper-sheet--portrait'} ${activeDpi === '150' ? 'apm-paper-sheet--draft-dpi' : ''} ${activeDpi === '1200' ? 'apm-paper-sheet--photo-dpi' : ''}`}
                    style={{
                      aspectRatio: `${paperRatio}`,
                    }}
                  >
                    {/* Halftone / DPI texture overlay for realistic print raster */}
                    {activeDpi === '150' && <div className="apm-dpi-halftone-overlay" title="150 DPI Draft Dot Raster" />}
                    {activeDpi === '1200' && <div className="apm-dpi-gloss-overlay" title="1200 DPI Photo Gloss Sheen" />}

                    {/* Printable Safe Margins Area */}
                    <Skeleton
                      name="apm-printable-sheet-preview"
                      loading={!firstPageUrl}
                      animate="shimmer"
                      fallback={
                        <div
                          className={`apm-printable-zone ${
                            activeMargins === 'BORDERLESS' ? 'borderless' : ''
                          }`}
                          style={{ padding: marginPadding, width: '100%', height: '100%' }}
                        >
                          <SheetPreviewBoneyardFallback />
                        </div>
                      }
                    >
                      <div
                        className={`apm-printable-zone ${
                          activeMargins === 'BORDERLESS' ? 'borderless' : ''
                        }`}
                        style={{ padding: marginPadding }}
                      >
                        {/* N-Up Layout Grid */}
                        <div
                          className={`apm-nup-grid apm-nup-grid--${activeNUp}`}
                        >
                          {Array.from({ length: activeNUp }).map((_, idx) =>
                            renderPageItem(idx)
                          )}
                        </div>
                      </div>
                    </Skeleton>

                    {/* Corner Paper Fold Accent */}
                    <div className="apm-paper-corner-fold" />
                  </div>
                </div>

                {/* Physical Dimensions Banner */}
                <div className="apm-sheet-dimensions-bar">
                  <Printer size={13} weight="fill" />
                  <span>
                    Sheet: <strong>{currentPaperSpec.name}</strong> · {currentPaperSpec.dimensions} ({isLandscape ? 'Landscape' : 'Portrait'})
                  </span>
                </div>

                {/* Simulation Meta Caption */}
                <div className="apm-preview-caption">
                  <div className="apm-preview-chips">
                    <span className="apm-chip-pill">{activePaperSize}</span>
                    <span className="apm-chip-pill">{activeNUp === 1 ? '1-Up (Single)' : `${activeNUp} Pages / Sheet`}</span>
                    <span className="apm-chip-pill">
                      {activeScaling === 'FIT'
                        ? 'Fit to printable area'
                        : activeScaling === 'STRETCH'
                        ? 'Fit to paper'
                        : activeScaling === 'ACTUAL'
                        ? 'Actual size (100%)'
                        : `Custom (${customScalePercent}%)`}
                    </span>
                    <span className="apm-chip-pill">{activeDpi} DPI</span>
                    <span className="apm-chip-pill">{isBW ? 'Black & White' : 'Full Colour'}</span>
                    {activeMargins === 'BORDERLESS' && (
                      <span className="apm-chip-pill apm-chip-pill--highlight">Borderless Bleed</span>
                    )}
                  </div>
                  <span className="apm-preview-docname">
                    Showing {activeSheetSide === 'front' ? 'front' : 'back'} side of {fileName} ({totalPageCount} {totalPageCount === 1 ? 'page' : 'pages'} total)
                  </span>
                </div>
              </div>

              {/* ── Right Column: Hardware Controls ── */}
              <div className="apm-controls-col">
                {/* ── Match Given Settings Dropdown Panel (From User Screenshot) ── */}
                <div className="apm-quick-dropdowns-card">
                  <div className="apm-quick-dropdowns-header">
                    <span className="apm-quick-dropdowns-title">Print Options & Format</span>
                    <span className="apm-quick-dropdowns-hint">Quick configuration</span>
                  </div>

                  {/* 1. Paper size dropdown */}
                  <div className="apm-form-group">
                    <label className="apm-form-label" htmlFor="apm-paper-size-select">
                      Paper size
                    </label>
                    <select
                      id="apm-paper-size-select"
                      className="apm-dropdown-select"
                      value={activePaperSize}
                      onChange={e => onChange({ paperSize: e.target.value as PaperSize })}
                    >
                      {PAPER_SPECS.map(p => (
                        <option key={p.value} value={p.value}>
                          {p.name} ({p.dimensions})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Pages per sheet dropdown */}
                  <div className="apm-form-group">
                    <label className="apm-form-label" htmlFor="apm-pages-per-sheet-select">
                      Pages per sheet
                    </label>
                    <select
                      id="apm-pages-per-sheet-select"
                      className="apm-dropdown-select"
                      value={activeNUp}
                      onChange={e => onChange({ pagesPerSheet: Number(e.target.value) as PagesPerSheet })}
                    >
                      {nUpOptions.map(n => (
                        <option key={n.value} value={n.value}>
                          {n.value} {n.value === 1 ? '' : `(${n.value} pages on 1 sheet)`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 3. Scale dropdown */}
                  <div className="apm-form-group">
                    <label className="apm-form-label" htmlFor="apm-scale-select">
                      Scale
                    </label>
                    <select
                      id="apm-scale-select"
                      className="apm-dropdown-select"
                      value={activeScaling}
                      onChange={e => onChange({ scaling: e.target.value as ScalingMode })}
                    >
                      {scalingOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Custom Scale Percentage Slider */}
                  {activeScaling === 'CUSTOM' && (
                    <div className="apm-custom-scale-row">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Scaling Factor</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', fontFamily: 'monospace' }}>
                          {customScalePercent}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={200}
                        step={5}
                        value={customScalePercent}
                        onChange={e => onChange({ customScalePercent: Number(e.target.value) })}
                        className="apm-slider-input"
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
                        <span>50% (Shrink)</span>
                        <span>100% (Normal)</span>
                        <span>200% (Enlarge)</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Print Resolution (DPI) Selection ── */}
                <div className="apm-section">
                  <div className="apm-section__header">
                    <span className="apm-section__title">
                      <Gauge size={14} weight="bold" />
                      <span>Print Resolution (DPI)</span>
                    </span>
                    <span className="apm-section__hint">Hardware nozzle density</span>
                  </div>
                  <div className="apm-grid-4col">
                    {dpiOptions.map(opt => {
                      const isSelected = activeDpi === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`apm-tile apm-tile--compact ${isSelected ? 'selected' : ''}`}
                          onClick={() => onChange({ dpi: opt.value })}
                        >
                          <div className="apm-tile__head-row">
                            <span className="apm-tile__title">{opt.label}</span>
                            <span className={`apm-badge-chip ${opt.value === '600' ? 'green' : opt.value === '1200' ? 'purple' : ''}`}>
                              {opt.badge}
                            </span>
                          </div>
                          <span className="apm-tile__desc">{opt.desc}</span>
                          {isSelected && (
                            <span className="apm-tile__check">
                              <Check size={11} weight="bold" />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* ── Orientation & Layout Row ── */}
                <div className="apm-split-row">
                  {/* Orientation */}
                  <div className="apm-split-item">
                    <div className="apm-section__header">
                      <span className="apm-section__title">
                        <DeviceRotate size={13} weight="bold" />
                        <span>Orientation</span>
                      </span>
                    </div>
                    <div className="apm-segmented-bar">
                      {orientationOptions.map(opt => {
                        const isSelected = activeOrientation === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            className={`apm-segmented-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => onChange({ orientation: opt.value })}
                          >
                            <span>{opt.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Page Border Treatment */}
                  <div className="apm-split-item">
                    <div className="apm-section__header">
                      <span className="apm-section__title">
                        <GridFour size={13} weight="bold" />
                        <span>Page Border</span>
                      </span>
                    </div>
                    <div className="apm-segmented-bar">
                      <button
                        type="button"
                        className={`apm-segmented-item ${!pageBorder ? 'selected' : ''}`}
                        onClick={() => onChange({ pageBorder: false })}
                      >
                        <span>None</span>
                      </button>
                      <button
                        type="button"
                        className={`apm-segmented-item ${pageBorder ? 'selected' : ''}`}
                        onClick={() => onChange({ pageBorder: true })}
                      >
                        <span>Thin Border</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Printable Margins & Bleed ── */}
                <div className="apm-section">
                  <div className="apm-section__header">
                    <span className="apm-section__title">
                      <BoundingBox size={14} weight="bold" />
                      <span>Print Margins & Edge Bleed</span>
                    </span>
                    <span className="apm-section__hint">Safe area boundaries</span>
                  </div>
                  <div className="apm-grid-3col">
                    {marginOptions.map(opt => {
                      const isSelected = activeMargins === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`apm-tile apm-tile--compact ${isSelected ? 'selected' : ''}`}
                          onClick={() => onChange({ margins: opt.value })}
                        >
                          <span className="apm-tile__title">{opt.label}</span>
                          <span className="apm-tile__desc">{opt.desc}</span>
                          {isSelected && (
                            <span className="apm-tile__check">
                              <Check size={11} weight="bold" />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="apm-footer">
              <div className="apm-footer__summary">
                <span className="apm-footer__badge">
                  <Sparkle size={12} weight="fill" />
                  <span>Configured:</span>
                </span>
                <span className="apm-footer__text">
                  {currentPaperSpec.name} ({currentPaperSpec.dimensions}) · {activeDpi} DPI · {activeNUp}pg/sheet · {activeScaling === 'FIT' ? 'Fit to printable area' : activeScaling === 'STRETCH' ? 'Fit to paper' : activeScaling === 'ACTUAL' ? 'Actual size' : `${customScalePercent}% scale`} · {activeMargins}
                </span>
              </div>

              <button
                type="button"
                className="apm-apply-btn"
                onClick={onClose}
              >
                <span>Apply Settings</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
