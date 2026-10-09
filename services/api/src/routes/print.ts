import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { Order } from '../models/Order.js'
import { Kiosk } from '../models/Kiosk.js'
import { isDbConnected } from '../db.js'
import { cacheGet, cacheSet } from '../redis.js'
import { printExecutionLimiter } from '../middleware/rateLimiter.js'
import { getRealPrinterHardwareStatus } from '../modules/printerDetector.js'
import { isUserBlocked, normalizeIp } from '../modules/blocklist.js'
import { fallbackOrders } from '../fallbackData.js'
import { relayToKiosk, relayPinVerified, triggerKioskUsbProbe, isKioskRelayConnected } from '../modules/wsRelay.js'
import { isKioskPiReachable, markKioskOffline } from '../modules/kioskLiveness.js'
import { getKioskPiPrinters, isKioskUsbPrinterConnected } from '../modules/kioskPiPrinters.js'
import { permanentlyDeleteOrderFiles, isOrderFileExpired, RETENTION_MS } from '../modules/fileLifecycle.js'
import { safeEqual, generateKioskSecret } from '../modules/kioskAuth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Store uploads in a dedicated print folder, isolated per kiosk
const UPLOAD_DIR = path.resolve(__dirname, '../../../../scratch/print_uploads')
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const rawKiosk = (req.headers['x-kiosk-id'] || req.query.kioskId || (req.body && req.body.kioskId) || 'PB-001') as string
    const cleanKiosk = (typeof rawKiosk === 'string' && /^PB-\d{3}$/.test(rawKiosk.trim())) ? rawKiosk.trim() : 'PB-001'
    const targetDir = path.resolve(UPLOAD_DIR, cleanKiosk)
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }
    cb(null, targetDir)
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${unique}_${safeName}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
})

export const printRouter = Router()

// In-memory status tracker for real-time telemetry
export interface PrintJobState {
  orderId: string
  fileName: string
  filePath: string
  copies: number
  colourMode: string
  pageRange: string
  pageCopies?: string
  pageColours?: string
  duplex: string
  paperSize?: string
  scaling?: string
  customScalePercent?: number
  dpi?: string
  orientation?: string
  pagesPerSheet?: number
  margins?: string
  contrastMode?: string
  pageBorder?: boolean
  status: 'QUEUED' | 'PRINTING' | 'PRINTED' | 'FAILED'
  printedPages: number
  totalPages: number
  percent: number
  printerName?: string
  error?: string
  startedAt: number
  completedAt?: number
  releasePin?: string
  isPinUsed?: boolean
  pinUsedAt?: number
  fileExpiresAt?: number
  fileDeleted?: boolean
  fileDeletedAt?: number
  kioskId?: string
}

export const printJobs = new Map<string, PrintJobState>()
export const usedPinsRegistry = new Set<string>()

/**
 * Synchronizes print job telemetry state into both local memory and Redis cache.
 * Keeps data persistent across service reloads and accessible for high-throughput queries.
 */
function syncJobState(job: PrintJobState) {
  printJobs.set(job.orderId, job)
  cacheSet(`print:job:${job.orderId}`, job, 86400).catch((err) => {
    console.warn(`[Redis Print Sync] Error caching job ${job.orderId}:`, err)
  })
}

// Path to windows printer Python engine
const PYTHON_PRINTER_SCRIPT = path.resolve(__dirname, '../../../printer/windows_printer.py')

/** True when PRINT_MODE=test — never touches physical hardware */
const isTestMode = () => (process.env.PRINT_MODE || 'real').toLowerCase() === 'test'

/**
 * Simulates a print job in TEST mode — no Python subprocess, no printer required.
 * Streams realistic PROGRESS telemetry and marks the job SUCCESS after ~3 s.
 */
function simulateTestPrintJob(job: PrintJobState) {
  const MOCK_PRINTER = 'PrintBooth Test Printer (Mock)'
  job.status    = 'PRINTING'
  job.printerName = MOCK_PRINTER
  job.totalPages  = Math.max(1, job.totalPages || job.copies || 1)
  syncJobState(job)

  console.log(`\n[TEST MODE] 🧪 Simulating print for Order ${job.orderId}: ${job.fileName}`)
  console.log(
    `[TEST MODE] Settings: ${job.copies} copies | ${job.colourMode} | Pages: ${job.pageRange} | ` +
    `Duplex: ${job.duplex} | Paper: ${job.paperSize || 'A4'} | DPI: ${job.dpi || '600'} | ` +
    `Scale: ${job.scaling || 'FIT'} | Orientation: ${job.orientation || 'AUTO'} | ` +
    `N-Up: ${job.pagesPerSheet || 1} | Margin: ${job.margins || 'STANDARD'} | Contrast: ${job.contrastMode || 'BALANCED'}`
  )

  const totalOutput = job.totalPages
  let completed = 0

  // Emit a PROGRESS event every 400 ms to mimic real telemetry
  const interval = setInterval(() => {
    completed = Math.min(completed + 1, totalOutput)
    job.printedPages = completed
    job.percent = Math.round((completed / totalOutput) * 100)
    syncJobState(job)
    console.log(`[TEST MODE] Simulated progress: ${completed}/${totalOutput} pages (${job.percent}%)`)

    if (completed >= totalOutput) {
      clearInterval(interval)
      // Small delay to mimic spooler handshake
      setTimeout(() => {
        job.status = 'PRINTED'
        job.percent = 100
        job.completedAt = Date.now()
        syncJobState(job)
        console.log(`[TEST MODE] ✓ Simulated print complete for Order ${job.orderId} (no paper used)`)
        updateDbOrderStatus(job.orderId, 'PRINTED')
        permanentlyDeleteOrderFiles(job.orderId, 'SIMULATED_PRINT_SUCCESS').catch(() => {})
      }, 600)
    }
  }, 400)
}

/**
 * Spawns the Windows GDI print engine subprocess and monitors stdout telemetry
 */
