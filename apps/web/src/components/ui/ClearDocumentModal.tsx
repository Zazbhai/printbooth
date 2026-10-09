import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Warning, Trash } from '@phosphor-icons/react'
import './ClearDocumentModal.css'

export interface ClearDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
}

export const ClearDocumentModal: React.FC<ClearDocumentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Clear Uploaded Document?',
  description = 'Going back to upload will clear your current document. You will need to upload your file again.',
  confirmText = 'Clear Document',
  cancelText = 'Stay Here',
}) => {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="clear-modal-portal" role="dialog" aria-modal="true">
          {/* Frosted Backdrop */}
          <motion.div
            className="clear-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Modal Card */}
          <motion.div
            className="clear-modal-card"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Crimson Laser Accent */}
            <div className="clear-modal-laser-rim" aria-hidden="true" />

            {/* Warning Icon Badge */}
            <div className="clear-modal-icon-badge-wrapper">
              <div className="clear-modal-icon-glow" aria-hidden="true" />
              <div className="clear-modal-icon-badge">
                <Warning size={28} weight="fill" className="clear-modal-warning-icon" />
              </div>
            </div>

            {/* Content */}
            <div className="clear-modal-content">
              <h3 className="clear-modal-title">{title}</h3>
              <p className="clear-modal-desc">{description}</p>
            </div>

            {/* Actions */}
            <div className="clear-modal-actions">
              <button
                type="button"
                className="clear-modal-btn clear-modal-btn--cancel"
                onClick={onClose}
                autoFocus
              >
                <span>{cancelText}</span>
              </button>

              <button
                type="button"
                className="clear-modal-btn clear-modal-btn--confirm"
                onClick={() => {
                  onConfirm()
                }}
              >
                <Trash size={16} weight="bold" />
                <span>{confirmText}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default ClearDocumentModal
