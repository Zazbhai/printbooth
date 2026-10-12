/**
 * UPI Express Payment Routes
 * POST /api/upiexpress/create-order   — Create a UPI Express payment order
 * POST /api/upiexpress/check-status   — Check order status
 * GET  /api/upiexpress/config         — Get UPI Express config (key presence only)
 * POST /api/upiexpress/webhook        — Receive UPI Express webhook callbacks
 */

import crypto from 'crypto'
import QRCode from 'qrcode'
import { Router, Request, Response } from 'express'
import { isDbConnected } from '../db.js'
import { Payment } from '../models/Payment.js'
import { Order } from '../models/Order.js'
import { Kiosk } from '../models/Kiosk.js'
import { Merchant } from '../models/Merchant.js'
import { fallbackKiosks, fallbackMerchants, fallbackOrders } from '../fallbackData.js'
import { paymentLimiter } from '../middleware/rateLimiter.js'
import { relayPaymentCaptured } from '../modules/wsRelay.js'
import { getPublicWebUrl } from '../config.js'
import { isKioskPiReachable, markKioskOffline } from '../modules/kioskLiveness.js'
import { triggerSessionPrintOnPayment } from './kioskSessions.js'

export const upiExpressRouter = Router()
upiExpressRouter.use(paymentLimiter)

const UPIEXPRESS_BASE_URL = 'https://upiexpress.com/api'

/**
 * Generate a guaranteed globally unique client transaction ID.
 * Follows exact UPI Express / BharatPe format: 'PB-' + 20 hex characters (total 23 chars).
 * Example: 'PB-c8d62aa6abcb498b9504'
 */
export function generateUniqueClientTxnId(prefix = 'PB'): string {
  return `${prefix}-${crypto.randomBytes(10).toString('hex')}`
}

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
  return (process.env.UPIEXPRESS_API_KEY || '').trim()
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
  return ''
}

export interface CreateUpiOrderParams {
  apiKey?: string
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
  merchantError?: string
  merchantRecommendation?: string
  data?: {
    orderId: string
    paymentUrl: string
    upiIntentUrl: string
    upiintent?: string
    qrDataUrl?: string
    qrCode?: string
    upiIdHash: string
    upiIntent: any
    clientTxnId: string
    amount: number
    merchantUpiId?: string
    gateway: 'upiexpress'
  }
}

/**
 * Passthrough for UPI Intent URI.
 * Never rewrite or mutate the provider's URI (matching test.py).
 */
