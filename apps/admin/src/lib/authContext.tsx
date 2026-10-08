import React, { createContext, useContext, useState, useCallback } from 'react'
import { Navigate, useLocation, Link } from 'react-router-dom'
import { ShieldWarning, SignOut, ArrowLeft } from '@phosphor-icons/react'

export type UserRole = 'admin' | 'merchant'

export interface UserProfile {
  email: string
  name: string
  role: UserRole
  token: string
  kioskId?: string
  merchantId?: string
  storeName?: string
  requirePasswordChange?: boolean
}

interface AuthContextType {
  user: UserProfile | null
  role: UserRole | null
  isAuthenticated: boolean
  isAdmin: boolean
  isMerchant: boolean
  login: (profile: UserProfile) => void
  logout: () => void
  updateUserProfile: (updates: Partial<UserProfile>) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const token = localStorage.getItem('pb_admin_token')
      const role = localStorage.getItem('pb_portal_role') as UserRole | null
      const email = localStorage.getItem('pb_user_email') || (role === 'admin' ? 'admin@printbooth.in' : 'merchant@printbooth.in')
      const name = localStorage.getItem('pb_user_name') || (role === 'admin' ? 'Platform Administrator' : 'Rahul Sharma (Store Partner)')
      const kioskId = localStorage.getItem('pb_merchant_kiosk_id') || 'PB-001'
      const merchantId = localStorage.getItem('pb_merchant_id') || 'M-001'
      const storeName = localStorage.getItem('pb_merchant_store_name') || 'MIT ADT Campus Print Hub'
      const requirePasswordChange = localStorage.getItem('pb_require_password_change') === 'true'

      if (token && role) {
        return {
          email,
          name,
          role,
          token,
          kioskId,
          merchantId,
          storeName,
          requirePasswordChange,
        }
      }
    } catch {
      // Ignore private browsing storage errors
    }
    return null
  })

  const login = useCallback((profile: UserProfile) => {
    try {
      localStorage.setItem('pb_admin_token', profile.token)
      localStorage.setItem('pb_portal_role', profile.role)
      localStorage.setItem('pb_user_email', profile.email)
      localStorage.setItem('pb_user_name', profile.name)
      if (profile.kioskId) localStorage.setItem('pb_merchant_kiosk_id', profile.kioskId)
      if (profile.merchantId) localStorage.setItem('pb_merchant_id', profile.merchantId)
      if (profile.storeName) localStorage.setItem('pb_merchant_store_name', profile.storeName)
      if (profile.requirePasswordChange !== undefined) {
        localStorage.setItem('pb_require_password_change', String(Boolean(profile.requirePasswordChange)))
      } else {
        localStorage.removeItem('pb_require_password_change')
      }
    } catch {
      // Ignore
    }
    setUser(profile)
  }, [])

  const logout = useCallback(() => {
    try {
      localStorage.removeItem('pb_admin_token')
      localStorage.removeItem('pb_portal_role')
      localStorage.removeItem('pb_user_email')
      localStorage.removeItem('pb_user_name')
      localStorage.removeItem('pb_merchant_kiosk_id')
      localStorage.removeItem('pb_merchant_id')
      localStorage.removeItem('pb_merchant_store_name')
      localStorage.removeItem('pb_require_password_change')
    } catch {
      // Ignore
    }
    setUser(null)
  }, [])

  const updateUserProfile = useCallback((updates: Partial<UserProfile>) => {
    setUser((prev) => {
      if (!prev) return null
      const updated = { ...prev, ...updates }
      try {
        if (updates.email) localStorage.setItem('pb_user_email', updates.email)
        if (updates.name) localStorage.setItem('pb_user_name', updates.name)
        if (updates.kioskId) localStorage.setItem('pb_merchant_kiosk_id', updates.kioskId)
        if (updates.merchantId) localStorage.setItem('pb_merchant_id', updates.merchantId)
        if (updates.storeName) localStorage.setItem('pb_merchant_store_name', updates.storeName)
        if (updates.requirePasswordChange !== undefined) {
          localStorage.setItem('pb_require_password_change', String(Boolean(updates.requirePasswordChange)))
        }
      } catch {
        // Ignore
      }
      return updated
    })
  }, [])

  const role = user?.role || null
  const isAuthenticated = Boolean(user && user.token)
  const isAdmin = role === 'admin'
  const isMerchant = role === 'merchant'

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated,
        isAdmin,
        isMerchant,
        login,
        logout,
        updateUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}

/**
 * Route Guard: Requires authentication. If unauthenticated, redirects to /login.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

/**
 * Route Guard: Requires specific role ('admin' or 'merchant').
 * If user does not have required role, renders an Access Denied state rather than leaking protected routes.
 */
export function RequireRole({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[]
  children: React.ReactNode
}) {
  const { user, isAuthenticated, role, logout } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!role || !allowedRoles.includes(role)) {
    // Render distinct Forbidden state with clear separation of rights
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--clr-bg-900, #f8fafc)',
        padding: 24,
      }}>
        <div style={{
          maxWidth: 480,
          width: '100%',
          background: 'var(--clr-bg-800, #ffffff)',
          border: '1.5px solid var(--clr-border, #e2e8f0)',
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 20px 40px -12px rgba(0,0,0,0.1)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <ShieldWarning size={32} weight="duotone" />
          </div>

          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--clr-text-1, #0f172a)', margin: '0 0 6px 0' }}>
              Access Restricted
            </h2>
            <p style={{ fontSize: 13.5, color: 'var(--clr-text-3, #475569)', lineHeight: 1.5, margin: 0 }}>
              {role === 'merchant'
                ? 'Platform Administrator privileges are required to access this console. Merchant Partner rights are strictly limited to your designated kiosk store operations.'
                : 'This portal requires Merchant Partner credentials. You are currently logged in as a Platform Administrator.'}
            </p>
          </div>

          <div style={{
            width: '100%',
            background: 'var(--clr-surface-2, #f1f5f9)',
            borderRadius: 10,
            padding: 12,
            fontSize: 12,
            color: 'var(--clr-text-4, #64748b)',
            textAlign: 'left',
          }}>
            <div style={{ fontWeight: 700, color: 'var(--clr-text-2, #334155)', marginBottom: 4 }}>
              Active Session:
            </div>
            <div>Account: {user?.email}</div>
            <div>Active Role: <span style={{ textTransform: 'uppercase', fontWeight: 700, color: role === 'admin' ? '#dc2626' : '#2563eb' }}>{role}</span></div>
            {user?.kioskId && <div>Authorized Kiosk: {user.kioskId}</div>}
          </div>

          <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 8 }}>
            <Link
              to={role === 'merchant' ? '/merchant/dashboard' : '/admin/dashboard'}
              className="btn btn--primary"
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 8,
                background: '#dc2626',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <ArrowLeft size={16} />
              <span>Back to {role === 'merchant' ? 'My Store' : 'Fleet Console'}</span>
            </Link>

            <button
              type="button"
              onClick={logout}
              className="btn btn--ghost"
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--clr-border, #cbd5e1)',
                background: 'transparent',
                color: 'var(--clr-text-2, #334155)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <SignOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
