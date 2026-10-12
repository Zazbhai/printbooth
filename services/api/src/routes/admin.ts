import { Router, Request, Response } from 'express'
import { Kiosk } from '../models/Kiosk.js'
import { Order } from '../models/Order.js'
import { Alert } from '../models/Alert.js'
import { Merchant } from '../models/Merchant.js'
import { PricingRule } from '../models/Pricing.js'
import { Notification } from '../models/Notification.js'
import { isDbConnected } from '../db.js'
import { AdminUser } from '../models/AdminUser.js'
import { fallbackKiosks, fallbackOrders, fallbackMerchants, fallbackNotifications, fallbackAdmins, getFallbackAdminSummary } from '../fallbackData.js'
import { requireAdmin } from '../modules/auth.js'
import { getRealPrinterHardwareStatus } from '../modules/printerDetector.js'
import { generateKioskSecret, generatePiEnvContent, resolveKioskApiBaseUrl } from '../modules/kioskAuth.js'
import { getKioskPrintUrl } from '../config.js'
import { cacheMiddleware, cachePurgePattern, getCacheStats } from '../redis.js'

export const adminRouter = Router()

// POST /api/admin/login — Authenticate administrator account (Pre-auth route)
adminRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { identifier, username, email, password } = req.body
    const loginId = (identifier || username || email || '').trim().toLowerCase()
    const loginPass = (password || '').trim()

    if (!loginId || !loginPass) {
      return res.status(400).json({ success: false, error: 'Username/Email and Password are required.' })
    }

    let adminUser: any = null
    if (isDbConnected()) {
      adminUser = await AdminUser.findOne({
        $or: [
          { email: new RegExp(`^${loginId}$`, 'i') },
          { username: new RegExp(`^${loginId}$`, 'i') },
          { adminId: new RegExp(`^${loginId}$`, 'i') },
        ],
      }).lean()
    }
    if (!adminUser) {
      adminUser = fallbackAdmins.find(
        (a: any) =>
          (a.email && a.email.toLowerCase() === loginId) ||
          (a.username && a.username.toLowerCase() === loginId) ||
          (a.adminId && a.adminId.toLowerCase() === loginId)
      )
    }

    // Special fallback for root admin if not in DB yet
    if (!adminUser && (loginId === 'admin@printbooth.in' || loginId === 'admin')) {
      adminUser = fallbackAdmins[0]
    }

    if (!adminUser) {
      return res.status(401).json({ success: false, error: 'No administrator account found with this username or email.' })
    }

    // Check if admin is blocked
    if (adminUser.status === 'BLOCKED') {
      return res.status(403).json({
        success: false,
        isBlocked: true,
        status: 'BLOCKED',
        error: 'Account Blocked: Your administrator account has been suspended by Platform Administration. Please contact the system owner.',
      })
    }

    // Validate password
    const validPassword = adminUser.password || 'admin'
    if (loginPass !== validPassword) {
      return res.status(401).json({ success: false, error: 'Incorrect administrator password.' })
    }

    // Update lastLogin if in DB
    if (isDbConnected() && adminUser._id) {
      await AdminUser.findByIdAndUpdate(adminUser._id, { lastLogin: new Date() }).catch(() => {})
    } else if (adminUser) {
      adminUser.lastLogin = new Date().toISOString()
    }

    const token = 'pb_adm_' + Date.now()
    return res.json({
      success: true,
      message: 'Admin signed in successfully.',
      data: {
        token,
        adminId: adminUser.adminId || 'ADM-001',
        name: adminUser.name || 'Platform Administrator',
        email: adminUser.email || 'admin@printbooth.in',
        username: adminUser.username || 'admin',
        role: 'admin',
        adminRole: adminUser.role || 'SUPERADMIN',
        isRoot: Boolean(adminUser.isRoot),
      },
    })
  } catch (err: any) {
    console.error('[Admin Login Error]:', err)
    return res.status(500).json({ success: false, error: 'Internal server error authenticating admin.' })
  }
})

// Enforce Platform Administrator privileges on all /api/admin endpoints below
adminRouter.use(requireAdmin)

