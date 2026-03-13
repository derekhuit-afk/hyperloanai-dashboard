'use client'

import { useState, useEffect, useCallback } from 'react'

// ── CONFIG ────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// ── TYPES ─────────────────────────────────────────────────────
interface Tier {
  key: string
  name: string
  monthlyPrice: number
  annualPrice: number
  seats: string
  features: string[]
  popular?: boolean
  badge?: string
}

interface OrgBilling {
  subscription_tier: string
  subscription_status: string
  subscription_interval: string
  current_period_end: string
  cancel_at_period_end: boolean
  stripe_customer_id: string
}

interface Invoice {
  id: string
  stripe_invoice_id: string
  amount_paid_cents: number
  status: string
  invoice_date: string
  paid_at: string
  hosted_invoice_url: string
  invoice_pdf: string
}

// ── TIER DEFINITIONS ──────────────────────────────────────────
const TIERS: Tier[] = [
  {
    key: 'solo', name: 'SOLO',
    monthlyPrice: 299, annualPrice: 254,
    seats: '1 LO · 1 ISA',
    features: ['200 leads/month', '1,000 SMS/month', 'Huit AI agents', 'Pre-qual widget', 'Doc portal', 'Email + SMS channels'],
  },
  {
    key: 'team', name: 'TEAM',
    monthlyPrice: 499, annualPrice: 424,
    seats: '10 LO · 3 ISA', popular: true, badge: 'Most Popular',
    features: ['1,000 leads/month', '5,000 SMS/month', '300 voice minutes', 'Zillow + LinkedIn', 'Referral partner API', 'All SOLO features'],
  },
  {
    key: 'division', name: 'DIVISION',
    monthlyPrice: 799, annualPrice: 679,
    seats: '50 LO · 10 ISA',
    features: ['5,000 leads/month', '25,000 SMS/month', '1,500 voice minutes', 'Multi-branch dashboard', 'Priority support', 'All TEAM features'],
  },
  {
    key: 'company', name: 'COMPANY',
    monthlyPrice: 1499, annualPrice: 1274,
    seats: 'Unlimited', badge: 'Enterprise',
    features: ['Unlimited leads', 'Unlimited SMS + Voice', 'Dedicated CSM', 'Custom integrations', 'SLA guarantee', 'All DIVISION features'],
  },
]

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  active:    { bg: '#e4f4ec', color: '#1e7a55', label: 'Active' },
  past_due:  { bg: '#fef3e0', color: '#d4820a', label: 'Past Due' },
  canceled:  { bg: '#fdecea', color: '#c0392b', label: 'Canceled' },
  trialing:  { bg: '#e8f0fe', color: '#1a73e8', label: 'Trial' },
  inactive:  { bg: '#f2f2f2', color: '#666',    label: 'Inactive' },
  none:      { bg: '#f2f2f2', color: '#666',    label: 'No Plan' },
}

function fmtCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

function fmtDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ════════════════════════════════════════════════════════════════════════════
export default function BillingPage() {
  const [interval, setInterval] = useState<'month' | 'year'>('month')
  const [billing, setBilling]   = useState<OrgBilling | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading]   = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading]     = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  // Check URL params for Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success'))  { setSuccessMsg('🎉 Subscription activated! Welcome to HyperLoan AI.'); loadBilling() }
    if (params.get('canceled')) { /* just show the page */ }
    // Clean URL
    if (params.has('success') || params.has('canceled') || params.has('session_id')) {
      window.history.replaceState({}, '', '/billing')
    }
  }, [])

  async function loadBilling() {
    // In production, pass the actual org_id from auth context
    // For now we use a hardcoded demo org or read from local state
    const orgId = localStorage.getItem('hyperloanai_org_id') ?? ''
    if (!orgId) return

    const [orgRes, invRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}&select=subscription_tier,subscription_status,subscription_interval,current_period_end,cancel_at_period_end,stripe_customer_id`, {
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON}`, 'apikey': SUPABASE_ANON }
      }),
      fetch(`${SUPABASE_URL}/rest/v1/billing_invoices?org_id=eq.${orgId}&order=invoice_date.desc&limit=12`, {
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON}`, 'apikey': SUPABASE_ANON }
      })
    ])

    const orgs = await orgRes.json()
    const invs = await invRes.json()
    if (orgs?.[0]) setBilling(orgs[0])
    if (Array.isArray(invs)) setInvoices(invs)
  }

  async function handleCheckout(tierKey: string) {
    setCheckoutLoading(tierKey)
    try {
      const orgId    = localStorage.getItem('hyperloanai_org_id') ?? ''
      const userEmail = localStorage.getItem('hyperloanai_user_email') ?? ''

      const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tierKey, interval, org_id: orgId || undefined, user_email: userEmail || undefined }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else alert(data.error ?? 'Checkout failed — please try again')
    } catch {
      alert('Checkout failed — please try again')
    } finally {
      setCheckoutLoading(null)
    }
  }

  async function handlePortal() {
    setPortalLoading(true)
    try {
      const orgId = localStorage.getItem('hyperloanai_org_id') ?? ''
      const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-portal`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else alert(data.error ?? 'Portal unavailable — please contact support')
    } catch {
      alert('Portal unavailable — please contact support')
    } finally {
      setPortalLoading(false)
    }
  }

  const currentTier   = billing?.subscription_tier ?? 'none'
  const currentStatus = billing?.subscription_status ?? 'none'
  const statusStyle   = STATUS_STYLES[currentStatus] ?? STATUS_STYLES.none
  const isActive      = currentStatus === 'active' || currentStatus === 'trialing'
  const savings       = Math.round(15)

  const S = styles

  return (
    <div style={S.root}>

      {/* ── HEADER ── */}
      <div style={S.pageHeader}>
        <div>
          <div style={S.eyebrow}>Subscription</div>
          <div style={S.pageTitle}>Billing & Plans</div>
          <div style={S.pageSub}>Manage your HyperLoan AI subscription, payment method, and invoices.</div>
        </div>
        {isActive && (
          <button onClick={handlePortal} disabled={portalLoading} style={{ ...S.btnSecondary, ...(portalLoading ? S.btnDisabled : {}) }}>
            {portalLoading ? 'Opening...' : '⚙ Manage Billing'}
          </button>
        )}
      </div>

      {successMsg && (
        <div style={S.successBanner}>
          {successMsg}
        </div>
      )}

      {/* ── CURRENT PLAN ── */}
      {billing && isActive && (
        <div style={S.currentPlanCard}>
          <div style={S.currentPlanLeft}>
            <div style={S.planName}>{currentTier.toUpperCase()} Plan</div>
            <div style={S.planMeta}>
              <span style={{ ...S.statusBadge, background: statusStyle.bg, color: statusStyle.color }}>{statusStyle.label}</span>
              <span style={S.planDetail}>{billing.subscription_interval === 'year' ? 'Annual' : 'Monthly'} · Renews {fmtDate(billing.current_period_end)}</span>
              {billing.cancel_at_period_end && <span style={S.cancelNote}>Cancels at period end</span>}
            </div>
          </div>
          <button onClick={handlePortal} disabled={portalLoading} style={{ ...S.btnManage, ...(portalLoading ? S.btnDisabled : {}) }}>
            {portalLoading ? '...' : 'Manage →'}
          </button>
        </div>
      )}

      {/* ── INTERVAL TOGGLE ── */}
      <div style={S.intervalWrap}>
        <span style={S.intervalLabel}>Billing period:</span>
        <div style={S.intervalToggle}>
          <button
            onClick={() => setInterval('month')}
            style={{ ...S.toggleBtn, ...(interval === 'month' ? S.toggleBtnActive : {}) }}>
            Monthly
          </button>
          <button
            onClick={() => setInterval('year')}
            style={{ ...S.toggleBtn, ...(interval === 'year' ? S.toggleBtnActive : {}) }}>
            Annual
            <span style={S.savingsBadge}>Save {savings}%</span>
          </button>
        </div>
      </div>

      {/* ── PRICING GRID ── */}
      <div style={S.pricingGrid}>
        {TIERS.map(tier => {
          const isCurrent = currentTier === tier.key && isActive
          const price     = interval === 'year' ? tier.annualPrice : tier.monthlyPrice
          const isLoading = checkoutLoading === tier.key

          return (
            <div key={tier.key} style={{
              ...S.tierCard,
              ...(tier.popular ? S.tierCardPopular : {}),
              ...(isCurrent ? S.tierCardCurrent : {}),
            }}>
              {tier.badge && (
                <div style={{ ...S.tierBadge, ...(tier.popular ? S.tierBadgePopular : S.tierBadgeEnterprise) }}>
                  {tier.badge}
                </div>
              )}
              {isCurrent && <div style={S.currentMark}>✓ Current Plan</div>}

              <div style={S.tierName}>{tier.name}</div>
              <div style={S.tierSeats}>{tier.seats}</div>
              <div style={S.tierPriceWrap}>
                <span style={S.tierPrice}>${price}</span>
                <span style={S.tierPricePer}>/mo{interval === 'year' ? ' billed annually' : ''}</span>
              </div>
              {interval === 'year' && (
                <div style={S.annualTotal}>
                  ${(tier.annualPrice * 12).toLocaleString()}/year · save ${((tier.monthlyPrice - tier.annualPrice) * 12).toLocaleString()}
                </div>
              )}

              <ul style={S.featureList}>
                {tier.features.map(f => (
                  <li key={f} style={S.featureItem}>
                    <span style={S.featureCheck}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => !isCurrent && handleCheckout(tier.key)}
                disabled={isCurrent || isLoading}
                style={{
                  ...S.btnCheckout,
                  ...(tier.popular ? S.btnCheckoutPopular : {}),
                  ...(isCurrent ? S.btnCheckoutCurrent : {}),
                  ...(isLoading ? S.btnDisabled : {}),
                }}
              >
                {isLoading ? 'Loading...' : isCurrent ? 'Current Plan' : isActive ? 'Switch to This Plan' : 'Get Started'}
              </button>
            </div>
          )
        })}
      </div>

      {/* ── INVOICE HISTORY ── */}
      {invoices.length > 0 && (
        <div style={S.invoiceSection}>
          <div style={S.sectionTitle}>Invoice History</div>
          <div style={S.invoiceTable}>
            <div style={S.invoiceHeader}>
              <span>Date</span>
              <span>Amount</span>
              <span>Status</span>
              <span style={{ textAlign: 'right' as const }}>Download</span>
            </div>
            {invoices.map(inv => (
              <div key={inv.id} style={S.invoiceRow}>
                <span style={S.invoiceDate}>{fmtDate(inv.invoice_date)}</span>
                <span style={S.invoiceAmount}>{fmtCurrency(inv.amount_paid_cents)}</span>
                <span>
                  <span style={{
                    ...S.invStatusBadge,
                    background: inv.status === 'paid' ? '#e4f4ec' : '#fef3e0',
                    color:      inv.status === 'paid' ? '#1e7a55' : '#d4820a',
                  }}>
                    {inv.status}
                  </span>
                </span>
                <span style={{ textAlign: 'right' as const }}>
                  {inv.invoice_pdf && (
                    <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer" style={S.invoiceLink}>
                      PDF ↗
                    </a>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FOOTER NOTE ── */}
      <div style={S.footerNote}>
        All payments processed securely via Stripe. Cancel anytime — no contracts. Questions? Contact derek@huit.ai
      </div>
    </div>
  )
}

// ── STYLES ────────────────────────────────────────────────────
const styles = {
  root:               { padding: '32px', maxWidth: '1100px', margin: '0 auto', fontFamily: "'DM Sans', system-ui, sans-serif", color: '#0d1b2a' },
  pageHeader:         { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', gap: '16px', flexWrap: 'wrap' as const },
  eyebrow:            { fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#b5713a', marginBottom: '4px' },
  pageTitle:          { fontFamily: 'Georgia, serif', fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 500, color: '#0d1b2a', marginBottom: '6px' },
  pageSub:            { fontSize: '14px', color: '#5a6e84' },
  successBanner:      { background: '#e4f4ec', border: '1px solid rgba(30,122,85,0.3)', borderRadius: '8px', padding: '14px 20px', marginBottom: '24px', fontSize: '14px', fontWeight: 500, color: '#1e7a55' },
  currentPlanCard:    { background: '#0d1b2a', borderRadius: '10px', padding: '20px 24px', marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' },
  currentPlanLeft:    { flex: 1 },
  planName:           { fontSize: '18px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' },
  planMeta:           { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const },
  statusBadge:        { fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px' },
  planDetail:         { fontSize: '13px', color: 'rgba(255,255,255,0.6)' },
  cancelNote:         { fontSize: '12px', color: '#f5a623', fontWeight: 500 },
  btnManage:          { fontSize: '13px', fontWeight: 600, color: '#c9922a', background: 'rgba(201,146,42,0.12)', border: '1px solid rgba(201,146,42,0.3)', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', whiteSpace: 'nowrap' as const, transition: 'all 0.18s' },
  btnSecondary:       { fontSize: '13px', fontWeight: 600, color: '#0d1b2a', background: '#ffffff', border: '1.5px solid #eae8e3', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer', whiteSpace: 'nowrap' as const, transition: 'all 0.18s' },
  btnDisabled:        { opacity: 0.5, cursor: 'not-allowed' },
  intervalWrap:       { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' as const },
  intervalLabel:      { fontSize: '13px', fontWeight: 500, color: '#5a6e84' },
  intervalToggle:     { display: 'flex', background: '#f2f0ec', borderRadius: '8px', padding: '3px', gap: '2px' },
  toggleBtn:          { fontSize: '13px', fontWeight: 500, padding: '7px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'transparent', color: '#5a6e84', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.18s' },
  toggleBtnActive:    { background: '#0d1b2a', color: '#ffffff', fontWeight: 600 },
  savingsBadge:       { fontSize: '10px', fontWeight: 700, background: '#b5713a', color: 'white', padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.3px' },
  pricingGrid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '40px' },
  tierCard:           { background: '#ffffff', border: '1.5px solid #eae8e3', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column' as const, position: 'relative' as const, transition: 'box-shadow 0.18s', boxShadow: '0 1px 4px rgba(13,27,42,0.08)' },
  tierCardPopular:    { border: '2px solid #b5713a', boxShadow: '0 4px 24px rgba(181,113,58,0.15)' },
  tierCardCurrent:    { background: '#f9f7f4', border: '2px solid #0d1b2a' },
  tierBadge:          { position: 'absolute' as const, top: '-10px', left: '50%', transform: 'translateX(-50%)', fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px', whiteSpace: 'nowrap' as const, letterSpacing: '0.5px' },
  tierBadgePopular:   { background: '#b5713a', color: 'white' },
  tierBadgeEnterprise:{ background: '#0d1b2a', color: 'white' },
  currentMark:        { fontSize: '11px', fontWeight: 700, color: '#1e7a55', marginBottom: '8px', letterSpacing: '0.3px' },
  tierName:           { fontFamily: 'Georgia, serif', fontSize: '22px', fontWeight: 500, color: '#0d1b2a', marginBottom: '4px' },
  tierSeats:          { fontSize: '12px', color: '#8a9bb0', fontWeight: 500, marginBottom: '16px' },
  tierPriceWrap:      { display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' },
  tierPrice:          { fontFamily: 'Georgia, serif', fontSize: '36px', fontWeight: 600, color: '#0d1b2a' },
  tierPricePer:       { fontSize: '13px', color: '#8a9bb0' },
  annualTotal:        { fontSize: '11px', color: '#1e7a55', fontWeight: 500, marginBottom: '20px' },
  featureList:        { listStyle: 'none', padding: 0, margin: '16px 0 20px', flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  featureItem:        { display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: '#4a4a6a' },
  featureCheck:       { color: '#b5713a', fontWeight: 700, flexShrink: 0, marginTop: '1px', fontSize: '11px' },
  btnCheckout:        { fontSize: '14px', fontWeight: 700, padding: '12px 16px', borderRadius: '8px', border: '1.5px solid #eae8e3', background: '#f9f7f4', color: '#0d1b2a', cursor: 'pointer', transition: 'all 0.18s', width: '100%', marginTop: 'auto' },
  btnCheckoutPopular: { background: 'linear-gradient(135deg, #b5713a, #8a4e22)', color: '#ffffff', border: 'none', boxShadow: '0 4px 16px rgba(181,113,58,0.3)' },
  btnCheckoutCurrent: { background: '#eae8e3', color: '#8a9bb0', cursor: 'default', border: 'none' },
  invoiceSection:     { marginBottom: '32px' },
  sectionTitle:       { fontFamily: 'Georgia, serif', fontSize: '18px', fontWeight: 500, color: '#0d1b2a', marginBottom: '16px' },
  invoiceTable:       { background: '#ffffff', border: '1px solid #eae8e3', borderRadius: '10px', overflow: 'hidden' },
  invoiceHeader:      { display: 'grid', gridTemplateColumns: '1fr 1fr 100px 80px', padding: '12px 20px', background: '#f9f7f4', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' as const, color: '#8a9bb0', borderBottom: '1px solid #eae8e3' },
  invoiceRow:         { display: 'grid', gridTemplateColumns: '1fr 1fr 100px 80px', padding: '14px 20px', borderBottom: '1px solid #f2f0ec', alignItems: 'center', fontSize: '13px' },
  invoiceDate:        { color: '#4a4a6a' },
  invoiceAmount:      { fontWeight: 600, color: '#0d1b2a' },
  invStatusBadge:     { fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px' },
  invoiceLink:        { fontSize: '12px', fontWeight: 600, color: '#b5713a', textDecoration: 'none' },
  footerNote:         { fontSize: '12px', color: '#8a9bb0', textAlign: 'center' as const, lineHeight: 1.6, padding: '16px 0 32px' },
}
