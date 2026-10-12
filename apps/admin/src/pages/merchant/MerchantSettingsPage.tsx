import { useState, useEffect } from 'react'
import {
  CheckCircle,
  FloppyDisk,
  MapPin,
  Crosshair,
  ArrowSquareOut,
  SpinnerGap,
  NavigationArrow,
  Headset,
  Bank,
  Lightning,
  CreditCard,
  Eye,
  EyeSlash,
  ShieldCheck,
  Camera,
  Copy,
  Warning,
} from '@phosphor-icons/react'
import { getMerchantSettings, updateMerchantSettings } from '@/lib/api'
import { useActiveMerchant } from '@/lib/merchantContext'
import KioskPhotoEditorModal from '@/components/KioskPhotoEditorModal'
import '../AdminPage.css'

export default function MerchantSettingsPage() {
  const { activeKioskId, activeMerchant, refreshMerchants } = useActiveMerchant()
  const [saved, setSaved] = useState(false)
  const [locating, setLocating] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [photoModalOpen, setPhotoModalOpen] = useState(false)
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null)
  const [locMsg, setLocMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [form, setForm] = useState({
    storeName: activeMerchant?.storeName || 'MIT ADT Campus Print Hub',
    contactPerson: activeMerchant?.name || 'Campus Print Desk Partner',
    phone: activeMerchant?.phone || '+91 90906 36363',
    whatsapp: (activeMerchant as any)?.whatsapp || '+919090636363',
    supportHours: (activeMerchant as any)?.supportHours || '8:30 AM - 9:30 PM (Mon-Sat)',
    supportNote: (activeMerchant as any)?.supportNote || 'Ground Floor, Central Reading Hall (Counter #1, next to turnstiles)',
    email: activeMerchant?.email || 'team1printbooth@gmail.com',
    address: activeMerchant?.address || 'Ground Floor, Central Reading Hall, MIT ADT Campus, Pune',
    lat: (activeMerchant as any)?.lat ?? 18.4912,
    lng: (activeMerchant as any)?.lng ?? 74.0253,
    city: 'Pune',
    pincode: '412201',
    openTime: '08:30',
    closeTime: '21:30',
    notifySms: true,
    notifyWhatsapp: true,
    notifyPaperLow: true,
    paymentGateway: (activeMerchant as any)?.paymentGateway || 'upiexpress',
    upiExpressApiKey: (activeMerchant as any)?.upiExpressApiKey || '',
    upiExpressUpiId: (activeMerchant as any)?.upiExpressUpiId || '',
    razorpayKeyId: (activeMerchant as any)?.razorpayKeyId || '',
    razorpayKeySecret: (activeMerchant as any)?.razorpayKeySecret || '',
    kioskPhotoUrl: activeMerchant?.kioskPhotoUrl || '',
  })

  useEffect(() => {
    let mounted = true
    async function load() {
      const data = await getMerchantSettings(activeKioskId)
      if (mounted && data) {
        setForm(prev => ({
          ...prev,
          storeName: data.storeName || prev.storeName,
          contactPerson: data.contactPerson || prev.contactPerson,
          phone: data.phone || prev.phone,
          whatsapp: data.whatsapp || prev.whatsapp,
          supportHours: data.supportHours || prev.supportHours,
          supportNote: data.supportNote || prev.supportNote,
          email: data.email || prev.email,
          address: data.address || prev.address,
          lat: data.lat !== undefined ? Number(data.lat) : prev.lat,
          lng: data.lng !== undefined ? Number(data.lng) : prev.lng,
          paymentGateway: data.paymentGateway || prev.paymentGateway || 'upiexpress',
          upiExpressApiKey: data.upiExpressApiKey !== undefined ? data.upiExpressApiKey : prev.upiExpressApiKey,
          upiExpressUpiId: data.upiExpressUpiId !== undefined ? data.upiExpressUpiId : prev.upiExpressUpiId,
          razorpayKeyId: data.razorpayKeyId !== undefined ? data.razorpayKeyId : prev.razorpayKeyId,
          razorpayKeySecret: data.razorpayKeySecret !== undefined ? data.razorpayKeySecret : prev.razorpayKeySecret,
          kioskPhotoUrl: data.kioskPhotoUrl || prev.kioskPhotoUrl,
        }))
      }
    }
    load()
    return () => { mounted = false }
  }, [activeKioskId])

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setLocMsg({ text: 'GPS Geolocation is not supported by your browser.', type: 'error' })
      return
    }
    setLocating(true)
    setLocMsg(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const detectedLat = Number(pos.coords.latitude.toFixed(6))
        const detectedLng = Number(pos.coords.longitude.toFixed(6))
        setForm((prev) => ({
          ...prev,
          lat: detectedLat,
          lng: detectedLng,
        }))
        setLocating(false)
        setLocMsg({ text: `Auto-detected GPS coordinates: ${detectedLat}, ${detectedLng} (±${Math.round(pos.coords.accuracy)}m accuracy)`, type: 'success' })
      },
      (err) => {
        setLocating(false)
        setLocMsg({ text: `GPS detection failed: ${err.message}. You can manually type coordinates or look up Google Maps.`, type: 'error' })
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    // Validate that merchant configured required keys for the selected gateway
    if (form.paymentGateway === 'upiexpress') {
      if (!form.upiExpressApiKey.trim()) {
        setErrorMsg('UPI Express is selected as your payment gateway, but your API Key is not configured. Please enter your UPI Express API Key.')
        return
      }
    } else if (form.paymentGateway === 'razorpay') {
      const hasSecret = form.razorpayKeySecret.trim() && form.razorpayKeySecret !== '••••••••'
      if (!form.razorpayKeyId.trim() || (!hasSecret && !(activeMerchant as any)?.razorpayKeySecret)) {
        setErrorMsg('Razorpay is selected as your payment gateway, but Key ID and Key Secret are not configured. Please enter both Razorpay credentials.')
        return
      }
    }

    try {
      const res: any = await updateMerchantSettings(form, activeKioskId)
      if (res && res.error) {
        setErrorMsg(res.error)
        return
      }
      if (refreshMerchants) {
        await refreshMerchants()
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Failed to update store settings.')
    }
  }

  const handleSaveModalPhoto = async (newPhotoUrl: string) => {
    setForm(prev => ({ ...prev, kioskPhotoUrl: newPhotoUrl }))
    await updateMerchantSettings({ ...form, kioskPhotoUrl: newPhotoUrl }, activeKioskId)
    if (refreshMerchants) {
      await refreshMerchants()
    }
  }

  return (
    <div className="admin-page animate-fadeInUp">
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="badge badge-online">Store Profile Active</span>
            <span style={{ fontSize: 13, color: 'var(--clr-text-3)' }}>
              Machine {activeKioskId} Host Profile • {activeMerchant?.storeName || 'Store'}
            </span>
          </div>
          <h1 className="admin-page__title">Store & Contact Settings</h1>
          <p className="admin-page__sub">Manage your venue operating hours, emergency alerts, and store profile</p>
        </div>

        <button type="submit" form="merchant-settings-form" className="btn btn-primary btn-sm">
          <FloppyDisk size={16} />
          <span>{saved ? 'Changes Saved ✓' : 'Save Changes'}</span>
        </button>
      </div>

      {errorMsg && (
        <div style={{ background: 'rgba(220, 38, 38, 0.08)', border: '1px solid #dc2626', padding: '12px 16px', borderRadius: 'var(--radius-md)', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
          <Warning size={20} weight="fill" />
          <span>{errorMsg}</span>
        </div>
      )}

      {saved && (
        <div style={{ background: 'var(--clr-success-dim)', border: '1px solid var(--clr-success)', padding: '12px 16px', borderRadius: 'var(--radius-md)', color: 'var(--clr-success)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <CheckCircle size={20} />
          <span>Store profile and alert configurations updated successfully!</span>
        </div>
      )}

      <form id="merchant-settings-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Business details */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card-header" style={{ padding: 0, marginBottom: 0 }}>
            <h2 className="card-title">Store & Venue Details</h2>
            <span className="card-meta">Station Venue & Emergency Contact Profile</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Store / Venue Name</label>
              <input
                type="text"
                className="form-input"
                value={form.storeName}
                onChange={e => setForm({ ...form, storeName: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Store Manager Contact</label>
              <input
                type="text"
                className="form-input"
                value={form.contactPerson}
                onChange={e => setForm({ ...form, contactPerson: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Mobile Number (For Urgent Alerts)</label>
              <input
                type="tel"
                className="form-input"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Store Street Address</label>
            <input
              type="text"
              className="form-input"
              value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">City</label>
              <input
                type="text"
                className="form-input"
                value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">PIN Code</label>
              <input
                type="text"
                className="form-input"
                value={form.pincode}
                onChange={e => setForm({ ...form, pincode: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* ─── Physical Kiosk Installation Photo Card ─── */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Camera size={20} color="var(--clr-accent-light, #38bdf8)" weight="bold" />
                <span>Physical Kiosk Installation Photo</span>
              </h2>
              <span className="card-meta">Photograph of the physical kiosk hardware station {activeKioskId} installed at your venue</span>
            </div>
            <button
              type="button"
              onClick={() => setPhotoModalOpen(true)}
              className="btn btn-secondary btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderColor: 'rgba(200, 255, 0, 0.35)',
                color: 'var(--clr-accent, #c8ff00)',
                background: 'rgba(200, 255, 0, 0.08)',
              }}
            >
              <Camera size={15} weight="bold" />
              <span>Change Photo</span>
            </button>
          </div>

          <div
            style={{
              position: 'relative',
              borderRadius: 12,
              overflow: 'hidden',
              height: 190,
              background: 'var(--clr-surface-2, #18181b)',
              border: '1px solid var(--clr-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            onClick={() => setPhotoModalOpen(true)}
            title="Click to change or upload new kiosk installation photo"
          >
            {form.kioskPhotoUrl ? (
              <img
                src={form.kioskPhotoUrl}
                alt={`${form.storeName} Kiosk Installation`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--clr-text-3)' }}>
                <Camera size={32} weight="duotone" color="var(--clr-accent)" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>No Installation Photo Uploaded</span>
                <span style={{ fontSize: 11.5, color: 'var(--clr-text-4)' }}>Click here to upload or select a preset photo</span>
              </div>
            )}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '8px 12px',
              background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
              color: '#fff',
            }}>
              <span style={{ fontWeight: 600 }}>{form.storeName}</span>
              <span style={{ fontFamily: 'monospace', background: 'rgba(200, 255, 0, 0.15)', color: '#c8ff00', padding: '2px 7px', borderRadius: 4 }}>
                {activeKioskId}
              </span>
            </div>
          </div>
        </div>

        {/* ─── On-Machine Customer Help & Mascot Contact Info ─── */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card-header" style={{ padding: 0, marginBottom: 0 }}>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Headset size={20} color="var(--clr-success)" weight="fill" />
              <span>Customer Help Mascot &amp; Machine Support Contact</span>
            </h2>
            <span className="card-meta">
              Exclusively displayed to customers using Machine <strong>{activeKioskId}</strong> via the sticky Mascot button. Only your machine shows this contact info. Customers contact you here for cash refunds, paper reload requests, or UPI verification.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Customer Direct WhatsApp Number</label>
              <input
                type="text"
                className="form-input"
                placeholder="+919090636363"
                value={form.whatsapp}
                onChange={e => setForm({ ...form, whatsapp: e.target.value })}
              />
              <span style={{ fontSize: 11, color: 'var(--clr-text-4)' }}>1-click WhatsApp chat opens for the user with prefilled order details</span>
            </div>

            <div className="form-group">
              <label className="form-label">Support &amp; Desk Working Hours</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 8:30 AM - 9:30 PM (Mon-Sat)"
                value={form.supportHours}
                onChange={e => setForm({ ...form, supportHours: e.target.value })}
              />
              <span style={{ fontSize: 11, color: 'var(--clr-text-4)' }}>Displayed to users so they know when on-site staff is available</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">On-Site Counter / Help Desk Location Note</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Ground Floor, Central Reading Hall (Counter #1, next to turnstiles)"
              value={form.supportNote}
              onChange={e => setForm({ ...form, supportNote: e.target.value })}
            />
            <span style={{ fontSize: 11, color: 'var(--clr-text-4)' }}>Where customers on-site can find you or your staff for physical assistance or cash refunds</span>
          </div>
        </div>

        {/* ─── Payment Gateway & API Integration ─── */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card-header" style={{ padding: 0, marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bank size={20} color="var(--clr-success)" weight="fill" />
                <span>Payment Gateway &amp; API Integration</span>
              </h2>
              <span className="card-meta">
                Configure which gateway processes payments on your Kiosk <strong>{activeKioskId}</strong> customer print page, and manage your API credentials.
              </span>
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className={`badge ${form.paymentGateway === 'razorpay' ? 'badge-primary' : 'badge-online'}`} style={{ fontSize: 11, padding: '4px 10px' }}>
                Active: {form.paymentGateway === 'razorpay' ? 'Razorpay Multi-Mode' : 'UPI Express (Instant)'}
              </span>
            </div>
          </div>

          {/* Gateway Switcher Cards */}
          <div className="form-group">
            <label className="form-label" style={{ marginBottom: 8 }}>Active Payment Gateway for this Station</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              <button
                type="button"
                className={`gateway-card ${form.paymentGateway === 'upiexpress' ? 'selected' : ''}`}
                onClick={() => setForm({ ...form, paymentGateway: 'upiexpress' })}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 16,
                  borderRadius: 10,
                  border: `2px solid ${form.paymentGateway === 'upiexpress' ? '#dc2626' : 'var(--clr-border, #e2e8f0)'}`,
                  background: form.paymentGateway === 'upiexpress' ? 'rgba(220, 38, 38, 0.06)' : 'var(--clr-surface-2, rgba(255,255,255,0.02))',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: 'var(--clr-text-1)' }}>
                    <Lightning size={18} weight="fill" color="#dc2626" />
                    <span>UPI Express</span>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(220,38,38,0.12)', color: '#dc2626' }}>
                    0% Take-Rate
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--clr-text-3)', lineHeight: 1.4 }}>
                  Fastest UPI checkout for students and customers. Dynamic QR generation, mobile intent app switcher, and direct bank settlement.
                </div>
              </button>

              <button
                type="button"
                className={`gateway-card ${form.paymentGateway === 'razorpay' ? 'selected' : ''}`}
                onClick={() => setForm({ ...form, paymentGateway: 'razorpay' })}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 16,
                  borderRadius: 10,
                  border: `2px solid ${form.paymentGateway === 'razorpay' ? '#2563eb' : 'var(--clr-border, #e2e8f0)'}`,
                  background: form.paymentGateway === 'razorpay' ? 'rgba(37, 99, 235, 0.08)' : 'var(--clr-surface-2, rgba(255,255,255,0.02))',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: 'var(--clr-text-1)' }}>
                    <CreditCard size={18} weight="bold" color="#2563eb" />
                    <span>Razorpay Checkout</span>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(37,99,235,0.15)', color: '#2563eb' }}>
                    Multi-Method
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--clr-text-3)', lineHeight: 1.4 }}>
                  Accept Credit/Debit Cards, NetBanking from 50+ banks, Wallets (Paytm/Mobikwik), and standard UPI interfaces.
                </div>
              </button>
            </div>
          </div>

          {/* Credentials Inputs based on selected gateway */}
          {form.paymentGateway === 'upiexpress' ? (
            <div style={{ background: 'rgba(220, 38, 38, 0.04)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid rgba(220, 38, 38, 0.18)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#dc2626' }}>
                  <ShieldCheck size={18} weight="fill" />
                  <span>UPI Express Gateway API Configuration</span>
                </div>
                {!form.upiExpressApiKey.trim() && (
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: 'rgba(220, 38, 38, 0.15)', color: '#dc2626' }}>
                    KEY NOT CONFIGURED
                  </span>
                )}
              </div>

              {!form.upiExpressApiKey.trim() && (
                <div style={{ background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.3)', padding: '10px 14px', borderRadius: 8, color: '#dc2626', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Warning size={18} weight="bold" />
                  <span>API Key is not configured for UPI Express. You must enter your API Key below to accept customer payments on this machine.</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Merchant UPI Express API Key</span>
                    <span style={{ fontSize: 11, color: 'var(--clr-text-3)' }}>Direct settlement</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Enter your UPI Express API Key"
                      value={form.upiExpressApiKey}
                      onChange={e => setForm({ ...form, upiExpressApiKey: e.target.value.trim() })}
                      style={{ paddingRight: 40, fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--clr-text-3)' }}
                    >
                      {showSecret ? <EyeSlash size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--clr-text-4)' }}>
                    All customer QR payments for Kiosk {activeKioskId} are dynamically generated via this key and credited directly to your bank account.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>UPI Express Webhook URL</span>
                    <span style={{ fontSize: 11, color: 'var(--clr-text-3)' }}>Real-time payment notification</span>
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      className="form-input"
                      readOnly
                      value={typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:5000/api/upiexpress/webhook' : 'https://api.printbooth.co.in/api/upiexpress/webhook'}
                      style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, background: 'rgba(0,0,0,0.03)', color: 'var(--clr-text-2)' }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ whiteSpace: 'nowrap', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => {
                        const url = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:5000/api/upiexpress/webhook' : 'https://api.printbooth.co.in/api/upiexpress/webhook'
                        navigator.clipboard.writeText(url)
                        setCopiedWebhook('upiexpress')
                        setTimeout(() => setCopiedWebhook(null), 2000)
                      }}
                    >
                      {copiedWebhook === 'upiexpress' ? <CheckCircle size={14} color="#16a34a" weight="fill" /> : <Copy size={14} />}
                      <span>{copiedWebhook === 'upiexpress' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--clr-text-4)' }}>
                    Paste this into your UPI Express portal. PrintBooth instantly unlocks and starts physical printing when this webhook receives the success JSON.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: 'rgba(37, 99, 235, 0.04)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid rgba(37, 99, 235, 0.2)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#2563eb' }}>
                  <ShieldCheck size={18} weight="fill" />
                  <span>Razorpay API Credentials (Per-Kiosk)</span>
                </div>
                {(!form.razorpayKeyId.trim() || (!form.razorpayKeySecret.trim() && !(activeMerchant as any)?.razorpayKeySecret)) && (
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: 'rgba(220, 38, 38, 0.15)', color: '#dc2626' }}>
                    KEYS NOT CONFIGURED
                  </span>
                )}
              </div>

              {(!form.razorpayKeyId.trim() || (!form.razorpayKeySecret.trim() && !(activeMerchant as any)?.razorpayKeySecret)) && (
                <div style={{ background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.3)', padding: '10px 14px', borderRadius: 8, color: '#dc2626', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Warning size={18} weight="bold" />
                  <span>Key ID and Key Secret are not configured for Razorpay. You must enter both credentials below to accept customer payments on this machine.</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Razorpay Key ID</span>
                    <span style={{ fontSize: 11, color: 'var(--clr-text-3)' }}>rzp_test_... or rzp_live_...</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="rzp_live_..."
                    value={form.razorpayKeyId}
                    onChange={e => setForm({ ...form, razorpayKeyId: e.target.value.trim() })}
                    style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--clr-text-4)' }}>Public Key ID for Razorpay Checkout on this kiosk</span>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Razorpay Key Secret</span>
                    <span style={{ fontSize: 11, color: 'var(--clr-text-3)' }}>Webhook / order signature key</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      className="form-input"
                      placeholder={form.razorpayKeySecret === '••••••••' ? '•••••••• (Configured)' : 'Enter Razorpay Secret'}
                      value={form.razorpayKeySecret}
                      onChange={e => setForm({ ...form, razorpayKeySecret: e.target.value.trim() })}
                      style={{ paddingRight: 40, fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--clr-text-3)' }}
                    >
                      {showSecret ? <EyeSlash size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--clr-text-4)' }}>Private API secret used for backend order creation &amp; HMAC-SHA256 signature verification</span>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 2 }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Razorpay Webhook Callback URL</span>
                  <span style={{ fontSize: 11, color: 'var(--clr-text-3)' }}>Webhook for payment.captured</span>
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    className="form-input"
                    readOnly
                    value={typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:5000/api/razorpay/webhook' : 'https://api.printbooth.co.in/api/razorpay/webhook'}
                    style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, background: 'rgba(0,0,0,0.03)', color: 'var(--clr-text-2)' }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ whiteSpace: 'nowrap', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => {
                      const url = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:5000/api/razorpay/webhook' : 'https://api.printbooth.co.in/api/razorpay/webhook'
                      navigator.clipboard.writeText(url)
                      setCopiedWebhook('razorpay')
                      setTimeout(() => setCopiedWebhook(null), 2000)
                    }}
                  >
                    {copiedWebhook === 'razorpay' ? <CheckCircle size={14} color="#16a34a" weight="fill" /> : <Copy size={14} />}
                    <span>{copiedWebhook === 'razorpay' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--clr-text-4)' }}>
                  Set in your Razorpay Dashboard &rarr; Settings &rarr; Webhooks (event: <code>payment.captured</code>).
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Machine Geolocation Coordinates */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card-header" style={{ padding: 0, marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={20} color="var(--clr-accent)" weight="fill" />
                <span>Machine GPS Geolocation (Lat &amp; Lon)</span>
              </h2>
              <span className="card-meta">
                Used to calculate real-time walking distance and show nearest machine effects to customers on printbooth.in
              </span>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleDetectLocation}
              disabled={locating}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {locating ? <SpinnerGap size={16} className="animate-spin" /> : <Crosshair size={16} weight="bold" color="var(--clr-accent)" />}
              <span>{locating ? 'Acquiring GPS...' : 'Detect Current GPS Location'}</span>
            </button>
          </div>

          {locMsg && (
            <div style={{
              background: locMsg.type === 'success' ? 'var(--clr-success-dim, rgba(16,185,129,0.1))' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${locMsg.type === 'success' ? 'var(--clr-success, #10b981)' : '#ef4444'}`,
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              fontSize: 13,
              color: locMsg.type === 'success' ? 'var(--clr-success, #10b981)' : '#ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              {locMsg.type === 'success' ? <CheckCircle size={16} /> : <MapPin size={16} />}
              <span>{locMsg.text}</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Latitude (°N)</span>
                <span style={{ fontSize: 11, color: 'var(--clr-text-3)' }}>e.g. 18.520430</span>
              </label>
              <input
                type="number"
                step="any"
                className="form-input"
                placeholder="18.5204"
                value={form.lat}
                onChange={e => setForm({ ...form, lat: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Longitude (°E)</span>
                <span style={{ fontSize: 11, color: 'var(--clr-text-3)' }}>e.g. 73.843120</span>
              </label>
              <input
                type="number"
                step="any"
                className="form-input"
                placeholder="73.8431"
                value={form.lng}
                onChange={e => setForm({ ...form, lng: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '12px 14px', background: 'var(--clr-surface-2, rgba(255,255,255,0.03))', borderRadius: 'var(--radius-md)', border: '1px solid var(--clr-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--clr-text-2)' }}>
              <NavigationArrow size={16} color="var(--clr-accent)" />
              <span>Current Pin: <strong>{Number(form.lat || 0).toFixed(5)}, {Number(form.lng || 0).toFixed(5)}</strong></span>
            </div>

            <a
              href={`https://www.google.com/maps?q=${form.lat},${form.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--clr-accent-light, #38bdf8)', textDecoration: 'none' }}
            >
              <span>Verify on Google Maps</span>
              <ArrowSquareOut size={15} />
            </a>
          </div>
        </div>

        {/* Operating hours */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card-header" style={{ padding: 0, marginBottom: 0 }}>
            <h2 className="card-title">Kiosk Availability Hours</h2>
            <span className="card-meta">Hours when customers can enter your store to collect documents</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Store Opens</label>
              <input
                type="time"
                className="form-input"
                value={form.openTime}
                onChange={e => setForm({ ...form, openTime: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Store Closes</label>
              <input
                type="time"
                className="form-input"
                value={form.closeTime}
                onChange={e => setForm({ ...form, closeTime: e.target.value })}
              />
            </div>
          </div>
        </div>
      </form>

      {/* Kiosk Installation Photo Modal */}
      <KioskPhotoEditorModal
        isOpen={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        kioskId={activeKioskId}
        venueName={form.storeName}
        currentPhotoUrl={form.kioskPhotoUrl}
        onSave={handleSaveModalPhoto}
        title="Update Kiosk Installation Photo"
        subtitle={`Set the official photo of your hardware station ${activeKioskId} displayed to campus users.`}
      />
    </div>
  )
}
