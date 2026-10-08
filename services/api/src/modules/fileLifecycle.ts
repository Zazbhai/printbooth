import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Order } from '../models/Order.js'
import { isDbConnected } from '../db.js'
import { printJobs, usedPinsRegistry } from '../routes/print.js'
import { fallbackOrders } from '../fallbackData.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const RETENTION_MS = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

export const UPLOAD_DIR = path.resolve(__dirname, '../../../../scratch/print_uploads')
export const WS_UPLOADS_DIR = path.resolve(__dirname, '../../uploads/ws_temp')
export const API_UPLOADS_DIR = path.resolve(__dirname, '../../uploads')

/**
 * Checks whether an order's uploaded document has exceeded the 24-hour retention window.
 */
export function isOrderFileExpired(orderOrJob: {
  createdAt?: Date | string | number
  startedAt?: number
  fileExpiresAt?: Date | string | number
  fileDeleted?: boolean
  status?: string
}): boolean {
  if (!orderOrJob) return false
  if (orderOrJob.fileDeleted === true) return true
  if (orderOrJob.status === 'EXPIRED') return true

  const now = Date.now()

  if (orderOrJob.fileExpiresAt) {
    const expiresMs = new Date(orderOrJob.fileExpiresAt).getTime()
    if (!isNaN(expiresMs) && now >= expiresMs) {
      return true
    }
  }

  if (orderOrJob.createdAt) {
    const createdMs = new Date(orderOrJob.createdAt).getTime()
    if (!isNaN(createdMs) && (now - createdMs) >= RETENTION_MS) {
      return true
    }
  }

  if (orderOrJob.startedAt) {
    if ((now - orderOrJob.startedAt) >= RETENTION_MS) {
      return true
    }
  }

  return false
}

/**
 * Finds and permanently deletes all physical files on disk associated with an order,
 * clears memory / DB references, and marks the document as permanently deleted.
 */
export async function permanentlyDeleteOrderFiles(
  orderId: string,
  reason = 'PRINT_COMPLETED'
): Promise<{ deletedCount: number; files: string[] }> {
  if (!orderId) return { deletedCount: 0, files: [] }

  const filesToDelete = new Set<string>()

  // 1. Check in-memory job
  const job = printJobs.get(orderId)
  if (job?.filePath && fs.existsSync(job.filePath)) {
    filesToDelete.add(path.resolve(job.filePath))
  }

  // 2. Check Database record
  let dbOrder: any = null
  if (isDbConnected()) {
    try {
      dbOrder = await Order.findOne({ $or: [{ orderId }, { orderNumber: orderId }] })
      if (dbOrder?.fileUrl && fs.existsSync(dbOrder.fileUrl)) {
        filesToDelete.add(path.resolve(dbOrder.fileUrl))
      }
    } catch {}
  }

  // 3. Check fallback orders
  const fbOrder = fallbackOrders.find((o) => o.orderId === orderId || o.orderNumber === orderId)
  if (fbOrder?.fileUrl && fs.existsSync(fbOrder.fileUrl)) {
    filesToDelete.add(path.resolve(fbOrder.fileUrl))
  }

  // 4. Scan UPLOAD_DIR tree (e.g. scratch/print_uploads/PB-001/...) for matching order files
  try {
    if (fs.existsSync(UPLOAD_DIR)) {
      const scanDir = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            scanDir(fullPath)
          } else if (entry.isFile()) {
            // Match orderId prefix or substring in file name
            if (entry.name.includes(orderId)) {
              filesToDelete.add(fullPath)
            }
          }
        }
      }
      scanDir(UPLOAD_DIR)
    }
  } catch (err) {
    console.warn(`[File Lifecycle] Error scanning UPLOAD_DIR for order ${orderId}:`, err)
  }

  // 5. Scan WS_UPLOADS_DIR
  try {
    if (fs.existsSync(WS_UPLOADS_DIR)) {
      const entries = fs.readdirSync(WS_UPLOADS_DIR)
      for (const name of entries) {
        if (name.includes(orderId)) {
          filesToDelete.add(path.join(WS_UPLOADS_DIR, name))
        }
      }
    }
  } catch (err) {
    console.warn(`[File Lifecycle] Error scanning WS_UPLOADS_DIR for order ${orderId}:`, err)
  }

  // 6. Delete all identified physical files
  const deletedFiles: string[] = []
  for (const filePath of filesToDelete) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        deletedFiles.push(filePath)
        console.log(`[File Lifecycle] 🗑 Permanently deleted file for Order ${orderId} (${reason}): ${filePath}`)
      }
    } catch (unlinkErr: any) {
      console.error(`[File Lifecycle] ✗ Failed to delete file ${filePath}:`, unlinkErr.message)
    }
  }

  // 7. Mutate in-memory job state
  if (job) {
    job.filePath = ''
    ;(job as any).fileDeleted = true
    ;(job as any).fileDeletedAt = Date.now()
  }

  // 8. Mutate fallback order state
  if (fbOrder) {
    fbOrder.fileUrl = ''
    ;(fbOrder as any).fileDeleted = true
    ;(fbOrder as any).fileDeletedAt = new Date()
  }

  // 9. Persist deletion in MongoDB Order
  if (isDbConnected()) {
    try {
      await Order.updateMany(
        { $or: [{ orderId }, { orderNumber: orderId }] },
        {
          $set: {
            fileDeleted: true,
            fileDeletedAt: new Date(),
            fileUrl: '',
            isPinUsed: true,
          },
          $unset: {
            releasePin: 1,
            otp: 1,
            pickupCode: 1,
          },
        }
      )
    } catch (dbErr: any) {
      console.warn(`[File Lifecycle] Error updating DB for order ${orderId}:`, dbErr.message)
    }
  }

  return { deletedCount: deletedFiles.length, files: deletedFiles }
}

