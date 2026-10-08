import { useState, useEffect } from 'react'
import {
  CreditCard,
  Key,
  ArrowCounterClockwise,
  CheckCircle,
  Warning,
  ArrowsClockwise,
  Money,
  Wallet,
  Globe,
  ShieldCheck,
  Copy,
  Eye,
  EyeSlash,
  ArrowSquareOut,
  Lightning,
  Users,
  Receipt,
  PaperPlaneTilt,
  XCircle,
} from '@phosphor-icons/react'
import Select, { type TSelectData } from '@/components/ui/select'
import '../AdminPage.css'
import { getApiHostUrl } from '@/lib/config'
import './PaymentSettingsPage.css'

const REFUND_REASONS: TSelectData[] = [
  { id: 'print_failed', label: 'Print Job Failed', value: 'print_failed', icon: '🖨️', description: 'Hardware jam or feeder error' },
  { id: 'customer_request', label: 'Customer Request', value: 'customer_request', icon: '👤', description: 'Cancellation before job dispatch' },
  { id: 'duplicate', label: 'Duplicate Payment', value: 'duplicate', icon: '💳', description: 'Double UPI scan on terminal' },
  { id: 'fraudulent', label: 'Fraudulent Transaction', value: 'fraudulent', icon: '⚠️', description: 'Flagged dispute or reversal' },
  { id: 'other', label: 'Other', value: 'other', icon: '📝', description: 'Merchant / ops discretion' },
]

const API = getApiHostUrl()

interface RazorpayConfig {
  keyId: string
  keyIdConfigured: boolean
  keySecretConfigured: boolean
  webhookSecretConfigured: boolean
  accountId: string
  mode: 'live' | 'test' | 'not_configured'
  merchantPayoutsEnabled: boolean
  autoRefundEnabled: boolean
}

interface PaymentRecord {
  _id: string
  paymentId: string
  razorpayOrderId: string
  razorpayPaymentId?: string
  orderId: string
  merchantId?: string
  amount: number
  currency: string
  status: string
  refundId?: string
  refundAmount?: number
  method?: string
  createdAt: string
  capturedAt?: string
  refundedAt?: string
}

const STATUS_COLOR: Record<string, string> = {
  CAPTURED: 'success',
  CREATED: 'warning',
  PENDING: 'warning',
  REFUNDED: 'info',
  PARTIALLY_REFUNDED: 'info',
  FAILED: 'error',
}

