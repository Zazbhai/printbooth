import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import {
  Storefront,
  Plus,
  MagnifyingGlass,
  CurrencyInr,
  Monitor,
  Bank,
  QrCode,
  Copy,
  CheckCircle,
  ArrowSquareOut,
  Image as ImageIcon,
  Trash,
  ShieldCheck,
  EnvelopeSimple,
  Phone,
  MapPin,
  X,
  Camera,
  Printer,
  ArrowsClockwise,
  User,
  CreditCard,
  Lightning,
  Key,
  PencilSimple,
  Prohibit,
  Lock,
  LockOpen,
  Eye,
  EyeSlash,
  At,
  ShieldWarning,
  DownloadSimple,
} from '@phosphor-icons/react'
import {
  getAdminMerchants,
  createAdminMerchant,
  updateAdminMerchant,
  blockAdminMerchant,
  unblockAdminMerchant,
  getAdminMerchantProvisionKit,
  rotateAdminMerchantSecret,
} from '@/lib/api'
import { getKioskPrintUrl } from '@/lib/config'
import Select, { type TSelectData } from '@/components/ui/select'
import '../AdminPage.css'
import './MerchantsPage.css'

const SAMPLE_KIOSK_PHOTOS = [
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1527192491265-7e15c55b1ed2?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80',
]

const STATUS_FILTER_OPTIONS: TSelectData[] = [
  { id: 'all', label: 'All Partners', value: 'ALL', icon: '🏪', description: 'Show all registered venue hosts' },
  { id: 'online', label: 'Online & Active', value: 'ONLINE', icon: '🟢', description: 'Kiosk connected and accepting prints' },
  { id: 'attention', label: 'Needs Attention', value: 'ATTENTION', icon: '⚠️', description: 'Low consumables (<20%) or offline' },
]