// GET /api/admin/dashboard (cached 15s in Redis)
adminRouter.get('/dashboard', cacheMiddleware({ ttlSeconds: 15, keyPrefix: 'admin:dashboard:' }), async (req: Request, res: Response) => {
  try {
    const rawPeriod = ((req.query.period as string) || 'ALL').toUpperCase()
    const period = ['1D', '1W', '1M', '1Y', 'ALL', 'OVERALL'].includes(rawPeriod) ? rawPeriod : 'ALL'
    const livePrinter = await getRealPrinterHardwareStatus()

    // Fetch MongoDB live records if connected
    let kiosks: any[] = []
    let orders: any[] = []
    let alerts: any[] = []
    let merchants: any[] = []

    if (isDbConnected()) {
      ;[kiosks, orders, alerts, merchants] = await Promise.all([
        Kiosk.find().sort({ kioskId: 1 }).lean(),
        Order.find().sort({ createdAt: -1 }).lean(),
        Alert.find({ acknowledged: false }).sort({ createdAt: -1 }).lean(),
        Merchant.find().lean(),
      ])
    } else {
      kiosks = fallbackKiosks
      merchants = fallbackMerchants
    }

    const liveKiosks = kiosks.map((k: any) => {
      const isHost = (k.kioskId || k.id) === 'PB-001'
      const isOnline = isHost ? livePrinter.isOnline : (k.status === 'ONLINE')
      return {
        ...k,
        id: k.kioskId || k.id,
        status: isOnline ? 'ONLINE' : 'OFFLINE',
        printerStatus: isHost
          ? (livePrinter.isOnline ? 'READY' : (livePrinter.statusLabels?.[0] || 'OFFLINE'))
          : (k.printerStatus || 'OFFLINE'),
        printerModel: (isHost ? livePrinter.selectedPrinter : null) || k.printerModel || 'Laser Print Engine',
        paperLevel: isOnline ? (k.paperLevel ?? 0) : 0,
        tonerLevel: isOnline ? (k.tonerLevel ?? 0) : 0,
      }
    })

    const activeKiosksCount = liveKiosks.filter((k: any) => k.status === 'ONLINE').length
    const totalKiosksCount = liveKiosks.length || 1

    // Cohort Time Windows
    const now = new Date()
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const dailyDbOrders = orders.filter((o: any) => new Date(o.createdAt) >= oneDayAgo)
    const weeklyDbOrders = orders.filter((o: any) => new Date(o.createdAt) >= sevenDaysAgo)
    const monthlyDbOrders = orders.filter((o: any) => new Date(o.createdAt) >= thirtyDaysAgo)
    const overallDbOrders = orders

    const getCustomerKey = (o: any) => {
      return (o.customerPhone && o.customerPhone.trim()) ||
        (o.customerEmail && o.customerEmail.trim()) ||
        (o.customerIp && o.customerIp.trim() && o.customerIp !== '127.0.0.1' ? o.customerIp.trim() : '') ||
        o.orderNumber || o.orderId || 'guest_user'
    }

    // Build real metrics directly and strictly from database orders
    const buildCohortMetrics = (cohortOrders: any[], label: string, badge: string) => {
      const prints = cohortOrders.reduce((s: number, o: any) => s + (o.pageCount || 1) * (o.copies || 1), 0)
      const revenue = cohortOrders.reduce((s: number, o: any) => s + (o.amount || 0), 0)
      const users = new Set(cohortOrders.map(getCustomerKey).filter((k) => k !== 'guest_user')).size || (cohortOrders.length > 0 ? cohortOrders.length : 0)
      const arpu = users > 0 ? Math.round(revenue / users) : 0
      const pagesPerUser = users > 0 ? (prints / users).toFixed(1) : '0.0'

      return {
        timeframe: label,
        badge,
        users,
        prints,
        revenue,
        revenueFormatted: `₹${revenue.toLocaleString('en-IN')}`,
        arpu,
        pagesPerUser,
        activeMachinesCombined: activeKiosksCount,
        totalMachinesCombined: totalKiosksCount,
        growth: `${cohortOrders.length} orders recorded`,
      }
    }

    const ipoMetrics = {
      daily: buildCohortMetrics(dailyDbOrders, 'Daily (24h)', 'TODAY'),
      weekly: buildCohortMetrics(weeklyDbOrders, 'Weekly (7D)', '7 DAYS'),
      monthly: buildCohortMetrics(monthlyDbOrders, 'Monthly (30D)', 'MTD'),
      overall: buildCohortMetrics(overallDbOrders, 'Overall (All-Time)', 'ALL-TIME'),
    }

    // Active period selection
    let selectedCohort = ipoMetrics.overall
    let periodOrders = overallDbOrders
    if (period === '1D') {
      selectedCohort = ipoMetrics.daily
      periodOrders = dailyDbOrders
    } else if (period === '1W') {
      selectedCohort = ipoMetrics.weekly
      periodOrders = weeklyDbOrders
    } else if (period === '1M') {
      selectedCohort = ipoMetrics.monthly
      periodOrders = monthlyDbOrders
    }

    // Formats distribution directly from actual orders in this period
    const bwOrders = periodOrders.filter((o: any) => o.colourMode === 'BW')
    const colorOrders = periodOrders.filter((o: any) => o.colourMode === 'COLOUR')
    const bwPrints = bwOrders.reduce((s: number, o: any) => s + (o.pageCount || 1) * (o.copies || 1), 0)
    const colorPrints = colorOrders.reduce((s: number, o: any) => s + (o.pageCount || 1) * (o.copies || 1), 0)

    // Throughput Chart Data aggregated strictly from real orders by timestamp
    let hourlyThroughput: any[] = []
    if (period === '1D') {
      const hourSlots = ['6 AM', '8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM', '10 PM']
      const buckets: Record<string, { revenue: number; prints: number }> = {}
      hourSlots.forEach((h) => { buckets[h] = { revenue: 0, prints: 0 } })

      periodOrders.forEach((o: any) => {
        const d = new Date(o.createdAt || Date.now())
        const h = d.getHours()
        let slot = '6 AM'
        if (h >= 22) slot = '10 PM'
        else if (h >= 20) slot = '8 PM'
        else if (h >= 18) slot = '6 PM'
        else if (h >= 16) slot = '4 PM'
        else if (h >= 14) slot = '2 PM'
        else if (h >= 12) slot = '12 PM'
        else if (h >= 10) slot = '10 AM'
        else if (h >= 8) slot = '8 AM'
        buckets[slot].revenue += (o.amount || 0)
        buckets[slot].prints += (o.pageCount || 1) * (o.copies || 1)
      })

      hourlyThroughput = hourSlots.map((h) => ({
        time: h,
        revenue: Math.round(buckets[h].revenue),
        prints: buckets[h].prints,
        benchmark: 0,
      }))
    } else if (period === '1W') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const dayBuckets: Record<string, { revenue: number; prints: number }> = {}
      const orderedLabels: string[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000)
        const label = `${days[d.getDay()]} ${d.getDate()}`
        orderedLabels.push(label)
        dayBuckets[label] = { revenue: 0, prints: 0 }
      }

      periodOrders.forEach((o: any) => {
        const d = new Date(o.createdAt || Date.now())
        const label = `${days[d.getDay()]} ${d.getDate()}`
        if (dayBuckets[label]) {
          dayBuckets[label].revenue += (o.amount || 0)
          dayBuckets[label].prints += (o.pageCount || 1) * (o.copies || 1)
        }
      })

      hourlyThroughput = orderedLabels.map((l) => ({
        time: l,
        revenue: Math.round(dayBuckets[l].revenue),
        prints: dayBuckets[l].prints,
        benchmark: 0,
      }))
    } else if (period === '1M') {
      const intervals = ['Day 1-5', 'Day 6-10', 'Day 11-15', 'Day 16-20', 'Day 21-25', 'Day 26-30']
      const buckets: Record<string, { revenue: number; prints: number }> = {}
      intervals.forEach((i) => { buckets[i] = { revenue: 0, prints: 0 } })

      periodOrders.forEach((o: any) => {
        const d = new Date(o.createdAt || Date.now())
        const dayOfMonth = d.getDate()
        let slot = 'Day 1-5'
        if (dayOfMonth > 25) slot = 'Day 26-30'
        else if (dayOfMonth > 20) slot = 'Day 21-25'
        else if (dayOfMonth > 15) slot = 'Day 16-20'
        else if (dayOfMonth > 10) slot = 'Day 11-15'
        else if (dayOfMonth > 5) slot = 'Day 6-10'
        buckets[slot].revenue += (o.amount || 0)
        buckets[slot].prints += (o.pageCount || 1) * (o.copies || 1)
      })

      hourlyThroughput = intervals.map((i) => ({
        time: i,
        revenue: Math.round(buckets[i].revenue),
        prints: buckets[i].prints,
        benchmark: 0,
      }))
    } else {
      const monthBuckets: Record<string, { revenue: number; prints: number }> = {}
      const monthLabels: string[] = []
      periodOrders.forEach((o: any) => {
        const d = new Date(o.createdAt || Date.now())
        const m = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        if (!monthBuckets[m]) {
          monthBuckets[m] = { revenue: 0, prints: 0 }
          monthLabels.push(m)
        }
        monthBuckets[m].revenue += (o.amount || 0)
        monthBuckets[m].prints += (o.pageCount || 1) * (o.copies || 1)
      })

      if (monthLabels.length === 0) {
        const cur = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        monthLabels.push(cur)
        monthBuckets[cur] = { revenue: 0, prints: 0 }
      }

      hourlyThroughput = monthLabels.map((m) => ({
        time: m,
        revenue: Math.round(monthBuckets[m].revenue),
        prints: monthBuckets[m].prints,
        benchmark: 0,
      }))
    }

    // Build User Directory strictly from real database orders (ZERO mock or seed users)
    const userDirectoryMap = new Map<string, any>()
    orders.forEach((o: any, idx: number) => {
      const key = getCustomerKey(o)
      if (!key) return
      const pages = (o.pageCount || 1) * (o.copies || 1)
      const amt = o.amount || 0
      const isBw = o.colourMode === 'BW'
      const isDaily = new Date(o.createdAt) >= oneDayAgo
      const isMonthly = new Date(o.createdAt) >= thirtyDaysAgo

      const existing = userDirectoryMap.get(key)
      if (existing) {
        existing.totalOrders += 1
        existing.totalPages += pages
        existing.totalSpent += amt
        if (isBw) existing.bwPages += pages
        else existing.colorPages += pages
        if (o.kioskId && !existing.kiosksUsed.includes(o.kioskId)) {
          existing.kiosksUsed.push(o.kioskId)
        }
        if (new Date(o.createdAt) > new Date(existing.lastActive)) {
          existing.lastActive = new Date(o.createdAt).toISOString()
        }
        if (isDaily) existing.isDaily = true
        if (isMonthly) existing.isMonthly = true
      } else {
        userDirectoryMap.set(key, {
          id: `USR-${(1000 + idx)}`,
          identifier: o.customerPhone || o.customerEmail || (o.customerIp ? `IP •••${o.customerIp.slice(-4)}` : `Customer #${idx + 1}`),
          phone: o.customerPhone || '',
          email: o.customerEmail || '',
          ip: o.customerIp || '',
          totalOrders: 1,
          totalPages: pages,
          totalSpent: amt,
          bwPages: isBw ? pages : 0,
          colorPages: !isBw ? pages : 0,
          kiosksUsed: [o.kioskId || 'PB-001'],
          lastActive: new Date(o.createdAt).toISOString(),
          isDaily,
          isMonthly,
          isOverall: true,
          tier: pages > 10 ? 'Power User' : 'Standard',
        })
      }
    })

    const userDirectory = Array.from(userDirectoryMap.values())

    // Format kiosks with real order counts for today
    const formattedKiosks = liveKiosks.map((k: any) => {
      const kid = k.kioskId || k.id
      const kioskDailyOrders = dailyDbOrders.filter((o: any) => o.kioskId === kid)
      const realTodayPages = kioskDailyOrders.reduce((s: number, o: any) => s + (o.pageCount || 1) * (o.copies || 1), 0)
      const realTodayRev = kioskDailyOrders.reduce((s: number, o: any) => s + (o.amount || 0), 0)

      return {
        id: kid,
        location: k.location || 'Pune Campus',
        printer: k.printerModel || 'Brother Industries, Ltd HL-L5210DW series',
        paper: k.paperLevel ?? 0,
        toner: k.tonerLevel ?? 0,
        status: k.status,
        queue: k.queueCount || 0,
        todayPages: realTodayPages,
        todayRevenue: realTodayRev,
      }
    })

    res.json({
      success: true,
      databaseConnected: isDbConnected(),
      data: {
        databaseConnected: isDbConnected(),
        selectedPeriod: period,
        summary: {
          period,
          periodLabel: selectedCohort.timeframe,
          combinedUsers: selectedCohort.users,
          todayPrints: selectedCohort.prints,
          todayRevenue: selectedCohort.revenueFormatted,
          rawRevenue: selectedCohort.revenue,
          arpu: selectedCohort.arpu,
          pagesPerUser: selectedCohort.pagesPerUser,
          activeKiosks: `${activeKiosksCount} / ${totalKiosksCount} deployed`,
          activeKiosksCount,
          totalKiosksCount,
          fleetHealth: `${((activeKiosksCount / totalKiosksCount) * 100).toFixed(1)}%`,
          pendingAlertsCount: alerts.length,
          growth: selectedCohort.growth,
        },
        ipoMetrics,
        userDirectory: userDirectory.slice(0, 30),
        hourlyThroughput,
        printFormats: [
          { name: 'Standard B&W', value: bwPrints, color: 'var(--chart-4)' },
          { name: 'Full Color HD', value: colorPrints, color: 'var(--chart-2)' },
        ],
        kiosks: formattedKiosks,
        alerts,
        merchants,
      },
    })
  } catch (error: any) {
    console.error('Error fetching admin dashboard:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/admin/kiosks
adminRouter.get('/kiosks', async (_req: Request, res: Response) => {
  try {
    const livePrinter = await getRealPrinterHardwareStatus()
    if (!isDbConnected()) {
      const enriched = fallbackKiosks.map((k) => ({
        ...k,
        status: livePrinter.isOnline ? 'ONLINE' : 'OFFLINE',
        printerStatus: livePrinter.isOnline ? 'READY' : (livePrinter.statusLabels?.[0] || 'OFFLINE'),
        printerModel: livePrinter.selectedPrinter || k.printerModel,
        paperLevel: 0,
        tonerLevel: 0,
      }))
      return res.json({ success: true, databaseConnected: false, data: enriched })
    }
    const kiosks = await Kiosk.find().sort({ kioskId: 1 }).lean()
    const enriched = kiosks.map((k) => {
      if (k.kioskId === 'PB-001') {
        return {
          ...k,
          status: livePrinter.isOnline ? (k.status || 'ONLINE') : 'OFFLINE',
          printerStatus: livePrinter.isOnline ? 'READY' : (livePrinter.statusLabels?.[0] || 'OFFLINE'),
          printerModel: livePrinter.selectedPrinter || k.printerModel,
        }
      }
      return k
    })
    res.json({ success: true, databaseConnected: true, data: enriched })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/admin/kiosks/:id
adminRouter.get('/kiosks/:id', async (req: Request, res: Response) => {
  try {
    const livePrinter = await getRealPrinterHardwareStatus()
    let kiosk: any = null
    if (!isDbConnected()) {
      kiosk = fallbackKiosks.find((k) => (k.kioskId || k.id) === req.params.id)
    } else {
      kiosk = await Kiosk.findOne({ kioskId: req.params.id }).lean()
    }
    if (!kiosk) {
      return res.status(404).json({ success: false, message: 'Kiosk not found' })
    }
    if (kiosk.kioskId === 'PB-001' || kiosk.id === 'PB-001') {
      kiosk = {
        ...kiosk,
        status: livePrinter.isOnline ? (kiosk.status || 'ONLINE') : 'OFFLINE',
        printerStatus: livePrinter.isOnline ? 'READY' : (livePrinter.statusLabels?.[0] || 'OFFLINE'),
        printerModel: livePrinter.selectedPrinter || kiosk.printerModel,
      }
    }
    res.json({ success: true, databaseConnected: isDbConnected(), data: kiosk })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// PUT /api/admin/kiosks/:id/photo — Update physical kiosk hardware installation photo
adminRouter.put('/kiosks/:id/photo', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const photoUrl = req.body.kioskPhotoUrl || req.body.photoUrl

    if (!photoUrl || !String(photoUrl).trim()) {
      return res.status(400).json({ success: false, error: 'Valid kiosk photo URL or base64 image data is required.' })
    }

    const cleanPhotoUrl = String(photoUrl).trim()

    let updatedKiosk: any = null
    if (isDbConnected()) {
      updatedKiosk = await Kiosk.findOneAndUpdate(
        { $or: [{ kioskId: id }, { _id: id }] },
        { $set: { kioskPhotoUrl: cleanPhotoUrl } },
        { new: true }
      ).lean()
    }

    // Sync in fallback data
    const fbKiosk = fallbackKiosks.find((k) => (k.kioskId || k.id) === id)
    if (fbKiosk) {
      fbKiosk.kioskPhotoUrl = cleanPhotoUrl
      if (!updatedKiosk) updatedKiosk = fbKiosk
    }

    // Also sync the associated merchant partner record
    const targetKioskId = updatedKiosk?.kioskId || id
    if (isDbConnected()) {
      await Merchant.findOneAndUpdate(
        { kioskId: targetKioskId },
        { $set: { kioskPhotoUrl: cleanPhotoUrl } }
      )
    }
    const fbMerchant = fallbackMerchants.find((m) => m.kioskId === targetKioskId)
    if (fbMerchant) {
      fbMerchant.kioskPhotoUrl = cleanPhotoUrl
    }

    await cachePurgePattern('admin:*')
    await cachePurgePattern('merchant:*')
    await cachePurgePattern('kiosks:*')

    res.json({
      success: true,
      message: `Kiosk photo updated successfully for station ${targetKioskId}.`,
      data: {
        kioskId: targetKioskId,
        kioskPhotoUrl: cleanPhotoUrl,
        kiosk: updatedKiosk,
      },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/kiosks — Deploy a new Raspberry Pi Kiosk Station bound to a Merchant
adminRouter.post('/kiosks', async (req: Request, res: Response) => {
  try {
    const {
      kioskId,
      name,
      location,
      address,
      merchantId,
      printerModel,
      pricing,
    } = req.body

    if (!kioskId || !/^PB-\d{3}$/.test(String(kioskId).trim().toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'kioskId is required and must match canonical PB-XXX format (e.g. PB-002).',
      })
    }
    const cleanId = String(kioskId).trim().toUpperCase()

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'Station name is required.' })
    }
    if (!merchantId) {
      return res.status(400).json({ success: false, error: 'merchantId is required to associate station with a merchant partner.' })
    }

    if (!isDbConnected()) {
      return res.status(503).json({ success: false, error: 'Database disconnected. Cannot persist new kiosk.' })
    }

    const existing = await Kiosk.findOne({ kioskId: cleanId })
    if (existing) {
      return res.status(409).json({ success: false, error: `Kiosk station '${cleanId}' is already registered.` })
    }

    const merchant = await Merchant.findOne({ merchantId })
    if (!merchant) {
      return res.status(404).json({ success: false, error: `Merchant '${merchantId}' not found.` })
    }

    const deviceSecret = generateKioskSecret()

    const newKiosk = new Kiosk({
      kioskId: cleanId,
      name: name.trim(),
      location: (location || address || 'Campus Station').trim(),
      address: (address || location || '').trim(),
      merchantId,
      deviceSecret,
      status: 'OFFLINE',
      printerStatus: 'OFFLINE',
      printerModel: printerModel || 'Brother DCP-T420W Printer',
      paperLevel: 100,
      tonerLevel: 100,
      queueCount: 0,
      todayPages: 0,
      todayRevenue: 0,
      totalRevenue: 0,
      paymentGateway: merchant.paymentGateway || 'upiexpress',
      upiExpressApiKey: merchant.upiExpressApiKey || '',
      upiExpressUpiId: merchant.upiExpressUpiId || '',
      razorpayKeyId: merchant.razorpayKeyId || '',
      razorpayKeySecret: merchant.razorpayKeySecret || '',
      pricing: pricing || merchant.pricing || {
        bwSingle: 2.0,
        bwDouble: 3.5,
        colorSingle: 10.0,
        colorDouble: 18.0,
      },
      kioskPhotoUrl: (req.body.kioskPhotoUrl && String(req.body.kioskPhotoUrl).trim()) || merchant.kioskPhotoUrl || 'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=600&q=80',
      qrCodeUrl: getKioskPrintUrl(cleanId, req),
    })

    await newKiosk.save()
    await cachePurgePattern('kiosks:*').catch(() => {})
    await cachePurgePattern('admin:*').catch(() => {})

    const apiBaseUrl = resolveKioskApiBaseUrl(req)
    const envContent = generatePiEnvContent(newKiosk, apiBaseUrl)
    const setupCommand = `python3 setup_station.py --id ${cleanId} --secret ${deviceSecret} --api ${apiBaseUrl}`

    return res.status(201).json({
      success: true,
      message: `Kiosk ${cleanId} deployed successfully and linked to Merchant ${merchant.name} (${merchantId}).`,
      data: newKiosk,
      provisioning: {
        kioskId: cleanId,
        deviceSecret,
        merchantId,
        merchantName: merchant.name,
        storeName: merchant.storeName,
        apiBaseUrl,
        setupCommand,
        envContent,
      },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/admin/kiosks/:id/provision-kit — Retrieve credentials & ready-to-run setup command for a Pi
adminRouter.get('/kiosks/:id/provision-kit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, error: 'Database disconnected.' })
    }
    const kiosk = await Kiosk.findOne({ kioskId: id })
    if (!kiosk) {
      return res.status(404).json({ success: false, error: `Kiosk '${id}' not found.` })
    }
    if (!kiosk.deviceSecret) {
      kiosk.deviceSecret = generateKioskSecret()
      await kiosk.save()
    }
    const merchant = await Merchant.findOne({ merchantId: kiosk.merchantId })
    const apiBaseUrl = resolveKioskApiBaseUrl(req)
    const envContent = generatePiEnvContent(kiosk, apiBaseUrl)
    const setupCommand = `python3 setup_station.py --id ${kiosk.kioskId} --secret ${kiosk.deviceSecret} --api ${apiBaseUrl}`

    return res.json({
      success: true,
      data: {
        kioskId: kiosk.kioskId,
        name: kiosk.name,
        deviceSecret: kiosk.deviceSecret,
        merchantId: kiosk.merchantId,
        merchantName: merchant?.name || 'Assigned Merchant',
        storeName: merchant?.storeName || 'Campus Store',
        apiBaseUrl,
        setupCommand,
        envContent,
      },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/kiosks/:id/rotate-secret — Rotate device secret for a station
adminRouter.post('/kiosks/:id/rotate-secret', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, error: 'Database disconnected.' })
    }
    const kiosk = await Kiosk.findOne({ kioskId: id })
    if (!kiosk) {
      return res.status(404).json({ success: false, error: `Kiosk '${id}' not found.` })
    }
    const newSecret = generateKioskSecret()
    kiosk.deviceSecret = newSecret
    await kiosk.save()

    const merchant = await Merchant.findOne({ merchantId: kiosk.merchantId })
    const apiBaseUrl = resolveKioskApiBaseUrl(req)
    const envContent = generatePiEnvContent(kiosk, apiBaseUrl)
    const setupCommand = `python3 setup_station.py --id ${kiosk.kioskId} --secret ${newSecret} --api ${apiBaseUrl}`

    return res.json({
      success: true,
      message: `Secret for station ${id} rotated successfully. Please update the Raspberry Pi .env.`,
      data: {
        kioskId: kiosk.kioskId,
        deviceSecret: newSecret,
        merchantId: kiosk.merchantId,
        merchantName: merchant?.name || '',
        setupCommand,
        envContent,
      },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// DELETE /api/admin/kiosks/:id — Delete kiosk from fleet
adminRouter.delete('/kiosks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (id === 'PB-001') {
      return res.status(400).json({ success: false, error: 'Cannot delete primary root station PB-001.' })
    }
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, error: 'Database disconnected.' })
    }
    const deleted = await Kiosk.findOneAndDelete({ kioskId: id })
    if (!deleted) {
      return res.status(404).json({ success: false, error: `Kiosk '${id}' not found.` })
    }
    await cachePurgePattern('kiosks:*').catch(() => {})
    await cachePurgePattern('admin:*').catch(() => {})
    return res.json({ success: true, message: `Kiosk ${id} deleted from fleet.` })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/admin/orders
adminRouter.get('/orders', async (req: Request, res: Response) => {
  try {
    if (!isDbConnected()) {
      return res.json({ success: true, databaseConnected: false, data: fallbackOrders })
    }
    const limit = parseInt(req.query.limit as string) || 50
    const orders = await Order.find().sort({ createdAt: -1 }).limit(limit)
    res.json({ success: true, databaseConnected: true, data: orders })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/admin/alerts
adminRouter.get('/alerts', async (_req: Request, res: Response) => {
  try {
    const alerts = await Alert.find().sort({ createdAt: -1 })
    res.json({ success: true, databaseConnected: isDbConnected(), data: alerts })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/alerts/:id/ack
adminRouter.post('/alerts/:id/ack', async (req: Request, res: Response) => {
  try {
    const alert = await Alert.findOneAndUpdate(
      { alertId: req.params.id },
      { acknowledged: true, acknowledgedAt: new Date() },
      { new: true }
    )
    res.json({ success: true, databaseConnected: isDbConnected(), data: alert })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/alerts/ack-all
adminRouter.post('/alerts/ack-all', async (_req: Request, res: Response) => {
  try {
    await Alert.updateMany({ acknowledged: false }, { acknowledged: true, acknowledgedAt: new Date() })
    const alerts = await Alert.find().sort({ createdAt: -1 })
    res.json({ success: true, databaseConnected: isDbConnected(), data: alerts })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/admin/merchants
adminRouter.get('/merchants', async (req: Request, res: Response) => {
  try {
    const livePrinter = await getRealPrinterHardwareStatus()
    let merchantsList: any[] = []
    let kiosksList: any[] = []

    if (isDbConnected()) {
      merchantsList = await Merchant.find().sort({ merchantId: 1 }).lean()
      kiosksList = await Kiosk.find().lean()
    } else {
      merchantsList = fallbackMerchants
      kiosksList = fallbackKiosks
    }

    // Merge live printer status & telemetry into each merchant
    const enriched = merchantsList.map((m) => {
      const pairedKiosk = kiosksList.find((k) => (k.kioskId || k.id) === m.kioskId)
      const isHost = m.kioskId === 'PB-001'
      const isOnline = isHost ? livePrinter.isOnline : (pairedKiosk?.status === 'ONLINE')
      const printerStatus = isHost
        ? (livePrinter.isOnline ? 'READY' : (livePrinter.statusLabels?.[0] || 'OFFLINE'))
        : (pairedKiosk?.printerStatus || 'OFFLINE')

      return {
        ...m,
        username: m.username || (m.email ? m.email.split('@')[0] : 'merchant'),
        password: m.password || 'merchant123',
        isBlocked: m.isBlocked === true || m.status === 'BLOCKED',
        requirePasswordChange: m.requirePasswordChange !== false,
        status: m.status === 'BLOCKED' || m.isBlocked ? 'BLOCKED' : (m.status || 'ACTIVE'),
        kioskVariant: m.kioskVariant || pairedKiosk?.kioskVariant || 'pro',
        kioskLocation: pairedKiosk?.location || pairedKiosk?.address || m.address || 'MIT ADT Campus, Pune',
        kioskAddress: pairedKiosk?.address || m.address || '',
        kioskStatus: isOnline ? 'ONLINE' : 'OFFLINE',
        printerStatus,
        paperLevel: 0,
        tonerLevel: 0,
        paymentGateway: m.paymentGateway || pairedKiosk?.paymentGateway || 'upiexpress',
        upiExpressApiKey: m.upiExpressApiKey || pairedKiosk?.upiExpressApiKey || '',
        upiExpressUpiId: m.upiExpressUpiId || pairedKiosk?.upiExpressUpiId || '',
        razorpayKeyId: m.razorpayKeyId || pairedKiosk?.razorpayKeyId || '',
        printerModel: (isHost ? livePrinter.selectedPrinter : null) || pairedKiosk?.printerModel || 'Brother DCP-T420W Printer USB',
        kioskPhotoUrl: m.kioskPhotoUrl || pairedKiosk?.kioskPhotoUrl || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=600&q=80',
        qrCodeUrl: m.qrCodeUrl || getKioskPrintUrl(m.kioskId, req),
      }
    })

    res.json({ success: true, databaseConnected: isDbConnected(), data: enriched })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/merchants
adminRouter.post('/merchants', async (req: Request, res: Response) => {
  try {
    const {
      name,
      storeName,
      phone,
      email,
      username,
      password,
      address,
      kioskPhotoUrl,
      commission,
      kioskId: customKioskId,
      kioskVariant: rawVariant = 'pro',
      paymentGateway = 'upiexpress',
      upiExpressApiKey = '',
      upiExpressUpiId = '',
      razorpayKeyId = '',
      razorpayKeySecret = '',
    } = req.body

    const cleanGateway = paymentGateway === 'razorpay' ? 'razorpay' : 'upiexpress'
    const kioskVariant: 'pro' | 'lite' = String(rawVariant || '').toLowerCase().includes('lite') ? 'lite' : 'pro'

    // 1. Strict required validations
    if (!storeName || !storeName.trim()) {
      return res.status(400).json({ success: false, error: 'Shop Name is required' })
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Contact Person Name is required' })
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, error: 'Phone Number is required' })
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Email Address is required' })
    }
    if (!kioskPhotoUrl || !kioskPhotoUrl.trim()) {
      return res.status(400).json({ success: false, error: 'Kiosk photo is required' })
    }

    // Sanitize credentials decided by admin
    const cleanUsername = (username && String(username).trim())
      ? String(username).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '')
      : (email.split('@')[0] || name.toLowerCase().replace(/\s+/g, '_')).replace(/[^a-z0-9_.-]/g, '')
    const cleanPassword = (password && String(password).trim())
      ? String(password).trim()
      : 'merchant123'

    // 2. Determine assigned machine / kioskId (e.g. PB-001, PB-002, PB-003...)
    let assignedKioskId = (customKioskId || '').trim().toUpperCase()
    if (!assignedKioskId) {
      let existingKioskIds: string[] = []
      if (isDbConnected()) {
        const found = await Kiosk.find({}, 'kioskId').lean()
        existingKioskIds = found.map((k: any) => k.kioskId)
      } else {
        existingKioskIds = fallbackKiosks.map((k: any) => k.kioskId || k.id)
      }

      let num = 1
      while (existingKioskIds.includes(`PB-${String(num).padStart(3, '0')}`)) {
        num++
      }
      assignedKioskId = `PB-${String(num).padStart(3, '0')}`
    }

    // 3. Generate unique print URL for this machine
    const qrCodeUrl = getKioskPrintUrl(assignedKioskId, req)

    // 4. Calculate merchantId
    const currentCount = isDbConnected()
      ? await Merchant.countDocuments()
      : fallbackMerchants.length
    const merchantId = req.body.merchantId || `M-${String(currentCount + 1).padStart(3, '0')}`

    const commissionRate = commission
      ? parseFloat(String(commission).replace('%', '')) / 100
      : 0.0

    const merchantDoc = {
      merchantId,
      name: name.trim(),
      storeName: storeName.trim(),
      email: email.trim(),
      username: cleanUsername,
      password: cleanPassword,
      phone: phone.trim(),
      address: address ? address.trim() : '',
      kioskId: assignedKioskId,
      kioskVariant,
      kioskPhotoUrl: kioskPhotoUrl.trim(),
      qrCodeUrl,
      commissionRate,
      todayEarnings: 0,
      wtdEarnings: 0,
      mtdEarnings: 0,
      totalEarnings: 0,
      bankName: req.body.bankName || 'HDFC Bank',
      bankAccountLast4: req.body.bankAccountLast4 || '4821',
      autoPayoutEnabled: true,
      payoutSchedule: 'Friday 11:00 AM',
      paymentGateway: cleanGateway,
      upiExpressApiKey: cleanGateway === 'upiexpress' ? upiExpressApiKey : '',
      upiExpressUpiId: cleanGateway === 'upiexpress' ? upiExpressUpiId : '',
      razorpayKeyId: cleanGateway === 'razorpay' ? razorpayKeyId : '',
      razorpayKeySecret: cleanGateway === 'razorpay' ? razorpayKeySecret : '',
      isBlocked: false,
      requirePasswordChange: true,
      status: 'ACTIVE' as const,
    }

    // 5. Save to MongoDB if connected
    if (isDbConnected()) {
      await Merchant.create(merchantDoc)
      await Kiosk.findOneAndUpdate(
        { kioskId: assignedKioskId },
        {
          kioskId: assignedKioskId,
          kioskVariant,
          name: `PrintBooth — ${storeName.trim()}`,
          location: address ? address.trim() : `${storeName.trim()}, Pune`,
          address: address ? address.trim() : '',
          lat: req.body.lat ? Number(req.body.lat) : 18.5204,
          lng: req.body.lng ? Number(req.body.lng) : 73.8567,
          status: 'ONLINE',
          printerStatus: 'READY',
          printerModel: kioskVariant === 'lite' ? 'Monochrome Laser Print Engine' : 'Brother DCP-T420W Printer USB',
          paperLevel: 100,
          tonerLevel: 100,
          merchantId,
          kioskPhotoUrl: kioskPhotoUrl.trim(),
          qrCodeUrl,
          paymentGateway: cleanGateway,
          upiExpressApiKey: cleanGateway === 'upiexpress' ? upiExpressApiKey : '',
          upiExpressUpiId: cleanGateway === 'upiexpress' ? upiExpressUpiId : '',
          razorpayKeyId: cleanGateway === 'razorpay' ? razorpayKeyId : '',
          razorpayKeySecret: cleanGateway === 'razorpay' ? razorpayKeySecret : '',
        },
        { upsert: true, new: true }
      )
    }

    // 6. Save in memory fallback data so immediately available
    fallbackMerchants.unshift(merchantDoc)
    const existingKiosk = fallbackKiosks.find((k: any) => (k.kioskId || k.id) === assignedKioskId)
    if (!existingKiosk) {
      fallbackKiosks.unshift({
        id: assignedKioskId,
        kioskId: assignedKioskId,
        kioskVariant,
        name: `PrintBooth — ${storeName.trim()}`,
        location: address ? address.trim() : `${storeName.trim()}, Pune`,
        address: address ? address.trim() : '',
        lat: req.body.lat ? Number(req.body.lat) : 18.5204,
        lng: req.body.lng ? Number(req.body.lng) : 73.8567,
        printer: kioskVariant === 'lite' ? 'Monochrome Laser Print Engine' : 'Brother DCP-T420W Printer USB',
        printerModel: kioskVariant === 'lite' ? 'Monochrome Laser Print Engine' : 'Brother DCP-T420W Printer USB',
        printerStatus: 'READY',
        paper: 100,
        paperLevel: 100,
        toner: 100,
        tonerLevel: 100,
        paymentGateway: cleanGateway,
        upiExpressApiKey: cleanGateway === 'upiexpress' ? upiExpressApiKey : '',
        upiExpressUpiId: cleanGateway === 'upiexpress' ? upiExpressUpiId : '',
        razorpayKeyId: cleanGateway === 'razorpay' ? razorpayKeyId : '',
        razorpayKeySecret: cleanGateway === 'razorpay' ? razorpayKeySecret : '',
        status: 'ONLINE',
        queue: 0,
        todayPages: 0,
        todayRevenue: 0,
        merchantId,
        kioskPhotoUrl: kioskPhotoUrl.trim(),
        qrCodeUrl,
        pricing: kioskVariant === 'lite'
          ? { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 0, colorDouble: 0 }
          : { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0 },
        deviceSecret: generateKioskSecret(),
      })
    } else {
      existingKiosk.kioskVariant = kioskVariant
      existingKiosk.kioskPhotoUrl = kioskPhotoUrl.trim()
      existingKiosk.merchantId = merchantId
      existingKiosk.qrCodeUrl = qrCodeUrl
    }

    await cachePurgePattern('admin:*')
    await cachePurgePattern('merchant:*')

    res.json({
      success: true,
      databaseConnected: isDbConnected(),
      message: 'Merchant registered successfully!',
      data: merchantDoc,
      kioskId: assignedKioskId,
      qrCodeUrl,
    })
  } catch (error: any) {
    console.error('Error adding merchant:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// PUT /api/admin/merchants/:id — Update partner profile, credentials, or status
adminRouter.put('/merchants/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const {
      name,
      storeName,
      email,
      username,
      password,
      phone,
      address,
      commission,
      kioskId,
      kioskPhotoUrl,
      paymentGateway,
      upiExpressApiKey,
      upiExpressUpiId,
      razorpayKeyId,
      razorpayKeySecret,
      status,
      isBlocked,
    } = req.body

    const updates: Record<string, any> = {}
    if (name !== undefined) updates.name = String(name).trim()
    if (storeName !== undefined) updates.storeName = String(storeName).trim()
    if (email !== undefined) updates.email = String(email).trim()
    if (username !== undefined) {
      updates.username = String(username).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '')
    }
    if (password !== undefined && String(password).trim().length > 0) {
      updates.password = String(password).trim()
    }
    if (phone !== undefined) updates.phone = String(phone).trim()
    if (address !== undefined) updates.address = String(address).trim()
    if (kioskPhotoUrl !== undefined && String(kioskPhotoUrl).trim().length > 0) {
      updates.kioskPhotoUrl = String(kioskPhotoUrl).trim()
    }
    if (commission !== undefined) {
      updates.commissionRate = parseFloat(String(commission).replace('%', '')) / 100
    }
    if (kioskId !== undefined) updates.kioskId = String(kioskId).trim().toUpperCase()
    if (paymentGateway !== undefined) {
      updates.paymentGateway = paymentGateway === 'razorpay' ? 'razorpay' : 'upiexpress'
    }
    if (upiExpressApiKey !== undefined) updates.upiExpressApiKey = String(upiExpressApiKey).trim()
    if (upiExpressUpiId !== undefined) updates.upiExpressUpiId = String(upiExpressUpiId).trim()
    if (razorpayKeyId !== undefined) updates.razorpayKeyId = String(razorpayKeyId).trim()
    if (razorpayKeySecret !== undefined) updates.razorpayKeySecret = String(razorpayKeySecret).trim()

    // Validation: if gateway is specified, ensure credentials exist
    if (updates.paymentGateway === 'upiexpress') {
      const existingM: any = isDbConnected() ? await Merchant.findOne({ merchantId: id }).lean() : fallbackMerchants.find(m => m.merchantId === id)
      const effectiveKey = updates.upiExpressApiKey !== undefined ? updates.upiExpressApiKey : existingM?.upiExpressApiKey
      if (!effectiveKey || !effectiveKey.trim()) {
        return res.status(400).json({
          success: false,
          error: 'UPI Express API Key is not configured for this merchant. Please provide the UPI Express API Key.',
        })
      }
    } else if (updates.paymentGateway === 'razorpay') {
      const existingM: any = isDbConnected() ? await Merchant.findOne({ merchantId: id }).lean() : fallbackMerchants.find(m => m.merchantId === id)
      const effectiveKeyId = updates.razorpayKeyId !== undefined ? updates.razorpayKeyId : existingM?.razorpayKeyId
      const effectiveSecret = updates.razorpayKeySecret !== undefined ? updates.razorpayKeySecret : existingM?.razorpayKeySecret
      if (!effectiveKeyId || !effectiveKeyId.trim() || !effectiveSecret || !effectiveSecret.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Razorpay Key ID and Key Secret are not configured for this merchant. Please provide both Razorpay credentials.',
        })
      }
    }

    if (req.body.kioskVariant !== undefined || req.body.variant !== undefined) {
      const v = req.body.kioskVariant !== undefined ? req.body.kioskVariant : req.body.variant
      updates.kioskVariant = String(v).toLowerCase().includes('lite') ? 'lite' : 'pro'
    }

    // Status & Block updates
    if (isBlocked !== undefined) {
      updates.isBlocked = Boolean(isBlocked)
      if (isBlocked) updates.status = 'BLOCKED'
      else if (updates.status === 'BLOCKED') updates.status = 'ACTIVE'
    }
    if (status !== undefined) {
      updates.status = status
      if (status === 'BLOCKED') updates.isBlocked = true
      else if (status === 'ACTIVE') updates.isBlocked = false
    }
    if (req.body.requirePasswordChange !== undefined) {
      updates.requirePasswordChange = Boolean(req.body.requirePasswordChange)
    }

    let updatedDoc: any = null

    if (isDbConnected()) {
      updatedDoc = await Merchant.findOneAndUpdate(
        { $or: [{ merchantId: id }, { kioskId: id }] },
        { $set: updates },
        { new: true }
      ).lean()
    }

    // Also update in-memory fallback
    const fallbackIdx = fallbackMerchants.findIndex(
      (m: any) => m.merchantId === id || m.kioskId === id
    )
    if (fallbackIdx >= 0) {
      fallbackMerchants[fallbackIdx] = { ...fallbackMerchants[fallbackIdx], ...updates }
      if (!updatedDoc) updatedDoc = fallbackMerchants[fallbackIdx]
    }

    if (!updatedDoc) {
      return res.status(404).json({ success: false, error: `Merchant with ID ${id} not found.` })
    }

    if (updates.kioskPhotoUrl) {
      const targetKioskId = updatedDoc.kioskId || id
      if (isDbConnected()) {
        await Kiosk.findOneAndUpdate(
          { kioskId: targetKioskId },
          { $set: { kioskPhotoUrl: updates.kioskPhotoUrl } }
        )
      }
      const fbKiosk = fallbackKiosks.find((k) => (k.kioskId || k.id) === targetKioskId)
      if (fbKiosk) {
        fbKiosk.kioskPhotoUrl = updates.kioskPhotoUrl
      }
    }

    if (updates.kioskVariant) {
      const targetKioskId = updatedDoc.kioskId || id
      if (isDbConnected()) {
        await Kiosk.findOneAndUpdate(
          { kioskId: targetKioskId },
          { $set: { kioskVariant: updates.kioskVariant } }
        )
      }
      const fbKiosk = fallbackKiosks.find((k) => (k.kioskId || k.id) === targetKioskId)
      if (fbKiosk) {
        fbKiosk.kioskVariant = updates.kioskVariant
      }
    }

    if (updates.isBlocked !== undefined || updates.status !== undefined) {
      const isNowBlocked = Boolean(updatedDoc.isBlocked || updatedDoc.status === 'BLOCKED')
      await syncMerchantHardwareStatus(updatedDoc.merchantId || id, updatedDoc.kioskId, isNowBlocked)
    }

    await cachePurgePattern('admin:*')
    await cachePurgePattern('merchant:*')
    await cachePurgePattern('kiosks:*')
    await cachePurgePattern('print:*')

    res.json({
      success: true,
      message: 'Merchant profile updated successfully.',
      data: updatedDoc,
    })
  } catch (error: any) {
    console.error('Error updating merchant:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Synchronizes hardware terminal and printer status when merchant is blocked or unblocked.
 * If blocked: all assigned kiosks, printers, and servers are forced OFFLINE.
 * If unblocked: kiosks and printers are restored to ONLINE / READY.
 */
async function syncMerchantHardwareStatus(merchantId: string, kioskId: string, isBlocked: boolean) {
  const kioskStatus = isBlocked ? 'OFFLINE' : 'ONLINE'
  const printerStatus = isBlocked ? 'OFFLINE' : 'READY'

  if (isDbConnected()) {
    try {
      const orConditions: any[] = []
      if (kioskId) orConditions.push({ kioskId })
      if (merchantId) orConditions.push({ merchantId })

      if (orConditions.length > 0) {
        await Kiosk.updateMany(
          { $or: orConditions },
          {
            $set: {
              status: kioskStatus,
              printerStatus,
              ...(isBlocked ? { paperLevel: 0, tonerLevel: 0 } : {}),
            },
          }
        )
      }
    } catch (err) {
      console.error('Failed to sync kiosk hardware status for merchant:', err)
    }
  }

  // Update in-memory fallback kiosks
  fallbackKiosks.forEach((k: any) => {
    if ((kioskId && (k.kioskId === kioskId || k.id === kioskId)) || (merchantId && k.merchantId === merchantId)) {
      k.status = kioskStatus
      k.printerStatus = printerStatus
      if (isBlocked) {
        k.paperLevel = 0
        k.tonerLevel = 0
      }
    }
  })
}

// POST /api/admin/merchants/:id/block — Block / suspend partner account and offline all hardware
adminRouter.post('/merchants/:id/block', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    let merchantDoc: any = null

    if (isDbConnected()) {
      merchantDoc = await Merchant.findOneAndUpdate(
        { $or: [{ merchantId: id }, { kioskId: id }] },
        { $set: { isBlocked: true, status: 'BLOCKED' } },
        { new: true }
      ).lean()
    }

    const fallbackIdx = fallbackMerchants.findIndex(
      (m: any) => m.merchantId === id || m.kioskId === id
    )
    if (fallbackIdx >= 0) {
      fallbackMerchants[fallbackIdx].isBlocked = true
      fallbackMerchants[fallbackIdx].status = 'BLOCKED'
      if (!merchantDoc) merchantDoc = fallbackMerchants[fallbackIdx]
    }

    const targetKioskId = merchantDoc?.kioskId || id
    const targetMerchantId = merchantDoc?.merchantId || id

    // Take all assigned printers and server terminals OFFLINE
    await syncMerchantHardwareStatus(targetMerchantId, targetKioskId, true)

    await cachePurgePattern('admin:*')
    await cachePurgePattern('merchant:*')
    await cachePurgePattern('kiosks:*')
    await cachePurgePattern('print:*')

    res.json({
      success: true,
      message: `Merchant partner ${id} has been blocked. All assigned printers and terminal servers are now OFFLINE.`,
      isBlocked: true,
      status: 'BLOCKED',
      kioskStatus: 'OFFLINE',
      printerStatus: 'OFFLINE',
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/merchants/:id/unblock — Unblock / restore partner account and bring hardware back online
adminRouter.post('/merchants/:id/unblock', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    let merchantDoc: any = null

    if (isDbConnected()) {
      merchantDoc = await Merchant.findOneAndUpdate(
        { $or: [{ merchantId: id }, { kioskId: id }] },
        { $set: { isBlocked: false, status: 'ACTIVE' } },
        { new: true }
      ).lean()
    }

    const fallbackIdx = fallbackMerchants.findIndex(
      (m: any) => m.merchantId === id || m.kioskId === id
    )
    if (fallbackIdx >= 0) {
      fallbackMerchants[fallbackIdx].isBlocked = false
      fallbackMerchants[fallbackIdx].status = 'ACTIVE'
      if (!merchantDoc) merchantDoc = fallbackMerchants[fallbackIdx]
    }

    const targetKioskId = merchantDoc?.kioskId || id
    const targetMerchantId = merchantDoc?.merchantId || id

    // Restore hardware terminal to ONLINE and printer to READY
    await syncMerchantHardwareStatus(targetMerchantId, targetKioskId, false)

    await cachePurgePattern('admin:*')
    await cachePurgePattern('merchant:*')
    await cachePurgePattern('kiosks:*')
    await cachePurgePattern('print:*')

    res.json({
      success: true,
      message: `Merchant partner ${id} has been unblocked and restored to ACTIVE status.`,
      isBlocked: false,
      status: 'ACTIVE',
      kioskStatus: 'ONLINE',
      printerStatus: 'READY',
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// DELETE /api/admin/merchants/:id — Delete partner record
adminRouter.delete('/merchants/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    if (isDbConnected()) {
      await Merchant.findOneAndDelete({ $or: [{ merchantId: id }, { kioskId: id }] })
    }

    const fallbackIdx = fallbackMerchants.findIndex(
      (m: any) => m.merchantId === id || m.kioskId === id
    )
    if (fallbackIdx >= 0) {
      fallbackMerchants.splice(fallbackIdx, 1)
    }

    await cachePurgePattern('admin:*')
    await cachePurgePattern('merchant:*')

    res.json({ success: true, message: `Merchant partner ${id} deleted.` })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/admin/merchants/:id/provision-kit — Retrieve hardware secret key & .env for merchant
adminRouter.get('/merchants/:id/provision-kit', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    let merchant: any = null
    if (isDbConnected()) {
      merchant = await Merchant.findOne({ $or: [{ merchantId: id }, { kioskId: id }] })
    } else {
      merchant = fallbackMerchants.find((m) => m.merchantId === id || m.kioskId === id)
    }

    if (!merchant) {
      return res.status(404).json({ success: false, error: `Merchant '${id}' not found.` })
    }

    const kioskId = merchant.kioskId || 'PB-001'
    let kiosk: any = null
    if (isDbConnected()) {
      kiosk = await Kiosk.findOne({ kioskId })
    } else {
      kiosk = fallbackKiosks.find((k) => (k.kioskId || k.id) === kioskId)
    }

    if (!kiosk) {
      return res.status(404).json({ success: false, error: `Assigned kiosk '${kioskId}' not found for merchant.` })
    }

    if (!kiosk.deviceSecret) {
      kiosk.deviceSecret = generateKioskSecret()
      if (isDbConnected()) {
        await kiosk.save()
      }
    }

    const apiBaseUrl = resolveKioskApiBaseUrl(req)
    const envContent = generatePiEnvContent(kiosk, apiBaseUrl)
    const setupCommand = `python3 setup_station.py --id ${kiosk.kioskId} --secret ${kiosk.deviceSecret} --api ${apiBaseUrl}`

    return res.json({
      success: true,
      data: {
        kioskId: kiosk.kioskId,
        name: kiosk.name,
        deviceSecret: kiosk.deviceSecret,
        merchantId: merchant.merchantId,
        merchantName: merchant.name,
        storeName: merchant.storeName,
        apiBaseUrl,
        setupCommand,
        envContent,
      },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/merchants/:id/rotate-secret — Rotate device secret for merchant's station
adminRouter.post('/merchants/:id/rotate-secret', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    let merchant: any = null
    if (isDbConnected()) {
      merchant = await Merchant.findOne({ $or: [{ merchantId: id }, { kioskId: id }] })
    } else {
      merchant = fallbackMerchants.find((m) => m.merchantId === id || m.kioskId === id)
    }

    if (!merchant) {
      return res.status(404).json({ success: false, error: `Merchant '${id}' not found.` })
    }

    const kioskId = merchant.kioskId || 'PB-001'
    let kiosk: any = null
    if (isDbConnected()) {
      kiosk = await Kiosk.findOne({ kioskId })
    } else {
      kiosk = fallbackKiosks.find((k) => (k.kioskId || k.id) === kioskId)
    }

    if (!kiosk) {
      return res.status(404).json({ success: false, error: `Assigned kiosk '${kioskId}' not found.` })
    }

    const newSecret = generateKioskSecret()
    kiosk.deviceSecret = newSecret
    if (isDbConnected()) {
      await kiosk.save()
    }

    const apiBaseUrl = resolveKioskApiBaseUrl(req)
    const envContent = generatePiEnvContent(kiosk, apiBaseUrl)
    const setupCommand = `python3 setup_station.py --id ${kiosk.kioskId} --secret ${newSecret} --api ${apiBaseUrl}`

    return res.json({
      success: true,
      message: `Cryptographic key for merchant ${merchant.name} (${kiosk.kioskId}) rotated successfully. Update the Raspberry Pi .env file.`,
      data: {
        kioskId: kiosk.kioskId,
        name: kiosk.name,
        deviceSecret: newSecret,
        merchantId: merchant.merchantId,
        merchantName: merchant.name,
        storeName: merchant.storeName,
        apiBaseUrl,
        setupCommand,
        envContent,
      },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/admin/pricing — Decentralized fleet pricing audit (Admin cannot set fixed prices)
adminRouter.get('/pricing', async (_req: Request, res: Response) => {
  try {
    let fleetPricing: any[] = []
    if (isDbConnected()) {
      const kiosks = await Kiosk.find().sort({ kioskId: 1 }).lean()
      const merchants = await Merchant.find().lean()
      fleetPricing = kiosks.map((k) => {
        const m = merchants.find((item) => item.kioskId === k.kioskId)
        return {
          kioskId: k.kioskId,
          kioskName: k.name,
          location: k.location,
          merchantId: m?.merchantId || k.merchantId || 'M-001',
          merchantName: m?.name || 'Store Merchant Partner',
          storeName: m?.storeName || k.name,
          pricing: k.pricing || m?.pricing || { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0 },
          status: k.status,
          autonomous: true,
        }
      })
    }
    if (fleetPricing.length === 0) {
      fleetPricing = fallbackKiosks.map((k) => {
        const m = fallbackMerchants.find((item) => item.kioskId === k.kioskId)
        return {
          kioskId: k.kioskId,
          kioskName: k.name,
          location: k.location,
          merchantId: m?.merchantId || k.merchantId || 'M-001',
          merchantName: m?.name || 'Campus Print Desk Partner',
          storeName: m?.storeName || k.name,
          pricing: k.pricing || { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0 },
          status: k.status,
          autonomous: true,
        }
      })
    }
    res.json({
      success: true,
      decentralized: true,
      policy: 'PrintBooth operates on a decentralized pricing model. Platform administrators cannot enforce fixed prices; each merchant sets their own rates autonomously.',
      data: fleetPricing,
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// PUT /api/admin/pricing/:id — Fixed pricing is disabled by design
adminRouter.put('/pricing/:id', async (_req: Request, res: Response) => {
  return res.status(403).json({
    success: false,
    error: 'Fixed pricing disabled: Platform administrators cannot enforce fixed or global pricing on machines. Pricing for mono/color prints is controlled autonomously by each merchant partner.',
    decentralizedPricing: true,
  })
})

// ──────── Admin Broadcast & Merchant Notifications ────────

// POST /api/admin/notifications — Send notification to ALL merchants OR a separate merchant
adminRouter.post('/notifications', async (req: Request, res: Response) => {
  try {
    const { title, message, type = 'INFO', target = 'ALL', targetMerchantId, targetMerchantName, targetKioskId } = req.body
    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'Title and message are required' })
    }

    const notifId = `NOTIF-${Date.now().toString(36).toUpperCase()}`
    const notifObj = {
      notificationId: notifId,
      title: String(title).trim(),
      message: String(message).trim(),
      type: type || 'INFO',
      target: target || 'ALL',
      targetMerchantId: target === 'ALL' ? undefined : (targetMerchantId || target),
      targetMerchantName: targetMerchantName || (target === 'ALL' ? 'All Merchants' : undefined),
      targetKioskId: targetKioskId || undefined,
      createdBy: 'Platform Administrator',
      readBy: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    fallbackNotifications.unshift(notifObj)

    if (isDbConnected()) {
      try {
        await Notification.create(notifObj)
      } catch (err) {
        console.error('Failed to persist notification in DB:', err)
      }
    }

    await cachePurgePattern('merchant:notif:*').catch(() => {})

    res.json({
      success: true,
      message:
        target === 'ALL'
          ? 'Broadcast notification dispatched to all merchants!'
          : `Targeted notification delivered to merchant ${targetMerchantName || targetMerchantId || target}`,
      data: notifObj,
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/admin/notifications — List notifications sent by admin
adminRouter.get('/notifications', async (_req: Request, res: Response) => {
  try {
    if (isDbConnected()) {
      const docs = await Notification.find().sort({ createdAt: -1 }).limit(100).lean()
      if (docs && docs.length > 0) {
        return res.json({ success: true, data: docs })
      }
    }
    res.json({ success: true, data: fallbackNotifications })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/admin/notifications/:id — Get details of a single broadcast
adminRouter.get('/notifications/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (isDbConnected()) {
      const doc = await Notification.findOne({ $or: [{ notificationId: id }, { _id: id }] }).lean()
      if (doc) return res.json({ success: true, data: doc })
    }
    const fallback = fallbackNotifications.find((n) => n.notificationId === id || n._id === id)
    if (fallback) return res.json({ success: true, data: fallback })
    return res.status(404).json({ success: false, error: 'Broadcast not found' })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// PUT /api/admin/notifications/:id — Update an existing broadcast
adminRouter.put('/notifications/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { title, message, type, target, targetMerchantId, targetMerchantName, targetKioskId } = req.body

    const updateFields: any = {
      updatedAt: new Date(),
    }
    if (title !== undefined) updateFields.title = String(title).trim()
    if (message !== undefined) updateFields.message = String(message).trim()
    if (type !== undefined) updateFields.type = type
    if (target !== undefined) {
      updateFields.target = target
      updateFields.targetMerchantId = target === 'ALL' ? undefined : (targetMerchantId || target)
      updateFields.targetMerchantName = targetMerchantName || (target === 'ALL' ? 'All Merchants' : undefined)
      updateFields.targetKioskId = targetKioskId || undefined
    }

    let updatedDoc: any = null

    if (isDbConnected()) {
      try {
        updatedDoc = await Notification.findOneAndUpdate(
          { $or: [{ notificationId: id }, { _id: id }] },
          { $set: updateFields },
          { new: true }
        ).lean()
      } catch (err) {
        console.error('Failed to update notification in DB:', err)
      }
    }

    const fallbackIndex = fallbackNotifications.findIndex((n) => n.notificationId === id || n._id === id)
    if (fallbackIndex !== -1) {
      fallbackNotifications[fallbackIndex] = {
        ...fallbackNotifications[fallbackIndex],
        ...updateFields,
      }
      if (!updatedDoc) updatedDoc = fallbackNotifications[fallbackIndex]
    }

    if (!updatedDoc) {
      return res.status(404).json({ success: false, error: 'Broadcast not found' })
    }

    await cachePurgePattern('merchant:notif:*').catch(() => {})
    await cachePurgePattern('admin:*').catch(() => {})

    res.json({
      success: true,
      message: 'Broadcast updated successfully',
      data: updatedDoc,
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// DELETE /api/admin/notifications/:id — Delete a broadcast
adminRouter.delete('/notifications/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (isDbConnected()) {
      try {
        await Notification.findOneAndDelete({ $or: [{ notificationId: id }, { _id: id }] })
      } catch (err) {
        console.error('Failed to delete notification from DB:', err)
      }
    }

    const fallbackIndex = fallbackNotifications.findIndex((n) => n.notificationId === id || n._id === id)
    if (fallbackIndex !== -1) {
      fallbackNotifications.splice(fallbackIndex, 1)
    }

    await cachePurgePattern('merchant:notif:*').catch(() => {})
    await cachePurgePattern('admin:*').catch(() => {})

    res.json({
      success: true,
      message: 'Broadcast deleted successfully',
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// ──────── Fleet Maintenance Controls ────────

// POST /api/admin/kiosks/maintenance/bulk — Bulk put all machines into maintenance or bring all online
adminRouter.post('/kiosks/maintenance/bulk', async (req: Request, res: Response) => {
  try {
    const { action } = req.body // 'MAINTENANCE' | 'ONLINE'
    const targetStatus = (action || '').toUpperCase() === 'MAINTENANCE' ? 'MAINTENANCE' : 'ONLINE'

    fallbackKiosks.forEach((k) => {
      k.status = targetStatus
    })

    if (isDbConnected()) {
      await Kiosk.updateMany({}, { $set: { status: targetStatus } })
    }

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

// PATCH /api/admin/kiosks/:id/status — Toggle a separate machine into maintenance, online, or offline
adminRouter.patch('/kiosks/:id/status', async (req: Request, res: Response) => {
  try {
    const cleanId = (req.params.id || '').trim()
    const { status } = req.body
    const cleanStatus = (status || 'ONLINE').toUpperCase()

    const fb = fallbackKiosks.find((k) => (k.kioskId || k.id) === cleanId)
    if (fb) {
      fb.status = cleanStatus
    }

    let updatedDoc: any = null
    if (isDbConnected()) {
      updatedDoc = await Kiosk.findOneAndUpdate(
        { kioskId: cleanId },
        { $set: { status: cleanStatus } },
        { new: true }
      )
    }

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
})

// GET /api/admin/redis — Live cache & fast processing engine telemetry
adminRouter.get('/redis', async (_req: Request, res: Response) => {
  try {
    const stats = await getCacheStats()
    res.json({ success: true, data: stats })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/redis/flush — Flush cached application data
adminRouter.post('/redis/flush', async (_req: Request, res: Response) => {
  try {
    const purged = await cachePurgePattern('*')
    res.json({ success: true, message: `Successfully flushed ${purged} cached keys from Redis engine` })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// ═══════════════════════════════════════════════════════════════════
// ── ADMIN & USER MANAGEMENT ENDPOINTS ──
// ═══════════════════════════════════════════════════════════════════

// GET /api/admin/users — Retrieve all administrators, merchant partners, and campus users
adminRouter.get('/users', async (_req: Request, res: Response) => {
  try {
    let admins: any[] = []
    let merchants: any[] = []
    let orders: any[] = []

    if (isDbConnected()) {
      ;[admins, merchants, orders] = await Promise.all([
        AdminUser.find().sort({ createdAt: -1 }).lean(),
        Merchant.find().sort({ createdAt: -1 }).lean(),
        Order.find().sort({ createdAt: -1 }).lean(),
      ])
    }

    if (!admins || admins.length === 0) {
      admins = [...fallbackAdmins]
    }
    if (!merchants || merchants.length === 0) {
      merchants = [...fallbackMerchants]
    }

    // Aggregate unique customer directory from orders or seed users
    const customerMap = new Map<string, any>()
    for (const ord of orders) {
      const phone = (ord.customerPhone || '').trim()
      const email = (ord.customerEmail || '').trim()
      const key = phone || email || ord.orderNumber || ord.id
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          userId: 'CUST-' + key.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase(),
          identifier: phone || email || 'Campus Student',
          phone,
          email,
          totalOrders: 1,
          totalSpent: ord.amount || 0,
          totalPages: ord.pages || 1,
          lastActive: ord.createdAt || new Date().toISOString(),
          role: 'CUSTOMER',
          status: 'ACTIVE',
        })
      } else {
        const existing = customerMap.get(key)
        existing.totalOrders += 1
        existing.totalSpent += (ord.amount || 0)
        existing.totalPages += (ord.pages || 1)
        if (new Date(ord.createdAt) > new Date(existing.lastActive)) {
          existing.lastActive = ord.createdAt
        }
      }
    }

    const customers = Array.from(customerMap.values())

    const safeAdmins = admins.map((a: any) => ({
      adminId: a.adminId || a._id,
      _id: a._id,
      name: a.name,
      email: a.email,
      username: a.username,
      role: a.role || 'OPERATIONS',
      status: a.status || 'ACTIVE',
      phone: a.phone || '',
      notes: a.notes || '',
      isRoot: Boolean(a.isRoot || a.email === 'admin@printbooth.in' || a.username === 'admin'),
      lastLogin: a.lastLogin,
      createdAt: a.createdAt,
    }))

    const safeMerchants = merchants.map((m: any) => ({
      merchantId: m.merchantId || m._id,
      _id: m._id,
      name: m.name,
      storeName: m.storeName,
      email: m.email,
      username: m.username,
      phone: m.phone,
      kioskId: m.kioskId,
      status: m.isBlocked ? 'BLOCKED' : (m.status || 'ACTIVE'),
      totalEarnings: m.totalEarnings || 0,
      createdAt: m.createdAt,
    }))

    const stats = {
      totalAdmins: safeAdmins.length,
      activeAdmins: safeAdmins.filter((a) => a.status === 'ACTIVE').length,
      blockedAdmins: safeAdmins.filter((a) => a.status === 'BLOCKED').length,
      totalMerchants: safeMerchants.length,
      totalCustomers: customers.length,
      totalUsers: safeAdmins.length + safeMerchants.length + customers.length,
    }

    res.json({
      success: true,
      data: {
        admins: safeAdmins,
        merchants: safeMerchants,
        customers,
        stats,
      },
    })
  } catch (error: any) {
    console.error('[Admin Users GET error]:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/users — Create a new Administrator account
adminRouter.post('/users', async (req: Request, res: Response) => {
  try {
    const { name, email, username, password, role, phone, notes } = req.body

    const cleanName = (name || '').trim()
    const cleanEmail = (email || '').trim().toLowerCase()
    const cleanUsername = (username || '').trim().toLowerCase()
    const cleanPassword = (password || '').trim() || 'admin123'
    const cleanRole = ['SUPERADMIN', 'OPERATIONS', 'SUPPORT'].includes(role) ? role : 'OPERATIONS'
    const cleanPhone = (phone || '').trim()
    const cleanNotes = (notes || '').trim()

    if (!cleanName || !cleanEmail || !cleanUsername) {
      return res.status(400).json({ success: false, error: 'Full name, email address, and username are required.' })
    }

    // Check duplicate in DB or fallback
    let existing: any = null
    if (isDbConnected()) {
      existing = await AdminUser.findOne({
        $or: [{ email: cleanEmail }, { username: cleanUsername }],
      }).lean()
    } else {
      existing = fallbackAdmins.find(
        (a: any) =>
          a.email.toLowerCase() === cleanEmail ||
          a.username.toLowerCase() === cleanUsername
      )
    }

    if (existing) {
      return res.status(409).json({ success: false, error: 'An administrator with this email or username already exists.' })
    }

    const adminId = 'ADM-' + Math.floor(1000 + Math.random() * 9000)

    const newAdminData = {
      adminId,
      name: cleanName,
      email: cleanEmail,
      username: cleanUsername,
      password: cleanPassword,
      role: cleanRole,
      status: 'ACTIVE' as const,
      phone: cleanPhone,
      notes: cleanNotes,
      isRoot: false,
      lastLogin: new Date(),
    }

    let createdDoc: any = null
    if (isDbConnected()) {
      createdDoc = await AdminUser.create(newAdminData)
    }

    fallbackAdmins.unshift({
      ...newAdminData,
      _id: createdDoc?._id || adminId,
      createdAt: new Date().toISOString(),
    })

    res.status(201).json({
      success: true,
      message: 'Administrator account created successfully.',
      data: {
        adminId,
        name: cleanName,
        email: cleanEmail,
        username: cleanUsername,
        role: cleanRole,
        status: 'ACTIVE',
        phone: cleanPhone,
        notes: cleanNotes,
        isRoot: false,
        createdAt: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    console.error('[Create Admin error]:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// PUT /api/admin/users/:id — Update Administrator account details
adminRouter.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id
    const { name, email, username, role, phone, notes } = req.body

    let admin: any = null
    if (isDbConnected()) {
      admin = await AdminUser.findOne({
        $or: [{ adminId: rawId }, { _id: rawId.length === 24 ? rawId : null }],
      })
    }

    const fbIndex = fallbackAdmins.findIndex(
      (a: any) => a.adminId === rawId || a._id === rawId || a.email === rawId || a.username === rawId
    )

    if (!admin && fbIndex === -1) {
      return res.status(404).json({ success: false, error: 'Administrator not found.' })
    }

    const isRoot = admin?.isRoot || (fbIndex !== -1 && fallbackAdmins[fbIndex].isRoot) || false

    const updates: any = {}
    if (name) updates.name = name.trim()
    if (email) updates.email = email.trim().toLowerCase()
    if (username) updates.username = username.trim().toLowerCase()
    if (phone !== undefined) updates.phone = phone.trim()
    if (notes !== undefined) updates.notes = notes.trim()
    if (role && !isRoot) {
      updates.role = ['SUPERADMIN', 'OPERATIONS', 'SUPPORT'].includes(role) ? role : 'OPERATIONS'
    }

    if (admin) {
      Object.assign(admin, updates)
      await admin.save()
    }

    if (fbIndex !== -1) {
      fallbackAdmins[fbIndex] = { ...fallbackAdmins[fbIndex], ...updates }
    }

    res.json({
      success: true,
      message: 'Administrator updated successfully.',
      data: admin?.toObject() || fallbackAdmins[fbIndex],
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/users/:id/change-password — Update Administrator password
adminRouter.post('/users/:id/change-password', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id
    const { newPassword } = req.body

    const cleanPass = (newPassword || '').trim()
    if (!cleanPass || cleanPass.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters long.' })
    }

    let admin: any = null
    if (isDbConnected()) {
      admin = await AdminUser.findOne({
        $or: [{ adminId: rawId }, { _id: rawId.length === 24 ? rawId : null }],
      })
      if (admin) {
        admin.password = cleanPass
        await admin.save()
      }
    }

    const fbIndex = fallbackAdmins.findIndex(
      (a: any) => a.adminId === rawId || a._id === rawId || a.email === rawId || a.username === rawId
    )
    if (fbIndex !== -1) {
      fallbackAdmins[fbIndex].password = cleanPass
    }

    if (!admin && fbIndex === -1) {
      return res.status(404).json({ success: false, error: 'Administrator not found.' })
    }

    res.json({
      success: true,
      message: 'Administrator password updated successfully.',
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/users/:id/block — Block / Suspend Administrator
adminRouter.post('/users/:id/block', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id

    let admin: any = null
    if (isDbConnected()) {
      admin = await AdminUser.findOne({
        $or: [{ adminId: rawId }, { _id: rawId.length === 24 ? rawId : null }],
      })
    }

    const fbIndex = fallbackAdmins.findIndex(
      (a: any) => a.adminId === rawId || a._id === rawId || a.email === rawId || a.username === rawId
    )

    const isRoot = admin?.isRoot || (fbIndex !== -1 && fallbackAdmins[fbIndex].isRoot) || rawId === 'ADM-001'
    if (isRoot) {
      return res.status(403).json({ success: false, error: 'Primary root platform administrator cannot be blocked.' })
    }

    if (admin) {
      admin.status = 'BLOCKED'
      await admin.save()
    }
    if (fbIndex !== -1) {
      fallbackAdmins[fbIndex].status = 'BLOCKED'
    }

    if (!admin && fbIndex === -1) {
      return res.status(404).json({ success: false, error: 'Administrator not found.' })
    }

    res.json({
      success: true,
      message: 'Administrator account suspended.',
      data: { status: 'BLOCKED' },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/admin/users/:id/unblock — Reactivate Administrator
adminRouter.post('/users/:id/unblock', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id

    let admin: any = null
    if (isDbConnected()) {
      admin = await AdminUser.findOne({
        $or: [{ adminId: rawId }, { _id: rawId.length === 24 ? rawId : null }],
      })
      if (admin) {
        admin.status = 'ACTIVE'
        await admin.save()
      }
    }

    const fbIndex = fallbackAdmins.findIndex(
      (a: any) => a.adminId === rawId || a._id === rawId || a.email === rawId || a.username === rawId
    )
    if (fbIndex !== -1) {
      fallbackAdmins[fbIndex].status = 'ACTIVE'
    }

    if (!admin && fbIndex === -1) {
      return res.status(404).json({ success: false, error: 'Administrator not found.' })
    }

    res.json({
      success: true,
      message: 'Administrator account reactivated.',
      data: { status: 'ACTIVE' },
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// DELETE /api/admin/users/:id — Delete Administrator
adminRouter.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id

    let admin: any = null
    if (isDbConnected()) {
      admin = await AdminUser.findOne({
        $or: [{ adminId: rawId }, { _id: rawId.length === 24 ? rawId : null }],
      })
    }

    const fbIndex = fallbackAdmins.findIndex(
      (a: any) => a.adminId === rawId || a._id === rawId || a.email === rawId || a.username === rawId
    )

    const isRoot = admin?.isRoot || (fbIndex !== -1 && fallbackAdmins[fbIndex].isRoot) || rawId === 'ADM-001'
    if (isRoot) {
      return res.status(403).json({ success: false, error: 'Primary root platform administrator cannot be deleted.' })
    }

    if (admin) {
      await AdminUser.findByIdAndDelete(admin._id)
    }
    if (fbIndex !== -1) {
      fallbackAdmins.splice(fbIndex, 1)
    }

    if (!admin && fbIndex === -1) {
      return res.status(404).json({ success: false, error: 'Administrator not found.' })
    }

    res.json({
      success: true,
      message: 'Administrator deleted successfully.',
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

