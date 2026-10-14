import express from 'express'
import http from 'http'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { connectDB, isDbConnected } from './db.js'
import { seedDatabase } from './seed.js'
import { initRedis, isRedisConnected, getCacheStats } from './redis.js'
import { globalApiLimiter } from './middleware/rateLimiter.js'
import { initWebSocketRelay } from './modules/wsRelay.js'
import { initDeviceGateway } from './modules/deviceGateway.js'
import { adminRouter } from './routes/admin.js'
import { merchantRouter } from './routes/merchant.js'
import { kiosksRouter } from './routes/kiosks.js'
import { ordersRouter } from './routes/orders.js'
import { activitiesRouter } from './routes/activities.js'
import { razorpayRouter } from './routes/razorpay.js'
import { upiExpressRouter } from './routes/upiexpress.js'
import { printRouter } from './routes/print.js'
import { installationsRouter } from './routes/installations.js'
import { helpdeskRouter } from './routes/helpdesk.js'
import { deviceRouter } from './routes/device.js'
import { kioskSessionsRouter } from './routes/kioskSessions.js'
import { advertisementsRouter } from './routes/advertisements.js'
import { startFileRetentionCleanupDaemon } from './modules/fileLifecycle.js'
import { getRealPrinterHardwareStatus } from './modules/printerDetector.js'
import { getKioskPiPrinters } from './modules/kioskPiPrinters.js'
import { getPublicWebUrl, getKioskPrintUrl, getAdminConsoleUrl } from './config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
dotenv.config()

const app = express()
app.set('trust proxy', true)
const PORT = process.env.PORT || 5000

// Middleware
app.use(
  cors({
    origin: '*',
    credentials: true,
  })
)
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// ── Request / Response Logger ──────────────────────────────────────────────
const RESET  = '\x1b[0m'
const DIM    = '\x1b[2m'
const BOLD   = '\x1b[1m'
const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED    = '\x1b[31m'
const CYAN   = '\x1b[36m'
const MAGENTA = '\x1b[35m'

app.use((req, res, next) => {
  const start = Date.now()
  const ts = () => new Date().toLocaleTimeString('en-IN', { hour12: false })

  // Log incoming request
  const methodColor = req.method === 'GET' ? CYAN
    : req.method === 'POST' ? GREEN
    : req.method === 'PUT'  ? YELLOW
    : req.method === 'DELETE' ? RED : MAGENTA

  // Only log body for Razorpay routes (to avoid noise + security)
  const isRzp = req.path.startsWith('/api/razorpay')
  if (isRzp && req.body && Object.keys(req.body).length > 0) {
    const safeBody = { ...req.body }
    // Redact any accidental secret fields
    if (safeBody.keySecret) safeBody.keySecret = '***'
    console.log(`${DIM}${ts()}${RESET} ${BOLD}${methodColor}${req.method}${RESET} ${req.path} ${DIM}${JSON.stringify(safeBody)}${RESET}`)
  } else {
    console.log(`${DIM}${ts()}${RESET} ${BOLD}${methodColor}${req.method}${RESET} ${req.path}`)
  }

  // Intercept response to log status + timing
  const origJson = res.json.bind(res)
  res.json = (body: any) => {
    const ms = Date.now() - start
    const statusColor = res.statusCode >= 500 ? RED
      : res.statusCode >= 400 ? YELLOW
      : res.statusCode >= 300 ? CYAN
      : GREEN
    const successEmoji = body?.success === true ? '✓' : body?.success === false ? '✗' : '·'
    console.log(
      `${DIM}${ts()}${RESET} ${BOLD}${statusColor}${res.statusCode}${RESET}` +
      ` ${req.method} ${req.path}` +
      ` ${DIM}+${ms}ms${RESET}` +
      (isRzp ? ` ${statusColor}${successEmoji}${RESET}${body?.error ? ` ${RED}${body.error}${RESET}` : ''}` : '')
    )
    return origJson(body)
  }
  next()
})

// Apply General Rate Limiter to all /api routes (300 req / 15m)
app.use('/api', globalApiLimiter)

// Health Check with Redis & DB telemetry
app.get('/api/health', async (_req, res) => {
  const cacheStats = await getCacheStats()
  res.json({
    status: 'ok',
    service: 'PrintBooth API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: isDbConnected() ? 'connected' : 'disconnected',
    cache: {
      provider: cacheStats.provider,
      connected: cacheStats.connected,
      keys: cacheStats.totalKeys,
      memory: cacheStats.usedMemoryHuman,
    },
  })
})

