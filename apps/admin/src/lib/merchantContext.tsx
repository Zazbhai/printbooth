import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getAdminMerchants, getMerchantKiosks } from './api'
import { useAuth } from './authContext'

export interface MerchantData {
  merchantId: string
  name: string
  storeName: string
  email: string
  phone: string
  kioskId: string
  address?: string
  kioskPhotoUrl: string
  qrCodeUrl?: string
  commissionRate: number
  todayEarnings?: number
  wtdEarnings?: number
  mtdEarnings?: number
  totalEarnings?: number
  bankName?: string
  bankAccountLast4?: string
  status?: string
  isBlocked?: boolean
  paperLevel?: number
  tonerLevel?: number
  printerStatus?: string
  printerModel?: string
  kioskLocation?: string
}

interface MerchantContextType {
  activeKioskId: string
  setActiveKioskId: (kioskId: string) => void
  activeMerchant: MerchantData | null
  merchants: MerchantData[]
  merchantKiosks: any[]
  loading: boolean
  isLockedToSingleKiosk: boolean
  refreshMerchants: () => Promise<void>
}

const MerchantContext = createContext<MerchantContextType | undefined>(undefined)

export function MerchantProvider({ children }: { children: React.ReactNode }) {
  const { user, role } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [merchants, setMerchants] = useState<MerchantData[]>([])
  const [merchantKiosks, setMerchantKiosks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const isMerchant = role === 'merchant'
  const merchantId = user?.merchantId || 'M-001'

  const paramKioskId = searchParams.get('kioskId')
  const [activeKioskId, setActiveKioskIdState] = useState<string>(() => {
    return paramKioskId || localStorage.getItem('pb_active_merchant_kiosk') || user?.kioskId || 'PB-001'
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [merchantsData, kiosksData] = await Promise.all([
        getAdminMerchants(),
        getMerchantKiosks(merchantId),
      ])

      if (Array.isArray(merchantsData)) {
        if (isMerchant) {
          const mine = merchantsData.filter(m => m.merchantId === merchantId || m.kioskId === user?.kioskId)
          setMerchants(mine.length ? mine : merchantsData.slice(0, 1))
        } else {
          setMerchants(merchantsData)
        }
      }

      if (Array.isArray(kiosksData)) {
        setMerchantKiosks(kiosksData)
      }
    } catch (err) {
      console.error('Failed to load merchant data in context:', err)
    } finally {
      setLoading(false)
    }
  }, [isMerchant, merchantId, user?.kioskId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Validate active kiosk ID against allowed kiosks for merchant
  const allowedKioskIds = React.useMemo(() => {
    if (!isMerchant) return null // Admins can access all kiosks
    if (merchantKiosks.length > 0) {
      return merchantKiosks.map(k => k.kioskId || k.id)
    }
    return [user?.kioskId || 'PB-001']
  }, [isMerchant, merchantKiosks, user?.kioskId])

  useEffect(() => {
    if (allowedKioskIds && allowedKioskIds.length > 0) {
      if (!allowedKioskIds.includes(activeKioskId)) {
        const fallback = allowedKioskIds[0]
        setActiveKioskIdState(fallback)
        localStorage.setItem('pb_active_merchant_kiosk', fallback)
        setSearchParams(prev => {
          const next = new URLSearchParams(prev)
          next.set('kioskId', fallback)
          return next
        }, { replace: true })
      }
    } else if (paramKioskId && paramKioskId !== activeKioskId) {
      setActiveKioskIdState(paramKioskId)
      localStorage.setItem('pb_active_merchant_kiosk', paramKioskId)
    }
  }, [allowedKioskIds, activeKioskId, paramKioskId, setSearchParams])

  const setActiveKioskId = useCallback((id: string) => {
    if (allowedKioskIds && !allowedKioskIds.includes(id)) {
      console.warn(`Station ${id} is not owned by merchant ${merchantId}`)
      return
    }
    setActiveKioskIdState(id)
    localStorage.setItem('pb_active_merchant_kiosk', id)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('kioskId', id)
      return next
    }, { replace: true })
  }, [allowedKioskIds, merchantId, setSearchParams])

  const activeMerchant = merchants.find(m => m.kioskId === activeKioskId) || merchants[0] || null
  const isLockedToSingleKiosk = isMerchant && (allowedKioskIds?.length ?? 1) <= 1

  return (
    <MerchantContext.Provider
      value={{
        activeKioskId,
        setActiveKioskId,
        activeMerchant,
        merchants,
        merchantKiosks,
        loading,
        isLockedToSingleKiosk,
        refreshMerchants: loadData,
      }}
    >
      {children}
    </MerchantContext.Provider>
  )
}

const DEFAULT_MERCHANT_CONTEXT: MerchantContextType = {
  activeKioskId: 'PB-001',
  setActiveKioskId: (kioskId: string) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pb_active_merchant_kiosk', kioskId)
    }
  },
  activeMerchant: null,
  merchants: [],
  merchantKiosks: [],
  loading: false,
  isLockedToSingleKiosk: false,
  refreshMerchants: async () => {},
}

export function useActiveMerchant() {
  const ctx = useContext(MerchantContext)
  if (!ctx) {
    return DEFAULT_MERCHANT_CONTEXT
  }
  return ctx
}

