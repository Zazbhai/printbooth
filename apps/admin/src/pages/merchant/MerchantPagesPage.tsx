import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Article,
  Plus,
  Minus,
  ArrowsClockwise,
  CheckCircle,
  Printer,
  Sparkle,
  TrendUp,
  Clock,
  CurrencyInr,
  Stack,
} from '@phosphor-icons/react'
import { useActiveMerchant } from '@/lib/merchantContext'
import {
  getMerchantPaper,
  setMerchantPaper,
  adjustMerchantPaper,
  refillMerchantPaper,
} from '@/lib/api'
import './MerchantPagesPage.css'
import '../AdminPage.css'

interface PaperHistoryItem {
  id: string
  action: 'SET' | 'ADD' | 'REDUCE' | 'PRINT_CONSUMED' | 'REFILL'
  amount: number
  remainingAfter: number
  note: string
  orderId?: string
  createdAt: string | Date
}

interface PaperState {
  kioskId: string
  kioskName: string
  location: string
  remainingPages: number
  paperTrayCapacity: number
  paperLevel: number
  status: 'LOADED' | 'LOW' | 'OUT_OF_PAPER'
  printerModel: string
  isOnline: boolean
  history: PaperHistoryItem[]
}

export default function MerchantPagesPage() {
  const { activeKioskId, activeMerchant } = useActiveMerchant()
  const [paperData, setPaperData] = useState<PaperState | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // ── Mode A: Exact Sheet Count Input ──
  const [exactSheets, setExactSheets] = useState<number>(150)
  const [exactNote, setExactNote] = useState('')
  const [isSettingExact, setIsSettingExact] = useState(false)

  // ── Mode B: Adjust (Add / Reduce) ──
  const [adjustTab, setAdjustTab] = useState<'ADD' | 'REDUCE'>('ADD')
  const [adjustSheets, setAdjustSheets] = useState<number>(25)
  const [adjustReason, setAdjustReason] = useState('Paper Jam / Damaged')
  const [adjustNote, setAdjustNote] = useState('')
  const [isAdjusting, setIsAdjusting] = useState(false)

  // ── Filter for History Table ──
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'PRINTS' | 'REFILLS' | 'ADJUSTMENTS'>('ALL')

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 4500)
  }, [])

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true)
    try {
      const data = await getMerchantPaper(activeKioskId)
      if (data) {
        setPaperData(data)
        // If exactSheets wasn't touched, sync with remaining
        setExactSheets(data.remainingPages ?? 150)
      }
    } catch (err) {
      console.warn('[MerchantPagesPage] Load failed:', err)
    } finally {
      setLoading(false)
      if (!isSilent) setRefreshing(false)
    }
  }, [activeKioskId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Live Polling every 7 seconds to reflect user prints reducing pages in real time ──
  useEffect(() => {
    const timer = setInterval(() => {
      loadData(true)
    }, 7000)
    return () => clearInterval(timer)
  }, [loadData])

  // ── Handler: Set Exact Loaded Pages ──
  const handleSaveExact = async () => {
    if (exactSheets < 0) return
    setIsSettingExact(true)
    try {
      const res = await setMerchantPaper(
        activeKioskId,
        exactSheets,
        paperData?.paperTrayCapacity,
        exactNote || `Merchant set exact count to ${exactSheets} sheets`
      )
      if (res) {
        await loadData(true)
        showToast(`Tray count successfully set to ${exactSheets} sheets (${res.paperLevel}% capacity)!`)
        setExactNote('')
      }
    } catch (err: any) {
      showToast(`Failed to update tray count: ${err.message || 'Error'}`)
    } finally {
      setIsSettingExact(false)
    }
  }

  // ── Handler: Add or Reduce Pages ──
  const handleAdjust = async () => {
    if (!adjustSheets || adjustSheets <= 0) return
    setIsAdjusting(true)
    try {
      const note = adjustTab === 'REDUCE'
        ? `${adjustReason}${adjustNote ? `: ${adjustNote}` : ''}`
        : (adjustNote || `Merchant added ${adjustSheets} sheets to tray`)

      const res = await adjustMerchantPaper(
        activeKioskId,
        adjustSheets,
        adjustTab,
        note
      )
      if (res) {
        await loadData(true)
        const text = adjustTab === 'ADD'
          ? `Added +${adjustSheets} sheets. Current balance: ${res.remainingPages} sheets.`
          : `Reduced -${adjustSheets} sheets. Current balance: ${res.remainingPages} sheets.`
        showToast(text)
        setAdjustNote('')
      }
    } catch (err: any) {
      showToast(`Adjustment failed: ${err.message || 'Error'}`)
    } finally {
      setIsAdjusting(false)
    }
  }

  // ── Handler: Quick Full Refill ──
  const handleQuickRefill = async () => {
    setRefreshing(true)
    try {
      const cap = paperData?.paperTrayCapacity || 150
      const res = await refillMerchantPaper(activeKioskId, cap, 'Quick Full Refill (100% capacity)')
      if (res) {
        await loadData(true)
        showToast(`Paper tray topped up to ${cap} sheets!`)
      }
    } catch (err: any) {
      showToast(`Quick refill failed: ${err.message || 'Error'}`)
    } finally {
      setRefreshing(false)
    }
  }

  // Calculations
  const remaining = paperData?.remainingPages ?? 125
  const capacity = paperData?.paperTrayCapacity ?? 150
  const percentage = Math.min(100, Math.max(0, Math.round((remaining / capacity) * 100)))

  const statusPill = useMemo(() => {
    if (remaining <= 0) {
      return { label: 'Paper Empty', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)' }
    }
    if (remaining < 25) {
      return { label: 'Low Stock (<25)', color: '#ff7a00', bg: 'rgba(255, 122, 0, 0.15)', border: 'rgba(255, 122, 0, 0.3)' }
    }
    return { label: 'Tray Ready', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' }
  }, [remaining])

  // Filter history items
  const filteredHistory = useMemo(() => {
    if (!paperData?.history) return []
    return paperData.history.filter((item) => {
      if (historyFilter === 'PRINTS') return item.action === 'PRINT_CONSUMED'
      if (historyFilter === 'REFILLS') return item.action === 'REFILL' || (item.action === 'SET' && item.amount >= capacity)
      if (historyFilter === 'ADJUSTMENTS') return item.action === 'ADD' || item.action === 'REDUCE'
      return true
    })
  }, [paperData?.history, historyFilter, capacity])

  // Format relative timestamp
  const formatTime = (raw: string | Date) => {
    try {
      const d = new Date(raw)
      const diffMs = Date.now() - d.getTime()
      if (diffMs < 60000) return 'Just now'
      if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`
      if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`
      return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return 'Recent'
    }
  }

  if (loading && !paperData) {
    return (
      <div className="merchant-paper-page animate-fadeInUp" style={{ padding: '60px 0', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div className="animate-spin" style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(220, 38, 38, 0.2)', borderTopColor: '#dc2626' }} />
          <span style={{ fontSize: 14, color: 'var(--paper-text-2, #64748b)', fontFamily: 'var(--font-mono)' }}>Loading live paper cassette telemetry...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="merchant-paper-page animate-fadeInUp">
      {/* ──────── Header Row ──────── */}
      <div className="paper-header">
        <div className="paper-header__left">
          <div className="paper-header__meta">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(220, 38, 38, 0.08)',
                color: '#dc2626',
                border: '1px solid rgba(220, 38, 38, 0.25)',
                padding: '3px 9px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <Article size={13} weight="fill" />
              <span>Printer Paper Cassette</span>
            </span>
            <span style={{ fontSize: 13, color: 'var(--paper-text-2, #64748b)', fontFamily: 'var(--font-mono)' }}>
              Station: <strong style={{ color: 'var(--paper-text-1, #09090b)' }}>{activeMerchant?.storeName || activeKioskId}</strong> ({activeKioskId})
            </span>
          </div>
          <h1 className="paper-header__title">Paper Levels</h1>
          <p className="paper-header__sub">
            Monitor real-time remaining sheets, load new paper batches, adjust cassette stock, and track automated consumption per print.
          </p>
        </div>

        <div className="paper-header__actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => loadData(false)}
            disabled={refreshing}
            title="Refresh live hardware paper count"
          >
            <ArrowsClockwise size={15} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm paper-header__refill-btn"
            onClick={handleQuickRefill}
            disabled={refreshing}
          >
            <Sparkle size={15} weight="fill" />
            <span>Refill Full Tray ({capacity} Sh.)</span>
          </button>
        </div>
      </div>

      {/* ──────── Toast Notice ──────── */}
      {toastMessage && (
        <div className="paper-toast">
          <CheckCircle size={18} color="#dc2626" weight="fill" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ──────── 4-Card KPI Overview Grid ──────── */}
      <div className="paper-kpi-grid">
        {/* KPI 1: Remaining Sheets in Printer */}
        <div className="paper-kpi-card">
          <div className="paper-kpi-card__top">
            <span className="paper-kpi-card__label">Remaining In Printer</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: statusPill.color,
                background: statusPill.bg,
                border: `1px solid ${statusPill.border}`,
                padding: '2px 8px',
                borderRadius: 9999,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusPill.color }} />
              {statusPill.label}
            </span>
          </div>

          <div className="paper-kpi-card__value-row">
            <span className="paper-kpi-card__value">{remaining}</span>
            <span className="paper-kpi-card__unit">/ {capacity} sheets</span>
          </div>

          {/* Visual Tray Gauge Meter */}
          <div>
            <div className="tray-gauge-track">
              <div
                className={`tray-gauge-fill ${
                  percentage < 15 ? 'tray-gauge-fill--red' : percentage < 30 ? 'tray-gauge-fill--amber' : 'tray-gauge-fill--lime'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9e9e9e', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
              <span>{percentage}% capacity filled</span>
              <span>{capacity - remaining} sheets to fill</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Print Run Autonomy */}
        <div className="paper-kpi-card">
          <div className="paper-kpi-card__top">
            <span className="paper-kpi-card__label">Print Run Autonomy</span>
            <div className="paper-kpi-card__icon-badge">
              <Printer size={18} weight="duotone" />
            </div>
          </div>

          <div className="paper-kpi-card__value-row">
            <span className="paper-kpi-card__value">{remaining}</span>
            <span className="paper-kpi-card__unit">single prints</span>
          </div>

          <div className="paper-kpi-card__subtext">
            <span>Or up to <strong>{remaining * 2} duplex pages</strong> before physical reload is required.</span>
          </div>
        </div>

        {/* KPI 3: Store Revenue Capacity */}
        <div className="paper-kpi-card">
          <div className="paper-kpi-card__top">
            <span className="paper-kpi-card__label">In-Tray Revenue Capacity</span>
            <div className="paper-kpi-card__icon-badge">
              <CurrencyInr size={18} weight="duotone" />
            </div>
          </div>

          <div className="paper-kpi-card__value-row">
            <span className="paper-kpi-card__value">₹{(remaining * 2).toFixed(2)}</span>
            <span className="paper-kpi-card__unit">potential</span>
          </div>

          <div className="paper-kpi-card__subtext">
            <span>Calculated at standard B&W ₹2.00/sheet baseline pricing.</span>
          </div>
        </div>

        {/* KPI 4: Tray Hardware Specifications */}
        <div className="paper-kpi-card">
          <div className="paper-kpi-card__top">
            <span className="paper-kpi-card__label">Hardware Tray Spec</span>
            <div className="paper-kpi-card__icon-badge">
              <Stack size={18} weight="duotone" />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--paper-text-1, #09090b)' }}>
              {paperData?.printerModel || 'Brother DCP-T420W'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--paper-text-2, #64748b)' }}>
              Cassette 1 · A4, Letter, 75–80 GSM
            </span>
          </div>

          <div className="paper-kpi-card__subtext" style={{ marginTop: 'auto' }}>
            <span style={{ color: paperData?.isOnline ? '#dc2626' : '#64748b', fontWeight: 600 }}>
              ● Hardware Status: {paperData?.isOnline ? 'Online & Feeding' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* ──────── Control Panels (Set Exact Sheets + Increase / Reduce) ──────── */}
      <div className="paper-controls-grid">
        {/* PANEL 1: Set Exact Sheets ("Enter how many pages they put inside now") */}
        <div className="paper-card">
          <div className="paper-card__header">
            <div>
              <h2 className="paper-card__title">
                <Stack size={18} color="#dc2626" weight="duotone" />
                <span>Set Exact Sheets in Printer</span>
              </h2>
              <p className="paper-card__desc">
                Enter the exact sheet count you physically loaded into Tray 1. The dashboard and printer telemetry will instantly sync.
              </p>
            </div>
          </div>

          {/* Stepper Input */}
          <div className="paper-stepper">
            <button
              type="button"
              className="paper-stepper__btn"
              onClick={() => setExactSheets((prev) => Math.max(0, prev - 10))}
              title="Subtract 10 sheets"
            >
              -10
            </button>
            <button
              type="button"
              className="paper-stepper__btn"
              onClick={() => setExactSheets((prev) => Math.max(0, prev - 1))}
              title="Subtract 1 sheet"
            >
              -1
            </button>
            <input
              type="number"
              className="paper-stepper__input"
              value={exactSheets}
              min={0}
              max={1000}
              onChange={(e) => setExactSheets(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
            <button
              type="button"
              className="paper-stepper__btn"
              onClick={() => setExactSheets((prev) => prev + 1)}
              title="Add 1 sheet"
            >
              +1
            </button>
            <button
              type="button"
              className="paper-stepper__btn"
              onClick={() => setExactSheets((prev) => prev + 10)}
              title="Add 10 sheets"
            >
              +10
            </button>
          </div>

          {/* Quick Presets */}
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9e9e9e', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>
              Quick Fill Presets
            </span>
            <div className="paper-presets">
              {[25, 50, 75, 100, 150, 250, 500].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`paper-preset-btn ${exactSheets === preset ? 'is-active' : ''}`}
                  onClick={() => setExactSheets(preset)}
                >
                  {preset === 150 ? 'Full Tray (150)' : preset === 500 ? 'Full Ream (500)' : `${preset} Sheets`}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Note */}
          <div>
            <input
              type="text"
              className="paper-note-input"
              placeholder="Optional log note (e.g. Loaded fresh 75 GSM paper box)"
              value={exactNote}
              onChange={(e) => setExactNote(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="paper-action-btn paper-action-btn--primary"
            onClick={handleSaveExact}
            disabled={isSettingExact}
          >
            <CheckCircle size={18} weight="bold" />
            <span>{isSettingExact ? 'Updating Tray Balance...' : `Update Printer Count to ${exactSheets} Sheets`}</span>
          </button>
        </div>

        {/* PANEL 2: Increase & Reduce Controls ("reduce and increase the page as he likes") */}
        <div className="paper-card">
          <div className="paper-card__header">
            <div>
              <h2 className="paper-card__title">
                <TrendUp size={18} color="#dc2626" weight="duotone" />
                <span>Adjust Tray Sheets (Add or Reduce)</span>
              </h2>
              <p className="paper-card__desc">
                Quickly add paper from your store stock or deduct damaged sheets / cleared paper jams.
              </p>
            </div>
          </div>

          {/* Tab Switcher (Add vs Reduce) */}
          <div className="paper-tab-nav">
            <button
              type="button"
              className={`paper-tab-btn ${adjustTab === 'ADD' ? 'is-active-add' : ''}`}
              onClick={() => setAdjustTab('ADD')}
            >
              <Plus size={14} weight="bold" />
              <span>Add Sheets (+)</span>
            </button>
            <button
              type="button"
              className={`paper-tab-btn ${adjustTab === 'REDUCE' ? 'is-active-reduce' : ''}`}
              onClick={() => setAdjustTab('REDUCE')}
            >
              <Minus size={14} weight="bold" />
              <span>Reduce Sheets (-)</span>
            </button>
          </div>

          {/* Stepper Input for Adjustment */}
          <div className="paper-stepper">
            <button
              type="button"
              className="paper-stepper__btn"
              onClick={() => setAdjustSheets((prev) => Math.max(1, prev - 5))}
            >
              -5
            </button>
            <button
              type="button"
              className="paper-stepper__btn"
              onClick={() => setAdjustSheets((prev) => Math.max(1, prev - 1))}
            >
              -1
            </button>
            <input
              type="number"
              className="paper-stepper__input"
              value={adjustSheets}
              min={1}
              max={500}
              onChange={(e) => setAdjustSheets(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
            <button
              type="button"
              className="paper-stepper__btn"
              onClick={() => setAdjustSheets((prev) => prev + 1)}
            >
              +1
            </button>
            <button
              type="button"
              className="paper-stepper__btn"
              onClick={() => setAdjustSheets((prev) => prev + 5)}
            >
              +5
            </button>
          </div>

          {/* Preset Buttons for Adjustment */}
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9e9e9e', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>
              {adjustTab === 'ADD' ? 'Quick Add Amounts' : 'Quick Deduction Amounts'}
            </span>
            <div className="paper-presets">
              {(adjustTab === 'ADD' ? [5, 10, 25, 50, 100] : [1, 2, 5, 10, 20]).map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`paper-preset-btn ${adjustSheets === num ? 'is-active' : ''}`}
                  onClick={() => setAdjustSheets(num)}
                >
                  {adjustTab === 'ADD' ? `+${num} Sheets` : `-${num} Sheets`}
                </button>
              ))}
            </div>
          </div>

          {/* Reason Selection for Reduce */}
          {adjustTab === 'REDUCE' && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9e9e9e', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Reason for Deduction
              </label>
              <select
                className="paper-note-input"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                style={{ cursor: 'pointer' }}
              >
                <option value="Paper Jam / Damaged">Paper Jam / Damaged Roller Sheet</option>
                <option value="Crinkled Sheet Discarded">Crinkled / Wet Sheet Removed</option>
                <option value="Test Print / Hardware Alignment">Test Print / Alignment Sheet</option>
                <option value="Physical Tray Count Correction">Physical Tray Count Correction</option>
              </select>
            </div>
          )}

          {/* Optional Note */}
          <div>
            <input
              type="text"
              className="paper-note-input"
              placeholder={adjustTab === 'ADD' ? 'Optional note (e.g. Added leftover pack from drawer)' : 'Optional details (e.g. Cleared roller jam)'}
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="paper-action-btn paper-action-btn--primary"
            onClick={handleAdjust}
            disabled={isAdjusting}
          >
            {adjustTab === 'ADD' ? <Plus size={18} weight="bold" /> : <Minus size={18} weight="bold" />}
            <span>
              {isAdjusting
                ? 'Processing...'
                : adjustTab === 'ADD'
                ? `Add +${adjustSheets} Sheets to Tray`
                : `Deduct -${adjustSheets} Sheets from Tray`}
            </span>
          </button>
        </div>
      </div>

      {/* ──────── Real-Time Event History & Consumption Log ──────── */}
      <div className="paper-history-card">
        <div className="paper-history-header">
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--paper-text-1, #09090b)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} color="#dc2626" weight="duotone" />
              <span>Paper Tray Consumption & Audit Log</span>
            </h2>
            <span style={{ fontSize: 12, color: 'var(--paper-text-2, #64748b)' }}>
              Tracks customer print deductions, merchant manual reloads, and jam discards in real-time.
            </span>
          </div>

          <div className="paper-history-filters">
            {(
              [
                { id: 'ALL', label: 'All Events' },
                { id: 'PRINTS', label: 'Customer Prints' },
                { id: 'REFILLS', label: 'Refills' },
                { id: 'ADJUSTMENTS', label: 'Adjustments' },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={`paper-filter-btn ${historyFilter === filter.id ? 'is-active' : ''}`}
                onClick={() => setHistoryFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="table-responsive">
          <table className="paper-table">
            <thead>
              <tr>
                <th>Event Time</th>
                <th>Activity Type</th>
                <th>Sheet Change</th>
                <th>Resulting In Tray</th>
                <th>Details / Reference</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px 20px', color: '#64748b' }}>
                    No paper consumption logs found for this filter.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => {
                  const isPrint = item.action === 'PRINT_CONSUMED'
                  const isSet = item.action === 'SET'
                  const isAdd = item.action === 'ADD' || item.action === 'REFILL'
                  const isReduce = item.action === 'REDUCE'

                  const badgeClass = isPrint
                    ? 'event-badge--print'
                    : isSet
                    ? 'event-badge--set'
                    : isAdd
                    ? 'event-badge--add'
                    : 'event-badge--reduce'

                  const deltaSign = item.amount > 0 ? `+${item.amount}` : item.amount

                  return (
                    <tr key={item.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--paper-text-2, #64748b)' }}>
                        {formatTime(item.createdAt)}
                      </td>
                      <td>
                        <span className={`event-badge ${badgeClass}`}>
                          {isPrint
                            ? 'Customer Print'
                            : isSet
                            ? 'Tray Override'
                            : isAdd
                            ? 'Stock Refill'
                            : 'Jam Deduction'}
                        </span>
                      </td>
                      <td
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: isPrint || isReduce ? '#dc2626' : '#16a34a',
                        }}
                      >
                        {isSet ? `Set to ${item.amount}` : `${deltaSign} sheets`}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--paper-text-1, #09090b)' }}>
                        {item.remainingAfter} / {capacity}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--paper-text-2, #475569)' }}>
                        {item.orderId ? (
                          <span>
                            Order <strong style={{ color: '#dc2626' }}>{item.orderId}</strong> — {item.note}
                          </span>
                        ) : (
                          item.note
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
