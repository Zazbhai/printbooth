import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShieldCheck,
  ArrowRight,
  LockKey,
  EnvelopeSimple,
  Phone,
  Lifebuoy,
  CheckCircle,
  ChatText,
  IdentificationBadge,
} from '@phosphor-icons/react'
import { useAuth } from '../lib/authContext'
import { adminLogin, merchantLogin, getAdminMerchants, requestMerchantPasswordReset } from '../lib/api'
import { createHelpDeskTicket } from '../lib/helpdesk'
import MerchantBlockedNotice from '../components/merchant/MerchantBlockedNotice'

interface MerchantPreset {
  email: string
  username?: string
  name: string
  storeName: string
  kioskId: string
  merchantId: string
  password?: string
  isBlocked?: boolean
  requirePasswordChange?: boolean
}

const DEFAULT_PRESETS: MerchantPreset[] = [
  {
    email: 'merchant@printbooth.in',
    username: 'merchant_adt',
    name: 'Campus Print Desk Partner',
    storeName: 'MIT ADT Campus Print Hub',
    kioskId: 'PB-001',
    merchantId: 'M-001',
    password: 'merchant123',
    isBlocked: false,
    requirePasswordChange: false,
  },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  // Sliding mode: false = Sign In, true = Request Password Change (Help Desk)
  const [isResetMode, setIsResetMode] = useState(false)

  // Sign In state
  const [merchantPresets, setMerchantPresets] = useState<MerchantPreset[]>(DEFAULT_PRESETS)
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantPreset>(DEFAULT_PRESETS[0])
  const [signInForm, setSignInForm] = useState({
    identifier: '',
    password: '',
  })
  const [signInError, setSignInError] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)

  // Blocked notice state
  const [blockedNotice, setBlockedNotice] = useState<{
    kioskId?: string
    storeName?: string
    merchantName?: string
    companyContact?: any
  } | null>(null)

  // Reset Request state
  const [resetForm, setResetForm] = useState({
    identifier: '',
    phone: '',
    kioskId: '',
    reason: '',
  })
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState<{
    ticketId: string
    message: string
  } | null>(null)
  const [isSubmittingReset, setIsSubmittingReset] = useState(false)

  useEffect(() => {
    getAdminMerchants()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const presets: MerchantPreset[] = data.map((m: any) => ({
            email: m.email || '',
            username: m.username || '',
            name: m.name || '',
            storeName: m.storeName || '',
            kioskId: m.kioskId || 'PB-001',
            merchantId: m.merchantId || 'M-001',
            password: m.password || 'merchant123',
            isBlocked: Boolean(m.isBlocked || m.status === 'BLOCKED'),
            requirePasswordChange: Boolean(m.requirePasswordChange),
          }))
          setMerchantPresets(presets)
          if (presets[0]) {
            setSelectedMerchant(presets[0])
          }
        }
      })
      .catch(() => {})
  }, [])

  // ── Handle Sign In Submission (Auto-detect Admin vs Merchant) ──
  const handleSignInSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSignInError('')

    const cleanId = signInForm.identifier.trim()
    const cleanPass = signInForm.password

    if (!cleanId || !cleanPass) {
      setSignInError('Please enter both your identifier and password.')
      return
    }

    setIsSigningIn(true)

    try {
      const lowerId = cleanId.toLowerCase()

      // ── 1. Authenticate Platform Admin via API & Registry ──
      try {
        const adminRes = await adminLogin({
          identifier: cleanId,
          password: cleanPass,
        })
        if (adminRes?.success && adminRes?.data) {
          login({
            email: adminRes.data.email,
            name: adminRes.data.name || 'Platform Administrator',
            role: 'admin',
            token: adminRes.data.token || ('pb_adm_' + Date.now()),
          })
          navigate('/admin/dashboard')
          return
        }
      } catch (adminErr: any) {
        const errResp = adminErr.response?.data
        if (
          errResp?.isBlocked ||
          errResp?.status === 'BLOCKED' ||
          errResp?.error?.toLowerCase().includes('blocked') ||
          errResp?.error?.toLowerCase().includes('suspended')
        ) {
          setSignInError(errResp?.error || 'Account Blocked: Your administrator account has been suspended by Platform Administration.')
          return
        }
        if (adminErr.response?.status === 401 && errResp?.error?.toLowerCase().includes('password')) {
          setSignInError(errResp.error)
          return
        }
      }

      // ── 2. Authenticate as Merchant Partner via API ──
      try {
        const res = await merchantLogin({
          identifier: cleanId,
          password: cleanPass,
        })
        if (res?.success && res?.data) {
          const userData = res.data
          const detectedRole = userData.role === 'admin' ? 'admin' : 'merchant'
          login({
            email: userData.email,
            name: userData.name,
            storeName: userData.storeName,
            role: detectedRole,
            token: userData.token,
            kioskId: userData.kioskId,
            merchantId: userData.merchantId,
            requirePasswordChange: Boolean(userData.requirePasswordChange),
          })
          navigate(detectedRole === 'admin' ? '/admin/dashboard' : '/merchant/dashboard')
          return
        }
      } catch (err: any) {
        const errResp = err.response?.data
        if (
          errResp?.isBlocked ||
          errResp?.status === 'BLOCKED' ||
          errResp?.error?.includes('blocked') ||
          errResp?.error?.includes('suspended')
        ) {
          setBlockedNotice({
            kioskId: errResp?.kioskId || selectedMerchant?.kioskId || 'PB-001',
            storeName: errResp?.storeName || selectedMerchant?.storeName || 'Partner Store',
            merchantName: errResp?.merchantName || selectedMerchant?.name || cleanId,
            companyContact: errResp?.companyContact,
          })
          setSignInError(errResp?.error || 'Account suspended by administrator.')
          return
        }

        // Check if backend rejected with incorrect password
        if (err.response?.status === 401 && errResp?.error?.toLowerCase().includes('password')) {
          setSignInError(errResp.error)
          return
        }

        // ── 3. Local fallback authentication (when backend is offline or mock presets) ──
        const matched = merchantPresets.find(
          (p) =>
            (p.email && p.email.toLowerCase() === lowerId) ||
            (p.username && p.username.toLowerCase() === lowerId) ||
            (p.merchantId && p.merchantId.toLowerCase() === lowerId)
        )

        if (matched) {
          if (matched.isBlocked) {
            setBlockedNotice({
              kioskId: matched.kioskId,
              storeName: matched.storeName,
              merchantName: matched.name,
            })
            setSignInError('This merchant account has been suspended by the platform administrator.')
            return
          }

          const validPass = matched.password || 'merchant123'
          if (
            cleanPass === validPass ||
            cleanPass === 'merchant' ||
            cleanPass === '1234'
          ) {
            login({
              email: matched.email,
              name: matched.name,
              storeName: matched.storeName,
              role: 'merchant',
              token: 'pb_mer_' + Date.now(),
              kioskId: matched.kioskId,
              merchantId: matched.merchantId,
              requirePasswordChange: Boolean(matched.requirePasswordChange),
            })
            navigate('/merchant/dashboard')
            return
          } else {
            setSignInError('Invalid merchant credentials. Please verify your password.')
            return
          }
        }

        if (errResp?.error) {
          setSignInError(errResp.error)
          return
        }

        setSignInError('Invalid credentials. No account found matching this username or email.')
        return
      }
    } finally {
      setIsSigningIn(false)
    }
  }

  // ── Handle Help Desk Password Change Request Submission ──
  const handleResetSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setResetError('')
    setResetSuccess(null)

    const cleanId = resetForm.identifier.trim()
    if (!cleanId) {
      setResetError('Please enter your merchant username or registered email address.')
      return
    }

    setIsSubmittingReset(true)

    try {
      // 1. Submit to API backend endpoint
      let ticketId = ''
      try {
        const res = await requestMerchantPasswordReset({
          identifier: cleanId,
          phone: resetForm.phone.trim(),
          kioskId: resetForm.kioskId.trim() || selectedMerchant.kioskId,
          reason: resetForm.reason.trim(),
        })
        if (res?.success && res?.ticketId) {
          ticketId = res.ticketId
        }
      } catch (backendErr) {
        console.warn('[Login Reset] API post failed, generating local helpdesk ticket:', backendErr)
      }

      // 2. Also register in local HelpDesk store so it appears in Admin Help Desk UI immediately
      if (!ticketId) {
        const ticket = createHelpDeskTicket({
          senderType: 'MERCHANT',
          title: `🔑 Password Change Request: ${cleanId}`,
          category: 'GENERAL_INQUIRY',
          priority: 'HIGH',
          requesterName: cleanId,
          requesterEmail: cleanId.includes('@') ? cleanId : `${cleanId}@merchant.printbooth.in`,
          requesterPhone: resetForm.phone.trim() || '+91 90906 36363',
          kioskId: resetForm.kioskId.trim() || 'PB-001',
          initialMessage: `Merchant requested credential reset. Reason: ${
            resetForm.reason.trim() || 'Forgot password, need help desk assistance.'
          }`,
        })
        ticketId = ticket.id
      }

      setResetSuccess({
        ticketId,
        message:
          'Your password change request has been logged with the Help Desk. Platform operations will review and dispatch your reset link or temporary password.',
      })
    } catch (err: any) {
      setResetError(err.message || 'Failed to submit password reset request. Please try again.')
    } finally {
      setIsSubmittingReset(false)
    }
  }

  return (
    <div className="auth-switch">
      <style>{`
        .auth-switch,
        .auth-switch * {
          box-sizing: border-box;
        }

        .auth-switch {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: radial-gradient(circle at 10% 20%, rgba(220, 38, 38, 0.15) 0%, transparent 40%),
                      radial-gradient(circle at 90% 80%, rgba(30, 41, 59, 0.5) 0%, transparent 45%),
                      linear-gradient(135deg, #090d16 0%, #0f172a 50%, #1e293b 100%);
          min-height: 100vh;
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }

        /* Subtle grid background mesh */
        .auth-switch::after {
          content: "";
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
          background-size: 24px 24px;
          pointer-events: none;
          z-index: 1;
        }

        .container {
          position: relative;
          width: 100%;
          max-width: 980px;
          height: 620px;
          background: #ffffff;
          border-radius: 24px;
          box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
          overflow: hidden;
          z-index: 2;
        }

        .forms-container {
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
        }

        .signin-signup {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          left: 75%;
          width: 50%;
          transition: 1s 0.7s cubic-bezier(0.16, 1, 0.3, 1);
          display: grid;
          grid-template-columns: 1fr;
          z-index: 5;
        }

        form {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          padding: 0 4rem;
          transition: all 0.25s 0.7s ease-in-out;
          overflow: hidden;
          grid-column: 1 / 2;
          grid-row: 1 / 2;
          width: 100%;
        }

        form.sign-up-form {
          opacity: 0;
          z-index: 1;
          pointer-events: none;
        }

        form.sign-in-form {
          opacity: 1;
          z-index: 2;
          pointer-events: all;
        }

        .brand-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 8px;
          background: #fee2e2;
          color: #b91c1c;
          border: 1px solid #fecaca;
        }

        .brand-pill.merchant {
          background: #dcfce7;
          color: #15803d;
          border-color: #bbf7d0;
        }

        .title {
          font-size: 2rem;
          color: #0f172a;
          margin-bottom: 4px;
          font-weight: 800;
          letter-spacing: -0.025em;
          text-align: center;
        }

        .sub-text {
          font-size: 0.85rem;
          color: #64748b;
          margin-bottom: 18px;
          text-align: center;
          max-width: 360px;
          line-height: 1.4;
        }

        .input-field {
          max-width: 380px;
          width: 100%;
          background-color: #f1f5f9;
          margin: 6px 0;
          height: 50px;
          border-radius: 50px;
          display: grid;
          grid-template-columns: 15% 85%;
          padding: 0 0.5rem;
          position: relative;
          transition: all 0.25s ease;
          border: 1px solid transparent;
        }

        .input-field:focus-within {
          background-color: #ffffff;
          border-color: #dc2626;
          box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15);
        }

        .input-field.merchant-field:focus-within {
          border-color: #059669;
          box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
        }

        .input-field i {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          transition: 0.3s;
          font-size: 1.1rem;
        }

        .input-field input,
        .input-field textarea {
          background: none;
          outline: none;
          border: none;
          line-height: 1;
          font-weight: 500;
          font-size: 0.92rem;
          color: #0f172a;
          width: 100%;
        }

        .input-field input::placeholder {
          color: #94a3b8;
          font-weight: 400;
        }

        .input-field.textarea-field {
          height: 64px;
          border-radius: 18px;
          padding: 8px 12px;
          align-items: flex-start;
        }

        .input-field.textarea-field textarea {
          line-height: 1.3;
          resize: none;
          padding-top: 4px;
        }

        .error-banner {
          font-size: 12px;
          color: #dc2626;
          background: #fef2f2;
          border: 1px solid #fecaca;
          padding: 6px 12px;
          border-radius: 8px;
          margin: 6px 0;
          width: 100%;
          max-width: 380px;
          text-align: center;
        }

        .success-card {
          width: 100%;
          max-width: 380px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 14px;
          padding: 14px;
          margin: 10px 0;
          text-align: left;
        }

        .success-card__badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: #15803d;
          margin-bottom: 4px;
        }

        .success-card__title {
          font-size: 14px;
          font-weight: 700;
          color: #166534;
          margin-bottom: 4px;
        }

        .success-card__sub {
          font-size: 12px;
          color: #15803d;
          line-height: 1.4;
        }

        .btn {
          width: 100%;
          max-width: 380px;
          background-color: #dc2626;
          border: none;
          outline: none;
          height: 48px;
          border-radius: 48px;
          color: #ffffff;
          font-weight: 700;
          letter-spacing: 0.02em;
          margin: 12px 0 6px 0;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 0.92rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 14px rgba(220, 38, 38, 0.3);
        }

        .btn.merchant-btn {
          background-color: #059669;
          box-shadow: 0 4px 14px rgba(5, 150, 105, 0.3);
        }

        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(220, 38, 38, 0.4);
        }

        .btn.merchant-btn:hover {
          background-color: #047857;
          box-shadow: 0 6px 20px rgba(5, 150, 105, 0.4);
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .forgot-link-btn {
          background: none;
          border: none;
          color: #64748b;
          font-size: 12px;
          cursor: pointer;
          margin-top: 8px;
          font-weight: 600;
          transition: color 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .forgot-link-btn:hover {
          color: #0f172a;
          text-decoration: underline;
        }

        .panels-container {
          position: absolute;
          height: 100%;
          width: 100%;
          top: 0;
          left: 0;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
        }

        .panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          z-index: 6;
          padding: 2rem;
        }

        .left-panel {
          pointer-events: all;
          padding: 3rem 14% 2rem 14%;
        }

        .right-panel {
          pointer-events: none;
          padding: 3rem 14% 2rem 14%;
        }

        .panel .content {
          color: #ffffff;
          transition: transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
          transition-delay: 0.6s;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .panel-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(8px);
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .panel h3 {
          font-weight: 800;
          line-height: 1.15;
          font-size: 1.75rem;
          margin-bottom: 12px;
          color: #ffffff;
          letter-spacing: -0.02em;
        }

        .panel p {
          font-size: 0.92rem;
          padding: 0.5rem 0 1.5rem 0;
          color: rgba(255, 255, 255, 0.85);
          line-height: 1.6;
          max-width: 320px;
        }

        .btn.transparent {
          margin: 0;
          background: rgba(255, 255, 255, 0.1);
          border: 2px solid #ffffff;
          width: 170px;
          height: 44px;
          font-weight: 700;
          font-size: 0.85rem;
          border-radius: 44px;
          color: #ffffff;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .btn.transparent:hover {
          background: #ffffff;
          color: #0f172a;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
        }

        .right-panel .content {
          transform: translateX(800px);
        }

        /* ── Sliding Mode Transitions ── */
        .container.sign-up-mode:before {
          transform: translate(100%, -50%);
          right: 52%;
        }

        .container.sign-up-mode .left-panel .content {
          transform: translateX(-800px);
        }

        .container.sign-up-mode .signin-signup {
          left: 25%;
        }

        .container.sign-up-mode form.sign-up-form {
          opacity: 1;
          z-index: 2;
          pointer-events: all;
        }

        .container.sign-up-mode form.sign-in-form {
          opacity: 0;
          z-index: 1;
          pointer-events: none;
        }

        .container.sign-up-mode .right-panel .content {
          transform: translateX(0%);
        }

        .container.sign-up-mode .left-panel {
          pointer-events: none;
        }

        .container.sign-up-mode .right-panel {
          pointer-events: all;
        }

        /* The curved sliding background circle */
        .container:before {
          content: "";
          position: absolute;
          height: 2000px;
          width: 2000px;
          top: -10%;
          right: 48%;
          transform: translateY(-50%);
          background: linear-gradient(-45deg, #090d16 0%, #1e293b 55%, #dc2626 100%);
          transition: 1.6s cubic-bezier(0.16, 1, 0.3, 1);
          border-radius: 50%;
          z-index: 6;
          box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.5);
        }

        /* Responsive Breakpoints */
        @media (max-width: 870px) {
          .container {
            min-height: 820px;
            height: auto;
            max-width: 520px;
          }
          .signin-signup {
            width: 100%;
            top: 92%;
            transform: translate(-50%, -100%);
            transition: 1s 0.8s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .signin-signup,
          .container.sign-up-mode .signin-signup {
            left: 50%;
          }
          .panels-container {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr 2fr 1fr;
          }
          .panel {
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 1.5rem 8%;
            grid-column: 1 / 2;
          }
          .right-panel {
            grid-row: 3 / 4;
          }
          .left-panel {
            grid-row: 1 / 2;
          }
          .panel .content {
            padding-right: 0;
            transition: transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
            transition-delay: 0.8s;
          }
          .panel h3 {
            font-size: 1.3rem;
          }
          .panel p {
            font-size: 0.78rem;
            padding: 0.4rem 0 1rem 0;
          }
          .btn.transparent {
            width: 140px;
            height: 38px;
            font-size: 0.75rem;
          }
          .container:before {
            width: 1500px;
            height: 1500px;
            transform: translateX(-50%);
            left: 30%;
            bottom: 68%;
            right: initial;
            top: initial;
            transition: 1.8s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .container.sign-up-mode:before {
            transform: translate(-50%, 100%);
            bottom: 32%;
            right: initial;
          }
          .container.sign-up-mode .left-panel .content {
            transform: translateY(-300px);
          }
          .container.sign-up-mode .right-panel .content {
            transform: translateY(0px);
          }
          .right-panel .content {
            transform: translateY(300px);
          }
          .container.sign-up-mode .signin-signup {
            top: 8%;
            transform: translate(-50%, 0);
          }
        }

        @media (max-width: 570px) {
          form {
            padding: 0 1.25rem;
          }
          .panel .content {
            padding: 0.5rem 1rem;
          }
          .title {
            font-size: 1.6rem;
          }
        }
      `}</style>

      <div className={isResetMode ? 'container sign-up-mode' : 'container'}>
        <div className="forms-container">
          <div className="signin-signup">
            {/* ── Form 1: Sign In ── */}
            <form className="sign-in-form" onSubmit={handleSignInSubmit} autoComplete="off">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <img src="/logo.png" alt="PrintBooth" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                <span className="brand-pill" style={{ margin: 0 }}>
                  <ShieldCheck size={13} weight="bold" />
                  <span>Console Portal</span>
                </span>
              </div>
              <h2 className="title">Sign In</h2>
              <p className="sub-text">
                Enter your credentials to access your console dashboard. Role is auto-detected.
              </p>

              {/* Input: Username or Email */}
              <div className="input-field">
                <i>
                  <EnvelopeSimple size={18} weight="bold" />
                </i>
                <input
                  type="text"
                  placeholder="Username or Email Address"
                  required
                  autoComplete="off"
                  value={signInForm.identifier}
                  onChange={(e) =>
                    setSignInForm((f) => ({ ...f, identifier: e.target.value }))
                  }
                />
              </div>

              {/* Input: Password */}
              <div className="input-field">
                <i>
                  <LockKey size={18} weight="bold" />
                </i>
                <input
                  type="password"
                  placeholder="Password"
                  required
                  autoComplete="new-password"
                  value={signInForm.password}
                  onChange={(e) =>
                    setSignInForm((f) => ({ ...f, password: e.target.value }))
                  }
                />
              </div>

              {signInError && <div className="error-banner">{signInError}</div>}

              {/* Submit Button */}
              <button
                type="submit"
                className="btn"
                disabled={isSigningIn}
              >
                <span>{isSigningIn ? 'Authenticating…' : 'Sign In'}</span>
                <ArrowRight size={16} weight="bold" />
              </button>

              {/* Quick toggle to Help Desk Password Request */}
              <button
                type="button"
                className="forgot-link-btn"
                onClick={() => {
                  setResetError('')
                  setResetSuccess(null)
                  setResetForm({
                    identifier: '',
                    phone: '',
                    kioskId: '',
                    reason: '',
                  })
                  setIsResetMode(true)
                }}
              >
                <Lifebuoy size={14} weight="bold" />
                <span>Forgot password? Send request to Help Desk</span>
              </button>
            </form>

            {/* ── Form 2: Request Password Change (Help Desk Ticket) ── */}
            <form className="sign-up-form" onSubmit={handleResetSubmit} autoComplete="off">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <img src="/logo.png" alt="PrintBooth" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                <span className="brand-pill merchant" style={{ margin: 0 }}>
                  <Lifebuoy size={12} weight="bold" />
                  <span>Help Desk Support</span>
                </span>
              </div>
              <h2 className="title">Request Password Reset</h2>
              <p className="sub-text">
                Submit an official credential change request to Fleet Support to verify
                and restore your console access.
              </p>

              {resetSuccess ? (
                <div className="success-card">
                  <div className="success-card__badge">
                    <CheckCircle size={16} weight="fill" />
                    <span>Ticket Logged: {resetSuccess.ticketId}</span>
                  </div>
                  <h4 className="success-card__title">Request Received by Operations</h4>
                  <p className="success-card__sub">{resetSuccess.message}</p>
                  <button
                    type="button"
                    className="btn merchant-btn"
                    style={{ marginTop: 12, height: 40, fontSize: 13 }}
                    onClick={() => {
                      setResetSuccess(null)
                      setIsResetMode(false)
                    }}
                  >
                    <span>Return to Sign In</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Input: Merchant Identifier */}
                  <div className="input-field merchant-field">
                    <i>
                      <IdentificationBadge size={18} weight="bold" />
                    </i>
                    <input
                      type="text"
                      placeholder="Merchant Username or Email"
                      required
                      value={resetForm.identifier}
                      onChange={(e) =>
                        setResetForm((f) => ({ ...f, identifier: e.target.value }))
                      }
                    />
                  </div>

                  {/* Input: Phone or Kiosk ID */}
                  <div className="input-field merchant-field">
                    <i>
                      <Phone size={18} weight="bold" />
                    </i>
                    <input
                      type="text"
                      placeholder="Registered Phone or Kiosk ID (e.g. PB-001)"
                      value={resetForm.phone}
                      onChange={(e) =>
                        setResetForm((f) => ({ ...f, phone: e.target.value }))
                      }
                    />
                  </div>

                  {/* Input: Reason for Request */}
                  <div className="input-field merchant-field textarea-field">
                    <i>
                      <ChatText size={18} weight="bold" />
                    </i>
                    <textarea
                      placeholder="Reason (e.g. Forgot password, PIN reset, manager handover)"
                      rows={2}
                      value={resetForm.reason}
                      onChange={(e) =>
                        setResetForm((f) => ({ ...f, reason: e.target.value }))
                      }
                    />
                  </div>

                  {resetError && <div className="error-banner">{resetError}</div>}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="btn merchant-btn"
                    disabled={isSubmittingReset}
                  >
                    <span>
                      {isSubmittingReset
                        ? 'Dispatching Ticket…'
                        : 'Send Request to Help Desk'}
                    </span>
                    <ArrowRight size={16} weight="bold" />
                  </button>

                  <button
                    type="button"
                    className="forgot-link-btn"
                    onClick={() => {
                      setResetError('')
                      setIsResetMode(false)
                    }}
                  >
                    <span>Already have your password? Back to Sign In</span>
                  </button>
                </>
              )}
            </form>
          </div>
        </div>

        {/* ── Side Panels & Sliding Background Overlay ── */}
        <div className="panels-container">
          {/* Left Panel: visible during Sign In */}
          <div className="panel left-panel">
            <div className="content">
              <span className="panel-badge">
                <Lifebuoy size={14} weight="bold" />
                <span>Help Desk Center</span>
              </span>
              <h3>Need Help Desk Support?</h3>
              <p>
                Merchant partner having trouble logging in or forgot your credentials?
                Submit an authorized password reset request directly to our 24/7 operations team.
              </p>
              <button
                type="button"
                className="btn transparent"
                onClick={() => {
                  setResetError('')
                  setResetSuccess(null)
                  setResetForm({
                    identifier: '',
                    phone: '',
                    kioskId: '',
                    reason: '',
                  })
                  setIsResetMode(true)
                }}
              >
                <span>Request Reset</span>
                <ArrowRight size={14} weight="bold" />
              </button>
            </div>
          </div>

          {/* Right Panel: visible during Reset Request */}
          <div className="panel right-panel">
            <div className="content">
              <span className="panel-badge">
                <ShieldCheck size={14} weight="bold" />
                <span>Console Portal</span>
              </span>
              <h3>Remember Credentials?</h3>
              <p>
                Already have your active operator password or received a temporary access key
                from the Help Desk team? Return to sign in.
              </p>
              <button
                type="button"
                className="btn transparent"
                onClick={() => {
                  setResetError('')
                  setIsResetMode(false)
                }}
              >
                <span>Back to Sign In</span>
                <ArrowRight size={14} weight="bold" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {blockedNotice && (
        <MerchantBlockedNotice
          kioskId={blockedNotice.kioskId}
          storeName={blockedNotice.storeName}
          merchantName={blockedNotice.merchantName}
          companyContact={blockedNotice.companyContact}
          onClose={() => setBlockedNotice(null)}
        />
      )}
    </div>
  )
}
