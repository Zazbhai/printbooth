import { useState, useId } from 'react'
import {
  LockKey,
  ShieldCheck,
  Eye,
  EyeSlash,
  CheckCircle,
  WarningCircle,
  Check,
  Storefront,
  SpinnerGap,
} from '@phosphor-icons/react'
import { useAuth } from '@/lib/authContext'
import { useActiveMerchant } from '@/lib/merchantContext'
import { merchantChangePassword } from '@/lib/api'
import './FirstLoginPasswordModal.css'

const SESSION_DISMISS_KEY = 'pb_dismissed_first_password_setup'

export default function FirstLoginPasswordModal() {
  const { user, isAdmin, updateUserProfile } = useAuth()
  const { activeMerchant, activeKioskId } = useActiveMerchant()

  const [sessionDismissed, setSessionDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [success, setSuccess] = useState(false)

  const newPassId = useId()
  const confirmPassId = useId()

  // Only prompt real merchant users (not admin in emulation) who have requirePasswordChange flagged
  const isRequired = Boolean(!isAdmin && user?.role === 'merchant' && user?.requirePasswordChange && !sessionDismissed)

  if (!isRequired) {
    return null
  }

  const isMinLength = newPassword.length >= 6
  const isMatching = newPassword.length > 0 && newPassword === confirmPassword
  const canSubmit = isMinLength && isMatching && !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')

    if (!isMinLength) {
      setErrorMessage('Password must be at least 6 characters long.')
      return
    }

    if (!isMatching) {
      setErrorMessage('Passwords do not match. Please re-enter.')
      return
    }

    const merchantId = user?.merchantId || activeMerchant?.merchantId || 'M-001'
    setSubmitting(true)

    try {
      const res = await merchantChangePassword({
        merchantId,
        newPassword: newPassword.trim(),
      })

      if (res?.success) {
        setSuccess(true)
        updateUserProfile({ requirePasswordChange: false })
        setTimeout(() => {
          setSessionDismissed(true)
          try {
            sessionStorage.removeItem(SESSION_DISMISS_KEY)
          } catch {}
        }, 1400)
      } else {
        setErrorMessage(res?.error || 'Failed to update password. Please try again.')
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || err.message || 'Server error updating password.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, '1')
    } catch {}
    setSessionDismissed(true)
  }

  return (
    <div className="first-login-backdrop" role="dialog" aria-modal="true" aria-labelledby="first-login-title">
      <div className="first-login-modal">
        <div className="first-login-stripe" />

        {/* Header */}
        <div className="first-login-header">
          <div className="first-login-badge">
            <LockKey size={26} weight="duotone" color="#dc2626" />
          </div>
          <div className="first-login-title-wrap">
            <span className="first-login-tag">
              <ShieldCheck size={12} weight="bold" />
              <span>Initial Partner Onboarding Setup</span>
            </span>
            <h2 id="first-login-title" className="first-login-title">
              Set Your Private Security Password
            </h2>
            <p className="first-login-subtitle">
              Welcome to the PrintBooth Partner Portal! Please create a permanent, private password to secure your terminal.
            </p>
          </div>
        </div>

        {/* Body */}
        {success ? (
          <div className="first-login-success">
            <div className="first-login-success-icon">
              <CheckCircle size={36} weight="fill" />
            </div>
            <h3 className="first-login-success-title">Password Successfully Created!</h3>
            <p className="first-login-success-text">
              Your partner account credentials have been securely updated. Taking you to your live dashboard now...
            </p>
          </div>
        ) : (
          <div className="first-login-body">
            {/* Account Details Banner */}
            <div className="first-login-info-card">
              <div className="first-login-info-item">
                <span className="first-login-info-label">Partner Venue</span>
                <span className="first-login-info-val">
                  <Storefront size={14} color="#64748b" />
                  <span>{user?.storeName || activeMerchant?.storeName || 'Campus Print Hub'}</span>
                </span>
              </div>
              <div className="first-login-info-item" style={{ textAlign: 'right' }}>
                <span className="first-login-info-label">Assigned Station</span>
                <span className="first-login-info-val" style={{ justifyContent: 'flex-end' }}>
                  <code style={{ fontSize: 12, padding: '2px 6px', background: '#e2e8f0', borderRadius: 4 }}>
                    {user?.kioskId || activeKioskId || 'PB-001'}
                  </code>
                </span>
              </div>
            </div>

            <div className="first-login-notice">
              <span>🔒</span>
              <p>
                Platform administration assigned an initial temporary key to onboard your store. For security of financial payouts and machine controls, choose your personal password below.
              </p>
            </div>

            {errorMessage && (
              <div className="first-login-error" role="alert">
                <WarningCircle size={16} weight="bold" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form id="first-login-form" className="first-login-form" onSubmit={handleSubmit}>
              <div className="first-login-group">
                <label htmlFor={newPassId} className="first-login-label">
                  <span>New Password</span>
                </label>
                <div className="first-login-input-wrap">
                  <LockKey size={16} className="first-login-input-icon" />
                  <input
                    id={newPassId}
                    type={showPass ? 'text' : 'password'}
                    className="first-login-input"
                    placeholder="Enter new password (min. 6 chars)"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="first-login-eye-btn"
                    onClick={() => setShowPass(!showPass)}
                    title={showPass ? 'Hide password' : 'Show password'}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="first-login-group">
                <label htmlFor={confirmPassId} className="first-login-label">
                  <span>Confirm New Password</span>
                </label>
                <div className="first-login-input-wrap">
                  <LockKey size={16} className="first-login-input-icon" />
                  <input
                    id={confirmPassId}
                    type={showConfirm ? 'text' : 'password'}
                    className="first-login-input"
                    placeholder="Re-type new password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="first-login-eye-btn"
                    onClick={() => setShowConfirm(!showConfirm)}
                    title={showConfirm ? 'Hide password' : 'Show password'}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Requirement Checklist */}
              <div className="first-login-checks">
                <div className={`first-login-check-item ${isMinLength ? 'valid' : ''}`}>
                  <Check size={13} weight="bold" />
                  <span>At least 6 characters</span>
                </div>
                <div className={`first-login-check-item ${isMatching ? 'valid' : ''}`}>
                  <Check size={13} weight="bold" />
                  <span>Passwords match</span>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Footer */}
        {!success && (
          <div className="first-login-footer">
            <button
              type="button"
              className="first-login-dismiss-btn"
              onClick={handleDismiss}
              disabled={submitting}
            >
              Remind Me Later
            </button>

            <button
              type="submit"
              form="first-login-form"
              className="first-login-submit-btn"
              disabled={!canSubmit}
            >
              {submitting ? (
                <>
                  <SpinnerGap size={16} className="spinner" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} weight="bold" />
                  <span>Secure &amp; Continue</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
