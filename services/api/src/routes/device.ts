/**
 * PrintBooth Device REST API Routes
 * =================================
 * Provides:
 *   - POST /api/device/provision : Cryptographic onboarding & pairing
 *   - GET  /api/device/jobs/:jobId/authorize : Device authorization pre-flight check
 *   - POST /demo/jobs : Part 24 End-to-End demonstration dispatcher
 *   - GET  /api/device/kiosks : Fleet monitoring & telemetry
 */

import { Router, Request, Response } from 'express'
import { Device } from '../models/Device.js'
import { Order } from '../models/Order.js'
import { isDbConnected } from '../db.js'
import {
  sendToKiosk,
  dispatchDevicePrintJob,
  isKioskOnline,
  getActiveKiosks,
} from '../modules/deviceGateway.js'

export const deviceRouter = Router()

// ── 1. POST /api/device/provision ──
// Pairs and authorizes a newly deployed Raspberry Pi kiosk
deviceRouter.post('/provision', async (req: Request, res: Response) => {
  try {
    const { kioskId, name, publicKey } = req.body
    if (!kioskId || !publicKey) {
      return res.status(400).json({ success: false, error: 'kioskId and publicKey are required' })
    }

    const cleanId = String(kioskId).trim().toUpperCase()

    if (isDbConnected()) {
      let device = await Device.findOne({ kioskId: cleanId })
      if (device) {
        device.publicKey = publicKey
        if (name) device.name = name
        await device.save()
      } else {
        device = await Device.create({
          kioskId: cleanId,
          name: name || `PrintBooth Station ${cleanId}`,
          publicKey,
          status: 'OFFLINE',
          registeredAt: new Date(),
        })
      }

      return res.status(200).json({
        success: true,
        message: `Kiosk ${cleanId} provisioned with cryptographic identity successfully`,
        data: {
          kioskId: device.kioskId,
          name: device.name,
          registeredAt: device.registeredAt,
        },
      })
    }

    return res.status(200).json({
      success: true,
      message: `Kiosk ${cleanId} provisioned (in-memory mode)`,
      data: {
        kioskId: cleanId,
        name: name || `PrintBooth Station ${cleanId}`,
        registeredAt: new Date(),
      },
    })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message })
  }
})

// ── 2. GET /api/device/jobs/:jobId/authorize ──
// Security Gate: Called by the Pi before downloading/printing a document
deviceRouter.get('/jobs/:jobId/authorize', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params
    const kioskId = (req.headers['x-kiosk-id'] as string)?.trim().toUpperCase()

    // Demo/Test jobs are pre-authorized
    if (jobId.startsWith('JOB-TEST') || jobId.startsWith('TEST-')) {
      return res.json({
        success: true,
        authorized: true,
        jobId,
        kioskId,
        message: 'Pre-authorized test/demo job',
      })
    }

    // Verify against DB Order
    const order = await Order.findOne({
      $or: [{ orderId: jobId }, { orderNumber: jobId }],
    })

    if (!order) {
      return res.status(404).json({ success: false, authorized: false, error: 'Order not found' })
    }

    // Kiosk station match
    if (kioskId && order.kioskId && order.kioskId.toUpperCase() !== kioskId) {
      return res.status(403).json({
        success: false,
        authorized: false,
        error: `Order belongs to ${order.kioskId}, not ${kioskId}`,
      })
    }

    // Check payment state
    const isPaid = order.status === 'PAID' || order.paymentStatus === 'PAID'
    if (!isPaid) {
      return res.status(402).json({
        success: false,
        authorized: false,
        error: 'Order payment is not verified',
      })
    }

    return res.json({
      success: true,
      authorized: true,
      jobId,
      kioskId: order.kioskId,
      copies: order.copies,
      colour: order.colourMode === 'COLOUR',
      duplex: order.duplex === 'DOUBLE',
    })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message })
  }
})

// ── 3. POST /demo/jobs ──
// PART 24: End-to-end demonstration endpoint
deviceRouter.post(['/demo/jobs', '/jobs'], async (req: Request, res: Response) => {
  try {
    const targetKiosk = (req.body.kioskId || 'PB-001').trim().toUpperCase()
    const jobId = req.body.jobId || `JOB-TEST-${Date.now().toString().slice(-4)}`
    const copies = Math.max(1, Math.min(Number(req.body.copies) || 1, 10))
    const colour = Boolean(req.body.colour)
    const duplex = typeof req.body.duplex === 'boolean'
      ? req.body.duplex
      : ['DOUBLE', 'DUPLEX', 'TWO-SIDED', '2-SIDED', 'TRUE', '1'].includes(String(req.body.duplex || '').toUpperCase().trim())

    const online = isKioskOnline(targetKiosk)

    // Dispatch PRINT_JOB command over WSS to Raspberry Pi
    const dispatched = await dispatchDevicePrintJob({
      jobId,
      kioskId: targetKiosk,
      fileId: 'FILE-DEMO-001',
      copies,
      colour,
      duplex,
      paperSize: 'A4',
      downloadUrl: `${req.protocol}://${req.get('host')}/test_sample.pdf`,
    })

    return res.json({
      success: dispatched,
      jobId,
      kioskId: targetKiosk,
      deviceOnline: online,
      dispatchedOverWss: dispatched,
      message: dispatched
        ? `[DEMO] PRINT_JOB command dispatched successfully to ${targetKiosk} over outbound WSS.`
        : `[DEMO] Kiosk ${targetKiosk} is not connected over WSS. Start agent to receive command.`,
    })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message })
  }
})

// ── 4. GET /api/device/kiosks ──
// Fleet status and telemetry
deviceRouter.get('/kiosks', async (_req: Request, res: Response) => {
  try {
    const active = getActiveKiosks()
    let devices: any[] = []
    if (isDbConnected()) {
      devices = await Device.find().sort({ kioskId: 1 })
    } else {
      devices = active.map((id) => ({
        kioskId: id,
        name: `PrintBooth Station ${id}`,
        status: 'ONLINE',
        lastSeenAt: new Date(),
      }))
    }

    const results = devices.map((d) => ({
      kioskId: d.kioskId,
      name: d.name,
      status: active.includes(d.kioskId) ? 'ONLINE' : 'OFFLINE',
      isConnectedWss: active.includes(d.kioskId),
      agentVersion: d.agentVersion,
      lastSeenAt: d.lastSeenAt,
      printer: d.printer,
      vitals: d.vitals,
    }))

    return res.json({
      success: true,
      activeCount: active.length,
      connectedKiosks: active,
      devices: results,
    })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message })
  }
})

// ── 5. POST /api/device/kiosks/:kioskId/ping ──
// Manual ping trigger
deviceRouter.post('/kiosks/:kioskId/ping', async (req: Request, res: Response) => {
  const { kioskId } = req.params
  const success = await sendToKiosk(kioskId, {
    type: 'PING',
    kioskId: kioskId.toUpperCase(),
    timestamp: Date.now(),
  })
  return res.json({ success, kioskId })
})
