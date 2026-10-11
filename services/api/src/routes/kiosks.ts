import { Router, Request, Response } from 'express'
import { Kiosk } from '../models/Kiosk.js'
import { Merchant } from '../models/Merchant.js'
import { isDbConnected } from '../db.js'
import { fallbackKiosks, fallbackMerchants } from '../fallbackData.js'
import { getRealPrinterHardwareStatus } from '../modules/printerDetector.js'
import { cacheMiddleware, cachePurgePattern } from '../redis.js'
import { handleVerifyPinLogic } from './print.js'
import { verifyKioskSecret } from '../modules/kioskAuth.js'
import { getKioskPrintUrl, getPublicWebUrl } from '../config.js'
import { isKioskPiReachable, markKioskOffline } from '../modules/kioskLiveness.js'
import {
  isKioskRelayConnected,
  triggerKioskUpdate,
  getKioskUpdateStatus,
  getConnectedKioskIds,
} from '../modules/wsRelay.js'
import { getKioskPiPrinters } from '../modules/kioskPiPrinters.js'
import { CupsAutomationService } from '../modules/cups.js'

export const kiosksRouter = Router()

// Resolve the assigned merchant partner contact info for this machine only
export async function resolveMerchantContactForKiosk(kioskId: string) {
  let merchant: any = null
  if (isDbConnected()) {
    try {
      merchant = await Merchant.findOne({ kioskId }).lean()
    } catch {
      // fallback
    }
  }
  if (!merchant) {
    merchant = fallbackMerchants.find((m) => m.kioskId === kioskId)
  }
  if (!merchant) {
    return {
      merchantId: 'M-001',
      name: 'On-Site Machine Host',
      storeName: 'PrintBooth Partner Store',
      phone: '+91 98234 56789',
      whatsapp: '+919823456789',
      email: 'support@printbooth.in',
      onSiteLocation: 'Ground Floor, Central Reading Hall (Counter #1)',
      supportHours: '8:30 AM - 9:30 PM',
      kioskId,
    }
  }
  return {
    merchantId: merchant.merchantId || 'M-001',
    name: merchant.name || 'Store Partner',
    storeName: merchant.storeName || 'Campus Print Hub',
    phone: merchant.phone || '+91 98234 56789',
    whatsapp: merchant.whatsapp || merchant.phone?.replace(/[^0-9+]/g, '') || '+919823456789',
    email: merchant.email || 'support@printbooth.in',
    onSiteLocation: merchant.supportNote || merchant.address || 'Ground Floor Reading Hall',
    supportHours: merchant.supportHours || '8:30 AM - 9:30 PM',
    kioskId,
  }
}

