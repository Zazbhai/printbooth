/**
 * HardwareTelemetryPage
 */
import { useMemo } from "react"
import {
  WifiHigh, WifiSlash, ArrowClockwise, Printer, Cpu,
  HardDrive, Drop, Scroll, Lightning, CheckCircle,
  WarningCircle, XCircle, Spinner,
} from "@phosphor-icons/react"
import { useKioskTelemetry, type KioskTelemetry } from "@/hooks/useKioskTelemetry"
import "./AdminPage.css"
import "./HardwareTelemetryPage.css"

function levelClass(val: number) {
  if (val > 50) return "ht-ok"
  if (val > 20) return "ht-warn"
  return "ht-error"
}
function tempClass(c: number) {
  if (c < 60) return "ht-ok"
  if (c < 75) return "ht-warn"
  return "ht-error"
}
function memClass(pct: number) {
  if (pct < 60) return "ht-ok"
  if (pct < 80) return "ht-warn"
  return "ht-error"
}
function relativeTime(ts: number): string {
  const delta = Math.floor((Date.now() - ts) / 1000)
  if (delta < 5) return "just now"
  if (delta < 60) return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  return `${Math.floor(delta / 3600)}h ago`
}
function printerStatusMeta(status: string) {
  switch ((status || "").toUpperCase()) {
    case "READY": return { label: "READY", cls: "ht-status-ready", Icon: CheckCircle }
    case "BUSY": return { label: "PRINTING", cls: "ht-status-busy", Icon: Spinner }
    case "PAPER_JAM": return { label: "PAPER JAM", cls: "ht-status-jam", Icon: WarningCircle }
    default: return { label: "OFFLINE", cls: "ht-status-offline", Icon: XCircle }
  }
}

