import { connectDB } from './db.js'
import { Kiosk } from './models/Kiosk.js'
import { Order } from './models/Order.js'
import { Merchant } from './models/Merchant.js'
import { Alert } from './models/Alert.js'
import { PricingRule } from './models/Pricing.js'
import { Activity } from './models/Activity.js'
import { KioskHardware } from './models/Hardware.js'

export async function seedDatabase() {
  const db = await connectDB()
  if (!db) {
    console.warn('[Seed] Skipped seed: MongoDB not connected.')
    return
  }

  try {
    const kioskCount = await Kiosk.countDocuments()
    // Always purge non-canonical kiosks if legacy seed existed
    await Kiosk.deleteMany({ kioskId: { $ne: 'PB-001' } })
    await Merchant.deleteMany({ merchantId: { $ne: 'M-001' } })

    const existingTestKiosk = await Kiosk.findOne({ kioskId: 'PB-001' })
    const isTestMode = (process.env.PRINT_MODE || '').toLowerCase() === 'test' || process.env.MOCK_PRINTER === 'true'

    if (existingTestKiosk) {
      console.log(`[Seed] Database contains canonical Test Station PB-001 (TestMode: ${isTestMode}). Ensuring clean baseline...`)
      const secretToSet = existingTestKiosk.deviceSecret || 'pb_sec_4b0894a6cc6ade322aa4f01151fbef9d35f79b18b48d7a7b'
      await Kiosk.updateOne({ kioskId: 'PB-001' }, {
        $set: {
          deviceSecret: secretToSet,
          status: isTestMode ? 'ONLINE' : 'OFFLINE',
          printerStatus: isTestMode ? 'READY' : 'OFFLINE',
          paperLevel: isTestMode ? 100 : (existingTestKiosk.paperLevel || 0),
          tonerLevel: isTestMode ? 100 : (existingTestKiosk.tonerLevel || 0),
          queueCount: 0,
          todayPages: 0,
          todayRevenue: 0,
          totalRevenue: 0,
          merchantError: null,
          merchantRecommendation: null,
          merchantErrorAt: null,
          lastSeenAt: isTestMode ? new Date() : existingTestKiosk.lastSeenAt,
          isTestMode,
        }
      })
      await Merchant.updateOne({ merchantId: 'M-001' }, {
        $set: {
          commissionRate: 0.0,
          todayEarnings: 0,
          wtdEarnings: 0,
          mtdEarnings: 0,
          totalEarnings: 0,
        }
      })
      return
    }

    console.log('[Seed] Seeding MongoDB with canonical Test Station...')

    // 1. Kiosk Fleet (Single Test Station)
    const kiosksData = [
      {
        kioskId: 'PB-001',
        name: 'PrintBooth — Test Station',
        location: 'Testing Lab / Local Station',
        address: 'Development & Testing Environment',
        lat: 18.5204,
        lng: 73.8567,
        status: 'OFFLINE',
        printerStatus: 'OFFLINE',
        printerModel: 'Brother DCP-T420W Printer USB',
        paperLevel: 0,
        tonerLevel: 0,
        queueCount: 0,
        todayPages: 0,
        todayRevenue: 0,
        totalRevenue: 0,
        merchantId: 'M-001',
      },
    ]

    await Kiosk.insertMany(kiosksData)
    console.log(`[Seed] Inserted ${kiosksData.length} canonical kiosk.`)

    // 2. Merchants (Single Test Merchant)
    const merchantsData = [
      {
        merchantId: 'M-001',
        name: 'Test Merchant',
        storeName: 'Test Print Hub',
        email: 'test.merchant@printbooth.in',
        phone: '+91 99999 99999',
        kioskId: 'PB-001',
        commissionRate: 0.0,
        todayEarnings: 0,
        wtdEarnings: 0,
        mtdEarnings: 0,
        totalEarnings: 0,
        bankName: 'State Bank of India',
        bankAccountLast4: '0001',
        kioskPhotoUrl: 'https://images.unsplash.com/photo-1588702547919-26089e690ecc',
        autoPayoutEnabled: true,
        payoutSchedule: 'Instant Direct UPI / Friday Settlement',
        status: 'ACTIVE',
      },
    ]

    await Merchant.insertMany(merchantsData)
    console.log(`[Seed] Inserted ${merchantsData.length} canonical merchant.`)

    // 3. Pricing Rules (0% Platform Cut)
    const pricingData = [
      {
        ruleId: 'PR-001',
        paperSize: 'A4',
        colourMode: 'BW',
        duplex: 'SINGLE',
        pricePerPage: 2.0,
        merchantCutPercentage: 0,
        active: true,
      },
      {
        ruleId: 'PR-002',
        paperSize: 'A4',
        colourMode: 'BW',
        duplex: 'DOUBLE',
        pricePerPage: 3.5,
        merchantCutPercentage: 0,
        active: true,
      },
      {
        ruleId: 'PR-003',
        paperSize: 'A4',
        colourMode: 'COLOUR',
        duplex: 'SINGLE',
        pricePerPage: 10.0,
        merchantCutPercentage: 0,
        active: true,
      },
      {
        ruleId: 'PR-004',
        paperSize: 'A4',
        colourMode: 'COLOUR',
        duplex: 'DOUBLE',
        pricePerPage: 18.0,
        merchantCutPercentage: 0,
        active: true,
      },
    ]

    await PricingRule.deleteMany({})
    await PricingRule.insertMany(pricingData)
    console.log(`[Seed] Inserted ${pricingData.length} pricing rules.`)

    // 4. Kiosk Hardware & Spooler State
    const hardwareData = [
      {
        kioskId: 'PB-001',
        systemStatus: 'OFFLINE',
        lastHeartbeat: new Date(),
        networkStatus: 'CONNECTED',
        signalStrength: 0,
        cups: {
          printerName: 'Brother DCP-T420W',
          driver: 'CUPS Linux Driver',
          state: 'stopped',
          isAcceptingJobs: false,
          queueLength: 0,
          rawStatus: 'OFFLINE',
          connected: false,
        },
        supplies: {
          paperTrayPct: 0,
          tonerBlackPct: 0,
          tonerCyanPct: 0,
          tonerMagentaPct: 0,
          tonerYellowPct: 0,
        },
        diagnostics: {
          cpuTempC: 0,
          memUsedPct: 0,
          diskFreeGb: 0,
          firmwareVersion: '',
        },
      },
    ]

    await KioskHardware.deleteMany({})
    await KioskHardware.insertMany(hardwareData)
    console.log(`[Seed] Inserted ${hardwareData.length} kiosk hardware record.`)

    console.log('[Seed] Seeding completed successfully!')
  } catch (error: any) {
    console.error('[Seed] Error seeding database:', error.message)
  }
}
