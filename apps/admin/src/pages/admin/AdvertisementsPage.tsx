import { useState, useEffect, useMemo } from 'react'
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  Trash,
  PencilSimple,
  Monitor,
  Eye,
  Sparkle,
  ArrowsClockwise,
  MagnifyingGlass,
  CheckCircle,
  X,
  Sliders,
  QrCode,
  Lightning,
} from '@phosphor-icons/react'
import {
  getAdvertisements,
  createAdvertisement,
  updateAdvertisement,
  deleteAdvertisement,
  toggleAdvertisementStatus,
  getAdminKiosks,
} from '@/lib/api'
import './AdvertisementsPage.css'

interface AdvertisementItem {
  id?: string
  _id?: string
  campaignId: string
  title: string
  advertiser: string
  mediaType: 'IMAGE' | 'VIDEO' | 'TEXT_BANNER'
  mediaUrl: string
  headline?: string
  tagline?: string
  callToAction?: string
  qrCodeUrl?: string
  badgeText?: string
  accentColor?: string
  motionType: 'DRIFT' | 'FLOAT' | 'MARQUEE' | 'PULSE' | 'KEN_BURNS'
  motionSpeed: 'SLOW' | 'NORMAL' | 'FAST'
  opacity: number
  targetKiosks: string[]
  status: 'ACTIVE' | 'PAUSED' | 'SCHEDULED' | 'COMPLETED'
  priority?: number
  impressionsCount?: number
  clicksCount?: number
  createdAt?: string
}

const PRESET_BANNERS = [
  {
    title: 'Red Bull Campus Rush',
    advertiser: 'Red Bull India',
    mediaUrl: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?auto=format&fit=crop&w=1600&q=80',
    headline: 'Fuel Your Late Night Study Sessions',
    tagline: '20% off with Student ID at Central Cafeteria',
    badgeText: 'CAMPUS SPONSOR',
    accentColor: '#dc2626',
    motionType: 'DRIFT' as const,
  },
  {
    title: 'Spotify Student Premium',
    advertiser: 'Spotify India',
    mediaUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1600&q=80',
    headline: 'Exam Lo-Fi Beats & Ad-Free Music',
    tagline: 'Spotify Premium at ₹59/month with college email',
    badgeText: 'STUDENT PERK',
    accentColor: '#10b981',
    motionType: 'FLOAT' as const,
  },
  {
    title: 'MIT ADT Annual Hackathon',
    advertiser: 'Tech Fest Committee',
    mediaUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1600&q=80',
    headline: '36-Hour National Hackathon • ₹2.5L Prize Pool',
    tagline: 'Free cloud computing credits for all participants',
    badgeText: 'CAMPUS EVENT',
    accentColor: '#f59e0b',
    motionType: 'KEN_BURNS' as const,
  },
  {
    title: 'Campus Coffee Lounge',
    advertiser: 'Ground Floor Reading Hall Cafe',
    mediaUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1600&q=80',
    headline: 'Freshly Brewed Cappuccinos & Croissants',
    tagline: 'Flat ₹30 off on any pastry with every print receipt',
    badgeText: 'STORE SPECIAL',
    accentColor: '#ea580c',
    motionType: 'PULSE' as const,
  },
  {
    title: 'PrintBooth FastPass Cloud',
    advertiser: 'PrintBooth Logistics',
    mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1600&q=80',
    headline: 'Print in 10 Seconds Flat Directly From Phone',
    tagline: 'Zero queue, instant wireless payment, auto document retrieval',
    badgeText: 'PRINTBOOTH PROMO',
    accentColor: '#dc2626',
    motionType: 'DRIFT' as const,
  },
]

