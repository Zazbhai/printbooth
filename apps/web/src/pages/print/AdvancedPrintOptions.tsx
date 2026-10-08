import { useState } from 'react'
import {
  SlidersHorizontal,
  Eye,
  ArrowRight,
  Gauge,
} from '@phosphor-icons/react'
import type { FileSettings } from '../../lib/multiFileStore'
import type { DocumentPagePreview } from '../../lib/documentPreview'
import { AdvancedPrintModal } from './AdvancedPrintModal'
import './AdvancedPrintOptions.css'

interface AdvancedPrintOptionsProps {
  settings: FileSettings
  onChange: (patch: Partial<FileSettings>) => void
  firstPageUrl?: string | null
  realPages?: DocumentPagePreview[]
  fileName?: string
  totalPageCount?: number
}

export function AdvancedPrintOptions({
  settings,
  onChange,
  firstPageUrl,
  realPages,
  fileName = 'Document.pdf',
  totalPageCount = 1,
}: AdvancedPrintOptionsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const activePaperSize = settings.paperSize || 'A4'
  const activeScaling = settings.scaling || 'FIT'
  const activeDpi = settings.dpi || '600'
  const activeNUp = settings.pagesPerSheet || 1
  const activeOrientation = settings.orientation || 'AUTO'

  const scalingLabel =
    activeScaling === 'FIT'
      ? 'Fit to printable area'
      : activeScaling === 'STRETCH'
      ? 'Fit to paper'
      : activeScaling === 'ACTUAL'
      ? 'Actual size'
      : activeScaling === 'CUSTOM'
      ? `${settings.customScalePercent || 100}% scale`
      : 'Fit to printable area'

  return (
    <>
      {/* Sleek Trigger Card on Settings Page */}
      <div
        className="adv-trigger-card"
        onClick={() => setIsModalOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsModalOpen(true)
          }
        }}
        aria-label="Open advanced print options and printed sheet preview"
      >
        <div className="adv-trigger-card__left">
          <div className="adv-trigger-card__icon-wrap">
            <SlidersHorizontal size={18} weight="bold" />
          </div>

          <div className="adv-trigger-card__titles">
            <div className="adv-trigger-card__title-row">
              <span className="adv-trigger-card__title">Advanced Hardware Options</span>
              <span className="adv-trigger-card__preview-badge">
                <Eye size={12} weight="bold" />
                <span>Live Sheet Simulation</span>
              </span>
            </div>

            <div className="adv-trigger-card__chips">
              <span className="adv-trigger-chip">{activePaperSize}</span>
              <span className="adv-trigger-chip">
                <Gauge size={11} weight="bold" />
                <span>{activeDpi} DPI</span>
              </span>
              <span className="adv-trigger-chip">{scalingLabel}</span>
              <span className="adv-trigger-chip">{activeNUp}pg/sheet</span>
              <span className="adv-trigger-chip">{activeOrientation === 'AUTO' ? 'Auto Rotate' : activeOrientation}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="adv-trigger-open-btn"
          onClick={e => {
            e.stopPropagation()
            setIsModalOpen(true)
          }}
          aria-label="Open advance settings popup"
        >
          <span>Customize</span>
          <ArrowRight size={13} weight="bold" />
        </button>
      </div>

      {/* Advanced Print Configuration & Sheet Preview Modal */}
      <AdvancedPrintModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        settings={settings}
        onChange={onChange}
        firstPageUrl={firstPageUrl}
        realPages={realPages}
        fileName={fileName}
        totalPageCount={totalPageCount}
      />
    </>
  )
}
