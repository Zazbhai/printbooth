import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  UploadSimple,
  Image as ImageIcon,
  Sparkle,
  Link as LinkIcon,
  Trash,
  CheckCircle,
  SpinnerGap,
  Camera,
} from '@phosphor-icons/react'
import './KioskPhotoEditorModal.css'

export interface KioskPhotoPreset {
  id: string
  label: string
  url: string
}

export const SAMPLE_KIOSK_PRESETS: KioskPhotoPreset[] = [
  {
    id: 'campus-lib',
    label: 'Campus Library Hub',
    url: 'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'academic-hall',
    label: 'Academic Reading Pod',
    url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'computer-lab',
    label: 'Computer Lab Station',
    url: 'https://images.unsplash.com/photo-1527192491265-7e15c55b1ed2?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'innovation-center',
    label: 'Innovation Center Desk',
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'central-reading',
    label: 'Central Reading Hall',
    url: 'https://images.unsplash.com/photo-1588702547919-26089e690ecc?auto=format&fit=crop&w=800&q=80',
  },
]

interface KioskPhotoEditorModalProps {
  isOpen: boolean
  onClose: () => void
  kioskId: string
  venueName?: string
  currentPhotoUrl?: string
  onSave: (newPhotoUrl: string) => Promise<void>
  title?: string
  subtitle?: string
}

