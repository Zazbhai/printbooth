import { useEffect, useRef } from 'react'
import lightGallery from 'lightgallery'
import lgZoom from 'lightgallery/plugins/zoom'
import lgThumbnail from 'lightgallery/plugins/thumbnail'
import { MagnifyingGlassPlus } from '@phosphor-icons/react'

import 'lightgallery/css/lightgallery.css'
import 'lightgallery/css/lg-zoom.css'
import 'lightgallery/css/lg-thumbnail.css'
import './DocumentLightGallery.css'

export interface DocumentPageItem {
  url: string
  title: string
  pageNumber?: number
  isBW?: boolean
  subtitle?: string
  width?: number
  height?: number
}

export interface DocumentLightGalleryProps {
  pages: DocumentPageItem[]
  fileName?: string
  fileSizeMB?: string
  colorMode?: 'BW' | 'COLOUR' | string
  duplex?: 'SINGLE' | 'DOUBLE' | string
  compact?: boolean
  className?: string
  id?: string
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export default function DocumentLightGallery({
  pages,
  fileName = 'Document',
  fileSizeMB,
  colorMode,
  duplex,
  compact = false,
  className = '',
  id = 'gallery-container',
}: DocumentLightGalleryProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lgInstance = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || pages.length === 0) return

    // Clean up existing instance before recreating
    if (lgInstance.current) {
      try {
        lgInstance.current.destroy()
      } catch (e) {}
      lgInstance.current = null
    }

    try {
      lgInstance.current = lightGallery(containerRef.current, {
        speed: 500,
        plugins: [lgZoom, lgThumbnail],
        licenseKey: '0000-0000-000-0000',
        selector: '.gallery-item',
        download: false,
        counter: true,
        enableDrag: true,
        enableSwipe: true,
        thumbnail: true,
        animateThumb: true,
        zoomFromOrigin: true,
        allowMediaOverlap: false,
        mobileSettings: {
          controls: true,
          showCloseIcon: true,
          download: false,
        },
      })
    } catch (err) {
      console.warn('[DocumentLightGallery] Error initializing lightGallery:', err)
    }

    return () => {
      if (lgInstance.current) {
        try {
          lgInstance.current.destroy()
        } catch (e) {}
        lgInstance.current = null
      }
    }
  }, [pages, colorMode, duplex])

  if (!pages || pages.length === 0) {
    return null
  }

  const isScrollable = pages.length > 4

  return (
    <div className={`doc-lightgallery-shell ${className}`}>
      {/* ── Subtitle / Action Bar ── */}
      <div className="doc-lightgallery-header">
        <div className="doc-lightgallery-summary">
          <span>{pages.length} {pages.length === 1 ? 'Page' : 'Pages'}</span>
          {fileSizeMB && <span>· {fileSizeMB} MB</span>}
          {colorMode && (
            <span className={`doc-lightgallery-tag ${colorMode === 'COLOUR' ? 'colour' : 'bw'}`}>
              {colorMode === 'COLOUR' ? 'Full Colour' : 'B&W Grayscale'}
            </span>
          )}
          {duplex && (
            <span className="doc-lightgallery-tag bw">
              {duplex === 'DOUBLE' ? '2-Sided' : '1-Sided'}
            </span>
          )}
        </div>
        <div className="doc-lightgallery-hint">
          <MagnifyingGlassPlus size={14} weight="bold" />
          <span>Click any page to zoom in HD</span>
        </div>
      </div>

      {/* ── Gallery Container (HTML & Attributes requested by user) ── */}
      <div
        ref={containerRef}
        id={id}
        className={`gallery-container ${isScrollable ? 'is-scrollable' : ''} ${compact ? 'is-compact' : ''}`}
      >
        {pages.map((p, idx) => {
          const pageNum = p.pageNumber ?? (idx + 1)
          const isPageBW = p.isBW !== undefined ? p.isBW : (colorMode === 'BW')
          
          const captionParts = [
            colorMode ? (isPageBW ? 'Black &amp; White Grayscale Output' : 'Full Colour Output') : null,
            duplex ? (duplex === 'DOUBLE' ? '2-Sided Sheet' : '1-Sided Sheet') : null,
            `Page ${pageNum} of ${pages.length}`,
          ].filter(Boolean)

          const captionHtml = `<h4>${escapeHtml(p.title || `Page ${pageNum}`)} ${fileName ? `· ${escapeHtml(fileName)}` : ''}</h4><p>${captionParts.join(' · ')}</p>`

          return (
            <a
              key={`doc-page-${pageNum}-${idx}`}
              data-lg-size={p.width && p.height ? `${p.width}-${p.height}` : undefined}
              className="gallery-item doc-gallery-item"
              data-src={p.url}
              data-thumb={p.url}
              data-sub-html={captionHtml}
              title={`Click to inspect Page ${pageNum} in high resolution`}
            >
              <div className="doc-gallery-thumb-wrapper">
                <img
                  className={`doc-gallery-thumb-img ${isPageBW ? 'is-bw' : ''} loaded`}
                  src={p.url}
                  alt={p.title || `Page ${pageNum}`}
                  loading="eager"
                  decoding="async"
                  onLoad={(e) => (e.currentTarget as HTMLImageElement).classList.add('loaded')}
                />

                <div className="doc-gallery-badge-row">
                  <span className="doc-gallery-page-badge">Pg {pageNum}</span>
                  {colorMode && (
                    <span className={`doc-gallery-mode-badge ${isPageBW ? 'bw' : 'colour'}`}>
                      {isPageBW ? 'B&W' : 'Colour'}
                    </span>
                  )}
                </div>

                <div className="doc-gallery-hover-overlay">
                  <MagnifyingGlassPlus size={22} weight="bold" />
                  <span>Inspect Page {pageNum}</span>
                </div>
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
