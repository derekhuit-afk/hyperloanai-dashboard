'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase/client'

type OnboardStep = 1 | 2 | 3 | 4 | 'done'

interface OrgInfo {
  org_id: string
  org_name: string
  tier: string
}

const TIER_LABELS: Record<string, string> = {
  solo: 'SOLO', team: 'TEAM', division: 'DIVISION', company: 'COMPANY'
}

export default function OnboardingPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const supabase     = createClient()

  const token      = searchParams.get('token')
  const emailParam = searchParams.get('email') ? decodeURIComponent(searchParams.get('email')!) : ''

  const [step, setStep]       = useState<OnboardStep>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null)

  // Step 1 form
  const [fullName, setFullName]   = useState('')
  const [nmlsId, setNmlsId]       = useState('')
  // Step 2 form
  const [orgName, setOrgName]     = useState('')
  const [website, setWebsite]     = useState('')
  // Step 3 form
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviteRole, setInviteRole]     = useState('lo')

  // If we have a token from the welcome email, claim it on load
  useEffect(() => {
    if (!token) claimFromSession()
    else claimFromToken()
  }, [])

  async function claimFromToken() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push(`/signup?token=${token}&email=${encodeURIComponent(emailParam)}`); return }

    const res = await supabase.rpc('claim_onboarding_session', { p_token: token, p_user_id: user.id })
    if (res.data?.error) { setError(res.data.error); setLoading(false); return }

    if (res.data?.ok) {
      setOrgInfo({ org_id: res.data.org_id, org_name: res.data.org_name ?? '', tier: res.data.tier ?? 'solo' })
      setOrgName(res.data.org_name ?? '')
    }
    setLoading(false)
  }

  async function claimFromSession() {
    // User arrived without a token — check if they already have an org
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: orgUser } = await supabase
      .from('org_users')
      .select('org_id, role, organizations(id, name, subscription_tier)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (orgUser) {
      const org = orgUser.organizations as any
      setOrgInfo({ org_id: org.id, org_name: org.name, tier: org.subscription_tier ?? 'solo' })
      setOrgName(org.name ?? '')
    }
    // Fill name from auth metadata
    setFullName(user.user_metadata?.full_name ?? '')
  }

  // ── STEP 1: Profile ──────────────────────────────────────────────────────
  async function saveProfile() {
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { error: profileError } = await supabase.from('user_profiles').update({
      full_name: fullName,
      nmls_id:   nmlsId,
    }).eq('id', user.id)

    if (profileError) { setError(profileError.message); setLoading(false); return }

    await supabase.auth.updateUser({ data: { full_name: fullName } })
    setLoading(false)
    setStep(2)
  }

  // ── STEP 2: Org name ─────────────────────────────────────────────────────
  async function saveOrg() {
    if (!orgInfo?.org_id) { setStep(3); return }
    setLoading(true); setError('')

    const { error: orgError } = await supabase.from('organizations').update({
      name:    orgName,
      website: website || null,
    }).eq('id', orgInfo.org_id)

    if (orgError) { setError(orgError.message); setLoading(false); return }

    setOrgInfo(prev => prev ? { ...prev, org_name: orgName } : prev)
    setLoading(false)
    setStep(3)
  }

  // ── STEP 3: Invite team ───────────────────────────────────────────────────
  async function sendInvites() {
    if (!inviteEmails.trim()) { setStep(4); return }
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()

    const emails = inviteEmails.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.includes('@'))

    await Promise.all(emails.map(email =>
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/auth-invite`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgInfo?.org_id, email, role: inviteRole, invited_by: user?.id }),
      })
    ))

    setLoading(false)
    setStep(4)
  }

  // ── STEP 4: Done → dashboard ──────────────────────────────────────────────
  async function finishOnboarding() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('user_profiles').update({ onboarding_done: true }).eq('id', user.id)
    }
    if (orgInfo?.org_id) {
      localStorage.setItem('hyperloanai_org_id', orgInfo.org_id)
    }
    router.push('/dashboard')
  }

  const S = styles
  const progressPct = step === 'done' ? 100 : ((step as number) - 1) / 4 * 100

  return (
    <div style={S.root}>
      <div style={S.widget}>

        {/* Header */}
        <div style={S.header}>
          <div style={S.logoWrap}>
            <div style={S.logoBadge}>◆</div>
            <span style={S.logoText}>HyperLoan AI</span>
          </div>
          {orgInfo && (
            <div style={S.tierBadge}>
              {TIER_LABELS[orgInfo.tier] ?? orgInfo.tier.toUpperCase()} Plan Active
            </div>
          )}
        </div>

        {/* Progress */}
        <div style={S.progressTrack}>
          <div style={{ ...S.progressFill, width: `${progressPct}%` }} />
        </div>

        {/* Card */}
        <div style={S.card}>
          {loading && step === 1 && !orgInfo ? (
            <div style={S.loadingPanel}>
              <div style={S.loaderRing} />
              <div style={S.loadingText}>Setting up your account...</div>
            </div>
          ) : (
            <>
              {/* STEP 1 — Profile */}
              {step === 1 && (
                <div style={S.stepPanel}>
                  <div style={S.eyebrow}>Step 1 of 4</div>
                  <div style={S.stepTitle}>Your profile</div>
                  <div style={S.stepSub}>This appears in notifications sent to your leads.</div>

                  <div style={S.fieldWrap}>
                    <label style={S.label}>Your full name</label>
                    <input style={S.input} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Derek Huit" autoFocus />
                  </div>
                  <div style={S.fieldWrap}>
                    <label style={S.label}>NMLS ID <span style={S.optional}>(optional)</span></label>
                    <input style={S.input} value={nmlsId} onChange={e => setNmlsId(e.target.value)} placeholder="203980" />
                  </div>

                  {error && <div style={S.errorMsg}>{error}</div>}
                  <button onClick={saveProfile} disabled={!fullName || loading} style={{ ...S.btnPrimary, ...(!fullName ? S.btnDisabled : {}) }}>
                    {loading ? 'Saving...' : 'Continue →'}
                  </button>
                </div>
              )}

              {/* STEP 2 — Company */}
              {step === 2 && (
                <div style={S.stepPanel}>
                  <div style={S.eyebrow}>Step 2 of 4</div>
                  <div style={S.stepTitle}>Your company</div>
                  <div style={S.stepSub}>This appears on your borrower-facing portals and pre-qual widget.</div>

                  <div style={S.fieldWrap}>
                    <label style={S.label}>Company name</label>
                    <input style={S.input} value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Hometown Mortgage Co." autoFocus />
                  </div>
                  <div style={S.fieldWrap}>
                    <label style={S.label}>Website <span style={S.optional}>(optional)</span></label>
                    <input style={S.input} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourmortgage.com" type="url" />
                  </div>

                  {error && <div style={S.errorMsg}>{error}</div>}
                  <button onClick={saveOrg} disabled={!orgName || loading} style={{ ...S.btnPrimary, ...(!orgName ? S.btnDisabled : {}) }}>
                    {loading ? 'Saving...' : 'Continue →'}
                  </button>
                  <button onClick={() => setStep(2)} style={S.btnSkip}>← Back</button>
                </div>
              )}

              {/* STEP 3 — Invite (TEAM+ only) */}
              {step === 3 && (
                <div style={S.stepPanel}>
                  <div style={S.eyebrow}>Step 3 of 4</div>
                  <div style={S.stepTitle}>Invite your team</div>
                  <div style={S.stepSub}>Add team members now or skip — you can invite people anytime from Settings.</div>

                  {orgInfo?.tier === 'solo' ? (
                    <div style={S.infoBox}>
                      💼 SOLO plan includes 1 LO seat. Upgrade to TEAM or higher to add team members.
                    </div>
                  ) : (
                    <>
                      <div style={S.fieldWrap}>
                        <label style={S.label}>Email addresses</label>
                        <textarea
                          style={{ ...S.input, ...S.textarea }}
                          value={inviteEmails}
                          onChange={e => setInviteEmails(e.target.value)}
                          placeholder="john@company.com&#10;jane@company.com"
                          rows={3}
                        />
                        <div style={S.hint}>One per line or comma-separated</div>
                      </div>
                      <div style={S.fieldWrap}>
                        <label style={S.label}>Role</label>
                        <select style={{ ...S.input, ...S.select }} value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                          <option value="lo">Loan Officer</option>
                          <option value="isa">ISA / VA</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </>
                  )}

                  {error && <div style={S.errorMsg}>{error}</div>}
                  <button onClick={sendInvites} disabled={loading} style={S.btnPrimary}>
                    {loading ? 'Sending...' : inviteEmails.trim() ? 'Send Invitations →' : 'Skip for now →'}
                  </button>
                  <button onClick={() => setStep(2)} style={S.btnSkip}>← Back</button>
                </div>
              )}

              {/* STEP 4 — Done */}
              {step === 4 && (
                <div style={{ ...S.stepPanel, textAlign: 'center' as const }}>
                  <div style={S.doneIcon}>🎉</div>
                  <div style={S.stepTitle}>You're all set!</div>
                  <div style={S.stepSub} >
                    Your <strong>{TIER_LABELS[orgInfo?.tier ?? 'solo']}</strong> Command Center is ready.
                    Your Huit AI agents are standing by.
                  </div>

                  <div style={S.featureGrid}>
                    {[
                      { icon: '🤖', label: 'Huit AI Agents', sub: 'Intake, nurture, qualify, book' },
                      { icon: '📊', label: 'Command Center', sub: 'Live pipeline dashboard' },
                      { icon: '📝', label: 'Pre-Qual Widget', sub: 'Embed on any page' },
                      { icon: '📁', label: 'Doc Portal', sub: 'Secure borrower upload' },
                    ].map(f => (
                      <div key={f.label} style={S.featureItem}>
                        <div style={S.featureIcon}>{f.icon}</div>
                        <div>
                          <div style={S.featureLabel}>{f.label}</div>
                          <div style={S.featureSub}>{f.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button onClick={finishOnboarding} disabled={loading} style={S.btnPrimary}>
                    {loading ? 'Loading...' : 'Enter Command Center →'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div style={S.footer}>
          Secure · Encrypted · NMLS #203980
        </div>
      </div>
    </div>
  )
}

const styles = {
  root:         { minHeight: '100dvh', background: '#0d1b2a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: "'DM Sans', system-ui, sans-serif" },
  widget:       { width: '100%', maxWidth: '480px' },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' },
  logoWrap:     { display: 'flex', alignItems: 'center', gap: '8px' },
  logoBadge:    { width: 28, height: 28, background: 'linear-gradient(135deg, #c9922a, #9e6d12)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px' },
  logoText:     { fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.8)' },
  tierBadge:    { fontSize: '10px', fontWeight: 700, padding: '4px 10px', borderRadius: '99px', background: 'rgba(201,146,42,0.15)', color: '#c9922a', border: '1px solid rgba(201,146,42,0.3)', letterSpacing: '0.5px' },
  progressTrack:{ height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '99px', overflow: 'hidden', marginBottom: '20px' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #c9922a, #9e6d12)', borderRadius: '99px', transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)' },
  card:         { background: '#ffffff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' },
  stepPanel:    { padding: '36px' },
  eyebrow:      { fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#b5713a', marginBottom: '8px' },
  stepTitle:    { fontFamily: 'Georgia, serif', fontSize: '24px', fontWeight: 500, color: '#0d1b2a', marginBottom: '6px' },
  stepSub:      { fontSize: '13px', color: '#8a9bb0', marginBottom: '28px', lineHeight: 1.6 },
  fieldWrap:    { marginBottom: '16px' },
  label:        { display: 'block', fontSize: '12px', fontWeight: 600, color: '#4a4a6a', marginBottom: '6px' },
  optional:     { fontWeight: 400, color: '#8a9bb0' },
  input:        { width: '100%', padding: '11px 14px', fontSize: '14px', border: '1.5px solid #eae8e3', borderRadius: '8px', color: '#0d1b2a', background: '#ffffff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const },
  textarea:     { resize: 'vertical' as const, minHeight: '80px' },
  select:       { cursor: 'pointer', appearance: 'auto' as const },
  hint:         { fontSize: '11px', color: '#8a9bb0', marginTop: '4px' },
  infoBox:      { background: '#f9f7f4', border: '1px solid #eae8e3', borderRadius: '8px', padding: '14px 16px', fontSize: '13px', color: '#5a6e84', marginBottom: '24px', lineHeight: 1.5 },
  errorMsg:     { background: '#fdecea', border: '1px solid rgba(192,57,43,0.2)', borderRadius: '6px', padding: '10px 12px', fontSize: '13px', color: '#c0392b', marginBottom: '16px' },
  btnPrimary:   { width: '100%', padding: '13px', fontSize: '15px', fontWeight: 700, color: 'white', background: 'linear-gradient(135deg, #b5713a, #8a4e22)', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 16px rgba(181,113,58,0.3)', transition: 'all 0.18s', marginBottom: '12px', fontFamily: 'inherit' },
  btnDisabled:  { opacity: 0.5, cursor: 'not-allowed', boxShadow: 'none' },
  btnSkip:      { width: '100%', padding: '10px', fontSize: '13px', fontWeight: 500, color: '#8a9bb0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' },
  loadingPanel: { padding: '60px 36px', textAlign: 'center' as const },
  loaderRing:   { width: '40px', height: '40px', border: '3px solid #eae8e3', borderTopColor: '#b5713a', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' },
  loadingText:  { fontFamily: 'Georgia, serif', fontSize: '18px', color: '#0d1b2a' },
  doneIcon:     { fontSize: '48px', marginBottom: '16px' },
  featureGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '24px 0', textAlign: 'left' as const },
  featureItem:  { display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#f9f7f4', borderRadius: '8px', padding: '12px' },
  featureIcon:  { fontSize: '20px', flexShrink: 0 },
  featureLabel: { fontSize: '13px', fontWeight: 600, color: '#0d1b2a', lineHeight: 1.2 },
  featureSub:   { fontSize: '11px', color: '#8a9bb0', marginTop: '2px' },
  footer:       { textAlign: 'center' as const, fontSize: '12px', color: 'rgba(255,255,255,0.2)', marginTop: '16px' },
}