export default function KioskPhotoEditorModal({
  isOpen,
  onClose,
  kioskId,
  venueName,
  currentPhotoUrl,
  onSave,
  title = 'Edit Kiosk Installation Photo',
  subtitle = 'Upload a photo of the installed kiosk hardware or choose a high-resolution preset.',
}: KioskPhotoEditorModalProps) {
  const [activePhoto, setActivePhoto] = useState<string>(currentPhotoUrl || '')
  const [customUrlInput, setCustomUrlInput] = useState<string>('')
  const [showUrlField, setShowUrlField] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successToast, setSuccessToast] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setActivePhoto(currentPhotoUrl || '')
      setCustomUrlInput('')
      setShowUrlField(false)
      setErrorMsg('')
      setSuccessToast(false)
    }
  }, [isOpen, currentPhotoUrl])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSaving) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSaving, onClose])

  if (!isOpen) return null

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload a valid image file (PNG, JPG, or WEBP).')
      return
    }
    setErrorMsg('')
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target?.result as string
      if (base64) {
        setActivePhoto(base64)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleSave = async () => {
    if (!activePhoto.trim()) {
      setErrorMsg('Please select or upload a kiosk photo before saving.')
      return
    }

    setIsSaving(true)
    setErrorMsg('')
    try {
      await onSave(activePhoto.trim())
      setSuccessToast(true)
      setTimeout(() => {
        onClose()
      }, 700)
    } catch (err: any) {
      console.error('Failed to save kiosk photo:', err)
      setErrorMsg(err.response?.data?.error || err.message || 'Failed to update kiosk photo.')
    } finally {
      setIsSaving(false)
    }
  }

  const isModified = activePhoto !== (currentPhotoUrl || '')

  return createPortal(
    <div
      className="kiosk-photo-modal-overlay"
      onClick={() => {
        if (!isSaving) onClose()
      }}
    >
      <div
        className="kiosk-photo-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-modal-title"
      >
        {/* Header */}
        <div className="kiosk-photo-modal__header">
          <div className="kiosk-photo-modal__header-left">
            <div className="kiosk-photo-modal__icon-badge">
              <Camera size={20} weight="fill" color="#c8ff00" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 id="photo-modal-title" className="kiosk-photo-modal__title">
                  {title}
                </h3>
                <span className="kiosk-photo-modal__kiosk-pill">{kioskId}</span>
              </div>
              <p className="kiosk-photo-modal__subtitle">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            className="kiosk-photo-modal__close-btn"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close modal"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Content Body */}
        <div className="kiosk-photo-modal__body">
          {errorMsg && (
            <div className="kiosk-photo-modal__error">
              <span>{errorMsg}</span>
            </div>
          )}

          {successToast && (
            <div className="kiosk-photo-modal__success">
              <CheckCircle size={18} weight="fill" color="#10b981" />
              <span>Photo updated successfully! Syncing hardware profile…</span>
            </div>
          )}

          {/* Large Live Preview */}
          <div className="kiosk-photo-preview-card">
            <div className="kiosk-photo-preview-image-wrap">
              {activePhoto ? (
                <>
                  <img
                    src={activePhoto}
                    alt={`${venueName || kioskId} Kiosk Hardware`}
                    className="kiosk-photo-preview-img"
                  />
                  <div className="kiosk-photo-preview-overlay">
                    <div className="kiosk-photo-preview-badge-row">
                      <span className="kiosk-photo-venue-tag">
                        {venueName || 'Host Venue Station'}
                      </span>
                      <span className="kiosk-photo-id-tag">{kioskId}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="kiosk-photo-clear-btn"
                    onClick={() => setActivePhoto('')}
                    title="Remove current photo"
                  >
                    <Trash size={14} weight="bold" />
                    <span>Clear</span>
                  </button>
                </>
              ) : (
                <div className="kiosk-photo-empty-state">
                  <ImageIcon size={38} weight="duotone" color="rgba(255, 255, 255, 0.25)" />
                  <span className="kiosk-photo-empty-title">No Kiosk Photo Assigned</span>
                  <span className="kiosk-photo-empty-sub">
                    Upload a high-resolution photo below or choose from the verified preset gallery
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Dropzone & File Browse */}
          <div
            className={`kiosk-photo-dropzone ${dragActive ? 'drag-active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelect(file)
              }}
            />
            <div className="kiosk-photo-dropzone-icon">
              <UploadSimple size={22} weight="bold" color="#c8ff00" />
            </div>
            <div className="kiosk-photo-dropzone-text">
              <strong>Drag &amp; drop physical kiosk photo here</strong>
              <span>or click to browse from device (PNG, JPG, WEBP)</span>
            </div>
          </div>

          {/* Curated Preset Kiosk Photos */}
          <div className="kiosk-photo-presets-section">
            <div className="kiosk-photo-presets-header">
              <span className="kiosk-photo-presets-label">
                <Sparkle size={14} weight="fill" color="#c8ff00" />
                <span>Quick Preset Gallery</span>
              </span>
              <button
                type="button"
                className="kiosk-photo-toggle-url-btn"
                onClick={() => setShowUrlField(!showUrlField)}
              >
                <LinkIcon size={13} weight="bold" />
                <span>{showUrlField ? 'Hide URL Input' : 'Enter Image URL'}</span>
              </button>
            </div>

            {showUrlField && (
              <div className="kiosk-photo-url-input-wrap animate-fadeIn">
                <input
                  type="url"
                  placeholder="Paste direct image URL (https://...)"
                  className="kiosk-photo-url-input"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    if (customUrlInput.trim()) {
                      setActivePhoto(customUrlInput.trim())
                      setErrorMsg('')
                    }
                  }}
                  disabled={!customUrlInput.trim()}
                >
                  Apply
                </button>
              </div>
            )}

            <div className="kiosk-photo-preset-grid">
              {SAMPLE_KIOSK_PRESETS.map((preset) => {
                const isSelected = activePhoto === preset.url
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`kiosk-photo-preset-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setActivePhoto(preset.url)
                      setErrorMsg('')
                    }}
                  >
                    <img src={preset.url} alt={preset.label} className="kiosk-photo-preset-thumb" />
                    <span className="kiosk-photo-preset-name">{preset.label}</span>
                    {isSelected && (
                      <span className="kiosk-photo-preset-check">
                        <CheckCircle size={14} weight="fill" color="#c8ff00" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="kiosk-photo-modal__footer">
          <div className="kiosk-photo-modal__footer-left">
            {isModified && (
              <span className="kiosk-photo-unsaved-pill">● Unsaved Changes</span>
            )}
          </div>
          <div className="kiosk-photo-modal__footer-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={isSaving || !activePhoto.trim()}
              style={{ minWidth: 150 }}
            >
              {isSaving ? (
                <>
                  <SpinnerGap size={16} className="animate-spin" />
                  <span>Saving Photo…</span>
                </>
              ) : (
                <>
                  <Camera size={16} weight="bold" />
                  <span>Save Kiosk Photo</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
