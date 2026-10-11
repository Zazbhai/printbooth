/**
 * UPI Express Payment Routes
 * POST /api/upiexpress/create-order   — Create a UPI Express payment order
 * POST /api/upiexpress/check-status   — Check order status
 * GET  /api/upiexpress/config         — Get UPI Express config (key presence only)
 * POST /api/upiexpress/webhook        — Receive UPI Express webhook callbacks
 */

import { Router, Request, Response } from 'express'
import { isDbConnected } from '../db.js'
import { Payment } from '../models/Payment.js'
import { Order } from '../models/Order.js'
import { Kiosk } from '../models/Kiosk.js'
import { Merchant } from '../models/Merchant.js'
import { fallbackKiosks, fallbackMerchants } from '../fallbackData.js'
import { paymentLimiter } from '../middleware/rateLimiter.js'
import { relayPaymentCaptured } from '../modules/wsRelay.js'
import { getPublicWebUrl } from '../config.js'
import { isKioskPiReachable, markKioskOffline } from '../modules/kioskLiveness.js'
import { triggerSessionPrintOnPayment } from './kioskSessions.js'

export const upiExpressRouter = Router()
upiExpressRouter.use(paymentLimiter)

const UPIEXPRESS_BASE_URL = 'https://upiexpress.com/api'

export async function resolveUpiKeyForKiosk(kioskId?: string): Promise<string> {
  if (kioskId) {
    const cleanId = kioskId.trim().toUpperCase()
    if (isDbConnected()) {
      try {
        const kiosk: any = await Kiosk.findOne({ kioskId: cleanId }).lean()
        if (kiosk?.upiExpressApiKey) return kiosk.upiExpressApiKey
        let merchant: any = await Merchant.findOne({ kioskId: cleanId }).lean()
        if (!merchant && kiosk?.merchantId) {
          merchant = await Merchant.findOne({ merchantId: kiosk.merchantId }).lean()
        }
        if (merchant?.upiExpressApiKey) return merchant.upiExpressApiKey
      } catch {}
    }
    const fbK = fallbackKiosks.find(k => (k.kioskId || k.id) === cleanId) as any
    if (fbK?.upiExpressApiKey) return fbK.upiExpressApiKey
    const fbM = fallbackMerchants.find(m => m.kioskId === cleanId) as any
    if (fbM?.upiExpressApiKey) return fbM.upiExpressApiKey
  }
  return process.env.UPIEXPRESS_API_KEY || ''
}

export async function resolveMerchantUpiIdForKiosk(kioskId?: string): Promise<string> {
  if (kioskId) {
    const cleanId = kioskId.trim().toUpperCase()
    if (isDbConnected()) {
      try {
        const kiosk: any = await Kiosk.findOne({ kioskId: cleanId }).lean()
        if (kiosk?.upiExpressUpiId) return kiosk.upiExpressUpiId
        let merchant: any = await Merchant.findOne({ kioskId: cleanId }).lean()
        if (!merchant && kiosk?.merchantId) {
          merchant = await Merchant.findOne({ merchantId: kiosk.merchantId }).lean()
        }
        if (merchant?.upiExpressUpiId) return merchant.upiExpressUpiId
      } catch {}
    }
    const fbK = fallbackKiosks.find(k => (k.kioskId || k.id) === cleanId) as any
    if (fbK?.upiExpressUpiId) return fbK.upiExpressUpiId
    const fbM = fallbackMerchants.find(m => m.kioskId === cleanId) as any
    if (fbM?.upiExpressUpiId) return fbM.upiExpressUpiId
  }
  return 'printbooth@okaxis'
}

export interface CreateUpiOrderParams {
  kioskId?: string
  clientTxnId: string
  amount: number | string
  customerName?: string
  customerEmail?: string
  customerMobile?: string
  redirectUrl?: string
  webhookUrl?: string
  note?: string
  merchantid?: string
  udf1?: string
  udf2?: string
  udf3?: string
  udf4?: string
  udf5?: string
  skipReachabilityCheck?: boolean
}

export interface CreateUpiOrderResult {
  success: boolean
  error?: string
  kioskOffline?: boolean
  data?: {
    orderId: string
    paymentUrl: string
    upiIntentUrl: string
    upiIdHash: string
    upiIntent: any
    clientTxnId: string
    amount: number
    merchantUpiId?: string
    gateway: 'upiexpress'
  }
}

