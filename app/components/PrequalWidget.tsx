'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

// ── TYPES ─────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4 | 5 | 'loading' | 'results'

interface Answers {
  purpose:    string | null
  amount:     number
  credit:     string | null
  employment: string | null
  timeline:   string | null
}

interface ResultData {
  score:       number
  headline:    string
  sub:         string
  pills:       Array<{ label: string; type: 'green' | 'copper' | 'neutral' }>
  bookingUrl:  string
}

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// ── OPTION CONFIG ─────────────────────────────────────────────
const STEP1_OPTIONS = [
  { value: 'purchase',    icon: '🏡', label: 'Buy a Home',     desc: 'Purchase a new property' },
  { value: 'refinance',   icon: '🔄', label: 'Refinance',      desc: 'Lower rate or payment' },
  { value: 'cashout',     icon: '💰', label: 'Cash-Out',       desc: 'Tap your home equity' },
  { value: 'investment',  icon: '📈', label: 'Investment',     desc: 'Rental or flip property' },
]

const STEP3_OPTIONS = [
  { value: '760+',      icon: '⭐', label: '760 or higher — Excellent', desc: 'Best rates available',            accent: true },
  { value: '720-759',   icon: '✅', label: '720 – 759 — Very Good',     desc: 'Great rate options' },
  { value: '680-719',   icon: '👍', label: '680 – 719 — Good',          desc: 'Solid qualification range' },
  { value: '620-679',   icon: '⚡', label: '620 – 679 — Fair',          desc: 'Options available, may need work' },
  { value: '<620',      icon: '🛠', label: 'Below 620 — Rebuilding',    desc: "We'll find a path forward" },
]

const STEP4_OPTIONS = [
  { value: 'w2',            icon: '💼', label: 'W-2 Employee',     desc: 'Salaried or hourly' },
  { value: 'self_employed', icon: '🧾', label: 'Self-Employed',    desc: 'Business owner / 1099' },
  { value: 'retired',       icon: '🌅', label: 'Retired',          desc: 'Pension / Social Security' },
  { value: 'other',         icon: '📋', label: 'Other',            desc: 'Investments / Mixed' },
]

const STEP5_OPTIONS = [
  { value: 'asap',         icon: '🔥', label: 'Right away — ASAP',   desc: 'Ready to move immediately' },
  { value: '1_3_months',   icon: '📅', label: 'Within 1–3 months',   desc: 'Actively searching or planning' },
  { value: '3_6_months',   icon: '🗓', label: 'Within 3–6 months',   desc: 'Getting my ducks in a row' },
  { value: 'exploring',    icon: '🔭', label: 'Just exploring',       desc: 'Researching my options' },
]

// ── HELPERS ───────────────────────────────────────────────────
function calcScore(a: Answers): number {
  let s = 50
  const c: Record<string, number> = { '760+':30,'720-759':24,'680-719':18,'620-679':10,'<620':2 }
  const e: Record<string, number> = { w2:15, retired:13, self_employed:8, other:8 }
  const t: Record<string, number> = { asap:10, '1_3_months':8, '3_6_months':5, exploring:2 }
  const p: Record<string, number> = { purchase:5, refinance:4, cashout:3, investment:2 }
  s += c[a.credit ?? ''] ?? 15
  s += e[a.employment ?? ''] ?? 10
  s += t[a.timeline ?? ''] ?? 5
  s += p[a.purpose ?? ''] ?? 3
  if (a.amount >= 1000000) s += 5
  else if (a.amount >= 500000) s += 3
  else if (a.amount >= 300000) s += 2
  return Math.min(100, Math.max(10, s))
}

function fmtAmount(n: number): string {
  return n >= 1000000 ? `$${(n/1000000).toFixed(n%1000000===0?0:1)}M` : `$${(n/1000).toFixed(0)}K`
}

