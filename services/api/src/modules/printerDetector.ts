import { cacheGet, cacheSet } from '../redis.js'
import { getKioskPiPrinters } from './kioskPiPrinters.js'
import { isKioskRelayConnected } from './wsRelay.js'

export interface RealPrinterStatus {
  isAvailable: boolean
  isHardwareReady: boolean
  hasPhysicalPrinter: boolean
  selectedPrinter: string
  statusCode: number
  statusLabels: string[]
  isOnline: boolean
  port?: string
  driver?: string
  connectionType?: string
  reason?: string
  issueCode?: string
  issueTitle?: string
  jobsCount?: number
  allPrinters?: any[]
  lastChecked: number
}

/**
 * Returns the live hardware printer status for the station.
 * Strictly queries Raspberry Pi CUPS telemetry and USB connectivity.
 * Never executes host OS / Windows Spooler detection to prevent developer PC printer leakage.
 */
export async function getRealPrinterHardwareStatus(forceFresh = false): Promise<RealPrinterStatus> {
  const isTestMode = (process.env.PRINT_MODE || '').toLowerCase() === 'test' || process.env.MOCK_PRINTER === 'true'
  if (isTestMode) {
    return {
      isAvailable: true,
      isHardwareReady: true,
      hasPhysicalPrinter: true,
      selectedPrinter: 'PrintBooth Virtual Printer (Simulator)',
      statusCode: 0,
      statusLabels: ['READY', 'SIMULATED'],
      isOnline: true,
      port: 'VIRTUAL-SIM',
      driver: 'PrintBooth Virtual Driver (Test Mode)',
      connectionType: 'TEST_SIMULATION',
      jobsCount: 0,
      allPrinters: [{ name: 'PrintBooth Virtual Printer (Simulator)', status: 'idle' }],
      lastChecked: Date.now(),
    }
  }

  const kioskId = 'PB-001'
  const isRelayConnected = isKioskRelayConnected(kioskId)
  const piData = getKioskPiPrinters(kioskId)

  if (isRelayConnected && piData) {
    const isOnline = Boolean(piData.isOnline && piData.usbConnected !== false)
    const statusLabels = isOnline
      ? ['READY']
      : piData.usbConnected === false
      ? ['PRINTER_USB_DISCONNECTED', 'OFFLINE']
      : ['OFFLINE']

    const status: RealPrinterStatus = {
      isAvailable: isOnline,
      isHardwareReady: isOnline,
      hasPhysicalPrinter: true,
      selectedPrinter: piData.activePrinter || 'Brother DCP-T420W',
      statusCode: isOnline ? 0 : 512,
      statusLabels,
      isOnline,
      port: 'USB (Raspberry Pi)',
      driver: 'Brother DCP-T420W CUPS Linux Driver',
      connectionType: 'USB',
      reason: isOnline
        ? undefined
        : piData.usbConnected === false
        ? 'Brother printer USB cable is disconnected from the Raspberry Pi.'
        : 'Printer is offline or paused in CUPS.',
      issueCode: isOnline
        ? undefined
        : piData.usbConnected === false
        ? 'PRINTER_USB_DISCONNECTED'
        : 'PRINTER_OFFLINE',
      issueTitle: isOnline
        ? undefined
        : piData.usbConnected === false
        ? 'Brother Printer USB Disconnected'
        : 'Printer Offline',
      jobsCount: 0,
      allPrinters: piData.allPrinters || [],
      lastChecked: piData.timestamp || Date.now(),
    }

    cacheSet('printer:live_status', status, 10).catch(() => {})
    return status
  }

  // Station is offline or waiting for Raspberry Pi daemon heartbeat
  const offlineStatus: RealPrinterStatus = {
    isAvailable: false,
    isHardwareReady: false,
    hasPhysicalPrinter: true,
    selectedPrinter: 'Brother DCP-T420W',
    statusCode: 0,
    statusLabels: ['OFFLINE', 'PI_DISCONNECTED'],
    isOnline: false,
    port: 'USB',
    driver: 'Brother DCP-T420W CUPS Linux Driver',
    connectionType: 'USB',
    reason: 'Raspberry Pi station is currently offline or waiting for CUPS daemon.',
    issueCode: 'MACHINE_POWERED_OFF',
    issueTitle: 'Station is Offline',
    jobsCount: 0,
    allPrinters: [],
    lastChecked: Date.now(),
  }

  return offlineStatus
}