function dispatchWindowsPrintJob(job: PrintJobState) {
  job.status = 'PRINTING'
  console.log(`\n[Print Dispatch] 🖨 Starting print for Order ${job.orderId}: ${job.fileName}`)
  console.log(
    `[Print Dispatch] Settings: ${job.copies} copies | ${job.colourMode} | Pages: ${job.pageRange} | ` +
    `Duplex: ${job.duplex} | Paper: ${job.paperSize || 'A4'} | DPI: ${job.dpi || '600'} | ` +
    `Scale: ${job.scaling || 'FIT'} | Orientation: ${job.orientation || 'AUTO'} | ` +
    `N-Up: ${job.pagesPerSheet || 1} | Margin: ${job.margins || 'STANDARD'} | Contrast: ${job.contrastMode || 'BALANCED'}` +
    `${job.pageCopies ? ` | Per-page copies: ${job.pageCopies}` : ''}${job.pageColours ? ` | Per-page colours: ${job.pageColours}` : ''}`
  )

  const args = [
    PYTHON_PRINTER_SCRIPT,
    '--file', job.filePath,
    '--copies', String(job.copies),
    '--colour', job.colourMode,
    '--pages', job.pageRange || 'ALL',
    '--order', job.orderId,
    '--duplex', job.duplex || 'SINGLE',
    '--paper-size', job.paperSize || 'A4',
    '--dpi', String(job.dpi || '300'),
    '--scaling', job.scaling || 'FIT',
    '--orientation', job.orientation || 'AUTO',
    '--pages-per-sheet', String(job.pagesPerSheet || 1),
    '--margins', job.margins || 'STANDARD',
    '--contrast-mode', job.contrastMode || 'BALANCED',
  ]

  if (job.customScalePercent) {
    args.push('--custom-scale', String(job.customScalePercent))
  }

  if (job.pageBorder) {
    args.push('--page-border')
  }

  if (job.pageCopies) {
    args.push('--page-copies', job.pageCopies)
  }

  if (job.pageColours) {
    args.push('--page-colours', job.pageColours)
  }

  if (job.printerName && job.printerName !== 'auto') {
    args.push('--printer', job.printerName)
  } else {
    args.push('--auto')
  }

  const pyProcess = spawn('python', args, {
    cwd: path.resolve(__dirname, '../../../../'),
    windowsHide: true,
  })

  let buffer = ''

  pyProcess.stdout.on('data', (data) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed.type === 'PROGRESS') {
          job.printedPages = parsed.completed
          job.totalPages = parsed.total
          job.percent = parsed.percent
          syncJobState(job)
          console.log(`[Print Telemetry] Order ${job.orderId}: ${parsed.completed}/${parsed.total} pages (${parsed.percent}%)`)
        } else if (parsed.type === 'SUCCESS') {
          job.status = 'PRINTED'
          job.completedAt = Date.now()
          job.printerName = parsed.data?.printer
          syncJobState(job)
          console.log(`[Print Telemetry] ✓ Order ${job.orderId} printed successfully via ${parsed.data?.printer}!`)
          updateDbOrderStatus(job.orderId, 'PRINTED')
          permanentlyDeleteOrderFiles(job.orderId, 'WINDOWS_PRINT_SUCCESS').catch(() => {})
        } else if (parsed.type === 'ERROR') {
          job.status = 'FAILED'
          job.error = parsed.error
          syncJobState(job)
          console.error(`[Print Telemetry] ✗ Order ${job.orderId} failed: ${parsed.error}`)
          if (!job.kioskId || !job.kioskId.startsWith('PB-')) {
            updateDbOrderStatus(job.orderId, 'FAILED')
          } else {
            console.log(`[Print Telemetry] ℹ Order ${job.orderId} is assigned to kiosk ${job.kioskId}; keeping active for Raspberry Pi spooler.`)
          }
        }
      } catch {
        // Non-JSON standard console logs from Python
        console.log(`[Python Output] ${line}`)
      }
    }
  })

  pyProcess.stderr.on('data', (data) => {
    console.error(`[Python Stderr] ${data.toString()}`)
  })

  pyProcess.on('error', (err) => {
    console.error(`[Print Dispatch] ✗ Failed to spawn python process:`, err)
    job.status = 'FAILED'
    job.error = `Failed to start Python print engine: ${err.message}`
    syncJobState(job)
    updateDbOrderStatus(job.orderId, 'FAILED')
  })

  pyProcess.on('close', (code) => {
    if (code === 0 && job.status !== 'FAILED') {
      job.status = 'PRINTED'
      job.completedAt = Date.now()
      syncJobState(job)
      updateDbOrderStatus(job.orderId, 'PRINTED')
      permanentlyDeleteOrderFiles(job.orderId, 'WINDOWS_PROCESS_EXIT_0').catch(() => {})
    } else if (code !== 0) {
      job.status = 'FAILED'
      job.error = job.error || `Process exited with code ${code}`
      syncJobState(job)
      updateDbOrderStatus(job.orderId, 'FAILED')
    }
  })
}

/**
 * Dispatches a print job.
 * Prioritizes relaying the job to the connected Raspberry Pi kiosk (via WebSocket),
 * which controls the physical Brother CUPS printer.
 * Never executes on the developer host machine unless explicitly opted in via ALLOW_HOST_WINDOWS_PRINT=true.
 */
function dispatchPrintJob(job: PrintJobState) {
  const targetKiosk = job.kioskId || 'PB-001'
  if (isKioskRelayConnected(targetKiosk)) {
    job.status = 'PRINTING'
    syncJobState(job)
    console.log(`[Print Dispatch] 📡 Relaying print execution for Order ${job.orderId} to connected Raspberry Pi kiosk (${targetKiosk})...`)
    relayToKiosk(targetKiosk, {
      type: 'PRINT_EXECUTE',
      kioskId: targetKiosk,
      orderId: job.orderId,
      payload: {
        ...job,
        immediate: true,
        forceKioskPrint: true,
      },
    })
    return
  }

  if (process.env.ALLOW_HOST_WINDOWS_PRINT === 'true') {
    dispatchWindowsPrintJob(job)
    return
  }

  // Safely simulate in dev mode without touching developer PC printers
  console.log(`[Print Dispatch] ℹ Raspberry Pi not connected via WebSocket and host printing disabled. Simulating print job for dev.`)
  simulateTestPrintJob(job)
}

async function updateDbOrderStatus(orderId: string, status: string) {
  if (!isDbConnected()) return
  try {
    await Order.findOneAndUpdate(
      { $or: [{ orderId }, { orderNumber: orderId }] },
      { status, updatedAt: new Date() }
    )
  } catch (err) {
    console.warn(`[Print Dispatch] Could not update DB order status:`, err)
  }
}

// ── GET /api/print/mode ──
// Returns current print mode so the frontend can show TEST/REAL badge
printRouter.get('/mode', (_req: Request, res: Response) => {
  const mode = (process.env.PRINT_MODE || 'real').toLowerCase()
  res.json({
    success: true,
    mode,                                   // 'test' | 'real'
    isTestMode: mode === 'test',
    label: mode === 'test'
      ? 'Test Mode — simulated printing (no printer required)'
      : 'Real Mode — dispatches to active connected physical printer',
    mockPrinter: mode === 'test' ? 'PrintBooth Test Printer (Mock)' : null,
  })
})