// ═══════════════════════════════════════════════════════════════
export default function PrequalWidget() {
  const searchParams = useSearchParams()
  const leadId = searchParams.get('lid') ?? searchParams.get('lead_id')
  const token  = searchParams.get('t')   ?? searchParams.get('token')
  const calUrl = searchParams.get('cal') ?? 'https://cal.com/hyperloanai/consultation'

  const [step, setStep]    = useState<Step>(1)
  const [answers, setAnswers] = useState<Answers>({ purpose: null, amount: 350000, credit: null, employment: null, timeline: null })
  const [result, setResult]  = useState<ResultData | null>(null)
  const [displayScore, setDisplayScore] = useState(0)
  const [animating, setAnimating] = useState(false)
  const scoreTimer = useRef<NodeJS.Timeout>()

  // Animate score counter
  useEffect(() => {
    if (!result) return
    setDisplayScore(0)
    clearInterval(scoreTimer.current)
    let n = 0
    scoreTimer.current = setInterval(() => {
      n = Math.min(n + 3, result.score)
      setDisplayScore(n)
      if (n >= result.score) clearInterval(scoreTimer.current)
    }, 20)
    return () => clearInterval(scoreTimer.current)
  }, [result])

  function selectOption(field: keyof Answers, value: string, autoAdvance: boolean) {
    const next = { ...answers, [field]: value }
    setAnswers(next)
    if (autoAdvance) {
      setTimeout(() => advanceStep(next), 340)
    }
  }

  function advanceStep(currentAnswers: Answers = answers) {
    if (animating) return
    setAnimating(true)
    setTimeout(() => setAnimating(false), 350)

    const n = typeof step === 'number' ? step : 5
    if (n < 5) {
      setStep((n + 1) as Step)
    } else {
      handleSubmit(currentAnswers)
    }
  }

  function goBack() {
    if (typeof step !== 'number' || step <= 1) return
    setStep((step - 1) as Step)
  }

  async function handleSubmit(a: Answers = answers) {
    setStep('loading')
    const score = calcScore(a)

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/prequal-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({
          lead_id: leadId, token, loan_purpose: a.purpose,
          est_loan_amount: a.amount, credit_score: a.credit,
          employment_type: a.employment, timeline: a.timeline,
          local_score: score,
        })
      })
      const data = await res.json()
      buildResult(data.score ?? score, a, data.booking_url)
    } catch {
      buildResult(score, a, calUrl)
    }
  }

  function buildResult(score: number, a: Answers, bookingUrl: string) {
    const amtFmt = fmtAmount(a.amount)
    const creditLabel: Record<string, string> = { '760+':'Excellent credit','720-759':'Very good credit','680-719':'Good credit','620-679':'Fair credit','<620':'Credit work needed' }
    const empLabel:    Record<string, string> = { w2:'W-2 income', self_employed:'Self-employed', retired:'Retirement income', other:'Mixed income' }
    const timeLabel:   Record<string, string> = { asap:'Ready now', '1_3_months':'1–3 month timeline', '3_6_months':'3–6 month timeline', exploring:'Exploring options' }
    const purposeLabel: Record<string, string> = { purchase:'purchase', refinance:'refinance', cashout:'cash-out refi', investment:'investment property' }

    const pt = score >= 80
    const headlines = score >= 80
      ? { h: `You look well-qualified — let's get you a rate.`, s: `Based on your profile, you're a strong candidate for a ${purposeLabel[a.purpose??'']} up to ${amtFmt}. We'll lock in your best rate on your call.` }
      : score >= 65
      ? { h: `Good news — you're in a solid position.`, s: `Your profile shows real opportunity for a ${purposeLabel[a.purpose??'']}. There may be a few things to optimize, and we'll cover it all on your call.` }
      : score >= 45
      ? { h: `There's a path here — let's find it.`, s: `Your credit profile may need some work, but there are programs built for your situation. Let's map out what's possible.` }
      : { h: `Let's talk — more options than you think.`, s: `Getting started is the first step. We'll show you exactly what needs to improve and a realistic timeline to reach your goal.` }

    setResult({
      score,
      headline: headlines.h,
      sub:      headlines.s,
      pills: [
        { label: `✓ ${amtFmt} loan range`,                    type: pt ? 'green' : 'copper' },
        { label: `✓ ${creditLabel[a.credit??'']}`,            type: pt ? 'green' : 'copper' },
        { label: empLabel[a.employment??'']  ?? '',            type: 'neutral' },
        { label: timeLabel[a.timeline??'']   ?? '',            type: 'neutral' },
      ].filter(p => p.label),
      bookingUrl: bookingUrl || calUrl,
    })
    setTimeout(() => setStep('results'), 1800)
  }

  const numStep = typeof step === 'number' ? step : 5
  const progress = typeof step === 'number' ? Math.round(((step - 1) / 5) * 100) : 100
  const canAdvance = (
    (step === 1 && answers.purpose) ||
    (step === 2 && true) ||
    (step === 3 && answers.credit) ||
    (step === 4 && answers.employment) ||
    (step === 5 && answers.timeline)
  )

  // Arc calculation
  const circumference = 283
  const arcOffset = result ? circumference - (result.score / 100) * circumference : circumference
  const arcColor = result ? result.score >= 80 ? '#2d7a5f' : result.score >= 65 ? '#b5713a' : '#c0392b' : '#b5713a'

  const S = styles

  return (
    <div style={S.body}>
      <div style={S.bgOverlay} />
      <div style={S.widget}>

        {/* HEADER */}
        <div style={S.header}>
          <div style={S.logoMark}>
            <div style={S.logoBadge}>◆</div>
            <span style={S.logoText}>HyperLoan AI</span>
          </div>
          <div style={S.headline}>Find out what you qualify for<br/>in under 60 seconds</div>
        </div>

        {/* PROGRESS */}
        {step !== 'loading' && step !== 'results' && (
          <div style={S.progressWrap}>
            <div style={S.progressLabels}>
              <span>Step {numStep} of 5</span>
              <span>{progress}% complete</span>
            </div>
            <div style={S.progressTrack}>
              <div style={{ ...S.progressFill, width: `${progress}%` }} />
            </div>
            <div style={S.dots}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{ ...S.dot, ...(i === numStep ? S.dotActive : i < numStep ? S.dotDone : {}) }} />
              ))}
            </div>
          </div>
        )}

        {/* CARD */}
        <div style={S.card}>

          {/* LOADING */}
          {step === 'loading' && (
            <div style={S.loadingPanel}>
              <div style={S.loaderRing} />
              <div style={S.loadingText}>Analyzing your profile...</div>
              <div style={S.loadingSub}>Running your numbers through our engine</div>
            </div>
          )}

          {/* RESULTS */}
          {step === 'results' && result && (
            <div style={S.resultsPanel}>
              <div style={S.scoreRingWrap}>
                <svg width="140" height="140" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="50" cy="50" r="45" stroke="#e8e4db" strokeWidth="8" fill="none" />
                  <circle cx="50" cy="50" r="45" stroke={arcColor} strokeWidth="8" fill="none"
                    strokeLinecap="round" strokeDasharray={circumference}
                    strokeDashoffset={arcOffset}
                    style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1) 0.3s' }}
                  />
                </svg>
                <div style={S.scoreNumber}>
                  <div style={S.scoreBig}>{displayScore}</div>
                  <div style={S.scoreLabel}>Score</div>
                </div>
              </div>

              <div style={S.resultHeadline}>{result.headline}</div>
              <div style={S.resultSub}>{result.sub}</div>

              <div style={S.pills}>
                {result.pills.map((p, i) => (
                  <span key={i} style={{ ...S.pill, ...S[`pill_${p.type}` as keyof typeof S] as React.CSSProperties }}>{p.label}</span>
                ))}
              </div>

              <a href={result.bookingUrl} target="_blank" rel="noopener noreferrer" style={S.btnBook}>
                📅 Book Your Free Consultation
              </a>
              <div style={S.resultNote}>Secure &amp; private. No credit pull required.</div>
            </div>
          )}

          {/* STEP CONTENT */}
          {typeof step === 'number' && (
            <div style={S.stepPanel}>

              {step === 1 && (
                <>
                  <div style={S.eyebrow}>Step 1 — Your Goal</div>
                  <div style={S.question}>What are you looking to do?</div>
                  <div style={S.stepSub}>This helps us match you to the right loan type and rate.</div>
                  <div style={{ ...S.optionGrid, ...S.cols2 }}>
                    {STEP1_OPTIONS.map(o => (
                      <OptionBtn key={o.value} icon={o.icon} label={o.label} desc={o.desc}
                        selected={answers.purpose === o.value}
                        onClick={() => selectOption('purpose', o.value, true)} />
                    ))}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div style={S.eyebrow}>Step 2 — Loan Amount</div>
                  <div style={S.question}>
                    {answers.purpose === 'refinance' || answers.purpose === 'cashout'
                      ? "What's your estimated home value?"
                      : "What's the purchase price range?"}
                  </div>
                  <div style={S.stepSub}>Slide to your approximate range — we'll work out the exact numbers together.</div>
                  <div style={S.amountDisplay}>
                    <span style={S.amountPrefix}>$</span>
                    <span style={S.amountValue}>{fmtAmount(answers.amount).replace('$','')}</span>
                  </div>
                  <input type="range" min={100000} max={2000000} step={25000} value={answers.amount}
                    onChange={e => setAnswers(a => ({ ...a, amount: parseInt(e.target.value) }))}
                    style={S.slider} />
                  <div style={S.rangeLabels}>
                    <span>$100K</span><span>$500K</span><span>$1M</span><span>$1.5M</span><span>$2M+</span>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div style={S.eyebrow}>Step 3 — Credit Profile</div>
                  <div style={S.question}>What's your approximate credit score?</div>
                  <div style={S.stepSub}>A rough estimate is fine — this doesn't affect your score.</div>
                  <div style={S.optionGrid}>
                    {STEP3_OPTIONS.map(o => (
                      <OptionBtn key={o.value} icon={o.icon} label={o.label} desc={o.desc}
                        selected={answers.credit === o.value}
                        accent={o.accent}
                        onClick={() => selectOption('credit', o.value, true)} />
                    ))}
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <div style={S.eyebrow}>Step 4 — Employment</div>
                  <div style={S.question}>How would you describe your income?</div>
                  <div style={S.stepSub}>Lenders underwrite differently based on how you earn.</div>
                  <div style={{ ...S.optionGrid, ...S.cols2 }}>
                    {STEP4_OPTIONS.map(o => (
                      <OptionBtn key={o.value} icon={o.icon} label={o.label} desc={o.desc}
                        selected={answers.employment === o.value}
                        onClick={() => selectOption('employment', o.value, true)} />
                    ))}
                  </div>
                </>
              )}

              {step === 5 && (
                <>
                  <div style={S.eyebrow}>Step 5 — Timeline</div>
                  <div style={S.question}>When are you looking to move forward?</div>
                  <div style={S.stepSub}>Timing helps us prioritize the right options for you.</div>
                  <div style={S.optionGrid}>
                    {STEP5_OPTIONS.map(o => (
                      <OptionBtn key={o.value} icon={o.icon} label={o.label} desc={o.desc}
                        selected={answers.timeline === o.value}
                        onClick={() => selectOption('timeline', o.value, false)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* FOOTER */}
          {typeof step === 'number' && (
            <div style={S.cardFooter}>
              <button onClick={goBack} style={{ ...S.btnBack, visibility: step > 1 ? 'visible' : 'hidden' }}>
                ← Back
              </button>
              <button onClick={() => advanceStep()} disabled={!canAdvance} style={{ ...S.btnNext, ...(!canAdvance ? S.btnNextDisabled : {}) }}>
                {step === 5 ? 'See My Results →' : 'Continue →'}
              </button>
            </div>
          )}
        </div>

        {/* TRUST STRIP */}
        {step !== 'loading' && (
          <div style={S.trustStrip}>
            <span>🔒 No credit check</span>
            <span>⚡ 60-second results</span>
            <span>🤝 No obligation</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── OPTION BUTTON ─────────────────────────────────────────────
function OptionBtn({ icon, label, desc, selected, accent, onClick }: {
  icon: string; label: string; desc: string; selected: boolean; accent?: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '14px 16px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer',
      border: `1.5px solid ${selected ? '#b5713a' : accent ? '#2d7a5f' : '#e8e4db'}`,
      background: selected ? '#f0e0cc' : '#ffffff',
      boxShadow: selected ? '0 4px 16px rgba(181,113,58,0.18)' : 'none',
      transition: 'all 0.18s ease', width: '100%',
    }}>
      <div style={{ width: 40, height: 40, borderRadius: '8px', background: selected ? 'rgba(181,113,58,0.15)' : '#f8f6f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '14px', color: '#1a1a2e', lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: '12px', color: '#9898b8', marginTop: '2px' }}>{desc}</div>
      </div>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        border: `1.5px solid ${selected ? '#b5713a' : '#e8e4db'}`,
        background: selected ? '#b5713a' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <span style={{ color: 'white', fontSize: '11px', fontWeight: 700 }}>✓</span>}
      </div>
    </button>
  )
}

// ── STYLES ────────────────────────────────────────────────────
const styles = {
  body:          { minHeight: '100dvh', background: '#f8f6f1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', position: 'relative' as const, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: '#1a1a2e' },
  bgOverlay:     { position: 'fixed' as const, inset: 0, background: 'radial-gradient(ellipse 80% 60% at 20% 10%, rgba(181,113,58,0.06), transparent 60%), radial-gradient(ellipse 60% 80% at 80% 90%, rgba(45,122,95,0.05), transparent 60%)', pointerEvents: 'none' as const },
  widget:        { width: '100%', maxWidth: '520px', zIndex: 1, position: 'relative' as const },
  header:        { textAlign: 'center' as const, marginBottom: '28px' },
  logoMark:      { display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '6px' },
  logoBadge:     { width: 28, height: 28, background: 'linear-gradient(135deg, #b5713a, #8a4e22)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px' },
  logoText:      { fontFamily: 'system-ui', fontSize: '13px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#4a4a6a' },
  headline:      { fontFamily: 'Georgia, serif', fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 500, color: '#1a1a2e', lineHeight: 1.25, marginTop: '4px' },
  progressWrap:  { marginBottom: '24px' },
  progressLabels:{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px', color: '#9898b8', textTransform: 'uppercase' as const, marginBottom: '8px' },
  progressTrack: { height: '3px', background: '#e8e4db', borderRadius: '99px', overflow: 'hidden' },
  progressFill:  { height: '100%', background: 'linear-gradient(90deg, #b5713a, #8a4e22)', borderRadius: '99px', transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)' },
  dots:          { display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '10px' },
  dot:           { width: '6px', height: '6px', borderRadius: '50%', background: '#e8e4db', transition: 'all 0.3s' },
  dotActive:     { background: '#b5713a', transform: 'scale(1.4)' },
  dotDone:       { background: '#f0e0cc' },
  card:          { background: '#ffffff', borderRadius: '12px', boxShadow: '0 4px 40px rgba(26,26,46,0.08)', overflow: 'hidden' },
  stepPanel:     { padding: '36px 36px 28px' },
  eyebrow:       { fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#b5713a', marginBottom: '10px' },
  question:      { fontFamily: 'Georgia, serif', fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 500, lineHeight: 1.3, color: '#1a1a2e', marginBottom: '6px' },
  stepSub:       { fontSize: '13px', color: '#9898b8', marginBottom: '28px', lineHeight: 1.5 },
  optionGrid:    { display: 'flex', flexDirection: 'column' as const, gap: '10px' },
  cols2:         { display: 'grid', gridTemplateColumns: '1fr 1fr' },
  amountDisplay: { display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '20px' },
  amountPrefix:  { fontFamily: 'Georgia, serif', fontSize: '28px', fontWeight: 400, color: '#4a4a6a' },
  amountValue:   { fontFamily: 'Georgia, serif', fontSize: '44px', fontWeight: 600, color: '#1a1a2e', lineHeight: 1 },
  slider:        { width: '100%', marginBottom: '8px', accentColor: '#b5713a' },
  rangeLabels:   { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9898b8', fontWeight: 500 },
  cardFooter:    { padding: '16px 36px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #e8e4db', background: '#f8f6f1' },
  btnBack:       { fontSize: '13px', fontWeight: 600, color: '#9898b8', cursor: 'pointer', background: 'none', border: 'none', padding: '4px', transition: 'color 0.15s' },
  btnNext:       { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700, color: 'white', background: 'linear-gradient(135deg, #b5713a, #8a4e22)', border: 'none', borderRadius: '8px', padding: '12px 24px', cursor: 'pointer', boxShadow: '0 4px 16px rgba(181,113,58,0.3)', transition: 'all 0.18s' },
  btnNextDisabled: { opacity: 0.4, cursor: 'not-allowed', boxShadow: 'none' },
  trustStrip:    { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '16px', fontSize: '11px', color: '#9898b8', fontWeight: 500, flexWrap: 'wrap' as const },
  loadingPanel:  { padding: '60px 36px', textAlign: 'center' as const },
  loaderRing:    { width: '48px', height: '48px', border: '3px solid #e8e4db', borderTopColor: '#b5713a', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' },
  loadingText:   { fontFamily: 'Georgia, serif', fontSize: '18px', color: '#1a1a2e', marginBottom: '6px' },
  loadingSub:    { fontSize: '13px', color: '#9898b8' },
  resultsPanel:  { padding: '36px', textAlign: 'center' as const },
  scoreRingWrap: { position: 'relative' as const, width: '140px', height: '140px', margin: '0 auto 24px' },
  scoreNumber:   { position: 'absolute' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' as const },
  scoreBig:      { fontFamily: 'Georgia, serif', fontSize: '40px', fontWeight: 600, lineHeight: 1, color: '#1a1a2e' },
  scoreLabel:    { fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: '#9898b8' },
  resultHeadline:{ fontFamily: 'Georgia, serif', fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 500, color: '#1a1a2e', marginBottom: '8px', lineHeight: 1.3 },
  resultSub:     { fontSize: '14px', color: '#4a4a6a', lineHeight: 1.6, marginBottom: '28px', maxWidth: '380px', margin: '0 auto 28px' },
  pills:         { display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' as const, marginBottom: '28px' },
  pill:          { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: 600 },
  pill_green:    { background: '#e8f5f0', color: '#2d7a5f' },
  pill_copper:   { background: '#f0e0cc', color: '#8a4e22' },
  pill_neutral:  { background: '#f8f6f1', color: '#4a4a6a', border: '1px solid #e8e4db' },
  btnBook:       { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', fontSize: '15px', fontWeight: 700, color: 'white', background: 'linear-gradient(135deg, #b5713a, #8a4e22)', border: 'none', borderRadius: '10px', padding: '16px 24px', cursor: 'pointer', boxShadow: '0 6px 24px rgba(181,113,58,0.35)', textDecoration: 'none', marginBottom: '12px' },
  resultNote:    { fontSize: '12px', color: '#9898b8', lineHeight: 1.5 },
}