export default function MerchantsPage() {
  const navigate = useNavigate()

  const [merchants, setMerchants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'ATTENTION'>('ALL')
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [dragActive, setDragActive] = useState(false)

  // QR Standee Modal State
  const [standeeModalOpen, setStandeeModalOpen] = useState(false)
  const [standeeMerchant, setStandeeMerchant] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  // Lightbox Photo View State
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null)

  // Edit Merchant Modal State
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingMerchant, setEditingMerchant] = useState<any>(null)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editErrorMessage, setEditErrorMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [blockActionLoading, setBlockActionLoading] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Hardware Key & .env Modal State
  const [hardwareKeyModalOpen, setHardwareKeyModalOpen] = useState(false)
  const [activeHardwareKit, setActiveHardwareKit] = useState<any>(null)
  const [loadingHardwareKit, setLoadingHardwareKit] = useState(false)
  const [showHardwareSecret, setShowHardwareSecret] = useState(false)
  const [copiedHardwareSecret, setCopiedHardwareSecret] = useState(false)
  const [copiedHardwareEnv, setCopiedHardwareEnv] = useState(false)
  const [copiedHardwareCommand, setCopiedHardwareCommand] = useState(false)
  const [rotatingHardwareSecret, setRotatingHardwareSecret] = useState(false)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  const handleOpenHardwareKey = async (m: any) => {
    setLoadingHardwareKit(true)
    setHardwareKeyModalOpen(true)
    setShowHardwareSecret(false)
    setCopiedHardwareSecret(false)
    setCopiedHardwareEnv(false)
    setCopiedHardwareCommand(false)
    try {
      const data = await getAdminMerchantProvisionKit(m.merchantId || m.kioskId)
      if (data) {
        setActiveHardwareKit(data)
      } else {
        showToast('Could not fetch hardware security credentials.')
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`)
    } finally {
      setLoadingHardwareKit(false)
    }
  }

  const handleRotateHardwareKey = async () => {
    if (!activeHardwareKit) return
    const confirmMsg = `Rotate cryptographic secret key for station ${activeHardwareKit.kioskId} (${activeHardwareKit.storeName || activeHardwareKit.merchantName})?\n\nWARNING: The Raspberry Pi will be disconnected until updated with the new key in .env!`
    if (!window.confirm(confirmMsg)) return

    setRotatingHardwareSecret(true)
    try {
      const rotated = await rotateAdminMerchantSecret(activeHardwareKit.merchantId || activeHardwareKit.kioskId)
      if (rotated) {
        setActiveHardwareKit(rotated)
        showToast(`✓ Cryptographic key for ${activeHardwareKit.kioskId} rotated successfully!`)
      }
    } catch (err: any) {
      alert(`Failed to rotate key: ${err.message}`)
    } finally {
      setRotatingHardwareSecret(false)
    }
  }

  const handleDownloadEnv = () => {
    if (!activeHardwareKit?.envContent) return
    const blob = new Blob([activeHardwareKit.envContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `.env`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast(`✓ Downloaded .env file for station ${activeHardwareKit.kioskId}`)
  }

  // Form State
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputEditRef = useRef<HTMLInputElement>(null)
  const [editDragActive, setEditDragActive] = useState(false)
  const [newMerchant, setNewMerchant] = useState({
    name: '',
    storeName: '',
    email: '',
    username: '',
    password: '',
    phone: '',
    address: '',
    kioskId: '',
    commission: '0%',
    kioskPhotoUrl: '',
    paymentGateway: 'upiexpress' as 'upiexpress' | 'razorpay',
    upiExpressApiKey: '',
    upiExpressUpiId: '',
    razorpayKeyId: '',
    razorpayKeySecret: '',
  })

  const loadMerchants = async () => {
    setLoading(true)
    const data = await getAdminMerchants()
    if (Array.isArray(data)) {
      setMerchants(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadMerchants()
  }, [])

  // Keyboard accessibility for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxPhoto) setLightboxPhoto(null)
        else if (standeeModalOpen) setStandeeModalOpen(false)
        else if (editModalOpen) setEditModalOpen(false)
        else if (modalOpen) setModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxPhoto, standeeModalOpen, editModalOpen, modalOpen])

  // Auto-suggest next machine ID (e.g. PB-005)
  const suggestNextKioskId = () => {
    const existingIds = merchants.map(m => m.kioskId).filter(Boolean)
    let n = 1
    while (existingIds.includes(`PB-${String(n).padStart(3, '0')}`)) {
      n++
    }
    return `PB-${String(n).padStart(3, '0')}`
  }

  const handleOpenAddModal = () => {
    setErrorMessage('')
    setShowPassword(false)
    setNewMerchant({
      name: '',
      storeName: '',
      email: '',
      username: '',
      password: 'merchant123',
      phone: '',
      address: '',
      kioskId: suggestNextKioskId(),
      commission: '0%',
      kioskPhotoUrl: '',
      paymentGateway: 'upiexpress',
      upiExpressApiKey: '',
      upiExpressUpiId: '',
      razorpayKeyId: '',
      razorpayKeySecret: '',
    })
    setModalOpen(true)
  }

  // Handle Photo File Upload
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, WEBP).')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setNewMerchant(prev => ({ ...prev, kioskPhotoUrl: base64 }))
      setErrorMessage('')
    }
    reader.readAsDataURL(file)
  }

  // Handle Drag & Drop Photo
  const handleDropPhoto = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please drop a valid image file (PNG, JPG, WEBP).')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setNewMerchant(prev => ({ ...prev, kioskPhotoUrl: base64 }))
      setErrorMessage('')
    }
    reader.readAsDataURL(file)
  }

  // Use Sample Photo for quick testing
  const handleUseSamplePhoto = () => {
    const randomPhoto = SAMPLE_KIOSK_PHOTOS[Math.floor(Math.random() * SAMPLE_KIOSK_PHOTOS.length)]
    setNewMerchant(prev => ({ ...prev, kioskPhotoUrl: randomPhoto }))
    setErrorMessage('')
  }

  // Handle Photo File Upload in Edit Modal
  const handleEditPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setEditErrorMessage('Please select a valid image file (PNG, JPG, WEBP).')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setEditingMerchant((prev: any) => ({ ...prev, kioskPhotoUrl: base64 }))
      setEditErrorMessage('')
    }
    reader.readAsDataURL(file)
  }

  // Handle Drag & Drop Photo in Edit Modal
  const handleEditDropPhoto = (e: React.DragEvent) => {
    e.preventDefault()
    setEditDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setEditErrorMessage('Please drop a valid image file (PNG, JPG, WEBP).')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setEditingMerchant((prev: any) => ({ ...prev, kioskPhotoUrl: base64 }))
      setEditErrorMessage('')
    }
    reader.readAsDataURL(file)
  }

  // Use Sample Photo in Edit Modal
  const handleEditUseSamplePhoto = () => {
    const randomPhoto = SAMPLE_KIOSK_PHOTOS[Math.floor(Math.random() * SAMPLE_KIOSK_PHOTOS.length)]
    setEditingMerchant((prev: any) => ({ ...prev, kioskPhotoUrl: randomPhoto }))
    setEditErrorMessage('')
  }

  const handleAddMerchant = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')

    if (!newMerchant.storeName.trim()) {
      setErrorMessage('Store / Venue Name is required.')
      return
    }
    if (!newMerchant.name.trim()) {
      setErrorMessage('Contact Person Name is required.')
      return
    }
    if (!newMerchant.phone.trim()) {
      setErrorMessage('Phone Number is required.')
      return
    }
    if (!newMerchant.email.trim()) {
      setErrorMessage('Email Address is required.')
      return
    }
    if (!newMerchant.kioskPhotoUrl || !newMerchant.kioskPhotoUrl.trim()) {
      setErrorMessage('Kiosk Photo is REQUIRED. Please upload a photo of the installed kiosk or select a sample photo.')
      return
    }

    const cleanUsername = (newMerchant.username || newMerchant.email.split('@')[0] || newMerchant.name.toLowerCase().replace(/\s+/g, '_')).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '')
    const cleanPassword = (newMerchant.password || 'merchant123').trim()

    setSubmitting(true)
    try {
      const payload = {
        name: newMerchant.name.trim(),
        storeName: newMerchant.storeName.trim(),
        email: newMerchant.email.trim(),
        username: cleanUsername,
        password: cleanPassword,
        phone: newMerchant.phone.trim(),
        address: newMerchant.address.trim(),
        kioskId: newMerchant.kioskId.trim().toUpperCase(),
        commission: newMerchant.commission,
        kioskPhotoUrl: newMerchant.kioskPhotoUrl,
        paymentGateway: newMerchant.paymentGateway,
        upiExpressApiKey: newMerchant.upiExpressApiKey.trim(),
        upiExpressUpiId: newMerchant.upiExpressUpiId.trim(),
        razorpayKeyId: newMerchant.razorpayKeyId.trim(),
        razorpayKeySecret: newMerchant.razorpayKeySecret.trim(),
      }

      const created = await createAdminMerchant(payload)
      setModalOpen(false)
      await loadMerchants()
      showToast(`✓ Partner ${newMerchant.storeName} onboarded successfully!`)

      const finalKioskId = created?.kioskId || newMerchant.kioskId.trim().toUpperCase()
      const qrUrl = created?.qrCodeUrl || getKioskPrintUrl(finalKioskId)

      setStandeeMerchant({
        ...created,
        kioskId: finalKioskId,
        storeName: newMerchant.storeName,
        name: newMerchant.name,
        kioskPhotoUrl: newMerchant.kioskPhotoUrl,
        qrCodeUrl: qrUrl,
      })
      setStandeeModalOpen(true)
    } catch (err: any) {
      console.error('Failed to create merchant:', err)
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to onboard merchant. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenEditModal = (m: any) => {
    setEditErrorMessage('')
    setShowEditPassword(false)
    setEditingMerchant({
      merchantId: m.merchantId,
      name: m.name || '',
      storeName: m.storeName || '',
      email: m.email || '',
      username: m.username || (m.email ? m.email.split('@')[0] : 'merchant'),
      password: '',
      currentPassword: m.password || 'merchant123',
      phone: m.phone || '',
      address: m.address || '',
      commission: m.commission || (m.commissionRate !== undefined ? `${Math.round(m.commissionRate * 100)}%` : '0%'),
      kioskId: m.kioskId || '',
      kioskPhotoUrl: m.kioskPhotoUrl || '',
      isBlocked: Boolean(m.isBlocked === true || m.status === 'BLOCKED'),
      status: m.status || (m.isBlocked ? 'BLOCKED' : 'ACTIVE'),
      requirePasswordChange: m.requirePasswordChange !== false,
      paymentGateway: m.paymentGateway || 'upiexpress',
      upiExpressApiKey: m.upiExpressApiKey || '',
      upiExpressUpiId: m.upiExpressUpiId || '',
      razorpayKeyId: m.razorpayKeyId || '',
      razorpayKeySecret: m.razorpayKeySecret || '',
    })
    setEditModalOpen(true)
  }

  const handleUpdateMerchant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMerchant) return
    setEditErrorMessage('')

    if (!editingMerchant.name.trim()) {
      setEditErrorMessage('Contact Person Name is required.')
      return
    }
    if (!editingMerchant.storeName.trim()) {
      setEditErrorMessage('Store / Venue Name is required.')
      return
    }
    if (!editingMerchant.email.trim()) {
      setEditErrorMessage('Email Address is required.')
      return
    }
    if (!editingMerchant.username.trim()) {
      setEditErrorMessage('Username is required.')
      return
    }

    setEditSubmitting(true)
    try {
      const payload: any = {
        name: editingMerchant.name.trim(),
        storeName: editingMerchant.storeName.trim(),
        email: editingMerchant.email.trim(),
        username: editingMerchant.username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, ''),
        phone: editingMerchant.phone.trim(),
        address: editingMerchant.address.trim(),
        commission: editingMerchant.commission,
        kioskId: editingMerchant.kioskId.trim().toUpperCase(),
        isBlocked: editingMerchant.isBlocked,
        status: editingMerchant.isBlocked ? 'BLOCKED' : 'ACTIVE',
        requirePasswordChange: Boolean(editingMerchant.requirePasswordChange),
        paymentGateway: editingMerchant.paymentGateway,
        upiExpressApiKey: editingMerchant.upiExpressApiKey.trim(),
        upiExpressUpiId: editingMerchant.upiExpressUpiId.trim(),
        razorpayKeyId: editingMerchant.razorpayKeyId.trim(),
        razorpayKeySecret: editingMerchant.razorpayKeySecret.trim(),
        kioskPhotoUrl: editingMerchant.kioskPhotoUrl ? editingMerchant.kioskPhotoUrl.trim() : '',
      }

      if (editingMerchant.password && editingMerchant.password.trim().length > 0) {
        payload.password = editingMerchant.password.trim()
      }

      await updateAdminMerchant(editingMerchant.merchantId, payload)
      setEditModalOpen(false)
      await loadMerchants()
      showToast(`✓ Profile for ${editingMerchant.storeName} updated successfully!`)
    } catch (err: any) {
      console.error('Failed to update merchant:', err)
      setEditErrorMessage(err.response?.data?.error || err.message || 'Failed to update merchant profile.')
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleToggleBlock = async (m: any) => {
    const isCurrentlyBlocked = m.isBlocked === true || m.status === 'BLOCKED'
    const actionWord = isCurrentlyBlocked ? 'unblock' : 'block'
    if (!window.confirm(`Are you sure you want to ${actionWord} ${m.storeName || m.name}?`)) {
      return
    }

    setBlockActionLoading(m.merchantId)
    try {
      if (isCurrentlyBlocked) {
        await unblockAdminMerchant(m.merchantId)
        showToast(`✓ Merchant ${m.storeName || m.name} has been unblocked.`)
      } else {
        await blockAdminMerchant(m.merchantId)
        showToast(`⛔ Merchant ${m.storeName || m.name} has been blocked and suspended.`)
      }
      await loadMerchants()
    } catch (err: any) {
      console.error('Failed to toggle block status:', err)
      alert(err.response?.data?.error || err.message || 'Could not update merchant status.')
    } finally {
      setBlockActionLoading(null)
    }
  }

  const handleOpenStandee = (m: any) => {
    const qrUrl = m.qrCodeUrl || getKioskPrintUrl(m.kioskId)
    setStandeeMerchant({
      ...m,
      qrCodeUrl: qrUrl,
    })
    setStandeeModalOpen(true)
    setCopied(false)
  }

  const handleCopyUrl = () => {
    if (!standeeMerchant) return
    const url = standeeMerchant.qrCodeUrl || getKioskPrintUrl(standeeMerchant.kioskId)
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleOpenMerchantPortal = (kioskId: string) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pb_active_merchant_kiosk', kioskId)
    }
    navigate(`/merchant/dashboard?kioskId=${kioskId}`)
  }

  const filtered = useMemo(() => {
    return merchants.filter(m => {
      const name = m.name || ''
      const store = m.storeName || ''
      const kioskId = m.kioskId || ''
      const phone = m.phone || ''
      const email = m.email || ''

      const matchesSearch =
        name.toLowerCase().includes(search.toLowerCase()) ||
        store.toLowerCase().includes(search.toLowerCase()) ||
        kioskId.toLowerCase().includes(search.toLowerCase()) ||
        phone.includes(search) ||
        email.toLowerCase().includes(search.toLowerCase())

      if (!matchesSearch) return false

      if (statusFilter === 'ONLINE') {
        return m.kioskStatus === 'ONLINE'
      }
      if (statusFilter === 'ATTENTION') {
        const paper = m.paperLevel ?? 0
        const toner = m.tonerLevel ?? 0
        return paper <= 20 || toner <= 20 || m.kioskStatus !== 'ONLINE'
      }

      return true
    })
  }, [merchants, search, statusFilter])

  const totalPayout = useMemo(() => {
    return merchants.reduce((sum, m) => sum + (m.mtdEarnings || 0), 0)
  }, [merchants])

  return (
    <div className="admin-page animate-fadeInUp">
      {/* ─── Top Header ─── */}
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="badge badge-online">Verified Venue Directory</span>
            <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
              {merchants.length} Host Partners Deployed
            </span>
          </div>
          <h1 className="admin-page__title">Merchant Partners &amp; Machine Standees</h1>
          <p className="admin-page__sub">
            Onboard venue hosts, pair isolated print kiosks, and generate turnkey customer print standees.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadMerchants}
            title="Refresh merchant list and printer telemetry"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowsClockwise size={16} weight="bold" />
            <span>Refresh</span>
          </button>

          <button className="btn btn-primary" onClick={handleOpenAddModal} id="add-merchant-btn">
            <Plus size={16} weight="bold" />
            <span>Onboard New Partner</span>
          </button>
        </div>
      </div>

      {/* ─── Partner Executive KPI Strip ─── */}
      <div className="merchants-kpi-grid">
        <div className="merchant-kpi-card">
          <div className="merchant-kpi-icon" style={{ background: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}>
            <Storefront size={22} weight="duotone" />
          </div>
          <div>
            <span className="merchant-kpi-label">Active Host Partners</span>
            <div className="merchant-kpi-val">{merchants.length}</div>
            <span className="merchant-kpi-sub">
              {merchants.filter(m => m.status === 'ACTIVE' || !m.status).length} Verified On-Site
            </span>
          </div>
        </div>

        <div className="merchant-kpi-card">
          <div className="merchant-kpi-icon" style={{ background: 'rgba(5, 150, 105, 0.1)', color: '#059669' }}>
            <CurrencyInr size={22} weight="duotone" />
          </div>
          <div>
            <span className="merchant-kpi-label">MTD Host Payouts</span>
            <div className="merchant-kpi-val">₹{totalPayout.toLocaleString('en-IN')}</div>
            <span className="merchant-kpi-sub">100% direct merchant revenue</span>
          </div>
        </div>

        <div className="merchant-kpi-card">
          <div className="merchant-kpi-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
            <Monitor size={22} weight="duotone" />
          </div>
          <div>
            <span className="merchant-kpi-label">Paired Standees</span>
            <div className="merchant-kpi-val">{merchants.length}</div>
            <span className="merchant-kpi-sub">100% paired with QR standees</span>
          </div>
        </div>

        <div className="merchant-kpi-card">
          <div className="merchant-kpi-icon" style={{ background: 'rgba(5, 150, 105, 0.1)', color: '#059669' }}>
            <Bank size={22} weight="duotone" />
          </div>
          <div>
            <span className="merchant-kpi-label">Platform Commission</span>
            <div className="merchant-kpi-val" style={{ color: '#059669' }}>0% Cut</div>
            <span className="merchant-kpi-sub">Direct UPI settlement</span>
          </div>
        </div>
      </div>

      {/* ─── Search & Status Filter Toolbar ─── */}
      <div className="merchants-toolbar">
        <div className="search-filter-wrap">
          <div style={{ position: 'relative', width: '100%' }}>
            <MagnifyingGlass
              size={16}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: 36, paddingRight: search ? 36 : 12 }}
              placeholder="Search store name, manager, phone, or kiosk ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted-foreground)',
                }}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="merchants-toolbar-controls">
          <div className="merchants-segment-group">
            <button
              type="button"
              className={`merchants-segment-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              <span>All Stores</span>
              <span className="merchants-segment-count">{merchants.length}</span>
            </button>
            <button
              type="button"
              className={`merchants-segment-btn ${statusFilter === 'ONLINE' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ONLINE')}
            >
              <span>Online</span>
              <span className="merchants-segment-count">
                {merchants.filter(m => m.kioskStatus === 'ONLINE').length}
              </span>
            </button>
            <button
              type="button"
              className={`merchants-segment-btn ${statusFilter === 'ATTENTION' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ATTENTION')}
            >
              <span>Needs Attention</span>
              <span className="merchants-segment-count">
                {merchants.filter(m => (m.paperLevel ?? 100) <= 20 || (m.tonerLevel ?? 100) <= 20 || m.kioskStatus !== 'ONLINE').length}
              </span>
            </button>
          </div>

          <Select
            title="Filter by Status"
            data={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(val) => setStatusFilter(val as any)}
            dropdownWidth={260}
            size="sm"
            align="right"
          />
        </div>
      </div>

      {/* ─── Merchants Table with Live Printer Status & QR Actions ─── */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="admin-table" style={{ minWidth: 920 }}>
            <thead>
              <tr>
                <th style={{ width: 68 }}>Photo</th>
                <th>Partner Store &amp; Venue</th>
                <th>Assigned Machine &amp; Telemetry</th>
                <th>Store Manager</th>
                <th>Payment Gateway</th>
                <th>Payout Model</th>
                <th>MTD Volume</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: 'var(--muted-foreground)' }}>
                    Loading partner merchants &amp; printer telemetry...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '56px 16px', color: 'var(--muted-foreground)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <Storefront size={40} weight="light" color="#94a3b8" />
                      {merchants.length === 0 ? (
                        <>
                          <p style={{ margin: 0, fontWeight: 700, color: 'var(--foreground)', fontSize: 14 }}>
                            No partner merchants onboarded yet
                          </p>
                          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted-foreground)', maxWidth: 440 }}>
                            Onboard host xerox shops, colleges, and libraries to pair hardware kiosks and generate standalone QR standees.
                          </p>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={handleOpenAddModal}
                            style={{ marginTop: 8 }}
                          >
                            <Plus size={14} weight="bold" />
                            <span>Onboard First Partner</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <p style={{ margin: 0, fontWeight: 600, color: 'var(--foreground)' }}>
                            No merchant partners match the current query
                          </p>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setSearch('')
                              setStatusFilter('ALL')
                            }}
                          >
                            Reset Filters
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((m: any) => {
                  const paper = m.paperLevel ?? 0
                  const toner = m.tonerLevel ?? 0
                  const paperClass = paper > 30 ? 'ok' : paper > 15 ? 'warn' : 'danger'
                  const tonerClass = toner > 30 ? 'ok' : toner > 15 ? 'warn' : 'danger'
                  const isOnline = m.kioskStatus === 'ONLINE'

                  return (
                    <tr key={m._id || m.merchantId || m.kioskId}>
                      {/* Photo */}
                      <td>
                        {m.kioskPhotoUrl ? (
                          <img
                            src={m.kioskPhotoUrl}
                            alt={`${m.storeName} Kiosk`}
                            className="merchant-photo-thumb"
                            title="Click to view full photo"
                            onClick={() => setLightboxPhoto(m.kioskPhotoUrl)}
                          />
                        ) : (
                          <div
                            className="merchant-photo-thumb"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--secondary)', color: 'var(--muted-foreground)' }}
                          >
                            <ImageIcon size={22} />
                          </div>
                        )}
                      </td>

                      {/* Store & Venue Info */}
                      <td>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: 14 }}>
                            {m.storeName || m.name}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <span className="mono">ID: {m.merchantId}</span>
                            {m.address && (
                              <>
                                <span>•</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <MapPin size={12} />
                                  <span>{m.address}</span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Machine & Consumables Telemetry */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              className="badge badge-accent mono font-bold credential-copy-pill"
                              onClick={() => {
                                navigator.clipboard.writeText(m.kioskId).catch(() => {})
                                setToastMessage(`Copied Kiosk ID ${m.kioskId} to clipboard!`)
                              }}
                              title="Click to copy Kiosk ID"
                            >
                              <span>{m.kioskId}</span>
                              <Copy size={10} className="copy-icon" />
                            </span>
                            <span className={`badge ${isOnline ? 'badge-online' : 'badge-danger'}`} style={{ fontSize: 10 }}>
                              {m.printerStatus || (isOnline ? 'ONLINE' : 'OFFLINE')}
                            </span>
                          </div>

                          {/* Live paper & toner telemetry bars */}
                          <div className="telemetry-gauge-wrap">
                            <div className="telemetry-row" title={`Paper Level: ${paper}%`}>
                              <span className="telemetry-label">Paper:</span>
                              <div className="telemetry-bar-bg">
                                <div className={`telemetry-bar-fill ${paperClass}`} style={{ width: `${paper}%` }} />
                              </div>
                              <span className="mono" style={{ fontSize: 11 }}>{paper}%</span>
                            </div>

                            <div className="telemetry-row" title={`Toner Level: ${toner}%`}>
                              <span className="telemetry-label">Toner:</span>
                              <div className="telemetry-bar-bg">
                                <div className={`telemetry-bar-fill ${tonerClass}`} style={{ width: `${toner}%` }} />
                              </div>
                              <span className="mono" style={{ fontSize: 11 }}>{toner}%</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Store Manager & Contact */}
                      <td>
                        <div>
                          <div style={{ color: 'var(--foreground)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span>{m.name}</span>
                            {m.isBlocked || m.status === 'BLOCKED' ? (
                              <span className="badge badge-danger merchant-status-badge--blocked" style={{ fontSize: 9.5, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Prohibit size={11} weight="bold" />
                                BLOCKED
                              </span>
                            ) : (
                              <span className="badge badge-online" style={{ fontSize: 9.5, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <CheckCircle size={11} weight="bold" />
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--muted-foreground)', display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                            <span
                              className="credential-copy-pill"
                              onClick={() => {
                                const un = m.username || (m.email ? m.email.split('@')[0] : 'merchant')
                                navigator.clipboard.writeText(un).catch(() => {})
                                setToastMessage(`Copied username "${un}" to clipboard!`)
                              }}
                              title="Click to copy username"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563eb', fontFamily: 'var(--font-mono)' }}
                            >
                              <At size={11} />
                              <strong>{m.username || (m.email ? m.email.split('@')[0] : 'merchant')}</strong>
                              <Copy size={10} className="copy-icon" />
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Phone size={11} />
                              <a href={`tel:${m.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                {m.phone}
                              </a>
                            </span>
                            {m.email && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.85 }}>
                                <EnvelopeSimple size={11} />
                                <a href={`mailto:${m.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                  {m.email}
                                </a>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Payment Gateway */}
                      <td>
                        {m.paymentGateway === 'razorpay' ? (
                          <span className="gateway-badge gateway-badge--razorpay">
                            <CreditCard size={13} weight="bold" />
                            <span>Razorpay</span>
                          </span>
                        ) : (
                          <span className="gateway-badge gateway-badge--upiexpress">
                            <Lightning size={13} weight="fill" />
                            <span>UPI Express</span>
                          </span>
                        )}
                      </td>

                      {/* Payout Model */}
                      <td>
                        <span className="badge badge-online" style={{ fontSize: 11 }}>
                          100% Direct (0% Cut)
                        </span>
                      </td>

                      {/* MTD Volume */}
                      <td>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--clr-success)', fontSize: 14 }}>
                          ₹{(m.mtdEarnings || 0).toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                          {m.bankName || 'Direct UPI'}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '5px 9px', fontSize: 11.5 }}
                            onClick={() => handleOpenEditModal(m)}
                            title="Edit Merchant Profile, Credentials & Status"
                          >
                            <PencilSimple size={14} />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            className={`btn btn-sm ${m.isBlocked || m.status === 'BLOCKED' ? 'btn-secondary' : 'btn-danger-outline'}`}
                            style={{
                              padding: '5px 9px',
                              fontSize: 11.5,
                              color: m.isBlocked || m.status === 'BLOCKED' ? '#059669' : '#dc2626',
                              borderColor: m.isBlocked || m.status === 'BLOCKED' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.35)',
                              background: m.isBlocked || m.status === 'BLOCKED' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                            }}
                            onClick={() => handleToggleBlock(m)}
                            disabled={blockActionLoading === m.merchantId}
                            title={m.isBlocked || m.status === 'BLOCKED' ? 'Unblock this merchant partner' : 'Block / suspend this merchant partner'}
                          >
                            {m.isBlocked || m.status === 'BLOCKED' ? (
                              <>
                                <LockOpen size={14} weight="bold" />
                                <span>Unblock</span>
                              </>
                            ) : (
                              <>
                                <Prohibit size={14} weight="bold" />
                                <span>Block</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{
                              padding: '5px 9px',
                              fontSize: 11.5,
                              color: '#c8ff00',
                              borderColor: 'rgba(200, 255, 0, 0.35)',
                              background: 'rgba(200, 255, 0, 0.08)',
                            }}
                            onClick={() => handleOpenHardwareKey(m)}
                            title="View Raspberry Pi Security Key & .env Configuration"
                          >
                            <Key size={14} weight="bold" />
                            <span>Key &amp; .env</span>
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '5px 9px', fontSize: 11.5 }}
                            onClick={() => handleOpenStandee(m)}
                            title="View / Print Machine QR Standee"
                          >
                            <QrCode size={14} />
                            <span>Standee</span>
                          </button>

                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ padding: '5px 9px', fontSize: 11.5 }}
                            onClick={() => handleOpenMerchantPortal(m.kioskId)}
                            title="Open isolated Merchant Portal for this location"
                          >
                            <Storefront size={14} />
                            <span>Portal</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ──────── Onboard Merchant Modal ──────── */}
      {modalOpen && createPortal(
        <div
          className="merchant-modal-backdrop"
          onClick={() => setModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Onboard Partner Merchant"
        >
          <div
            className="merchant-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="merchant-modal__header">
              <div>
                <h3 className="merchant-modal__title">
                  Onboard Partner Merchant
                </h3>
                <p className="merchant-modal__sub">
                  Pair a physical location with a PrintBooth kiosk machine and generate an isolated customer print standee.
                </p>
              </div>
              <button
                type="button"
                className="merchant-modal__close"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="merchant-modal__body">
              {errorMessage && (
                <div className="merchant-modal__error">
                  <span>⚠️</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleAddMerchant} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Row 1: Store Name & Manager Name */}
                <div className="merchant-form-row merchant-form-row--2">
                  <div className="merchant-form-group">
                    <label className="merchant-form-label">
                      Store / Venue Name <span className="req-star">*</span>
                    </label>
                    <div className="merchant-input-wrap">
                      <Storefront size={16} className="merchant-input-icon" />
                      <input
                        type="text"
                        className="merchant-input"
                        placeholder="e.g. Apex Cyber Hub & Prints"
                        required
                        value={newMerchant.storeName}
                        onChange={e => setNewMerchant({ ...newMerchant, storeName: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="merchant-form-group">
                    <label className="merchant-form-label">
                      Manager Name <span className="req-star">*</span>
                    </label>
                    <div className="merchant-input-wrap">
                      <User size={16} className="merchant-input-icon" />
                      <input
                        type="text"
                        className="merchant-input"
                        placeholder="e.g. Vikas Patil"
                        required
                        value={newMerchant.name}
                        onChange={e => setNewMerchant({ ...newMerchant, name: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Row 2: Phone & Email */}
                <div className="merchant-form-row merchant-form-row--2">
                  <div className="merchant-form-group">
                    <label className="merchant-form-label">
                      Phone Number <span className="req-star">*</span>
                    </label>
                    <div className="merchant-input-wrap">
                      <Phone size={16} className="merchant-input-icon" />
                      <input
                        type="tel"
                        className="merchant-input"
                        placeholder="+91 98220 12345"
                        required
                        value={newMerchant.phone}
                        onChange={e => setNewMerchant({ ...newMerchant, phone: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="merchant-form-group">
                    <label className="merchant-form-label">
                      Email Address <span className="req-star">*</span>
                    </label>
                    <div className="merchant-input-wrap">
                      <EnvelopeSimple size={16} className="merchant-input-icon" />
                      <input
                        type="email"
                        className="merchant-input"
                        placeholder="vikas@printbooth.in"
                        required
                        value={newMerchant.email}
                        onChange={e => setNewMerchant({ ...newMerchant, email: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Account Credentials & Access (Admin Decides Username & Password) */}
                <div className="merchant-credentials-card">
                  <div className="merchant-credentials-header">
                    <span className="merchant-credentials-title">
                      <Key size={16} weight="bold" color="#2563eb" />
                      <span>Partner Portal Credentials (Admin Assigned)</span>
                    </span>
                    <button
                      type="button"
                      className="generate-pass-btn"
                      onClick={() => {
                        const randomSuffix = Math.floor(1000 + Math.random() * 9000)
                        const baseUsername = newMerchant.name
                          ? newMerchant.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '')
                          : (newMerchant.email ? newMerchant.email.split('@')[0] : `host_${randomSuffix}`)
                        setNewMerchant(prev => ({
                          ...prev,
                          username: prev.username || baseUsername,
                          password: `Print#${randomSuffix}`,
                        }))
                      }}
                    >
                      ⚡ Auto-Generate
                    </button>
                  </div>

                  <div className="merchant-form-row merchant-form-row--2" style={{ margin: 0 }}>
                    <div className="merchant-form-group">
                      <label className="merchant-form-label">
                        Username <span className="req-star">*</span>
                      </label>
                      <div className="merchant-input-wrap">
                        <At size={16} className="merchant-input-icon" />
                        <input
                          type="text"
                          className="merchant-input merchant-input--mono"
                          placeholder="e.g. vikas_apex"
                          required
                          value={newMerchant.username}
                          onChange={e => setNewMerchant({ ...newMerchant, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '') })}
                        />
                      </div>
                    </div>

                    <div className="merchant-form-group">
                      <label className="merchant-form-label">
                        Security Password <span className="req-star">*</span>
                      </label>
                      <div className="password-input-wrap">
                        <Lock size={16} className="merchant-input-icon" style={{ position: 'absolute', left: 12, color: 'var(--muted-foreground)' }} />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="merchant-input merchant-input--mono"
                          style={{ paddingLeft: 36, paddingRight: 38 }}
                          placeholder="Create login password"
                          required
                          value={newMerchant.password}
                          onChange={e => setNewMerchant({ ...newMerchant, password: e.target.value })}
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowPassword(!showPassword)}
                          title={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: -4, fontSize: 11, color: 'var(--clr-text-3)' }}>
                    <ShieldCheck size={14} color="#059669" weight="bold" />
                    <span><strong>First Sign-In Security:</strong> When the partner logs in for the first time, a popup will prompt them to set their permanent private password.</span>
                  </div>
                </div>

                {/* Row 3: Machine ID & Commission */}
                <div className="merchant-form-row merchant-form-row--2">
                  <div className="merchant-form-group">
                    <label className="merchant-form-label">
                      Assigned Machine ID <span className="label-sub">(Auto-allocated)</span>
                    </label>
                    <div className="merchant-input-wrap">
                      <Monitor size={16} className="merchant-input-icon merchant-input-icon--accent" />
                      <input
                        type="text"
                        className="merchant-input merchant-input--mono"
                        placeholder="PB-005"
                        required
                        value={newMerchant.kioskId}
                        onChange={e => setNewMerchant({ ...newMerchant, kioskId: e.target.value.toUpperCase() })}
                      />
                    </div>
                  </div>

                  <div className="merchant-form-group">
                    <label className="merchant-form-label">Platform Take-Rate</label>
                    <input
                      type="text"
                      className="merchant-input merchant-input--disabled"
                      disabled
                      value="0% (100% Direct to Merchant)"
                    />
                  </div>
                </div>

                {/* Row 4: Store Installation Address */}
                <div className="merchant-form-group">
                  <label className="merchant-form-label">Store / Installation Address</label>
                  <div className="merchant-input-wrap">
                    <MapPin size={16} className="merchant-input-icon" />
                    <input
                      type="text"
                      className="merchant-input"
                      placeholder="e.g. Shop 12, MIT ADT Campus, Loni Kalbhor, Pune"
                      value={newMerchant.address}
                      onChange={e => setNewMerchant({ ...newMerchant, address: e.target.value })}
                    />
                  </div>
                </div>

                {/* Payment Gateway Provisioning */}
                <div className="merchant-form-group">
                  <label className="merchant-form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Kiosk Payment Gateway <span className="req-star">*</span></span>
                    <span className="label-sub">Active gateway on customer print page</span>
                  </label>

                  <div className="gateway-select-grid">
                    <button
                      type="button"
                      className={`gateway-card ${newMerchant.paymentGateway === 'upiexpress' ? 'selected' : ''}`}
                      onClick={() => setNewMerchant({ ...newMerchant, paymentGateway: 'upiexpress' })}
                    >
                      <div className="gateway-card__header">
                        <div className="gateway-card__title">
                          <Lightning size={18} weight="fill" color="#059669" />
                          <span>UPI Express</span>
                        </div>
                        <span className="gateway-badge gateway-badge--upiexpress" style={{ fontSize: 10 }}>
                          Recommended
                        </span>
                      </div>
                      <div className="gateway-card__desc">
                        Instant Dynamic UPI QR &amp; App Switch. 0% processing fee, direct merchant settlements.
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`gateway-card razorpay ${newMerchant.paymentGateway === 'razorpay' ? 'selected razorpay' : ''}`}
                      onClick={() => setNewMerchant({ ...newMerchant, paymentGateway: 'razorpay' })}
                    >
                      <div className="gateway-card__header">
                        <div className="gateway-card__title">
                          <CreditCard size={18} weight="bold" color="#2563eb" />
                          <span>Razorpay</span>
                        </div>
                        <span className="gateway-badge gateway-badge--razorpay" style={{ fontSize: 10 }}>
                          Multi-Mode
                        </span>
                      </div>
                      <div className="gateway-card__desc">
                        Comprehensive checkout supporting Credit/Debit Cards, NetBanking, Wallets, and UPI.
                      </div>
                    </button>
                  </div>
                </div>

                {/* Conditional Gateway Credentials / API details */}
                {newMerchant.paymentGateway === 'upiexpress' ? (
                  <div className="merchant-form-row merchant-form-row--2" style={{ background: 'rgba(5, 150, 105, 0.04)', padding: 12, borderRadius: 8, border: '1px solid rgba(5, 150, 105, 0.15)' }}>
                    <div className="merchant-form-group">
                      <label className="merchant-form-label">
                        Merchant UPI ID / VPA <span className="label-sub">(Settlement account)</span>
                      </label>
                      <div className="merchant-input-wrap">
                        <Bank size={16} className="merchant-input-icon" />
                        <input
                          type="text"
                          className="merchant-input"
                          placeholder="e.g. printbooth@okaxis"
                          value={newMerchant.upiExpressUpiId}
                          onChange={e => setNewMerchant({ ...newMerchant, upiExpressUpiId: e.target.value.trim() })}
                        />
                      </div>
                    </div>

                    <div className="merchant-form-group">
                      <label className="merchant-form-label">
                        UPI Express API Key <span className="label-sub">(Optional, uses master key if blank)</span>
                      </label>
                      <div className="merchant-input-wrap">
                        <Key size={16} className="merchant-input-icon" />
                        <input
                          type="text"
                          className="merchant-input merchant-input--mono"
                          placeholder="Leave empty for system default"
                          value={newMerchant.upiExpressApiKey}
                          onChange={e => setNewMerchant({ ...newMerchant, upiExpressApiKey: e.target.value.trim() })}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="merchant-form-row merchant-form-row--2" style={{ background: 'rgba(37, 99, 235, 0.04)', padding: 12, borderRadius: 8, border: '1px solid rgba(37, 99, 235, 0.15)' }}>
                    <div className="merchant-form-group">
                      <label className="merchant-form-label">
                        Razorpay Key ID <span className="label-sub">(Optional, uses master key if blank)</span>
                      </label>
                      <div className="merchant-input-wrap">
                        <Key size={16} className="merchant-input-icon" />
                        <input
                          type="text"
                          className="merchant-input merchant-input--mono"
                          placeholder="rzp_live_... or rzp_test_..."
                          value={newMerchant.razorpayKeyId}
                          onChange={e => setNewMerchant({ ...newMerchant, razorpayKeyId: e.target.value.trim() })}
                        />
                      </div>
                    </div>

                    <div className="merchant-form-group">
                      <label className="merchant-form-label">
                        Razorpay Key Secret <span className="label-sub">(Optional API secret)</span>
                      </label>
                      <div className="merchant-input-wrap">
                        <Key size={16} className="merchant-input-icon" />
                        <input
                          type="password"
                          className="merchant-input merchant-input--mono"
                          placeholder="API Secret Key"
                          value={newMerchant.razorpayKeySecret}
                          onChange={e => setNewMerchant({ ...newMerchant, razorpayKeySecret: e.target.value.trim() })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Required Kiosk Photo Upload */}
                <div className="merchant-form-group">
                  <div className="photo-label-row">
                    <label className="merchant-form-label" style={{ marginBottom: 0 }}>
                      Kiosk Physical Photo <span className="req-star">* (REQUIRED)</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleUseSamplePhoto}
                      className="sample-photo-btn"
                    >
                      Select Sample Photo
                    </button>
                  </div>

                  {newMerchant.kioskPhotoUrl ? (
                    <div className="photo-preview-box">
                      <img
                        src={newMerchant.kioskPhotoUrl}
                        alt="Kiosk Preview"
                        className="photo-preview-img"
                      />
                      <button
                        type="button"
                        className="photo-remove-btn"
                        onClick={() => setNewMerchant({ ...newMerchant, kioskPhotoUrl: '' })}
                        title="Remove photo"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`photo-dropzone ${dragActive ? 'drag-active' : ''}`}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => {
                        e.preventDefault()
                        setDragActive(true)
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={handleDropPhoto}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handlePhotoSelect}
                      />
                      <Camera size={32} color="var(--primary)" weight="duotone" />
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)' }}>
                          Click or drag to upload kiosk photo
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted-foreground)' }}>
                          Supports PNG, JPG, or WEBP (Max 10MB)
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="merchant-modal__footer">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setModalOpen(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={submitting}
                    id="submit-merchant-btn"
                  >
                    {submitting ? 'Registering & Generating Standee...' : 'Onboard Partner & Generate Standee'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ──────── QR STANDEE MODAL ──────── */}
      {standeeModalOpen && standeeMerchant && createPortal(
        <div
          className="merchant-modal-backdrop"
          onClick={() => setStandeeModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="QR Standee Desk Preview"
        >
          <div
            className="standee-modal-card"
            onClick={e => e.stopPropagation()}
          >
            {/* Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={20} color="var(--clr-success)" weight="fill" />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                  Machine Desk Standee Ready
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStandeeModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
                aria-label="Close Standee Modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Acrylic Standee Printable Card */}
            <div style={{ padding: 20 }}>
              <div className="standee-acrylic-card">
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#dc2626', marginBottom: 2 }}>
                  PrintBooth Cloud Kiosk
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>
                  {standeeMerchant.storeName || 'Host Partner'}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ background: '#fee2e2', color: '#dc2626', fontFamily: 'monospace', fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 4 }}>
                    Station {standeeMerchant.kioskId}
                  </span>
                  <span style={{
                    background: standeeMerchant.paymentGateway === 'razorpay' ? 'rgba(37,99,235,0.1)' : 'rgba(5,150,105,0.1)',
                    color: standeeMerchant.paymentGateway === 'razorpay' ? '#2563eb' : '#059669',
                    fontWeight: 700,
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}>
                    {standeeMerchant.paymentGateway === 'razorpay' ? '💳 Razorpay Gateway' : '⚡ UPI Express Gateway'}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>• Self-Service Document Station</span>
                </div>

                {/* QR Code SVG */}
                <div className="standee-qr-frame">
                  <QRCodeSVG
                    value={standeeMerchant.qrCodeUrl || getKioskPrintUrl(standeeMerchant.kioskId)}
                    size={190}
                    level="H"
                    includeMargin={false}
                  />
                </div>

                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                  Scan with Phone Camera to Print Documents
                </div>

                <div className="standee-instructions">
                  <div className="standee-step">
                    <span className="standee-step-num">1</span>
                    <span>Point phone camera at this QR code</span>
                  </div>
                  <div className="standee-step">
                    <span className="standee-step-num">2</span>
                    <span>Upload PDF, doc, or photo &amp; choose B&amp;W or Color</span>
                  </div>
                  <div className="standee-step">
                    <span className="standee-step-num">3</span>
                    <span>Collect your pages instantly from tray</span>
                  </div>
                </div>

                {/* Target URL Pill */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: '#475569',
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {standeeMerchant.qrCodeUrl || getKioskPrintUrl(standeeMerchant.kioskId)}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="standee-actions-grid">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleCopyUrl}
                  style={{ justifyContent: 'center' }}
                  title="Copy print page URL to clipboard"
                >
                  {copied ? <CheckCircle size={15} color="var(--clr-success)" weight="fill" /> : <Copy size={15} />}
                  <span>{copied ? 'Copied!' : 'Copy URL'}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => window.open(standeeMerchant.qrCodeUrl || getKioskPrintUrl(standeeMerchant.kioskId), '_blank')}
                  style={{ justifyContent: 'center' }}
                  title="Open live print page in new tab"
                >
                  <ArrowSquareOut size={15} />
                  <span>Open URL</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => window.print()}
                  style={{ justifyContent: 'center' }}
                  title="Print physical desk standee sheet"
                >
                  <Printer size={15} />
                  <span>Print</span>
                </button>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleOpenMerchantPortal(standeeMerchant.kioskId)}
                style={{ justifyContent: 'center', width: '100%' }}
              >
                <Storefront size={16} />
                <span>Open Isolated Merchant Portal ({standeeMerchant.kioskId})</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ──────── Lightbox Modal for Full-res Kiosk Photo ──────── */}
      {lightboxPhoto && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(5, 7, 15, 0.88)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: 24,
            boxSizing: 'border-box',
          }}
          onClick={() => setLightboxPhoto(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Kiosk Full-res Photo"
        >
          <div style={{ position: 'relative', maxWidth: 800, maxHeight: '85vh', animation: 'modalScaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }} onClick={e => e.stopPropagation()}>
            <img
              src={lightboxPhoto}
              alt="Kiosk Installation Fullview"
              style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)' }}
            />
            <button
              type="button"
              onClick={() => setLightboxPhoto(null)}
              style={{
                position: 'absolute',
                top: -12,
                right: -12,
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
              aria-label="Close Lightbox"
            >
              <X size={18} />
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ──────── Edit Merchant Profile & Credentials Modal ──────── */}
      {editModalOpen && editingMerchant && createPortal(
        <div
          className="merchant-modal-backdrop"
          onClick={() => setEditModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Edit Merchant Profile"
        >
          <div
            className="merchant-modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 680 }}
          >
            <div className="merchant-modal__header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="badge badge-accent mono font-bold">
                    {editingMerchant.merchantId}
                  </span>
                  <span className="badge badge-secondary mono">
                    {editingMerchant.kioskId}
                  </span>
                  {editingMerchant.isBlocked ? (
                    <span className="badge badge-danger merchant-status-badge--blocked" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Prohibit size={12} weight="bold" /> BLOCKED
                    </span>
                  ) : (
                    <span className="badge badge-online" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <CheckCircle size={12} weight="bold" /> ACTIVE
                    </span>
                  )}
                </div>
                <h3 className="merchant-modal__title">
                  Edit Merchant Profile &amp; Access
                </h3>
                <p className="merchant-modal__sub">
                  Update manager contact details, change username or login password, and manage portal access permissions.
                </p>
              </div>
              <button
                type="button"
                className="merchant-modal__close"
                onClick={() => setEditModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="merchant-modal__body">
              {editErrorMessage && (
                <div className="merchant-modal__error">
                  <span>⚠️</span>
                  <span>{editErrorMessage}</span>
                </div>
              )}

              {/* Account Status & Blocking Quick Banner */}
              <div className={`merchant-block-banner ${editingMerchant.isBlocked ? 'blocked' : 'active'}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {editingMerchant.isBlocked ? (
                    <ShieldWarning size={24} weight="fill" color="#dc2626" />
                  ) : (
                    <ShieldCheck size={24} weight="fill" color="#059669" />
                  )}
                  <div>
                    <strong style={{ display: 'block', fontSize: 13 }}>
                      {editingMerchant.isBlocked
                        ? 'Partner Account Suspended (Blocked)'
                        : 'Partner Account Active'}
                    </strong>
                    <span style={{ fontSize: 11.5, opacity: 0.9 }}>
                      {editingMerchant.isBlocked
                        ? 'Access to merchant dashboard and kiosk operations is currently blocked.'
                        : 'Merchant has normal access to their portal, financial records, and telemetry.'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className={`btn btn-sm ${editingMerchant.isBlocked ? 'btn-primary' : 'btn-danger-outline'}`}
                  style={{ whiteSpace: 'nowrap', padding: '6px 12px', fontSize: 12 }}
                  onClick={() => {
                    setEditingMerchant((prev: any) => ({
                      ...prev,
                      isBlocked: !prev.isBlocked,
                    }))
                  }}
                >
                  {editingMerchant.isBlocked ? (
                    <>
                      <LockOpen size={14} weight="bold" />
                      <span>Unblock Partner</span>
                    </>
                  ) : (
                    <>
                      <Prohibit size={14} weight="bold" />
                      <span>Block Partner</span>
                    </>
                  )}
                </button>
              </div>

              <form onSubmit={handleUpdateMerchant} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Account Credentials Card */}
                <div className="merchant-credentials-card">
                  <div className="merchant-credentials-header">
                    <span className="merchant-credentials-title">
                      <Key size={16} weight="bold" color="#2563eb" />
                      <span>Partner Portal Credentials &amp; Password</span>
                    </span>
                    <button
                      type="button"
                      className="generate-pass-btn"
                      onClick={() => {
                        const randomSuffix = Math.floor(1000 + Math.random() * 9000)
                        setEditingMerchant((prev: any) => ({
                          ...prev,
                          password: `Print#${randomSuffix}`,
                        }))
                        setShowEditPassword(true)
                      }}
                    >
                      ⚡ Generate New Password
                    </button>
                  </div>

                  <div className="merchant-form-row merchant-form-row--2" style={{ margin: 0 }}>
                    <div className="merchant-form-group">
                      <label className="merchant-form-label">
                        Username <span className="req-star">*</span>
                      </label>
                      <div className="merchant-input-wrap">
                        <At size={16} className="merchant-input-icon" />
                        <input
                          type="text"
                          className="merchant-input merchant-input--mono"
                          required
                          value={editingMerchant.username}
                          onChange={e => setEditingMerchant({ ...editingMerchant, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '') })}
                        />
                      </div>
                    </div>

                    <div className="merchant-form-group">
                      <label className="merchant-form-label">
                        Login Email <span className="req-star">*</span>
                      </label>
                      <div className="merchant-input-wrap">
                        <EnvelopeSimple size={16} className="merchant-input-icon" />
                        <input
                          type="email"
                          className="merchant-input"
                          required
                          value={editingMerchant.email}
                          onChange={e => setEditingMerchant({ ...editingMerchant, email: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Change Password Input */}
                  <div className="merchant-form-group" style={{ margin: 0 }}>
                    <label className="merchant-form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Change Security Password</span>
                      <span className="label-sub">Leave empty to keep existing password</span>
                    </label>
                    <div className="password-input-wrap">
                      <Lock size={16} className="merchant-input-icon" style={{ position: 'absolute', left: 12, color: 'var(--muted-foreground)' }} />
                      <input
                        type={showEditPassword ? 'text' : 'password'}
                        className="merchant-input merchant-input--mono"
                        style={{ paddingLeft: 36, paddingRight: 38 }}
                        placeholder="Enter new password (or leave blank to keep current)"
                        value={editingMerchant.password}
                        onChange={e => setEditingMerchant({ ...editingMerchant, password: e.target.value })}
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowEditPassword(!showEditPassword)}
                        title={showEditPassword ? 'Hide password' : 'Show password'}
                      >
                        {showEditPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {editingMerchant.currentPassword && !editingMerchant.password && (
                      <span style={{ fontSize: 11, color: 'var(--clr-text-4)', display: 'block', marginTop: 4 }}>
                        Current active password: <code style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--clr-bg-600)' }}>{editingMerchant.currentPassword}</code>
                      </span>
                    )}

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, cursor: 'pointer', color: 'var(--clr-text-2)' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(editingMerchant.requirePasswordChange)}
                        onChange={e => setEditingMerchant({ ...editingMerchant, requirePasswordChange: e.target.checked })}
                        style={{ accentColor: '#2563eb', width: 15, height: 15 }}
                      />
                      <span>Require partner to change password on next sign-in (first-time popup)</span>
                    </label>
                  </div>
                </div>

                {/* Profile Details: Store Name & Manager Name */}
                <div className="merchant-form-row merchant-form-row--2">
                  <div className="merchant-form-group">
                    <label className="merchant-form-label">
                      Store / Venue Name <span className="req-star">*</span>
                    </label>
                    <div className="merchant-input-wrap">
                      <Storefront size={16} className="merchant-input-icon" />
                      <input
                        type="text"
                        className="merchant-input"
                        required
                        value={editingMerchant.storeName}
                        onChange={e => setEditingMerchant({ ...editingMerchant, storeName: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="merchant-form-group">
                    <label className="merchant-form-label">
                      Contact Person Name <span className="req-star">*</span>
                    </label>
                    <div className="merchant-input-wrap">
                      <User size={16} className="merchant-input-icon" />
                      <input
                        type="text"
                        className="merchant-input"
                        required
                        value={editingMerchant.name}
                        onChange={e => setEditingMerchant({ ...editingMerchant, name: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Phone & Address */}
                <div className="merchant-form-row merchant-form-row--2">
                  <div className="merchant-form-group">
                    <label className="merchant-form-label">Phone Number</label>
                    <div className="merchant-input-wrap">
                      <Phone size={16} className="merchant-input-icon" />
                      <input
                        type="tel"
                        className="merchant-input"
                        value={editingMerchant.phone}
                        onChange={e => setEditingMerchant({ ...editingMerchant, phone: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="merchant-form-group">
                    <label className="merchant-form-label">Installation Address</label>
                    <div className="merchant-input-wrap">
                      <MapPin size={16} className="merchant-input-icon" />
                      <input
                        type="text"
                        className="merchant-input"
                        value={editingMerchant.address}
                        onChange={e => setEditingMerchant({ ...editingMerchant, address: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Machine ID & Commission */}
                <div className="merchant-form-row merchant-form-row--2">
                  <div className="merchant-form-group">
                    <label className="merchant-form-label">Assigned Kiosk ID</label>
                    <div className="merchant-input-wrap">
                      <Monitor size={16} className="merchant-input-icon merchant-input-icon--accent" />
                      <input
                        type="text"
                        className="merchant-input merchant-input--mono"
                        value={editingMerchant.kioskId}
                        onChange={e => setEditingMerchant({ ...editingMerchant, kioskId: e.target.value.toUpperCase() })}
                      />
                    </div>
                  </div>

                  <div className="merchant-form-group">
                    <label className="merchant-form-label">Platform Take-Rate</label>
                    <input
                      type="text"
                      className="merchant-input"
                      value={editingMerchant.commission}
                      onChange={e => setEditingMerchant({ ...editingMerchant, commission: e.target.value })}
                    />
                  </div>
                </div>

                {/* Kiosk Photo Upload / Update Section */}
                <div className="merchant-form-group">
                  <div className="photo-label-row">
                    <label className="merchant-form-label">
                      Physical Kiosk Installation Photo
                    </label>
                    <button
                      type="button"
                      className="sample-photo-btn"
                      onClick={handleEditUseSamplePhoto}
                      title="Select a high-resolution realistic kiosk setup"
                    >
                      Select Sample Photo
                    </button>
                  </div>

                  {editingMerchant.kioskPhotoUrl ? (
                    <div className="photo-preview-box">
                      <img
                        src={editingMerchant.kioskPhotoUrl}
                        alt="Kiosk Preview"
                        className="photo-preview-img"
                      />
                      <button
                        type="button"
                        className="photo-remove-btn"
                        onClick={() => setEditingMerchant((prev: any) => ({ ...prev, kioskPhotoUrl: '' }))}
                        title="Remove photo"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`photo-dropzone ${editDragActive ? 'drag-active' : ''}`}
                      onClick={() => fileInputEditRef.current?.click()}
                      onDragOver={e => {
                        e.preventDefault()
                        setEditDragActive(true)
                      }}
                      onDragLeave={() => setEditDragActive(false)}
                      onDrop={handleEditDropPhoto}
                    >
                      <input
                        type="file"
                        ref={fileInputEditRef}
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleEditPhotoSelect}
                      />
                      <Camera size={32} color="var(--primary)" weight="duotone" />
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)' }}>
                          Click or drag to upload kiosk photo
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted-foreground)' }}>
                          Supports PNG, JPG, or WEBP (Max 10MB)
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="merchant-modal__footer" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditModalOpen(false)}
                    disabled={editSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={editSubmitting}
                  >
                    {editSubmitting ? 'Saving Changes…' : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ──────── Hardware Key & .env Configuration Modal ──────── */}
      {hardwareKeyModalOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(10px)',
            padding: 16,
          }}
          onClick={() => setHardwareKeyModalOpen(false)}
        >
          <div
            style={{
              background: '#151517',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 680,
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 40px rgba(200, 255, 0, 0.08)',
              color: '#ffffff',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'rgba(200, 255, 0, 0.12)',
                    border: '1px solid rgba(200, 255, 0, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#c8ff00',
                  }}
                >
                  <Key size={22} weight="bold" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
                    Raspberry Pi Hardware Security Key
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#94a3b8' }}>
                    {activeHardwareKit?.kioskId ? (
                      <>Station <strong style={{ color: '#c8ff00' }}>{activeHardwareKit.kioskId}</strong> • {activeHardwareKit.storeName || activeHardwareKit.merchantName || 'Merchant Partner'}</>
                    ) : 'Hardware authentication credentials'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHardwareKeyModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px' }}>
              {loadingHardwareKit ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                  <ArrowsClockwise size={28} className="spin" style={{ marginBottom: 12 }} />
                  <p style={{ margin: 0, fontSize: 14 }}>Retrieving station cryptographic key &amp; config…</p>
                </div>
              ) : activeHardwareKit ? (
                <>
                  {/* Security Explainer Banner */}
                  <div
                    style={{
                      background: 'rgba(200, 255, 0, 0.05)',
                      border: '1px solid rgba(200, 255, 0, 0.2)',
                      borderRadius: 10,
                      padding: '14px 16px',
                      marginBottom: 20,
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <ShieldCheck size={20} color="#c8ff00" weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 12.5, color: '#e2e8f0', lineHeight: 1.5 }}>
                      <strong style={{ color: '#ffffff' }}>Isolated Hardware Cryptographic Pairing:</strong> Each Raspberry Pi must send this station ID and matching secret key with every request (heartbeat, polling orders, WebSocket, file download). Any unauthorized or forged request without this key is blocked immediately by the API server.
                    </div>
                  </div>

                  {/* 1. Device Secret Key Section */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Key size={15} color="#c8ff00" />
                        <span>Cryptographic Device Secret (KIOSK_SECRET)</span>
                      </label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', gap: 5 }}
                          onClick={() => setShowHardwareSecret(prev => !prev)}
                        >
                          {showHardwareSecret ? <EyeSlash size={13} /> : <Eye size={13} />}
                          <span>{showHardwareSecret ? 'Hide' : 'Reveal'}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', gap: 5 }}
                          onClick={() => {
                            navigator.clipboard.writeText(activeHardwareKit.deviceSecret)
                            setCopiedHardwareSecret(true)
                            setTimeout(() => setCopiedHardwareSecret(false), 2500)
                          }}
                        >
                          {copiedHardwareSecret ? <CheckCircle size={13} color="#22c55e" weight="bold" /> : <Copy size={13} />}
                          <span>{copiedHardwareSecret ? 'Copied Key!' : 'Copy Key'}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', gap: 5, color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.3)' }}
                          onClick={handleRotateHardwareKey}
                          disabled={rotatingHardwareSecret}
                          title="Generate a brand new cryptographic secret key for this station"
                        >
                          <ArrowsClockwise size={13} className={rotatingHardwareSecret ? 'spin' : ''} />
                          <span>{rotatingHardwareSecret ? 'Rotating…' : 'Rotate Key'}</span>
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        background: '#09090b',
                        padding: '12px 14px',
                        borderRadius: 8,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 13,
                        color: showHardwareSecret ? '#c8ff00' : '#94a3b8',
                        letterSpacing: showHardwareSecret ? '0.04em' : '0.12em',
                        userSelect: 'all',
                        wordBreak: 'break-all',
                      }}
                    >
                      {showHardwareSecret
                        ? activeHardwareKit.deviceSecret
                        : '••••••••••••••••••••••••••••••••••••••••••••••••'}
                    </div>
                  </div>

                  {/* 2. Ready-to-use .env configuration file */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                        Raspberry Pi .env File (<code style={{ color: '#c8ff00', fontSize: 12 }}>kiosk/brain/.env</code>)
                      </label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', gap: 5 }}
                          onClick={() => {
                            navigator.clipboard.writeText(activeHardwareKit.envContent)
                            setCopiedHardwareEnv(true)
                            setTimeout(() => setCopiedHardwareEnv(false), 2500)
                          }}
                        >
                          {copiedHardwareEnv ? <CheckCircle size={13} color="#22c55e" weight="bold" /> : <Copy size={13} />}
                          <span>{copiedHardwareEnv ? 'Copied .env!' : 'Copy .env File'}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', gap: 5 }}
                          onClick={handleDownloadEnv}
                        >
                          <DownloadSimple size={13} weight="bold" />
                          <span>Download .env</span>
                        </button>
                      </div>
                    </div>

                    <pre
                      style={{
                        background: '#09090b',
                        padding: '14px 16px',
                        borderRadius: 8,
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 12,
                        color: '#cbd5e1',
                        margin: 0,
                        overflowX: 'auto',
                        lineHeight: 1.5,
                      }}
                    >
                      {activeHardwareKit.envContent}
                    </pre>
                  </div>

                  {/* 3. Direct Setup Command */}
                  {activeHardwareKit.setupCommand && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                          One-Liner Terminal Setup Command
                        </label>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', gap: 5 }}
                          onClick={() => {
                            navigator.clipboard.writeText(activeHardwareKit.setupCommand)
                            setCopiedHardwareCommand(true)
                            setTimeout(() => setCopiedHardwareCommand(false), 2500)
                          }}
                        >
                          {copiedHardwareCommand ? <CheckCircle size={13} color="#22c55e" weight="bold" /> : <Copy size={13} />}
                          <span>{copiedHardwareCommand ? 'Copied!' : 'Copy Command'}</span>
                        </button>
                      </div>
                      <div
                        style={{
                          background: '#09090b',
                          padding: '12px 14px',
                          borderRadius: 8,
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontSize: 12,
                          color: '#38bdf8',
                          wordBreak: 'break-all',
                        }}
                      >
                        {activeHardwareKit.setupCommand}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8' }}>
                  No hardware credentials found.
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                justifyContent: 'flex-end',
                background: 'rgba(255, 255, 255, 0.02)',
              }}
            >
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ background: '#c8ff00', color: '#000000', borderColor: '#c8ff00', fontWeight: 700 }}
                onClick={() => setHardwareKeyModalOpen(false)}
              >
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ──────── Toast Feedback ──────── */}
      {toastMessage && (
        <div className="merchant-toast">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  )
}
