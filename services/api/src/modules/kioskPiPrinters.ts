export interface KioskPiPrinterItem {
  name: string
  info?: string
  state?: string
  is_default?: boolean
  is_online?: boolean
  device_uri?: string
  is_usb?: boolean
  connection_type?: string
  is_virtual?: boolean
  driver?: string
  port?: string
  status_labels?: string[]
}

export interface KioskPiPrintersData {
  kioskId: string
  activePrinter?: string
  printerName?: string
  printerModel?: string
  allPrinters: KioskPiPrinterItem[]
  isOnline: boolean
  printerStatus: string
  usbConnected?: boolean
  usbDevice?: string
  usbInfo?: any
  timestamp: number
}

const kioskPiPrintersCache = new Map<string, KioskPiPrintersData>()

/**
 * Checks whether the physical printer (Brother) is connected via USB according to latest Pi lsusb probe.
 */
export function isKioskUsbPrinterConnected(kioskId: string): boolean | undefined {
  const cleanId = (kioskId || 'PB-001').toUpperCase()
  const data = kioskPiPrintersCache.get(cleanId)
  if (!data) return undefined
  return data.usbConnected
}

/**
 * Stores live hardware telemetry pushed from the Raspberry Pi daemon (CUPS).
 */
export function recordPiPrinterTelemetry(kioskId: string, data: KioskPiPrintersData) {
  const cleanId = (kioskId || 'PB-001').toUpperCase()
  kioskPiPrintersCache.set(cleanId, data)
}

/**
 * Retrieves the physical CUPS printers connected to the Raspberry Pi for a kiosk.
 */
export function getKioskPiPrinters(kioskId: string): KioskPiPrintersData | undefined {
  const cleanId = (kioskId || 'PB-001').toUpperCase()
  return kioskPiPrintersCache.get(cleanId)
}

/**
 * Optimistically updates the selected default printer for the Raspberry Pi station.
 */
export function updatePiActivePrinter(kioskId: string, printerName: string) {
  const cleanId = (kioskId || 'PB-001').toUpperCase()
  const data = kioskPiPrintersCache.get(cleanId)
  if (data) {
    data.activePrinter = printerName
    if (Array.isArray(data.allPrinters)) {
      for (const p of data.allPrinters) {
        p.is_default = (p.name === printerName)
      }
    }
  }
}
