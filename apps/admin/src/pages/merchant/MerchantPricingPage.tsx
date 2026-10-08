import { useState, useEffect, useMemo } from "react"
import {
  FileText,
  Palette,
  FloppyDisk,
  CheckCircle,
  ArrowSquareOut,
  Receipt,
  Sparkle,
  Plus,
  Minus,
  Lightning,
  Percent,
} from "@phosphor-icons/react"
import { getMerchantPricing, updateMerchantPricing } from "@/lib/api"
import { getKioskPrintUrl } from "@/lib/config"
import { useActiveMerchant } from "@/lib/merchantContext"
import "../AdminPage.css"
import "./MerchantPricingPage.css"

interface PricingState {
  bwSingle: number
  bwDouble: number
  colorSingle: number
  colorDouble: number
}

const PRESETS = [
  {
    id: "campus",
    name: "Campus / Student",
    tagline: "High volume, low rates",
    pricing: { bwSingle: 1.5, bwDouble: 2.5, colorSingle: 8.0, colorDouble: 14.0 },
  },
  {
    id: "commercial",
    name: "Commercial",
    tagline: "Balanced retail margins",
    recommended: true,
    pricing: { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0 },
  },
  {
    id: "premium",
    name: "Executive / Premium",
    tagline: "Max revenue, tech hubs",
    pricing: { bwSingle: 3.0, bwDouble: 5.0, colorSingle: 12.0, colorDouble: 22.0 },
  },
]

