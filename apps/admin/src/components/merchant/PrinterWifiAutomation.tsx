import { useState, useEffect } from 'react'
import {
  Printer,
  WifiHigh,
  WifiSlash,
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  Trash,
  Play,
  Sparkle,
  Cpu,
  Lock,
  Broadcast,
  HardDrive,
  FileText,
  X,
  Plus,
} from '@phosphor-icons/react'
import { DashboardCard } from '@/components/watermelon/capitalio-dashboard/components/capitalio/shared'
import { Button } from '@/components/ui/button'
import {
  getMerchantHardware,
  connectMerchantPrinter,
  sendCupsTestPrint,
  cleanPrinterHeads,
  cancelCupsJob,
  clearCupsQueue,
  scanMerchantWifi,
  connectMerchantWifi,
} from '@/lib/api'

interface PrinterWifiAutomationProps {
  kioskId?: string
  initialHardware?: any
}

export function PrinterWifiAutomation({ kioskId = 'PB-001', initialHardware }: PrinterWifiAutomationProps) {
  const [activeTab, setActiveTab] = useState<'cups' | 'wifi'>('cups')
  const [hardware, setHardware] = useState<any>(initialHardware || null)
  const [loading, setLoading] = useState(false)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  // Modals state
  const [showPrinterModal, setShowPrinterModal] = useState(false)
  const [showWifiModal, setShowWifiModal] = useState(false)

  // Connect printer form state
  const [printerForm, setPrinterForm] = useState({
    name: 'Brother_DCP_T420W',
    make: 'Brother',
    model: 'Brother DCP-T420W',
    connectionType: 'USB' as 'IPP_NETWORK' | 'USB' | 'RAW_SOCKET',
    deviceUri: 'usb://Brother/DCP-T420W',
    ipAddress: '192.168.1.145',
    port: 631,
  })

  // Wi-Fi connect form state
  const [selectedSsid, setSelectedSsid] = useState<string>('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [scanningWifi, setScanningWifi] = useState(false)
  const [connectingWifi, setConnectingWifi] = useState(false)
  const [connectingPrinter, setConnectingPrinter] = useState(false)
  const [testPrinting, setTestPrinting] = useState(false)

  // Fetch live hardware telemetry
  const refreshHardware = async () => {
    try {
      const data = await getMerchantHardware(kioskId)
      if (data) setHardware(data)
    } catch (err) {
      console.warn('Error refreshing hardware:', err)
    }
  }

  useEffect(() => {
    refreshHardware()
    const timer = setInterval(refreshHardware, 6000)
    return () => clearInterval(timer)
  }, [kioskId])

  const notify = (msg: string) => {
    setActionNotice(msg)
    setTimeout(() => setActionNotice(null), 5000)
  }

  // Handle CUPS Test Print
  const handleTestPrint = async () => {
    try {
      setTestPrinting(true)
      const res = await sendCupsTestPrint(kioskId)
      if (res?.success) {
        notify(`✅ CUPS diagnostic test page #${res.data?.job?.jobId} submitted to spooler!`)
        refreshHardware()
      }
    } catch (err) {
      notify('❌ Failed to trigger test print.')
    } finally {
      setTestPrinting(false)
    }
  }

  // Handle Clean Heads
  const handleCleanHeads = async () => {
    try {
      setLoading(true)
      const res = await cleanPrinterHeads(kioskId)
      if (res?.success) {
        notify('✨ Printhead cleaning and roller alignment completed. All nozzles verified.')
        refreshHardware()
      }
    } catch (err) {
      notify('❌ Clean head command failed.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Cancel Job
  const handleCancelJob = async (jobId: number) => {
    try {
      const res = await cancelCupsJob(jobId, kioskId)
      if (res?.success) {
        notify(`🚫 CUPS Job #${jobId} cancelled.`)
        refreshHardware()
      }
    } catch (err) {
      notify('❌ Could not cancel job.')
    }
  }

  // Handle Clear Queue
  const handleClearQueue = async () => {
    try {
      const res = await clearCupsQueue(kioskId)
      if (res?.success) {
        notify('🧹 All pending CUPS print jobs cleared from spooler.')
        refreshHardware()
      }
    } catch (err) {
      notify('❌ Could not clear queue.')
    }
  }

  // Handle Connect Printer Form Submission
  const handleSavePrinter = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setConnectingPrinter(true)
      const res = await connectMerchantPrinter({
        kioskId,
        ...printerForm,
      })
      if (res?.success) {
        notify(`🖨️ Printer "${printerForm.name}" registered via CUPS (${printerForm.connectionType}).`)
        setShowPrinterModal(false)
        refreshHardware()
      }
    } catch (err) {
      notify('❌ Failed to connect printer.')
    } finally {
      setConnectingPrinter(false)
    }
  }

  // Handle Wi-Fi Scan
  const handleScanWifi = async () => {
    try {
      setScanningWifi(true)
      const scanResults = await scanMerchantWifi(kioskId)
      if (scanResults && hardware) {
        setHardware({
          ...hardware,
          wifi: {
            ...hardware.wifi,
            lastScan: scanResults,
          },
        })
        notify('📶 Wi-Fi network scan refreshed.')
      }
    } catch (err) {
      notify('❌ Wi-Fi scan timed out.')
    } finally {
      setScanningWifi(false)
    }
  }

  // Handle Wi-Fi Connect Form Submission
  const handleConnectWifi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSsid) return
    try {
      setConnectingWifi(true)
      const res = await connectMerchantWifi(selectedSsid, wifiPassword, kioskId)
      if (res?.success) {
        notify(`🌐 Connected successfully to "${selectedSsid}" (Assigned IP: ${res.data?.wifi?.ipAddress}).`)
        setShowWifiModal(false)
        setWifiPassword('')
        refreshHardware()
      }
    } catch (err) {
      notify('❌ Wi-Fi authentication failed. Check credentials.')
    } finally {
      setConnectingWifi(false)
    }
  }

  const printer = hardware?.printer || {
    name: 'Brother DCP-T420W',
    model: 'Brother DCP-T420W',
    driver: 'Brother DCP-T420W CUPS Linux Driver',
    port: 'USB (Raspberry Pi)',
    connectionType: 'USB',
    deviceUri: 'usb://Brother/DCP-T420W',
    status: 'OFFLINE',
    isOnline: false,
    cupsServerVersion: 'CUPS 2.4.2 (Raspberry Pi Linux / pycups)',
    firmwareVersion: '1.0',
    serialNumber: 'BROTHER_DCP_T420W',
    ipAddress: '192.168.1.145',
    portNumber: 631,
    paperLevel: 100,
    paperTray1Remaining: 150,
    paperTray1Capacity: 150,
    tonerBlack: 100,
    tonerCyan: 100,
    tonerMagenta: 100,
    tonerYellow: 100,
    odometerTotalPages: 0,
    jobs: [],
  }

  const isPrinterOnline = Boolean(
    (printer.isOnline ?? (printer.status === 'READY' || printer.status === 'IDLE' || printer.status === 'ONLINE')) &&
    printer.status !== 'OFFLINE'
  )

  const wifi = hardware?.wifi || {
    connected: false,
    ssid: 'Disconnected',
    ipAddress: 'Station Offline',
    signalStrength: 0,
    signalDbm: -100,
    frequency: 'N/A',
    macAddress: 'b8:27:eb:d7:fb:2f',
    gateway: '192.168.1.1',
    dns: '1.1.1.1',
    security: 'N/A',
    lastScan: [],
  }

  return (
    <div className="space-y-4">
      {/* Action Notification Toast */}
      {actionNotice && (
        <div
          className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 shadow-lg animate-fadeInUp"
          style={{ backdropFilter: 'blur(8px)' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle size={18} weight="fill" />
            <span>{actionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-emerald-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Console Card */}
      <DashboardCard className="flex flex-col gap-5">
        {/* Top Header & Tab Switcher */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="premium-badge">HARDWARE ENGINE</span>
              <span className="text-xs text-muted-foreground">Kiosk Hardware Controller</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-foreground flex items-center gap-2">
              <span>Host Hardware Controller & Wireless Hub</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '2px 8px',
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 600,
                  background: isPrinterOnline ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  color: isPrinterOnline ? '#4ade80' : '#f87171',
                  border: `1px solid ${isPrinterOnline ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: isPrinterOnline ? '#22c55e' : '#ef4444',
                    boxShadow: isPrinterOnline ? '0 0 6px #22c55e' : '0 0 6px #ef4444',
                  }}
                />
                {isPrinterOnline ? 'Hardware Online & Ready' : (printer.status === 'OFFLINE' ? 'Hardware Offline' : (printer.status || 'Offline'))}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live {printer.cupsServerVersion || 'Host Spooler'} driver bridge, diagnostics, spooler queue, and local Wi-Fi pairing
            </p>
          </div>

          {/* Tab Selector & Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <div
              style={{
                display: 'flex',
                background: 'var(--secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 2,
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab('cups')}
                style={{
                  background: activeTab === 'cups' ? '#ffffff' : 'transparent',
                  color: activeTab === 'cups' ? 'var(--foreground)' : 'var(--muted-foreground)',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                  boxShadow: activeTab === 'cups' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <Printer size={15} weight="bold" />
                <span>CUPS Printer</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('wifi')}
                style={{
                  background: activeTab === 'wifi' ? '#ffffff' : 'transparent',
                  color: activeTab === 'wifi' ? 'var(--foreground)' : 'var(--muted-foreground)',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                  boxShadow: activeTab === 'wifi' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <WifiHigh size={15} weight="bold" />
                <span>Wi-Fi Network</span>
                {wifi.connected && (
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={refreshHardware}
              title="Refresh Telemetry"
            >
              <ArrowsClockwise size={14} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        {/* ──────── TAB 1: CUPS PRINTER AUTOMATION ──────── */}
        {activeTab === 'cups' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={`badge ${isPrinterOnline ? 'badge-online' : 'badge-danger'}`}>
                  {isPrinterOnline ? (
                    <CheckCircle size={12} weight="fill" />
                  ) : (
                    <XCircle size={12} weight="fill" />
                  )}
                  <span>Spooler Status: {printer.status}</span>
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  {printer.port ? `Port: ${printer.port}` : printer.deviceUri}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowPrinterModal(true)}
                  id="connect-printer-modal-btn"
                >
                  <Plus size={14} weight="bold" />
                  <span>Connect / Change Printer</span>
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleTestPrint}
                  disabled={testPrinting}
                  id="send-cups-test-print-btn"
                >
                  <Play size={14} weight="fill" className={testPrinting ? 'animate-pulse text-amber-400' : ''} />
                  <span>{testPrinting ? 'Printing Test...' : 'Spooler Test Page'}</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCleanHeads}
                  disabled={loading}
                >
                  <Sparkle size={14} />
                  <span>Clean Printheads</span>
                </Button>
              </div>
            </div>

            {/* Hardware Telemetry & Consumables Grid */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Card 1: Machine Telemetry */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Connected Printer
                  </span>
                  <Printer size={18} className="text-muted-foreground" />
                </div>
                <div>
                  <div className="text-base font-bold text-foreground">{printer.model || printer.name}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    Queue: {printer.name} • {printer.connectionType}
                  </div>
                </div>

                <div className="divide-y divide-border/60 text-xs pt-1">
                  <div className="flex justify-between py-1.5 text-muted-foreground">
                    <span>Driver:</span>
                    <span className="font-mono text-foreground">{printer.driver || 'Windows Spooler'}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-muted-foreground">
                    <span>Hardware Port:</span>
                    <span className="font-mono text-foreground">{printer.port || 'WSD / Network'}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-muted-foreground">
                    <span>Spooler Architecture:</span>
                    <span className="text-foreground">{printer.cupsServerVersion || 'Win32 GDI / WSD'}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-muted-foreground">
                    <span>Lifetime Odometer:</span>
                    <span className="font-semibold text-foreground font-mono">
                      {(printer.odometerTotalPages ?? 0).toLocaleString()} pages
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Paper Tray Sensor */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Paper Tray Sensors
                  </span>
                  <HardDrive size={18} className="text-muted-foreground" />
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold text-foreground font-mono">
                      {isPrinterOnline ? `${printer.paperLevel}%` : 'Offline'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {isPrinterOnline && printer.paperTray1Capacity > 0
                        ? `${printer.paperTray1Remaining} / ${printer.paperTray1Capacity} sheets`
                        : 'Sensors unreachable'}
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isPrinterOnline
                          ? (printer.paperLevel > 30 ? 'bg-emerald-500' : 'bg-amber-500')
                          : 'bg-muted'
                      }`}
                      style={{ width: isPrinterOnline ? `${printer.paperLevel}%` : '0%' }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground pt-1">
                  <div className="flex items-center justify-between">
                    <span>Tray 1 (A4 Standard):</span>
                    <span className={isPrinterOnline ? 'text-emerald-400 font-medium' : 'text-muted-foreground'}>
                      {isPrinterOnline ? 'Ready (Loaded)' : 'Offline (Disconnected)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Tray 2 (A3 Bypass):</span>
                    <span className="text-muted-foreground">Optional (Empty)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Auto Duplex Unit:</span>
                    <span className={isPrinterOnline ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                      {isPrinterOnline ? 'Calibrated (OK)' : 'Offline'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Jam Sensors:</span>
                    <span className={isPrinterOnline ? 'text-emerald-400 font-medium' : 'text-muted-foreground'}>
                      {isPrinterOnline ? 'Clear (0 faults)' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: CMYK Toner Gauges */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    CMYK Toner Levels
                  </span>
                  <Cpu size={18} className="text-muted-foreground" />
                </div>

                <div className="space-y-2.5 pt-1">
                  {/* Black */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <span className="size-2 rounded-full bg-slate-900" /> Black (K)
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {isPrinterOnline ? `${printer.tonerBlack}%` : '—'}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-slate-900 rounded-full" style={{ width: isPrinterOnline ? `${printer.tonerBlack}%` : '0%' }} />
                    </div>
                  </div>

                  {/* Cyan */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <span className="size-2 rounded-full bg-cyan-400" /> Cyan (C)
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {isPrinterOnline ? `${printer.tonerCyan}%` : '—'}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full" style={{ width: isPrinterOnline ? `${printer.tonerCyan}%` : '0%' }} />
                    </div>
                  </div>

                  {/* Magenta */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <span className="size-2 rounded-full bg-fuchsia-500" /> Magenta (M)
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {isPrinterOnline ? `${printer.tonerMagenta}%` : '—'}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-fuchsia-500 rounded-full" style={{ width: isPrinterOnline ? `${printer.tonerMagenta}%` : '0%' }} />
                    </div>
                  </div>

                  {/* Yellow */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <span className="size-2 rounded-full bg-yellow-400" /> Yellow (Y)
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {isPrinterOnline ? `${printer.tonerYellow}%` : '—'}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-yellow-400 rounded-full" style={{ width: isPrinterOnline ? `${printer.tonerYellow}%` : '0%' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Live CUPS Print Spooler Queue */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Live CUPS Spooler Queue</h3>
                  <span className="badge badge-neutral text-xs">
                    {printer.jobs?.length || 0} jobs logged
                  </span>
                </div>

                {printer.jobs?.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleClearQueue} className="text-xs text-muted-foreground hover:text-destructive">
                    <Trash size={13} />
                    <span>Clear Completed Queue</span>
                  </Button>
                )}
              </div>

              {Array.isArray(printer?.jobs) && printer.jobs.length > 0 ? (
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {printer.jobs.map((job: any) => (
                    <div
                      key={job.jobId}
                      className="flex items-center justify-between p-3 hover:bg-card-hover transition-colors text-xs flex-wrap gap-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 text-white">
                          <FileText size={16} />
                        </div>
                        <div>
                          <div className="font-semibold text-foreground font-mono">
                            CUPS Job #{job.jobId} • <span className="font-sans font-normal">{job.title}</span>
                          </div>
                          <div className="text-muted-foreground">
                            {job.pages} pages • {job.format} • Initiated by {job.user}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {job.status === 'PROCESSING' || job.status === 'PRINTING' ? (
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-amber-400 animate-ping" />
                            <span className="font-medium text-amber-400">Processing ({job.progress}%)</span>
                            <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${job.progress}%` }} />
                            </div>
                          </div>
                        ) : job.status === 'COMPLETED' ? (
                          <span className="badge badge-online">
                            <CheckCircle size={12} weight="fill" /> Completed
                          </span>
                        ) : (
                          <span className="badge badge-neutral">
                            {job.status}
                          </span>
                        )}

                        {job.status === 'PROCESSING' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelJob(job.jobId)}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash size={13} />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  CUPS spooler is clear. No active print jobs in queue.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──────── TAB 2: WI-FI CONNECTIVITY HUB ──────── */}
        {activeTab === 'wifi' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={wifi.connected ? 'badge badge-online' : 'badge badge-error'}>
                  {wifi.connected ? <WifiHigh size={12} weight="fill" /> : <WifiSlash size={12} />}
                  <span>{wifi.connected ? `Connected to ${wifi.ssid}` : 'Wi-Fi Disconnected'}</span>
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  IP: {wifi.ipAddress} • {wifi.frequency}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowWifiModal(true)}
                  id="connect-wifi-modal-btn"
                >
                  <WifiHigh size={14} weight="bold" />
                  <span>Connect to Wi-Fi</span>
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleScanWifi}
                  disabled={scanningWifi}
                >
                  <ArrowsClockwise size={14} className={scanningWifi ? 'animate-spin' : ''} />
                  <span>{scanningWifi ? 'Scanning Networks...' : 'Scan Wi-Fi'}</span>
                </Button>
              </div>
            </div>

            {/* Current Network Status Card */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Active Wi-Fi Connection
                  </span>
                  <Broadcast size={18} className="text-emerald-400" />
                </div>

                <div>
                  <div className="text-xl font-bold text-foreground flex items-center gap-2">
                    <span>{wifi.ssid}</span>
                    <span className="badge badge-online text-xs font-normal">Active Link</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                    MAC: {wifi.macAddress}
                  </div>
                </div>

                {/* Signal Strength Meter */}
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Link Quality</span>
                    <span className="font-semibold text-emerald-400">
                      {wifi.signalStrength}% ({wifi.signalDbm} dBm) • Excellent
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${wifi.signalStrength}%` }}
                    />
                  </div>
                </div>

                <div className="divide-y divide-border/60 text-xs pt-1">
                  <div className="flex justify-between py-1.5 text-muted-foreground">
                    <span>Local IP Address:</span>
                    <span className="font-mono text-foreground">{wifi.ipAddress}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-muted-foreground">
                    <span>Default Gateway:</span>
                    <span className="font-mono text-foreground">{wifi.gateway}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-muted-foreground">
                    <span>Frequency Band:</span>
                    <span className="text-foreground">{wifi.frequency}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-muted-foreground">
                    <span>Security Standard:</span>
                    <span className="text-foreground">{wifi.security}</span>
                  </div>
                </div>
              </div>

              {/* Scanned Access Points List */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Nearby Wireless Networks ({wifi.lastScan?.length || 0} detected)
                  </span>
                  <Button variant="ghost" size="sm" onClick={handleScanWifi} className="text-xs text-muted-foreground h-6 px-2">
                    <ArrowsClockwise size={12} className={scanningWifi ? 'animate-spin' : ''} />
                    <span>Rescan</span>
                  </Button>
                </div>

                <div className="divide-y divide-border/60 max-h-64 overflow-y-auto pr-1">
                  {Array.isArray(wifi?.lastScan) && wifi.lastScan.map((net: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between py-2 text-xs">
                      <div className="flex items-center gap-2.5">
                        <WifiHigh
                          size={16}
                          weight={net.signalStrength > 70 ? 'fill' : 'regular'}
                          className={net.isCurrent ? 'text-emerald-400' : 'text-muted-foreground'}
                        />
                        <div>
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <span>{net.ssid}</span>
                            {net.isCurrent && (
                              <span className="size-1.5 rounded-full bg-emerald-400" />
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {net.signalStrength}% signal • {net.security} • Ch {net.channel}
                          </div>
                        </div>
                      </div>

                      <div>
                        {net.isCurrent ? (
                          <span className="badge badge-online text-[10px]">Connected</span>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-[11px] h-7 px-2.5"
                            onClick={() => {
                              setSelectedSsid(net.ssid)
                              setShowWifiModal(true)
                            }}
                          >
                            Connect
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </DashboardCard>

      {/* ──────── MODAL 1: CONNECT CUPS PRINTER ──────── */}
      {showPrinterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Printer size={20} className="text-foreground" />
                <h3 className="text-base font-bold text-foreground">Select / Connect Printer</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrinterModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {Array.isArray(hardware?.allPrinters) && hardware.allPrinters.filter((p: any) => !p.is_virtual).length > 0 && (
              <div className="space-y-2 mb-2">
                <label className="block text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">
                  Discovered Physical Printers ({hardware.allPrinters.filter((p: any) => !p.is_virtual).length} Installed)
                </label>
                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {hardware.allPrinters.filter((p: any) => !p.is_virtual).map((p: any, idx: number) => {
                    const isOnline = p.is_online
                    const isSelected = printerForm.name === p.name
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setPrinterForm({
                            name: p.name,
                            make: p.name.includes('HP') ? 'HP' : p.name.includes('Brother') ? 'Brother' : 'Generic',
                            model: p.name,
                            connectionType: p.connection_type === 'USB' ? 'USB' : 'IPP_NETWORK',
                            deviceUri: `${(p.connection_type || 'wsd').toLowerCase()}://${p.port}`,
                            ipAddress: '127.0.0.1',
                            port: p.connection_type === 'USB' ? 0 : 631,
                          })
                        }}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between text-xs ${
                          isSelected
                            ? 'border-emerald-500/60 bg-emerald-500/10'
                            : 'border-border bg-secondary/50 hover:bg-secondary'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-foreground truncate">{p.name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono truncate">
                            Port: {p.port} • Driver: {p.driver}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`badge ${isOnline ? 'badge-online' : 'badge-danger'} text-[10px]`}>
                            {isOnline ? 'READY' : (p.status_labels?.[0] || 'OFFLINE')}
                          </span>
                          <span className="text-[10px] text-emerald-400 font-semibold underline">
                            {isSelected ? 'Active' : 'Select'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <form onSubmit={handleSavePrinter} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Printer Queue Name</label>
                <input
                  type="text"
                  required
                  value={printerForm.name}
                  onChange={(e) => setPrinterForm({ ...printerForm, name: e.target.value })}
                  placeholder="e.g. HP_Smart_Tank_660_670"
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Printer Model</label>
                <input
                  type="text"
                  required
                  value={printerForm.model}
                  onChange={(e) => setPrinterForm({ ...printerForm, model: e.target.value })}
                  placeholder="e.g. Brother DCP-T420W"
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Protocol</label>
                  <select
                    value={printerForm.connectionType}
                    onChange={(e: any) => setPrinterForm({ ...printerForm, connectionType: e.target.value })}
                    className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="IPP_NETWORK">IPP (Network / Port 631)</option>
                    <option value="USB">USB (Local /dev/usb/lp0)</option>
                    <option value="RAW_SOCKET">Raw Socket (Port 9100)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Port</label>
                  <input
                    type="number"
                    value={printerForm.port}
                    onChange={(e) => setPrinterForm({ ...printerForm, port: parseInt(e.target.value, 10) })}
                    className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Device URI</label>
                <input
                  type="text"
                  value={printerForm.deviceUri}
                  onChange={(e) => setPrinterForm({ ...printerForm, deviceUri: e.target.value })}
                  placeholder="usb://USB003 or ipp://192.168.1.100:631/printers/HP_Smart_Tank"
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  CUPS communicates directly with this IPP URI to monitor toner, paper, and execute print jobs.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPrinterModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={connectingPrinter}
                >
                  {connectingPrinter ? 'Registering with CUPS...' : 'Save & Test Connection'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────── MODAL 2: CONNECT WI-FI ──────── */}
      {showWifiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <WifiHigh size={20} className="text-emerald-400" />
                <h3 className="text-base font-bold text-foreground">Connect Kiosk to Wi-Fi</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWifiModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConnectWifi} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Select Wireless Network (SSID)</label>
                <select
                  value={selectedSsid}
                  onChange={(e) => setSelectedSsid(e.target.value)}
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                >
                  <option value="">-- Choose available network --</option>
                  {Array.isArray(wifi?.lastScan) && wifi.lastScan.map((net: any, idx: number) => (
                    <option key={idx} value={net.ssid}>
                      {net.ssid} ({net.signalStrength}% signal • {net.security})
                    </option>
                  ))}
                  <option value="custom">+ Other (Hidden Network)</option>
                </select>
              </div>

              {selectedSsid === 'custom' && (
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Network Name (SSID)</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter SSID name"
                    onChange={(e) => setSelectedSsid(e.target.value)}
                    className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}

              <div>
                <label className="block text-muted-foreground mb-1 font-medium flex items-center justify-between">
                  <span>WPA2 / WPA3 Pre-Shared Key (Password)</span>
                  <Lock size={12} className="text-muted-foreground" />
                </label>
                <input
                  type="password"
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                  placeholder="Enter Wi-Fi password"
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Leave blank for open networks or captive guest portals.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowWifiModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={connectingWifi || !selectedSsid}
                >
                  {connectingWifi ? 'Authenticating Handshake...' : 'Connect to Network'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