// ── POST /api/print/execute ──
// Accepts document file + print configuration and immediately dispatches to physical printer
printRouter.post('/execute', printExecutionLimiter, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file
    const orderId = req.body.orderId || `ORD-${Date.now().toString().slice(-6)}`
    const kioskId = req.body.kioskId
    if (kioskId) {
      if (typeof kioskId !== 'string' || !/^PB-\d{3}$/.test(kioskId.trim())) {
        return res.status(400).json({
          success: false,
          error: `Invalid kioskId '${kioskId}'. Target machine must match canonical PB-XXX format (e.g. PB-001, PB-002).`,
        })
      }
    }
    const cleanKiosk = (typeof kioskId === 'string' && /^PB-\d{3}$/.test(kioskId.trim())) ? kioskId.trim() : 'PB-001'
    const clientIp = normalizeIp((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress)
    const clientMac = ((req.headers['x-client-mac'] as string) || req.body?.mac || '')?.trim().toLowerCase()

    if (await isUserBlocked(cleanKiosk, clientIp, clientMac)) {
      return res.status(403).json({
        success: false,
        error: 'Access Denied: You have been blocked from using this machine by the merchant partner.',
        blocked: true,
      })
    }

    // Verify physical printer is connected via USB on the station
    if (!isTestMode()) {
      const piData = getKioskPiPrinters(cleanKiosk)
      if (piData && piData.usbConnected === false) {
        return res.status(400).json({
          success: false,
          error: 'Cannot start print: Printer is disconnected from USB bus. Please connect USB cable and power on printer.',
          issueCode: 'PRINTER_USB_DISCONNECTED',
        })
      }
    }

    let fileName = file?.originalname || req.body.fileName || 'PrintBooth_Document.pdf'
    let filePath = file?.path

    if (!filePath) {
      const samplePdf = path.resolve(__dirname, '../../../../test_sample.pdf')
      if (fs.existsSync(samplePdf)) {
        filePath = samplePdf
      } else {
        return res.status(400).json({ success: false, error: 'No document file provided and no sample PDF available' })
      }
    }

    const copies = Math.max(1, Math.min(Number(req.body.copies) || 1, 99))
    const rawCol = String(req.body.colourMode || req.body.colour || 'BW').toUpperCase().replace('&', '')
    const colourMode = (rawCol === 'COLOUR' || rawCol === 'COLOR') ? 'COLOUR' : 'BW'
    const pageRange = req.body.pageRange || req.body.pages || 'ALL'
    const duplex = (req.body.duplex || 'SINGLE').toUpperCase()
    const printerName = req.body.printerName || undefined
    const paperSize = (req.body.paperSize || req.body.paper_size || 'A4').toUpperCase()
    const scaling = (req.body.scaling || req.body.scale || 'FIT').toUpperCase()
    const dpi = String(req.body.dpi || '300')
    const orientation = (req.body.orientation || 'AUTO').toUpperCase()
    const pagesPerSheet = Math.max(
      1,
      Math.min(Number(req.body.pagesPerSheet || req.body.pages_per_sheet || req.body.nUp) || 1, 16)
    )
    const margins = (req.body.margins || req.body.margin || 'STANDARD').toUpperCase()
    const contrastMode = (req.body.contrastMode || req.body.contrast || 'BALANCED').toUpperCase()
    const customScalePercent = Number(req.body.customScalePercent || req.body.custom_scale || req.body.customScale) || 100
    const pageBorder = req.body.pageBorder === 'true' || req.body.pageBorder === true

    const pageCopiesRaw = req.body.pageCopies || req.body.page_copies
    const pageCopies = pageCopiesRaw
      ? (typeof pageCopiesRaw === 'string' ? pageCopiesRaw : JSON.stringify(pageCopiesRaw))
      : undefined

    const pageColoursRaw = req.body.pageColours || req.body.page_colours
    const pageColours = pageColoursRaw
      ? (typeof pageColoursRaw === 'string' ? pageColoursRaw : JSON.stringify(pageColoursRaw))
      : undefined

    const rawPin = req.body.releasePin || req.body.otp || req.body.pickupCode
    let releasePin = rawPin ? String(rawPin).trim() : undefined
    if (releasePin && usedPinsRegistry.has(releasePin)) {
      console.warn(`[Print Execute] ⚠️ Attempted to stage job with already-used PIN '${releasePin}'. Generating fresh PIN.`)
      let attempts = 0
      do {
        releasePin = Math.floor(1000 + Math.random() * 9000).toString()
        attempts++
      } while (usedPinsRegistry.has(releasePin) && attempts < 50)
    }
    const isImmediate = req.body.immediate === 'true' || req.body.immediate === true
    const rawTotalPages = Number(req.body.totalPages || req.body.pageCount || req.body.totalSheets)
    const resolvedTotalPages = Math.max(1, !isNaN(rawTotalPages) && rawTotalPages > 0 ? rawTotalPages : 1)

    const jobState: PrintJobState = {
      orderId,
      fileName,
      filePath,
      copies,
      colourMode,
      pageRange,
      pageCopies,
      pageColours,
      duplex,
      paperSize,
      scaling,
      customScalePercent,
      dpi,
      orientation,
      pagesPerSheet,
      margins,
      contrastMode,
      pageBorder,
      status: 'QUEUED',
      printedPages: 0,
      totalPages: resolvedTotalPages,
      percent: 0,
      printerName,
      startedAt: Date.now(),
      fileExpiresAt: Date.now() + RETENTION_MS,
      fileDeleted: false,
      releasePin,
      kioskId: cleanKiosk,
    }

    syncJobState(jobState)

    // Persist print settings and document path into MongoDB Order
    if (isDbConnected()) {
      await Order.findOneAndUpdate(
        { $or: [{ orderId }, { orderNumber: orderId }] },
        {
          $set: {
            fileName,
            copies,
            colourMode,
            pageRange,
            duplex,
            paperSize,
            scaling,
            pagesPerSheet,
            fileUrl: filePath || `${req.protocol}://${req.get('host')}/api/print/download/${orderId}`,
            fileExpiresAt: new Date(Date.now() + RETENTION_MS),
            fileDeleted: false,
            releasePin: releasePin || undefined,
            otp: releasePin || undefined,
            pickupCode: releasePin || undefined,
            printSettings: {
              copies,
              colourMode,
              colour: colourMode,
              pageRange,
              pages: pageRange,
              duplex,
              paperSize,
              scaling,
              customScalePercent,
              dpi,
              orientation,
              pagesPerSheet,
              margins,
              contrastMode,
              pageBorder,
              pageCopies,
              pageColours,
            },
          },
        }
      ).catch(() => {})
    }

    // Notify connected Raspberry Pi station over WSS relay that file and OTP are staged
    relayToKiosk(cleanKiosk, {
      type: 'PRINT_JOB_STAGED',
      kioskId: cleanKiosk,
      orderId,
      payload: {
        orderId,
        releasePin,
        otp: releasePin,
        pickupCode: releasePin,
        fileName,
        filePath,
        copies,
        colourMode,
        duplex,
        paperSize,
        pageRange,
        scaling,
        orientation,
        pagesPerSheet,
        margins,
        contrastMode,
        pageCopies,
        pageColours,
        fileUrl: `${req.protocol}://${req.get('host')}/api/print/download/${orderId}`,
        stagedAt: Date.now(),
      },
    })

    // If explicit immediate bypass is enabled, run print engine now; otherwise wait for PIN verification at kiosk
    if (isImmediate) {
      if (isTestMode()) {
        simulateTestPrintJob(jobState)
      } else {
        dispatchPrintJob(jobState)
      }
    }

    return res.status(200).json({
      success: true,
      message: isImmediate
        ? (isTestMode() ? '[TEST MODE] Print job simulated — no physical printer involved' : 'Print job dispatched to physical printer')
        : 'Print job staged securely on Kiosk Pi. Enter PIN on Kiosk touchscreen to start printing.',
      data: {
        orderId,
        fileName,
        copies,
        colourMode,
        duplex,
        paperSize,
        scaling,
        dpi,
        orientation,
        pagesPerSheet,
        margins,
        contrastMode,
        releasePin,
        otp: releasePin,
        status: isImmediate ? 'PRINTING' : 'QUEUED',
      },
    })
  } catch (error: any) {
    console.error('[Print Router] Error executing print:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ── GET /api/print/status/:orderId ──
// Returns live telemetry for an active or completed print job
printRouter.get('/status/:orderId', async (req: Request, res: Response) => {
  const { orderId } = req.params
  let job = printJobs.get(orderId)

  if (!job) {
    const redisJob = await cacheGet<PrintJobState>(`print:job:${orderId}`)
    if (redisJob) {
      job = redisJob
      printJobs.set(orderId, redisJob)
    }
  }

  if (!job) {
    if (isDbConnected()) {
      try {
        const dbOrder = await Order.findOne({ $or: [{ orderId }, { orderNumber: orderId }] })
        if (dbOrder) {
          const isDone = dbOrder.status === 'PRINTED' || dbOrder.status === 'READY_FOR_COLLECTION'
          return res.json({
            success: true,
            data: {
              orderId,
              status: isDone ? 'READY_FOR_COLLECTION' : dbOrder.status,
              fileName: dbOrder.fileName,
              printedPages: dbOrder.pageCount,
              totalPages: dbOrder.pageCount,
              percent: isDone ? 100 : 20,
            },
          })
        }
      } catch {}
    }

    return res.json({
      success: true,
      data: {
        orderId,
        status: 'PENDING_DISPATCH',
        message: 'Awaiting print job dispatch…',
        printedPages: 0,
        totalPages: 1,
        percent: 0,
      },
    })
  }

  return res.json({
    success: true,
    data: {
      orderId: job.orderId,
      fileName: job.fileName,
      status: job.status === 'PRINTED' ? 'READY_FOR_COLLECTION' : job.status,
      printedPages: job.printedPages,
      totalPages: job.totalPages,
      percent: job.percent,
      printerName: job.printerName,
      error: job.error,
      completedAt: job.completedAt,
    },
  })
})

// ── POST /api/print/test ──
// Dispatches a diagnostic test print to the Brother printer
printRouter.post('/test', async (_req: Request, res: Response) => {
  try {
    const testSample = path.resolve(__dirname, '../../../../test_sample.pdf')
    if (!fs.existsSync(testSample)) {
      return res.status(404).json({ success: false, error: 'test_sample.pdf not found' })
    }

    const testOrderId = `TEST-${Date.now().toString().slice(-4)}`
    const testJob: PrintJobState = {
      orderId: testOrderId,
      fileName: 'test_sample.pdf',
      filePath: testSample,
      copies: 1,
      colourMode: 'BW',
      pageRange: 'ALL',
      duplex: 'SINGLE',
      status: 'QUEUED',
      printedPages: 0,
      totalPages: 1,
      percent: 0,
      startedAt: Date.now(),
    }

    printJobs.set(testOrderId, testJob)

    if (isTestMode()) {
      simulateTestPrintJob(testJob)
      return res.json({
        success: true,
        message: '[TEST MODE] Simulated test print — no paper used',
        orderId: testOrderId,
        mode: 'test',
      })
    }

    dispatchPrintJob(testJob)
    return res.json({
      success: true,
      message: 'Hardware test print initiated to active physical printer',
      orderId: testOrderId,
    })
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ── POST /api/print/queue/clear ──
// Purges any cancelled or stuck jobs from the Windows printer queue
printRouter.post('/queue/clear', async (req: Request, res: Response) => {
  try {
    const live = await getRealPrinterHardwareStatus()
    const printerName = req.body.printerName || live.selectedPrinter || 'Brother DCP-T420W Printer USB'
    const jobId = req.body.jobId ? Number(req.body.jobId) : undefined
    const cleanCmd = jobId
      ? `from services.printer.windows_printer import clear_printer_queue; clear_printer_queue('${printerName}', ${jobId})`
      : `from services.printer.windows_printer import clear_printer_queue; clear_printer_queue('${printerName}')`

    spawn('python', ['-c', cleanCmd], {
      cwd: path.resolve(__dirname, '../../../../'),
      windowsHide: true,
    })

    return res.json({ success: true, message: `Requested queue cleanup for ${printerName}` })
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ── GET /api/print/download/:orderId ──
printRouter.get('/download/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params

    let job: PrintJobState | null | undefined = printJobs.get(orderId)
    if (!job) {
      job = await cacheGet<PrintJobState>(`print:job:${orderId}`)
    }

    let order: any = null
    if (isDbConnected()) {
      try {
        order = await Order.findOne({ $or: [{ orderId }, { orderNumber: orderId }] })
      } catch {}
    }
    if (!order) {
      order = fallbackOrders.find((o) => o.orderId === orderId || o.orderNumber === orderId)
    }

    // ── Cryptographic Authentication & Multi-Merchant File Isolation ──
    const reqKioskId = ((req.headers['x-kiosk-id'] as string) || (req.query.kioskId as string) || '').trim().toUpperCase()
    const reqSecret =
      (req.headers['x-kiosk-secret'] as string) ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : (req.query.secret as string) || '')
    const targetKioskId = String(order?.kioskId || job?.kioskId || '').trim().toUpperCase()

    if (reqKioskId) {
      if (isDbConnected()) {
        const requestingKiosk = await Kiosk.findOne({ kioskId: reqKioskId })
        if (requestingKiosk) {
          if (!requestingKiosk.deviceSecret) {
            requestingKiosk.deviceSecret = generateKioskSecret()
            await requestingKiosk.save()
          }
          const isMatch = reqSecret && safeEqual(reqSecret, requestingKiosk.deviceSecret)
          const isDevLocal = process.env.NODE_ENV !== 'production' && reqKioskId === 'PB-001' && !reqSecret
          if (!isMatch && !isDevLocal) {
            console.warn(`[Security Alert] 🚨 UNAUTHORIZED DOWNLOAD ATTEMPT for Order ${orderId} by station ${reqKioskId} from IP ${req.ip}. Bad key.`)
            return res.status(401).json({
              success: false,
              error: `Unauthorized: Invalid cryptographic device secret for station ${reqKioskId}.`,
            })
          }
        }
      }

      // Enforce strict merchant & hardware isolation
      if (targetKioskId && targetKioskId !== reqKioskId) {
        console.warn(`[Security Alert] 🚨 CROSS-MERCHANT FILE ACCESS PREVENTED: Station ${reqKioskId} attempted to access file of ${targetKioskId} (Order ${orderId})`)
        return res.status(403).json({
          success: false,
          error: `Forbidden: Document belongs to station ${targetKioskId}. Station ${reqKioskId} cannot access documents from another merchant station.`,
        })
      }
    }

    // 0. Strict Privacy & Security Check: If file is marked deleted, expired (> 24 hours), or already printed, block permanently
    const isDeletedOrPrinted =
      (job && (job.fileDeleted || job.status === 'PRINTED')) ||
      (order && (order.fileDeleted || order.status === 'PRINTED' || order.status === 'COMPLETED' || order.status === 'EXPIRED'))

    const isExpired = (job && isOrderFileExpired(job)) || (order && isOrderFileExpired(order))

    if (isDeletedOrPrinted || isExpired) {
      if (orderId) {
        permanentlyDeleteOrderFiles(orderId, 'DOWNLOAD_AFTER_PRINT_OR_EXPIRY').catch(() => {})
      }
      return res.status(410).json({
        success: false,
        expired: true,
        fileDeleted: true,
        error: 'This document has already been printed or has expired (> 24-hour limit) and was permanently deleted.',
      })
    }

    if (job?.filePath && fs.existsSync(job.filePath)) {
      return res.sendFile(path.resolve(job.filePath))
    }

    if (order?.fileUrl && fs.existsSync(order.fileUrl)) {
      return res.sendFile(path.resolve(order.fileUrl))
    }

    // Only allow test sample in test mode if order was not deleted or expired
    if (isTestMode()) {
      const testSample = path.resolve(__dirname, '../../../../test_sample.pdf')
      if (fs.existsSync(testSample)) {
        return res.sendFile(testSample)
      }
    }

    return res.status(404).json({ success: false, error: 'Document not found or already purged for order ' + orderId })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message })
  }
})

// ── Verification Engine: Verifies OTP / Release PIN and triggers physical printing ──
export async function handleVerifyPinLogic(rawKioskId: string, rawPin: string) {
  const kioskId = (rawKioskId || 'PB-001').trim().toUpperCase()
  const pin = String(rawPin || '').replace(/\s+/g, '').trim()

  if (!pin) {
    return { success: false, valid: false, error: 'Release PIN / OTP is required' }
  }

  // ── 0. Strict One-Time-Use Guard: Reject immediately if PIN was already consumed ──
  if (usedPinsRegistry.has(pin)) {
    console.log(`[PIN Verification] ⛔ BLOCKED: PIN '${pin}' was already used.`)
    return {
      success: false,
      valid: false,
      error: 'This PIN has already been used and is no longer valid.',
    }
  }

  try {
    const isUsedInRedis = await cacheGet(`used_pin:${pin}`)
    if (isUsedInRedis) {
      usedPinsRegistry.add(pin)
      console.log(`[PIN Verification] ⛔ BLOCKED: PIN '${pin}' found in used cache.`)
      return {
        success: false,
        valid: false,
        error: 'This PIN has already been used and is no longer valid.',
      }
    }
  } catch {}

  if (isDbConnected()) {
    try {
      const alreadyUsedDoc = await Order.findOne({
        $or: [
          { usedPins: pin },
          { releasePin: pin, isPinUsed: true },
          { otp: pin, isPinUsed: true },
          { pickupCode: pin, isPinUsed: true },
          { releasePin: pin, status: { $in: ['PRINTING', 'PRINTED', 'COMPLETED'] } },
          { otp: pin, status: { $in: ['PRINTING', 'PRINTED', 'COMPLETED'] } },
          { pickupCode: pin, status: { $in: ['PRINTING', 'PRINTED', 'COMPLETED'] } },
        ],
      })
      if (alreadyUsedDoc) {
        usedPinsRegistry.add(pin)
        cacheSet(`used_pin:${pin}`, '1', 86400 * 30).catch(() => {})
        console.log(`[PIN Verification] ⛔ BLOCKED: PIN '${pin}' was already used in order ${alreadyUsedDoc.orderId}.`)
        return {
          success: false,
          valid: false,
          error: 'This PIN has already been used and is no longer valid.',
        }
      }
    } catch {}
  }

  console.log(`[PIN Verification] Verifying PIN '${pin}' for station ${kioskId}...`)

  // ── 1. Search in-memory staged jobs ──
  for (const job of printJobs.values()) {
    if (job.releasePin === pin && (!job.kioskId || job.kioskId === kioskId)) {
      if (job.isPinUsed || job.status === 'PRINTING' || job.status === 'PRINTED') {
        usedPinsRegistry.add(pin)
        cacheSet(`used_pin:${pin}`, '1', 86400 * 30).catch(() => {})
        return {
          success: false,
          valid: false,
          error: 'This PIN has already been used and is no longer valid.',
        }
      }

      // 24-Hour Expiration Guard: Reject if file retention exceeded 24 hours
      if (isOrderFileExpired(job)) {
        usedPinsRegistry.add(pin)
        cacheSet(`used_pin:${pin}`, '1', 86400 * 30).catch(() => {})
        permanentlyDeleteOrderFiles(job.orderId, '24H_STORAGE_LIMIT_EXPIRED').catch(() => {})
        console.log(`[PIN Verification] ⛔ BLOCKED: Job for Order ${job.orderId} exceeded 24-hour storage limit.`)
        return {
          success: false,
          valid: false,
          error: 'This PIN has expired (24-hour file storage limit exceeded). Uploaded files are deleted permanently after 24 hours.',
        }
      }

      console.log(`[PIN Verification] ✓ In-memory job matched: Order ${job.orderId}. Purging PIN '${pin}' permanently...`)

      // PERMANENT CONSUMPTION: Mark used and DELETE PIN from memory immediately
      usedPinsRegistry.add(pin)
      cacheSet(`used_pin:${pin}`, '1', 86400 * 30).catch(() => {})

      job.status = 'PRINTING'
      job.isPinUsed = true
      job.pinUsedAt = Date.now()
      delete job.releasePin
      delete (job as any).otp
      delete (job as any).pickupCode
      syncJobState(job)

      // Synchronize database: permanently unset PIN and record in usedPins
      if (isDbConnected()) {
        await Order.updateMany(
          { $or: [{ orderId: job.orderId }, { orderNumber: job.orderId }, { releasePin: pin }, { otp: pin }, { pickupCode: pin }] },
          {
            $set: { status: 'PRINTING', printedAt: new Date(), isPinUsed: true, pinUsedAt: new Date() },
            $unset: { releasePin: 1, otp: 1, pickupCode: 1 },
            $addToSet: { usedPins: pin },
          }
        ).catch(() => {})
      }

      // Purge in fallbackOrders
      for (const fb of fallbackOrders) {
        if (fb.orderId === job.orderId || fb.releasePin === pin || fb.otp === pin || fb.pickupCode === pin) {
          fb.status = 'PRINTING'
          fb.isPinUsed = true
          fb.pinUsedAt = new Date()
          delete fb.releasePin
          delete fb.otp
          delete fb.pickupCode
        }
      }

      const rawCol = String(job.colourMode || 'BW').toUpperCase().replace('&', '')
      const resolvedColour = (rawCol === 'COLOUR' || rawCol === 'COLOR') ? 'COLOUR' : 'BW'
      const resolvedCopies = Math.max(1, Number(job.copies) || 1)
      const targetKiosk = job.kioskId || kioskId

      if (isTestMode()) {
        simulateTestPrintJob(job)
      } else if (isKioskRelayConnected(targetKiosk)) {
        console.log(`[PIN Verification] 📡 Relaying single canonical PIN_VERIFIED for Order ${job.orderId} to kiosk ${targetKiosk}...`)
        relayPinVerified(job.orderId, targetKiosk, {
          orderId: job.orderId,
          orderNumber: (job as any).orderNumber || job.orderId,
          pinVerified: true,
          status: 'PRINTING',
          fileName: job.fileName,
          copies: resolvedCopies,
          colourMode: resolvedColour,
          colour: resolvedColour,
          duplex: job.duplex || 'SINGLE',
          paperSize: job.paperSize || 'A4',
          pageRange: job.pageRange || 'ALL',
          pages: job.pageRange || 'ALL',
          scaling: job.scaling || 'FIT',
          pagesPerSheet: job.pagesPerSheet || 1,
          margins: job.margins || 'STANDARD',
          contrastMode: job.contrastMode || 'BALANCED',
          pageCopies: job.pageCopies,
          pageColours: job.pageColours,
          fileUrl: `/api/print/download/${job.orderId}`,
          dispatchedLocally: false,
          spooledViaPrintExecute: true,
          verifiedAt: Date.now(),
        })
      } else if (process.env.ALLOW_HOST_WINDOWS_PRINT === 'true') {
        dispatchWindowsPrintJob(job)
      } else {
        simulateTestPrintJob(job)
      }

      let resolvedJobPages = Math.max(1, job.totalPages || 1)
      if (resolvedJobPages <= 1 && isDbConnected()) {
        try {
          const dbDoc = await Order.findOne({ $or: [{ orderId: job.orderId }, { orderNumber: job.orderId }] })
          if (dbDoc && dbDoc.pageCount && dbDoc.pageCount > 1) {
            resolvedJobPages = dbDoc.pageCount * resolvedCopies
          }
        } catch {}
      }

      return {
        success: true,
        valid: true,
        message: 'PIN verified successfully! Hardware printing started.',
        order: {
          orderId: job.orderId,
          fileName: job.fileName,
          copies: resolvedCopies,
          colourMode: resolvedColour,
          duplex: job.duplex,
          paperSize: job.paperSize || 'A4',
          pageRange: job.pageRange || 'ALL',
          pageCount: resolvedJobPages,
          totalPages: resolvedJobPages,
          status: 'PRINTING',
        },
      }
    }
  }

  // ── 2. Search Database / Fallback Orders ──
  let order: any = null
  if (isDbConnected()) {
    try {
      order = await Order.findOne({
        kioskId,
        $or: [{ releasePin: pin }, { otp: pin }, { pickupCode: pin }],
        status: { $in: ['PAID', 'UPLOADED', 'QUEUED', 'PENDING_RELEASE', 'CREATED'] },
        isPinUsed: { $ne: true },
      }).sort({ createdAt: -1 })
    } catch {}
  }

  if (!order) {
    order = fallbackOrders.find(
      (o) =>
        (o.kioskId || 'PB-001') === kioskId &&
        (o.releasePin === pin || o.otp === pin || o.pickupCode === pin) &&
        !o.isPinUsed &&
        !['PRINTING', 'PRINTED', 'COMPLETED'].includes(o.status)
    )
  }

  if (!order) {
    return {
      success: false,
      valid: false,
      error: `Invalid or expired PIN for station ${kioskId}. This code does not exist or has already been used.`,
    }
  }

  // 24-Hour Expiration Guard: Reject if file retention exceeded 24 hours
  if (isOrderFileExpired(order)) {
    usedPinsRegistry.add(pin)
    cacheSet(`used_pin:${pin}`, '1', 86400 * 30).catch(() => {})
    const canonicalId = order.orderId || order.orderNumber
    permanentlyDeleteOrderFiles(canonicalId, '24H_STORAGE_LIMIT_EXPIRED').catch(() => {})
    console.log(`[PIN Verification] ⛔ BLOCKED: Order ${canonicalId} exceeded 24-hour storage limit.`)
    return {
      success: false,
      valid: false,
      error: 'This PIN has expired (24-hour file storage limit exceeded). Uploaded files are deleted permanently after 24 hours.',
    }
  }

  console.log(`[PIN Verification] ✓ Staged order matched: Order ${order.orderId || order.orderNumber}. Purging PIN '${pin}' permanently...`)

  // PERMANENT CONSUMPTION: Mark used and DELETE PIN from database and fallback orders
  usedPinsRegistry.add(pin)
  cacheSet(`used_pin:${pin}`, '1', 86400 * 30).catch(() => {})

  const canonicalOrderId = order.orderId || order.orderNumber
  const canonicalOrderNumber = order.orderNumber || order.orderId

  if (isDbConnected()) {
    await Order.updateMany(
      { $or: [{ orderId: canonicalOrderId }, { orderNumber: canonicalOrderNumber }, { releasePin: pin }, { otp: pin }, { pickupCode: pin }] },
      {
        $set: { status: 'PRINTING', printedAt: new Date(), isPinUsed: true, pinUsedAt: new Date() },
        $unset: { releasePin: 1, otp: 1, pickupCode: 1 },
        $addToSet: { usedPins: pin },
      }
    ).catch(() => {})
  }

  order.status = 'PRINTING'
  order.isPinUsed = true
  order.pinUsedAt = new Date()
  delete order.releasePin
  delete order.otp
  delete order.pickupCode

  for (const fb of fallbackOrders) {
    if (fb.orderId === canonicalOrderId || fb.orderNumber === canonicalOrderNumber || fb.releasePin === pin || fb.otp === pin || fb.pickupCode === pin) {
      fb.status = 'PRINTING'
      fb.isPinUsed = true
      fb.pinUsedAt = new Date()
      delete fb.releasePin
      delete fb.otp
      delete fb.pickupCode
    }
  }

  const resolvedCopies = Math.max(1, Number(order.copies || order.printSettings?.copies) || 1)
  const rawResCol = String(order.colourMode || order.printSettings?.colourMode || order.printSettings?.colour || 'BW').toUpperCase().replace('&', '')
  const resolvedColour = (rawResCol === 'COLOUR' || rawResCol === 'COLOR') ? 'COLOUR' : 'BW'
  const resolvedDuplex = order.duplex || order.printSettings?.duplex || 'SINGLE'
  const resolvedPaper = order.paperSize || order.printSettings?.paperSize || 'A4'
  const resolvedRange = order.pageRange || order.printSettings?.pageRange || order.printSettings?.pages || 'ALL'
  const resolvedScaling = order.scaling || order.printSettings?.scaling || 'FIT'
  const resolvedNUp = order.pagesPerSheet || order.printSettings?.pagesPerSheet || 1
  const resolvedMargins = order.printSettings?.margins || 'STANDARD'
  const resolvedContrast = order.printSettings?.contrastMode || 'BALANCED'
  const resolvedCustomScale = Number(order.printSettings?.customScalePercent || order.printSettings?.custom_scale) || 100
  const resolvedPageBorder = Boolean(order.printSettings?.pageBorder)
  const resolvedDpi = String(order.printSettings?.dpi || '300')
  const resolvedOrientation = order.printSettings?.orientation || 'AUTO'

  const rawPageCopies = order.printSettings?.pageCopies
  const resolvedPageCopies = rawPageCopies
    ? (typeof rawPageCopies === 'string' ? rawPageCopies : JSON.stringify(rawPageCopies))
    : undefined

  const rawPageColours = order.printSettings?.pageColours
  const resolvedPageColours = rawPageColours
    ? (typeof rawPageColours === 'string' ? rawPageColours : JSON.stringify(rawPageColours))
    : undefined

  // Update in-memory job state
  let existingJob = printJobs.get(canonicalOrderId) || printJobs.get(canonicalOrderNumber)
  if (!existingJob) {
    const testSample = path.resolve(__dirname, '../../../../test_sample.pdf')
    existingJob = {
      orderId: canonicalOrderId,
      fileName: order.fileName || 'PrintBooth_Document.pdf',
      filePath: order.fileUrl || testSample,
      copies: resolvedCopies,
      colourMode: resolvedColour,
      pageRange: resolvedRange,
      pageCopies: resolvedPageCopies,
      pageColours: resolvedPageColours,
      duplex: resolvedDuplex,
      paperSize: resolvedPaper,
      scaling: resolvedScaling,
      customScalePercent: resolvedCustomScale,
      dpi: resolvedDpi,
      orientation: resolvedOrientation,
      pagesPerSheet: resolvedNUp,
      margins: resolvedMargins,
      contrastMode: resolvedContrast,
      pageBorder: resolvedPageBorder,
      status: 'PRINTING',
      isPinUsed: true,
      pinUsedAt: Date.now(),
      printedPages: 0,
      totalPages: order.pageCount || 1,
      percent: 0,
      kioskId,
      startedAt: Date.now(),
    }
  } else {
    existingJob.copies = resolvedCopies
    existingJob.colourMode = resolvedColour
    existingJob.pageRange = resolvedRange
    if (resolvedPageCopies) existingJob.pageCopies = resolvedPageCopies
    if (resolvedPageColours) existingJob.pageColours = resolvedPageColours
    existingJob.duplex = resolvedDuplex
    existingJob.paperSize = resolvedPaper
    existingJob.scaling = resolvedScaling
    existingJob.customScalePercent = resolvedCustomScale
    existingJob.dpi = resolvedDpi
    existingJob.orientation = resolvedOrientation
    existingJob.pagesPerSheet = resolvedNUp
    existingJob.margins = resolvedMargins
    existingJob.contrastMode = resolvedContrast
    existingJob.pageBorder = resolvedPageBorder
    existingJob.status = 'PRINTING'
    existingJob.isPinUsed = true
    existingJob.pinUsedAt = Date.now()
    delete existingJob.releasePin
  }
  syncJobState(existingJob)

  if (isTestMode()) {
    simulateTestPrintJob(existingJob)
  } else if (isKioskRelayConnected(kioskId)) {
    console.log(`[PIN Verification] 📡 Relaying single canonical PIN_VERIFIED for Order ${canonicalOrderId} to kiosk ${kioskId}...`)
    relayPinVerified(canonicalOrderId, kioskId, {
      orderId: canonicalOrderId,
      orderNumber: canonicalOrderNumber,
      pinVerified: true,
      status: 'PRINTING',
      fileName: order.fileName,
      copies: resolvedCopies,
      colourMode: resolvedColour,
      colour: resolvedColour,
      duplex: resolvedDuplex,
      paperSize: resolvedPaper,
      pageRange: resolvedRange,
      pages: resolvedRange,
      scaling: resolvedScaling,
      pagesPerSheet: resolvedNUp,
      margins: resolvedMargins,
      contrastMode: resolvedContrast,
      customScalePercent: resolvedCustomScale,
      pageBorder: resolvedPageBorder,
      dpi: resolvedDpi,
      orientation: resolvedOrientation,
      pageCopies: resolvedPageCopies,
      pageColours: resolvedPageColours,
      fileUrl: `/api/print/download/${canonicalOrderId}`,
      dispatchedLocally: false,
      spooledViaPrintExecute: true,
      verifiedAt: Date.now(),
    })
  } else if (process.env.ALLOW_HOST_WINDOWS_PRINT === 'true') {
    dispatchWindowsPrintJob(existingJob)
  } else {
    simulateTestPrintJob(existingJob)
  }

  return {
    success: true,
    valid: true,
    message: 'PIN verified successfully! Physical printing initiated.',
    order: {
      orderId: order.orderId,
      fileName: order.fileName,
      copies: order.copies,
      colourMode: order.colourMode,
      duplex: order.duplex,
      paperSize: order.paperSize || 'A4',
      pageCount: Math.max(1, (order.pageCount || 1) * (resolvedCopies || order.copies || 1)),
      totalPages: Math.max(1, (order.pageCount || 1) * (resolvedCopies || order.copies || 1)),
      status: 'PRINTING',
    },
  }
}


// ── POST /api/print/verify-pin ──
// Called when customer enters PIN on kiosk touchscreen or Pi
printRouter.post('/verify-pin', async (req: Request, res: Response) => {
  try {
    const kioskId = (req.body.kioskId || req.headers['x-kiosk-id'] || 'PB-001') as string
    const pin = req.body.pin || req.body.otp || req.body.code || req.body.releasePin
    const result = await handleVerifyPinLogic(kioskId, pin)
    if (!result.valid) {
      return res.status(400).json(result)
    }
    return res.json(result)
  } catch (error: any) {
    return res.status(500).json({ success: false, valid: false, error: error.message })
  }
})

// ── POST /api/print/inspect ──
// Accurately extracts real page count & preview images for PDF, DOCX, DOC, PPTX, PPT, JPG, PNG
printRouter.post('/inspect', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file provided for inspection' })
    }

    const targetKiosk = (((req.headers['x-kiosk-id'] || req.query.kioskId || req.body?.kioskId || 'PB-001') as string)).trim().toUpperCase()
    triggerKioskUsbProbe(targetKiosk)
    const piPrinters = getKioskPiPrinters(targetKiosk)
    if (!isTestMode() && piPrinters && piPrinters.usbConnected === false) {
      if (file && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path) } catch {}
      }
      return res.status(400).json({
        success: false,
        error: 'Cannot upload document: Printer is not connected via USB. Please plug in the USB cable and turn the printer on.',
        issueCode: 'PRINTER_USB_DISCONNECTED',
      })
    }

    const args = [
      PYTHON_PRINTER_SCRIPT,
      '--file', file.path,
      '--inspect',
    ]

    const py = spawn('python', args, {
      cwd: path.resolve(__dirname, '../../../../'),
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    py.stdout.on('data', (d) => { stdout += d.toString() })
    py.stderr.on('data', (d) => { stderr += d.toString() })

    py.on('close', (code) => {
      // Clean up uploaded temp file
      if (fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path) } catch {}
      }

      if (code !== 0) {
        return res.status(500).json({ success: false, error: stderr || 'Inspection failed' })
      }

      // Look for JSON output
      const lines = stdout.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('{') && trimmed.includes('"INSPECT"')) {
          try {
            const parsed = JSON.parse(trimmed)
            return res.json(parsed)
          } catch {}
        }
      }

    })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET /api/print/detect ──
