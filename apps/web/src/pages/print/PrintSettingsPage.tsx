import { useState, useEffect, useMemo, useCallback } from 'react'
import { usePrintNavigate as useNavigate, usePrintFlow } from './PrintFlowContext'
import { ArrowRight, FileText, MapPin, Files } from 'lucide-react'
import { Warning, Receipt } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import {
  MorphingPopover,
  MorphingPopoverTrigger,
  MorphingPopoverContent,
  MorphingPopoverClose,
} from '../../components/ui/morphing-popover'
import { MinimalCarousel, type CarouselCard } from '../../components/watermelon/minimal-carousel'
import {
  AnimatedPaperIcon,
  AnimatedColourIcon,
  AnimatedCopiesIcon,
  AnimatedSidesIcon,
} from '../../components/watermelon/CardAnimatedIcons'
import { CustomPagesSlider } from '../../components/watermelon/CustomPagesSlider'
import { CustomCopiesControl } from '../../components/watermelon/CustomCopiesControl'
import { CustomColourControl } from '../../components/watermelon/CustomColourControl'
import { ShinyButton } from '../../components/ui/ShinyButton'
import { ClearDocumentModal } from '../../components/ui/ClearDocumentModal'
import RubberSegment from '../../components/ui/RubberSegment'
import { Skeleton, PrintSettingsBoneyardFallback } from '../../components/ui/PrintBoneyardSkeleton'
import {
  getAllFiles,
  getActiveFileId,
  setActiveFile,
  updateFileSettings,
  clearAllFiles,
  persistAllFilesToSession,
  computeTotalPrice,
  parsePageRange,
  calcFileTotalSheets,
  calcFileTotalPrice,
  getKioskPricing,
  getKioskVariant,
  hasAnyReadyFile,
  type ManagedFile,
  type FileSettings,
} from '../../lib/multiFileStore'
import { clearUploadedDoc, hasRealUploadedDoc } from '../../lib/documentStore'
import { kioskSession } from '../../lib/kioskSession'
import './PrintSettingsPage.css'

type ColourMode = 'BW' | 'COLOUR'
type DuplexMode = 'SINGLE' | 'DOUBLE'