export async function createUpiExpressOrder(
  params: CreateUpiOrderParams,
  req?: Request
): Promise<CreateUpiOrderResult> {
  const kioskId = params.kioskId
  if (kioskId && !params.skipReachabilityCheck) {
    const reachability = await isKioskPiReachable(kioskId)
    if (!reachability.isReachable) {
      await markKioskOffline(kioskId, reachability.reason)
      return {
        success: false,
        kioskOffline: true,
        error: `Station ${kioskId} is currently offline or powered off. Hardware cannot accept print orders. Kindly ask the store merchant to check machine power, or choose another station.`,
      }
    }
  }

  const apiKey = await resolveUpiKeyForKiosk(kioskId)
  const merchantUpiId = await resolveMerchantUpiIdForKiosk(kioskId)

  if (!apiKey) {
    const fallbackDirect = `upi://pay?pa=${encodeURIComponent(merchantUpiId)}&pn=${encodeURIComponent('PrintBooth ' + (kioskId || 'Station'))}&am=${Number(params.amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(params.clientTxnId)}`
    return {
      success: true,
      data: {
        orderId: params.clientTxnId,
        paymentUrl: fallbackDirect,
        upiIntentUrl: fallbackDirect,
        upiIdHash: '',
        upiIntent: {},
        clientTxnId: params.clientTxnId,
        amount: Number(params.amount),
        merchantUpiId,
        gateway: 'upiexpress',
      },
    }
  }

  const {
    clientTxnId,
    amount,
    customerName = 'Kiosk Customer',
    customerEmail = 'kiosk@printbooth.co.in',
    customerMobile = '9999999999',
    redirectUrl = req ? getPublicWebUrl(req) : 'https://printbooth.co.in',
    note,
    webhookUrl,
    merchantid,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
  } = params

  const payload: Record<string, string> = {
    key: apiKey,
    client_txn_id: clientTxnId,
    amount: Number(amount).toFixed(2),
    p_info: note || `PrintBooth Station ${kioskId || 'PB-001'} Order`,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_mobile: customerMobile,
    redirect_url: redirectUrl,
  }

  const envWebhook = (
    process.env.UPIEXPRESS_WEBHOOK_URL ||
    process.env.UPI_EXPRESS_WEBHOOK_URL ||
    process.env.UPIEXPRESS_WEBHOOK ||
    ''
  ).trim()

  const effectiveWebhookUrl =
    envWebhook ||
    (typeof webhookUrl === 'string' && webhookUrl.trim() ? webhookUrl.trim() : '') ||
    (req ? `${req.protocol}://${req.get('host')}/api/upiexpress/webhook` : '')

  if (effectiveWebhookUrl) {
    payload.webhook_url = effectiveWebhookUrl
  }

  const effectiveMerchantId = merchantid || (process.env.UPIEXPRESS_MERCHANT_ID || '').trim()
  if (effectiveMerchantId) payload.merchantid = effectiveMerchantId

  if (note) payload.note = String(note).slice(0, 25)
  if (udf1) payload.udf1 = String(udf1).slice(0, 25)
  if (udf2) payload.udf2 = String(udf2).slice(0, 25)
  if (udf3) payload.udf3 = String(udf3).slice(0, 25)
  if (udf4) payload.udf4 = String(udf4).slice(0, 25)
  if (udf5) payload.udf5 = String(udf5).slice(0, 25)

  try {
    const response = await fetch(`${UPIEXPRESS_BASE_URL}/create_order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = (await response.json()) as any

    const isOk = data?.status === true || data?.success === true
    if (!isOk) {
      console.warn('[UPIExpress] create_order API returned non-success:', data?.msg || data?.message)
      const fallbackDirect = `upi://pay?pa=${encodeURIComponent(merchantUpiId)}&pn=${encodeURIComponent('PrintBooth ' + (kioskId || 'Station'))}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(clientTxnId)}`
      return {
        success: true,
        data: {
          orderId: clientTxnId,
          paymentUrl: fallbackDirect,
          upiIntentUrl: fallbackDirect,
          upiIdHash: '',
          upiIntent: {},
          clientTxnId,
          amount: Number(amount),
          merchantUpiId,
          gateway: 'upiexpress',
        },
      }
    }

    const rawData = data.data || {}
    const orderId = rawData.orderid || rawData.order_id || rawData.txn_id || clientTxnId
    const paymentUrl = rawData.payment_link || rawData.payment_url || ''
    const upiIntentUrl = rawData.upiintent || ''

    if (isDbConnected()) {
      try {
        await Payment.create({
          paymentId: `UPIE-${Date.now().toString().slice(-8)}`,
          razorpayOrderId: `upie_${orderId}`,
          orderId: clientTxnId,
          amount: Number(rawData.total || rawData.amount || amount),
          currency: 'INR',
          status: 'CREATED',
          description: `UPI Express order ${clientTxnId} for station ${kioskId || 'PB-001'}`,
          notes: { gateway: 'upiexpress', orderId: clientTxnId, kioskId },
        })
      } catch {}
    }

    return {
      success: true,
      data: {
        orderId,
        paymentUrl,
        upiIntentUrl,
        upiIdHash: rawData.upi_id_hash || '',
        upiIntent: typeof rawData.upi_intent === 'object' ? rawData.upi_intent : {},
        clientTxnId,
        amount: Number(rawData.total || rawData.amount || amount),
        merchantUpiId,
        gateway: 'upiexpress',
      },
    }
  } catch (err: any) {
    console.error('[UPIExpress] create_order network error:', err)
    const fallbackDirect = `upi://pay?pa=${encodeURIComponent(merchantUpiId)}&pn=${encodeURIComponent('PrintBooth ' + (kioskId || 'Station'))}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(clientTxnId)}`
    return {
      success: true,
      data: {
        orderId: clientTxnId,
        paymentUrl: fallbackDirect,
        upiIntentUrl: fallbackDirect,
        upiIdHash: '',
        upiIntent: {},
        clientTxnId,
        amount: Number(amount),
        merchantUpiId,
        gateway: 'upiexpress',
      },
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/upiexpress/config  — Return whether key is configured
// ─────────────────────────────────────────────────────────────────────────────
upiExpressRouter.get('/config', async (req: Request, res: Response) => {
  const kioskId = (req.query.kioskId as string) || (req.headers['x-kiosk-id'] as string)
  const apiKey = await resolveUpiKeyForKiosk(kioskId)
  const envWebhook = (
    process.env.UPIEXPRESS_WEBHOOK_URL ||
    process.env.UPI_EXPRESS_WEBHOOK_URL ||
    process.env.UPIEXPRESS_WEBHOOK ||
    ''
  ).trim()

  res.json({
    success: true,
    data: {
      configured: apiKey.length > 0,
      apiKeyPrefix: apiKey.length > 8 ? apiKey.slice(0, 8) + '…' : '',
      webhookConfigured: Boolean(envWebhook),
      webhookUrl: envWebhook || `${req.protocol}://${req.get('host')}/api/upiexpress/webhook`,
      kioskId: kioskId || null,
    },
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/upiexpress/create-order
// Body: { clientTxnId, amount, customerName?, customerEmail?, customerMobile?, redirectUrl, note?, kioskId? }
// ─────────────────────────────────────────────────────────────────────────────
upiExpressRouter.post('/create-order', async (req: Request, res: Response) => {
  try {
    const kioskId = req.body.kioskId || (req.headers['x-kiosk-id'] as string)
    const result = await createUpiExpressOrder(
      {
        ...req.body,
        kioskId,
      },
      req
    )

    if (!result.success) {
      return res.status(result.kioskOffline ? 400 : 500).json(result)
    }

    return res.json(result)
  } catch (error: any) {
    console.error('[UPIExpress] create-order route error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/upiexpress/check-status
// Body: { clientTxnId, txnDate? }
// ─────────────────────────────────────────────────────────────────────────────
upiExpressRouter.post('/check-status', async (req: Request, res: Response) => {
  try {
    let cleanKioskId = req.body.kioskId || (req.headers['x-kiosk-id'] as string)
    const { clientTxnId, txnDate } = req.body

    if (!cleanKioskId && clientTxnId && isDbConnected()) {
      try {
        const o: any = await Order.findOne({ $or: [{ orderId: clientTxnId }, { orderNumber: clientTxnId }] }).lean()
        if (o?.kioskId) cleanKioskId = o.kioskId
      } catch {}
    }

    const apiKey = await resolveUpiKeyForKiosk(cleanKioskId)
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'UPIEXPRESS_API_KEY not configured' })
    }

    if (!clientTxnId) {
      return res.status(400).json({ success: false, error: 'clientTxnId is required' })
    }

    const payload: Record<string, string> = {
      key:           apiKey,
      client_txn_id: clientTxnId,
    }
    if (txnDate) payload.txn_date = txnDate

    const response = await fetch(`${UPIEXPRESS_BASE_URL}/check_order_status`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })

    const data = await response.json() as any

    const isApiOk = data.status === true || data.success === true || (data.data && typeof data.data === 'object' && Object.keys(data.data).length > 0)
    if (!isApiOk) {
      return res.json({ success: false, error: data.msg || data.message || 'Transaction not found', data: data.data ?? {} })
    }

    const txn = data.data || {}
    const rawStatus = String(txn.status || data.status || '').toLowerCase()
    const isSuccess = rawStatus === 'success'

    // Update DB records if payment succeeded
    if (isSuccess && isDbConnected()) {
      await Payment.findOneAndUpdate(
        { orderId: clientTxnId },
        {
          status:    'CAPTURED',
          capturedAt: new Date(),
          notes:     { upiTxnId: txn.upi_transaction_id || txn.upi_txn_id, gateway: 'upiexpress' },
        }
      )

      await Order.findOneAndUpdate(
        { $or: [{ orderId: clientTxnId }, { orderNumber: clientTxnId }] },
        { status: 'PAID', paidAt: new Date() }
      )
    }

    if (isSuccess) {
      relayPaymentCaptured(clientTxnId, cleanKioskId, {
        gateway: 'upiexpress',
        upiTxnId: txn.upi_transaction_id || txn.upi_txn_id,
        clientTxnId,
        amount: txn.amount,
      })
      triggerSessionPrintOnPayment(clientTxnId, cleanKioskId, {
        gateway: 'upiexpress',
        upiTxnId: txn.upi_transaction_id || txn.upi_txn_id,
        clientTxnId,
        amount: txn.amount,
      })
    }

    res.json({
      success: true,
      data: {
        ...txn,
        status: isSuccess ? 'success' : (rawStatus === 'failed' ? 'failed' : 'pending'),
        upi_txn_id: txn.upi_transaction_id || txn.upi_txn_id || txn.txn_id,
      },
    })
  } catch (error: any) {
    console.error('[UPIExpress] check-status error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/upiexpress/webhook  — Receive payment callbacks from UPI Express
// ─────────────────────────────────────────────────────────────────────────────
upiExpressRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const body = req.body
    console.log('[UPIExpress Webhook] Received:', JSON.stringify(body))

    const { client_txn_id, status, upi_txn_id } = body

    if (status === 'success' && client_txn_id && isDbConnected()) {
      await Payment.findOneAndUpdate(
        { orderId: client_txn_id },
        {
          status:     'CAPTURED',
          capturedAt: new Date(),
          notes:      { upiTxnId: upi_txn_id, gateway: 'upiexpress', webhook: true },
        }
      )

      await Order.findOneAndUpdate(
        { $or: [{ orderId: client_txn_id }, { orderNumber: client_txn_id }] },
        { status: 'PAID', paidAt: new Date() }
      )
    }

    if (status === 'success' && client_txn_id) {
      let targetKioskId: string | undefined
      if (isDbConnected()) {
        try {
          const o: any = await Order.findOne({ $or: [{ orderId: client_txn_id }, { orderNumber: client_txn_id }] }).lean()
          if (o?.kioskId) targetKioskId = o.kioskId.trim().toUpperCase()
        } catch {}
      }
      relayPaymentCaptured(client_txn_id, targetKioskId, {
        gateway: 'upiexpress',
        upiTxnId: upi_txn_id,
        clientTxnId: client_txn_id,
        webhook: true,
      })
      triggerSessionPrintOnPayment(client_txn_id, targetKioskId, {
        gateway: 'upiexpress',
        upiTxnId: upi_txn_id,
        clientTxnId: client_txn_id,
        webhook: true,
      })
    }

    res.json({ success: true, received: true })
  } catch (error: any) {
    console.error('[UPIExpress] webhook error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})
