import { Router, Request, Response } from 'express'
import { Order } from '../models/Order.js'
import { Kiosk } from '../models/Kiosk.js'
import { PricingRule } from '../models/Pricing.js'
import { isDbConnected } from '../db.js'
import { fallbackKiosks, fallbackOrders } from '../fallbackData.js'
import { orderLimiter } from '../middleware/rateLimiter.js'
import { cachePurgePattern, cacheSet, cacheGet } from '../redis.js'
import { relayToKiosk } from '../modules/wsRelay.js'

import { isUserBlocked, normalizeIp } from '../modules/blocklist.js'
import { printJobs, usedPinsRegistry, parsePageRangeList } from './print.js'
import { permanentlyDeleteOrderFiles } from '../modules/fileLifecycle.js'
import { verifyKioskSecret, safeEqual, generateKioskSecret } from '../modules/kioskAuth.js'
import { isKioskPiReachable, markKioskOffline } from '../modules/kioskLiveness.js'
import { consumePaperForOrder } from '../modules/paperManager.js'

export const ordersRouter = Router()

// POST /api/orders - Create new customer print order (rate-limited)
ordersRouter.post('/', orderLimiter, async (req: Request, res: Response) => {
  try {
    const {
      kioskId,
      fileName = 'Document.pdf',
      fileSize = 1024000,
      pageCount = 1,
      copies = 1,
      duplex: inputDuplex,
      paperSize = 'A4',
      pageRange,
      pages,
      scaling,
      pagesPerSheet,
      printSettings,
      amount,
      customerPhone,
      customerEmail,
      customerMac,
    } = req.body

    const rawDuplex = inputDuplex ?? printSettings?.duplex
    const duplex = (
      typeof rawDuplex === 'boolean'
        ? rawDuplex
        : ['DOUBLE', 'DUPLEX', 'TWO-SIDED', '2-SIDED', 'TRUE', '1'].includes(String(rawDuplex || '').toUpperCase().trim())
    ) ? 'DOUBLE' : 'SINGLE'

    const rawColour = req.body.colourMode || req.body.colour || printSettings?.colourMode || printSettings?.colour || 'BW'
    const pageColours = req.body.pageColours || printSettings?.pageColours
    const pageCopies = req.body.pageCopies || printSettings?.pageCopies

    let hasAnyColorPage = false
    if (pageColours && typeof pageColours === 'object') {
      hasAnyColorPage = Object.values(pageColours).some((c: any) => {
        const norm = String(c).toUpperCase().replace('&', '')
        return norm === 'COLOUR' || norm === 'COLOR'
      })
    } else if (typeof pageColours === 'string') {
      try {
        const parsed = JSON.parse(pageColours)
        hasAnyColorPage = Object.values(parsed).some((c: any) => {
          const norm = String(c).toUpperCase().replace('&', '')
          return norm === 'COLOUR' || norm === 'COLOR'
        })
      } catch {}
    }

    const cleanColStr = String(rawColour).toUpperCase().replace('&', '')
    const baseColourMode = (cleanColStr === 'COLOUR' || cleanColStr === 'COLOR') ? 'COLOUR' : 'BW'
    const colourMode = (hasAnyColorPage || baseColourMode === 'COLOUR') ? 'COLOUR' : 'BW'

    const normPageRange = String(pageRange || pages || printSettings?.pageRange || printSettings?.pages || 'ALL').trim()
    const normScaling = String(scaling || printSettings?.scaling || 'FIT').trim()
    const normPagesPerSheet = Number(pagesPerSheet || printSettings?.pagesPerSheet || 1)

    // ── Strict Parameter Validation: Kiosk ID ──
    if (!kioskId || typeof kioskId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'kioskId is required. Direct print orders without an active target machine are not permitted.',
      })
    }

    const cleanKioskId = kioskId.trim()
    if (!/^PB-\d{3}$/.test(cleanKioskId)) {
      return res.status(400).json({
        success: false,
        error: `Invalid kioskId format '${kioskId}'. Target machine must match canonical PB-XXX format (e.g. PB-001). Lowercase or arbitrary parameters like 'p-002' are rejected.`,
      })
    }

    // ── Blocklist Enforcement: Prevent blocked users from using the machine ──
    const clientIp = normalizeIp((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress)
    const clientMac = ((req.headers['x-client-mac'] as string) || customerMac || '')?.trim().toLowerCase()

    if (await isUserBlocked(cleanKioskId, clientIp, clientMac)) {
      return res.status(403).json({
        success: false,
        error: 'Access Denied: You have been blocked from using this machine by the merchant partner.',
        blocked: true,
      })
    }

    // Verify kiosk exists in MongoDB or fallback registry
    let verifiedKiosk = false
    let dbKiosk: any = null
    if (isDbConnected()) {
      dbKiosk = await Kiosk.findOne({ kioskId: cleanKioskId })
      if (dbKiosk) verifiedKiosk = true
    }
    const fbKiosk = fallbackKiosks.find((k) => (k.kioskId || k.id) === cleanKioskId)
    if (fbKiosk) verifiedKiosk = true
    const assignedMerchantId = dbKiosk?.merchantId || fbKiosk?.merchantId || 'M-001'

    if (!verifiedKiosk) {
      return res.status(404).json({
        success: false,
        error: `Kiosk '${cleanKioskId}' is not a registered PrintBooth station. Orders can only be dispatched to verified hardware.`,
      })
    }

    // Hardware Reachability Check: Prevent order dispatch to powered-off or disconnected Pi in production
    const isDev = process.env.NODE_ENV !== 'production' || process.env.ALLOW_OFFLINE_STAGING === 'true'
    const reachability = await isKioskPiReachable(cleanKioskId)
    if (!reachability.isReachable) {
      if (!isDev) {
        await markKioskOffline(cleanKioskId, reachability.reason)
        return res.status(400).json({
          success: false,
          kioskOffline: true,
          error: `Station ${cleanKioskId} is currently offline or powered off. Direct print jobs cannot be accepted until hardware is powered on.`,
        })
      } else {
        console.info(`[Orders] Dev mode active: staging order for station ${cleanKioskId} despite unlinked physical Pi.`)
      }
    }

    const ratePerPage = colourMode === 'COLOUR' ? 10.0 : 2.0
    const totalAmount = typeof amount === 'number' && amount > 0 ? amount : ratePerPage * pageCount * copies
    const hostCut = Number((totalAmount * 0.18).toFixed(2))
    const orderNumber = `PB-2026-${Math.floor(1000 + Math.random() * 9000)}`
    const orderId = `ORD-${Date.now().toString().slice(-6)}`
    const rawPin = req.body.releasePin || req.body.otp || req.body.pickupCode
    let releasePin = (rawPin && String(rawPin).trim().length === 4)
      ? String(rawPin).trim()
      : (rawPin && String(rawPin).trim().length >= 4)
        ? String(rawPin).trim().slice(0, 4)
        : ''

    // Ensure generated or assigned PIN was never used before
    if (!releasePin || usedPinsRegistry.has(releasePin)) {
      let attempts = 0
      do {
        releasePin = Math.floor(1000 + Math.random() * 9000).toString()
        attempts++
      } while (usedPinsRegistry.has(releasePin) && attempts < 50)
    }
    const pickupCode = releasePin
    const otp = releasePin

    const docPages = Math.max(1, Number(req.body.totalDocPages || req.body.docPageCount || pageCount) || 1)
    const selectedPages = parsePageRangeList(normPageRange, docPages)
    const specifiedPageCount = selectedPages.length

    const orderData: any = {
      orderId,
      orderNumber,
      kioskId: cleanKioskId,
      fileName,
      fileSize,
      status: 'PAID',
      pageCount: specifiedPageCount,
      totalDocPages: docPages,
      docPageCount: docPages,
      selectedPages,
      copies,
      colourMode,
      duplex,
      paperSize,
      pageRange: normPageRange,
      pages: normPageRange,
      scaling: normScaling,
      pagesPerSheet: normPagesPerSheet,
      files: req.body.files || printSettings?.files,
      printSettings: {
        ...(printSettings || {}),
        files: req.body.files || printSettings?.files,
        pageRange: normPageRange,
        pages: normPageRange,
        selectedPages,
        pageCount: specifiedPageCount,
        totalDocPages: docPages,
        docPageCount: docPages,
        scaling: normScaling,
        pagesPerSheet: normPagesPerSheet,
        copies,
        colourMode,
        duplex,
        paperSize,
        pageColours: pageColours || printSettings?.pageColours,
        pageCopies: pageCopies || printSettings?.pageCopies,
      },
      pageColours: pageColours || printSettings?.pageColours,
      pageCopies: pageCopies || printSettings?.pageCopies,
      amount: totalAmount,
      merchantId: assignedMerchantId,
      merchantCut: hostCut,
      customerPhone,
      customerEmail,
      customerIp: clientIp,
      customerMac: clientMac,
      pickupCode,
      releasePin,
      otp,
      fileExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      fileDeleted: false,
      paidAt: new Date().toISOString(),
      createdAt: new Date(),
    }

    // Keep in-memory cache synchronized
    fallbackOrders.unshift(orderData)

    // Notify connected Raspberry Pi kiosk over WSS that a job is staged with this PIN
    relayToKiosk(cleanKioskId, {
      type: 'PRINT_JOB_STAGED',
      kioskId: cleanKioskId,
      orderId,
      payload: {
        orderId,
        orderNumber,
        releasePin,
        otp,
        pickupCode,
        fileName,
        files: req.body.files || printSettings?.files,
        copies,
        colourMode,
        duplex,
        paperSize,
        pageRange: normPageRange,
        pages: normPageRange,
        selectedPages,
        pageCount: specifiedPageCount,
        totalDocPages: docPages,
        docPageCount: docPages,
        scaling: normScaling,
        orientation: (orderData.printSettings?.orientation || 'AUTO').toUpperCase(),
        pagesPerSheet: normPagesPerSheet,
        pageColours: pageColours || printSettings?.pageColours,
        pageCopies: pageCopies || printSettings?.pageCopies,
        printSettings: orderData.printSettings,
        fileUrl: `${req.protocol}://${req.get('host')}/api/print/download/${orderId}`,
        createdAt: Date.now(),
      },
    })

    if (!isDbConnected()) {
      return res.status(201).json({
        success: true,
        databaseConnected: false,
        data: orderData,
      })
    }

    // Calculate real rate from MongoDB pricing rule
    const rule = await PricingRule.findOne({ paperSize, colourMode, duplex, active: true })
    const actualRate = rule ? rule.pricePerPage : ratePerPage
    const actualTotal = typeof amount === 'number' && amount > 0 ? amount : actualRate * pageCount * copies
    const actualHostCut = Number((actualTotal * 0.18).toFixed(2))

    const newOrder = await Order.create({
      orderId,
      orderNumber,
      kioskId: cleanKioskId,
      fileName,
      fileSize,
      status: 'PAID',
      pageCount,
      copies,
      colourMode,
      duplex,
      paperSize,
      pageRange: normPageRange,
      scaling: normScaling,
      pagesPerSheet: normPagesPerSheet,
      fileUrl: `/api/print/download/${orderId}`,
      printSettings: orderData.printSettings,
      amount: actualTotal,
      merchantCut: actualHostCut,
      customerPhone,
      customerEmail,
      customerIp: clientIp,
      customerMac: clientMac,
      pickupCode,
      releasePin,
      otp,
      paidAt: new Date(),
    })

    // Increment kiosk today revenue & pages
    await Kiosk.findOneAndUpdate(
      { kioskId: cleanKioskId },
      {
        $inc: { todayRevenue: totalAmount, todayPages: pageCount * copies, totalRevenue: totalAmount },
      }
    )

    // Deduct physical sheets from printer tray and record audit history
    consumePaperForOrder(
      cleanKioskId,
      pageCount * copies,
      orderId,
      `Customer Print Order #${orderId} (${pageCount * copies} sheets)`
    ).catch((err) => {
      console.warn(`[Orders] Warning consuming paper for ${orderId}:`, err)
    })

    cachePurgePattern('kiosks:*').catch(() => {})
    cachePurgePattern('admin:*').catch(() => {})
    cacheSet(`order:${orderId}`, newOrder, 3600).catch(() => {})

    res.status(201).json({
      success: true,
      data: newOrder,
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/orders - List orders (with kioskId and status filter for Raspberry Pi agent)
ordersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const rawKiosk = (req.query.kioskId as string || (req.headers['x-kiosk-id'] as string) || '').trim().toUpperCase()
    const kioskId = rawKiosk
    const status = (req.query.status as string || '').trim().toUpperCase()

    // Strict Cryptographic Authentication for Kiosk Order Access
    if (kioskId) {
      const providedSecret =
        (req.headers['x-kiosk-secret'] as string) ||
        (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : (req.query.secret as string) || '')

      if (isDbConnected()) {
        const kDoc = await Kiosk.findOne({ kioskId })
        if (kDoc) {
          if (!kDoc.deviceSecret) {
            kDoc.deviceSecret = generateKioskSecret()
            await kDoc.save()
          }
          const isMatch = providedSecret && safeEqual(providedSecret, kDoc.deviceSecret)
          const isDevLocal = process.env.NODE_ENV !== 'production' && kioskId === 'PB-001' && !providedSecret
          if (!isMatch && !isDevLocal) {
            console.warn(`[Order Security] 🚨 REJECTED UNAUTHORIZED ORDER ACCESS for station '${kioskId}' from IP ${req.ip}. Invalid cryptographic secret.`)
            return res.status(401).json({
              success: false,
              error: `Unauthorized: Missing or invalid cryptographic device secret for station ${kioskId}.`,
            })
          }
        }
      }
    }

    let filter: any = {}
    if (kioskId) filter.kioskId = kioskId
    if (status) filter.status = status

    let orders: any[] = []
    if (isDbConnected()) {
      orders = await Order.find(filter).sort({ createdAt: -1 }).limit(50).lean()
    }
    if (orders.length === 0) {
      orders = fallbackOrders.filter((o) => {
        if (kioskId && (o.kioskId || 'PB-001') !== kioskId) return false
        if (status && (o.status || '').toUpperCase() !== status) return false
        return true
      })
    }

    // Enrich existing orders with staged job settings and unpacked printSettings
    for (const o of orders) {
      const job = printJobs.get(o.orderId) || (o.orderNumber ? printJobs.get(o.orderNumber) : undefined)
      if (job) {
        o.copies = job.copies || o.copies || 1
        o.colourMode = job.colourMode || o.colourMode || 'BW'
        o.duplex = job.duplex || o.duplex || 'SINGLE'
        o.paperSize = job.paperSize || o.paperSize || 'A4'
        o.pageRange = job.pageRange || o.pageRange || 'ALL'
        o.scaling = job.scaling || o.scaling || 'FIT'
        o.pagesPerSheet = job.pagesPerSheet || o.pagesPerSheet || 1
        if (job.releasePin) o.releasePin = job.releasePin
        if (job.pageColours) o.pageColours = job.pageColours
        if (job.pageCopies) o.pageCopies = job.pageCopies
      } else {
        const ps = o.printSettings || {}
        o.copies = o.copies || ps.copies || 1
        o.colourMode = o.colourMode || ps.colourMode || ps.colour || 'BW'
        o.duplex = o.duplex || ps.duplex || 'SINGLE'
        o.paperSize = o.paperSize || ps.paperSize || 'A4'
        o.pageRange = o.pageRange || ps.pageRange || ps.pages || 'ALL'
        o.scaling = o.scaling || ps.scaling || 'FIT'
        o.pagesPerSheet = o.pagesPerSheet || ps.pagesPerSheet || 1
        o.pageColours = o.pageColours || ps.pageColours
        o.pageCopies = o.pageCopies || ps.pageCopies
      }
      o.pages = o.pageRange
      o.colour = o.colourMode
      o.otp = o.releasePin || o.otp || o.pickupCode
      o.pickupCode = o.releasePin || o.otp || o.pickupCode
      o.fileUrl = `/api/print/download/${o.orderId}`

      const isUsed = Boolean(
        o.isPinUsed ||
        job?.isPinUsed ||
        o.status === 'COMPLETED' ||
        o.status === 'PRINTED' ||
        job?.status === 'PRINTED' ||
        (o.releasePin && usedPinsRegistry.has(o.releasePin)) ||
        (o.otp && usedPinsRegistry.has(o.otp)) ||
        (o.pickupCode && usedPinsRegistry.has(o.pickupCode))
      )
      o.isPinUsed = isUsed
      if (isUsed) {
        o.releasePin = undefined
        o.otp = undefined
        o.pickupCode = undefined
      }

      if (!o.printSettings) {
        o.printSettings = {
          copies: o.copies,
          colourMode: o.colourMode,
          colour: o.colourMode,
          duplex: o.duplex,
          paperSize: o.paperSize,
          pageRange: o.pageRange,
          pages: o.pageRange,
          scaling: o.scaling,
          pagesPerSheet: o.pagesPerSheet,
          pageColours: o.pageColours,
          pageCopies: o.pageCopies,
        }
      } else {
        o.printSettings.pageColours = o.pageColours || o.printSettings.pageColours
        o.printSettings.pageCopies = o.pageCopies || o.printSettings.pageCopies
      }
    }

    // Also include staged print jobs from printJobs map (without duplicates)
    for (const job of printJobs.values()) {
      if (kioskId && (job.kioskId || 'PB-001') !== kioskId) continue
      if (status && (job.status || '').toUpperCase() !== status && (job.status !== 'QUEUED' || status !== 'PAID')) continue

      const isUsed = Boolean(
        job.isPinUsed ||
        job.status === 'PRINTED' ||
        (job.releasePin && usedPinsRegistry.has(job.releasePin))
      )
      if ((status === 'PAID' || status === 'VERIFIED') && isUsed) {
        continue
      }
      
      const isAlreadyIncluded = orders.some(
        (o) =>
          o.orderId === job.orderId ||
          o.orderNumber === job.orderId ||
          (job.releasePin && (o.releasePin === job.releasePin || o.otp === job.releasePin || o.pickupCode === job.releasePin))
      )

      if (!isAlreadyIncluded) {
        orders.push({
          orderId: job.orderId,
          orderNumber: job.orderId,
          kioskId: job.kioskId || 'PB-001',
          fileName: job.fileName,
          status: job.status === 'QUEUED' ? 'PAID' : job.status,
          copies: job.copies,
          colourMode: job.colourMode,
          colour: job.colourMode,
          duplex: job.duplex,
          paperSize: job.paperSize || 'A4',
          pageRange: job.pageRange || 'ALL',
          pages: job.pageRange || 'ALL',
          scaling: job.scaling || 'FIT',
          pagesPerSheet: job.pagesPerSheet || 1,
          margins: job.margins || 'STANDARD',
          contrastMode: job.contrastMode || 'BALANCED',
          releasePin: isUsed ? undefined : job.releasePin,
          otp: isUsed ? undefined : job.releasePin,
          pickupCode: isUsed ? undefined : job.releasePin,
          isPinUsed: isUsed,
          pageCount: job.totalPages || 1,
          fileUrl: `/api/print/download/${job.orderId}`,
          printSettings: {
            copies: job.copies,
            colour: job.colourMode,
            colourMode: job.colourMode,
            duplex: job.duplex,
            paperSize: job.paperSize || 'A4',
            pages: job.pageRange || 'ALL',
            pageRange: job.pageRange || 'ALL',
            scaling: job.scaling || 'FIT',
            pagesPerSheet: job.pagesPerSheet || 1,
            margins: job.margins || 'STANDARD',
            contrastMode: job.contrastMode || 'BALANCED',
            pageColours: job.pageColours,
            pageCopies: job.pageCopies,
          },
          pageColours: job.pageColours,
          pageCopies: job.pageCopies,
          createdAt: new Date(job.startedAt),
        })
      }
    }

    return res.json({ success: true, data: orders })
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/orders/:id
ordersRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const cacheKey = `order:${req.params.id}`
    const cached = await cacheGet(cacheKey)
    if (cached) {
      return res.json({ success: true, data: cached })
    }

    let order: any = null
    if (isDbConnected()) {
      order = await Order.findOne({
        $or: [{ orderId: req.params.id }, { orderNumber: req.params.id }],
      })
    }
    if (!order) {
      order = fallbackOrders.find((o) => o.orderId === req.params.id || o.orderNumber === req.params.id)
    }
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' })
    }

    cacheSet(cacheKey, order, 120).catch(() => {})
    res.json({ success: true, data: order })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/orders/:id/status - Update order status (used by Raspberry Pi daemon upon completion)
ordersRouter.post('/:id/status', handleUpdateOrderStatus)
ordersRouter.patch('/:id/status', handleUpdateOrderStatus)
ordersRouter.put('/:id/status', handleUpdateOrderStatus)

async function handleUpdateOrderStatus(req: Request, res: Response) {
  try {
    const { id } = req.params
    const rawStatus = req.body.status || 'PRINTED'
    const normalizedStatus = String(rawStatus).toUpperCase()

    console.log(`[Order Status] Updating order ${id} status to: ${normalizedStatus}`)

    const isFinished = normalizedStatus === 'PRINTED' || normalizedStatus === 'READY_FOR_COLLECTION' || normalizedStatus === 'COMPLETED'

    // 1. Update in-memory job
    const job = printJobs.get(id)
    if (job) {
      job.status = normalizedStatus === 'READY_FOR_COLLECTION' ? 'PRINTED' : (normalizedStatus as any)
      if (isFinished) {
        job.completedAt = Date.now()
        job.percent = 100
        job.isPinUsed = true
        job.pinUsedAt = Date.now()
        if (job.releasePin) {
          usedPinsRegistry.add(job.releasePin)
          cacheSet(`used_pin:${job.releasePin}`, '1', 86400 * 30).catch(() => {})
          delete job.releasePin
        }
      }
      cacheSet(`print:job:${id}`, job, 86400).catch(() => {})
    }

    // 2. Update DB
    if (isDbConnected()) {
      const updatePayload: any = {
        status: normalizedStatus === 'READY_FOR_COLLECTION' ? 'COMPLETED' : normalizedStatus,
        updatedAt: new Date(),
      }
      if (isFinished) {
        updatePayload.printedAt = new Date()
        updatePayload.completedAt = new Date()
        updatePayload.isPinUsed = true
        updatePayload.pinUsedAt = new Date()
      }
      await Order.findOneAndUpdate(
        { $or: [{ orderId: id }, { orderNumber: id }] },
        updatePayload
      )
    }

    // 3. Update fallback
    const fb = fallbackOrders.find((o) => o.orderId === id || o.orderNumber === id)
    if (fb) {
      fb.status = (normalizedStatus === 'READY_FOR_COLLECTION' ? 'COMPLETED' : normalizedStatus) as any
      if (isFinished) {
        fb.isPinUsed = true
        if (fb.releasePin) {
          usedPinsRegistry.add(fb.releasePin)
          cacheSet(`used_pin:${fb.releasePin}`, '1', 86400 * 30).catch(() => {})
          delete (fb as any).releasePin
        }
      }
    }

    // 4. Secure File Purge: Immediately delete physical document file if printed/completed
    if (isFinished) {
      permanentlyDeleteOrderFiles(id, 'ORDER_PRINTED_COMPLETED').catch((err) => {
        console.warn(`[Order Status] Notice during file purge for ${id}:`, err)
      })
    }

    // Purge caches
    cachePurgePattern(`order:${id}*`).catch(() => {})

    return res.json({
      success: true,
      message: `Order ${id} status updated to ${normalizedStatus}`,
    })
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message })
  }
}
