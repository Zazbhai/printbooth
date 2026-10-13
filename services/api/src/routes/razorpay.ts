/**
 * Razorpay Payment Routes
 * POST /api/razorpay/create-order      — Create Razorpay order
 * POST /api/razorpay/verify            — Verify payment signature & capture
 * POST /api/razorpay/refund            — Issue full/partial refund
 * POST /api/razorpay/payout-merchant   — Transfer earnings to a merchant
 * GET  /api/razorpay/payments          — List payment records (admin)
 * GET  /api/razorpay/payments/:id      — Get single payment details
 * GET  /api/razorpay/config            — Get current Razorpay config (keys only, no secret)
 * PUT  /api/razorpay/config            — Update Razorpay config (runtime update)
 * POST /api/razorpay/webhook           — Razorpay webhook handler
 */

import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { isDbConnected } from '../db.js'
import { Payment } from '../models/Payment.js'
import { Order } from '../models/Order.js'
import { Merchant } from '../models/Merchant.js'
import { Kiosk } from '../models/Kiosk.js'
import { fallbackKiosks, fallbackMerchants } from '../fallbackData.js'
import { paymentLimiter } from '../middleware/rateLimiter.js'
import { relayPaymentCaptured } from '../modules/wsRelay.js'
import { isKioskPiReachable, markKioskOffline } from '../modules/kioskLiveness.js'
import { triggerSessionPrintOnPayment } from './kioskSessions.js'

export const razorpayRouter = Router()
razorpayRouter.use(paymentLimiter)

async function resolveRazorpayKeysForKiosk(kioskId?: string): Promise<{ keyId: string; keySecret: string }> {
  if (kioskId) {
    const cleanId = kioskId.trim().toUpperCase()
    if (isDbConnected()) {
      try {
        const kiosk: any = await Kiosk.findOne({ kioskId: cleanId }).lean()
        if (kiosk?.razorpayKeyId && kiosk?.razorpayKeySecret) {
          return { keyId: kiosk.razorpayKeyId, keySecret: kiosk.razorpayKeySecret }
        }
        let merchant: any = await Merchant.findOne({ kioskId: cleanId }).lean()
        if (!merchant && kiosk?.merchantId) {
          merchant = await Merchant.findOne({ merchantId: kiosk.merchantId }).lean()
        }
        if (merchant?.razorpayKeyId && merchant?.razorpayKeySecret) {
          return { keyId: merchant.razorpayKeyId, keySecret: merchant.razorpayKeySecret }
        }
      } catch {}
    }
    const fbK = fallbackKiosks.find(k => (k.kioskId || k.id) === cleanId) as any
    if (fbK?.razorpayKeyId && fbK?.razorpayKeySecret) {
      return { keyId: fbK.razorpayKeyId, keySecret: fbK.razorpayKeySecret }
    }
    const fbM = fallbackMerchants.find(m => m.kioskId === cleanId) as any
    if (fbM?.razorpayKeyId && fbM?.razorpayKeySecret) {
      return { keyId: fbM.razorpayKeyId, keySecret: fbM.razorpayKeySecret }
    }
  }
  return {
    keyId: '',
    keySecret: '',
  }
}

