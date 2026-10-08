import { DashboardCard } from '@/components/watermelon/capitalio-dashboard/components/capitalio/shared'
import { Bell, ChevronUp } from 'lucide-react'
import './DashboardSkeletonFallback.css'

/**
 * ────────────────────────────────────────────────────────────────────────────
 * Reusable Micro Skeletons for High-Fidelity Dashboard Alignment
 * ────────────────────────────────────────────────────────────────────────────
 */

function SparklineWaveSkeleton({ type = 'area' }: { type?: 'area' | 'bar' }) {
  if (type === 'bar') {
    return (
      <div className="h-9 w-full flex items-end justify-between gap-1.5 px-1 pb-0.5">
        <div className="bone-bar flex-1" style={{ height: '35%' }} />
        <div className="bone-bar flex-1" style={{ height: '55%' }} />
        <div className="bone-bar flex-1" style={{ height: '75%' }} />
        <div className="bone-bar flex-1" style={{ height: '40%' }} />
        <div className="bone-bar flex-1" style={{ height: '90%' }} />
        <div className="bone-bar flex-1" style={{ height: '60%' }} />
        <div className="bone-bar flex-1" style={{ height: '80%' }} />
        <div className="bone-bar flex-1" style={{ height: '50%' }} />
      </div>
    )
  }

  return (
    <div className="h-9 w-full overflow-hidden">
      <svg viewBox="0 0 160 36" className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="boneSparkAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path
          d="M 0 24 Q 30 14, 60 20 T 110 10 T 160 16 L 160 36 L 0 36 Z"
          fill="url(#boneSparkAreaGrad)"
          className="bone-sparkline-area"
        />
        <path
          d="M 0 24 Q 30 14, 60 20 T 110 10 T 160 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="bone-sparkline-line"
        />
      </svg>
    </div>
  )
}

function ActivityDropdownSkeleton() {
  return (
    <div className="activity-dropdown-anchor" aria-hidden="true">
      <div className="activity-dropdown-root" style={{ pointerEvents: 'none' }}>
        <div className="activity-dropdown__header flex items-center gap-3.5 p-3.5">
          <div className="activity-dropdown__bell-wrap flex items-center justify-center">
            <Bell className="h-5 w-5 text-slate-400 opacity-60" />
          </div>
          <div className="activity-dropdown__titles flex-1 overflow-hidden">
            <div className="bone-box" style={{ width: 135, height: 16, borderRadius: 4, marginBottom: 4 }} />
            <div className="bone-box" style={{ width: 180, height: 12, borderRadius: 3 }} />
          </div>
          <div className="activity-dropdown__chevron-wrap flex h-7 w-7 items-center justify-center">
            <ChevronUp className="h-4 w-4 text-slate-300 opacity-70 rotate-180" />
          </div>
        </div>
      </div>
    </div>
  )
}

function DonutChartSkeleton() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-52 flex items-center justify-center">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <circle
          cx="80"
          cy="80"
          r="58"
          stroke="currentColor"
          strokeWidth="18"
          fill="none"
          className="bone-donut-bg"
        />
        <circle
          cx="80"
          cy="80"
          r="58"
          stroke="currentColor"
          strokeWidth="18"
          strokeDasharray="210 365"
          strokeLinecap="round"
          fill="none"
          className="bone-donut-seg1"
        />
        <circle
          cx="80"
          cy="80"
          r="58"
          stroke="currentColor"
          strokeWidth="18"
          strokeDasharray="110 365"
          strokeDashoffset="-225"
          strokeLinecap="round"
          fill="none"
          className="bone-donut-seg2"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="bone-box" style={{ width: 44, height: 24, borderRadius: 4, marginBottom: 4 }} />
        <div className="bone-box" style={{ width: 68, height: 11, borderRadius: 2 }} />
      </div>
    </div>
  )
}

/**
 * ────────────────────────────────────────────────────────────────────────────
 * Admin Dashboard Boneyard Skeleton Fallback
 * Perfectly matches Platform Admin Fleet Dashboard geometry, cards, and grid
 * ────────────────────────────────────────────────────────────────────────────
 */
