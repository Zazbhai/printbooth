import { getApiBaseUrl } from './config'

const API_BASE = getApiBaseUrl()

export async function getLiveKiosks() {
  try {
    const res = await fetch(`${API_BASE}/kiosks`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const list = Array.isArray(json.data) ? json.data : []
    return list.filter((k: any) => !k.isBlocked && !k.merchantBlocked && k.status !== 'BLOCKED')
  } catch (err) {
    console.warn('[Web API] Backend offline, using local fallback:', err)
    return null
  }
}

export async function getKioskDetails(id: string) {
  try {
    const cleanId = encodeURIComponent((id || '').trim().toUpperCase())
    const res = await fetch(`${API_BASE}/kiosks/${cleanId}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return json.data
  } catch (err) {
    console.warn('[Web API] Error fetching kiosk details:', err)
    return null
  }
}

export async function createPrintOrder(data: {
  kioskId: string
  fileName: string
  fileSize?: number
  pageCount: number
  copies: number
  colourMode: 'BW' | 'COLOUR' | string
  duplex: 'SINGLE' | 'DOUBLE' | string
  paperSize?: 'A4' | 'A3' | 'LETTER' | 'LEGAL' | string
  pageRange?: string
  amount?: number
  printSettings?: Record<string, any>
  customerPhone?: string
  customerEmail?: string
}) {
  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return json.data
  } catch (err) {
    console.warn('[Web API] Error creating order:', err)
    return null
  }
}

export async function getOrder(id: string) {
  try {
    const res = await fetch(`${API_BASE}/orders/${id}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return json.data
  } catch (err) {
    console.warn('[Web API] Error fetching order:', err)
    return null
  }
}

export async function sendPrintJob(params: {
  file?: File
  fileName?: string
  orderId: string
  kioskId?: string
  copies?: number
  colourMode?: 'BW' | 'COLOUR' | string
  pages?: string
  pageCount?: number
  totalPages?: number
  duplex?: 'SINGLE' | 'DOUBLE' | string
  paperSize?: string
  scaling?: string
  customScalePercent?: number
  dpi?: string | number
  orientation?: string
  pagesPerSheet?: number | string
  margins?: string
  contrastMode?: string
  pageBorder?: boolean
  releasePin?: string
  /** JSON object: page-number → colour override e.g. {"1":"BW","3":"COLOUR"} */
  pageColours?: Record<string, string>
  /** JSON object: page-number → copy count e.g. {"1":2,"4":3} */
  pageCopies?: Record<string, number>
}) {
  try {
    const formData = new FormData()
    if (params.file) {
      formData.append('file', params.file, params.file.name)
    }
    if (params.fileName) {
      formData.append('fileName', params.fileName)
    }
    formData.append('orderId', params.orderId)
    if (params.kioskId) {
      formData.append('kioskId', params.kioskId)
    }
    if (params.releasePin) {
      formData.append('releasePin', params.releasePin)
      formData.append('otp', params.releasePin)
    }
    if (params.copies)             formData.append('copies',             String(params.copies))
    if (params.totalPages)         formData.append('totalPages',         String(params.totalPages))
    if (params.pageCount)          formData.append('pageCount',          String(params.pageCount))
    if (params.colourMode)         formData.append('colourMode',         params.colourMode)
    if (params.pages)              formData.append('pages',              params.pages)
    if (params.duplex)             formData.append('duplex',             params.duplex)
    if (params.paperSize)          formData.append('paperSize',          params.paperSize)
    if (params.scaling)            formData.append('scaling',            params.scaling)
    if (params.customScalePercent) formData.append('customScalePercent', String(params.customScalePercent))
    if (params.dpi)                formData.append('dpi',                String(params.dpi))
    if (params.orientation)        formData.append('orientation',        params.orientation)
    if (params.pagesPerSheet)      formData.append('pagesPerSheet',      String(params.pagesPerSheet))
    if (params.margins)            formData.append('margins',            params.margins)
    if (params.contrastMode)       formData.append('contrastMode',       params.contrastMode)
    if (params.pageBorder !== undefined) formData.append('pageBorder',   String(params.pageBorder))
    if (params.pageColours && Object.keys(params.pageColours).length > 0) {
      formData.append('pageColours', JSON.stringify(params.pageColours))
    }
    if (params.pageCopies && Object.keys(params.pageCopies).length > 0) {
      formData.append('pageCopies', JSON.stringify(params.pageCopies))
    }

    const headers: Record<string, string> = {}
    if (params.kioskId) {
      headers['x-kiosk-id'] = params.kioskId
    }

    const res = await fetch(`${API_BASE}/print/execute`, {
      method: 'POST',
      headers,
      body: formData,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return json
  } catch (err) {
    console.warn('[Web API] Error sending print job:', err)
    return null
  }
}


export async function getPrintJobStatus(orderId: string) {
  try {
    const res = await fetch(`${API_BASE}/print/status/${orderId}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return json.data
  } catch (err) {
    return null
  }
}

export async function inspectDocument(file: File): Promise<{ pageCount: number; previews?: any[] } | null> {
  try {
    const formData = new FormData()
    formData.append('file', file, file.name)
    const res = await fetch(`${API_BASE}/print/inspect`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.data && json.data.pageCount) {
      return json.data
    }
    return null
  } catch (err) {
    console.warn('[Web API] Document inspection error:', err)
    return null
  }
}

export interface PrinterDetectResult {
  success: boolean
  isAvailable?: boolean
  isHardwareReady?: boolean
  hasPhysicalPrinter?: boolean
  issueCode?: string
  issueTitle?: string
  selectedPrinter: string
  reason?: string
  mode?: string
  isTestMode?: boolean
  details?: {
    name: string
    port: string
    is_online: boolean
    connection_type: string
    status_code?: number
    status_labels?: string[]
    is_virtual?: boolean
    is_connected?: boolean
    hardware_issue?: string | null
  }
  printers?: any[]
}

export interface PrinterAvailabilityCheck {
  isAvailable: boolean
  reason: string
  detail: string
  kioskName?: string
  printerName?: string
}

export async function detectConnectedPrinter(preferred?: string, kioskId?: string): Promise<PrinterDetectResult | null> {
  try {
    const params = new URLSearchParams()
    if (preferred) params.set('preferred', preferred)
    if (kioskId) params.set('kioskId', kioskId)
    const qs = params.toString()
    const url = qs ? `${API_BASE}/print/detect?${qs}` : `${API_BASE}/print/detect`
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    console.warn('[Web API] Printer detection query failed:', err)
    return null
  }
}

export async function checkPrinterHardwareStatus(kioskId?: string, preferredPrinter?: string): Promise<PrinterAvailabilityCheck> {
  const envTest = (import.meta.env.VITE_PRINT_MODE || '').toLowerCase() === 'test'
  const sessionTest = (sessionStorage.getItem('pb_print_mode') || '').toLowerCase() === 'test'
  const isClientTestMode = envTest || sessionTest

  const targetKioskId = ((kioskId || (typeof window !== 'undefined' ? sessionStorage.getItem('pb_kiosk_id') : null) || 'PB-001') as string).trim().toUpperCase()

  // 1. Check live kiosk IoT fleet telemetry from database
  try {
    const kiosk = await getKioskDetails(targetKioskId)
    if (kiosk) {
      const isMaintenance = String(kiosk.status || '').toUpperCase() === 'MAINTENANCE'
      const isKioskOffline = String(kiosk.status || '').toUpperCase() === 'OFFLINE'
      const pStatus = String(kiosk.printerStatus || '').toUpperCase()
      const isPrinterProblem = pStatus === 'ERROR' || pStatus === 'OFFLINE' || pStatus === 'PAPER_JAM' || pStatus === 'PAPER_EMPTY'
      const isUsbDisconnected = (kiosk as any).usbConnected === false

      if (isMaintenance) {
        return {
          isAvailable: false,
          reason: 'Kiosk Under Maintenance',
          detail: 'This printing station is temporarily undergoing scheduled maintenance. Please visit another station.',
          kioskName: kiosk.name,
          printerName: kiosk.printerModel || kiosk.printer,
        }
      }

      if (isUsbDisconnected) {
        return {
          isAvailable: false,
          reason: 'Printer is disconnected via USB',
          detail: `The physical printer at station ${kiosk.kioskId || targetKioskId} is not detected on the USB bus. Please ensure the USB cable is plugged in and printer power is ON.`,
          kioskName: kiosk.name,
          printerName: kiosk.printerModel || kiosk.printer || 'Laser Print Engine',
        }
      }

      const isHwUnavailable = Boolean(kiosk.hardwareDetails && (kiosk.hardwareDetails.isAvailable === false || kiosk.hardwareDetails.isOnline === false))

      if (isKioskOffline || isPrinterProblem || isHwUnavailable) {
        return {
          isAvailable: false,
          reason: 'PRINTER OFFLINE',
          detail: `Station ${kiosk.kioskId || targetKioskId} is currently offline. Printing will resume automatically once the station powers on.`,
          kioskName: kiosk.name,
          printerName: kiosk.printerModel || kiosk.printer,
        }
      }

      // Kiosk is ONLINE and printer is ready/available according to IoT heartbeat & hardware telemetry
      const isKioskOnline = String(kiosk.status || '').toUpperCase() === 'ONLINE'
      const isPrinterReady =
        ['READY', 'IDLE', 'PRINTING', 'ONLINE', 'AVAILABLE'].includes(pStatus) ||
        Boolean(kiosk.hardwareDetails?.isHardwareReady) ||
        Boolean(kiosk.hardwareDetails?.isAvailable)

      if (isKioskOnline && isPrinterReady) {
        return {
          isAvailable: true,
          reason: '',
          detail: '',
          kioskName: kiosk.name,
          printerName: kiosk.hardwareDetails?.selectedPrinter || kiosk.printerModel || kiosk.printer || 'Laser Print Engine',
        }
      }
    }
  } catch (err) {
    console.warn('[Web API] Error checking kiosk telemetry in checkPrinterHardwareStatus:', err)
  }

  // 2. Fallback to live detected hardware via backend detector endpoint
  try {
    const detectRes = await detectConnectedPrinter(preferredPrinter, targetKioskId)
    const isTest = isClientTestMode || Boolean((detectRes as any)?.isTestMode) || detectRes?.mode === 'test'

    if (isTest) {
      return {
        isAvailable: true,
        reason: '',
        detail: '',
        printerName: detectRes?.selectedPrinter || preferredPrinter || 'PrintBooth Station',
      }
    }

    if (!detectRes) {
      // Backend is offline or didn't return detection payload
      return {
        isAvailable: false,
        reason: 'Cannot connect to PrintBooth printer service',
        detail: 'Unable to communicate with local hardware daemon. Please verify backend service is running.',
        printerName: preferredPrinter,
      }
    }

    if (detectRes.issueCode === 'PRINTER_USB_DISCONNECTED') {
      return {
        isAvailable: false,
        reason: 'Printer is disconnected via USB',
        detail: detectRes.reason || 'The physical printer is not detected on the USB bus. Please ensure USB cable is connected and power is turned on.',
        printerName: detectRes.selectedPrinter || detectRes.details?.name || 'Laser Print Engine',
      }
    }

    if (detectRes.isAvailable === false || detectRes.isHardwareReady === false) {
      return {
        isAvailable: false,
        reason: detectRes.issueTitle || 'Printer not available right now, visit later',
        detail: detectRes.reason || 'The printer is reporting a hardware condition, is disconnected, or is turned off.',
        printerName: detectRes.selectedPrinter || detectRes.details?.name,
      }
    }

    // Check physical printers list
    const physicalPrinters = (detectRes.printers || []).filter((p: any) => !p.is_virtual)
    if (detectRes.printers && detectRes.printers.length > 0 && physicalPrinters.length === 0) {
      return {
        isAvailable: false,
        reason: 'No physical printer connected to this station',
        detail: 'No physical hardware printer was detected. Please connect an active printer before uploading.',
        printerName: detectRes.selectedPrinter,
      }
    }

    // Check selected printer details
    if (detectRes.details) {
      const d = detectRes.details
      if (d.is_virtual) {
        return {
          isAvailable: false,
          reason: 'No physical printer connected',
          detail: 'Only virtual software printers are installed. A physical hardware printer is required to print.',
          printerName: d.name,
        }
      }
      if (!d.is_connected) {
        return {
          isAvailable: false,
          reason: detectRes.issueTitle || 'Printer is disconnected / unplugged',
          detail: d.hardware_issue || detectRes.reason || `Printer "${d.name}" is not physically connected.`,
          printerName: d.name,
        }
      }
      if (!d.is_online) {
        return {
          isAvailable: false,
          reason: detectRes.issueTitle || 'Printer is offline right now',
          detail: d.hardware_issue || detectRes.reason || `Printer "${d.name}" on port ${d.port || 'USB'} is powered off or offline.`,
          printerName: d.name,
        }
      }
      const labels = (d.status_labels || []).map((s: string) => s.toUpperCase())
      const errorLabels = labels.filter((s: string) =>
        ['ERROR', 'OFFLINE', 'DISCONNECTED', 'USB_UNPLUGGED', 'PAPER_JAM', 'PAPER_OUT', 'DOOR_OPEN', 'OUT_OF_MEMORY', 'USER_INTERVENTION', 'NOT_AVAILABLE', 'PAUSED'].includes(s) || s.startsWith('DEVICE_PROBLEM')
      )
      if (errorLabels.length > 0) {
        return {
          isAvailable: false,
          reason: detectRes.issueTitle || `Printer Alert: ${errorLabels.join(', ')}`,
          detail: d.hardware_issue || detectRes.reason || `Printer "${d.name}" is currently reporting an error (${errorLabels.join(', ')}). Printing is temporarily paused.`,
          printerName: d.name,
        }
      }
    }

    // If detector returned a valid ready printer, return available
    return {
      isAvailable: true,
      reason: '',
      detail: '',
      printerName: detectRes.selectedPrinter || detectRes.details?.name,
    }
  } catch (err) {
    if (isClientTestMode) {
      return {
        isAvailable: true,
        reason: '',
        detail: '',
        printerName: preferredPrinter || 'Laser Print Engine',
      }
    }
    console.warn('[Web API] Hardware detect check failed:', err)
    return {
      isAvailable: false,
      reason: 'Hardware check failed',
      detail: 'Failed to poll printer status. Please ensure printer is plugged in and turned on.',
      printerName: preferredPrinter,
    }
  }
}

export async function cancelPrintJob(printerName?: string, jobId?: number): Promise<{ success: boolean; message?: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/print/queue/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerName, jobId }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn('[Web API] Cancel print / queue clear request error:', err)
    return null
  }
}

export async function submitInstallationRequest(data: any): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/installations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return json.data || json
  } catch (err) {
    console.warn('[Web API] Error submitting installation request to backend:', err)
    return null
  }
}

export async function submitHelpDeskTicket(data: any): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/helpdesk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return json.data || json
  } catch (err) {
    console.warn('[Web API] Error submitting helpdesk ticket to backend:', err)
    return null
  }
}

export async function verifyKioskPin(kioskId: string, pin: string): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/kiosks/${encodeURIComponent(kioskId)}/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    const json = await res.json()
    return json
  } catch (err) {
    console.warn('[Web API] Error verifying PIN:', err)
    return { success: false, error: String(err) }
  }
}