// GET /api/kiosks - Used by customer web app (Select Kiosk page, cached 5s in Redis)
kiosksRouter.get('/', cacheMiddleware({ ttlSeconds: 5, keyPrefix: 'kiosks:list:' }), async (req: Request, res: Response) => {
  try {
    const livePrinter = await getRealPrinterHardwareStatus()
    const isTestMode = (process.env.PRINT_MODE || 'real').toLowerCase() === 'test'

    const hasLiveError =
      !isTestMode &&
      (!livePrinter.isOnline ||
        !livePrinter.isHardwareReady ||
        !livePrinter.isAvailable ||
        Boolean(livePrinter.statusLabels?.some((l) => /error|offline|disconnected|stopped|not connected/i.test(l))))

    // Query blocked merchants to completely hide their kiosks from customer print page
    const blockedKioskIds = new Set<string>()
    const blockedMerchantIds = new Set<string>()

    if (isDbConnected()) {
      try {
        const blockedDocs = await Merchant.find({
          $or: [{ isBlocked: true }, { status: 'BLOCKED' }],
        }).lean()
        blockedDocs.forEach((m: any) => {
          if (m.kioskId) blockedKioskIds.add(m.kioskId)
          if (m.merchantId) blockedMerchantIds.add(m.merchantId)
        })
      } catch (err) {
        console.warn('Failed to query blocked merchants in kiosks route:', err)
      }
    }

    fallbackMerchants.forEach((m: any) => {
      if (m.isBlocked || m.status === 'BLOCKED') {
        if (m.kioskId) blockedKioskIds.add(m.kioskId)
        if (m.merchantId) blockedMerchantIds.add(m.merchantId)
      }
    })

    if (!isDbConnected()) {
      const formatted = fallbackKiosks
        .filter((k) => !blockedKioskIds.has(k.kioskId || k.id) && !(k.merchantId && blockedMerchantIds.has(k.merchantId)))
        .map((k) => {
        const isHost = (k.kioskId || k.id) === 'PB-001'
        const printerModel = isHost ? (livePrinter.selectedPrinter || k.printerModel || 'Laser Print Engine') : (k.printerModel || k.printer)
        const isOffline = isHost ? !livePrinter.isOnline : (k.status === 'OFFLINE' || k.printerStatus === 'OFFLINE')
        const printerStatus = isHost
          ? (livePrinter.isOnline ? 'READY' : (livePrinter.statusLabels?.[0] || 'OFFLINE'))
          : k.printerStatus
        const isMaintenance = String(k.status || '').toUpperCase() === 'MAINTENANCE'
        const status = isMaintenance ? 'MAINTENANCE' : (isOffline ? 'OFFLINE' : 'ONLINE')

        return {
          id: k.kioskId || k.id,
          name: k.name,
          location: k.location,
          address: k.address,
          lat: k.lat ?? 18.5204,
          lng: k.lng ?? 73.8567,
          distance: '0.1 km',
          status,
          printerStatus,
          printerModel,
          printer: printerModel,
          paper: isOffline ? 0 : (k.paperLevel || k.paper || 250),
          toner: isOffline ? 0 : (k.tonerLevel || k.toner || 92),
          queue: (k as any).queueCount ?? k.queue ?? 0,
          pricing: k.pricing,
          isTestMode,
          qrCodeUrl: k.qrCodeUrl || getKioskPrintUrl(k.kioskId || (k as any).id, req),
          kioskPhotoUrl: k.kioskPhotoUrl || (k as any).photoUrl || 'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=600&q=80',
          hardwareDetails: isHost ? {
            isAvailable: isTestMode ? true : livePrinter.isAvailable,
            isOnline: isTestMode ? true : livePrinter.isOnline,
            isHardwareReady: isTestMode ? true : livePrinter.isHardwareReady,
            isTestMode,
            port: isTestMode ? (livePrinter.port || 'VIRTUAL-SIM') : livePrinter.port,
            driver: isTestMode ? (livePrinter.driver || 'PrintBooth Virtual Driver (Test Mode)') : livePrinter.driver,
            connectionType: isTestMode ? 'TEST_SIMULATION' : livePrinter.connectionType,
            statusLabels: isTestMode ? ['Ready (Test Mode)'] : livePrinter.statusLabels,
            selectedPrinter: isTestMode
              ? (livePrinter.selectedPrinter || 'PrintBooth Test Printer (Mock)')
              : livePrinter.selectedPrinter,
          } : undefined,
        }
      })
      return res.json({ success: true, isTestMode, data: formatted })
    }

    const kiosks = await Kiosk.find({
      kioskId: { $nin: Array.from(blockedKioskIds) },
      merchantId: { $nin: Array.from(blockedMerchantIds) },
    }).sort({ kioskId: 1 })

    // Format for customer web view
    const formatted = await Promise.all(
      kiosks.map(async (k) => {
        const isRelayConnected = isKioskRelayConnected(k.kioskId)
        const isPiHeartbeatFresh = Boolean(k.lastSeenAt && (Date.now() - new Date(k.lastSeenAt).getTime() < 60000))
        const reachability = await isKioskPiReachable(k.kioskId)
        const isPiAlive = isTestMode ? true : (reachability.isReachable && isRelayConnected)

        const printerModel = isTestMode
          ? (livePrinter.selectedPrinter || k.printerModel || 'Laser Print Engine (Simulator)')
          : (isPiAlive
              ? (k.printerModel || 'Laser Print Engine')
              : (k.printerModel || 'Laser Print Engine (Offline)'))

        const piData = getKioskPiPrinters(k.kioskId)
        const isUsbDisconnected = (piData && piData.usbConnected === false) || k.usbConnected === false
        const isOffline = isTestMode
          ? false
          : (!isPiAlive ||
             !isRelayConnected ||
             isUsbDisconnected ||
             k.status === 'OFFLINE' ||
             k.printerStatus === 'OFFLINE' ||
             k.printerStatus === 'ERROR' ||
             k.printerStatus === 'STOPPED' ||
             k.printerStatus === 'DISCONNECTED' ||
             (k.kioskId === 'PB-001' && !livePrinter.isOnline))

        const printerStatus = isTestMode
          ? 'READY'
          : (isOffline ? 'OFFLINE' : (k.printerStatus || 'READY'))

        const isMaintenance = String(k.status || '').toUpperCase() === 'MAINTENANCE'
        const status = isMaintenance
          ? 'MAINTENANCE'
          : (isTestMode ? 'ONLINE' : (isOffline ? 'OFFLINE' : 'ONLINE'))

        return {
          id: k.kioskId,
          name: k.name,
          location: k.location,
          address: k.address,
          lat: k.lat ?? 18.5204,
          lng: k.lng ?? 73.8567,
          distance: '0.1 km',
          status,
          printerStatus,
          printerModel,
          printer: printerModel,
          paper: isOffline ? 0 : (k.paperLevel ?? 0),
          toner: isOffline ? 0 : (k.tonerLevel ?? 0),
          queue: k.queueCount,
          pricing: k.pricing,
          isTestMode,
          qrCodeUrl: k.qrCodeUrl || getKioskPrintUrl(k.kioskId, req),
          kioskPhotoUrl: k.kioskPhotoUrl || 'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=600&q=80',
          hardwareDetails: (isTestMode || isPiAlive) ? {
            isAvailable: isTestMode ? true : !isOffline,
            isOnline: isTestMode ? true : !isOffline,
            isHardwareReady: isTestMode ? true : !isOffline,
            isTestMode,
            port: isTestMode ? (livePrinter.port || 'VIRTUAL-SIM') : 'USB (Raspberry Pi)',
            driver: isTestMode ? (livePrinter.driver || 'PrintBooth Virtual Driver (Simulator)') : 'CUPS Linux Driver',
            connectionType: isTestMode ? 'TEST_SIMULATION' : 'USB_DIRECT',
            statusLabels: isTestMode ? ['Ready (Test Mode)'] : [printerStatus],
            selectedPrinter: printerModel,
          } : {
            isAvailable: false,
            isOnline: false,
            isHardwareReady: false,
            isTestMode,
            port: 'DISCONNECTED',
            driver: 'Offline',
            connectionType: 'NONE',
            statusLabels: ['OFFLINE', 'PI_DISCONNECTED'],
            selectedPrinter: printerModel,
          },
        }
      })
    )

    res.json({ success: true, isTestMode, data: formatted })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/kiosks/:id
kiosksRouter.get('/:id', cacheMiddleware({ ttlSeconds: 5, keyPrefix: 'kiosks:detail:' }), async (req: Request, res: Response) => {
  try {
    const kioskId = (req.params.id || '').trim().toUpperCase()
    if (!kioskId || !/^PB-\d{3}$/.test(kioskId)) {
      return res.status(400).json({
        success: false,
        error: `Invalid kiosk ID format '${req.params.id}'. PrintBooth station IDs must match canonical PB-XXX format (e.g. PB-001).`,
      })
    }
    const cleanId = kioskId
    const livePrinter = await getRealPrinterHardwareStatus()
    const isTestMode = (process.env.PRINT_MODE || 'real').toLowerCase() === 'test'
    const hasLiveError =
      !isTestMode &&
      (!livePrinter.isOnline ||
        !livePrinter.isHardwareReady ||
        !livePrinter.isAvailable ||
        Boolean(livePrinter.statusLabels?.some((l) => /error|offline|disconnected|stopped|not connected/i.test(l))))

    // Check if the merchant for this kiosk is blocked
    let isMerchantBlocked = false
    if (isDbConnected()) {
      try {
        const merchantDoc = await Merchant.findOne({
          kioskId: cleanId,
          $or: [{ isBlocked: true }, { status: 'BLOCKED' }],
        }).lean()
        if (merchantDoc) isMerchantBlocked = true
      } catch {}
    }
    if (!isMerchantBlocked) {
      const fbMerchant = fallbackMerchants.find(m => m.kioskId === cleanId && (m.isBlocked || m.status === 'BLOCKED'))
      if (fbMerchant) isMerchantBlocked = true
    }

    if (!isDbConnected()) {
      const fb = fallbackKiosks.find((k) => (k.kioskId || k.id) === cleanId)
      if (!fb) {
        return res.status(404).json({ success: false, error: 'Kiosk not found' })
      }
      const isHost = cleanId === 'PB-001'
      const isOffline = isMerchantBlocked ? true : (isHost ? !livePrinter.isOnline : (fb.status === 'OFFLINE' || fb.printerStatus === 'OFFLINE'))
      const printerModel = isHost ? (livePrinter.selectedPrinter || fb.printerModel || 'Laser Print Engine') : fb.printerModel
      const printerStatus = isMerchantBlocked
        ? 'OFFLINE'
        : (isHost
            ? (livePrinter.isOnline ? 'READY' : (livePrinter.statusLabels?.[0] || 'OFFLINE'))
            : fb.printerStatus)
      const enriched = {
        ...fb,
        kioskVariant: fb.kioskVariant || 'pro',
        variant: fb.kioskVariant || 'pro',
        lat: fb.lat ?? 18.5204,
        lng: fb.lng ?? 73.8567,
        printer: printerModel,
        printerModel,
        printerStatus,
        status: isMerchantBlocked ? 'OFFLINE' : (isOffline ? 'OFFLINE' : 'ONLINE'),
        isOffline,
        isBlocked: isMerchantBlocked,
        merchantBlocked: isMerchantBlocked,
        isTestMode: false,
        merchantContact: await resolveMerchantContactForKiosk(cleanId),
        hardwareDetails: isHost ? {
          isAvailable: isMerchantBlocked ? false : (isTestMode ? true : livePrinter.isAvailable),
          isOnline: isMerchantBlocked ? false : (isTestMode ? true : livePrinter.isOnline),
          isHardwareReady: isMerchantBlocked ? false : (isTestMode ? true : livePrinter.isHardwareReady),
          isTestMode,
          port: isTestMode ? (livePrinter.port || 'VIRTUAL-SIM') : livePrinter.port,
          driver: isTestMode ? (livePrinter.driver || 'PrintBooth Virtual Driver (Test Mode)') : livePrinter.driver,
          connectionType: isTestMode ? 'TEST_SIMULATION' : livePrinter.connectionType,
          statusLabels: isMerchantBlocked ? ['Suspended (Merchant Blocked)'] : (isTestMode ? ['Ready (Test Mode)'] : livePrinter.statusLabels),
          selectedPrinter: isTestMode
            ? (livePrinter.selectedPrinter || 'PrintBooth Test Printer (Mock)')
            : livePrinter.selectedPrinter,
        } : undefined,
      }
      return res.json({ success: true, data: enriched })
    }

    let kiosk = await Kiosk.findOne({ kioskId: cleanId }).lean()
    if (!kiosk) {
      const fb = fallbackKiosks.find((k) => (k.kioskId || k.id) === cleanId)
      if (fb) {
        const isHost = cleanId === 'PB-001'
        const isRelayActive = isKioskRelayConnected(cleanId)
        const isOffline = isTestMode
          ? false
          : (!isRelayActive || hasLiveError || fb.status === 'OFFLINE' || fb.printerStatus === 'OFFLINE' || fb.printerStatus === 'ERROR')
        const printerModel = isTestMode
          ? (livePrinter.selectedPrinter || fb.printerModel || fb.printer || 'PrintBooth Test Printer (Mock)')
          : (isHost ? livePrinter.selectedPrinter : fb.printerModel)

        const printerStatus = isTestMode
          ? 'READY'
          : (isHost
              ? (!isRelayActive || hasLiveError
                  ? (livePrinter.statusLabels?.find((l) => /error/i.test(l)) ? 'ERROR' : 'OFFLINE')
                  : (livePrinter.statusLabels?.[0] || 'READY'))
              : fb.printerStatus)
        const isMaintenance = String(fb.status || '').toUpperCase() === 'MAINTENANCE'
        return res.json({
          success: true,
          data: {
            ...fb,
            kioskVariant: fb.kioskVariant || 'pro',
            variant: fb.kioskVariant || 'pro',
            lat: fb.lat ?? 18.5204,
            lng: fb.lng ?? 73.8567,
            printer: printerModel,
            printerModel,
            printerStatus,
            status: isMaintenance
              ? 'MAINTENANCE'
              : (isTestMode ? 'ONLINE' : (isOffline ? 'OFFLINE' : (isRelayActive ? 'ONLINE' : 'OFFLINE'))),
            isTestMode,
            merchantContact: await resolveMerchantContactForKiosk(cleanId),
            hardwareDetails: isHost ? {
              isAvailable: isTestMode ? true : (!isOffline && isRelayActive && livePrinter.isAvailable),
              isOnline: isTestMode ? true : (!isOffline && isRelayActive && livePrinter.isOnline),
              isHardwareReady: isTestMode ? true : (!isOffline && isRelayActive && livePrinter.isHardwareReady),
              isTestMode,
              port: isTestMode ? (livePrinter.port || 'VIRTUAL-SIM') : (isRelayActive ? livePrinter.port : 'DISCONNECTED'),
              driver: isTestMode ? (livePrinter.driver || 'PrintBooth Virtual Driver (Test Mode)') : (isRelayActive ? livePrinter.driver : 'Offline'),
              connectionType: isTestMode ? 'TEST_SIMULATION' : (isRelayActive ? livePrinter.connectionType : 'NONE'),
              statusLabels: isTestMode ? ['Ready (Test Mode)'] : (isRelayActive ? livePrinter.statusLabels : ['OFFLINE', 'PI_DISCONNECTED']),
              selectedPrinter: isTestMode
                ? (livePrinter.selectedPrinter || 'PrintBooth Test Printer (Mock)')
                : livePrinter.selectedPrinter,
            } : undefined,
          },
        })
      }
      return res.status(404).json({ success: false, error: 'Kiosk not found' })
    }

    const kDoc = kiosk as any
    const isRelayActive = isKioskRelayConnected(cleanId)
    const isPiHeartbeatFresh = Boolean(kDoc.lastSeenAt && (Date.now() - new Date(kDoc.lastSeenAt).getTime() < 60000))
    const reachability = await isKioskPiReachable(cleanId)
    const isPiAlive = isTestMode ? true : (reachability.isReachable && isRelayActive)

    const printerModel = isTestMode
      ? (livePrinter.selectedPrinter || kDoc.printerModel || 'Laser Print Engine (Simulator)')
      : (isPiAlive
          ? (kDoc.printerModel || 'Laser Print Engine')
          : (kDoc.printerModel || 'Laser Print Engine (Offline)'))

    const piPrinters = getKioskPiPrinters(cleanId)
    const isUsbDisconnected = (piPrinters && piPrinters.usbConnected === false) || kDoc.usbConnected === false
    const isOffline = isMerchantBlocked
      ? true
      : (isTestMode
          ? false
          : (!isPiAlive ||
             !isRelayActive ||
             isUsbDisconnected ||
             kDoc.status === 'OFFLINE' ||
             kDoc.printerStatus === 'OFFLINE' ||
             kDoc.printerStatus === 'ERROR' ||
             kDoc.printerStatus === 'STOPPED' ||
             kDoc.printerStatus === 'DISCONNECTED' ||
             (cleanId === 'PB-001' && !livePrinter.isOnline)))

    const printerStatus = isMerchantBlocked
      ? 'OFFLINE'
      : (isTestMode
          ? 'READY'
          : (isOffline ? 'OFFLINE' : (kDoc.printerStatus || 'READY')))

    const isMaintenance = String(kDoc.status || '').toUpperCase() === 'MAINTENANCE'
    res.json({
      success: true,
      data: {
        ...kDoc,
        kioskVariant: kDoc.kioskVariant || 'pro',
        variant: kDoc.kioskVariant || 'pro',
        qrCodeUrl: kDoc.qrCodeUrl || getKioskPrintUrl(cleanId, req),
        lat: kDoc.lat ?? 18.5204,
        lng: kDoc.lng ?? 73.8567,
        printer: printerModel,
        printerModel,
        printerStatus,
        status: isMerchantBlocked ? 'OFFLINE' : (isMaintenance
          ? 'MAINTENANCE'
          : (isTestMode ? 'ONLINE' : (isOffline ? 'OFFLINE' : 'ONLINE'))),
        isOffline,
        isBlocked: isMerchantBlocked,
        merchantBlocked: isMerchantBlocked,
        isTestMode,
        merchantContact: await resolveMerchantContactForKiosk(cleanId),
        hardwareDetails: (isTestMode || (isPiAlive && !isOffline)) ? {
          isAvailable: true,
          isOnline: true,
          isHardwareReady: true,
          isTestMode,
          port: isTestMode ? (livePrinter.port || 'VIRTUAL-SIM') : 'USB (Raspberry Pi)',
          driver: isTestMode ? (livePrinter.driver || 'PrintBooth Virtual Driver (Simulator)') : 'CUPS Linux Driver',
          connectionType: isTestMode ? 'TEST_SIMULATION' : 'USB_DIRECT',
          statusLabels: isTestMode ? ['Ready (Test Mode)'] : [printerStatus],
          selectedPrinter: printerModel,
        } : {
          isAvailable: false,
          isOnline: false,
          isHardwareReady: false,
          isTestMode,
          port: 'DISCONNECTED',
          driver: 'Offline',
          connectionType: 'NONE',
          statusLabels: ['OFFLINE', 'PI_DISCONNECTED'],
          selectedPrinter: printerModel,
        },
        paymentGateway: kDoc.paymentGateway || 'upiexpress',
        paymentConfig: {
          paymentGateway: kDoc.paymentGateway || 'upiexpress',
          upiExpressConfigured: Boolean(kDoc.upiExpressApiKey || process.env.UPIEXPRESS_API_KEY),
          razorpayConfigured: Boolean(kDoc.razorpayKeyId || process.env.RAZORPAY_KEY_ID),
          razorpayKeyId: kDoc.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '',
        },
      },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/kiosks/:id/payment-config - Dedicated gateway resolver for customer print page
kiosksRouter.get('/:id/payment-config', async (req: Request, res: Response) => {
  try {
    const kioskId = req.params.id.trim().toUpperCase()
    let kiosk: any = null
    let merchant: any = null

    if (isDbConnected()) {
      kiosk = await Kiosk.findOne({ kioskId }).lean()
      merchant = await Merchant.findOne({ kioskId }).lean()
      if (!merchant && kiosk?.merchantId) {
        merchant = await Merchant.findOne({ merchantId: kiosk.merchantId }).lean()
      }
    }

    if (!kiosk) {
      kiosk = fallbackKiosks.find((k) => (k.kioskId || k.id) === kioskId) || fallbackKiosks[0]
    }
    if (!merchant) {
      merchant = fallbackMerchants.find((m) => m.kioskId === kioskId || (kiosk?.merchantId && m.merchantId === kiosk.merchantId)) || fallbackMerchants[0]
    }

    const gateway = kiosk?.paymentGateway || merchant?.paymentGateway || 'upiexpress'
    const upiKey = kiosk?.upiExpressApiKey || merchant?.upiExpressApiKey || process.env.UPIEXPRESS_API_KEY || ''
    const rzpKey = kiosk?.razorpayKeyId || merchant?.razorpayKeyId || process.env.RAZORPAY_KEY_ID || ''

    return res.json({
      success: true,
      data: {
        kioskId,
        paymentGateway: gateway,
        upiExpressConfigured: upiKey.length > 0,
        razorpayConfigured: rzpKey.length > 0,
        razorpayKeyId: rzpKey,
        merchantUpiId: kiosk?.upiExpressUpiId || merchant?.upiExpressUpiId || '',
        mode: rzpKey.startsWith('rzp_live') ? 'live' : 'test',
      },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/kiosks/:id/verify-auth - Raspberry Pi initial provisioning verification handshake
kiosksRouter.get('/:id/verify-auth', verifyKioskSecret, async (req: Request, res: Response) => {
  return res.json({
    success: true,
    message: `Station ${req.kiosk?.kioskId} authenticated successfully`,
    data: {
      kioskId: req.kiosk?.kioskId,
      name: req.kiosk?.name,
      location: req.kiosk?.location,
      merchantId: req.kiosk?.merchantId,
      status: req.kiosk?.status,
    },
  })
})

// POST /api/kiosks/:id/heartbeat - Hardware IoT heartbeat update (Authenticated by device secret)
kiosksRouter.post('/:id/heartbeat', verifyKioskSecret, async (req: Request, res: Response) => {
  try {
    const { paperLevel, tonerLevel, printerStatus, queueCount, printerModel } = req.body
    const updateDoc: any = {
      paperLevel: paperLevel ?? 0,
      tonerLevel: tonerLevel ?? 0,
      printerStatus: printerStatus ?? 'OFFLINE',
      queueCount: queueCount ?? 0,
      lastSeenAt: new Date(),
    }
    if (printerModel) {
      updateDoc.printerModel = printerModel
    }
    const isError = printerStatus === 'ERROR' || printerStatus === 'OFFLINE'
    if (!isError) {
      updateDoc.status = 'ONLINE'
    }
    const kiosk = await Kiosk.findOneAndUpdate(
      { kioskId: req.params.id },
      { $set: updateDoc },
      { new: true }
    )

    // Update in-memory fallback cache as well
    const fb = fallbackKiosks.find((k) => (k.kioskId || k.id) === req.params.id) as any
    if (fb) {
      fb.lastSeenAt = updateDoc.lastSeenAt
      fb.printerStatus = updateDoc.printerStatus
      fb.status = updateDoc.status || 'ONLINE'
      if (updateDoc.printerModel) fb.printerModel = updateDoc.printerModel
    }

    // Invalidate cached kiosk status so customer web app immediately sees station ONLINE
    await cachePurgePattern('kiosks:*').catch(() => {})

    res.json({ success: true, data: kiosk })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/kiosks/maintenance/bulk — Bulk put all machines into maintenance or bring all online
kiosksRouter.post('/maintenance/bulk', async (req: Request, res: Response) => {
  try {
    const { action } = req.body // 'MAINTENANCE' | 'ONLINE'
    const targetStatus = (action || '').toUpperCase() === 'MAINTENANCE' ? 'MAINTENANCE' : 'ONLINE'

    // 1. Update in-memory fallback kiosks
    fallbackKiosks.forEach((k) => {
      k.status = targetStatus
    })

    // 2. Update persistent MongoDB kiosks if connected
    if (isDbConnected()) {
      await Kiosk.updateMany({}, { $set: { status: targetStatus } })
    }

    // 3. Purge Redis caches so customer web app & admin fleet immediately update
    await cachePurgePattern('kiosks:*').catch(() => {})
    await cachePurgePattern('admin:*').catch(() => {})

    res.json({
      success: true,
      message: `All fleet kiosks have been switched to ${targetStatus}`,
      status: targetStatus,
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// PATCH & PUT /api/kiosks/:id/status — Toggle a separate machine into maintenance, online, or offline
const handleSingleKioskStatus = async (req: Request, res: Response) => {
  try {
    const cleanId = (req.params.id || '').trim()
    const { status } = req.body
    const cleanStatus = (status || 'ONLINE').toUpperCase() // 'ONLINE' | 'MAINTENANCE' | 'OFFLINE'

    // 1. Update fallback list
    const fb = fallbackKiosks.find((k) => (k.kioskId || k.id) === cleanId)
    if (fb) {
      fb.status = cleanStatus
    }

    // 2. Update in MongoDB
    let updatedDoc: any = null
    if (isDbConnected()) {
      updatedDoc = await Kiosk.findOneAndUpdate(
        { kioskId: cleanId },
        { $set: { status: cleanStatus } },
        { new: true }
      )
    }

    // 3. Invalidate caches
    await cachePurgePattern('kiosks:*').catch(() => {})
    await cachePurgePattern('admin:*').catch(() => {})

    res.json({
      success: true,
      message: `Kiosk ${cleanId} status updated to ${cleanStatus}`,
      data: updatedDoc || fb || { kioskId: cleanId, status: cleanStatus },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

kiosksRouter.patch('/:id/status', handleSingleKioskStatus)
kiosksRouter.put('/:id/status', handleSingleKioskStatus)

// GET /api/kiosks/:id/detected-printers — Lists all detected printers on this kiosk machine
kiosksRouter.get('/:id/detected-printers', async (req: Request, res: Response) => {
  try {
    const kioskId = req.params.id || 'PB-001'
    const hardware = await CupsAutomationService.getHardwareState(kioskId)
    res.json({
      success: true,
      kioskId,
      activePrinter: hardware?.printer?.name || hardware?.printer?.model,
      isPrinterOnline: hardware?.printer?.isOnline || false,
      printerStatus: hardware?.printer?.status || 'OFFLINE',
      printers: hardware?.allPrinters || [],
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/kiosks/:id/select-printer — Set the active printer for this kiosk
kiosksRouter.post('/:id/select-printer', async (req: Request, res: Response) => {
  try {
    const kioskId = req.params.id || 'PB-001'
    const { printerName } = req.body
    if (!printerName) {
      return res.status(400).json({ success: false, error: 'printerName is required' })
    }
    const result = await CupsAutomationService.selectPrinter(kioskId, printerName)
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/kiosks/:id/config — Dynamic kiosk upload URL & config (no .env needed in kiosk)
kiosksRouter.get('/:id/config', async (req: Request, res: Response) => {
  try {
    const kioskId = (req.params.id || 'PB-001').toUpperCase()
    const webUrl = getPublicWebUrl(req)
    const qrUrl = getKioskPrintUrl(kioskId, req)
    let kioskVariant = 'pro'
    if (isDbConnected()) {
      const k = await Kiosk.findOne({ kioskId }).select('kioskVariant').lean()
      if (k && (k as any).kioskVariant) kioskVariant = (k as any).kioskVariant
    } else {
      const fb = fallbackKiosks.find((k: any) => (k.kioskId || k.id) === kioskId)
      if (fb && fb.kioskVariant) kioskVariant = fb.kioskVariant
    }
    res.json({
      success: true,
      kioskId,
      kioskVariant,
      variant: kioskVariant,
      siteUrl: webUrl,
      webUrl,
      clientWebUrl: webUrl,
      qrUrl,
      kioskPrintUrl: qrUrl,
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/kiosks/:id/verify-pin — Verified on touchscreen keypad or Raspberry Pi agent
kiosksRouter.post('/:id/verify-pin', async (req: Request, res: Response) => {
  try {
    const kioskId = req.params.id
    const pin = req.body.pin || req.body.otp || req.body.code
    const result = await handleVerifyPinLogic(kioskId, pin)
    if (!result.success) {
      return res.status(400).json(result)
    }
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

kiosksRouter.post('/:id/pin/verify', async (req: Request, res: Response) => {
  try {
    const kioskId = req.params.id
    const pin = req.body.pin || req.body.otp || req.body.code
    const result = await handleVerifyPinLogic(kioskId, pin)
    if (!result.success) {
      return res.status(400).json(result)
    }
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/kiosks/:id/ads — Active background ad campaigns for this kiosk
kiosksRouter.get('/:id/ads', async (req: Request, res: Response) => {
  const kioskId = req.params.id
  req.url = `/kiosk/${kioskId}`
  // Delegate to advertisements router handler
  return res.redirect(307, `/api/advertisements/kiosk/${kioskId}`)
})

// POST /api/kiosks/:id/trigger-update — Triggers immediate autonomous GitHub pull and build
kiosksRouter.post('/:id/trigger-update', async (req: Request, res: Response) => {
  try {
    const kioskId = req.params.id
    const { force, branch } = req.body || {}

    if (!isKioskRelayConnected(kioskId)) {
      return res.status(409).json({
        success: false,
        error: `Kiosk ${kioskId} is not connected via WebSocket right now. Background 5-min timer will pull on next reconnect.`,
        isOnline: false,
      })
    }

    const dispatched = triggerKioskUpdate(kioskId, { force, branch })
    return res.json({
      success: dispatched,
      message: dispatched
        ? `Update command sent to Kiosk ${kioskId}. Pulling latest commits and rebuilding UI in background.`
        : 'Failed to dispatch update command',
      kioskId,
      dispatchedAt: Date.now(),
    })
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/kiosks/:id/update-status — Returns latest GitHub update telemetry from kiosk
kiosksRouter.get('/:id/update-status', async (req: Request, res: Response) => {
  const kioskId = req.params.id
  const status = getKioskUpdateStatus(kioskId)
  return res.json({
    success: true,
    kioskId,
    updateStatus: status || { status: 'IDLE', message: 'No update in progress' },
    isConnected: isKioskRelayConnected(kioskId),
  })
})

// POST /api/kiosks/webhook/github — Automated GitHub push webhook trigger
// Automatically triggers all connected kiosks to pull updates and restart display
kiosksRouter.post(['/webhook/github', '/git-update-trigger', '/github'], async (req: Request, res: Response) => {
  try {
    const event = req.headers['x-github-event'] || 'push'
    const ref = req.body?.ref || '' // e.g. refs/heads/main
    const branch = ref ? ref.replace('refs/heads/', '') : (req.body?.branch || 'main')
    const commit = req.body?.after || req.body?.head_commit?.id || 'latest'
    const commitMsg = req.body?.head_commit?.message || 'New commit pushed to GitHub'
    const author = req.body?.head_commit?.author?.name || 'GitHub Webhook'

    console.log(`[GitHub Auto-Update Trigger] 🚀 Push event on branch '${branch}'! Commit: ${typeof commit === 'string' ? commit.substring(0, 7) : commit} by ${author}: "${commitMsg}"`)

    const targetKioskId = req.query.kioskId as string | undefined
    let dispatchedCount = 0

    if (targetKioskId) {
      if (triggerKioskUpdate(targetKioskId, { branch, force: true })) {
        dispatchedCount++
      }
    } else {
      const connectedKiosks = getConnectedKioskIds()
      for (const kId of connectedKiosks) {
        if (triggerKioskUpdate(kId, { branch, force: true })) {
          dispatchedCount++
        }
      }
    }

    return res.json({
      success: true,
      message: `Git auto-update trigger received. Dispatched update & kiosk restart command to ${dispatchedCount} connected kiosk(s).`,
      event,
      branch,
      commit: typeof commit === 'string' ? commit.substring(0, 7) : commit,
      dispatchedCount,
      timestamp: Date.now(),
    })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message })
  }
})


