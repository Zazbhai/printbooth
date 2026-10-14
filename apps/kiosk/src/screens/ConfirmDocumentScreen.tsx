import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  FilePdf,
  FileImage,
  FileText,
  DeviceMobile,
  HardDrive,
  Sparkle,
} from '@phosphor-icons/react'
import './KioskScreens.css'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '').replace(/\/+$/, '')
const KIOSK_ID = 'PB-001'

export default function ConfirmDocumentScreen() {
  const navigate = useNavigate()
  const [fileName, setFileName] = useState<string>(() => sessionStorage.getItem('pb_file_name') || 'document.pdf')
  const [pageCount, setPageCount] = useState<number>(() => {
    return Math.max(1, Number(sessionStorage.getItem('pb_doc_page_count') || sessionStorage.getItem('pb_page_count')) || 1)
  })
  const [fileSize, setFileSize] = useState<string>(() => {
    const raw = sessionStorage.getItem('pb_file_size')
    if (raw && !isNaN(Number(raw)) && Number(raw) > 0) {
      return `${(Number(raw) / (1024 * 1024)).toFixed(2)} MB`
    }
    return ''
  })
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isFromPhone, setIsFromPhone] = useState<boolean>(() => {
    return Boolean(sessionStorage.getItem('pb_kiosk_session_id'))
  })

  // Poll active session for document metadata and previews
  useEffect(() => {
    let mounted = true
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/kiosk-sessions/active/${KIOSK_ID}`)
        if (!res.ok) return
        const data = await res.json()
        if (!mounted) return

        if (data?.session) {
          const s = data.session
          if (s.state === 'CONFIGURING') {
            navigate('/settings')
            return
          }
          if (s.state === 'REVIEWING') {
            navigate('/review')
            return
          }
          if (s.state === 'PAYING') {
            navigate('/payment')
            return
          }

          const fName = s.fileName || s.document?.fileName
          if (fName) {
            setFileName(fName)
            sessionStorage.setItem('pb_file_name', fName)
          }

          const pages = s.totalPages || s.document?.pageCount
          if (pages) {
            setPageCount(pages)
            sessionStorage.setItem('pb_doc_page_count', String(pages))
            sessionStorage.setItem('pb_page_count', String(pages))
          }

          if (s.document?.fileSize) {
            setFileSize(`${(s.document.fileSize / (1024 * 1024)).toFixed(2)} MB`)
          }

          // Check if preview URL or pages are present
          const firstPage = s.document?.pages?.[0]?.url || s.document?.fileUrl
          if (firstPage && typeof firstPage === 'string' && firstPage.length > 0) {
            const resolvedUrl = firstPage.startsWith('http')
              ? firstPage
              : `${API_BASE}${firstPage.startsWith('/') ? '' : '/'}${firstPage}`
            setPreviewUrl(resolvedUrl)
          }

          setIsFromPhone(true)
        }
      } catch {}
    }

    poll()
    const timer = setInterval(poll, 800)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [navigate])

  const handleProceedToSettings = async () => {
    try {
      const sessionId = sessionStorage.getItem('pb_kiosk_session_id')
      const targetUrl = sessionId
        ? `${API_BASE}/api/kiosk-sessions/${sessionId}/settings`
        : `${API_BASE}/api/kiosk-sessions/kiosk/${KIOSK_ID}/settings`

      fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kioskId: KIOSK_ID,
          nextState: 'CONFIGURING',
        }),
      }).catch(() => {})
    } catch {}

    navigate('/settings')
  }

  const isImage = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(fileName)
  const isMulti = fileName.toLowerCase().includes('files:')

  return (
    <div className="kiosk-screen">
      <div className="kiosk-bg-mesh" />

      {/* Top Status Bar */}
      <div className="kiosk-statusbar">
        <div className="statusbar__left">
          <div className="statusbar__dot" />
          <span className="statusbar__kiosk">{KIOSK_ID}</span>
          <span>MIT ADT University</span>
        </div>
        <div className="statusbar__right">
          <span>Printer: Online</span>
          <span>Fast Thermal Laser</span>
        </div>
      </div>

      <div className="kiosk-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, marginTop: 40, width: '100%', maxWidth: 760, padding: '0 24px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.35)',
            color: '#4ade80',
            fontSize: '0.82rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            <CheckCircle size={16} weight="fill" color="#22c55e" />
            <span>Document Uploaded Successfully</span>
          </div>

          <h1 className="kiosk-title" style={{ fontSize: '2.2rem', margin: 0 }}>Confirm Document</h1>
          <p className="kiosk-subtitle" style={{ margin: 0, color: 'var(--clr-text-2)', fontSize: '0.95rem' }}>
            Verify your document details before choosing colour, copies, and sides
          </p>
        </div>

        {/* Document Card Stage */}
        <div style={{
          width: '100%',
          background: 'var(--clr-surface-1, #151517)',
          border: '1.5px solid var(--clr-border-strong, #2a2a2e)',
          borderRadius: 24,
          padding: '28px 32px',
          boxShadow: '0 20px 48px -12px rgba(0, 0, 0, 0.65)',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}>
          {/* Main Info Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: 18,
              background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.16) 0%, rgba(220, 38, 38, 0.05) 100%)',
              border: '1px solid rgba(220, 38, 38, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 8px 24px rgba(220, 38, 38, 0.15)',
            }}>
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Thumbnail"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 17 }}
                  onError={() => setPreviewUrl(null)}
                />
              ) : isImage ? (
                <FileImage size={40} weight="duotone" color="#22c55e" />
              ) : isMulti ? (
                <FileText size={40} weight="duotone" color="#38bdf8" />
              ) : (
                <FilePdf size={40} weight="duotone" color="#dc2626" />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#ffffff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
              }}>
                {fileName}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#c8ff00',
                  background: 'rgba(200, 255, 0, 0.1)',
                  border: '1px solid rgba(200, 255, 0, 0.25)',
                  padding: '2px 8px',
                  borderRadius: 6,
                }}>
                  {pageCount} {pageCount === 1 ? 'Page' : 'Pages'}
                </span>

                {fileSize && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--clr-text-3)', fontWeight: 500 }}>
                    · {fileSize}
                  </span>
                )}

                <span style={{
                  fontSize: '0.8rem',
                  color: isFromPhone ? '#38bdf8' : '#e2e8f0',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontWeight: 500,
                }}>
                  · {isFromPhone ? (
                    <>
                      <DeviceMobile size={14} weight="bold" />
                      Phone Upload
                    </>
                  ) : (
                    <>
                      <HardDrive size={14} weight="bold" />
                      USB Drive
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Specs Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: 18,
          }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'left' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--clr-text-3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                Total Pages
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', marginTop: 4 }}>
                {pageCount}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'left' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--clr-text-3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                Format
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', marginTop: 4 }}>
                {isImage ? 'IMAGE' : isMulti ? 'MULTI-DOC' : 'PDF'}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'left' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--clr-text-3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                Paper Format
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', marginTop: 4 }}>
                A4 (75 GSM)
              </div>
            </div>
          </div>

          {/* Sync status prompt if user is holding phone */}
          {isFromPhone && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(56, 189, 248, 0.06)',
              border: '1px solid rgba(56, 189, 248, 0.18)',
              fontSize: '0.85rem',
              color: '#38bdf8',
              textAlign: 'left',
            }}>
              <Sparkle size={18} weight="fill" color="#38bdf8" />
              <span>
                You can review pages on your mobile phone or tap below to proceed on this touchscreen.
              </span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <button
            className="kiosk-btn kiosk-btn-primary"
            onClick={handleProceedToSettings}
            id="confirm-kiosk-continue"
            style={{
              width: '100%',
              maxWidth: 420,
              padding: '16px 28px',
              fontSize: '1.1rem',
              fontWeight: 700,
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              boxShadow: '0 12px 32px rgba(220, 38, 38, 0.35)',
            }}
          >
            <span>Configure Print Settings</span>
            <ArrowRight size={20} weight="bold" />
          </button>
        </div>
      </div>

      {/* Back button */}
      <div className="kiosk-back">
        <button
          className="kiosk-btn kiosk-btn-ghost"
          onClick={() => navigate('/upload')}
          id="confirm-kiosk-back"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <ArrowLeft size={20} />
          <span>Upload Another File</span>
        </button>
      </div>
    </div>
  )
}
