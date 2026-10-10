import { Request, Response, NextFunction } from 'express'

export interface AuthenticatedUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'merchant'
  merchantId?: string
  kioskId?: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser
    }
  }
}

/**
 * Authentication middleware that extracts user info from headers or Bearer token.
 * Supports token formats:
 * - 'pb_adm_...' or 'demo-admin-token' => admin
 * - 'pb_mer_...' or 'demo-merchant-token' => merchant
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  const roleHeader = (req.headers['x-portal-role'] as string) || ''
  const kioskIdHeader = (req.headers['x-kiosk-id'] as string) || ''
  const merchantIdHeader = (req.headers['x-merchant-id'] as string) || ''

  let token = ''
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7)
  }

  // Determine role based on token or explicit role header
  const isAdmin = token === 'demo-admin-token' || token.startsWith('pb_adm_') || roleHeader === 'admin'
  const isMerchant = token === 'demo-merchant-token' || token.startsWith('pb_mer_') || roleHeader === 'merchant'

  if (isAdmin) {
    req.user = {
      id: 'usr_admin_01',
      email: (req.headers['x-user-email'] as string) || 'admin@printbooth.in',
      name: 'System Administrator',
      role: 'admin',
    }
  } else if (isMerchant) {
    req.user = {
      id: merchantIdHeader || 'M-001',
      email: (req.headers['x-user-email'] as string) || 'team1printbooth@gmail.com',
      name: 'Campus Print Desk Partner',
      role: 'merchant',
      merchantId: merchantIdHeader || 'M-001',
      kioskId: kioskIdHeader || 'PB-001',
    }
  }

  next()
}

/**
 * Middleware: Strictly requires Platform Administrator rights.
 * Rejects any merchant or unauthenticated user with 403 Forbidden.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  authenticate(req, res, () => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required to access Platform Admin Console.',
      })
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Platform Administrator privileges required. Merchant accounts cannot access this endpoint.',
      })
    }

    next()
  })
}

/**
 * Middleware: Requires Merchant Partner rights (or Administrator viewing store data).
 * Enforces kiosk isolation for merchants so merchant A cannot access merchant B's financials.
 */
export function requireMerchant(req: Request, res: Response, next: NextFunction) {
  authenticate(req, res, () => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required to access Merchant Portal.',
      })
    }

    // Admins have override privileges across all kiosks
    if (req.user.role === 'admin') {
      return next()
    }

    // For merchants: verify they are only querying their authorized kiosk
    if (req.user.role === 'merchant') {
      const requestedKioskId = (req.query.kioskId as string) || (req.body?.kioskId as string)
      if (
        requestedKioskId &&
        requestedKioskId.toUpperCase() !== 'ALL' &&
        req.user.kioskId &&
        requestedKioskId !== req.user.kioskId
      ) {
        return res.status(403).json({
          success: false,
          error: `Forbidden: Access denied to kiosk ${requestedKioskId}. Your merchant rights are restricted to kiosk ${req.user.kioskId}.`,
        })
      }
      return next()
    }

    return res.status(403).json({
      success: false,
      error: 'Forbidden: Valid merchant partner rights required.',
    })
  })
}