// Use a top-level async wrapper to allow dynamic import
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withRazorpay(cb: (rzp: any, creds: { keyId: string; keySecret: string }) => Promise<any>, kioskId?: string): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const RazorpayModule: any = await import('razorpay')
  const Razorpay = RazorpayModule.default ?? RazorpayModule
  const creds = await resolveRazorpayKeysForKiosk(kioskId)
  if (!creds.keyId || !creds.keySecret) {
    throw new Error('Razorpay credentials not configured for this station. Please configure Key ID and Key Secret in Merchant Settings.')
  }
  const rzp = new Razorpay({ key_id: creds.keyId, key_secret: creds.keySecret })
  return cb(rzp, creds)
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/razorpay/config  — Return public key & feature flags (no secret)
// ─────────────────────────────────────────────────────────────────────────────
razorpayRouter.get('/config', async (req: Request, res: Response) => {
  const kioskId = (req.query.kioskId as string) || (req.headers['x-kiosk-id'] as string)
  const { keyId, keySecret } = await resolveRazorpayKeysForKiosk(kioskId)
  res.json({
    success: true,
    data: {
      keyId,
      keySecretConfigured: keySecret.length > 0,
      keyIdConfigured: keyId.length > 0,
      webhookSecretConfigured: (process.env.RAZORPAY_WEBHOOK_SECRET || '').length > 0,
      accountId: process.env.RAZORPAY_ACCOUNT_ID || '',
      mode: keyId.startsWith('rzp_live') ? 'live' : keyId.startsWith('rzp_test') ? 'test' : 'not_configured',
      merchantPayoutsEnabled: process.env.RAZORPAY_PAYOUTS_ENABLED === 'true',
      autoRefundEnabled: process.env.RAZORPAY_AUTO_REFUND === 'true',
      kioskId: kioskId || null,
    },
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/razorpay/config  — Runtime update of Razorpay credentials
// (For production use a secrets manager; this persists for the process lifetime)
// ─────────────────────────────────────────────────────────────────────────────
razorpayRouter.put('/config', (req: Request, res: Response) => {
  const { keyId, keySecret, webhookSecret, accountId, merchantPayoutsEnabled, autoRefundEnabled } = req.body

  if (keyId !== undefined) process.env.RAZORPAY_KEY_ID = keyId
  if (keySecret !== undefined && keySecret !== '') process.env.RAZORPAY_KEY_SECRET = keySecret
  if (webhookSecret !== undefined && webhookSecret !== '') process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret
  if (accountId !== undefined) process.env.RAZORPAY_ACCOUNT_ID = accountId
  if (merchantPayoutsEnabled !== undefined) process.env.RAZORPAY_PAYOUTS_ENABLED = String(merchantPayoutsEnabled)
  if (autoRefundEnabled !== undefined) process.env.RAZORPAY_AUTO_REFUND = String(autoRefundEnabled)

  res.json({
    success: true,
    message: 'Razorpay configuration updated for this server session. To persist across restarts, update your .env file.',
    data: {
      keyId: process.env.RAZORPAY_KEY_ID || '',
      keyIdConfigured: (process.env.RAZORPAY_KEY_ID || '').length > 0,
      keySecretConfigured: (process.env.RAZORPAY_KEY_SECRET || '').length > 0,
      webhookSecretConfigured: (process.env.RAZORPAY_WEBHOOK_SECRET || '').length > 0,
      accountId: process.env.RAZORPAY_ACCOUNT_ID || '',
      mode: (process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_live') ? 'live' : 'test',
      merchantPayoutsEnabled: process.env.RAZORPAY_PAYOUTS_ENABLED === 'true',
      autoRefundEnabled: process.env.RAZORPAY_AUTO_REFUND === 'true',
    },
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/razorpay/create-order
// Body: { orderId, amount (INR), currency?, receipt?, notes? }
// ─────────────────────────────────────────────────────────────────────────────
razorpayRouter.post('/create-order', async (req: Request, res: Response) => {
  try {
    const {
      orderId,
      amount, // INR, we convert to paise
      currency = 'INR',
      receipt,
      notes,
    } = req.body

    if (!orderId || !amount) {
      return res.status(400).json({ success: false, error: 'orderId and amount are required' })
    }

    const amountPaise = Math.round(Number(amount) * 100)
    if (amountPaise < 100) {
      return res.status(400).json({ success: false, error: 'Minimum amount is ₹1' })
    }

    const kioskId = req.body.kioskId || notes?.kioskId || (req.headers['x-kiosk-id'] as string)
    if (kioskId) {
      const reachability = await isKioskPiReachable(kioskId)
      if (!reachability.isReachable) {
        await markKioskOffline(kioskId, reachability.reason)
        return res.status(400).json({
          success: false,
          kioskOffline: true,
          error: `Station ${kioskId} is currently offline or powered off. Hardware cannot accept print orders. Kindly ask the store merchant to check machine power, or choose another station.`,
        })
      }
    }

    let activeKeyId = ''
    let rzpOrder: any = null
    let lastError = ''
    const MAX_ATTEMPTS = 3

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        rzpOrder = await withRazorpay(
          async (rzp, creds) => {
            activeKeyId = creds.keyId
            return rzp.orders.create({
              amount: amountPaise,
              currency,
              receipt: receipt || `rcpt_${orderId}`,
              notes: notes || { orderId },
            })
          },
          kioskId
        )
        if (rzpOrder && rzpOrder.id) {
          break
        }
      } catch (err: any) {
        lastError = err?.message || 'Razorpay order creation failed'
        console.warn(`[Razorpay] create-order attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError}`)
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 600))
        }
      }
    }

    if (!rzpOrder || !rzpOrder.id) {
      const merchantError = `Razorpay Payment Gateway Error: ${lastError || 'Order creation rejected after 3 attempts'}`
      const merchantRecommendation =
        '1. Verify Razorpay Key ID and Key Secret in Merchant Settings.\n2. Ensure your Razorpay account is in Live Mode and KYC is active.\n3. Verify API Key permissions include Order Creation.\n4. Once verified, click "Start Printer Again" in Kiosk Status to resume printer operations.'

      return res.status(502).json({
        success: false,
        kioskOffline: false,
        merchantError,
        merchantRecommendation,
        error: merchantError,
      })
    }

    // Persist to DB if connected
    const paymentId = `PAY-${Date.now().toString().slice(-8)}`
    if (isDbConnected()) {
      await Payment.create({
        paymentId,
        razorpayOrderId: rzpOrder.id,
        orderId,
        amount: Number(amount),
        currency,
        status: 'CREATED',
        description: `PrintBooth order ${orderId}`,
        notes: notes || { orderId },
      })
    }

    res.json({
      success: true,
      data: {
        razorpayOrderId: rzpOrder.id,
        amount: rzpOrder.amount,
        amountInr: Number(amount),
        currency: rzpOrder.currency,
        keyId: activeKeyId,
        paymentId,
      },
    })
  } catch (error: any) {
    console.error('[Razorpay] create-order error:', error)
    res.status(400).json({ success: false, error: error.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/razorpay/verify
// Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId, kioskId? }
// ─────────────────────────────────────────────────────────────────────────────
razorpayRouter.post('/verify', async (req: Request, res: Response) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId, kioskId } = req.body

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ success: false, error: 'Missing required Razorpay fields' })
    }

    let cleanKioskId = (kioskId || (req.headers['x-kiosk-id'] as string) || '').trim().toUpperCase()
    if (!cleanKioskId && orderId && isDbConnected()) {
      try {
        const o: any = await Order.findOne({ $or: [{ orderId }, { orderNumber: orderId }] }).lean()
        if (o?.kioskId) cleanKioskId = o.kioskId.trim().toUpperCase()
      } catch {}
    }

    const { keySecret } = await resolveRazorpayKeysForKiosk(cleanKioskId)
    if (!keySecret) {
      return res.status(500).json({ success: false, error: 'Razorpay secret not configured' })
    }

    // Verify HMAC SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex')

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({ success: false, error: 'Payment signature verification failed' })
    }

    // Fetch payment details from Razorpay using kiosk-specific merchant credentials
    const rzpPayment = await withRazorpay((rzp) => rzp.payments.fetch(razorpayPaymentId), cleanKioskId)

    // Update Payment record
    if (isDbConnected()) {
      await Payment.findOneAndUpdate(
        { razorpayOrderId },
        {
          razorpayPaymentId,
          razorpaySignature,
          status: 'CAPTURED',
          method: rzpPayment.method,
          capturedAt: new Date(),
        },
        { new: true }
      )
    }

    // Check reachability of the destination kiosk / Raspberry Pi
    const reachability = await isKioskPiReachable(cleanKioskId)
    const isHardwareReachable = reachability.isReachable

    if (!isHardwareReachable) {
      console.warn(`[Razorpay] ⚠️ Payment captured for Order ${orderId}, but station ${cleanKioskId} is OFFLINE!`)
      await markKioskOffline(cleanKioskId, reachability.reason)

      if (isDbConnected() && orderId) {
        await Order.findOneAndUpdate(
          { $or: [{ orderId }, { orderNumber: orderId }] },
          {
            status: 'PAYMENT_HELD_OFFLINE',
            paidAt: new Date(),
            heldReason: reachability.reason,
          }
        )
      }

      // Instant WSS relay broadcast with offline warning to customer and merchant
      relayPaymentCaptured(orderId, cleanKioskId, {
        gateway: 'razorpay',
        razorpayPaymentId,
        razorpayOrderId,
        method: rzpPayment?.method || 'upi',
        kioskOffline: true,
        status: 'PAYMENT_HELD_OFFLINE',
        message: `Payment received, but Station ${cleanKioskId} is currently powered off or offline. The shop merchant has been notified to power on the machine.`,
      })

      return res.json({
        success: true,
        paymentHeld: true,
        kioskOffline: true,
        message: `Payment verified and held safely. Station ${cleanKioskId} is currently powered off or offline. The store merchant has been alerted.`,
        data: {
          razorpayPaymentId,
          razorpayOrderId,
          method: rzpPayment.method,
          status: 'PAYMENT_HELD_OFFLINE',
          kioskOffline: true,
        },
      })
    }

    // Hardware is online & reachable: Proceed with normal PAID status and instant spool dispatch
    if (isDbConnected() && orderId) {
      await Order.findOneAndUpdate(
        { $or: [{ orderId }, { orderNumber: orderId }] },
        { status: 'PAID', paidAt: new Date() }
      )
    }

    // Instant WSS relay broadcast to customer session, kiosk station, and admin console
    relayPaymentCaptured(orderId, cleanKioskId, {
      gateway: 'razorpay',
      razorpayPaymentId,
      razorpayOrderId,
      method: rzpPayment?.method || 'upi',
      status: 'PAID',
    })

    triggerSessionPrintOnPayment(orderId, cleanKioskId, {
      gateway: 'razorpay',
      razorpayPaymentId,
      razorpayOrderId,
      amount: rzpPayment?.amount ? rzpPayment.amount / 100 : undefined,
    })

    res.json({
      success: true,
      message: 'Payment verified and captured',
      data: {
        razorpayPaymentId,
        razorpayOrderId,
        method: rzpPayment.method,
        status: 'CAPTURED',
      },
    })
  } catch (error: any) {
    console.error('[Razorpay] verify error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/razorpay/refund
// Body: { razorpayPaymentId, amount? (INR, omit for full), reason?, notes? }
// ─────────────────────────────────────────────────────────────────────────────
razorpayRouter.post('/refund', async (req: Request, res: Response) => {
  try {
    const { razorpayPaymentId, amount, reason = 'customer_request', notes } = req.body

    if (!razorpayPaymentId) {
      return res.status(400).json({ success: false, error: 'razorpayPaymentId is required' })
    }

    const refundPayload: any = {
      speed: 'normal',
      notes: notes || { reason },
    }
    if (amount) {
      refundPayload.amount = Math.round(Number(amount) * 100) // to paise
    }

    const rzpRefund = await withRazorpay((rzp) => rzp.payments.refund(razorpayPaymentId, refundPayload))

    // Update Payment record
    if (isDbConnected()) {
      const refundAmt = rzpRefund.amount / 100
      await Payment.findOneAndUpdate(
        { razorpayPaymentId },
        {
          refundId: rzpRefund.id,
          refundAmount: refundAmt,
          refundReason: reason,
          refundedAt: new Date(),
          status: amount ? 'PARTIALLY_REFUNDED' : 'REFUNDED',
        }
      )
    }

    res.json({
      success: true,
      message: 'Refund initiated successfully',
      data: {
        refundId: rzpRefund.id,
        razorpayPaymentId,
        amount: rzpRefund.amount / 100,
        currency: rzpRefund.currency,
        status: rzpRefund.status,
        speed: rzpRefund.speed_requested,
      },
    })
  } catch (error: any) {
    console.error('[Razorpay] refund error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/razorpay/payout-merchant
// Body: { merchantId, amount (INR), accountNumber?, ifsc?, name? }
// Uses Razorpay Transfers (Route) or Payouts API depending on setup
// ─────────────────────────────────────────────────────────────────────────────
razorpayRouter.post('/payout-merchant', async (req: Request, res: Response) => {
  try {
    const { merchantId, amount, razorpayPaymentId, note } = req.body

    if (!merchantId || !amount) {
      return res.status(400).json({ success: false, error: 'merchantId and amount are required' })
    }

    let merchant: any = null
    if (isDbConnected()) {
      merchant = await Merchant.findOne({ merchantId })
      if (!merchant) {
        return res.status(404).json({ success: false, error: 'Merchant not found' })
      }
    }

    // Use Razorpay Transfers (Route) if a source payment is provided
    // Otherwise fall back to Payouts API (requires activated RazorpayX account)
    const payoutEnabled = process.env.RAZORPAY_PAYOUTS_ENABLED === 'true'

    if (razorpayPaymentId && payoutEnabled) {
      // Transfer via Route
      const transfer = await withRazorpay((rzp) =>
        rzp.payments.transfer(razorpayPaymentId, {
          transfers: [
            {
              account: process.env.RAZORPAY_ACCOUNT_ID || merchantId,
              amount: Math.round(Number(amount) * 100),
              currency: 'INR',
              notes: { merchantId, note: note || 'PrintBooth commission payout' },
              on_hold: false,
            },
          ],
        })
      )

      if (isDbConnected() && merchant) {
        merchant.totalEarnings = (merchant.totalEarnings || 0) + Number(amount)
        await merchant.save()

        // Mark related payment record
        if (razorpayPaymentId) {
          await Payment.findOneAndUpdate(
            { razorpayPaymentId },
            {
              payoutId: transfer.items?.[0]?.id,
              payoutAmount: Number(amount),
              payoutStatus: 'COMPLETED',
              payoutAt: new Date(),
            }
          )
        }
      }

      return res.json({
        success: true,
        message: 'Merchant transfer initiated via Razorpay Route',
        data: {
          transferId: transfer.items?.[0]?.id,
          merchantId,
          amount: Number(amount),
          status: 'PROCESSING',
        },
      })
    }

    // Fallback: simulate payout (RazorpayX / manual bank transfer scenario)
    const simulatedPayoutId = `PO-${Date.now().toString().slice(-8)}`

    if (isDbConnected() && merchant) {
      merchant.totalEarnings = (merchant.totalEarnings || 0) + Number(amount)
      await merchant.save()
    }

    res.json({
      success: true,
      message: payoutEnabled
        ? 'Payout initiated (no source payment provided, using manual route)'
        : 'Payout recorded. Enable RAZORPAY_PAYOUTS_ENABLED in config to use live Razorpay transfers.',
      data: {
        payoutId: simulatedPayoutId,
        merchantId,
        amount: Number(amount),
        merchantName: merchant?.name || merchantId,
        status: 'PENDING',
        note: note || 'Commission payout',
      },
    })
  } catch (error: any) {
    console.error('[Razorpay] payout-merchant error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/razorpay/payments  — List all payment records
// ─────────────────────────────────────────────────────────────────────────────
razorpayRouter.get('/payments', async (req: Request, res: Response) => {
  try {
    if (!isDbConnected()) {
      return res.json({ success: true, databaseConnected: false, data: [] })
    }
    const limit = parseInt(req.query.limit as string) || 50
    const status = req.query.status as string
    const query: any = {}
    if (status) query.status = status
    const payments = await Payment.find(query).sort({ createdAt: -1 }).limit(limit)
    res.json({ success: true, databaseConnected: true, data: payments })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/razorpay/payments/:id
// ─────────────────────────────────────────────────────────────────────────────
razorpayRouter.get('/payments/:id', async (req: Request, res: Response) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, error: 'Database not connected' })
    }
    const payment = await Payment.findOne({
      $or: [
        { paymentId: req.params.id },
        { razorpayOrderId: req.params.id },
        { razorpayPaymentId: req.params.id },
        { orderId: req.params.id },
      ],
    })
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' })
    }
    res.json({ success: true, data: payment })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/razorpay/webhook  — Handle Razorpay webhook events
// ─────────────────────────────────────────────────────────────────────────────
razorpayRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
    if (webhookSecret) {
      const signature = req.headers['x-razorpay-signature'] as string
      const body = JSON.stringify(req.body)
      const expectedSig = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex')
      if (signature !== expectedSig) {
        return res.status(400).json({ success: false, error: 'Invalid webhook signature' })
      }
    }

    const event = req.body
    const entity = event?.payload?.payment?.entity

    console.log(`[Razorpay Webhook] Event: ${event.event}`)

    switch (event.event) {
      case 'payment.captured':
        if (entity && isDbConnected()) {
          await Payment.findOneAndUpdate(
            { razorpayOrderId: entity.order_id },
            {
              razorpayPaymentId: entity.id,
              status: 'CAPTURED',
              method: entity.method,
              capturedAt: new Date(),
            }
          )
          // Update order status
          await Order.findOneAndUpdate(
            { orderId: entity.notes?.orderId },
            { status: 'PAID', paidAt: new Date() }
          )
        }
        if (entity) {
          const targetKioskId = entity.notes?.kioskId ? String(entity.notes.kioskId).trim().toUpperCase() : undefined
          relayPaymentCaptured(entity.notes?.orderId || entity.order_id, targetKioskId, {
            gateway: 'razorpay',
            event: 'payment.captured',
            paymentId: entity.id,
            amount: entity.amount / 100,
          })
          const ordId = entity.notes?.orderId || entity.order_id
          triggerSessionPrintOnPayment(ordId, targetKioskId, {
            gateway: 'razorpay',
            paymentId: entity.id,
            amount: entity.amount / 100,
          })
        }
        break

      case 'payment.failed':
        if (entity && isDbConnected()) {
          await Payment.findOneAndUpdate(
            { razorpayOrderId: entity.order_id },
            { status: 'FAILED', razorpayPaymentId: entity.id }
          )
        }
        break

      case 'refund.created':
        if (event?.payload?.refund?.entity && isDbConnected()) {
          const refund = event.payload.refund.entity
          await Payment.findOneAndUpdate(
            { razorpayPaymentId: refund.payment_id },
            {
              refundId: refund.id,
              refundAmount: refund.amount / 100,
              refundedAt: new Date(),
              status: 'REFUNDED',
            }
          )
        }
        break

      default:
        console.log(`[Razorpay Webhook] Unhandled event: ${event.event}`)
    }

    res.json({ success: true, received: true })
  } catch (error: any) {
    console.error('[Razorpay] webhook error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})