export function AdminDashboardSkeletonFallback() {
  return (
    <div className="admin-page capitalio-dashboard admin-skeleton-page animate-fadeInUp" aria-hidden="true">
      {/* ── Top Header Row Skeleton ── */}
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <div className="bone-box" style={{ width: 125, height: 20, borderRadius: 9999 }} />
            <div className="bone-box" style={{ width: 135, height: 20, borderRadius: 9999 }} />
            <div className="bone-box" style={{ width: 165, height: 13, borderRadius: 4 }} />
          </div>
          <div className="bone-box" style={{ width: 270, height: 32, borderRadius: 6, marginTop: 4, marginBottom: 4 }} />
          <div className="bone-box" style={{ width: 'clamp(280px, 45vw, 480px)', height: 15, borderRadius: 4 }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Period selector group */}
          <div
            style={{
              display: 'flex',
              background: 'var(--secondary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 2,
              gap: 2,
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bone-box" style={{ width: 32, height: 26, borderRadius: 6 }} />
            ))}
          </div>

          {/* Date pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#ffffff',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '6px 12px',
              height: 32,
            }}
          >
            <div className="bone-box" style={{ width: 14, height: 14, borderRadius: 3 }} />
            <div className="bone-box" style={{ width: 95, height: 14, borderRadius: 4 }} />
          </div>

          {/* Activity dropdown anchor */}
          <ActivityDropdownSkeleton />
        </div>
      </div>

      {/* ── 1. Capitalio Summary Cards Grid (4 Cards) ── */}
      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Active Kiosks */}
        <DashboardCard className="flex min-h-48 flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="bone-box" style={{ width: 95, height: 16, borderRadius: 4 }} />
            <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 opacity-60">
              <div className="bone-box" style={{ width: 18, height: 18, borderRadius: 4 }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <div className="bone-box" style={{ width: 55, height: 32, borderRadius: 6 }} />
              <div className="bone-box" style={{ width: 85, height: 14, borderRadius: 4 }} />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="bone-box" style={{ width: 14, height: 14, borderRadius: '50%' }} />
              <div className="bone-box" style={{ width: 170, height: 13, borderRadius: 4 }} />
            </div>
          </div>
          <SparklineWaveSkeleton type="area" />
        </DashboardCard>

        {/* Card 2: Today's Prints */}
        <DashboardCard className="flex min-h-48 flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="bone-box" style={{ width: 105, height: 16, borderRadius: 4 }} />
            <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 opacity-60">
              <div className="bone-box" style={{ width: 18, height: 18, borderRadius: 4 }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <div className="bone-box" style={{ width: 60, height: 32, borderRadius: 6 }} />
              <div className="bone-box" style={{ width: 45, height: 14, borderRadius: 4 }} />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="bone-box" style={{ width: 14, height: 14, borderRadius: 3 }} />
              <div className="bone-box" style={{ width: 160, height: 13, borderRadius: 4 }} />
            </div>
          </div>
          <SparklineWaveSkeleton type="area" />
        </DashboardCard>

        {/* Card 3: Revenue */}
        <DashboardCard className="flex min-h-48 flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="bone-box" style={{ width: 110, height: 16, borderRadius: 4 }} />
            <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 opacity-60">
              <div className="bone-box" style={{ width: 18, height: 18, borderRadius: 4 }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <div className="bone-box" style={{ width: 75, height: 32, borderRadius: 6 }} />
              <div className="bone-box" style={{ width: 35, height: 14, borderRadius: 4 }} />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="bone-box" style={{ width: 14, height: 14, borderRadius: 3 }} />
              <div className="bone-box" style={{ width: 180, height: 13, borderRadius: 4 }} />
            </div>
          </div>
          <SparklineWaveSkeleton type="bar" />
        </DashboardCard>

        {/* Card 4: Fleet Health */}
        <DashboardCard className="flex min-h-48 flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="bone-box" style={{ width: 90, height: 16, borderRadius: 4 }} />
            <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 opacity-60">
              <div className="bone-box" style={{ width: 18, height: 18, borderRadius: 4 }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <div className="bone-box" style={{ width: 65, height: 32, borderRadius: 6 }} />
              <div className="bone-box" style={{ width: 50, height: 14, borderRadius: 4 }} />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="bone-box" style={{ width: 14, height: 14, borderRadius: 3 }} />
              <div className="bone-box" style={{ width: 175, height: 13, borderRadius: 4 }} />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <div className="bone-box" style={{ width: 70, height: 12, borderRadius: 3 }} />
              <div className="bone-box" style={{ width: 65, height: 12, borderRadius: 3 }} />
            </div>
            <div className="h-2 w-full overflow-hidden rounded-sm bg-secondary">
              <div className="bone-box" style={{ width: '100%', height: '100%', borderRadius: 2 }} />
            </div>
          </div>
        </DashboardCard>
      </div>

      {/* ── 2. Performance & Print Volume Section ── */}
      <div className="grid min-w-0 gap-3 xl:grid-cols-3">
        {/* Hourly Network Throughput Area Chart */}
        <DashboardCard className="flex flex-col gap-5 xl:col-span-2">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div>
              <div className="bone-box" style={{ width: 220, height: 20, borderRadius: 6, marginBottom: 6 }} />
              <div className="bone-box" style={{ width: 340, height: 14, borderRadius: 4 }} />
            </div>
            <div className="flex items-center gap-2">
              <div className="bone-box" style={{ width: 95, height: 28, borderRadius: 8 }} />
              <div className="bone-box" style={{ width: 135, height: 32, borderRadius: 6 }} />
            </div>
          </div>

          {/* Area Chart Canvas on Dot Grid */}
          <div className="dashboard-dot-grid h-80 min-w-0 overflow-hidden rounded-md relative flex flex-col justify-between p-3">
            <div className="w-full flex-1 relative flex">
              {/* Y-axis Ticks */}
              <div className="w-12 h-full flex flex-col justify-between py-1 pr-2 text-right">
                <div className="bone-box ml-auto" style={{ width: 22, height: 10, borderRadius: 2 }} />
                <div className="bone-box ml-auto" style={{ width: 22, height: 10, borderRadius: 2 }} />
                <div className="bone-box ml-auto" style={{ width: 22, height: 10, borderRadius: 2 }} />
                <div className="bone-box ml-auto" style={{ width: 22, height: 10, borderRadius: 2 }} />
                <div className="bone-box ml-auto" style={{ width: 22, height: 10, borderRadius: 2 }} />
              </div>

              {/* Chart Wave Simulation */}
              <div className="flex-1 h-full relative">
                <svg viewBox="0 0 500 240" className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="boneThroughputGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>
                  {/* Subtle target benchmark dashed line */}
                  <line x1="0" y1="90" x2="500" y2="90" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 6" className="bone-chart-guide" />
                  {/* Area fill */}
                  <path
                    d="M 0 170 Q 70 120, 140 150 T 280 80 T 400 130 T 500 110 L 500 240 L 0 240 Z"
                    fill="url(#boneThroughputGrad)"
                    className="bone-sparkline-area"
                  />
                  {/* Revenue line */}
                  <path
                    d="M 0 170 Q 70 120, 140 150 T 280 80 T 400 130 T 500 110"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="bone-sparkline-line"
                  />
                </svg>
              </div>
            </div>

            {/* X-axis Ticks */}
            <div className="w-full border-t border-border/40 pt-2 flex justify-between pl-12 text-xs">
              {['6 AM', '8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'].map((_, idx) => (
                <div key={idx} className="bone-box" style={{ width: 28, height: 10, borderRadius: 2 }} />
              ))}
            </div>
          </div>

          {/* Metric Summary Footer */}
          <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="bone-box" style={{ width: 75, height: 11, borderRadius: 3, marginBottom: 6 }} />
                <div className="bone-box" style={{ width: 90, height: 20, borderRadius: 4, marginBottom: 4 }} />
                <div className="bone-box" style={{ width: 75, height: 11, borderRadius: 3 }} />
              </div>
            ))}
          </div>
        </DashboardCard>

        {/* Print Formats Donut */}
        <DashboardCard className="flex flex-col gap-5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div>
              <div className="bone-box" style={{ width: 110, height: 20, borderRadius: 6, marginBottom: 6 }} />
              <div className="bone-box" style={{ width: 180, height: 14, borderRadius: 4 }} />
            </div>
            <div className="bone-box" style={{ width: 68, height: 26, borderRadius: 8 }} />
          </div>

          <DonutChartSkeleton />

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="bone-box" style={{ width: 10, height: 10, borderRadius: '50%' }} />
                <div className="bone-box" style={{ width: 90, height: 14, borderRadius: 4 }} />
              </div>
              <div className="bone-box" style={{ width: 60, height: 14, borderRadius: 4 }} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="bone-box" style={{ width: 10, height: 10, borderRadius: '50%' }} />
                <div className="bone-box" style={{ width: 90, height: 14, borderRadius: 4 }} />
              </div>
              <div className="bone-box" style={{ width: 60, height: 14, borderRadius: 4 }} />
            </div>
          </div>
        </DashboardCard>
      </div>

      {/* ── 3. Kiosk Fleet Status Table Skeleton ── */}
      <DashboardCard className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div>
            <div className="bone-box" style={{ width: 180, height: 20, borderRadius: 6, marginBottom: 6 }} />
            <div className="bone-box" style={{ width: 310, height: 14, borderRadius: 4 }} />
          </div>
          <div className="bone-box" style={{ width: 135, height: 32, borderRadius: 6 }} />
        </div>

        {/* Desktop Table */}
        <div className="hidden min-w-0 md:block">
          <div className="grid grid-cols-12 items-center rounded-lg border border-border bg-card-hover px-4 py-3">
            <div className="col-span-3"><div className="bone-box" style={{ width: 110, height: 12, borderRadius: 3 }} /></div>
            <div className="col-span-3"><div className="bone-box" style={{ width: 95, height: 12, borderRadius: 3 }} /></div>
            <div className="col-span-2"><div className="bone-box" style={{ width: 75, height: 12, borderRadius: 3 }} /></div>
            <div className="col-span-2"><div className="bone-box" style={{ width: 75, height: 12, borderRadius: 3 }} /></div>
            <div className="col-span-2 flex justify-end"><div className="bone-box" style={{ width: 50, height: 12, borderRadius: 3 }} /></div>
          </div>

          <div className="divide-y divide-border">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="grid grid-cols-12 items-center px-4 py-3.5">
                <div className="col-span-3 flex items-center gap-3">
                  <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 opacity-60">
                    <div className="bone-box" style={{ width: 16, height: 16, borderRadius: 3 }} />
                  </div>
                  <div>
                    <div className="bone-box" style={{ width: 65, height: 14, borderRadius: 4, marginBottom: 4 }} />
                    <div className="bone-box" style={{ width: 120, height: 12, borderRadius: 3 }} />
                  </div>
                </div>

                <div className="col-span-3 flex items-center gap-2">
                  <div className="bone-box" style={{ width: 15, height: 15, borderRadius: 3 }} />
                  <div className="bone-box" style={{ width: 150, height: 14, borderRadius: 4 }} />
                </div>

                <div className="col-span-2 pr-4">
                  <div className="flex justify-between mb-1">
                    <div className="bone-box" style={{ width: 35, height: 11, borderRadius: 2 }} />
                    <div className="bone-box" style={{ width: 25, height: 11, borderRadius: 2 }} />
                  </div>
                  <div className="bone-box" style={{ width: '100%', height: 6, borderRadius: 999 }} />
                </div>

                <div className="col-span-2 pr-4">
                  <div className="flex justify-between mb-1">
                    <div className="bone-box" style={{ width: 35, height: 11, borderRadius: 2 }} />
                    <div className="bone-box" style={{ width: 25, height: 11, borderRadius: 2 }} />
                  </div>
                  <div className="bone-box" style={{ width: '100%', height: 6, borderRadius: 999 }} />
                </div>

                <div className="col-span-2 flex justify-end">
                  <div className="bone-box" style={{ width: 78, height: 22, borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile View */}
        <div className="grid gap-3 md:hidden">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 opacity-60">
                    <div className="bone-box" style={{ width: 16, height: 16, borderRadius: 3 }} />
                  </div>
                  <div>
                    <div className="bone-box" style={{ width: 60, height: 14, borderRadius: 4, marginBottom: 4 }} />
                    <div className="bone-box" style={{ width: 100, height: 11, borderRadius: 3 }} />
                  </div>
                </div>
                <div className="bone-box" style={{ width: 60, height: 20, borderRadius: 999 }} />
              </div>
              <div className="border-t border-border/50 pt-2 flex justify-between">
                <div className="bone-box" style={{ width: 110, height: 12, borderRadius: 3 }} />
                <div className="bone-box" style={{ width: 70, height: 12, borderRadius: 3 }} />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="bone-box" style={{ width: 40, height: 10, borderRadius: 2, marginBottom: 4 }} />
                  <div className="bone-box" style={{ width: '100%', height: 6, borderRadius: 999 }} />
                </div>
                <div>
                  <div className="bone-box" style={{ width: 40, height: 10, borderRadius: 2, marginBottom: 4 }} />
                  <div className="bone-box" style={{ width: '100%', height: 6, borderRadius: 999 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>
    </div>
  )
}

/**
 * ────────────────────────────────────────────────────────────────────────────
 * Merchant Hardware Console Skeleton
 * Mirrors PrinterWifiAutomation component structure and dimensions exactly
 * ────────────────────────────────────────────────────────────────────────────
 */
function MerchantHardwareConsoleSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <DashboardCard className="flex flex-col gap-5">
        {/* Top Header & Tab Switcher */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="bone-box" style={{ width: 115, height: 20, borderRadius: 9999 }} />
              <div className="bone-box" style={{ width: 140, height: 13, borderRadius: 3 }} />
            </div>
            <div className="flex items-center gap-2 mt-1 mb-1">
              <div className="bone-box" style={{ width: 280, height: 22, borderRadius: 6 }} />
              <div className="bone-box" style={{ width: 95, height: 20, borderRadius: 9999 }} />
            </div>
            <div className="bone-box" style={{ width: 'clamp(280px, 50vw, 540px)', height: 13, borderRadius: 4 }} />
          </div>

          <div className="flex items-center gap-2">
            <div className="bone-box" style={{ width: 110, height: 34, borderRadius: 6 }} />
            <div className="bone-box" style={{ width: 120, height: 34, borderRadius: 6 }} />
            <div className="bone-box" style={{ width: 34, height: 34, borderRadius: 6 }} />
          </div>
        </div>

        {/* Spooler Status & Diagnostic Buttons Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg bg-secondary/30 border border-border">
          <div className="flex items-center gap-3">
            <div className="bone-box" style={{ width: 180, height: 22, borderRadius: 9999 }} />
            <div className="bone-box" style={{ width: 85, height: 14, borderRadius: 3 }} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bone-box" style={{ width: 165, height: 32, borderRadius: 6 }} />
            <div className="bone-box" style={{ width: 130, height: 32, borderRadius: 6 }} />
            <div className="bone-box" style={{ width: 125, height: 32, borderRadius: 6 }} />
          </div>
        </div>

        {/* 3 Telemetry Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Card 1: Connected Printer */}
          <div className="p-4 rounded-lg border border-border bg-card space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <div className="bone-box" style={{ width: 130, height: 12, borderRadius: 3 }} />
              <div className="bone-box" style={{ width: 18, height: 18, borderRadius: 4 }} />
            </div>
            <div>
              <div className="bone-box" style={{ width: 190, height: 18, borderRadius: 4, marginBottom: 4 }} />
              <div className="bone-box" style={{ width: 150, height: 12, borderRadius: 3 }} />
            </div>
            <div className="space-y-2 pt-2 border-t border-border/30">
              <div className="flex justify-between">
                <div className="bone-box" style={{ width: 50, height: 11, borderRadius: 2 }} />
                <div className="bone-box" style={{ width: 150, height: 11, borderRadius: 2 }} />
              </div>
              <div className="flex justify-between">
                <div className="bone-box" style={{ width: 75, height: 11, borderRadius: 2 }} />
                <div className="bone-box" style={{ width: 60, height: 11, borderRadius: 2 }} />
              </div>
              <div className="flex justify-between">
                <div className="bone-box" style={{ width: 90, height: 11, borderRadius: 2 }} />
                <div className="bone-box" style={{ width: 140, height: 11, borderRadius: 2 }} />
              </div>
            </div>
          </div>

          {/* Card 2: Paper Tray Sensors */}
          <div className="p-4 rounded-lg border border-border bg-card space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <div className="bone-box" style={{ width: 135, height: 12, borderRadius: 3 }} />
              <div className="bone-box" style={{ width: 18, height: 18, borderRadius: 4 }} />
            </div>
            <div>
              <div className="bone-box" style={{ width: 90, height: 26, borderRadius: 6, marginBottom: 4 }} />
              <div className="bone-box" style={{ width: 110, height: 12, borderRadius: 3 }} />
            </div>
            <div className="space-y-2 pt-2 border-t border-border/30">
              <div className="flex justify-between">
                <div className="bone-box" style={{ width: 110, height: 11, borderRadius: 2 }} />
                <div className="bone-box" style={{ width: 85, height: 11, borderRadius: 2 }} />
              </div>
              <div className="flex justify-between">
                <div className="bone-box" style={{ width: 95, height: 11, borderRadius: 2 }} />
                <div className="bone-box" style={{ width: 75, height: 11, borderRadius: 2 }} />
              </div>
              <div className="flex justify-between">
                <div className="bone-box" style={{ width: 85, height: 11, borderRadius: 2 }} />
                <div className="bone-box" style={{ width: 45, height: 11, borderRadius: 2 }} />
              </div>
            </div>
          </div>

          {/* Card 3: CMYK Toner Levels */}
          <div className="p-4 rounded-lg border border-border bg-card space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <div className="bone-box" style={{ width: 135, height: 12, borderRadius: 3 }} />
              <div className="bone-box" style={{ width: 18, height: 18, borderRadius: 4 }} />
            </div>
            <div className="space-y-2.5 pt-1">
              {['Black (K)', 'Cyan (C)', 'Magenta (M)', 'Yellow (Y)'].map((_, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <div className="bone-box" style={{ width: 65, height: 11, borderRadius: 2 }} />
                    <div className="bone-box" style={{ width: 25, height: 11, borderRadius: 2 }} />
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div className="bone-box" style={{ width: `${85 - idx * 10}%`, height: '100%', borderRadius: 999 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DashboardCard>
    </div>
  )
}

/**
 * ────────────────────────────────────────────────────────────────────────────
 * Merchant Dashboard Boneyard Skeleton Fallback
 * Perfectly matches Merchant Partner Dashboard geometry, cards, and grid
 * ────────────────────────────────────────────────────────────────────────────
 */
export function MerchantDashboardSkeletonFallback() {
  return (
    <div className="admin-page capitalio-dashboard admin-skeleton-page animate-fadeInUp" aria-hidden="true">
      {/* ── Top Header Row Skeleton ── */}
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <div className="bone-box" style={{ width: 135, height: 20, borderRadius: 9999 }} />
            <div className="bone-box" style={{ width: 145, height: 20, borderRadius: 9999 }} />
            <div className="bone-box" style={{ width: 190, height: 13, borderRadius: 4 }} />
          </div>
          <div className="bone-box" style={{ width: 250, height: 32, borderRadius: 6, marginTop: 4, marginBottom: 4 }} />
          <div className="bone-box" style={{ width: 'clamp(280px, 45vw, 470px)', height: 15, borderRadius: 4 }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Period selector */}
          <div
            style={{
              display: 'flex',
              background: 'var(--secondary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 2,
              gap: 2,
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bone-box" style={{ width: 32, height: 26, borderRadius: 6 }} />
            ))}
          </div>

          {/* Date pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#ffffff',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '6px 12px',
              height: 32,
            }}
          >
            <div className="bone-box" style={{ width: 14, height: 14, borderRadius: 3 }} />
            <div className="bone-box" style={{ width: 95, height: 14, borderRadius: 4 }} />
          </div>

          {/* Activity dropdown anchor */}
          <ActivityDropdownSkeleton />
        </div>
      </div>

      {/* ── Action Bar Skeleton ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="bone-box" style={{ width: 165, height: 32, borderRadius: 6 }} />
        <div className="bone-box" style={{ width: 195, height: 32, borderRadius: 6 }} />
        <div className="bone-box" style={{ width: 155, height: 32, borderRadius: 6 }} />
        <div className="bone-box" style={{ width: 150, height: 32, borderRadius: 6 }} />
      </div>

      {/* ── Announcement Notice Banner Skeleton ── */}
      <div
        className="glass-card"
        style={{
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          borderRadius: 10,
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1 }}>
          <div className="bone-box" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div className="bone-box" style={{ width: 45, height: 18, borderRadius: 4 }} />
              <div className="bone-box" style={{ width: 230, height: 16, borderRadius: 4 }} />
            </div>
            <div className="bone-box" style={{ width: '85%', height: 13, borderRadius: 3, marginBottom: 4 }} />
            <div className="bone-box" style={{ width: 160, height: 11, borderRadius: 3 }} />
          </div>
        </div>
        <div className="bone-box" style={{ width: 100, height: 32, borderRadius: 6, flexShrink: 0 }} />
      </div>

      {/* ── 1. Capitalio Summary Metric Cards (4 Cards) ── */}
      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Store Earnings */}
        <DashboardCard className="flex min-h-48 flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="bone-box" style={{ width: 130, height: 16, borderRadius: 4 }} />
            <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 opacity-60">
              <div className="bone-box" style={{ width: 18, height: 18, borderRadius: 4 }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <div className="bone-box" style={{ width: 85, height: 32, borderRadius: 6 }} />
              <div className="bone-box" style={{ width: 45, height: 14, borderRadius: 4 }} />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="bone-box" style={{ width: 14, height: 14, borderRadius: 3 }} />
              <div className="bone-box" style={{ width: 170, height: 13, borderRadius: 4 }} />
            </div>
          </div>
          <SparklineWaveSkeleton type="area" />
        </DashboardCard>

        {/* Card 2: Store Print Volume */}
        <DashboardCard className="flex min-h-48 flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="bone-box" style={{ width: 125, height: 16, borderRadius: 4 }} />
            <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 opacity-60">
              <div className="bone-box" style={{ width: 18, height: 18, borderRadius: 4 }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <div className="bone-box" style={{ width: 55, height: 32, borderRadius: 6 }} />
              <div className="bone-box" style={{ width: 40, height: 14, borderRadius: 4 }} />
            </div>
            <div className="mt-2">
              <div className="bone-box" style={{ width: 165, height: 13, borderRadius: 4 }} />
            </div>
          </div>
          <SparklineWaveSkeleton type="bar" />
        </DashboardCard>

        {/* Card 3: PB-001 Live Status */}
        <DashboardCard className="flex min-h-48 flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="bone-box" style={{ width: 100, height: 16, borderRadius: 4 }} />
            <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 opacity-60">
              <div className="bone-box" style={{ width: 18, height: 18, borderRadius: 4 }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <div className="bone-box" style={{ width: 115, height: 26, borderRadius: 6 }} />
              <div className="bone-box" style={{ width: 55, height: 20, borderRadius: 9999 }} />
            </div>
            <div className="mt-2">
              <div className="bone-box" style={{ width: 185, height: 13, borderRadius: 3 }} />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <div className="bone-box" style={{ width: 95, height: 11, borderRadius: 2 }} />
              <div className="bone-box" style={{ width: 80, height: 11, borderRadius: 2 }} />
            </div>
            <div className="h-2 w-full overflow-hidden rounded-sm bg-secondary">
              <div className="bone-box" style={{ width: '70%', height: '100%', borderRadius: 2 }} />
            </div>
          </div>
        </DashboardCard>

        {/* Card 4: Estimated Payout */}
        <DashboardCard className="flex min-h-48 flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="bone-box" style={{ width: 115, height: 16, borderRadius: 4 }} />
            <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 opacity-60">
              <div className="bone-box" style={{ width: 18, height: 18, borderRadius: 4 }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <div className="bone-box" style={{ width: 70, height: 32, borderRadius: 6 }} />
              <div className="bone-box" style={{ width: 35, height: 14, borderRadius: 4 }} />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="bone-box" style={{ width: 65, height: 16, borderRadius: 4 }} />
              <div className="bone-box" style={{ width: 135, height: 13, borderRadius: 3 }} />
            </div>
          </div>
          <div className="rounded-md border border-border bg-secondary/50 p-2 flex items-center justify-between">
            <div className="bone-box" style={{ width: 130, height: 13, borderRadius: 3 }} />
            <div className="bone-box" style={{ width: 85, height: 13, borderRadius: 3 }} />
          </div>
        </DashboardCard>
      </div>

      {/* ── 2. Hardware Console Skeleton (Mirrors PrinterWifiAutomation) ── */}
      <MerchantHardwareConsoleSkeleton />

      {/* ── 3. Performance Section: Daily Store Earnings Area Chart ── */}
      <DashboardCard className="flex flex-col gap-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div>
            <div className="bone-box" style={{ width: 230, height: 20, borderRadius: 6, marginBottom: 6 }} />
            <div className="bone-box" style={{ width: 350, height: 14, borderRadius: 4 }} />
          </div>
          <div className="flex items-center gap-2">
            <div className="bone-box" style={{ width: 240, height: 26, borderRadius: 8 }} />
            <div className="bone-box" style={{ width: 125, height: 32, borderRadius: 6 }} />
          </div>
        </div>

        {/* Area Chart Canvas on Dot Grid */}
        <div className="h-64 w-full relative flex flex-col justify-between p-3 border border-border/40 rounded-md">
          <div className="w-full flex-1 relative flex">
            {/* Y-axis Ticks */}
            <div className="w-12 h-full flex flex-col justify-between py-1 pr-2 text-right">
              <div className="bone-box ml-auto" style={{ width: 22, height: 10, borderRadius: 2 }} />
              <div className="bone-box ml-auto" style={{ width: 22, height: 10, borderRadius: 2 }} />
              <div className="bone-box ml-auto" style={{ width: 22, height: 10, borderRadius: 2 }} />
              <div className="bone-box ml-auto" style={{ width: 22, height: 10, borderRadius: 2 }} />
            </div>

            {/* Chart Area Wave */}
            <div className="flex-1 h-full relative">
              <svg viewBox="0 0 500 200" className="w-full h-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="boneMerchGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0.01" />
                  </linearGradient>
                </defs>
                <path
                  d="M 0 150 Q 80 110, 160 130 T 320 60 T 420 100 T 500 80 L 500 200 L 0 200 Z"
                  fill="url(#boneMerchGrad)"
                  className="bone-sparkline-area"
                />
                <path
                  d="M 0 150 Q 80 110, 160 130 T 320 60 T 420 100 T 500 80"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="bone-sparkline-line"
                />
              </svg>
            </div>
          </div>

          {/* X-axis Ticks */}
          <div className="w-full border-t border-border/40 pt-2 flex justify-between pl-12 text-xs">
            {['6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM'].map((_, idx) => (
              <div key={idx} className="bone-box" style={{ width: 28, height: 10, borderRadius: 2 }} />
            ))}
          </div>
        </div>

        {/* 4-Metric Footer */}
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="bone-box" style={{ width: 95, height: 11, borderRadius: 3, marginBottom: 6 }} />
              <div className="bone-box" style={{ width: 80, height: 20, borderRadius: 4, marginBottom: 4 }} />
              <div className="bone-box" style={{ width: 120, height: 11, borderRadius: 3 }} />
            </div>
          ))}
        </div>
      </DashboardCard>

      {/* ── 4. Recent Store Orders Table Skeleton ── */}
      <DashboardCard className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div>
            <div className="bone-box" style={{ width: 195, height: 20, borderRadius: 6, marginBottom: 6 }} />
            <div className="bone-box" style={{ width: 240, height: 14, borderRadius: 4 }} />
          </div>
          <div className="bone-box" style={{ width: 145, height: 32, borderRadius: 6 }} />
        </div>

        {/* Desktop Table */}
        <div className="hidden min-w-0 md:block">
          <div className="grid grid-cols-12 items-center rounded-lg border border-border bg-card-hover px-4 py-3">
            <div className="col-span-3"><div className="bone-box" style={{ width: 110, height: 12, borderRadius: 3 }} /></div>
            <div className="col-span-2"><div className="bone-box" style={{ width: 55, height: 12, borderRadius: 3 }} /></div>
            <div className="col-span-2"><div className="bone-box" style={{ width: 70, height: 12, borderRadius: 3 }} /></div>
            <div className="col-span-3"><div className="bone-box" style={{ width: 140, height: 12, borderRadius: 3 }} /></div>
            <div className="col-span-2 flex justify-end"><div className="bone-box" style={{ width: 75, height: 12, borderRadius: 3 }} /></div>
          </div>

          <div className="divide-y divide-border">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="grid grid-cols-12 items-center px-4 py-3.5">
                <div className="col-span-3 flex items-center gap-3">
                  <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 opacity-60">
                    <div className="bone-box" style={{ width: 16, height: 16, borderRadius: 3 }} />
                  </div>
                  <div>
                    <div className="bone-box" style={{ width: 85, height: 14, borderRadius: 4, marginBottom: 4 }} />
                    <div className="bone-box" style={{ width: 120, height: 12, borderRadius: 3 }} />
                  </div>
                </div>

                <div className="col-span-2">
                  <div className="bone-box" style={{ width: 60, height: 14, borderRadius: 4 }} />
                </div>

                <div className="col-span-2">
                  <div className="bone-box" style={{ width: 55, height: 14, borderRadius: 4 }} />
                </div>

                <div className="col-span-3 flex items-center gap-1.5">
                  <div className="bone-box" style={{ width: 65, height: 16, borderRadius: 4 }} />
                  <div className="bone-box" style={{ width: 45, height: 12, borderRadius: 3 }} />
                </div>

                <div className="col-span-2 flex flex-col items-end gap-1">
                  <div className="bone-box" style={{ width: 65, height: 18, borderRadius: 999 }} />
                  <div className="bone-box" style={{ width: 55, height: 11, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile View */}
        <div className="grid gap-3 md:hidden">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 opacity-60">
                    <div className="bone-box" style={{ width: 16, height: 16, borderRadius: 3 }} />
                  </div>
                  <div>
                    <div className="bone-box" style={{ width: 75, height: 14, borderRadius: 4, marginBottom: 4 }} />
                    <div className="bone-box" style={{ width: 110, height: 11, borderRadius: 3 }} />
                  </div>
                </div>
                <div className="bone-box" style={{ width: 55, height: 18, borderRadius: 999 }} />
              </div>
              <div className="flex items-center justify-between border-t border-border/50 pt-2">
                <div className="bone-box" style={{ width: 90, height: 12, borderRadius: 3 }} />
                <div className="bone-box" style={{ width: 70, height: 12, borderRadius: 3 }} />
              </div>
              <div className="flex justify-end">
                <div className="bone-box" style={{ width: 50, height: 11, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>
    </div>
  )
}