// Auto-detects all host printers and returns the currently connected, active hardware printer
printRouter.get('/detect', async (req: Request, res: Response) => {
  try {
    const rawKioskId = ((req.query.kioskId as string) || (req.query.id as string) || '').trim().toUpperCase()
    const kioskId = rawKioskId || 'PB-001'

    // Trigger on-demand physical USB probe to target Raspberry Pi
    triggerKioskUsbProbe(kioskId)

    const piPrinters = getKioskPiPrinters(kioskId)

    // 1. Check if the targeted kiosk Raspberry Pi is reachable
    const reachability = await isKioskPiReachable(kioskId)
    if (!reachability.isReachable) {
      markKioskOffline(kioskId, reachability.reason).catch(() => {})
      const inTestMode = isTestMode()
      if (!inTestMode) {
        return res.json({
          success: true,
          isAvailable: false,
          isHardwareReady: false,
          hasPhysicalPrinter: true,
          issueCode: 'MACHINE_OFFLINE',
          issueTitle: 'Printing Station Offline',
          selectedPrinter: 'Station Printer (Offline)',
          reason: `Raspberry Pi station ${kioskId} is powered off or lost internet connection.`,
          mode: 'real',
          isTestMode: false,
          kioskId,
          details: {
            name: 'Station Printer (Offline)',
            status_code: 1,
            status_labels: ['OFFLINE', 'PI_DISCONNECTED'],
            is_online: false,
            is_connected: false,
            port: 'DISCONNECTED',
            driver: 'CUPS Linux Driver',
            connection_type: 'NONE',
          },
          printers: [{
            name: 'Station Printer (Offline)',
            is_online: false,
            status_labels: ['OFFLINE', 'PI_DISCONNECTED'],
            connection_type: 'NONE',
          }],
        })
      }
    }

    if (isDbConnected()) {
      const kioskDoc = (await Kiosk.findOne({ kioskId }).lean()) as any
      const isPiHeartbeatFresh = Boolean(kioskDoc?.lastSeenAt && (Date.now() - new Date(kioskDoc.lastSeenAt).getTime() < 60000))

      if (isPiHeartbeatFresh && reachability.isReachable) {
        const isUsbDisconnected = (piPrinters && piPrinters.usbConnected === false) || kioskDoc.usbConnected === false
        const isOffline = kioskDoc.status === 'OFFLINE' || kioskDoc.printerStatus === 'OFFLINE' || kioskDoc.printerStatus === 'ERROR' || isUsbDisconnected
        const isMaintenance = String(kioskDoc.status || '').toUpperCase() === 'MAINTENANCE'
        const isAvailable = !isOffline && !isMaintenance
        const printerName = kioskDoc.printerModel || piPrinters?.activePrinter || 'Laser Print Engine'
        const statusLabel = isUsbDisconnected ? 'USB_DISCONNECTED' : (kioskDoc.printerStatus || 'READY')

        return res.json({
          success: true,
          isAvailable,
          isHardwareReady: isAvailable,
          hasPhysicalPrinter: true,
          issueCode: isAvailable ? null : (isUsbDisconnected ? 'PRINTER_USB_DISCONNECTED' : 'PRINTER_UNAVAILABLE'),
          issueTitle: isAvailable ? null : (isMaintenance ? 'Kiosk Under Maintenance' : (isUsbDisconnected ? 'Printer Disconnected via USB' : 'Printer not available right now, visit later')),
          selectedPrinter: printerName,
          reason: isAvailable
            ? `Raspberry Pi station ${kioskId} is ONLINE with printer ${statusLabel}.`
            : (isUsbDisconnected
                ? 'Physical printer is not detected on USB bus. Please verify USB cable is connected and power is turned on.'
                : (kioskDoc.printerStatus || 'Printer offline or in error')),
          mode: 'real',
          isTestMode: false,
          kioskId,
          details: {
            name: printerName,
            status_code: isAvailable ? 0 : 1,
            status_labels: [statusLabel],
            is_online: isAvailable,
            is_connected: !isUsbDisconnected,
            port: isUsbDisconnected ? 'USB (DISCONNECTED)' : 'USB (Raspberry Pi)',
            driver: 'CUPS Linux Driver',
            connection_type: 'USB_DIRECT',
          },
          printers: [{
            name: printerName,
            is_online: isAvailable,
            status_labels: [statusLabel],
            connection_type: 'USB_DIRECT',
          }],
        })
      }
    }

    // Direct check of in-memory Pi telemetry if available
    if (piPrinters) {
      const isUsbDisconnected = piPrinters.usbConnected === false
      const isAvailable = !isUsbDisconnected && piPrinters.isOnline
      const printerName = piPrinters.activePrinter || 'Laser Print Engine'
      const statusLabel = isUsbDisconnected ? 'USB_DISCONNECTED' : (isAvailable ? 'READY' : 'OFFLINE')

      return res.json({
        success: true,
        isAvailable,
        isHardwareReady: isAvailable,
        hasPhysicalPrinter: true,
        issueCode: isAvailable ? null : (isUsbDisconnected ? 'PRINTER_USB_DISCONNECTED' : 'PRINTER_UNAVAILABLE'),
        issueTitle: isAvailable ? null : (isUsbDisconnected ? 'Printer Disconnected via USB' : 'Printer not available right now, visit later'),
        selectedPrinter: printerName,
        reason: isAvailable
          ? `Raspberry Pi station ${kioskId} is ONLINE.`
          : (isUsbDisconnected
              ? 'Physical printer is not detected on USB bus. Please verify USB cable is connected and power is turned on.'
              : 'Printer reported offline on Raspberry Pi station.'),
        mode: 'real',
        isTestMode: false,
        kioskId,
        details: {
          name: printerName,
          status_code: isAvailable ? 0 : 1,
          status_labels: [statusLabel],
          is_online: isAvailable,
          is_connected: !isUsbDisconnected,
          port: isUsbDisconnected ? 'USB (DISCONNECTED)' : 'USB (Raspberry Pi)',
          driver: 'CUPS Linux Driver',
          connection_type: 'USB_DIRECT',
        },
        printers: (piPrinters.allPrinters || []).map(p => ({
          name: p.name,
          is_online: isAvailable && Boolean(p.is_online),
          status_labels: p.status_labels || [statusLabel],
          connection_type: p.connection_type || 'USB_DIRECT',
        })),
      })
    }

    // 2. Fallback to Windows host local detection if no fresh Pi heartbeat for this kiosk
    const live = await getRealPrinterHardwareStatus()
    const inTestMode = isTestMode()
    const isAvailable = inTestMode ? true : live.isAvailable
    const isHardwareReady = inTestMode ? true : live.isHardwareReady
    const selectedPrinter = inTestMode
      ? (live.selectedPrinter || 'PrintBooth Test Printer (Mock)')
      : live.selectedPrinter

    return res.json({
      success: true,
      isAvailable,
      isHardwareReady,
      hasPhysicalPrinter: inTestMode ? true : live.hasPhysicalPrinter,
      issueCode: isAvailable ? null : 'PRINTER_UNAVAILABLE',
      issueTitle: isAvailable ? null : 'Printer not available right now, visit later',
      selectedPrinter,
      reason: inTestMode ? null : live.reason,
      mode: inTestMode ? 'test' : 'real',
      isTestMode: inTestMode,
      details: {
        name: selectedPrinter,
        status_code: inTestMode ? 0 : live.statusCode,
        status_labels: inTestMode ? ['Ready (Test Mode)'] : live.statusLabels,
        is_online: inTestMode ? true : live.isOnline,
        is_connected: inTestMode ? true : live.isOnline,
        port: inTestMode ? (live.port || 'VIRTUAL-SIM') : live.port,
        driver: inTestMode ? (live.driver || 'PrintBooth Virtual Driver (Test Mode)') : live.driver,
        connection_type: inTestMode ? 'TEST_SIMULATION' : live.connectionType,
      },
      printers: [{
        name: selectedPrinter,
        is_online: inTestMode ? true : live.isOnline,
        status_labels: inTestMode ? ['Ready (Test Mode)'] : live.statusLabels,
        connection_type: inTestMode ? 'TEST_SIMULATION' : live.connectionType,
      }],
    })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message })
  }
})