// Redis & Cache System Stats
app.get('/api/redis/stats', async (_req, res) => {
  try {
    const stats = await getCacheStats()
    res.json({ success: true, data: stats })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Public System & Kiosk Configuration (Served to Kiosk UI so no .env is needed in kiosk)
app.get(['/api/config', '/api/system/config'], (req, res) => {
  const kioskId = String(req.query.kioskId || req.headers['x-kiosk-id'] || 'PB-001').toUpperCase()
  const siteUrl = getPublicWebUrl(req)
  res.json({
    success: true,
    siteUrl,
    webUrl: siteUrl,
    clientWebUrl: siteUrl,
    kioskId,
    kioskPrintUrl: getKioskPrintUrl(kioskId, req),
    adminUrl: getAdminConsoleUrl(req),
  })
})

// Canonical Hardware Printer Status Probe (Used by Kiosk UI and watchdog)
app.get(['/api/printer/status', '/printer/status'], async (req, res) => {
  try {
    const rawKioskId = ((req.query.kioskId as string) || (req.headers['x-kiosk-id'] as string) || 'PB-001').toUpperCase()
    const isTestMode =
      (process.env.PRINT_MODE || '').toLowerCase() === 'test' ||
      process.env.MOCK_PRINTER === 'true' ||
      req.query.mock === '1' ||
      req.query.online === '1'

    if (isTestMode) {
      return res.json({
        success: true,
        isOnline: true,
        printerStatus: 'READY',
        activePrinter: 'PrintBooth Virtual Printer (Simulator)',
        kioskId: rawKioskId,
        isTestMode: true,
      })
    }

    const livePrinter = await getRealPrinterHardwareStatus()
    const piPrinters = getKioskPiPrinters(rawKioskId)
    const isUsbDisconnected = piPrinters ? piPrinters.usbConnected === false : false
    const isOnline = livePrinter.isOnline && !isUsbDisconnected
    const printerStatus = isOnline ? 'READY' : (isUsbDisconnected ? 'DISCONNECTED' : 'OFFLINE')
    res.json({
      success: true,
      isOnline,
      printerStatus,
      activePrinter: livePrinter.selectedPrinter || 'Brother DCP-T420W',
      kioskId: rawKioskId,
    })
  } catch (err: any) {
    res.status(500).json({ success: false, isOnline: false, printerStatus: 'OFFLINE', error: err.message })
  }
})

// Route Mounting
app.use('/api/admin', adminRouter)
app.use('/api/merchant', merchantRouter)
app.use('/api/kiosks', kiosksRouter)
app.use('/kiosks', kiosksRouter)
app.use('/api/orders', ordersRouter)
app.use('/orders', ordersRouter)
app.use('/api/jobs', ordersRouter)
app.use('/jobs', ordersRouter)
app.use('/api/activities', activitiesRouter)
app.use('/api/razorpay', razorpayRouter)
app.use('/api/upiexpress', upiExpressRouter)
app.use('/api/print', printRouter)
app.use('/print', printRouter)
app.get('/download/:orderId', (req, res, next) => {
  req.url = `/download/${req.params.orderId}`
  printRouter(req, res, next)
})
app.use('/api/installations', installationsRouter)
app.use('/api/admin/installations', installationsRouter)
app.use('/installations', installationsRouter)
app.use('/api/helpdesk', helpdeskRouter)
app.use('/api/admin/helpdesk', helpdeskRouter)
app.use('/helpdesk', helpdeskRouter)
app.use('/api/device', deviceRouter)
app.use('/demo', deviceRouter)
app.use('/api/kiosk-sessions', kioskSessionsRouter)
app.use('/kiosk-sessions', kioskSessionsRouter)
app.use('/api/advertisements', advertisementsRouter)
app.use('/api/ads', advertisementsRouter)
app.use('/advertisements', advertisementsRouter)
app.use('/api/webhooks', kiosksRouter)
app.use('/webhooks', kiosksRouter)

// Sample PDF endpoint for device agent testing
app.get(['/test_sample.pdf', '/api/test_sample.pdf'], (_req, res) => {
  const samplePath = path.resolve(__dirname, '../../../test_sample.pdf')
  if (fs.existsSync(samplePath)) {
    res.setHeader('Content-Type', 'application/pdf')
    res.sendFile(samplePath)
  } else {
    const minimalPdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n180\n%%EOF\n'
    res.setHeader('Content-Type', 'application/pdf')
    res.send(Buffer.from(minimalPdf))
  }
})

// Raspberry Pi Kiosk Brain sync endpoints
app.get('/api/kiosk/sync-file/:filename', (req, res) => {
  const filename = req.params.filename
  const allowed = ['cups_controller.py', 'hardware_monitor.py', 'ws_kiosk_client.py', 'requirements.txt', 'config.py']
  if (!allowed.includes(filename)) {
    return res.status(404).json({ error: 'File not permitted for sync' })
  }
  const targetPath = path.resolve(__dirname, '../../../kiosk/brain', filename)
  if (fs.existsSync(targetPath)) {
    res.setHeader('Content-Type', 'text/plain')
    res.sendFile(targetPath)
  } else {
    res.status(404).json({ error: `File ${filename} not found` })
  }
})

app.get('/api/kiosk/sync-script.sh', (req, res) => {
  const host = req.get('host') || (process.env.API_URL ? new URL(process.env.API_URL).host : (process.env.SITE_URL ? new URL(process.env.SITE_URL).host.replace(':5200', ':5000') : '192.168.1.41:5000'))
  const script = `#!/bin/bash
set -e
echo "══════════════════════════════════════════════════════"
echo "  PrintBooth Kiosk Brain: Fast Syncer & Driver Fix"
echo "══════════════════════════════════════════════════════"
TARGET_DIR="$HOME/kiosk/brain"
if [ ! -d "$TARGET_DIR" ]; then
  mkdir -p "$TARGET_DIR"
fi
cd "$TARGET_DIR"

echo "[1/5] Downloading latest brain controller files from ${host}..."
curl -s "http://${host}/api/kiosk/sync-file/cups_controller.py" -o cups_controller.py
curl -s "http://${host}/api/kiosk/sync-file/hardware_monitor.py" -o hardware_monitor.py
curl -s "http://${host}/api/kiosk/sync-file/ws_kiosk_client.py" -o ws_kiosk_client.py
curl -s "http://${host}/api/kiosk/sync-file/requirements.txt" -o requirements.txt
echo "  ✓ Files updated in $TARGET_DIR"

echo "[2/5] Installing Pillow and dependencies in Python environment..."
pip install pillow websockets || python3 -m pip install pillow websockets || pip3 install --break-system-packages pillow websockets

echo "[3/5] Enforcing CUPS queue defaults (copies=1, job-sheets=none)..."
lpoptions -p PrintBooth_Printer -o copies=1 -o job-sheets=none,none 2>/dev/null || true
sudo lpadmin -p PrintBooth_Printer -o copies-default=1 -o job-sheets-default=none,none 2>/dev/null || true

echo "[4/5] Resetting Brother hardware NVRAM copy register to 1..."
for br in /usr/bin/brprintconf_dcpt420w /opt/brother/Printers/dcpt420w/lpd/brprintconf_dcpt420w; do
  if [ -f "$br" ]; then
    "$br" -copies 1 -corm Mono 2>/dev/null || true
    echo "  ✓ Brother hardware configured: -copies 1 -corm Mono"
  fi
done

echo "[5/5] Launching PrintBooth WSS Kiosk Client..."
echo "══════════════════════════════════════════════════════"
python3 ws_kiosk_client.py
`
  res.setHeader('Content-Type', 'text/x-shellscript')
  res.send(script)
})

// Start Server
async function startServer() {
  // Connect to Redis & MongoDB
  initRedis()
  const db = await connectDB()
  if (db) {
    await seedDatabase()
  } else {
    console.warn('[Server] Running without active MongoDB connection. Configure MONGODB_URI in .env to connect.')
  }

  const server = http.createServer(app)
  initWebSocketRelay(server)
  initDeviceGateway(server)
  startFileRetentionCleanupDaemon()

  server.listen(PORT, () => {
    const rzpKey = process.env.RAZORPAY_KEY_ID || ''
    const rzpMode = rzpKey.startsWith('rzp_live') ? 'LIVE' : rzpKey.startsWith('rzp_test') ? 'TEST' : 'NOT SET'
    const rzpColor = rzpMode === 'LIVE' ? GREEN : rzpMode === 'TEST' ? YELLOW : RED
    const upieKey = process.env.UPIEXPRESS_API_KEY || ''
    const upieColor = upieKey.length > 0 ? GREEN : RED
    const upieStatus = upieKey.length > 0 ? 'CONFIGURED' : 'NOT SET'
    const redisColor = isRedisConnected() ? GREEN : YELLOW
    const redisStatus = isRedisConnected() ? 'CONNECTED' : 'IN-MEMORY FALLBACK'

    console.log(`\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`)
    console.log(`${BOLD}  PrintBooth API & WSS Relay  ${DIM}v1.0.0${RESET}`)
    console.log(`${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`)
    const printMode = (process.env.PRINT_MODE || 'real').toLowerCase()
    const printModeLabel = printMode === 'test' ? 'TEST (mock — no printer)' : 'REAL (physical hardware)'
    const printModeColor = printMode === 'test' ? YELLOW : GREEN

    console.log(`  ${GREEN}✓${RESET}  HTTP Server  ${BOLD}http://localhost:${PORT}${RESET}`)
    console.log(`  ${GREEN}⚡${RESET}  WSS Relay    ${BOLD}ws://localhost:${PORT}/ws${RESET}`)
    console.log(`  ${GREEN}✓${RESET}  Health       /api/health`)
    console.log(`  ${redisColor}⚡${RESET}  Redis Cache  ${BOLD}${redisColor}${redisStatus}${RESET}`)
    console.log(`  ${rzpColor}◆${RESET}  Razorpay     ${BOLD}${rzpColor}${rzpMode}${RESET}${rzpKey ? `  ${DIM}${rzpKey.slice(0, 16)}…${RESET}` : ''}`)
    console.log(`  ${upieColor}◆${RESET}  UPIExpress   ${BOLD}${upieColor}${upieStatus}${RESET}${upieKey ? `  ${DIM}${upieKey.slice(0, 8)}…${RESET}` : ''}`)
    console.log(`  ${printModeColor}🖨${RESET}  Print Mode   ${BOLD}${printModeColor}${printModeLabel}${RESET}`)
    console.log(`${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`)
  })
}

startServer()