export default function PaymentSettingsPage() {
  const [config, setConfig] = useState<RazorpayConfig | null>(null)
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [activeTab, setActiveTab] = useState<'config' | 'payments' | 'refund' | 'payout'>('config')

  // Config form state
  const [keyId, setKeyId] = useState('')
  const [keySecret, setKeySecret] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [accountId, setAccountId] = useState('')
  const [payoutsEnabled, setPayoutsEnabled] = useState(false)
  const [autoRefund, setAutoRefund] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [showWebhook, setShowWebhook] = useState(false)

  // Refund form
  const [refundPaymentId, setRefundPaymentId] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('customer_request')
  const [refundResult, setRefundResult] = useState<any>(null)
  const [refundLoading, setRefundLoading] = useState(false)

  // Payout form
  const [payoutMerchantId, setPayoutMerchantId] = useState('')
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutNote, setPayoutNote] = useState('')
  const [payoutResult, setPayoutResult] = useState<any>(null)
  const [payoutLoading, setPayoutLoading] = useState(false)

  async function fetchConfig() {
    try {
      const r = await fetch(`${API}/api/razorpay/config`)
      const j = await r.json()
      if (j.success) {
        setConfig(j.data)
        setKeyId(j.data.keyId || '')
        setAccountId(j.data.accountId || '')
        setPayoutsEnabled(j.data.merchantPayoutsEnabled)
        setAutoRefund(j.data.autoRefundEnabled)
      }
    } catch { /* offline */ }
  }

  async function fetchPayments() {
    try {
      const r = await fetch(`${API}/api/razorpay/payments?limit=30`)
      const j = await r.json()
      if (j.success) setPayments(j.data)
    } catch { /* offline */ }
  }

  useEffect(() => {
    Promise.all([fetchConfig(), fetchPayments()]).finally(() => setLoading(false))
  }, [])

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    try {
      const body: any = { keyId, accountId, merchantPayoutsEnabled: payoutsEnabled, autoRefundEnabled: autoRefund }
      if (keySecret) body.keySecret = keySecret
      if (webhookSecret) body.webhookSecret = webhookSecret

      const r = await fetch(`${API}/api/razorpay/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (j.success) {
        setConfig(j.data)
        setSaveMsg('✓ Configuration saved successfully')
        setKeySecret('')
        setWebhookSecret('')
      } else {
        setSaveMsg('⚠ Failed to save: ' + j.error)
      }
    } catch (err: any) {
      setSaveMsg('⚠ Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRefund(e: React.FormEvent) {
    e.preventDefault()
    setRefundLoading(true)
    setRefundResult(null)
    try {
      const body: any = { razorpayPaymentId: refundPaymentId, reason: refundReason }
      if (refundAmount) body.amount = Number(refundAmount)
      const r = await fetch(`${API}/api/razorpay/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      setRefundResult(j)
      if (j.success) fetchPayments()
    } catch (err: any) {
      setRefundResult({ success: false, error: err.message })
    } finally {
      setRefundLoading(false)
    }
  }

  async function handlePayout(e: React.FormEvent) {
    e.preventDefault()
    setPayoutLoading(true)
    setPayoutResult(null)
    try {
      const r = await fetch(`${API}/api/razorpay/payout-merchant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: payoutMerchantId, amount: Number(payoutAmount), note: payoutNote }),
      })
      const j = await r.json()
      setPayoutResult(j)
    } catch (err: any) {
      setPayoutResult({ success: false, error: err.message })
    } finally {
      setPayoutLoading(false)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  const modeColor = config?.mode === 'live' ? 'success' : config?.mode === 'test' ? 'warning' : 'error'
  const modeLabel = config?.mode === 'live' ? 'Live Mode' : config?.mode === 'test' ? 'Test Mode' : 'Not Configured'

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-page__header">
        <div className="admin-page__header-row">
          <div>
            <h1 className="admin-page__title">Payment Gateway</h1>
            <p className="admin-page__sub">Configure Razorpay, manage refunds, and pay merchant partners</p>
          </div>
          {config && (
            <div className={`rzp-mode-badge rzp-mode-badge--${modeColor}`}>
              <Lightning size={14} weight="fill" />
              {modeLabel}
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {!loading && (
        <div className="stats-grid rzp-stats">
          <div className="card shadow-custom rzp-stat-card">
            <div className="rzp-stat-icon rzp-stat-icon--blue"><CreditCard size={20} weight="duotone" /></div>
            <div className="rzp-stat-value">{payments.length}</div>
            <div className="rzp-stat-label">Total Payments</div>
          </div>
          <div className="card shadow-custom rzp-stat-card">
            <div className="rzp-stat-icon rzp-stat-icon--green"><CheckCircle size={20} weight="duotone" /></div>
            <div className="rzp-stat-value">{payments.filter(p => p.status === 'CAPTURED').length}</div>
            <div className="rzp-stat-label">Captured</div>
          </div>
          <div className="card shadow-custom rzp-stat-card">
            <div className="rzp-stat-icon rzp-stat-icon--amber"><ArrowCounterClockwise size={20} weight="duotone" /></div>
            <div className="rzp-stat-value">{payments.filter(p => p.status.includes('REFUNDED')).length}</div>
            <div className="rzp-stat-label">Refunded</div>
          </div>
          <div className="card shadow-custom rzp-stat-card">
            <div className="rzp-stat-icon rzp-stat-icon--purple"><Money size={20} weight="duotone" /></div>
            <div className="rzp-stat-value">₹{payments.filter(p => p.status === 'CAPTURED').reduce((s, p) => s + p.amount, 0).toLocaleString('en-IN')}</div>
            <div className="rzp-stat-label">Total Revenue</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="rzp-tabs">
        {[
          { id: 'config', icon: <Key size={15} />, label: 'Configuration' },
          { id: 'payments', icon: <Receipt size={15} />, label: 'Payments' },
          { id: 'refund', icon: <ArrowCounterClockwise size={15} />, label: 'Issue Refund' },
          { id: 'payout', icon: <PaperPlaneTilt size={15} />, label: 'Merchant Payout' },
        ].map(tab => (
          <button
            key={tab.id}
            className={`rzp-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id as any)}
            id={`rzp-tab-${tab.id}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Configuration Tab ── */}
      {activeTab === 'config' && (
        <div className="rzp-tab-content">
          <div className="rzp-config-grid">
            {/* API Keys Card */}
            <div className="card shadow-custom rzp-section">
              <div className="rzp-section__header">
                <div className="rzp-section__icon"><Key size={18} weight="duotone" /></div>
                <div>
                  <div className="rzp-section__title">API Credentials</div>
                  <div className="rzp-section__sub">From Razorpay Dashboard → Settings → API Keys</div>
                </div>
                <a
                  href="https://dashboard.razorpay.com/app/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost rzp-ext-link"
                  title="Open Razorpay Dashboard"
                >
                  <ArrowSquareOut size={14} />
                </a>
              </div>

              <form onSubmit={handleSaveConfig} className="rzp-form">
                {/* Status Pills */}
                <div className="rzp-status-pills">
                  <div className={`rzp-pill ${config?.keyIdConfigured ? 'rzp-pill--ok' : 'rzp-pill--err'}`}>
                    {config?.keyIdConfigured ? <CheckCircle size={12} weight="fill" /> : <XCircle size={12} weight="fill" />}
                    Key ID {config?.keyIdConfigured ? 'Set' : 'Missing'}
                  </div>
                  <div className={`rzp-pill ${config?.keySecretConfigured ? 'rzp-pill--ok' : 'rzp-pill--err'}`}>
                    {config?.keySecretConfigured ? <CheckCircle size={12} weight="fill" /> : <XCircle size={12} weight="fill" />}
                    Key Secret {config?.keySecretConfigured ? 'Set' : 'Missing'}
                  </div>
                  <div className={`rzp-pill ${config?.webhookSecretConfigured ? 'rzp-pill--ok' : 'rzp-pill--warn'}`}>
                    {config?.webhookSecretConfigured ? <CheckCircle size={12} weight="fill" /> : <Warning size={12} weight="fill" />}
                    Webhook {config?.webhookSecretConfigured ? 'Configured' : 'Optional'}
                  </div>
                </div>

                <div className="rzp-field">
                  <label className="rzp-label">Key ID</label>
                  <div className="rzp-input-row">
                    <input
                      id="rzp-key-id"
                      className="rzp-input"
                      value={keyId}
                      onChange={e => setKeyId(e.target.value)}
                      placeholder="rzp_test_xxxxxxxxxxxx"
                      spellCheck={false}
                    />
                    <button type="button" className="btn btn-ghost rzp-copy-btn" onClick={() => copyToClipboard(keyId)} title="Copy">
                      <Copy size={14} />
                    </button>
                  </div>
                  <p className="rzp-hint">Starts with <code>rzp_test_</code> for test mode or <code>rzp_live_</code> for production.</p>
                </div>

                <div className="rzp-field">
                  <label className="rzp-label">Key Secret {config?.keySecretConfigured && <span className="rzp-badge-set">Already Set</span>}</label>
                  <div className="rzp-input-row">
                    <input
                      id="rzp-key-secret"
                      className="rzp-input"
                      type={showSecret ? 'text' : 'password'}
                      value={keySecret}
                      onChange={e => setKeySecret(e.target.value)}
                      placeholder={config?.keySecretConfigured ? '••••••••••••• (leave blank to keep current)' : 'Enter your key secret'}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button type="button" className="btn btn-ghost rzp-copy-btn" onClick={() => setShowSecret(s => !s)} title="Toggle visibility">
                      {showSecret ? <EyeSlash size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="rzp-field">
                  <label className="rzp-label">Webhook Secret {config?.webhookSecretConfigured && <span className="rzp-badge-set">Already Set</span>}</label>
                  <div className="rzp-input-row">
                    <input
                      id="rzp-webhook-secret"
                      className="rzp-input"
                      type={showWebhook ? 'text' : 'password'}
                      value={webhookSecret}
                      onChange={e => setWebhookSecret(e.target.value)}
                      placeholder={config?.webhookSecretConfigured ? '••••••••••••• (leave blank to keep current)' : 'Enter webhook secret'}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button type="button" className="btn btn-ghost rzp-copy-btn" onClick={() => setShowWebhook(s => !s)} title="Toggle visibility">
                      {showWebhook ? <EyeSlash size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="rzp-hint">Webhook URL: <code>{API}/api/razorpay/webhook</code></p>
                </div>

                <div className="rzp-field">
                  <label className="rzp-label">Account ID <span className="rzp-optional">optional</span></label>
                  <input
                    id="rzp-account-id"
                    className="rzp-input"
                    value={accountId}
                    onChange={e => setAccountId(e.target.value)}
                    placeholder="acc_xxxxxxxxxx"
                    spellCheck={false}
                  />
                  <p className="rzp-hint">Required for merchant Route transfers via RazorpayX.</p>
                </div>

                {saveMsg && (
                  <div className={`rzp-save-msg ${saveMsg.startsWith('✓') ? 'rzp-save-msg--ok' : 'rzp-save-msg--err'}`}>
                    {saveMsg}
                  </div>
                )}

                <button id="rzp-save-config" type="submit" className="btn btn-primary rzp-save-btn" disabled={saving}>
                  {saving ? <ArrowsClockwise size={16} className="spin" /> : <ShieldCheck size={16} />}
                  {saving ? 'Saving…' : 'Save Configuration'}
                </button>
              </form>
            </div>

            {/* Feature Toggles Card */}
            <div className="card shadow-custom rzp-section">
              <div className="rzp-section__header">
                <div className="rzp-section__icon"><Lightning size={18} weight="duotone" /></div>
                <div>
                  <div className="rzp-section__title">Features & Toggles</div>
                  <div className="rzp-section__sub">Control payment gateway behaviour</div>
                </div>
              </div>

              <div className="rzp-toggles">
                <div className="rzp-toggle-row">
                  <div className="rzp-toggle-info">
                    <div className="rzp-toggle-label"><Users size={14} /> Merchant Payouts</div>
                    <div className="rzp-toggle-desc">Enable automatic Razorpay Route transfers to merchant partners. Requires RazorpayX account.</div>
                  </div>
                  <label className="rzp-switch" htmlFor="toggle-payouts">
                    <input id="toggle-payouts" type="checkbox" checked={payoutsEnabled} onChange={e => setPayoutsEnabled(e.target.checked)} />
                    <span className="rzp-switch__track" />
                  </label>
                </div>

                <div className="rzp-toggle-row">
                  <div className="rzp-toggle-info">
                    <div className="rzp-toggle-label"><ArrowCounterClockwise size={14} /> Auto Refund</div>
                    <div className="rzp-toggle-desc">Automatically trigger refund when a print order fails after payment is captured.</div>
                  </div>
                  <label className="rzp-switch" htmlFor="toggle-refund">
                    <input id="toggle-refund" type="checkbox" checked={autoRefund} onChange={e => setAutoRefund(e.target.checked)} />
                    <span className="rzp-switch__track" />
                  </label>
                </div>
              </div>

              {/* Mode Indicator */}
              <div className={`rzp-mode-panel rzp-mode-panel--${modeColor}`}>
                <Globe size={18} />
                <div>
                  <div className="rzp-mode-panel__title">{modeLabel}</div>
                  <div className="rzp-mode-panel__desc">
                    {config?.mode === 'live'
                      ? 'Production mode — real payments are being processed.'
                      : config?.mode === 'test'
                      ? 'Test mode — use Razorpay test card numbers. No real money.'
                      : 'Configure your API Key ID above to activate the gateway.'}
                  </div>
                </div>
              </div>

              {/* Quick Reference */}
              <div className="rzp-quick-ref">
                <div className="rzp-quick-ref__title">Test Card Numbers</div>
                {[
                  { label: 'Success', card: '4111 1111 1111 1111', cvv: 'Any', exp: 'Any future' },
                  { label: 'Fail', card: '4000 0000 0000 0002', cvv: 'Any', exp: 'Any future' },
                ].map(c => (
                  <div key={c.label} className="rzp-test-card">
                    <div className="rzp-test-card__label">{c.label}</div>
                    <code>{c.card}</code>
                    <div className="rzp-test-card__meta">CVV: {c.cvv} · Exp: {c.exp}</div>
                  </div>
                ))}
                <div className="rzp-quick-ref__title" style={{ marginTop: 12 }}>Test UPI</div>
                <code>success@razorpay</code> / <code>failure@razorpay</code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Payments Tab ── */}
      {activeTab === 'payments' && (
        <div className="card shadow-custom rzp-tab-content">
          <div className="card-header">
            <span className="card-title">Payment Records</span>
            <button className="btn btn-ghost" onClick={fetchPayments} id="rzp-refresh-payments">
              <ArrowsClockwise size={14} />
              Refresh
            </button>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Payment ID</th>
                  <th>Order</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Razorpay ID</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--clr-text-4)' }}>
                      No payment records yet. Payments will appear here after checkout.
                    </td>
                  </tr>
                ) : (
                  payments.map(p => (
                    <tr key={p._id}>
                      <td><code className="rzp-mono">{p.paymentId}</code></td>
                      <td><code className="rzp-mono">{p.orderId}</code></td>
                      <td><strong>₹{p.amount.toLocaleString('en-IN')}</strong></td>
                      <td>{p.method ? <span className="rzp-method-tag">{p.method}</span> : '—'}</td>
                      <td>
                        <span className={`status-badge status-${STATUS_COLOR[p.status] || 'default'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td>
                        {p.razorpayPaymentId
                          ? <code className="rzp-mono rzp-mono--sm">{p.razorpayPaymentId}</code>
                          : <span style={{ color: 'var(--clr-text-4)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--clr-text-3)' }}>
                        {new Date(p.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td>
                        {p.razorpayPaymentId && p.status === 'CAPTURED' && (
                          <button
                            className="btn btn-ghost rzp-action-btn"
                            onClick={() => { setRefundPaymentId(p.razorpayPaymentId || ''); setActiveTab('refund') }}
                          >
                            <ArrowCounterClockwise size={12} />
                            Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Refund Tab ── */}
      {activeTab === 'refund' && (
        <div className="rzp-tab-content rzp-form-tab">
          <div className="card shadow-custom rzp-section rzp-section--centered">
            <div className="rzp-section__header">
              <div className="rzp-section__icon rzp-section__icon--amber"><ArrowCounterClockwise size={18} weight="duotone" /></div>
              <div>
                <div className="rzp-section__title">Issue Refund</div>
                <div className="rzp-section__sub">Refund a captured payment fully or partially</div>
              </div>
            </div>

            <form onSubmit={handleRefund} className="rzp-form">
              <div className="rzp-field">
                <label className="rzp-label">Razorpay Payment ID *</label>
                <input
                  id="rzp-refund-payment-id"
                  className="rzp-input"
                  value={refundPaymentId}
                  onChange={e => setRefundPaymentId(e.target.value)}
                  placeholder="pay_xxxxxxxxxxxxxxxxxx"
                  required
                  spellCheck={false}
                />
                <p className="rzp-hint">Found in the Payments table above or on your Razorpay dashboard.</p>
              </div>

              <div className="rzp-field">
                <label className="rzp-label">Refund Amount (₹) <span className="rzp-optional">leave blank for full refund</span></label>
                <input
                  id="rzp-refund-amount"
                  className="rzp-input"
                  type="number"
                  min="1"
                  step="0.01"
                  value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  placeholder="e.g. 10 (blank = full refund)"
                />
              </div>

              <div className="rzp-field">
                <label className="rzp-label">Reason</label>
                <Select
                  title="Select Refund Reason"
                  data={REFUND_REASONS}
                  value={refundReason}
                  onChange={(val) => setRefundReason(val)}
                  dropdownWidth={340}
                />
              </div>

              {refundResult && (
                <div className={`rzp-result ${refundResult.success ? 'rzp-result--ok' : 'rzp-result--err'}`}>
                  {refundResult.success ? (
                    <>
                      <CheckCircle size={20} weight="fill" />
                      <div>
                        <strong>Refund initiated!</strong>
                        <div>Refund ID: <code>{refundResult.data?.refundId}</code></div>
                        <div>Amount: ₹{refundResult.data?.amount} · Status: {refundResult.data?.status}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <Warning size={20} weight="fill" />
                      <div><strong>Error:</strong> {refundResult.error}</div>
                    </>
                  )}
                </div>
              )}

              <button id="rzp-submit-refund" type="submit" className="btn btn-primary rzp-save-btn" disabled={refundLoading}>
                {refundLoading ? <ArrowsClockwise size={16} className="spin" /> : <ArrowCounterClockwise size={16} />}
                {refundLoading ? 'Processing…' : 'Issue Refund'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Payout Tab ── */}
      {activeTab === 'payout' && (
        <div className="rzp-tab-content rzp-form-tab">
          <div className="card shadow-custom rzp-section rzp-section--centered">
            <div className="rzp-section__header">
              <div className="rzp-section__icon rzp-section__icon--green"><Wallet size={18} weight="duotone" /></div>
              <div>
                <div className="rzp-section__title">Merchant Payout</div>
                <div className="rzp-section__sub">Transfer commission earnings to a merchant partner</div>
              </div>
            </div>

            {!config?.merchantPayoutsEnabled && (
              <div className="rzp-banner rzp-banner--warn">
                <Warning size={16} weight="fill" />
                <span><strong>Merchant Payouts disabled.</strong> Enable it in the Configuration tab. Requires RazorpayX or Route.</span>
              </div>
            )}

            <form onSubmit={handlePayout} className="rzp-form">
              <div className="rzp-field">
                <label className="rzp-label">Merchant ID *</label>
                <input
                  id="rzp-payout-merchant"
                  className="rzp-input"
                  value={payoutMerchantId}
                  onChange={e => setPayoutMerchantId(e.target.value)}
                  placeholder="e.g. M-001"
                  required
                />
              </div>

              <div className="rzp-field">
                <label className="rzp-label">Amount (₹) *</label>
                <input
                  id="rzp-payout-amount"
                  className="rzp-input"
                  type="number"
                  min="1"
                  step="0.01"
                  value={payoutAmount}
                  onChange={e => setPayoutAmount(e.target.value)}
                  placeholder="e.g. 500"
                  required
                />
              </div>

              <div className="rzp-field">
                <label className="rzp-label">Note <span className="rzp-optional">optional</span></label>
                <input
                  id="rzp-payout-note"
                  className="rzp-input"
                  value={payoutNote}
                  onChange={e => setPayoutNote(e.target.value)}
                  placeholder="e.g. Weekly commission – September 2026"
                />
              </div>

              {payoutResult && (
                <div className={`rzp-result ${payoutResult.success ? 'rzp-result--ok' : 'rzp-result--err'}`}>
                  {payoutResult.success ? (
                    <>
                      <CheckCircle size={20} weight="fill" />
                      <div>
                        <strong>{payoutResult.message}</strong>
                        <div>Payout ID: <code>{payoutResult.data?.payoutId}</code></div>
                        <div>Merchant: {payoutResult.data?.merchantName} · ₹{payoutResult.data?.amount}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <Warning size={20} weight="fill" />
                      <div><strong>Error:</strong> {payoutResult.error}</div>
                    </>
                  )}
                </div>
              )}

              <button id="rzp-submit-payout" type="submit" className="btn btn-primary rzp-save-btn" disabled={payoutLoading}>
                {payoutLoading ? <ArrowsClockwise size={16} className="spin" /> : <PaperPlaneTilt size={16} />}
                {payoutLoading ? 'Processing…' : 'Send Payout'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