export function enforceExactUpiAmount(upiUri: string, _exactAmount?: number | string): string {
  return upiUri
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

  const apiKey = params.apiKey || (await resolveUpiKeyForKiosk(kioskId))
  const merchantUpiId = await resolveMerchantUpiIdForKiosk(kioskId)

  if (!apiKey) {
    console.error(`[UPIExpress] Missing API Key for station ${kioskId || 'PB-001'}`)
    return {
      success: false,
      error: `UPI Express API Key is not configured for station ${kioskId || 'PB-001'}.`,
    }
  }

  const {
    clientTxnId: requestedClientTxnId,
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

  let effectiveClientTxnId = (requestedClientTxnId || '').trim()
  if (!effectiveClientTxnId || !effectiveClientTxnId.startsWith('PB-') || effectiveClientTxnId.length < 10) {
    effectiveClientTxnId = generateUniqueClientTxnId('PB')
  }

  const payload: Record<string, string> = {
    key: apiKey,
    client_txn_id: effectiveClientTxnId,
    amount: Number(amount).toFixed(2),
    customer_name: customerName || 'PrintBooth Customer',
    customer_email: customerEmail || 'customer@example.com',
    customer_mobile: customerMobile || '9876543210',
    redirect_url: redirectUrl || 'https://printbooth.co.in/payment',
    note: String(note || 'PrintBooth Test').slice(0, 25),
  }

  const envWebhook = (
    process.env.UPIEXPRESS_WEBHOOK_URL ||
    process.env.UPI_EXPRESS_WEBHOOK_URL ||
    process.env.UPIEXPRESS_WEBHOOK ||
    ''
  ).trim()

  const effectiveWebhookUrl =
    envWebhook ||
    (typeof webhookUrl === 'string' && webhookUrl.startsWith('https://') ? webhookUrl.trim() : '') ||
    'https://eca6-2401-4900-8967-26d8-80c1-870e-c1d8-175.ngrok-free.app/api/upiexpress/webhook'

  if (effectiveWebhookUrl) {
    payload.webhook_url = effectiveWebhookUrl
  }

  const effectiveMerchantId = merchantid || (process.env.UPIEXPRESS_MERCHANT_ID || '').trim()
  if (effectiveMerchantId) payload.merchantid = effectiveMerchantId

  if (udf1) payload.udf1 = String(udf1).slice(0, 25)
  if (udf2) payload.udf2 = String(udf2).slice(0, 25)
  if (udf3) payload.udf3 = String(udf3).slice(0, 25)
  if (udf4) payload.udf4 = String(udf4).slice(0, 25)
  if (udf5) payload.udf5 = String(udf5).slice(0, 25)

  try {
    const MAX_ATTEMPTS = 3
    let lastError = ''
    let data: any = null
    let isOk = false

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        let response = await fetch(`${UPIEXPRESS_BASE_URL}/create_order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          lastError = `UPI Express HTTP ${response.status}: ${response.statusText}`
          console.warn(`[UPIExpress] create_order attempt ${attempt}/${MAX_ATTEMPTS} failed with HTTP ${response.status}`)
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 600))
          }
          continue
        }

        data = (await response.json()) as any
        isOk = data?.status === true || data?.success === true

        // If UPI Express reports that client_txn_id already exists, automatically generate a fresh unique ID and retry
        if (!isOk) {
          const errMsg = String(data?.msg || data?.message || '')
          if (
            errMsg.toLowerCase().includes('already exists') ||
            errMsg.toLowerCase().includes('client transaction id')
          ) {
            console.warn(`[UPIExpress] Client Transaction ID ${effectiveClientTxnId} already exists. Regenerating fresh unique transaction ID...`)
            effectiveClientTxnId = generateUniqueClientTxnId('PB')
            payload.client_txn_id = effectiveClientTxnId
            payload.p_info = note || `PrintBooth Station ${kioskId || 'PB-001'} Order ${effectiveClientTxnId}`

            response = await fetch(`${UPIEXPRESS_BASE_URL}/create_order`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            if (response.ok) {
              data = (await response.json()) as any
              isOk = data?.status === true || data?.success === true
            }
          }
        }

        if (isOk) {
          break
        }

        lastError = data?.msg || data?.message || 'UPI Express rejected order creation'
        console.warn(`[UPIExpress] create_order attempt ${attempt}/${MAX_ATTEMPTS} non-success response: ${lastError}`)

        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 600))
        }
      } catch (attemptErr: any) {
        lastError = attemptErr?.message || 'Network connection failed'
        console.warn(`[UPIExpress] create_order attempt ${attempt}/${MAX_ATTEMPTS} network error: ${lastError}`)
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 600))
        }
      }
    }

    if (!isOk) {
      const merchantError = `UPI Express Payment Gateway Error: ${lastError || 'Order creation failed after 3 attempts'}`
      const merchantRecommendation =
        '1. Verify your UPI Express API Key and Merchant UPI ID in Merchant Settings.\n2. Ensure your UPI Express merchant plan is active and not expired.\n3. Verify your receiving UPI VPA handle is active with your bank.\n4. Once verified, click "Start Printer Again" in Kiosk Status to resume printer operations.'

      if (kioskId) {
        await markKioskOffline(kioskId, merchantError, {
          merchantError,
          merchantRecommendation,
          errorSource: 'UPIEXPRESS',
        })
      }

      return {
        success: false,
        kioskOffline: true,
        merchantError,
        merchantRecommendation,
        error: merchantError,
      }
    }

    const rawData = data?.data || {}
    const orderId = rawData.orderid || rawData.order_id || rawData.txn_id || effectiveClientTxnId
    const paymentUrl = rawData.payment_link || rawData.payment_url || ''
    const rawUpiIntent = String(rawData.upiintent || rawData.upi_intent_url || rawData.upi_intent || '').trim()

    const reqAmount = Number(amount)
    const apiAmount = Number(rawData.amount || reqAmount)
    const apiTotal = Number(rawData.total || apiAmount)

    // NEVER modify, rewrite, or alter the provider's upiintent URL (matching test.ts).
    // The exact upiintent returned by UPI Express is used directly for QR code generation.
    const upiIntentUrl = rawUpiIntent
    const upiIntentObj: Record<string, any> = typeof rawData.upi_intent === 'object' ? { ...rawData.upi_intent } : {}

    const toPaise = (value: number | string): number => {
      const amt = Number(value)
      if (!Number.isFinite(amt)) return 0
      return Math.round(amt * 100)
    }

    const requestedPaise = toPaise(reqAmount)

    console.log('\n========== AMOUNT CHECK ==========')
    console.log(`Requested amount: ₹${reqAmount.toFixed(2)} (${requestedPaise} paise)`)
    console.log(`API amount:       ₹${apiAmount.toFixed(2)}`)
    console.log(`Convenience fee:  ₹${rawData.convenience_fee || 0}`)
    console.log(`API total:        ₹${apiTotal.toFixed(2)}`)
    console.log(`UPI Intent:       ${upiIntentUrl}`)
    console.log('==================================')

    if (rawData.total !== undefined) {
      const totalPaise = toPaise(rawData.total)
      if (totalPaise !== requestedPaise) {
        console.warn(`[UPIExpress] Amount discrepancy: requested ₹${(requestedPaise / 100).toFixed(2)}, provider total is ₹${(totalPaise / 100).toFixed(2)}`)
      }
    }

    if (upiIntentUrl && upiIntentUrl.startsWith('upi://pay?')) {
      try {
        const parsedUrl = new URL(upiIntentUrl)
        const intentAmount = parsedUrl.searchParams.get('am')
        if (intentAmount) {
          const intentPaise = toPaise(intentAmount)
          if (intentPaise !== requestedPaise) {
            console.warn(`[UPIExpress] Amount discrepancy: requested ₹${(requestedPaise / 100).toFixed(2)}, intent has ₹${(intentPaise / 100).toFixed(2)}`)
          }
        }
      } catch (err: any) {
        console.warn('[UPIExpress] URL parsing warning:', err.message)
      }
    }

    // Generate high-resolution 600px PNG QR code data URL matching test.ts specification
    let qrDataUrl = ''
    if (upiIntentUrl) {
      try {
        qrDataUrl = await QRCode.toDataURL(upiIntentUrl, {
          errorCorrectionLevel: 'M',
          width: 600,
          margin: 4,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        })
      } catch (qrErr: any) {
        console.warn('[UPIExpress] QR DataURL generation error:', qrErr.message)
      }
    }

    if (isDbConnected()) {
      try {
        await Payment.create({
          paymentId: `UPIE-${Date.now().toString().slice(-8)}`,
          razorpayOrderId: `upie_${orderId}`,
          orderId: effectiveClientTxnId,
          amount: reqAmount,
          currency: 'INR',
          status: 'CREATED',
          description: `UPI Express order ${effectiveClientTxnId} for station ${kioskId || 'PB-001'}`,
          notes: { gateway: 'upiexpress', orderId: effectiveClientTxnId, kioskId },
        })
      } catch {}
    }

    return {
      success: true,
      data: {
        orderId,
        paymentUrl,
        upiIntentUrl,
        upiintent: upiIntentUrl,
        qrDataUrl,
        qrCode: qrDataUrl,
        upiIdHash: rawData.upi_id_hash || '',
        upiIntent: upiIntentObj,
        clientTxnId: effectiveClientTxnId,
        amount: reqAmount,
        gateway: 'upiexpress',
      },
    }
  } catch (err: any) {
    console.error('[UPIExpress] create_order network error:', err)
    const merchantError = `UPI Express connection error: ${err.message || 'Unknown network error'}`
    const merchantRecommendation =
      '1. Verify server internet connectivity and access to upiexpress.com.\n2. Verify UPI Express portal status.\n3. Click "Start Printer Again" in Kiosk Status once network is restored.'

    if (kioskId) {
      await markKioskOffline(kioskId, merchantError, {
        merchantError,
        merchantRecommendation,
        errorSource: 'UPIEXPRESS',
      })
    }

    return {
      success: false,
      kioskOffline: true,
      merchantError,
      merchantRecommendation,
      error: merchantError,
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
      return res.status(400).json(result)
    }

    return res.json(result)
  } catch (error: any) {
    console.error('[UPIExpress] create-order route error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

export function extractUpiPaymentDetails(payload: any) {
  const root = payload || {}
  const data = (root.data && typeof root.data === 'object') ? root.data : root
  const extra = (data.extraData && typeof data.extraData === 'object') ? data.extraData : {}

  const rawStatus = String(data.status || root.status || extra.status || '').trim().toLowerCase()
  const isSuccess = rawStatus === 'success'

  const clientTxnId = String(data.client_txn_id || root.client_txn_id || '').trim()
  const gatewayOrderId = String(data.orderid || data.order_id || root.orderid || '').trim()
  const gatewayTxnId = String(data.txn_id || root.txn_id || '').trim()
  const merchantTxnId = String(data.merchant_txnid || root.merchant_txnid || '').trim()

  const bankReferenceNo = String(
    data.upi_transaction_id ||
    extra.bankReferenceNo ||
    data.upi_txn_id ||
    root.upi_txn_id ||
    root.upi_transaction_id ||
    ''
  ).trim()

  const internalUtr = String(extra.internalUtr || '').trim()
  const payerName = String(extra.payerName || data.customer_name || root.customer_name || '').trim()
  const payerHandle = String(extra.payerHandle || '').trim()
  const payeeIdentifier = String(extra.payeeIdentifier || '').trim()
  const merchantId = extra.merchantId || null
  const txnSubType = String(extra.txnSubType || '').trim()

  const amount = Number(data.amount || data.total_amount || extra.amount || root.amount || 0)
  const convenienceFee = Number(data.convenience_fee || root.convenience_fee || 0)
  const totalAmount = Number(data.total_amount || data.amount || extra.amount || root.total_amount || amount)

  const customerMobile = String(data.customer_mobile || root.customer_mobile || '').trim()
  const customerEmail = String(data.customer_email || root.customer_email || '').trim()
  const customerName = String(data.customer_name || root.customer_name || payerName || '').trim()
  const note = String(data.note || root.note || '').trim()

  const paymentTimestamp = extra.paymentTimestamp
    ? new Date(extra.paymentTimestamp)
    : (data.created_at ? new Date(data.created_at) : new Date())

  return {
    isSuccess,
    rawStatus,
    clientTxnId,
    gateway: 'upiexpress',
    gatewayOrderId,
    gatewayTxnId,
    merchantTxnId,
    bankReferenceNo,
    upiTxnId: bankReferenceNo || gatewayTxnId,
    internalUtr,
    payerName,
    payerHandle,
    payeeIdentifier,
    merchantId,
    txnSubType,
    amount,
    convenienceFee,
    totalAmount,
    customerMobile,
    customerEmail,
    customerName,
    note,
    paymentTimestamp,
    rawResponse: data,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/upiexpress/check-status
// Body: { clientTxnId, txnDate?, kioskId? }
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

    const details = extractUpiPaymentDetails(data)
    const effectiveClientTxnId = details.clientTxnId || clientTxnId

    // Update DB records if payment succeeded
    if (details.isSuccess && effectiveClientTxnId) {
      if (isDbConnected()) {
        try {
          const paymentRecordId = details.upiTxnId ? `UPIE-${details.upiTxnId}` : `UPIE-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
          await Payment.findOneAndUpdate(
            { orderId: effectiveClientTxnId },
            {
              $set: {
                status:     'CAPTURED',
                capturedAt: details.paymentTimestamp,
                method:     'upi',
                amount:     details.amount || undefined,
                notes: {
                  gateway:         'upiexpress',
                  upiTxnId:        details.upiTxnId,
                  bankReferenceNo: details.bankReferenceNo,
                  internalUtr:     details.internalUtr,
                  payerName:       details.payerName,
                  payerHandle:     details.payerHandle,
                  payeeIdentifier: details.payeeIdentifier,
                  gatewayOrderId:  details.gatewayOrderId,
                  gatewayTxnId:    details.gatewayTxnId,
                  merchantTxnId:   details.merchantTxnId,
                  customerMobile:  details.customerMobile,
                  customerEmail:   details.customerEmail,
                  customerName:    details.customerName,
                  amount:          String(details.amount),
                },
              },
              $setOnInsert: {
                paymentId: paymentRecordId,
                orderId: effectiveClientTxnId,
                amount: details.amount || 0,
                currency: 'INR',
                createdAt: new Date(),
              },
            },
            { upsert: true, new: true }
          )

          await Order.findOneAndUpdate(
            { $or: [{ orderId: effectiveClientTxnId }, { orderNumber: effectiveClientTxnId }] },
            {
              $set: {
                status: 'PAID',
                paidAt: details.paymentTimestamp,
                paymentDetails: details,
                ...(details.customerMobile ? { customerPhone: details.customerMobile } : {}),
                ...(details.customerEmail ? { customerEmail: details.customerEmail } : {}),
                paymentConfirmation: {
                  status: 'CONFIRMED',
                  confirmedAt: details.paymentTimestamp,
                  confirmedBy: 'UPI Express (Auto-Verified)',
                },
              },
            }
          )
        } catch (dbErr) {
          console.warn('[UPIExpress] DB update warning in check-status:', dbErr)
        }
      }

      // Also update in-memory fallbackOrders
      const fb = fallbackOrders.find((o: any) => o.orderId === effectiveClientTxnId || o.orderNumber === effectiveClientTxnId)
      if (fb) {
        fb.status = 'PAID'
        fb.paidAt = details.paymentTimestamp
        fb.paymentDetails = details
        fb.paymentConfirmation = {
          status: 'CONFIRMED',
          confirmedAt: details.paymentTimestamp,
          confirmedBy: 'UPI Express (Auto-Verified)',
        }
        if (details.customerMobile) fb.customerPhone = details.customerMobile
        if (details.customerEmail) fb.customerEmail = details.customerEmail
      }

      relayPaymentCaptured(effectiveClientTxnId, cleanKioskId, details)
      triggerSessionPrintOnPayment(effectiveClientTxnId, cleanKioskId, details)
    }

    res.json({
      success: true,
      data: {
        ...details.rawResponse,
        ...details,
        status: details.isSuccess ? 'success' : (details.rawStatus === 'failed' ? 'failed' : 'pending'),
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

    const details = extractUpiPaymentDetails(body)
    const { clientTxnId, isSuccess } = details

    if (isSuccess && clientTxnId) {
      if (isDbConnected()) {
        try {
          const paymentRecordId = details.upiTxnId ? `UPIE-${details.upiTxnId}` : `UPIE-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
          await Payment.findOneAndUpdate(
            { orderId: clientTxnId },
            {
              $set: {
                status:     'CAPTURED',
                capturedAt: details.paymentTimestamp,
                method:     'upi',
                amount:     details.amount || undefined,
                notes: {
                  gateway:         'upiexpress',
                  upiTxnId:        details.upiTxnId,
                  bankReferenceNo: details.bankReferenceNo,
                  internalUtr:     details.internalUtr,
                  payerName:       details.payerName,
                  payerHandle:     details.payerHandle,
                  payeeIdentifier: details.payeeIdentifier,
                  gatewayOrderId:  details.gatewayOrderId,
                  gatewayTxnId:    details.gatewayTxnId,
                  merchantTxnId:   details.merchantTxnId,
                  customerMobile:  details.customerMobile,
                  customerEmail:   details.customerEmail,
                  customerName:    details.customerName,
                  amount:          String(details.amount),
                  webhook:         'true',
                },
              },
              $setOnInsert: {
                paymentId: paymentRecordId,
                orderId: clientTxnId,
                amount: details.amount || 0,
                currency: 'INR',
                createdAt: new Date(),
              },
            },
            { upsert: true, new: true }
          )
        } catch (payDbErr) {
          console.warn('[UPIExpress Webhook] Payment record update warning:', payDbErr)
        }

        const existingOrder = await Order.findOne({ $or: [{ orderId: clientTxnId }, { orderNumber: clientTxnId }] })
        if (existingOrder) {
          await Order.findOneAndUpdate(
            { _id: existingOrder._id },
            {
              $set: {
                status: 'PAID',
                paidAt: details.paymentTimestamp,
                paymentDetails: details,
                ...(details.customerMobile ? { customerPhone: details.customerMobile } : {}),
                ...(details.customerEmail ? { customerEmail: details.customerEmail } : {}),
                paymentConfirmation: {
                  status: 'CONFIRMED',
                  confirmedAt: details.paymentTimestamp,
                  confirmedBy: 'UPI Express Webhook (Auto-Verified)',
                },
              },
            }
          )
        } else {
          await Order.create({
            orderId: clientTxnId,
            orderNumber: clientTxnId,
            kioskId: 'PB-001',
            fileName: 'UPI_Print_Document.pdf',
            fileSize: 1024,
            status: 'PAID',
            pageCount: Math.max(1, Math.round(details.amount / 2)),
            copies: 1,
            colourMode: 'BW',
            duplex: 'SINGLE',
            paperSize: 'A4',
            amount: details.amount,
            merchantCut: details.amount,
            currency: 'INR',
            customerPhone: details.customerMobile,
            customerEmail: details.customerEmail,
            customerIp: '192.168.1.4',
            paymentConfirmation: {
              status: 'CONFIRMED',
              confirmedAt: details.paymentTimestamp,
              confirmedBy: 'UPI Express Webhook (Auto-Verified)',
            },
            paymentDetails: details,
            pickupCode: String(Math.floor(1000 + Math.random() * 9000)),
            releasePin: String(Math.floor(1000 + Math.random() * 9000)),
            paidAt: details.paymentTimestamp,
            createdAt: details.paymentTimestamp,
          })
        }
      }

      // Also update in-memory fallbackOrders
      const fb = fallbackOrders.find((o: any) => o.orderId === clientTxnId || o.orderNumber === clientTxnId)
      if (fb) {
        fb.status = 'PAID'
        fb.paidAt = details.paymentTimestamp
        fb.paymentDetails = details
        fb.paymentConfirmation = {
          status: 'CONFIRMED',
          confirmedAt: details.paymentTimestamp,
          confirmedBy: 'UPI Express Webhook (Auto-Verified)',
        }
        if (details.customerMobile) fb.customerPhone = details.customerMobile
        if (details.customerEmail) fb.customerEmail = details.customerEmail
      }

      let targetKioskId: string | undefined
      if (isDbConnected()) {
        try {
          const o: any = await Order.findOne({ $or: [{ orderId: clientTxnId }, { orderNumber: clientTxnId }] }).lean()
          if (o?.kioskId) targetKioskId = o.kioskId.trim().toUpperCase()
        } catch {}
      }
      if (!targetKioskId && fb?.kioskId) targetKioskId = fb.kioskId

      relayPaymentCaptured(clientTxnId, targetKioskId, details)
      triggerSessionPrintOnPayment(clientTxnId, targetKioskId, details)
    }

    res.json({ success: true, received: true, clientTxnId, isSuccess })
  } catch (error: any) {
    console.error('[UPIExpress Webhook] error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})