export default function PrintSettingsPage() {
  const navigate = useNavigate()
  const flow = usePrintFlow()
  const kioskName = sessionStorage.getItem('pb_kiosk_name') ?? 'PrintBooth — MIT ADT'
  const [showClearModal, setShowClearModal] = useState(false)

  const kioskPricing = getKioskPricing()
  const prices = useMemo(() => ({
    BW_SINGLE: kioskPricing.bwSingle,
    BW_DOUBLE: kioskPricing.bwDouble,
    COLOUR_SINGLE: kioskPricing.colorSingle,
    COLOUR_DOUBLE: kioskPricing.colorDouble,
  }), [kioskPricing.bwSingle, kioskPricing.bwDouble, kioskPricing.colorSingle, kioskPricing.colorDouble])

  const calcPricePerPage = (colour: ColourMode, duplex: DuplexMode): number => {
    if (colour === 'BW' && duplex === 'SINGLE') return prices.BW_SINGLE
    if (colour === 'BW' && duplex === 'DOUBLE') return prices.BW_DOUBLE
    if (colour === 'COLOUR' && duplex === 'SINGLE') return prices.COLOUR_SINGLE
    return prices.COLOUR_DOUBLE
  }

  // Multi-file state
  const [files, setFiles] = useState<ManagedFile[]>(() => getAllFiles().filter(f => f.status === 'ready'))
  const [activeId, setActiveId] = useState<string | null>(() => getActiveFileId())

  // Ensure state sync if files is empty on mount but ready files exist
  useEffect(() => {
    if (files.length === 0) {
      const ready = getAllFiles().filter(f => f.status === 'ready')
      if (ready.length > 0) {
        setFiles(ready)
        setActiveId(getActiveFileId() || ready[0].id)
      }
    }
  }, [files.length])

  // Sync on store events
  useEffect(() => {
    const sync = () => {
      const ready = getAllFiles().filter(f => f.status === 'ready')
      setFiles([...ready])
      setActiveId(getActiveFileId())
    }
    window.addEventListener('printbooth:multifile-change', sync)
    return () => window.removeEventListener('printbooth:multifile-change', sync)
  }, [])

  useEffect(() => {
    // Redirect to upload only if truly no active document exists in memory or session
    const hasFiles =
      hasRealUploadedDoc() ||
      hasAnyReadyFile() ||
      files.length > 0 ||
      Boolean(typeof window !== 'undefined' && (sessionStorage.getItem('pb_files') || sessionStorage.getItem('pb_file_name')))
    if (!hasFiles) {
      navigate('/print/upload', { replace: true })
    }
  }, [files.length, navigate])

  // Local fallback settings state if no activeFile in multiFileStore (single-file flow)
  const [localSettings, setLocalSettings] = useState<FileSettings>(() => {
    const raw = sessionStorage.getItem('pb_settings')
    if (raw) {
      try {
        return JSON.parse(raw)
      } catch {}
    }
    return {
      pages: 'ALL',
      copies: 1,
      colour: 'BW',
      duplex: 'SINGLE',
      paperSize: 'A4',
      scaling: 'FIT',
      dpi: '600',
      orientation: 'AUTO',
      pagesPerSheet: 1,
      margins: 'STANDARD',
      contrastMode: 'BALANCED',
    }
  })

  const activeFile = files.find(f => f.id === activeId) ?? files[0] ?? null
  const settings: FileSettings = activeFile?.settings ?? localSettings

  // For legacy single-file fallback
  const legacyFileName = sessionStorage.getItem('pb_file_name') || ''
  const displayFileName = activeFile?.fileName || legacyFileName

  const kioskVariant = getKioskVariant()
  const isLite = kioskVariant === 'lite'

  // Start with colour card active for pro, pages for lite
  const [activeCardId, setActiveCardId] = useState<string | null>(isLite ? 'gxuri' : 'spending')

  const patchSettings = useCallback((patch: Partial<FileSettings>) => {
    if (activeFile) {
      updateFileSettings(activeFile.id, patch)
      // Force local re-render
      setFiles(prev =>
        prev.map(f =>
          f.id === activeFile.id ? { ...f, settings: { ...f.settings, ...patch } } : f
        )
      )
    } else {
      setLocalSettings(prev => {
        const next = { ...prev, ...patch }
        sessionStorage.setItem('pb_settings', JSON.stringify(next))
        return next
      })
    }
  }, [activeFile?.id])

  // Enforce pure B&W if connected to PrintBooth Lite
  useEffect(() => {
    if (isLite && settings.colour !== 'BW') {
      patchSettings({ colour: 'BW', pageColours: undefined })
    }
  }, [isLite, settings.colour, patchSettings])

  const realPageCount = activeFile?.pageCount || Number(sessionStorage.getItem('pb_page_count')) || 1

  const selectedPagesList = useMemo(() => {
    return parsePageRange(settings.pages, realPageCount)
  }, [settings.pages, realPageCount])

  const pageCount = selectedPagesList.length

  const fileSegmentItems = useMemo(() => {
    return files.map((f, i) => ({
      value: f.id,
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: '10px',
            fontWeight: 800,
            background: 'rgba(0,0,0,0.12)',
            borderRadius: '4px',
            width: '16px',
            height: '16px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>{i + 1}</span>
          <span>{f.fileName.length > 14 ? f.fileName.slice(0, 12) + '…' : f.fileName}</span>
        </span>
      ),
    }))
  }, [files])

  const totalPagePrints = useMemo(() => {
    if (settings.pageCopies && Object.keys(settings.pageCopies).length > 0) {
      return selectedPagesList.reduce((sum, p) => {
        const c = Number(settings.pageCopies?.[String(p)]) || settings.copies || 1
        return sum + Math.max(1, c)
      }, 0)
    }
    return selectedPagesList.length * Math.max(1, settings.copies)
  }, [selectedPagesList, settings.pageCopies, settings.copies])

  const isCustomColour = selectedPagesList.length > 1 && Boolean(settings.pageColours && Object.keys(settings.pageColours).length > 0)

  const colourCardValue = useMemo(() => {
    if (isCustomColour && settings.pageColours) {
      let col = 0
      let mono = 0
      selectedPagesList.forEach(p => {
        const mode = settings.pageColours?.[String(p)] ?? settings.colour ?? 'BW'
        if (mode === 'COLOUR') col++
        else mono++
      })
      return `Custom (${col} Col, ${mono} B&W)`
    }
    return settings.colour === 'BW' ? `B&W · ₹${prices.BW_SINGLE}/pg` : `Colour · ₹${prices.COLOUR_SINGLE}/pg`
  }, [isCustomColour, settings.pageColours, settings.colour, selectedPagesList, prices])

  const totalSheets = activeFile
    ? calcFileTotalSheets(activeFile)
    : (settings.duplex === 'DOUBLE'
        ? Math.max(1, Math.ceil(Math.ceil(totalPagePrints / (settings.pagesPerSheet || 1)) / 2))
        : Math.max(1, Math.ceil(totalPagePrints / (settings.pagesPerSheet || 1))))

  const pricePerPage = calcPricePerPage(settings.colour as ColourMode, settings.duplex as DuplexMode)
  const fileTotalPrice = activeFile
    ? calcFileTotalPrice(activeFile)
    : totalSheets * pricePerPage

  // Grand total across all ready files
  const grandTotal = files.length > 1 ? computeTotalPrice() : fileTotalPrice

  // Report configuring settings to kiosk screen companion in real-time
  useEffect(() => {
    if (kioskSession.isKioskSession()) {
      kioskSession.reportConfiguring({
        fileName: displayFileName,
        totalPages: pageCount,
        copies: settings.copies,
        colourMode: settings.colour,
        duplex: settings.duplex,
        amount: grandTotal,
      })
    }
  }, [displayFileName, pageCount, settings.copies, settings.colour, settings.duplex, grandTotal])

  // Carousel Cards with interactive in-card editing
  const ALL_CARDS: CarouselCard[] = [
    {
      id: 'gxuri',
      title: 'Pages',
      value: settings.pages === 'ALL' || realPageCount <= 1
        ? `All (${realPageCount} ${realPageCount === 1 ? 'Page' : 'Pgs'})`
        : settings.pages === '1'
        ? 'First Page'
        : `Pages ${settings.pages} (${selectedPagesList.length} pgs)`,
      color: 'card-theme-pages',
      icon: AnimatedPaperIcon,
      fullWidthActions: true,
      renderActions: () => (
        <CustomPagesSlider
          totalPages={realPageCount}
          value={settings.pages}
          onChange={(newVal) => patchSettings({ pages: newVal })}
        />
      ),
    },
    {
      id: 'savings',
      title: 'Copies',
      value: settings.pageCopies && Object.keys(settings.pageCopies).length > 0
        ? `Custom (${totalPagePrints} total)`
        : `${settings.copies} ${settings.copies === 1 ? 'Copy' : 'Copies'}`,
      color: 'card-theme-copies',
      icon: AnimatedCopiesIcon,
      fullWidthActions: true,
      renderActions: () => (
        <CustomCopiesControl
          selectedPages={selectedPagesList}
          globalCopies={settings.copies}
          pageCopies={settings.pageCopies}
          onGlobalCopiesChange={(newVal) => patchSettings({ copies: newVal })}
          onPageCopiesChange={(newMap) => patchSettings({ pageCopies: newMap })}
        />
      ),
    },
    {
      id: 'yield',
      title: 'Sides',
      value: settings.duplex === 'SINGLE' ? 'Single-Sided' : 'Double-Sided',
      color: 'card-theme-sides',
      icon: AnimatedSidesIcon,
      renderActions: () => (
        <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          <RubberSegment
            items={[
              { value: 'SINGLE', label: 'Single' },
              { value: 'DOUBLE', label: 'Double' },
            ]}
            value={settings.duplex}
            onChange={(val) => patchSettings({ duplex: val as DuplexMode })}
            trackColor="rgba(15, 23, 42, 0.05)"
            thumbColor="#dc2626"
            textColor="#475569"
            activeTextColor="#ffffff"
            size="sm"
            radius={9999}
            inset={3}
            equalSlots
            stretch={85}
            squash={3}
            speed={1.15}
          />
        </div>
      ),
    },
    {
      id: 'spending',
      title: 'Colour',
      value: colourCardValue,
      color: 'card-theme-colour',
      icon: AnimatedColourIcon,
      fullWidthActions: true,
      renderActions: () => (
        <CustomColourControl
          selectedPages={selectedPagesList}
          globalColour={settings.colour}
          pageColours={settings.pageColours}
          onGlobalColourChange={(newVal) => patchSettings({ colour: newVal })}
          onPageColoursChange={(newMap) => patchSettings({ pageColours: newMap })}
        />
      ),
    },
  ]

  // For Lite kiosks, remove colour setting options completely
  const CARDS: CarouselCard[] = isLite
    ? ALL_CARDS.filter(c => c.id !== 'spending')
    : ALL_CARDS

  function handleContinue() {
    // Persist all per-file settings + grand total
    persistAllFilesToSession()
    // Legacy single-file session keys for ConfirmPage
    if (activeFile) {
      sessionStorage.setItem('pb_file_name', activeFile.fileName)
      sessionStorage.setItem('pb_page_count', String(pageCount))
      sessionStorage.setItem('pb_settings', JSON.stringify({ ...settings, scaling: 'FIT', paperSize: 'A4' }))
    } else {
      sessionStorage.setItem('pb_settings', JSON.stringify({ ...localSettings, scaling: 'FIT', paperSize: 'A4' }))
    }
    sessionStorage.setItem('pb_total_price', String(grandTotal))

    if (kioskSession.isKioskSession()) {
      kioskSession.reportPaying({
        fileName: displayFileName,
        totalPages: pageCount,
        copies: settings.copies,
        colourMode: settings.colour,
        duplex: settings.duplex,
        amount: grandTotal,
      })
      sessionStorage.setItem('pb_print_step', 'payment')
      if (flow?.goToStep) {
        flow.goToStep('payment')
      } else {
        navigate('/print/payment')
      }
      return
    }

    sessionStorage.setItem('pb_confirm_mode', 'final')
    sessionStorage.setItem('pb_print_step', 'confirm')

    if (flow?.goToStep) {
      flow.goToStep('confirm')
    } else {
      navigate('/print/confirm')
    }
  }

  return (
    <div className="clean-settings-container">
      {/* Header */}
      <div className="clean-header">
        {kioskSession.isKioskSession() && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(22, 163, 74, 0.08)',
            border: '1px solid rgba(22, 163, 74, 0.22)',
            color: '#16a34a',
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 10,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', boxShadow: '0 0 6px #16a34a' }} />
            <span>Mirrored on Kiosk Display ({flow?.printerId || 'Station'}) • Zero-Touch</span>
          </div>
        )}
        <h1 className="clean-title">Print Settings</h1>
        <div className="clean-subtitle">
          <span className="subtitle-item">
            <FileText size={13} className="subtitle-icon" />
            <span>{displayFileName}</span>
            <MorphingPopover>
              <MorphingPopoverTrigger asChild>
                <button
                  type="button"
                  className="settings-change-file-btn"
                  title="Clear & Upload different document"
                >
                  <motion.span layoutId="change-doc-btn-label" layout="position">
                    (Change)
                  </motion.span>
                </button>
              </MorphingPopoverTrigger>
              <MorphingPopoverContent className="theme-crimson align-start">
                <div className="change-doc-popover-content">
                  <div className="change-doc-popover-header">
                    <Warning size={19} weight="fill" className="change-doc-warn-icon" />
                    <motion.h4
                      layoutId="change-doc-btn-label"
                      layout="position"
                      className="change-doc-title"
                    >
                      Change Document?
                    </motion.h4>
                  </div>
                  <p className="change-doc-desc">
                    Going back to upload will clear your currently selected document and settings.
                  </p>
                  <div className="change-doc-actions">
                    <MorphingPopoverClose asChild>
                      <button type="button" className="change-doc-cancel-btn">
                        Stay
                      </button>
                    </MorphingPopoverClose>
                    <button
                      type="button"
                      className="change-doc-confirm-btn"
                      onClick={() => {
                        clearUploadedDoc()
                        clearAllFiles()
                        navigate('/print/upload')
                      }}
                    >
                      Clear & Upload
                    </button>
                  </div>
                </div>
              </MorphingPopoverContent>
            </MorphingPopover>
          </span>
          <span className="subtitle-separator">·</span>
          <span className="subtitle-item">
            <MapPin size={13} className="subtitle-icon" />
            <span>{kioskName}</span>
          </span>
          {isLite && (
            <>
              <span className="subtitle-separator">·</span>
              <span className="subtitle-item pb-lite-tag" style={{
                background: 'rgba(100, 116, 139, 0.1)',
                color: '#475569',
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
              }}>
                PrintBooth Lite · B&amp;W Only
              </span>
            </>
          )}
        </div>
      </div>

      {/* Multi-file tab selector with Rubber Motion */}
      {files.length > 1 && (
        <div className="mfs-file-tabs">
          <div className="mfs-file-tabs-label">
            <Files size={13} />
            <span>Customizing file:</span>
          </div>
          <div className="mfs-file-tabs-scroll" style={{ overflowX: 'auto', padding: '2px 0' }}>
            <RubberSegment
              items={fileSegmentItems}
              value={activeFile?.id || activeId || undefined}
              onChange={(newId) => {
                setActiveFile(newId)
                setActiveId(newId)
                setActiveCardId('spending')
              }}
              trackColor="rgba(15, 23, 42, 0.05)"
              thumbColor="#dc2626"
              textColor="#475569"
              activeTextColor="#ffffff"
              size="sm"
              radius={9999}
              inset={2}
              equalSlots={false}
              stretch={75}
              squash={2}
              speed={1.15}
            />
          </div>
        </div>
      )}

      {/* Minimal Carousel Card Section */}
      <div className="clean-carousel-stage">
        <Skeleton
          name="settings-cards"
          loading={Boolean(activeFile && activeFile.status === 'processing')}
          animate="shimmer"
          fallback={<PrintSettingsBoneyardFallback />}
        >
          <MinimalCarousel
            cards={CARDS}
            activeId={activeCardId}
            onActiveChange={(id) => setActiveCardId(id)}
          />
        </Skeleton>
      </div>



      {/* Floating Bottom Action Bar with Standout Highlighted Price & Morphing Receipt */}
      <div className="clean-action-bar">
        <div className="clean-price-pill">
          <div className="price-top-meta">
            <span className="price-pill-label">Total Estimate</span>
            <MorphingPopover>
              <MorphingPopoverTrigger asChild>
                <button
                  type="button"
                  className="price-pill-breakdown"
                  title="Click to view full price calculation"
                >
                  <motion.span layoutId="price-calc-badge-label" layout="position">
                    {files.length > 1
                      ? `${files.length} files total`
                      : `${totalSheets} ${totalSheets === 1 ? 'Sheet' : 'Sheets'} · ₹${pricePerPage}/sheet`}
                  </motion.span>
                </button>
              </MorphingPopoverTrigger>
              <MorphingPopoverContent className="theme-crimson position-top align-start">
                <div className="price-calc-popover-content">
                  <div className="price-calc-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Receipt size={17} weight="bold" color="#dc2626" />
                      <motion.h4
                        layoutId="price-calc-badge-label"
                        layout="position"
                        className="price-calc-title"
                      >
                        Price Breakdown
                      </motion.h4>
                    </div>
                    <span className="price-calc-badge">Live Quote</span>
                  </div>
                  <div className="price-calc-list">
                    <div className="price-calc-row">
                      <span>Rate per sheet</span>
                      <span className="price-calc-val">
                        ₹{pricePerPage}.00 ({settings.colour === 'BW' ? 'B&W' : 'Colour'})
                      </span>
                    </div>
                    <div className="price-calc-row">
                      <span>Pages Selected</span>
                      <span className="price-calc-val">{pageCount} pgs</span>
                    </div>
                    <div className="price-calc-row">
                      <span>Copies</span>
                      <span className="price-calc-val">
                        {settings.pageCopies && Object.keys(settings.pageCopies).length > 0
                          ? `Custom (${totalPagePrints} prints)`
                          : `${settings.copies}x`}
                      </span>
                    </div>
                    <div className="price-calc-row">
                      <span>Total Print Sheets</span>
                      <span className="price-calc-val">{totalSheets} sheets</span>
                    </div>
                    <div className="price-calc-row highlight">
                      <span>Total Payable</span>
                      <span className="price-calc-val">₹{grandTotal}.00</span>
                    </div>
                  </div>
                  <div className="price-calc-footer">
                    <MorphingPopoverClose asChild>
                      <button type="button" className="price-calc-done-btn">
                        Done
                      </button>
                    </MorphingPopoverClose>
                  </div>
                </div>
              </MorphingPopoverContent>
            </MorphingPopover>
          </div>
          <div className="price-figure-wrap">
            <span className="price-currency-symbol">₹</span>
            <span className="price-pill-amount">{grandTotal}</span>
            <span className="price-tax-badge">Tax Incl.</span>
          </div>
        </div>

        <ShinyButton
          variant="primary"
          className="clean-continue-btn"
          onClick={handleContinue}
          id="settings-continue"
          type="button"
        >
          <span>{kioskSession.isKioskSession() ? `Proceed to Pay ₹${grandTotal.toFixed(2)}` : 'Review Order'}</span>
          <ArrowRight size={16} className="btn-arrow btn-arrow--right" />
        </ShinyButton>
      </div>

      {/* Confirmation Modal */}
      <ClearDocumentModal
        isOpen={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={() => {
          clearUploadedDoc()
          clearAllFiles()
          setShowClearModal(false)
          navigate('/print/upload')
        }}
        title="Clear All Files?"
        description="Going back to upload will clear all your uploaded files. You will need to upload again."
        confirmText="Clear All"
        cancelText="Cancel"
      />
    </div>
  )
}
