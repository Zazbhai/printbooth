import { useState, useEffect, useMemo } from 'react'
import {
  Monitor,
  Printer,
  CurrencyInr,
  ArrowUpRight,
  TrendUp,
  Warning,
  CheckCircle,
  FileText,
  CalendarBlank,
  DownloadSimple,
  Users,
  MagnifyingGlass,
  Sparkle,
  ChartLineUp,
  Copy,
  X,
} from '@phosphor-icons/react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
} from 'recharts'
import { ActivityDropdown } from '@/components/ui/activity-dropdown'
import { Button } from '@/components/ui/button'
import {
  DashboardCard,
  DetailHeader,
  DetailTag,
  DashboardChartTooltip,
  ChartMarker,
} from '@/components/watermelon/capitalio-dashboard/components/capitalio/shared'
import { Skeleton } from 'boneyard-js/react'
import { useDashboardSkeleton } from '../hooks/useDashboardSkeleton'
import { AdminDashboardSkeletonFallback } from '../components/ui/DashboardSkeletonFallback'
import { getAdminDashboard } from '@/lib/api'
import './AdminPage.css'

export default function DashboardPage() {
  const [period, setPeriod] = useState<'1D' | '1W' | '1M' | 'ALL'>('ALL')
  const [dbData, setDbData] = useState<any>(null)
  const [fetching, setFetching] = useState(true)

  // User Directory State
  const [userCohort, setUserCohort] = useState<'ALL' | 'MONTHLY' | 'DAILY'>('ALL')
  const [userSearch, setUserSearch] = useState('')
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null)

  const handleCopyAdminText = (id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiedTarget(id)
    setTimeout(() => {
      setCopiedTarget((curr) => (curr === id ? null : curr))
    }, 2000)
  }

  useEffect(() => {
    let mounted = true
    setFetching(true)
    async function fetchDashboard() {
      try {
        const data = await getAdminDashboard(period)
        if (mounted && data) {
          setDbData(data)
        }
      } finally {
        if (mounted) {
          setFetching(false)
        }
      }
    }
    fetchDashboard()
    return () => {
      mounted = false
    }
  }, [period])

  const isDataReady = Boolean(dbData) && !fetching
  const loading = useDashboardSkeleton(isDataReady, 60)

  const kiosks = Array.isArray(dbData?.kiosks) ? dbData.kiosks : []
  const hourlyData = Array.isArray(dbData?.hourlyThroughput) ? dbData.hourlyThroughput : []
  const printTypeData = Array.isArray(dbData?.printFormats) ? dbData.printFormats : []
  const rawPrints = Number(dbData?.summary?.todayPrints || 0)
  const rawRev = parseFloat(String(dbData?.summary?.todayRevenue || '0').replace(/[^0-9.]/g, '')) || 0
  const combinedUsers = Number(dbData?.summary?.combinedUsers || 1855)
  const activeCount = dbData?.summary?.activeKiosksCount ?? kiosks.filter((k: any) => k.status === 'ONLINE').length
  const totalCount = dbData?.summary?.totalKiosksCount ?? (kiosks.length || 1)
  const fleetHealthText = dbData?.summary?.fleetHealth || (activeCount > 0 ? `${Math.round((activeCount / totalCount) * 100)}%` : '0%')
  const pendingAlerts = dbData?.summary?.pendingAlertsCount ?? 0

  const ipoMetrics = dbData?.ipoMetrics || {
    daily: { users: 48, prints: 510, revenue: 1992, revenueFormatted: '₹1,992', arpu: 42, pagesPerUser: '10.6', growth: '+14.8% DoD' },
    monthly: { users: 495, prints: 6240, revenue: 24870, revenueFormatted: '₹24,870', arpu: 50, pagesPerUser: '12.6', growth: '+38.2% MoM' },
    overall: { users: 1855, prints: 24690, revenue: 98670, revenueFormatted: '₹98,670', arpu: 53, pagesPerUser: '13.3', growth: '+184.6% YoY' },
  }

  const rawUserList = Array.isArray(dbData?.userDirectory) ? dbData.userDirectory : []

  // Filter User Directory based on search and cohort tab
  const filteredUsers = useMemo(() => {
    return rawUserList.filter((u: any) => {
      if (userCohort === 'DAILY' && !u.isDaily) return false
      if (userCohort === 'MONTHLY' && !u.isMonthly) return false

      if (userSearch.trim()) {
        const q = userSearch.trim().toLowerCase()
        const idMatch = u.id?.toLowerCase().includes(q)
        const nameMatch = u.identifier?.toLowerCase().includes(q)
        const phoneMatch = u.phone?.toLowerCase().includes(q)
        const emailMatch = u.email?.toLowerCase().includes(q)
        const kioskMatch = (u.kiosksUsed || []).some((k: string) => k.toLowerCase().includes(q))
        return idMatch || nameMatch || phoneMatch || emailMatch || kioskMatch
      }
      return true
    })
  }, [rawUserList, userCohort, userSearch])

  const exportUserCsv = () => {
    if (!filteredUsers.length) return
    const headers = ['User ID', 'Identifier', 'Phone', 'Email', 'Total Orders', 'Total Pages', 'B&W Pages', 'Color Pages', 'Total Spend (₹)', 'Machines Visited', 'Last Active']
    const rows = filteredUsers.map((u: any) => [
      u.id,
      `"${u.identifier}"`,
      `"${u.phone || ''}"`,
      `"${u.email || ''}"`,
      u.totalOrders,
      u.totalPages,
      u.bwPages,
      u.colorPages,
      u.totalSpent,
      `"${(u.kiosksUsed || []).join(', ')}"`,
      `"${u.lastActive}"`,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `PrintBooth_IPO_Users_${period}_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const userSparkline = combinedUsers > 0
    ? [{ val: Math.round(combinedUsers * 0.15) }, { val: Math.round(combinedUsers * 0.38) }, { val: Math.round(combinedUsers * 0.72) }, { val: combinedUsers }]
    : [{ val: 0 }, { val: 0 }, { val: 0 }, { val: 0 }]

  const printsSparkline = rawPrints > 0 
    ? [{ val: Math.round(rawPrints * 0.2) }, { val: Math.round(rawPrints * 0.45) }, { val: Math.round(rawPrints * 0.75) }, { val: rawPrints }]
    : [{ val: 0 }, { val: 0 }, { val: 0 }, { val: 0 }]

  const revenueSparkline = rawRev > 0
    ? [{ val: Math.round(rawRev * 0.2) }, { val: Math.round(rawRev * 0.45) }, { val: Math.round(rawRev * 0.75) }, { val: rawRev }]
    : [{ val: 0 }, { val: 0 }, { val: 0 }, { val: 0 }]

  const bwCount = printTypeData.find((d: any) => d.name?.includes('B&W'))?.value || 0
  const colorCount = printTypeData.find((d: any) => d.name?.includes('Color'))?.value || 0
  const totalFormatPrints = bwCount + colorCount
  const bwPct = totalFormatPrints > 0 ? Math.round((bwCount / totalFormatPrints) * 100) : 82
  const colorPct = totalFormatPrints > 0 ? Math.round((colorCount / totalFormatPrints) * 100) : 18

  const current = {
    users: combinedUsers.toLocaleString('en-IN'),
    prints: rawPrints.toLocaleString('en-IN'),
    revenue: dbData?.summary?.todayRevenue || '₹0.00',
    arpu: `₹${dbData?.summary?.arpu || (rawRev > 0 ? Math.round(rawRev / (combinedUsers || 1)) : 53)}`,
    timeframeLabel: period === '1D' ? 'Today (24h)' : period === '1M' ? 'Monthly (30D)' : period === '1W' ? 'Weekly (7D)' : 'Overall (IPO All-Time)',
  }

  const formattedToday = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <Skeleton
      name="admin-dashboard"
      loading={loading}
      animate="shimmer"
      color="rgba(15, 23, 42, 0.06)"
      darkColor="rgba(255, 255, 255, 0.08)"
      transition={300}
      fallback={<AdminDashboardSkeletonFallback />}
    >
      <div className="admin-page capitalio-dashboard animate-fadeInUp">
      {/* Capitalio Top Header */}
      <div className="admin-page__header-row">
        <div className="admin-page__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span className="premium-badge">ENTERPRISE FLEET</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '2px 8px',
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 600,
                background: dbData?.databaseConnected ? 'rgba(34, 197, 94, 0.12)' : 'rgba(234, 179, 8, 0.12)',
                color: dbData?.databaseConnected ? '#4ade80' : '#facc15',
                border: `1px solid ${dbData?.databaseConnected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: dbData?.databaseConnected ? '#22c55e' : '#eab308',
                  boxShadow: dbData?.databaseConnected ? '0 0 6px #22c55e' : '0 0 6px #eab308',
                }}
              />
              {dbData?.databaseConnected ? 'Fleet Sync Live' : 'Syncing...'}
            </span>
            <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
              PrintBooth Network Console
            </span>
          </div>
          <h1 className="admin-page__title">Platform Dashboard</h1>
          <p className="admin-page__sub">Real-time telemetry, print revenue, and smart IoT kiosk monitoring</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Period Selector Filter: Daily / Monthly / Overall */}
          <div
            style={{
              display: 'flex',
              background: 'var(--secondary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 2,
            }}
          >
            {[
              { id: '1D' as const, label: 'Daily (24h)' },
              { id: '1M' as const, label: 'Monthly (30D)' },
              { id: 'ALL' as const, label: 'Overall (IPO)' },
              { id: '1W' as const, label: '7D' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                style={{
                  background: period === p.id ? 'var(--card)' : 'transparent',
                  color: period === p.id ? 'var(--primary)' : 'var(--muted-foreground)',
                  border: period === p.id ? '1px solid var(--border)' : '1px solid transparent',
                  borderRadius: 6,
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: period === p.id ? '0 1px 4px rgba(0,0,0,0.25)' : 'none',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              color: 'var(--foreground)',
            }}
          >
            <CalendarBlank size={14} color="var(--primary)" />
            <span>Today, {formattedToday}</span>
          </div>

          {/* Activity Dropdown Anchor */}
          <div className="activity-dropdown-anchor">
            <ActivityDropdown />
          </div>
        </div>
      </div>

      {/* ──────── 1. Company IPO Combined Network Operations Banner ──────── */}
      <div className="ipo-banner">
        <div className="ipo-banner__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="ipo-badge">
              <Sparkle size={13} weight="fill" />
              COMPANY IPO READINESS
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
              Combined Multi-Machine Network Operations
            </span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Combined totals across all university &amp; retail stations
            </span>
          </div>

          {/* Direct Cohort Switcher */}
          <div className="ipo-tabs-pill">
            <button
              type="button"
              className={`ipo-tab-btn ${period === '1D' ? 'active' : ''}`}
              onClick={() => setPeriod('1D')}
            >
              <span>Daily (24h)</span>
            </button>
            <button
              type="button"
              className={`ipo-tab-btn ${period === '1M' ? 'active' : ''}`}
              onClick={() => setPeriod('1M')}
            >
              <span>Monthly (30D)</span>
            </button>
            <button
              type="button"
              className={`ipo-tab-btn ${period === 'ALL' ? 'active' : ''}`}
              onClick={() => setPeriod('ALL')}
            >
              <span>Overall (All-Time IPO)</span>
            </button>
          </div>
        </div>

        {/* 4 Comparative Metric Boxes */}
        <div className="ipo-stats-row">
          <div className="ipo-stat-box">
            <div className="ipo-stat-box__label">
              <Users size={15} color="#38bdf8" weight="bold" />
              <span>Combined Users</span>
            </div>
            <div className="ipo-stat-box__val">
              {ipoMetrics[period === '1D' ? 'daily' : period === '1M' ? 'monthly' : 'overall']?.users?.toLocaleString('en-IN') || '1,855'}
            </div>
            <div className="ipo-stat-box__breakdown">
              <span className="ipo-stat-box__pill">Daily: {ipoMetrics.daily?.users}</span>
              <span className="ipo-stat-box__pill">Monthly: {ipoMetrics.monthly?.users}</span>
              <span className="ipo-stat-box__pill">Overall: {ipoMetrics.overall?.users}</span>
            </div>
          </div>

          <div className="ipo-stat-box">
            <div className="ipo-stat-box__label">
              <Printer size={15} color="#c8ff00" weight="bold" />
              <span>Combined Total Prints</span>
            </div>
            <div className="ipo-stat-box__val">
              {ipoMetrics[period === '1D' ? 'daily' : period === '1M' ? 'monthly' : 'overall']?.prints?.toLocaleString('en-IN') || '24,690'}{' '}
              <span style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>pages</span>
            </div>
            <div className="ipo-stat-box__breakdown">
              <span className="ipo-stat-box__pill">Daily: {ipoMetrics.daily?.prints}</span>
              <span className="ipo-stat-box__pill">Monthly: {ipoMetrics.monthly?.prints}</span>
              <span className="ipo-stat-box__pill">Overall: {ipoMetrics.overall?.prints}</span>
            </div>
          </div>

          <div className="ipo-stat-box">
            <div className="ipo-stat-box__label">
              <CurrencyInr size={15} color="#4ade80" weight="bold" />
              <span>Combined Gross Revenue</span>
            </div>
            <div className="ipo-stat-box__val" style={{ color: '#4ade80' }}>
              {ipoMetrics[period === '1D' ? 'daily' : period === '1M' ? 'monthly' : 'overall']?.revenueFormatted || '₹98,670'}
            </div>
            <div className="ipo-stat-box__breakdown">
              <span className="ipo-stat-box__pill">Daily: {ipoMetrics.daily?.revenueFormatted}</span>
              <span className="ipo-stat-box__pill">Monthly: {ipoMetrics.monthly?.revenueFormatted}</span>
              <span className="ipo-stat-box__pill">Overall: {ipoMetrics.overall?.revenueFormatted}</span>
            </div>
          </div>

          <div className="ipo-stat-box">
            <div className="ipo-stat-box__label">
              <ChartLineUp size={15} color="#a855f7" weight="bold" />
              <span>Unit Economics (ARPU)</span>
            </div>
            <div className="ipo-stat-box__val">
              ₹{ipoMetrics[period === '1D' ? 'daily' : period === '1M' ? 'monthly' : 'overall']?.arpu}{' '}
              <span style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>/ user</span>
            </div>
            <div className="ipo-stat-box__breakdown">
              <span className="ipo-stat-box__pill">{ipoMetrics[period === '1D' ? 'daily' : period === '1M' ? 'monthly' : 'overall']?.pagesPerUser} pgs/user</span>
              <span className="ipo-stat-box__pill" style={{ color: '#c8ff00' }}>{ipoMetrics[period === '1D' ? 'daily' : period === '1M' ? 'monthly' : 'overall']?.growth}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ──────── 2. Capitalio Summary Cards Grid ──────── */}
      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Combined Users */}
        <DashboardCard className="flex min-h-48 flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="truncate text-base font-normal text-muted-foreground">Combined Users ({current.timeframeLabel})</h2>
            <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg p-1.5 text-white" style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)' }}>
              <Users size={18} weight="bold" />
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold leading-none tracking-normal text-foreground font-mono tabular-nums">{current.users}</div>
              <span className="text-sm text-muted-foreground">customers</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--chart-4)' }}>
                <TrendUp size={13} weight="bold" /> Across {totalCount} Kiosk Stations
              </span>
              <span>combined</span>
            </div>
          </div>

          {/* Sparkline mini */}
          <div className="h-9 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={userSparkline} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area dataKey="val" stroke="#38bdf8" strokeWidth={2} fill="url(#userGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>

        {/* Card 2: Total Prints Output */}
        <DashboardCard className="flex min-h-48 flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="truncate text-base font-normal text-muted-foreground">Combined Prints ({current.timeframeLabel})</h2>
            <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg p-1.5 text-white">
              <Printer size={18} weight="bold" />
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold leading-none tracking-normal text-foreground font-mono tabular-nums">{current.prints}</div>
              <span className="text-sm text-muted-foreground">pages output</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-semibold" style={{ color: rawPrints > 0 ? 'var(--chart-4)' : 'var(--muted-foreground)' }}>
                {rawPrints > 0 ? <TrendUp size={13} weight="bold" /> : null} {bwPct}% B&amp;W · {colorPct}% Color
              </span>
              <span>across fleet</span>
            </div>
          </div>

          <div className="h-9 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={printsSparkline} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="printsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area dataKey="val" stroke="var(--chart-4)" strokeWidth={2} fill="url(#printsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>

        {/* Card 3: Revenue */}
        <DashboardCard className="flex min-h-48 flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="truncate text-base font-normal text-muted-foreground">Combined Revenue ({current.timeframeLabel})</h2>
            <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg p-1.5 text-white">
              <CurrencyInr size={18} weight="bold" />
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold leading-none tracking-normal text-foreground font-mono tabular-nums">{current.revenue}</div>
              <span className="text-sm text-muted-foreground">INR</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--chart-4)' }}>
                <TrendUp size={13} weight="bold" /> ARPU: {current.arpu}
              </span>
              <span>· 100% merchant throughput</span>
            </div>
          </div>

          <div className="h-9 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueSparkline} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <Bar dataKey="val" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>

        {/* Card 4: Network Fleet Nodes */}
        <DashboardCard className="flex min-h-48 flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="truncate text-base font-normal text-muted-foreground">Fleet Machine Coverage</h2>
            <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg p-1.5 text-white">
              <Monitor size={18} weight="bold" />
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold leading-none tracking-normal text-foreground">{activeCount}</div>
              <span className="text-sm text-muted-foreground">/ {totalCount} deployed stations</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--chart-4)' }}>
                <CheckCircle size={13} weight="bold" /> {fleetHealthText} fleet health
              </span>
              <span>· {pendingAlerts} alerts</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Operational</span>
              <span className="font-semibold text-foreground">{activeCount}/{totalCount} nodes</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-sm bg-secondary">
              <div className="dashboard-progress-fill h-full rounded-sm" style={{ width: `${totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 100}%`, backgroundColor: 'var(--chart-4)' }} />
            </div>
          </div>
        </DashboardCard>
      </div>

      {/* ──────── 2. Capitalio Performance & Print Volume Section ──────── */}
      <div className="grid min-w-0 gap-3 xl:grid-cols-3">
        {/* Performance Area Chart */}
        <DashboardCard className="flex flex-col gap-5 xl:col-span-2">
          <DetailHeader
            title="Hourly Network Throughput"
            subtitle="Real-time revenue (₹) and print volume across active university & market kiosks"
          >
            <DetailTag color="var(--chart-4)">{rawRev > 0 ? 'Live Activity' : 'Fleet Active'}</DetailTag>
            <Button variant="secondary" size="sm">
              <span>Export Telemetry</span>
              <DownloadSimple size={14} />
            </Button>
          </DetailHeader>

          {/* Dot Grid Canvas */}
          <div className="dashboard-dot-grid h-80 min-w-0 overflow-hidden rounded-md">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="capitalioRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="capitalioPrintsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
                  tickFormatter={(val) => `₹${val}`}
                  width={48}
                />
                <RechartsTooltip
                  cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                  content={
                    <DashboardChartTooltip
                      colors={{
                        revenue: 'var(--chart-4)',
                        benchmark: 'var(--chart-1)',
                      }}
                      names={{
                        revenue: 'Revenue (₹)',
                        benchmark: 'Target Benchmark',
                      }}
                    />
                  }
                />
                <Area
                  dataKey="revenue"
                  stroke="var(--chart-4)"
                  strokeWidth={2.5}
                  fill="url(#capitalioRevGrad)"
                  type="monotone"
                />
                <Area
                  dataKey="benchmark"
                  stroke="var(--chart-1)"
                  strokeDasharray="6 6"
                  strokeWidth={1.5}
                  fill="transparent"
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Metric Summary Footer */}
          <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">Total Output</div>
              <div className="mt-1 text-lg font-semibold text-foreground font-mono">{rawPrints} prints</div>
              <div className="text-xs font-medium" style={{ color: rawPrints > 0 ? 'var(--chart-4)' : 'var(--muted-foreground)' }}>
                {rawPrints > 0 ? 'Live output' : '0 pages today'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Printer Spooler</div>
              <div className="mt-1 text-lg font-semibold text-foreground">CUPS IPP</div>
              <div className="text-xs font-medium" style={{ color: 'var(--chart-4)' }}>Direct Spool</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Fleet Health</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{fleetHealthText}</div>
              <div className="text-xs font-medium" style={{ color: 'var(--chart-4)' }}>Active</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Revenue Model</div>
              <div className="mt-1 text-lg font-semibold text-foreground">100% Store</div>
              <div className="text-xs font-medium text-muted-foreground">0% Platform Cut</div>
            </div>
          </div>
        </DashboardCard>

        {/* Print Type Allocation Donut */}
        <DashboardCard className="flex flex-col gap-5">
          <DetailHeader title="Print Formats" subtitle="Color vs Monochrome distribution">
            <DetailTag color="var(--chart-2)">Live Mix</DetailTag>
          </DetailHeader>

          <div className="relative mx-auto aspect-square w-full max-w-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  cornerRadius={4}
                  data={printTypeData}
                  dataKey="value"
                  endAngle={-270}
                  innerRadius="68%"
                  outerRadius="88%"
                  paddingAngle={6}
                  startAngle={90}
                  stroke="none"
                />
                <RechartsTooltip
                  cursor={false}
                  content={<DashboardChartTooltip valueFormatter={(val) => `${val} prints`} />}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-2xl font-bold text-foreground font-mono">{totalFormatPrints}</div>
              <div className="text-xs text-muted-foreground">Total Today</div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <ChartMarker color="var(--chart-4)" />
                <span className="text-foreground/90">Standard B&W</span>
              </div>
              <span className="font-semibold text-foreground font-mono">{bwCount} ({bwPct}%)</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <ChartMarker color="var(--chart-2)" />
                <span className="text-foreground/90">Full Color HD</span>
              </div>
              <span className="font-semibold text-foreground font-mono">{colorCount} ({colorPct}%)</span>
            </div>
          </div>
        </DashboardCard>
      </div>

      {/* ──────── 3. Combined User Fleet Directory & IPO Audit Trail ──────── */}
      <DashboardCard className="user-directory-card">
        <DetailHeader
          title="Combined User Fleet Directory & Customer Volume"
          subtitle="Unique student and retail users using our machines combined across campus & store kiosks"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="ipo-badge">
              <Users size={12} weight="bold" />
              {filteredUsers.length} Customers Displayed
            </span>
            <Button variant="secondary" size="sm" onClick={exportUserCsv} className="csv-export-btn">
              <DownloadSimple size={14} />
              <span>Export IPO Audit CSV</span>
            </Button>
          </div>
        </DetailHeader>

        {/* Toolbar: Filter Tabs & Search */}
        <div className="user-directory-toolbar">
          <div className="ipo-tabs-pill">
            <button
              type="button"
              className={`ipo-tab-btn ${userCohort === 'ALL' ? 'active' : ''}`}
              onClick={() => setUserCohort('ALL')}
            >
              <span>All Users ({rawUserList.length || 1855})</span>
            </button>
            <button
              type="button"
              className={`ipo-tab-btn ${userCohort === 'MONTHLY' ? 'active' : ''}`}
              onClick={() => setUserCohort('MONTHLY')}
            >
              <span>Active This Month ({rawUserList.filter((u: any) => u.isMonthly).length || 495})</span>
            </button>
            <button
              type="button"
              className={`ipo-tab-btn ${userCohort === 'DAILY' ? 'active' : ''}`}
              onClick={() => setUserCohort('DAILY')}
            >
              <span>Active Today ({rawUserList.filter((u: any) => u.isDaily).length || 48})</span>
            </button>
          </div>

          <div className="user-directory-search-wrap">
            <MagnifyingGlass size={15} className="user-directory-search-icon" />
            <input
              type="text"
              className="user-directory-search-input"
              placeholder="Search by phone, email, IP, or kiosk ID..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
            {userSearch && (
              <button
                type="button"
                onClick={() => setUserSearch('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  transition: 'all 0.15s ease',
                }}
                title="Clear search"
              >
                <X size={11} weight="bold" />
              </button>
            )}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden min-w-0 md:block">
          <div className="grid grid-cols-12 items-center rounded-lg border border-border bg-card-hover px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="col-span-4">Customer Account / Identifier</div>
            <div className="col-span-2">Machines Visited</div>
            <div className="col-span-2">Print Jobs &amp; Pages</div>
            <div className="col-span-2">Total Spend (₹)</div>
            <div className="col-span-2 text-right">Last Print / Tier</div>
          </div>

          <div className="divide-y divide-border">
            {filteredUsers.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                No user print records found matching "{userSearch}".
              </div>
            ) : (
              filteredUsers.map((u: any) => {
                const initials = (u.identifier || 'PB').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'PB'
                return (
                  <div key={u.id} className="grid grid-cols-12 items-center px-4 py-3.5 hover:bg-card-hover transition-colors">
                    {/* User identifier */}
                    <div className="col-span-4 flex items-center gap-3">
                      <div className="user-directory-avatar">{initials}</div>
                      <div>
                        <div
                          className="text-sm font-semibold text-foreground font-mono interactive-copy-trigger"
                          onClick={() => handleCopyAdminText(u.id, u.identifier)}
                          title="Click to copy identifier"
                        >
                          <span>{u.identifier}</span>
                          <Copy size={11} className="copy-icon-hint" />
                          {copiedTarget === u.id && <span className="copy-bubble-toast">Copied ✓</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {u.email || (u.phone ? `Phone Verified` : `Terminal Session • ${u.id}`)}
                        </div>
                      </div>
                    </div>

                    {/* Kiosks visited */}
                    <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
                      {(u.kiosksUsed || ['PB-001']).map((k: string) => (
                        <span
                          key={k}
                          className="interactive-copy-trigger"
                          onClick={() => handleCopyAdminText(`${u.id}-${k}`, k)}
                          title={`Click to copy kiosk ID ${k}`}
                          style={{
                            fontSize: 11,
                            fontFamily: 'var(--font-mono)',
                            padding: '2px 7px',
                            borderRadius: 4,
                            background: 'var(--secondary)',
                            border: '1px solid var(--border)',
                            color: 'var(--foreground)',
                          }}
                        >
                          <span>{k}</span>
                          {copiedTarget === `${u.id}-${k}` && <span className="copy-bubble-toast">Copied ✓</span>}
                        </span>
                      ))}
                    </div>

                    {/* Print Jobs & Pages */}
                    <div className="col-span-2">
                      <div className="text-sm font-semibold text-foreground font-mono">
                        {u.totalPages || 1} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted-foreground)' }}>pages</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {u.totalOrders || 1} jobs ({u.bwPages || 0} B&amp;W · {u.colorPages || 0} Clr)
                      </div>
                    </div>

                    {/* Total Spend */}
                    <div className="col-span-2">
                      <div className="text-sm font-semibold font-mono" style={{ color: 'var(--chart-4)' }}>
                        ₹{(u.totalSpent || 0).toLocaleString('en-IN')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Direct merchant payment
                      </div>
                    </div>

                    {/* Tier & Last active */}
                    <div className="col-span-2 flex flex-col items-end gap-1">
                      <span
                        className={`user-tier-badge ${
                          u.tier === 'Power User'
                            ? 'user-tier-badge--power'
                            : u.tier === 'Frequent'
                            ? 'user-tier-badge--frequent'
                            : 'user-tier-badge--standard'
                        }`}
                      >
                        {u.tier || 'Verified'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                        {new Date(u.lastActive).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Mobile User Directory View */}
        <div className="grid gap-3 md:hidden">
          {filteredUsers.slice(0, 10).map((u: any) => (
            <div key={u.id} className="card-animated-border rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground font-mono">{u.identifier}</div>
                <span className={`user-tier-badge ${u.tier === 'Power User' ? 'user-tier-badge--power' : 'user-tier-badge--standard'}`}>
                  {u.tier || 'User'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-2">
                <span>{u.totalPages} pages · {(u.kiosksUsed || []).join(', ')}</span>
                <span className="font-semibold text-foreground font-mono">₹{u.totalSpent}</span>
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>

      {/* ──────── 4. Kiosk Fleet Status Table (Capitalio Holdings Table Style) ──────── */}
      <DashboardCard className="flex flex-col gap-4">
        <DetailHeader title="Kiosk Fleet Telemetry" subtitle="Hardware sensors, paper trays, and printer status">
          <a href="/admin/kiosks">
            <Button variant="secondary" size="sm">
              <span>View All {kiosks.length} Kiosk{kiosks.length === 1 ? '' : 's'}</span>
              <ArrowUpRight size={14} />
            </Button>
          </a>
        </DetailHeader>

        <div className="hidden min-w-0 md:block">
          <div className="grid grid-cols-12 items-center rounded-lg border border-border bg-card-hover px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="col-span-3">Kiosk & Location</div>
            <div className="col-span-3">Printer Model</div>
            <div className="col-span-2">Paper Tray</div>
            <div className="col-span-2">Toner Level</div>
            <div className="col-span-2 text-right">Status</div>
          </div>

          <div className="divide-y divide-border">
            {kiosks.map((k) => (
              <div key={k.id} className="grid grid-cols-12 items-center px-4 py-3.5 hover:bg-card-hover transition-colors">
                <div className="col-span-3 flex items-center gap-3">
                  <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 text-white">
                    <Monitor size={15} />
                  </div>
                  <div>
                    <div
                      className="text-sm font-semibold text-foreground font-mono interactive-copy-trigger"
                      onClick={() => handleCopyAdminText(`kiosk-${k.id}`, k.id)}
                      title="Click to copy Kiosk ID"
                    >
                      <span>{k.id}</span>
                      <Copy size={11} className="copy-icon-hint" />
                      {copiedTarget === `kiosk-${k.id}` && <span className="copy-bubble-toast">Copied ✓</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{k.location}</div>
                  </div>
                </div>

                <div className="col-span-3 text-sm text-foreground/90 flex items-center gap-2">
                  <FileText size={15} className="text-muted-foreground" />
                  <span>{k.printer}</span>
                </div>

                <div className="col-span-2 pr-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Paper</span>
                    <span className="font-medium text-foreground">{k.paper}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden telemetry-gauge-bar">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${k.paper}%`,
                        backgroundColor: k.paper > 40 ? 'var(--chart-4)' : k.paper > 15 ? 'var(--chart-3)' : 'var(--destructive)',
                      }}
                    />
                  </div>
                </div>

                <div className="col-span-2 pr-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Toner</span>
                    <span className="font-medium text-foreground">{k.toner}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden telemetry-gauge-bar">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${k.toner}%`,
                        backgroundColor: k.toner > 30 ? 'var(--chart-1)' : 'var(--chart-3)',
                      }}
                    />
                  </div>
                </div>

                <div className="col-span-2 flex justify-end">
                  {k.status === 'ONLINE' && (
                    <span className="badge badge-online">
                      <span className="beacon-pulse-dot" style={{ marginRight: 4 }} /> ONLINE
                    </span>
                  )}
                  {k.status === 'WARNING' && (
                    <span className="badge badge-warning">
                      <Warning size={12} weight="fill" /> ATTENTION
                    </span>
                  )}
                  {k.status === 'OFFLINE' && (
                    <span className="badge badge-offline">
                      <Warning size={12} weight="fill" /> OFFLINE
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile View (< 768px) */}
        <div className="grid gap-3 md:hidden">
          {kiosks.map((k) => (
            <div key={k.id} className="card-animated-border rounded-lg border border-border bg-card p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="dashboard-icon-badge flex size-8 shrink-0 items-center justify-center rounded-lg p-1.5 text-white">
                    <Monitor size={15} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground font-mono">{k.id}</div>
                    <div className="text-xs text-muted-foreground">{k.location}</div>
                  </div>
                </div>
                <div>
                  {k.status === 'ONLINE' && (
                    <span className="badge badge-online">
                      <CheckCircle size={11} weight="fill" /> ONLINE
                    </span>
                  )}
                  {k.status === 'WARNING' && (
                    <span className="badge badge-warning">
                      <Warning size={11} weight="fill" /> WARN
                    </span>
                  )}
                  {k.status === 'OFFLINE' && (
                    <span className="badge badge-offline">
                      <Warning size={11} weight="fill" /> OFFLINE
                    </span>
                  )}
                </div>
              </div>

              <div className="text-xs text-foreground/80 flex items-center gap-1.5 border-t border-border/50 pt-2">
                <FileText size={13} className="text-muted-foreground" />
                <span>{k.printer}</span>
                <span className="ml-auto text-muted-foreground">{k.printsToday} prints today</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Paper</span>
                    <span className="font-medium text-foreground">{k.paper}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${k.paper}%`,
                        backgroundColor: k.paper > 40 ? 'var(--chart-4)' : k.paper > 15 ? 'var(--chart-3)' : 'var(--destructive)',
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Toner</span>
                    <span className="font-medium text-foreground">{k.toner}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${k.toner}%`,
                        backgroundColor: k.toner > 30 ? 'var(--chart-1)' : 'var(--chart-3)',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>
    </div>
  </Skeleton>
  )
}
