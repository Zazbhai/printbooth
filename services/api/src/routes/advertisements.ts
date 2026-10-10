import { Router, Request, Response } from 'express'
import { Advertisement, IAdvertisement } from '../models/Advertisement.js'
import { fallbackAdvertisements } from '../fallbackData.js'
import { isDbConnected } from '../db.js'

export const advertisementsRouter = Router()

/**
 * Public Kiosk Endpoint: Get active background advertisements for a specific kiosk
 * GET /api/advertisements/kiosk/:kioskId
 */
advertisementsRouter.get('/kiosk/:kioskId', async (req: Request, res: Response) => {
  try {
    const rawKioskId = req.params.kioskId.trim().toUpperCase()

    if (!isDbConnected()) {
      const activeFallback = fallbackAdvertisements.filter(
        (ad) =>
          ad.status === 'ACTIVE' &&
          (ad.targetKiosks.includes('ALL') || ad.targetKiosks.includes(rawKioskId))
      )
      return res.json({
        success: true,
        kioskId: rawKioskId,
        data: activeFallback.length > 0 ? activeFallback : fallbackAdvertisements,
      })
    }

    const now = new Date()
    const ads = await Advertisement.find({
      status: 'ACTIVE',
      $and: [
        {
          $or: [
            { targetKiosks: 'ALL' },
            { targetKiosks: rawKioskId },
          ],
        },
        {
          $or: [
            { startDate: { $exists: false } },
            { startDate: { $lte: now } },
          ],
        },
        {
          $or: [
            { endDate: { $exists: false } },
            { endDate: null },
            { endDate: { $gte: now } },
          ],
        },
      ],
    })
      .sort({ priority: 1, createdAt: -1 })
      .lean()

    if (!ads || ads.length === 0) {
      // Graceful fallback to default campus sponsor presentation
      return res.json({
        success: true,
        kioskId: rawKioskId,
        data: fallbackAdvertisements,
      })
    }

    res.json({
      success: true,
      kioskId: rawKioskId,
      data: ads,
    })
  } catch (err: any) {
    console.error('[Ads API] Error fetching kiosk ads:', err)
    res.status(500).json({ success: false, error: err.message, data: fallbackAdvertisements })
  }
})

/**
 * Public Kiosk Endpoint: Track impression / view on kiosk screen
 * POST /api/advertisements/kiosk/:kioskId/impression/:campaignId
 */
advertisementsRouter.post('/kiosk/:kioskId/impression/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params
    if (isDbConnected()) {
      await Advertisement.updateOne(
        { $or: [{ campaignId }, { _id: campaignId }] },
        { $inc: { impressionsCount: 1 } }
      )
    } else {
      const target = fallbackAdvertisements.find((a) => a.campaignId === campaignId || a._id === campaignId)
      if (target) target.impressionsCount = (target.impressionsCount || 0) + 1
    }
    res.json({ success: true })
  } catch {
    res.json({ success: false })
  }
})

/**
 * Public Kiosk Endpoint: Track click / QR scan modal open on kiosk screen
 * POST /api/advertisements/kiosk/:kioskId/click/:campaignId
 */
advertisementsRouter.post('/kiosk/:kioskId/click/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params
    if (isDbConnected()) {
      await Advertisement.updateOne(
        { $or: [{ campaignId }, { _id: campaignId }] },
        { $inc: { clicksCount: 1 } }
      )
    } else {
      const target = fallbackAdvertisements.find((a) => a.campaignId === campaignId || a._id === campaignId)
      if (target) target.clicksCount = (target.clicksCount || 0) + 1
    }
    res.json({ success: true })
  } catch {
    res.json({ success: false })
  }
})

/**
 * Admin Endpoint: List all advertising campaigns with optional filters
 * GET /api/advertisements
 */
advertisementsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, search, kioskId } = req.query

    if (!isDbConnected()) {
      let filtered = [...fallbackAdvertisements]
      if (status && status !== 'ALL') {
        filtered = filtered.filter((ad) => ad.status === status)
      }
      if (kioskId && kioskId !== 'ALL') {
        filtered = filtered.filter(
          (ad) => ad.targetKiosks.includes('ALL') || ad.targetKiosks.includes(String(kioskId).toUpperCase())
        )
      }
      if (search) {
        const q = String(search).toLowerCase()
        filtered = filtered.filter(
          (ad) =>
            ad.title.toLowerCase().includes(q) ||
            ad.advertiser.toLowerCase().includes(q) ||
            (ad.headline && ad.headline.toLowerCase().includes(q))
        )
      }
      return res.json({ success: true, count: filtered.length, data: filtered })
    }

    const query: any = {}
    if (status && status !== 'ALL') {
      query.status = status
    }
    if (kioskId && kioskId !== 'ALL') {
      query.$or = [{ targetKiosks: 'ALL' }, { targetKiosks: String(kioskId).toUpperCase() }]
    }
    if (search) {
      const regex = new RegExp(String(search), 'i')
      query.$or = [
        { title: regex },
        { advertiser: regex },
        { headline: regex },
        { campaignId: regex },
      ]
    }

    const ads = await Advertisement.find(query).sort({ priority: 1, createdAt: -1 }).lean()
    res.json({ success: true, count: ads.length, data: ads })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * Admin Endpoint: Create new advertisement campaign
 * POST /api/advertisements
 */
advertisementsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body
    if (!body.title || !body.advertiser || !body.mediaUrl) {
      return res.status(400).json({
        success: false,
        error: 'Title, advertiser name, and media URL are required to launch a campaign.',
      })
    }

    const campaignId =
      body.campaignId?.trim().toUpperCase() ||
      `AD-CAM-${Math.floor(100 + Math.random() * 900)}`

    const newAdData = {
      campaignId,
      title: body.title.trim(),
      advertiser: body.advertiser.trim(),
      mediaType: body.mediaType || 'IMAGE',
      mediaUrl: body.mediaUrl.trim(),
      headline: body.headline?.trim() || '',
      tagline: body.tagline?.trim() || '',
      callToAction: body.callToAction?.trim() || 'Scan to Claim Offer',
      qrCodeUrl: body.qrCodeUrl?.trim() || '',
      badgeText: body.badgeText?.trim() || 'SPONSORED',
      accentColor: body.accentColor?.trim() || '#dc2626',
      motionType: body.motionType || 'DRIFT',
      motionSpeed: body.motionSpeed || 'SLOW',
      opacity: typeof body.opacity === 'number' ? body.opacity : 0.22,
      targetKiosks: Array.isArray(body.targetKiosks) && body.targetKiosks.length > 0 ? body.targetKiosks : ['ALL'],
      status: body.status || 'ACTIVE',
      priority: Number(body.priority) || 1,
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      impressionsCount: 0,
      clicksCount: 0,
    }

    if (!isDbConnected()) {
      const created = {
        ...newAdData,
        _id: `ad_${Date.now()}`,
        id: campaignId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      fallbackAdvertisements.unshift(created)
      return res.status(201).json({ success: true, data: created })
    }

    const created = await Advertisement.create(newAdData)
    res.status(201).json({ success: true, data: created })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * Admin Endpoint: Toggle campaign status (ACTIVE <-> PAUSED)
 * PATCH /api/advertisements/:id/toggle
 */
advertisementsRouter.patch('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (!isDbConnected()) {
      const ad = fallbackAdvertisements.find((a) => a.campaignId === id || a._id === id || a.id === id)
      if (!ad) return res.status(404).json({ success: false, error: 'Campaign not found' })
      ad.status = ad.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
      ad.updatedAt = new Date()
      return res.json({ success: true, data: ad })
    }

    const ad = await Advertisement.findOne({
      $or: [{ campaignId: id }, { _id: id }],
    })
    if (!ad) return res.status(404).json({ success: false, error: 'Campaign not found' })

    ad.status = ad.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    await ad.save()

    res.json({ success: true, data: ad })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * Admin Endpoint: Update existing advertisement campaign
 * PUT /api/advertisements/:id
 */
advertisementsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const body = req.body

    if (!isDbConnected()) {
      const adIndex = fallbackAdvertisements.findIndex((a) => a.campaignId === id || a._id === id || a.id === id)
      if (adIndex === -1) return res.status(404).json({ success: false, error: 'Campaign not found' })
      fallbackAdvertisements[adIndex] = {
        ...fallbackAdvertisements[adIndex],
        ...body,
        updatedAt: new Date(),
      }
      return res.json({ success: true, data: fallbackAdvertisements[adIndex] })
    }

    const updated = await Advertisement.findOneAndUpdate(
      { $or: [{ campaignId: id }, { _id: id }] },
      { $set: body },
      { new: true }
    )
    if (!updated) return res.status(404).json({ success: false, error: 'Campaign not found' })

    res.json({ success: true, data: updated })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * Admin Endpoint: Delete advertisement campaign
 * DELETE /api/advertisements/:id
 */
advertisementsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (!isDbConnected()) {
      const adIndex = fallbackAdvertisements.findIndex((a) => a.campaignId === id || a._id === id || a.id === id)
      if (adIndex === -1) return res.status(404).json({ success: false, error: 'Campaign not found' })
      fallbackAdvertisements.splice(adIndex, 1)
      return res.json({ success: true, message: 'Campaign deleted successfully' })
    }

    await Advertisement.deleteOne({ $or: [{ campaignId: id }, { _id: id }] })
    res.json({ success: true, message: 'Campaign deleted successfully' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})