function KioskTelemetryCard({ k }: { k: KioskTelemetry }) {
  const pMeta = printerStatusMeta(k.printerStatus)
  const isStale = (Date.now() - k.lastSeen) > 45000

  return (
    <div className={`ht-card glass-card ${isStale ? "ht-card--stale" : ""}`}>
      <div className="ht-card__header">
        <div className="ht-card__id-row">
          <span className={`ht-pulse-dot ${k.status === "ONLINE" && !isStale ? "ht-pulse-dot--live" : "ht-pulse-dot--dead"}`} />
          <span className="ht-card__kiosk-id">{k.kioskId}</span>
          <span className={`badge badge-${k.status === "ONLINE" ? "online" : k.status === "MAINTENANCE" ? "warning" : "danger"} ht-card__status-badge`}>
            {k.status}
          </span>
        </div>
        <span className="ht-card__last-seen">Last seen: {relativeTime(k.lastSeen)}</span>
      </div>

      <div className="ht-card__printer-row">
        <Printer size={15} weight="fill" />
        <span className={`ht-status-pill ${pMeta.cls}`}>
          <pMeta.Icon size={12} weight={k.printerStatus === "BUSY" ? "bold" : "fill"} className={k.printerStatus === "BUSY" ? "ht-spin" : ""} />
          {pMeta.label}
        </span>
      </div>

      {k.activeJob && (
        <div className="ht-active-job">
          <div className="ht-active-job__label">
            <Lightning size={12} weight="fill" style={{ color: "#c8ff00" }} />
            <span>Order {k.activeJob.orderId} — Page {k.activeJob.page}/{k.activeJob.totalPages}</span>
          </div>
          <div className="progress-bar" style={{ height: 6, marginTop: 6 }}>
            <div className="progress-bar-fill ok" style={{ width: `${k.activeJob.percent}%`, background: "#c8ff00" }} />
          </div>
          <span className="ht-active-job__pct">{k.activeJob.percent}%</span>
        </div>
      )}

      <div className="ht-metrics-grid">
        <div className="ht-metric">
          <div className="ht-metric__header">
            <Scroll size={13} /><span>Paper</span>
            <span className={`ht-metric__val ${levelClass(k.paperLevel)}`}>{k.paperLevel}%</span>
          </div>
          <div className="progress-bar" style={{ height: 5 }}>
            <div className={`progress-bar-fill ${levelClass(k.paperLevel)}`} style={{ width: `${k.paperLevel}%` }} />
          </div>
        </div>
        <div className="ht-metric">
          <div className="ht-metric__header">
            <Drop size={13} /><span>Toner</span>
            <span className={`ht-metric__val ${levelClass(k.tonerLevel)}`}>{k.tonerLevel}%</span>
          </div>
          <div className="progress-bar" style={{ height: 5 }}>
            <div className={`progress-bar-fill ${levelClass(k.tonerLevel)}`} style={{ width: `${k.tonerLevel}%` }} />
          </div>
        </div>
        <div className="ht-metric">
          <div className="ht-metric__header">
            <Cpu size={13} /><span>CPU Temp</span>
            <span className={`ht-metric__val ${tempClass(k.diagnostics.cpuTempC)}`}>{k.diagnostics.cpuTempC}deg C</span>
          </div>
          <div className="progress-bar" style={{ height: 5 }}>
            <div className={`progress-bar-fill ${tempClass(k.diagnostics.cpuTempC)}`} style={{ width: `${Math.min((k.diagnostics.cpuTempC / 100) * 100, 100)}%` }} />
          </div>
        </div>
        <div className="ht-metric">
          <div className="ht-metric__header">
            <Cpu size={13} /><span>RAM</span>
            <span className={`ht-metric__val ${memClass(k.diagnostics.memUsedPct)}`}>{k.diagnostics.memUsedPct}%</span>
          </div>
          <div className="progress-bar" style={{ height: 5 }}>
            <div className={`progress-bar-fill ${memClass(k.diagnostics.memUsedPct)}`} style={{ width: `${k.diagnostics.memUsedPct}%` }} />
          </div>
        </div>
        <div className="ht-metric ht-metric--wide">
          <div className="ht-metric__header">
            <HardDrive size={13} /><span>Disk Free</span>
            <span className="ht-metric__val ht-ok">{k.diagnostics.diskFreeGb} GB</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HardwareTelemetryPage() {
  const { kiosks, wsStatus, lastEvent, reconnect } = useKioskTelemetry()

  const kioskList = useMemo(() => Array.from(kiosks.values()), [kiosks])
  const onlineCount = kioskList.filter(k => k.status === "ONLINE").length
  const busyCount = kioskList.filter(k => k.printerStatus === "BUSY").length
  const alertCount = kioskList.filter(k =>
    k.paperLevel < 20 || k.tonerLevel < 20 || k.diagnostics.cpuTempC > 75 || k.printerStatus === "PAPER_JAM"
  ).length

  const wsStatusMeta = {
    connected: { label: "Live", cls: "ht-ws-live", Icon: WifiHigh },
    connecting: { label: "Connecting...", cls: "ht-ws-connecting", Icon: WifiHigh },
    disconnected: { label: "Disconnected", cls: "ht-ws-off", Icon: WifiSlash },
    error: { label: "Error", cls: "ht-ws-off", Icon: WifiSlash },
  }[wsStatus]

  return (
    <div className="admin-page animate-fadeInUp">
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <h1 className="admin-page__title">Hardware Telemetry</h1>
          <p className="admin-page__sub">
            Real-time Raspberry Pi and printer status for every kiosk station -- live over WSS relay
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className={`ht-ws-badge ${wsStatusMeta.cls}`}>
            <wsStatusMeta.Icon size={14} weight="bold" className={wsStatus === "connecting" ? "ht-spin" : ""} />
            <span>WSS {wsStatusMeta.label}</span>
            {lastEvent && <span className="ht-last-event">{lastEvent}</span>}
          </div>
          {wsStatus !== "connected" && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={reconnect}>
              <ArrowClockwise size={14} weight="bold" />
              <span>Reconnect</span>
            </button>
          )}
        </div>
      </div>

      <div className="ht-summary-row">
        <div className="ht-summary-tile">
          <span className="ht-summary-tile__num" style={{ color: "#c8ff00" }}>{kioskList.length}</span>
          <span className="ht-summary-tile__label">Total Stations</span>
        </div>
        <div className="ht-summary-tile">
          <span className="ht-summary-tile__num" style={{ color: "#22c55e" }}>{onlineCount}</span>
          <span className="ht-summary-tile__label">Online</span>
        </div>
        <div className="ht-summary-tile">
          <span className="ht-summary-tile__num" style={{ color: "#3b82f6" }}>{busyCount}</span>
          <span className="ht-summary-tile__label">Printing</span>
        </div>
        <div className="ht-summary-tile">
          <span className="ht-summary-tile__num" style={{ color: alertCount > 0 ? "#f59e0b" : "var(--clr-text-3)" }}>{alertCount}</span>
          <span className="ht-summary-tile__label">Alerts</span>
        </div>
      </div>

      {kioskList.length === 0 ? (
        <div className="ht-empty-state glass-card">
          <WifiHigh size={40} weight="thin" style={{ opacity: 0.4 }} />
          <p>Waiting for kiosk stations to connect...</p>
          <p style={{ fontSize: 12, color: "var(--clr-text-3)", marginTop: 6 }}>
            Run <code>python ws_kiosk_client.py</code> on your Raspberry Pi to begin streaming telemetry.
          </p>
        </div>
      ) : (
        <div className="ht-grid">
          {kioskList.map(k => (
            <KioskTelemetryCard key={k.kioskId} k={k} />
          ))}
        </div>
      )}
    </div>
  )
}