export default function MerchantPricingPage() {
  const { activeKioskId, activeMerchant } = useActiveMerchant()

  const [pricing, setPricing] = useState<PricingState>({
    bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [simPages, setSimPages] = useState({ monoS: 8, monoD: 4, colorS: 2, colorD: 1 })

  useEffect(() => {
    let ok = true
    getMerchantPricing(activeKioskId).then((data) => {
      if (ok && data?.pricing) {
        setPricing({
          bwSingle: Number(data.pricing.bwSingle ?? 2.0),
          bwDouble: Number(data.pricing.bwDouble ?? 3.5),
          colorSingle: Number(data.pricing.colorSingle ?? 10.0),
          colorDouble: Number(data.pricing.colorDouble ?? 18.0),
        })
        setDirty(false)
      }
      if (ok) setLoading(false)
    })
    return () => { ok = false }
  }, [activeKioskId])

  const update = (field: keyof PricingState, delta: number, abs = false) => {
    setPricing((p) => {
      let v = abs ? delta : p[field] + delta
      v = field.startsWith("bw")
        ? Math.max(0.5, Math.min(20, Math.round(v * 10) / 10))
        : Math.max(1.0, Math.min(50, Math.round(v * 10) / 10))
      return { ...p, [field]: v }
    })
    setDirty(true)
    setSaveSuccess(false)
  }

  const applyPreset = (p: PricingState) => { setPricing({ ...p }); setDirty(true); setSaveSuccess(false) }

  const save = async () => {
    setSaving(true)
    try {
      await updateMerchantPricing(pricing, activeKioskId)
      setSaveSuccess(true); setDirty(false)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const margin = (price: number, cost: number) =>
    Math.max(10, Math.round(((price - cost) / price) * 100))

  const sim = useMemo(() => {
    const mS = simPages.monoS * pricing.bwSingle
    const mD = simPages.monoD * pricing.bwDouble
    const cS = simPages.colorS * pricing.colorSingle
    const cD = simPages.colorD * pricing.colorDouble
    return { mS, mD, cS, cD, total: mS + mD + cS + cD }
  }, [simPages, pricing])

  const activePreset = PRESETS.find(
    (p) =>
      p.pricing.bwSingle === pricing.bwSingle &&
      p.pricing.bwDouble === pricing.bwDouble &&
      p.pricing.colorSingle === pricing.colorSingle &&
      p.pricing.colorDouble === pricing.colorDouble
  )

  const RATES = [
    { field: "bwSingle" as const, label: "Mono · Single Sided", sub: "B&W, per page", icon: <FileText size={16} weight="duotone" />, iconClass: "mono", unit: "/ pg", step: 0.5, min: 0.5, max: 20, cost: 0.45 },
    { field: "bwDouble" as const, label: "Mono · Double Sided", sub: "B&W duplex, per sheet", icon: <Lightning size={16} weight="duotone" />, iconClass: "mono", unit: "/ sheet", step: 0.5, min: 0.5, max: 25, cost: 0.60 },
    { field: "colorSingle" as const, label: "Color · Single Sided", sub: "Full color, per page", icon: <Palette size={16} weight="duotone" />, iconClass: "color-ink", unit: "/ pg", step: 1.0, min: 1.0, max: 50, cost: 2.10 },
    { field: "colorDouble" as const, label: "Color · Double Sided", sub: "Color duplex, per sheet", icon: <Sparkle size={16} weight="duotone" />, iconClass: "color-ink", unit: "/ sheet", step: 1.0, min: 1.0, max: 60, cost: 3.90 },
  ]

  return (
    <div className="admin-page animate-fadeInUp">
      <div className="pricing-page-wrap">

        {/* ─── Header ─── */}
        <div className="pricing-header">
          <div className="pricing-header-left">
            <h1 className="pricing-header-title">Kiosk Page Pricing</h1>
            <div className="pricing-header-meta">
              <span className="pricing-live-dot" />
              <span>Live rates for {activeMerchant?.storeName || "your store"}</span>
              <span style={{ color: "#e2e8f0" }}>·</span>
              <span style={{ fontFamily: "var(--font-mono, monospace)", fontWeight: 700 }}>{activeKioskId}</span>
              {activePreset && (
                <span style={{ background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", borderRadius: 4, fontSize: 11, fontWeight: 700, padding: "1px 7px" }}>
                  {activePreset.name} preset active
                </span>
              )}
            </div>
          </div>
          <div className="pricing-header-actions">
            <a href={getKioskPrintUrl(activeKioskId)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
              <ArrowSquareOut size={14} weight="bold" />
              <span>Preview Kiosk</span>
            </a>
            <button type="button" className={`btn ${saveSuccess ? "btn-secondary" : "btn-primary"} btn-sm`}
              onClick={save} disabled={saving || !dirty} id="save-pricing-btn">
              {saving ? <span>Saving…</span> : saveSuccess ? (
                <><CheckCircle size={14} weight="fill" color="#10b981" /><span>Saved!</span></>
              ) : (
                <><FloppyDisk size={14} weight="bold" /><span>Save Rates</span></>
              )}
            </button>
          </div>
        </div>

        {/* ─── Two-column layout ─── */}
        <div className="pricing-main-grid">

          {/* Left: presets + rate table */}
          <div className="pricing-left">

            {/* Preset tabs */}
            <div className="pricing-presets">
              {PRESETS.map((p) => {
                const isActive = activePreset?.id === p.id
                return (
                  <button key={p.id} type="button" className={`preset-tab ${isActive ? "is-active" : ""}`}
                    onClick={() => applyPreset(p.pricing)}>
                    <span className="preset-tab__name">
                      <span>{p.name}</span>
                      <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        {p.recommended && !isActive && <span className="preset-recommended-badge">REC</span>}
                        {isActive && <CheckCircle size={13} weight="fill" color="#059669" />}
                      </span>
                    </span>
                    <span className="preset-tab__rates">
                      B&W ₹{p.pricing.bwSingle}·₹{p.pricing.bwDouble} · Color ₹{p.pricing.colorSingle}·₹{p.pricing.colorDouble}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Compact Rate Table */}
            {loading ? (
              <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: 13 }}>Loading rates…</div>
            ) : (
              <div className="rate-table-card">
                <div className="rate-table-head">
                  <span>Print Type</span>
                  <span>Rate per Unit</span>
                  <span>Est. Margin</span>
                </div>

                {RATES.map((row, i) => {
                  const val = pricing[row.field]
                  const isColor = row.iconClass === "color-ink"
                  const showDivider = i === 1
                  return (
                    <>
                      {showDivider && <div key={`div-${i}`} className="rate-row-divider" />}
                      <div key={row.field} className="rate-row">
                        {/* Label */}
                        <div className="rate-row__info">
                          <div className={`rate-row__icon ${row.iconClass}`}>{row.icon}</div>
                          <div>
                            <div className="rate-row__label">{row.label}</div>
                            <div className="rate-row__sublabel">{row.sub}</div>
                          </div>
                        </div>

                        {/* Stepper */}
                        <div className="compact-stepper">
                          <button type="button" className={`cstep-btn ${isColor ? "color-variant" : ""}`}
                            onClick={() => update(row.field, -row.step)} disabled={val <= row.min}>
                            <Minus size={11} weight="bold" />
                          </button>
                          <div className="cstep-val">
                            <span className="cstep-currency">₹</span>
                            <input
                              type="number" step={row.step} min={row.min} max={row.max} value={val}
                              onChange={(e) => update(row.field, parseFloat(e.target.value) || row.min, true)}
                              className={`cstep-input ${isColor ? "color-focus" : ""}`}
                            />
                            <span className="cstep-unit">{row.unit}</span>
                          </div>
                          <button type="button" className={`cstep-btn ${isColor ? "color-variant" : ""}`}
                            onClick={() => update(row.field, row.step)} disabled={val >= row.max}>
                            <Plus size={11} weight="bold" />
                          </button>
                        </div>

                        {/* Margin */}
                        <div>
                          <span className={`rate-margin-pill ${isColor ? "color-pill" : "mono-pill"}`}>
                            <Percent size={10} weight="bold" />
                            {margin(val, row.cost)}% margin
                          </span>
                        </div>
                      </div>
                    </>
                  )
                })}
              </div>
            )}

            {/* Unsaved change notice */}
            {dirty && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#d97706", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 14px" }}>
                <span style={{ fontWeight: 700 }}>Unsaved changes</span>
                <span style={{ color: "#92400e" }}>— click "Save Rates" to push to your kiosk checkout.</span>
              </div>
            )}
          </div>

          {/* Right: Sticky simulator */}
          <div className="pricing-sim-card">
            <div className="sim-card-header">
              <div className="sim-card-title">
                <Receipt size={16} weight="duotone" color="#6366f1" />
                Order Simulator
              </div>
              <p className="sim-card-sub">Slide to simulate a customer cart</p>
            </div>

            <div className="sim-sliders">
              {[
                { key: "monoS" as const, label: "B&W Single", rate: pricing.bwSingle, max: 50, unit: "pgs" },
                { key: "monoD" as const, label: "B&W Duplex", rate: pricing.bwDouble, max: 50, unit: "sheets" },
                { key: "colorS" as const, label: "Color Single", rate: pricing.colorSingle, max: 30, unit: "pgs" },
                { key: "colorD" as const, label: "Color Duplex", rate: pricing.colorDouble, max: 20, unit: "sheets" },
              ].map((r) => (
                <div key={r.key} className="sim-row">
                  <div className="sim-row-label">
                    <span>{r.label}</span>
                    <span>{simPages[r.key]} {r.unit} × ₹{r.rate.toFixed(2)}</span>
                  </div>
                  <input type="range" min={0} max={r.max} value={simPages[r.key]}
                    onChange={(e) => setSimPages((p) => ({ ...p, [r.key]: +e.target.value }))}
                    className="sim-range" />
                </div>
              ))}
            </div>

            <div className="sim-receipt-section">
              <div className="sim-receipt-store">{activeMerchant?.storeName || "PrintBooth Kiosk"}</div>

              {sim.total === 0 ? (
                <div className="sim-empty-hint">Adjust sliders to simulate an order…</div>
              ) : (
                <>
                  {simPages.monoS > 0 && <div className="sim-receipt-line"><span>B&W Single ({simPages.monoS} pgs)</span><span>₹{sim.mS.toFixed(2)}</span></div>}
                  {simPages.monoD > 0 && <div className="sim-receipt-line"><span>B&W Duplex ({simPages.monoD} sh)</span><span>₹{sim.mD.toFixed(2)}</span></div>}
                  {simPages.colorS > 0 && <div className="sim-receipt-line"><span>Color Single ({simPages.colorS} pgs)</span><span>₹{sim.cS.toFixed(2)}</span></div>}
                  {simPages.colorD > 0 && <div className="sim-receipt-line"><span>Color Duplex ({simPages.colorD} sh)</span><span>₹{sim.cD.toFixed(2)}</span></div>}
                  <div className="sim-receipt-divider" />
                  <div className="sim-receipt-total">
                    <span className="sim-receipt-total-label">Customer Total</span>
                    <span className="sim-receipt-total-val">₹{sim.total.toFixed(2)}</span>
                  </div>
                  <div className="sim-payout-strip">
                    <span className="sim-payout-label">Your Payout (100%)</span>
                    <span className="sim-payout-val">₹{sim.total.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
