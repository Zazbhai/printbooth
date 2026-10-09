import React, { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { ArrowLeft, Upload, SlidersHorizontal, FileCheck, CreditCard } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../ui/breadcrumb'
import GhostFibers from '../ui/GhostFibers'
import { ClearDocumentModal } from '../ui/ClearDocumentModal'
import { clearUploadedDoc } from '../../lib/documentStore'
import { clearAllFiles, hasAnyReadyFile } from '../../lib/multiFileStore'
import { PrintFlowContext, type PrintStep } from '../../pages/print/PrintFlowContext'
import { ClockCounterClockwise } from '@phosphor-icons/react'
import { getActivePrintsCount, subscribeRecentPrints } from '../../lib/recentPrintsStore'
import RecentPrintsPage from '../../pages/print/RecentPrintsPage'
import { MerchantHelpMascot } from '../ui/MerchantHelpMascot'
import './PrintLayout.css'
import '../../pages/print/PrintNeomorphism.css'

interface PrintStepItem {
  step: PrintStep
  label: string
  icon: any
}

const steps: PrintStepItem[] = [
  { step: 'upload', label: 'Upload', icon: Upload },
  { step: 'confirm', label: 'Confirm Doc', icon: FileCheck },
  { step: 'settings', label: 'Settings', icon: SlidersHorizontal },
  { step: 'payment', label: 'Payment', icon: CreditCard },
]

export default function PrintLayout({ children }: { children?: React.ReactNode }) {
  const printFlow = React.useContext(PrintFlowContext)
  const navigate = useNavigate()
  const [showClearModal, setShowClearModal] = useState(false)
  const [showRecentPrints, setShowRecentPrints] = useState(false)
  const [activePrintsCount, setActivePrintsCount] = useState(() => getActivePrintsCount())

  React.useEffect(() => {
    const unsub = subscribeRecentPrints(() => {
      setActivePrintsCount(getActivePrintsCount())
    })
    return () => unsub()
  }, [])

  const activeStep = printFlow?.currentStep || 'upload'
  const isTerminal = ['status', 'success'].includes(activeStep)
  const confirmMode = sessionStorage.getItem('pb_confirm_mode') || 'doc'

  const currentStep = (() => {
    if (activeStep === 'upload') return 0
    if (activeStep === 'confirm') return confirmMode === 'doc' ? 1 : 2
    if (activeStep === 'settings' || activeStep === 'review') return 2
    if (activeStep === 'payment' || isTerminal) return 3
    return 0
  })()

  const handleBack = () => {
    if (!printFlow) {
      navigate('/')
      return
    }

    if (activeStep === 'payment') {
      sessionStorage.setItem('pb_confirm_mode', 'final')
      printFlow.goToStep('confirm')
      return
    }

    if (activeStep === 'confirm') {
      const mode = sessionStorage.getItem('pb_confirm_mode') || 'doc'
      if (mode === 'final') {
        printFlow.goToStep('settings')
        return
      }
      printFlow.goToStep('upload')
      return
    }

    if (activeStep === 'review') {
      printFlow.goToStep('settings')
      return
    }

    // If on settings page, going back returns to confirm doc
    if (activeStep === 'settings') {
      sessionStorage.setItem('pb_confirm_mode', 'doc')
      printFlow.goToStep('confirm')
      return
    }

    if (activeStep === 'kiosk') {
      printFlow.goToStep('confirm')
      return
    }

    // If on upload, go back to home page '/'
    navigate('/')
  }

  const handleStepClick = (e: React.MouseEvent, stepIndex: number) => {
    e.preventDefault()
    if (!printFlow) return

    // If user clicks Upload from a later step (Confirm, Settings, Review, etc.)
    if (stepIndex === 0 && currentStep >= 1) {
      if (sessionStorage.getItem('pb_file_name') || hasAnyReadyFile()) {
        setShowClearModal(true)
        return
      }
      printFlow.goToStep('upload')
      return
    }

    if (stepIndex < currentStep) {
      if (steps[stepIndex].step === 'confirm') {
        sessionStorage.setItem('pb_confirm_mode', 'doc')
      }
      printFlow.goToStep(steps[stepIndex].step)
    }
  }

  const handleConfirmClear = () => {
    clearUploadedDoc()
    clearAllFiles()
    setShowClearModal(false)
    if (printFlow) {
      printFlow.goToStep('upload')
    } else {
      navigate('/print')
    }
  }

  return (
    <div className="print-layout">
      {/* Background GhostFibers Effect — Graceful, Visible Silk Ribbons */}
      <div 
        style={{ 
          position: 'fixed', 
          inset: 0, 
          width: '100%',
          height: '100%',
          pointerEvents: 'none', 
          zIndex: 0, 
          overflow: 'hidden',
          opacity: 0.46,
        }}
        aria-hidden="true"
      >
        <GhostFibers
          lineColor="#64748b"
          glowColor="#f43f5e"
          speed={0.15}
          scale={1.3}
          rotation={0}
          rotationSpeed={0.018}
          layers={3}
          waveAmplitude={0.065}
          waveFrequency={1.8}
          waveSpeed={0.20}
          layerSpeed={0.04}
          twist={0.08}
          twistFrequency={2.4}
          twistSpeed={0.35}
          lineFrequency={2.2}
          lineSpacing={1.7}
          lineSharpness={2.2}
          glowFalloff={6.0}
          glowIntensity={0.42}
          brightness={0.88}
          blueBoost={1.05}
          vignette={0.30}
          grain={0}
          dpr={1}
          fps={30}
          lightMode
        />
      </div>

      {/* Floating Top-Left Back Button with High Visibility */}
      {!isTerminal && (
        <button
          type="button"
          onClick={handleBack}
          className="print-top-back-btn"
          id="print-top-back"
          title={currentStep === 0 ? "Return to Home" : `Back to ${steps[currentStep - 1]?.label || 'Previous Step'}`}
          aria-label="Go Back"
        >
          <ArrowLeft size={16} strokeWidth={2.5} className="print-top-back-icon" />
          <span className="print-top-back-text">Back</span>
        </button>
      )}

      {/* Floating Top-Right Recent Prints Button (Outside Breadcrumbs Background) */}
      {!isTerminal && (
        <button
          type="button"
          onClick={() => setShowRecentPrints(true)}
          className="print-top-recent-btn"
          id="header-recent-prints-btn"
          title="Recent Prints & OTP Codes"
          aria-label="Recent Prints & OTP Codes"
        >
          <ClockCounterClockwise size={16} weight="bold" className="print-top-recent-icon" />
          <span className="print-top-recent-text">Recent Prints</span>
          {activePrintsCount > 0 && (
            <span className="print-top-recent-badge" title={`${activePrintsCount} active print jobs`}>
              {activePrintsCount}
            </span>
          )}
        </button>
      )}

      {/* Floating Header with Breadcrumbs & Companion Help Mascot */}
      {!isTerminal && (
        <header className="print-header">
          <div className="print-header__cluster">
            {activeStep !== 'kiosk' && (
              <nav className="print-header__inner" aria-label="Print progress">
                <Breadcrumb className="print-header__breadcrumb">
                  <BreadcrumbList>
                    {steps.map((step, i) => {
                      const isDone = i < currentStep
                      const isCurrent = i === currentStep
                      const Icon = step.icon

                      return (
                        <React.Fragment key={step.step}>
                          <BreadcrumbItem className={isCurrent ? 'breadcrumb-item--current' : ''}>
                            {isDone ? (
                              <button
                                type="button"
                                onClick={(e) => handleStepClick(e, i)}
                                className="breadcrumb-icon-btn breadcrumb-icon-btn--done"
                                title={step.label}
                                aria-label={step.label}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                              >
                                <Icon size={16} strokeWidth={2.2} />
                              </button>
                            ) : isCurrent ? (
                              <BreadcrumbPage
                                className="breadcrumb-icon-btn breadcrumb-icon-btn--active"
                                title={step.label}
                                aria-label={step.label}
                              >
                                <Icon size={16} strokeWidth={2.5} />
                              </BreadcrumbPage>
                            ) : (
                              <span
                                className="breadcrumb-icon-btn breadcrumb-icon-btn--disabled"
                                title={step.label}
                                aria-label={step.label}
                              >
                                <Icon size={16} strokeWidth={1.8} />
                              </span>
                            )}
                          </BreadcrumbItem>

                          {i < steps.length - 1 && <BreadcrumbSeparator className="breadcrumb-mini-sep" />}
                        </React.Fragment>
                      )
                    })}
                  </BreadcrumbList>
                </Breadcrumb>
              </nav>
            )}

            <MerchantHelpMascot
              variant="header"
              printerId={printFlow?.printerId}
              kioskName={printFlow?.kioskName}
              onSelectStation={() => printFlow?.goToStep('kiosk')}
            />
          </div>
        </header>
      )}

      {/* ── Slide-Over Modal / Drawer for Recent Prints ── */}
      {showRecentPrints && (
        <div
          className="print-recent-drawer-backdrop animate-fadeIn"
          onClick={() => setShowRecentPrints(false)}
          id="recent-prints-overlay"
        >
          <div
            className="print-recent-drawer-card animate-slideLeft"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Recent Prints"
          >
            <RecentPrintsPage isModal onClose={() => setShowRecentPrints(false)} />
          </div>
        </div>
      )}

      {/* Clear Document Confirmation Modal */}
      <ClearDocumentModal
        isOpen={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={handleConfirmClear}
        title="Clear Uploaded Document?"
        description="Going back to upload will clear your current document. You will need to upload your file again."
        confirmText="Clear Document"
        cancelText="Stay Here"
      />

      {/* Content */}
      <main className="print-main">
        <div className="print-content">
          {children || <Outlet />}
        </div>
      </main>
    </div>
  )
}
