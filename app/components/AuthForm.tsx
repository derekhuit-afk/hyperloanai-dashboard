'use client'

import { useState } from 'react'
import { createClient } from '../lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

type Mode = 'login' | 'signup'

interface AuthFormProps {
  mode: Mode
  inviteToken?: string | null
  onboardToken?: string | null
  prefillEmail?: string | null
}

export default function AuthForm({ mode: initialMode, inviteToken, onboardToken, prefillEmail }: AuthFormProps) {
  const [mode, setMode]       = useState<Mode>(initialMode)
  const [email, setEmail]     = useState(prefillEmail ?? '')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [sent, setSent]       = useState(false)

  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirect     = searchParams.get('redirect') ?? '/dashboard'
  const supabase     = createClient()

  async function handleSubmit() {
    setError('')
    setLoading(true)

    if (mode === 'signup') {
      const { error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: onboardToken
            ? `${location.origin}/auth/callback?onboard_token=${onboardToken}`
            : `${location.origin}/auth/callback?next=/onboarding`,
        },
      })

      if (signupError) { setError(signupError.message); setLoading(false); return }

      // If invite token, accept after signup (best-effort)
      if (inviteToken) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/auth-invite/accept`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: inviteToken, user_id: user.id }),
          })
        }
      }

      setSent(true)
      setLoading(false)
      return
    }

    // LOGIN
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) {
      setError(loginError.message === 'Invalid login credentials'
        ? 'Incorrect email or password. Try again.'
        : loginError.message)
      setLoading(false)
      return
    }

    router.push(redirect)
    router.refresh()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
  }

  const S = styles

  // ── CONFIRMATION SENT ──────────────────────────────────────────────────
  if (sent) return (
    <div style={S.root}>
      <div style={S.card}>
        <div style={S.sentIcon}>✉️</div>
        <div style={S.sentTitle}>Check your email</div>
        <div style={S.sentSub}>
          We sent a confirmation link to <strong>{email}</strong>.
          Click the link to activate your account and set up your Command Center.
        </div>
        <div style={S.sentNote}>Didn't receive it? Check your spam folder or&nbsp;
          <span style={S.link} onClick={() => setSent(false)}>try again</span>.
        </div>
      </div>
    </div>
  )

  return (
    <div style={S.root}>
      <div style={S.card}>

        {/* Logo */}
        <div style={S.logoWrap}>
          <div style={S.logoBadge}>◆</div>
          <span style={S.logoText}>HyperLoan AI</span>
        </div>

        <div style={S.title}>{mode === 'login' ? 'Sign in to your account' : 'Create your account'}</div>
        <div style={S.sub}>
          {mode === 'login'
            ? 'Access your Command Center, leads, and agents.'
            : inviteToken
              ? 'Set up your account to join your team.'
              : 'Complete account setup after subscribing.'}
        </div>

        {/* Fields */}
        {mode === 'signup' && (
          <div style={S.fieldWrap}>
            <label style={S.label}>Full name</label>
            <input
              type="text" placeholder="Derek Huit" value={fullName}
              onChange={e => setFullName(e.target.value)}
              onKeyDown={handleKeyDown}
              style={S.input}
              autoFocus
            />
          </div>
        )}

        <div style={S.fieldWrap}>
          <label style={S.label}>Email address</label>
          <input
            type="email" placeholder="you@yourmortgage.com" value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ ...S.input, ...(prefillEmail ? S.inputReadonly : {}) }}
            readOnly={!!prefillEmail}
            autoFocus={mode === 'login'}
          />
        </div>

        <div style={S.fieldWrap}>
          <div style={S.labelRow}>
            <label style={S.label}>Password</label>
            {mode === 'login' && (
              <span style={S.forgotLink} onClick={() => router.push(`/login/forgot?email=${encodeURIComponent(email)}`)}>
                Forgot password?
              </span>
            )}
          </div>
          <input
            type="password"
            placeholder={mode === 'signup' ? 'Create a strong password' : 'Enter your password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            style={S.input}
          />
          {mode === 'signup' && (
            <div style={S.hint}>At least 8 characters</div>
          )}
        </div>

        {error && <div style={S.errorMsg}>⚠ {error}</div>}

        <button
          onClick={handleSubmit}
          disabled={loading || !email || !password || (mode === 'signup' && !fullName)}
          style={{ ...S.btnSubmit, ...(loading || !email || !password ? S.btnDisabled : {}) }}
        >
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <div style={S.switchRow}>
          {mode === 'login' ? (
            <>Don't have an account?&nbsp;<span style={S.link} onClick={() => setMode('signup')}>Sign up</span></>
          ) : (
            <>Already have an account?&nbsp;<span style={S.link} onClick={() => setMode('login')}>Sign in</span></>
          )}
        </div>

      </div>

      <div style={S.footer}>🔒 Secure sign-in · NMLS #203980</div>
    </div>
  )
}

const styles = {
  root:          { minHeight: '100dvh', background: '#0d1b2a', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: "'DM Sans', system-ui, sans-serif" },
  card:          { background: '#ffffff', borderRadius: '14px', padding: '40px 36px', width: '100%', maxWidth: '420px', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' },
  logoWrap:      { display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginBottom: '28px' },
  logoBadge:     { width: 30, height: 30, background: 'linear-gradient(135deg, #c9922a, #9e6d12)', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px' },
  logoText:      { fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#0d1b2a' },
  title:         { fontFamily: 'Georgia, serif', fontSize: '22px', fontWeight: 500, color: '#0d1b2a', textAlign: 'center' as const, marginBottom: '6px' },
  sub:           { fontSize: '13px', color: '#8a9bb0', textAlign: 'center' as const, marginBottom: '28px', lineHeight: 1.5 },
  fieldWrap:     { marginBottom: '16px' },
  labelRow:      { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' },
  label:         { display: 'block', fontSize: '12px', fontWeight: 600, color: '#4a4a6a', marginBottom: '6px' },
  input:         { width: '100%', padding: '11px 14px', fontSize: '14px', border: '1.5px solid #eae8e3', borderRadius: '8px', color: '#0d1b2a', background: '#ffffff', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s', boxSizing: 'border-box' as const },
  inputReadonly: { background: '#f9f7f4', color: '#8a9bb0', cursor: 'not-allowed' },
  hint:          { fontSize: '11px', color: '#8a9bb0', marginTop: '4px' },
  forgotLink:    { fontSize: '12px', color: '#b5713a', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' },
  errorMsg:      { background: '#fdecea', border: '1px solid rgba(192,57,43,0.2)', borderRadius: '6px', padding: '10px 12px', fontSize: '13px', color: '#c0392b', marginBottom: '16px' },
  btnSubmit:     { width: '100%', padding: '13px', fontSize: '15px', fontWeight: 700, color: 'white', background: 'linear-gradient(135deg, #b5713a, #8a4e22)', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 16px rgba(181,113,58,0.3)', transition: 'all 0.18s', marginBottom: '20px', fontFamily: 'inherit' },
  btnDisabled:   { opacity: 0.5, cursor: 'not-allowed', boxShadow: 'none' },
  switchRow:     { textAlign: 'center' as const, fontSize: '13px', color: '#8a9bb0' },
  link:          { color: '#b5713a', cursor: 'pointer', fontWeight: 600 },
  sentIcon:      { fontSize: '40px', textAlign: 'center' as const, marginBottom: '16px' },
  sentTitle:     { fontFamily: 'Georgia, serif', fontSize: '22px', fontWeight: 500, color: '#0d1b2a', textAlign: 'center' as const, marginBottom: '10px' },
  sentSub:       { fontSize: '14px', color: '#5a6e84', textAlign: 'center' as const, lineHeight: 1.6, marginBottom: '16px' },
  sentNote:      { fontSize: '12px', color: '#8a9bb0', textAlign: 'center' as const },
  footer:        { fontSize: '12px', color: 'rgba(255,255,255,0.25)', marginTop: '20px' },
}
