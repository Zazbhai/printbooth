import { connectDB } from './db.js'
import { Kiosk } from './models/Kiosk.js'
import { Merchant } from './models/Merchant.js'
import { getKioskPrintUrl } from './config.js'

async function cleanup() {
  const db = await connectDB()
  if (!db) {
    console.log('[Cleanup] MongoDB not reachable at this moment, skipping direct DB purge.')
    return
  }
  try {
    console.log('[Cleanup] Connected to MongoDB. Purging all fake kiosks...')
    const deleteKiosksRes = await Kiosk.deleteMany({ kioskId: { $ne: 'PB-001' } })
    console.log(`[Cleanup] Deleted ${deleteKiosksRes.deletedCount} non-test kiosks.`)

    // Upsert the single canonical Test Station
    await Kiosk.findOneAndUpdate(
      { kioskId: 'PB-001' },
      {
        kioskId: 'PB-001',
        name: 'PrintBooth — Test Station',
        location: 'Testing Lab / Local Station',
        address: 'Development & Testing Environment',
        status: 'ONLINE',
        printerStatus: 'READY',
        printerModel: 'Brother DCP-T420W Printer USB',
        paperLevel: 100,
        tonerLevel: 100,
        queueCount: 0,
        todayPages: 0,
        todayRevenue: 0,
        merchantId: 'M-001',
        qrCodeUrl: getKioskPrintUrl('PB-001'),
      },
      { upsert: true, new: true }
    )
    console.log('[Cleanup] Verified single canonical PB-001 (Test Station) in MongoDB.')

    // Purge fake merchants except M-001
    const deleteMerchantsRes = await Merchant.deleteMany({ merchantId: { $ne: 'M-001' } })
    console.log(`[Cleanup] Deleted ${deleteMerchantsRes.deletedCount} non-test merchants.`)

    await Merchant.findOneAndUpdate(
      { merchantId: 'M-001' },
      {
        merchantId: 'M-001',
        name: 'Test Merchant',
        storeName: 'Test Print Hub',
        email: 'test.merchant@printbooth.in',
        phone: '+91 99999 99999',
        kioskId: 'PB-001',
        address: 'Testing Lab / Local Station',
        status: 'ACTIVE',
        commissionRate: 0.18,
        qrCodeUrl: getKioskPrintUrl('PB-001'),
      },
      { upsert: true, new: true }
    )
    console.log('[Cleanup] Verified single canonical M-001 (Test Merchant) in MongoDB.')
  } catch (err: any) {
    console.error('[Cleanup] Error updating database:', err.message)
  }
}

cleanup().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
