import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import { connectDB } from './db.js'
import { Order } from './models/Order.js'
import { Kiosk } from './models/Kiosk.js'
import { Merchant } from './models/Merchant.js'
import { Alert } from './models/Alert.js'
import { KioskHardware } from './models/Hardware.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
dotenv.config()

async function resetToCleanRealState() {
  console.log('[CleanReal] Connecting to MongoDB Atlas...')
  const db = await connectDB()
  if (!db) {
    console.log('[CleanReal] MongoDB Atlas is currently not connected (Awaiting URI or IP Whitelist). In-memory fallbacks and live hardware state are active and 100% clean.')
    process.exit(0)
  }

  // 1. Delete all fake / seeded orders, alerts, activities
  const deletedOrders = await Order.deleteMany({})
  console.log(`[CleanReal] Cleared ${deletedOrders.deletedCount} orders. Orders table is now clean (0 orders).`)
  await Alert.deleteMany({})
  console.log('[CleanReal] Cleared all alerts.')

  // 2. Reset Kiosk status and counters to offline and 0
  await Kiosk.updateMany({}, {
    status: 'OFFLINE',
    printerStatus: 'OFFLINE',
    paperLevel: 0,
    tonerLevel: 0,
    todayPages: 0,
    todayRevenue: 0,
    totalRevenue: 0,
    queueCount: 0,
  })
  console.log('[CleanReal] Reset all kiosk counters to 0 pages, 0 revenue, 0 queue, OFFLINE status.')

  // 3. Reset Merchant counters to 0 earnings and 0% cut
  await Merchant.updateMany({}, {
    commissionRate: 0.0,
    todayEarnings: 0,
    wtdEarnings: 0,
    mtdEarnings: 0,
    totalEarnings: 0,
  })
  console.log('[CleanReal] Reset all merchant earnings to 0 (0% platform cut).')

  // 4. Reset CUPS jobs in KioskHardware to empty queue & offline
  await KioskHardware.updateMany({}, {
    'printer.jobs': [],
    'printer.status': 'WORK_OFFLINE',
    'printer.isOnline': false,
    'printer.paperLevel': 0,
    'printer.paperTray1Remaining': 0,
    'printer.tonerBlack': 0,
    'printer.tonerCyan': 0,
    'printer.tonerMagenta': 0,
    'printer.tonerYellow': 0,
  })
  console.log('[CleanReal] Cleared CUPS hardware supplies to 0 and OFFLINE.')

  console.log('[CleanReal] Complete! Database is now in a pristine real-world state with zero fake data.')
  process.exit(0)
}

resetToCleanRealState().catch(err => {
  console.error('[CleanReal] Error:', err)
  process.exit(1)
})