export default function AdvertisementsPage() {
  const [ads, setAds] = useState<AdvertisementItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL')
  const [kioskFilter, setKioskFilter] = useState('ALL')
  const [kiosks, setKiosks] = useState<any[]>([])

  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [editingAd, setEditingAd] = useState<AdvertisementItem | null>(null)
  const [simulatorAd, setSimulatorAd] = useState<AdvertisementItem | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    advertiser: '',
    mediaType: 'IMAGE' as 'IMAGE' | 'VIDEO' | 'TEXT_BANNER',
    mediaUrl: '',
    headline: '',
    tagline: '',
    callToAction: 'Scan to Claim Offer',
    qrCodeUrl: '',
    badgeText: 'SPONSORED',
    accentColor: '#dc2626',
    motionType: 'DRIFT' as 'DRIFT' | 'FLOAT' | 'MARQUEE' | 'PULSE' | 'KEN_BURNS',
    motionSpeed: 'SLOW' as 'SLOW' | 'NORMAL' | 'FAST',
    opacity: 0.22,
    targetKiosks: ['ALL'],
    status: 'ACTIVE' as 'ACTIVE' | 'PAUSED',
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const [adsData, kiosksData] = await Promise.all([
        getAdvertisements({
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          kioskId: kioskFilter !== 'ALL' ? kioskFilter : undefined,
          search: search || undefined,
        }),
        getAdminKiosks().catch(() => []),
      ])
      setAds(Array.isArray(adsData) ? adsData : [])
      setKiosks(Array.isArray(kiosksData) ? kiosksData : [{ kioskId: 'PB-001', name: 'MIT ADT Campus Hub' }])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [statusFilter, kioskFilter])

  const notify = (msg: string) => {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 4000)
  }

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingAd(null)
    setFormData({
      title: '',
      advertiser: '',
      mediaType: 'IMAGE',
      mediaUrl: PRESET_BANNERS[0].mediaUrl,
      headline: '',
      tagline: '',
      callToAction: 'Scan to Claim Offer',
      qrCodeUrl: '',
      badgeText: 'SPONSORED',
      accentColor: '#dc2626',
      motionType: 'DRIFT',
      motionSpeed: 'SLOW',
      opacity: 0.22,
      targetKiosks: ['ALL'],
      status: 'ACTIVE',
    })
    setShowModal(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (ad: AdvertisementItem) => {
    setEditingAd(ad)
    setFormData({
      title: ad.title,
      advertiser: ad.advertiser,
      mediaType: ad.mediaType || 'IMAGE',
      mediaUrl: ad.mediaUrl,
      headline: ad.headline || '',
      tagline: ad.tagline || '',
      callToAction: ad.callToAction || 'Scan to Claim Offer',
      qrCodeUrl: ad.qrCodeUrl || '',
      badgeText: ad.badgeText || 'SPONSORED',
      accentColor: ad.accentColor || '#dc2626',
      motionType: ad.motionType || 'DRIFT',
      motionSpeed: ad.motionSpeed || 'SLOW',
      opacity: ad.opacity ?? 0.22,
      targetKiosks: ad.targetKiosks?.length ? ad.targetKiosks : ['ALL'],
      status: (ad.status as any) || 'ACTIVE',
    })
    setShowModal(true)
  }

  // Select preset banner
  const handleSelectPreset = (preset: typeof PRESET_BANNERS[0]) => {
    setFormData((prev) => ({
      ...prev,
      title: preset.title,
      advertiser: preset.advertiser,
      mediaUrl: preset.mediaUrl,
      headline: preset.headline,
      tagline: preset.tagline,
      badgeText: preset.badgeText,
      accentColor: preset.accentColor,
      motionType: preset.motionType,
    }))
  }

  // Submit form
  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title || !formData.advertiser || !formData.mediaUrl) {
      alert('Please fill in campaign title, advertiser name, and banner image URL.')
      return
    }

    try {
      if (editingAd) {
        const id = editingAd.campaignId || editingAd._id || editingAd.id
        await updateAdvertisement(id!, formData)
        notify(`Campaign "${formData.title}" updated successfully!`)
      } else {
        await createAdvertisement(formData)
        notify(`Campaign "${formData.title}" launched and syncing to kiosks!`)
      }
      setShowModal(false)
      loadData()
    } catch (err: any) {
      alert(`Error saving campaign: ${err.message || 'Server error'}`)
    }
  }

  // Toggle active/paused
  const handleToggleStatus = async (ad: AdvertisementItem) => {
    const id = ad.campaignId || ad._id || ad.id
    try {
      await toggleAdvertisementStatus(id!)
      notify(`Campaign "${ad.title}" ${ad.status === 'ACTIVE' ? 'paused' : 'activated'}!`)
      loadData()
    } catch (err: any) {
      alert(`Failed to toggle status: ${err.message}`)
    }
  }

  // Delete
  const handleDeleteAd = async (ad: AdvertisementItem) => {
    if (!confirm(`Are you sure you want to delete campaign "${ad.title}"?`)) return
    const id = ad.campaignId || ad._id || ad.id
    try {
      await deleteAdvertisement(id!)
      notify(`Campaign "${ad.title}" deleted.`)
      loadData()
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`)
    }
  }

  // Filtered ads
  const filteredAds = useMemo(() => {
    let list = ads
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.advertiser.toLowerCase().includes(q) ||
          (a.headline && a.headline.toLowerCase().includes(q))
      )
    }
    return list
  }, [ads, search])

  // Metric aggregates
  const activeCount = ads.filter((a) => a.status === 'ACTIVE').length
  const totalImpressions = ads.reduce((sum, a) => sum + (a.impressionsCount || 0), 0)

  return (
    <div className="ads-page-wrap">
      {/* ─── Header ─── */}
      <div className="ads-header">
        <div>
          <h1 className="ads-title">
            <Megaphone size={26} color="#dc2626" weight="fill" />
            <span>Kiosk Background Advertisements</span>
          </h1>
          <p className="ads-subtitle">
            Deploy hardware-accelerated animated sponsor campaigns, campus notices, and ambient brand graphics directly into the background of all PrintBooth touchscreen terminals.
          </p>
        </div>

        <div className="ads-header-actions">
          <button type="button" className="ads-btn" onClick={loadData}>
            <ArrowsClockwise size={15} weight="bold" />
            <span>Refresh</span>
          </button>
          <button type="button" className="ads-btn primary" onClick={handleOpenCreate}>
            <Plus size={16} weight="bold" />
            <span>Launch Ad Campaign</span>
          </button>
        </div>
      </div>

      {/* ─── Feedback Toast ─── */}
      {feedback && (
        <div style={{
          background: '#ecfdf5',
          border: '1px solid #10b981',
          borderRadius: 8,
          padding: '10px 16px',
          fontSize: 13,
          fontWeight: 600,
          color: '#065f46',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <CheckCircle size={18} weight="fill" color="#10b981" />
          <span>{feedback}</span>
        </div>
      )}

      {/* ─── Top Stats Grid ─── */}
      <div className="ads-stats-grid">
        <div className="ads-stat-card">
          <div className="ads-stat-info">
            <span className="ads-stat-label">Active Campaigns</span>
            <div className="ads-stat-value">{activeCount}</div>
            <span className="ads-stat-sub">
              <Sparkle size={13} weight="bold" /> Live in Kiosk Terminals
            </span>
          </div>
          <div className="ads-stat-icon red">
            <Megaphone size={22} weight="fill" />
          </div>
        </div>

        <div className="ads-stat-card">
          <div className="ads-stat-info">
            <span className="ads-stat-label">Target Terminals</span>
            <div className="ads-stat-value">{kiosks.length || 1} Kiosks</div>
            <span className="ads-stat-sub" style={{ color: '#2563eb' }}>
              Station PB-001 + Fleet
            </span>
          </div>
          <div className="ads-stat-icon blue">
            <Monitor size={22} weight="duotone" />
          </div>
        </div>

        <div className="ads-stat-card">
          <div className="ads-stat-info">
            <span className="ads-stat-label">Screen Impressions</span>
            <div className="ads-stat-value">{totalImpressions.toLocaleString('en-IN')}</div>
            <span className="ads-stat-sub">
              <Eye size={13} weight="bold" /> Verified Touchscreen Views
            </span>
          </div>
          <div className="ads-stat-icon emerald">
            <Eye size={22} weight="fill" />
          </div>
        </div>

        <div className="ads-stat-card">
          <div className="ads-stat-info">
            <span className="ads-stat-label">Motion Engine</span>
            <div className="ads-stat-value" style={{ fontSize: 18 }}>60 FPS GPU</div>
            <span className="ads-stat-sub" style={{ color: '#d97706' }}>
              <Lightning size={13} weight="fill" /> Low-CPU Raspberry Pi Mode
            </span>
          </div>
          <div className="ads-stat-icon amber">
            <Lightning size={22} weight="fill" />
          </div>
        </div>
      </div>

      {/* ─── Preset Library Quick-Picker ─── */}
      <div className="ads-preset-strip">
        <div className="ads-preset-title">
          <Sparkle size={16} color="#dc2626" weight="fill" />
          <span>Curated Brand &amp; Campus Campaign Presets (1-Click Launch)</span>
        </div>
        <div className="ads-preset-cards">
          {PRESET_BANNERS.map((preset, idx) => (
            <div
              key={idx}
              className="ads-preset-card"
              style={{ backgroundImage: `url(${preset.mediaUrl})` }}
              onClick={() => {
                handleOpenCreate()
                handleSelectPreset(preset)
              }}
              title="Click to launch this campaign template"
            >
              <div className="ads-preset-content">
                <span className="ads-preset-sponsor">{preset.advertiser}</span>
                <div className="ads-preset-name">{preset.title}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Filter & Search Toolbar ─── */}
      <div className="ads-toolbar">
        <div className="ads-search-box">
          <MagnifyingGlass size={16} className="ads-search-icon" />
          <input
            type="text"
            placeholder="Search campaigns by brand, headline or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="ads-filters">
          {(['ALL', 'ACTIVE', 'PAUSED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              className={`ads-filter-pill ${statusFilter === st ? 'active' : ''}`}
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </button>
          ))}

          <select
            className="ads-filter-pill"
            value={kioskFilter}
            onChange={(e) => setKioskFilter(e.target.value)}
            style={{ paddingRight: 8 }}
          >
            <option value="ALL">All Kiosks (Fleet)</option>
            {kiosks.map((k) => (
              <option key={k.kioskId || k.id} value={k.kioskId || k.id}>
                {k.kioskId || k.id} ({k.name || 'Station'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── Campaigns Grid ─── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
          Loading advertising campaigns...
        </div>
      ) : filteredAds.length === 0 ? (
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 14,
          padding: '60px 20px',
          textAlign: 'center',
          color: '#64748b',
        }}>
          <Megaphone size={40} color="#dc2626" weight="duotone" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>No Advertising Campaigns Found</h3>
          <p style={{ fontSize: 13, maxWidth: 440, margin: '6px auto 18px' }}>
            There are currently no campaigns matching your filter. Launch a new sponsor ad or select a preset template above.
          </p>
          <button type="button" className="ads-btn primary" onClick={handleOpenCreate}>
            <Plus size={16} weight="bold" />
            <span>Launch First Campaign</span>
          </button>
        </div>
      ) : (
        <div className="ads-grid">
          {filteredAds.map((ad) => {
            const isActive = ad.status === 'ACTIVE'
            const motionLabel = ad.motionType || 'DRIFT'
            const speedLabel = ad.motionSpeed || 'SLOW'

            return (
              <div key={ad.campaignId || ad._id || ad.id} className={`ads-card ${!isActive ? 'paused' : ''}`}>
                {/* Banner Visual Preview Box */}
                <div
                  className="ads-banner-preview"
                  style={{ backgroundImage: `url(${ad.mediaUrl})` }}
                >
                  <div className="ads-banner-top-badges">
                    <span
                      className="ads-badge-sponsor"
                      style={{ background: ad.accentColor || '#dc2626' }}
                    >
                      {ad.badgeText || 'SPONSORED'}
                    </span>
                    <span className="ads-badge-motion">
                      <Sparkle size={11} weight="fill" />
                      <span>{motionLabel} • {speedLabel}</span>
                    </span>
                  </div>

                  <div className="ads-banner-bottom-text">
                    <div className="ads-banner-headline">{ad.headline || ad.title}</div>
                    {ad.tagline && <div className="ads-banner-tagline">{ad.tagline}</div>}
                  </div>
                </div>

                {/* Card Content & Metrics */}
                <div className="ads-card-body">
                  <div className="ads-card-meta-row">
                    <span className="ads-card-campaign-id">{ad.campaignId}</span>
                    <span className="ads-card-kiosks-pill">
                      {ad.targetKiosks?.includes('ALL') ? 'All Kiosks Fleet' : ad.targetKiosks?.join(', ')}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{ad.title}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>By {ad.advertiser}</div>
                  </div>

                  <div className="ads-card-metrics-strip">
                    <div>
                      <div className="ads-mini-metric-num">{ad.impressionsCount || 0}</div>
                      <div className="ads-mini-metric-lbl">Impressions</div>
                    </div>
                    <div>
                      <div className="ads-mini-metric-num">{ad.clicksCount || 0}</div>
                      <div className="ads-mini-metric-lbl">QR Scans</div>
                    </div>
                    <div>
                      <div className="ads-mini-metric-num">{Math.round((ad.opacity ?? 0.22) * 100)}%</div>
                      <div className="ads-mini-metric-lbl">Bg Opacity</div>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="ads-card-actions">
                    <button
                      type="button"
                      className={`ads-toggle-btn ${isActive ? 'active' : 'paused'}`}
                      onClick={() => handleToggleStatus(ad)}
                      title={`Click to ${isActive ? 'pause' : 'activate'} campaign`}
                    >
                      {isActive ? <Pause size={13} weight="bold" /> : <Play size={13} weight="bold" />}
                      <span>{isActive ? 'Active (Live)' : 'Paused'}</span>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className="ads-icon-action-btn"
                        onClick={() => setSimulatorAd(ad)}
                        title="Open interactive Kiosk Background Simulator"
                      >
                        <Monitor size={15} weight="bold" color="#2563eb" />
                      </button>
                      <button
                        type="button"
                        className="ads-icon-action-btn"
                        onClick={() => handleOpenEdit(ad)}
                        title="Edit campaign details"
                      >
                        <PencilSimple size={15} weight="bold" />
                      </button>
                      <button
                        type="button"
                        className="ads-icon-action-btn delete"
                        onClick={() => handleDeleteAd(ad)}
                        title="Delete campaign"
                      >
                        <Trash size={15} weight="bold" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Modal: Create / Edit Campaign ─── */}
      {showModal && (
        <div className="ads-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="ads-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ads-modal-header">
              <h2 className="ads-modal-title">
                {editingAd ? `Edit Campaign: ${editingAd.campaignId}` : 'Launch New Kiosk Ad Campaign'}
              </h2>
              <button
                type="button"
                className="ads-icon-action-btn"
                onClick={() => setShowModal(false)}
                aria-label="Close modal"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <form onSubmit={handleSaveAd}>
              <div className="ads-modal-body">
                {/* Preset Banner Quick-Select */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>
                    Quick-Fill With Preset Sponsor Template:
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {PRESET_BANNERS.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="ads-btn"
                        style={{ fontSize: 11.5, padding: '4px 10px' }}
                        onClick={() => handleSelectPreset(p)}
                      >
                        <Sparkle size={12} weight="fill" color={p.accentColor} />
                        <span>{p.advertiser}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ads-form-row">
                  <div className="ads-form-group">
                    <label className="ads-form-label">Campaign Title *</label>
                    <input
                      type="text"
                      className="ads-form-input"
                      placeholder="e.g. Red Bull Campus Energy Rush"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>

                  <div className="ads-form-group">
                    <label className="ads-form-label">Advertiser / Brand Sponsor *</label>
                    <input
                      type="text"
                      className="ads-form-input"
                      placeholder="e.g. Red Bull India / MIT Cafe"
                      value={formData.advertiser}
                      onChange={(e) => setFormData({ ...formData, advertiser: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="ads-form-group">
                  <label className="ads-form-label">Banner Image URL *</label>
                  <input
                    type="url"
                    className="ads-form-input"
                    placeholder="https://images.unsplash.com/..."
                    value={formData.mediaUrl}
                    onChange={(e) => setFormData({ ...formData, mediaUrl: e.target.value })}
                    required
                  />
                </div>

                <div className="ads-form-row">
                  <div className="ads-form-group">
                    <label className="ads-form-label">Punchy Headline</label>
                    <input
                      type="text"
                      className="ads-form-input"
                      placeholder="e.g. Fuel Your Late Night Study Sessions"
                      value={formData.headline}
                      onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
                    />
                  </div>

                  <div className="ads-form-group">
                    <label className="ads-form-label">Supporting Tagline / Offer</label>
                    <input
                      type="text"
                      className="ads-form-input"
                      placeholder="e.g. 20% off with Student ID at campus store"
                      value={formData.tagline}
                      onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                    />
                  </div>
                </div>

                <div className="ads-form-row">
                  <div className="ads-form-group">
                    <label className="ads-form-label">Sponsor Badge Text</label>
                    <input
                      type="text"
                      className="ads-form-input"
                      placeholder="e.g. CAMPUS SPONSOR / 50% OFF"
                      value={formData.badgeText}
                      onChange={(e) => setFormData({ ...formData, badgeText: e.target.value })}
                    />
                  </div>

                  <div className="ads-form-group">
                    <label className="ads-form-label">Brand Accent Color</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="color"
                        value={formData.accentColor}
                        onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                        style={{ width: 44, height: 38, border: 'none', background: 'none', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        className="ads-form-input"
                        value={formData.accentColor}
                        onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                        style={{ flex: 1, fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Motion Engine Settings */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sliders size={16} color="#dc2626" />
                    <span>Hardware Motion &amp; Display Optimization</span>
                  </div>

                  <div className="ads-form-row">
                    <div className="ads-form-group">
                      <label className="ads-form-label">Motion Animation Style</label>
                      <select
                        className="ads-form-select"
                        value={formData.motionType}
                        onChange={(e) => setFormData({ ...formData, motionType: e.target.value as any })}
                      >
                        <option value="DRIFT">Continuous Diagonal Drift (Ken Burns Slow Pan)</option>
                        <option value="FLOAT">Atmospheric Levitation Float (Subtle Pulse)</option>
                        <option value="KEN_BURNS">Deep Cinematic Zoom &amp; Pan</option>
                        <option value="MARQUEE">Dynamic Lower Ticker Stream</option>
                        <option value="PULSE">Soft Breathing Atmospheric Glow</option>
                      </select>
                    </div>

                    <div className="ads-form-group">
                      <label className="ads-form-label">Motion Speed</label>
                      <select
                        className="ads-form-select"
                        value={formData.motionSpeed}
                        onChange={(e) => setFormData({ ...formData, motionSpeed: e.target.value as any })}
                      >
                        <option value="SLOW">Slow (Recommended for Smooth Pi 60fps)</option>
                        <option value="NORMAL">Normal</option>
                        <option value="FAST">Fast (Dynamic &amp; Energetic)</option>
                      </select>
                    </div>
                  </div>

                  <div className="ads-form-row" style={{ marginTop: 14 }}>
                    <div className="ads-form-group">
                      <label className="ads-form-label">
                        Background Opacity: {Math.round(formData.opacity * 100)}%
                      </label>
                      <input
                        type="range"
                        min="0.08"
                        max="0.55"
                        step="0.02"
                        value={formData.opacity}
                        onChange={(e) => setFormData({ ...formData, opacity: parseFloat(e.target.value) })}
                        style={{ width: '100%', accentColor: '#dc2626', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        Low opacity ensures high contrast for kiosk buttons and PIN pads.
                      </span>
                    </div>

                    <div className="ads-form-group">
                      <label className="ads-form-label">Target Terminals</label>
                      <select
                        className="ads-form-select"
                        value={formData.targetKiosks[0] || 'ALL'}
                        onChange={(e) => setFormData({ ...formData, targetKiosks: [e.target.value] })}
                      >
                        <option value="ALL">All Kiosks Fleet (Station PB-001 + All)</option>
                        {kiosks.map((k) => (
                          <option key={k.kioskId || k.id} value={k.kioskId || k.id}>
                            Only {k.kioskId || k.id} ({k.name || 'Station'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="ads-modal-footer">
                <button type="button" className="ads-btn" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="ads-btn primary">
                  <CheckCircle size={16} weight="bold" />
                  <span>{editingAd ? 'Save Changes' : 'Start Campaign'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal: Live Interactive Kiosk Background Simulator ─── */}
      {simulatorAd && (
        <div className="ads-modal-overlay" onClick={() => setSimulatorAd(null)}>
          <div className="ads-modal-card ads-sim-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ads-modal-header">
              <div>
                <h2 className="ads-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Monitor size={20} color="#dc2626" weight="bold" />
                  <span>Live Kiosk Simulator: {simulatorAd.title}</span>
                </h2>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Visualizing how this advertisement animates behind Station PB-001 touchscreen in real time.
                </div>
              </div>
              <button
                type="button"
                className="ads-icon-action-btn"
                onClick={() => setSimulatorAd(null)}
                aria-label="Close simulator"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <div className="ads-modal-body" style={{ padding: 18 }}>
              {/* Simulator Frame */}
              <div className="ads-sim-frame-wrap">
                {/* Moving Background Ad Simulation Layer */}
                <div
                  style={{
                    position: 'absolute',
                    inset: -40,
                    backgroundImage: `url(${simulatorAd.mediaUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    opacity: simulatorAd.opacity ?? 0.22,
                    animation:
                      simulatorAd.motionType === 'FLOAT'
                        ? 'adFloatSim 14s ease-in-out infinite alternate'
                        : simulatorAd.motionType === 'KEN_BURNS'
                        ? 'adKenBurnsSim 24s ease-in-out infinite alternate'
                        : 'adDriftSim 20s ease-in-out infinite alternate',
                    transform: 'translate3d(0, 0, 0)',
                    willChange: 'transform',
                  }}
                />

                {/* Ambient Radial Spotlight */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'radial-gradient(ellipse 70% 60% at 50% 30%, rgba(220, 38, 38, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)',
                    pointerEvents: 'none',
                  }}
                />

                {/* Simulated Kiosk Status Bar */}
                <div
                  style={{
                    position: 'relative',
                    zIndex: 10,
                    height: 44,
                    background: 'rgba(255, 255, 255, 0.94)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 20px',
                    borderBottom: '1px solid rgba(220, 38, 38, 0.15)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
                    <span style={{ fontWeight: 800, color: '#dc2626' }}>PB-001</span>
                    <span style={{ color: '#0f172a' }}>MIT ADT Campus Hub</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#475569', fontSize: 11.5 }}>
                    <span>Brother HL-L5210DW: Ready</span>
                    <span>Tray 1: 100%</span>
                  </div>
                </div>

                {/* Simulated Kiosk Welcome Content */}
                <div
                  style={{
                    position: 'relative',
                    zIndex: 10,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 16,
                    padding: 24,
                    textAlign: 'center',
                  }}
                >
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(12px)',
                    borderRadius: 16,
                    padding: '24px 36px',
                    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.15)',
                    border: '1px solid rgba(220, 38, 38, 0.15)',
                    maxWidth: 480,
                  }}>
                    <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      Welcome to <span style={{ color: '#dc2626' }}>PrintBooth</span>
                    </h2>
                    <p style={{ fontSize: 13, color: '#64748b', margin: '8px 0 18px' }}>
                      Print your documents in seconds. Already paid on your phone? Enter your 6-digit PIN below.
                    </p>

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                      <button
                        type="button"
                        style={{
                          background: '#dc2626',
                          color: '#ffffff',
                          fontWeight: 700,
                          padding: '10px 22px',
                          borderRadius: 8,
                          border: 'none',
                          fontSize: 13,
                        }}
                      >
                        ENTER PRINT PIN
                      </button>
                      <button
                        type="button"
                        style={{
                          background: '#ffffff',
                          color: '#0f172a',
                          fontWeight: 700,
                          padding: '10px 18px',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          fontSize: 13,
                        }}
                      >
                        NEW PRINT JOB
                      </button>
                    </div>
                  </div>
                </div>

                {/* Simulated Ambient Sponsor Lower-Third Ticker */}
                <div
                  style={{
                    position: 'relative',
                    zIndex: 10,
                    height: 38,
                    background: 'rgba(15, 23, 42, 0.92)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 18px',
                    color: '#ffffff',
                    fontSize: 11.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        background: simulatorAd.accentColor || '#dc2626',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontWeight: 800,
                        fontSize: 9.5,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {simulatorAd.badgeText || 'SPONSORED'}
                    </span>
                    <strong style={{ color: '#ffffff' }}>{simulatorAd.headline || simulatorAd.title}:</strong>
                    <span style={{ color: '#cbd5e1' }}>{simulatorAd.tagline}</span>
                  </div>

                  <span style={{ color: simulatorAd.accentColor || '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <QrCode size={13} />
                    <span>{simulatorAd.callToAction || 'Scan to Claim Offer'}</span>
                  </span>
                </div>
              </div>

              {/* Dynamic Live Tuning Controls */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: '#475569' }}>Live Opacity:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="0.6"
                    step="0.05"
                    value={simulatorAd.opacity ?? 0.22}
                    onChange={(e) => setSimulatorAd({ ...simulatorAd, opacity: parseFloat(e.target.value) })}
                    style={{ width: 140, accentColor: '#dc2626' }}
                  />
                  <span>{Math.round((simulatorAd.opacity ?? 0.22) * 100)}%</span>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {(['DRIFT', 'FLOAT', 'KEN_BURNS'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`ads-filter-pill ${simulatorAd.motionType === m ? 'active' : ''}`}
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => setSimulatorAd({ ...simulatorAd, motionType: m })}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simulator Embedded Animation Keyframes */}
      <style>{`
        @keyframes adDriftSim {
          0% { transform: translate3d(-15px, -15px, 0) scale(1.04); }
          100% { transform: translate3d(20px, 15px, 0) scale(1.12); }
        }
        @keyframes adFloatSim {
          0% { transform: translate3d(0, 0, 0) scale(1.02); }
          50% { transform: translate3d(0, -18px, 0) scale(1.06); }
          100% { transform: translate3d(0, 10px, 0) scale(1.03); }
        }
        @keyframes adKenBurnsSim {
          0% { transform: translate3d(-20px, 10px, 0) scale(1.03); }
          100% { transform: translate3d(25px, -20px, 0) scale(1.16); }
        }
      `}</style>
    </div>
  )
}