/**
 * Sweeps the file system for orphaned files older than 24 hours.
 */
export function purgeOrphanedDiskFilesOlderThan24Hours(): number {
  let purgedCount = 0
  const now = Date.now()

  const sweepDir = (dir: string) => {
    if (!fs.existsSync(dir)) return
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          sweepDir(fullPath)
        } else if (entry.isFile()) {
          try {
            const stats = fs.statSync(fullPath)
            const ageMs = now - stats.mtimeMs
            if (ageMs > RETENTION_MS) {
              fs.unlinkSync(fullPath)
              purgedCount++
              console.log(`[File Lifecycle] 🧹 Purged disk file exceeding 24h retention (${Math.round(ageMs / 3600000)}h old): ${entry.name}`)
            }
          } catch {}
        }
      }
    } catch (dirErr: any) {
      console.warn(`[File Lifecycle] Error sweeping directory ${dir}:`, dirErr.message)
    }
  }

  sweepDir(UPLOAD_DIR)
  sweepDir(WS_UPLOADS_DIR)

  return purgedCount
}

/**
 * Background daemon: Runs periodically (every 10 minutes) and sweeps
 * orders and disk files older than 24 hours.
 */
export function startFileRetentionCleanupDaemon(): NodeJS.Timeout {
  console.log(`[File Lifecycle] 🛡 24-Hour File Retention Daemon initialized (sweep interval: 10m).`)

  const runCleanup = async () => {
    try {
      const cutoff = new Date(Date.now() - RETENTION_MS)

      // 1. Query expired DB orders that have not yet had their files permanently deleted
      if (isDbConnected()) {
        const expiredOrders = await Order.find({
          fileDeleted: { $ne: true },
          $or: [
            { createdAt: { $lt: cutoff } },
            { fileExpiresAt: { $lt: new Date() } },
          ],
        }).limit(200)

        for (const ord of expiredOrders) {
          const ordId = ord.orderId || ord.orderNumber
          console.log(`[File Lifecycle] ⏰ Order ${ordId} exceeded 24-hour retention. Purging permanently...`)
          await permanentlyDeleteOrderFiles(ordId, '24H_RETENTION_EXPIRED')
          if (ord.status !== 'PRINTED' && ord.status !== 'COMPLETED') {
            await Order.updateOne(
              { _id: ord._id },
              { $set: { status: 'EXPIRED' } }
            ).catch(() => {})
          }
          if (ord.releasePin) {
            usedPinsRegistry.add(ord.releasePin)
          }
        }
      }

      // 2. Clean up in-memory printJobs older than 24 hours
      const now = Date.now()
      for (const [orderId, job] of printJobs.entries()) {
        if ((now - (job.startedAt || 0)) > RETENTION_MS) {
          await permanentlyDeleteOrderFiles(orderId, '24H_MEMORY_RETENTION_EXPIRED')
          if (job.releasePin) {
            usedPinsRegistry.add(job.releasePin)
          }
          printJobs.delete(orderId)
        }
      }

      // 3. Sweep disk directories for orphaned raw files older than 24 hours
      purgeOrphanedDiskFilesOlderThan24Hours()
    } catch (daemonErr: any) {
      console.error(`[File Lifecycle] Error in retention cleanup run:`, daemonErr.message)
    }
  }

  // Run initial sweep after a short delay on startup
  setTimeout(runCleanup, 3000)

  // Recurring sweep every 10 minutes
  const interval = setInterval(runCleanup, 10 * 60 * 1000)
  return interval
}
