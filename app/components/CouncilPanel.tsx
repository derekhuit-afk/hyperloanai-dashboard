'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '../lib/supabase/client'

// ── TYPES ──────────────────────────────────────────────────────────────────
interface AgentResult {
  id:       string
  class:    'efficiency' | 'analyst' | 'psychiatrist' | 'socioeconomic'
  name:     string
  score:    number | null
  verdict:  string | null
  headline: string | null
  findings: Record<string, any> | null
  flags:    string[]
  opportunities: string[]
  recommended_actions: Array<{ action: string; priority: string; rationale: string; script_hint?: string; timing?: string; channel?: string; market_rationale?: string }>
  elapsed_ms: number
  error:    string | null
}

interface CouncilRun {
  run_id:           string
  lead_id:          string
  elapsed_ms:       number
  completed_agents: number
  total_agents:     number
  council_score:    number
  council_verdict:  string
  priority_action:  string
  brief:            string
  agents:           AgentResult[]
}

interface Props {
  leadId:    string
  leadName?: string
  orgId?:    string
  autoRun?:  boolean
}

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const CLASS_CONFIG = {
  efficiency:    { color: '#2196F3', bg: 'rgba(33,150,243,0.1)',  border: 'rgba(33,150,243,0.25)',  icon: '⚡', label: 'Efficiency' },
  analyst:       { color: '#9C27B0', bg: 'rgba(156,39,176,0.1)', border: 'rgba(156,39,176,0.25)', icon: '📊', label: 'Analyst' },
  psychiatrist:  { color: '#E91E63', bg: 'rgba(233,30,99,0.1)',  border: 'rgba(233,30,99,0.25)',  icon: '🧠', label: 'Psych' },
  socioeconomic: { color: '#FF9800', bg: 'rgba(255,152,0,0.1)',  border: 'rgba(255,152,0,0.25)',  icon: '🌐', label: 'Socio' },
}

const VERDICT_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  hot:     { color: '#fff', bg: '#c0392b', label: '🔥 HOT' },
  warm:    { color: '#fff', bg: '#d4820a', label: '♨️ WARM' },
  cool:    { color: '#0d1b2a', bg: '#aedbd8', label: '❄️ COOL' },
  cold:    { color: '#fff', bg: '#546e7a', label: '🧊 COLD' },
  complex: { color: '#fff', bg: '#5c6bc0', label: '🔮 COMPLEX' },
}

const AGENT_ROSTER = [
  { id: 'efficiency_1',  class: 'efficiency',    name: 'Pipeline Velocity Expert' },
  { id: 'efficiency_2',  class: 'efficiency',    name: 'Conversion Optimization Expert' },
  { id: 'analyst_1',     class: 'analyst',       name: 'HMDA & Market Intelligence' },
  { id: 'analyst_2',     class: 'analyst',       name: 'Lead Source & Channel ROI' },
  { id: 'analyst_3',     class: 'analyst',       name: 'Financial Profile & Product Fit' },
  { id: 'analyst_4',     class: 'analyst',       name: 'Behavioral Pattern Recognition' },
  { id: 'psych_1',       class: 'psychiatrist',  name: 'Emotional State & Urgency Profiler' },
  { id: 'psych_2',       class: 'psychiatrist',  name: 'Objection Psychology & Persuasion' },
  { id: 'socio_1',       class: 'socioeconomic', name: 'Market & Neighborhood Dynamics' },
  { id: 'socio_2',       class: 'socioeconomic', name: 'Borrower Financial Wellness' },
] as const

function scoreColor(score: number | null): string {
  if (!score) return '#8a9bb0'
  if (score >= 80) return '#27ae60'
  if (score >= 65) return '#d4820a'
  if (score >= 45) return '#e67e22'
  return '#c0392b'
}

function ScoreRing({ score, size = 48 }: { score: number | null; size?: number }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const pct = (score ?? 0) / 100
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="4" />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={scoreColor(score)} strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x={size/2} y={size/2 + 4} textAnchor="middle"
        style={{ fontSize: size * 0.28 + 'px', fontWeight: 700, fill: scoreColor(score), fontFamily: 'system-ui' }}>
        {score ?? '—'}
      </text>
    </svg>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export default function CouncilPanel({ leadId, leadName, orgId, autoRun = false }: Props) {
  const [run, setRun]             = useState<CouncilRun | null>(null)
  const [loading, setLoading]     = useState(false)
  const [activeAgent, setActive]  = useState<string | null>(null)
  const [elapsed, setElapsed]     = useState(0)
  const [error, setError]         = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'actions' | 'speed'>('overview')
  const timerRef = useRef<any>(null)
  const supabase = createClient()

  // Auto-run on mount if requested
  useEffect(() => {
    if (autoRun && leadId) runCouncil()
  }, [leadId])

  // Load latest run from DB on mount
  useEffect(() => {
    if (leadId) loadLatestRun()
  }, [leadId])

  async function loadLatestRun() {
    const { data: councilRun } = await supabase
      .from('agent_council_runs')
      .select('id, council_score, council_verdict, priority_action, brief, elapsed_ms, completed_agents, lead_id')
      .eq('lead_id', leadId)
      .in('status', ['complete', 'partial'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!councilRun) return

    const { data: insights } = await supabase
      .from('agent_insights')
      .select('agent_id, agent_class, agent_name, score, verdict, headline, findings, flags, opportunities, recommended_actions, elapsed_ms, error')
      .eq('run_id', councilRun.id)

    if (!insights) return

    setRun({
      run_id:           councilRun.id,
      lead_id:          councilRun.lead_id,
      elapsed_ms:       councilRun.elapsed_ms ?? 0,
      completed_agents: councilRun.completed_agents ?? 0,
      total_agents:     8,
      council_score:    councilRun.council_score ?? 0,
      council_verdict:  councilRun.council_verdict ?? 'unknown',
      priority_action:  councilRun.priority_action ?? '',
      brief:            councilRun.brief ?? '',
      agents: insights.map(i => ({
        id:           i.agent_id,
        class:        i.agent_class,
        name:         i.agent_name,
        score:        i.score,
        verdict:      i.verdict,
        headline:     i.headline,
        findings:     i.findings,
        flags:        i.flags ?? [],
        opportunities: i.opportunities ?? [],
        recommended_actions: i.recommended_actions ?? [],
        elapsed_ms:   i.elapsed_ms ?? 0,
        error:        i.error,
      }))
    })
  }

  async function runCouncil() {
    setLoading(true)
    setRun(null)
    setError('')
    setElapsed(0)

    const start = Date.now()
    timerRef.current = setInterval(() => setElapsed(Date.now() - start), 100)

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/agent-council`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ lead_id: leadId, org_id: orgId, trigger_event: 'manual' }),
        }
      )

      clearInterval(timerRef.current)
      const data = await res.json()

      if (!res.ok || data.error) { setError(data.error ?? 'Council failed'); setLoading(false); return }
      setRun(data)
    } catch (e: any) {
      clearInterval(timerRef.current)
      setError(e.message ?? 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const S = styles

  const verdictCfg = run ? (VERDICT_STYLE[run.council_verdict] ?? VERDICT_STYLE.complex) : null
  const allActions = run?.agents.flatMap(a => (a.recommended_actions ?? []).map(x => ({ ...x, agent: a.name, agentClass: a.class }))) ?? []
  const highActions = allActions.filter(a => a.priority === 'high')

  // ── LOADING STATE ─────────────────────────────────────────────────────────
  if (loading) return (
    <div style={S.root}>
      <div style={S.loadingCard}>
        <div style={S.loadingHeader}>
          <div style={S.loadingTitle}>Council Convening</div>
          <div style={S.loadingTime}>{(elapsed / 1000).toFixed(1)}s</div>
        </div>
        <div style={S.agentGrid}>
          {AGENT_ROSTER.map((agent, i) => {
            const cfg = CLASS_CONFIG[agent.class as keyof typeof CLASS_CONFIG]
            const isActive = (elapsed / 1000) > (i * 0.3)
            return (
              <div key={agent.id} style={{ ...S.agentLoadRow, ...(isActive ? { background: cfg.bg, borderColor: cfg.border } : {}) }}>
                <span style={{ fontSize: '14px' }}>{cfg.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: isActive ? cfg.color : '#8a9bb0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.name}</div>
                  <div style={{ fontSize: '10px', color: '#8a9bb0' }}>{cfg.label}</div>
                </div>
                <div style={{ fontSize: '10px', color: isActive ? cfg.color : '#c5cdd6' }}>{isActive ? '●' : '○'}</div>
              </div>
            )
          })}
        </div>
        <div style={S.progressTrack}>
          <div style={{ ...S.progressFill, width: `${Math.min((elapsed / 6500) * 100, 95)}%` }} />
        </div>
        <div style={S.loadingSub}>All 8 agents running in parallel — 6 second window</div>
      </div>
    </div>
  )

  // ── EMPTY STATE ───────────────────────────────────────────────────────────
  if (!run && !loading) return (
    <div style={S.root}>
      <div style={S.emptyCard}>
        <div style={S.emptyIcon}>⚡</div>
        <div style={S.emptyTitle}>Run Council Analysis</div>
        <div style={S.emptySub}>
          Deploys 8 specialized AI agents simultaneously against {leadName ?? 'this lead'}'s full profile.<br />
          Efficiency · Analytics · Psychology · Socioeconomics<br />
          Results in under 6 seconds.
        </div>
        {error && <div style={S.errorMsg}>{error}</div>}
        <button onClick={runCouncil} style={S.runBtn}>
          ⚡ Convene Council
        </button>
        <div style={S.rosterGrid}>
          {Object.entries(CLASS_CONFIG).map(([cls, cfg]) => {
            const agents = AGENT_ROSTER.filter(a => a.class === cls)
            return (
              <div key={cls} style={{ ...S.rosterGroup, borderColor: cfg.border, background: cfg.bg }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: cfg.color, marginBottom: '6px' }}>{cfg.icon} {cfg.label.toUpperCase()}</div>
                {agents.map(a => <div key={a.id} style={{ fontSize: '11px', color: '#5a6e84' }}>{a.name}</div>)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  if (!run) return null

  return (
    <div style={S.root}>

      {/* ── TOP BAR ── */}
      <div style={S.topBar}>
        <div style={S.topBarLeft}>
          <div style={{ ...S.verdictBadge, background: verdictCfg!.bg, color: verdictCfg!.color }}>
            {verdictCfg!.label}
          </div>
          <div style={S.metaChips}>
            <span style={S.metaChip}>⚡ {(run.elapsed_ms / 1000).toFixed(2)}s</span>
            <span style={S.metaChip}>✓ {run.completed_agents}/{run.total_agents} agents</span>
          </div>
        </div>
        <div style={S.topBarRight}>
          <ScoreRing score={run.council_score} size={52} />
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#8a9bb0', textTransform: 'uppercase' }}>Council Score</div>
            <div style={{ fontSize: '11px', color: scoreColor(run.council_score), fontWeight: 600 }}>
              {run.council_score >= 80 ? 'High Priority' : run.council_score >= 65 ? 'Qualified' : run.council_score >= 45 ? 'Nurture' : 'Rescue'}
            </div>
          </div>
          <button onClick={runCouncil} style={S.rerunBtn}>↻ Re-run</button>
        </div>
      </div>

      {/* ── BRIEF ── */}
      <div style={S.briefCard}>
        <div style={S.briefLabel}>📋 LO Handoff Brief</div>
        <div style={S.briefText}>{run.brief}</div>
        <div style={S.priorityAction}>
          <span style={S.priorityLabel}>Priority Action:</span> {run.priority_action}
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={S.tabRow}>
        {(['overview', 'agents', 'actions', 'speed'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ ...S.tab, ...(activeTab === t ? S.tabActive : {}) }}>
            {t === 'overview' ? '📊 Overview' : t === 'agents' ? '🤖 All Agents' : t === 'actions' ? `⚡ Actions (${highActions.length})` : '⏱ Speed'}
          </button>
        ))}
      </div>

      {/* ── TAB: OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div style={S.tabContent}>
          {/* Score bars by class */}
          {Object.entries(CLASS_CONFIG).map(([cls, cfg]) => {
            const classAgents = run.agents.filter(a => a.class === cls)
            const avgScore = classAgents.length
              ? Math.round(classAgents.reduce((s, a) => s + (a.score ?? 50), 0) / classAgents.length)
              : null
            return (
              <div key={cls} style={{ ...S.classRow, borderColor: cfg.border }}>
                <div style={S.classRowLeft}>
                  <span style={{ fontSize: '18px' }}>{cfg.icon}</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0d1b2a' }}>{cfg.label.toUpperCase()}</div>
                    <div style={{ fontSize: '10px', color: '#8a9bb0' }}>{classAgents.length} agent{classAgents.length !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div style={S.classScoreBar}>
                  <div style={{ ...S.scoreBarFill, width: `${avgScore ?? 0}%`, background: cfg.color }} />
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: cfg.color, minWidth: 32, textAlign: 'right' }}>{avgScore ?? '—'}</div>
              </div>
            )
          })}

          {/* Key insights grid */}
          <div style={S.insightGrid}>
            {run.agents.filter(a => a.headline && !a.error).slice(0, 6).map(agent => {
              const cfg = CLASS_CONFIG[agent.class as keyof typeof CLASS_CONFIG]
              return (
                <div key={agent.id} style={{ ...S.insightCard, borderColor: cfg.border, background: cfg.bg }}
                  onClick={() => { setActive(activeAgent === agent.id ? null : agent.id); setActiveTab('agents') }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: cfg.color, marginBottom: '6px' }}>{cfg.icon} {agent.name}</div>
                  <div style={{ fontSize: '12px', color: '#0d1b2a', lineHeight: 1.4 }}>{agent.headline}</div>
                </div>
              )
            })}
          </div>

          {/* Top flags */}
          {run.agents.flatMap(a => a.flags ?? []).slice(0, 5).length > 0 && (
            <div style={S.flagsSection}>
              <div style={S.sectionLabel}>⚠ Council Flags</div>
              {run.agents.flatMap(a => (a.flags ?? []).map(f => ({ flag: f, agent: a.name, class: a.class }))).slice(0, 6).map((f, i) => {
                const cfg = CLASS_CONFIG[f.class as keyof typeof CLASS_CONFIG]
                return (
                  <div key={i} style={{ ...S.flagRow, borderLeftColor: cfg.color }}>
                    <span style={{ fontSize: '10px', color: cfg.color, fontWeight: 600 }}>{f.agent}</span>
                    <span style={{ fontSize: '12px', color: '#4a4a6a' }}>{f.flag}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: AGENTS ── */}
      {activeTab === 'agents' && (
        <div style={S.tabContent}>
          {run.agents.map(agent => {
            const cfg = CLASS_CONFIG[agent.class as keyof typeof CLASS_CONFIG]
            const isOpen = activeAgent === agent.id
            return (
              <div key={agent.id} style={{ ...S.agentCard, borderColor: isOpen ? cfg.color : cfg.border }}>
                <div style={S.agentCardHeader} onClick={() => setActive(isOpen ? null : agent.id)}>
                  <div style={S.agentCardLeft}>
                    <ScoreRing score={agent.error ? null : agent.score} size={40} />
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: cfg.color }}>{cfg.icon} {agent.name}</div>
                      <div style={{ fontSize: '11px', color: '#5a6e84', lineHeight: 1.4, marginTop: '2px' }}>{agent.headline ?? (agent.error ? `Error: ${agent.error}` : 'No headline')}</div>
                    </div>
                  </div>
                  <div style={S.agentCardRight}>
                    {agent.verdict && <span style={{ ...S.verdictMini, color: cfg.color, background: cfg.bg, borderColor: cfg.border }}>{agent.verdict.replace(/_/g, ' ')}</span>}
                    <span style={{ fontSize: '10px', color: '#8a9bb0' }}>{agent.elapsed_ms}ms</span>
                    <span style={{ fontSize: '12px', color: '#8a9bb0' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isOpen && agent.findings && !agent.error && (
                  <div style={S.agentExpanded}>
                    {/* Findings */}
                    <div style={S.expandedSection}>
                      <div style={S.expandedLabel}>Findings</div>
                      {Object.entries(agent.findings).map(([k, v]) => (
                        <div key={k} style={S.findingRow}>
                          <span style={S.findingKey}>{k.replace(/_/g, ' ')}</span>
                          <span style={S.findingVal}>{Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                        </div>
                      ))}
                    </div>
                    {/* Opportunities */}
                    {agent.opportunities?.length > 0 && (
                      <div style={S.expandedSection}>
                        <div style={S.expandedLabel}>Opportunities</div>
                        {agent.opportunities.map((o, i) => <div key={i} style={{ ...S.bulletRow, color: '#27ae60' }}>✦ {o}</div>)}
                      </div>
                    )}
                    {/* Actions */}
                    {agent.recommended_actions?.length > 0 && (
                      <div style={S.expandedSection}>
                        <div style={S.expandedLabel}>Recommended Actions</div>
                        {agent.recommended_actions.map((a, i) => (
                          <div key={i} style={S.actionRow}>
                            <span style={{ ...S.priorityDot, background: a.priority === 'high' ? '#c0392b' : a.priority === 'medium' ? '#d4820a' : '#8a9bb0' }} />
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0d1b2a' }}>{a.action}</div>
                              {a.rationale && <div style={{ fontSize: '11px', color: '#8a9bb0', marginTop: '2px' }}>{a.rationale}</div>}
                              {(a as any).script_hint && <div style={{ fontSize: '11px', color: '#b5713a', marginTop: '4px', fontStyle: 'italic' }}>"{(a as any).script_hint}"</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── TAB: ACTIONS ── */}
      {activeTab === 'actions' && (
        <div style={S.tabContent}>
          {(['high', 'medium', 'low'] as const).map(priority => {
            const actions = allActions.filter(a => a.priority === priority)
            if (!actions.length) return null
            return (
              <div key={priority} style={{ marginBottom: '20px' }}>
                <div style={{ ...S.priorityHeader, color: priority === 'high' ? '#c0392b' : priority === 'medium' ? '#d4820a' : '#8a9bb0' }}>
                  {priority === 'high' ? '🔴' : priority === 'medium' ? '🟡' : '⚪'} {priority.toUpperCase()} PRIORITY — {actions.length} action{actions.length !== 1 ? 's' : ''}
                </div>
                {actions.map((a, i) => {
                  const cfg = CLASS_CONFIG[a.agentClass as keyof typeof CLASS_CONFIG]
                  return (
                    <div key={i} style={S.actionCard}>
                      <div style={{ fontSize: '10px', color: cfg.color, fontWeight: 700, marginBottom: '6px' }}>{cfg.icon} {a.agent}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0d1b2a', marginBottom: '4px' }}>{a.action}</div>
                      {a.rationale && <div style={{ fontSize: '12px', color: '#5a6e84' }}>{a.rationale}</div>}
                      {(a as any).script_hint && (
                        <div style={S.scriptHint}>
                          💬 "{(a as any).script_hint}"
                        </div>
                      )}
                      <div style={S.actionMeta}>
                        {(a as any).timing && <span style={S.actionMetaChip}>{(a as any).timing}</span>}
                        {(a as any).channel && <span style={S.actionMetaChip}>{(a as any).channel}</span>}
                        {(a as any).tone && <span style={S.actionMetaChip}>{(a as any).tone}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* ── TAB: SPEED ── */}
      {activeTab === 'speed' && (
        <div style={S.tabContent}>
          <div style={S.speedSummary}>
            <div style={S.speedStat}>
              <div style={S.speedStatNum}>{(run.elapsed_ms / 1000).toFixed(2)}s</div>
              <div style={S.speedStatLabel}>Total Wall Time</div>
            </div>
            <div style={S.speedStat}>
              <div style={S.speedStatNum}>{run.completed_agents}/{run.total_agents}</div>
              <div style={S.speedStatLabel}>Agents Completed</div>
            </div>
            <div style={S.speedStat}>
              <div style={S.speedStatNum}>{run.agents.length ? Math.round(run.agents.reduce((s, a) => s + a.elapsed_ms, 0) / run.agents.length) : 0}ms</div>
              <div style={S.speedStatLabel}>Avg Agent Time</div>
            </div>
          </div>

          {/* Speed chart — horizontal bars */}
          <div style={S.speedBars}>
            {[...run.agents].sort((a, b) => a.elapsed_ms - b.elapsed_ms).map(agent => {
              const cfg = CLASS_CONFIG[agent.class as keyof typeof CLASS_CONFIG]
              const maxMs = Math.max(...run.agents.map(a => a.elapsed_ms), 1)
              const pct = (agent.elapsed_ms / maxMs) * 100
              return (
                <div key={agent.id} style={S.speedBarRow}>
                  <div style={S.speedBarLabel}>
                    <span style={{ color: cfg.color }}>{cfg.icon}</span>
                    <span style={{ fontSize: '11px', color: '#4a4a6a', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '160px' }}>{agent.name}</span>
                  </div>
                  <div style={S.speedBarTrack}>
                    <div style={{ ...S.speedBarFill, width: `${pct}%`, background: agent.error ? '#e0e0e0' : cfg.color }} />
                  </div>
                  <div style={{ fontSize: '11px', color: agent.error ? '#c0392b' : '#5a6e84', minWidth: 48, textAlign: 'right' as const }}>
                    {agent.error ? 'error' : `${agent.elapsed_ms}ms`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── STYLES ─────────────────────────────────────────────────────────────────
const styles = {
  root:              { fontFamily: "'DM Sans', system-ui, sans-serif", color: '#0d1b2a' },
  // Loading
  loadingCard:       { background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #eae8e3' },
  loadingHeader:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  loadingTitle:      { fontFamily: 'Georgia, serif', fontSize: '18px', fontWeight: 500, color: '#0d1b2a' },
  loadingTime:       { fontFamily: 'monospace', fontSize: '20px', fontWeight: 700, color: '#b5713a' },
  agentGrid:         { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '16px' },
  agentLoadRow:      { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #eae8e3', transition: 'all 0.3s ease' },
  progressTrack:     { height: '3px', background: '#eae8e3', borderRadius: '99px', overflow: 'hidden', marginBottom: '10px' },
  progressFill:      { height: '100%', background: 'linear-gradient(90deg, #b5713a, #c9922a)', borderRadius: '99px', transition: 'width 0.2s' },
  loadingSub:        { fontSize: '11px', color: '#8a9bb0', textAlign: 'center' as const },
  // Empty
  emptyCard:         { background: '#ffffff', borderRadius: '12px', padding: '32px', border: '1px solid #eae8e3', textAlign: 'center' as const },
  emptyIcon:         { fontSize: '36px', marginBottom: '12px' },
  emptyTitle:        { fontFamily: 'Georgia, serif', fontSize: '20px', fontWeight: 500, color: '#0d1b2a', marginBottom: '8px' },
  emptySub:          { fontSize: '13px', color: '#8a9bb0', lineHeight: 1.7, marginBottom: '24px' },
  runBtn:            { padding: '12px 28px', fontSize: '14px', fontWeight: 700, color: 'white', background: 'linear-gradient(135deg, #b5713a, #8a4e22)', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 16px rgba(181,113,58,0.3)', marginBottom: '24px' },
  rosterGrid:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', textAlign: 'left' as const },
  rosterGroup:       { borderRadius: '8px', padding: '12px', border: '1px solid' },
  errorMsg:          { background: '#fdecea', border: '1px solid rgba(192,57,43,0.2)', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: '#c0392b', marginBottom: '16px' },
  // Top bar
  topBar:            { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' as const, gap: '10px' },
  topBarLeft:        { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const },
  topBarRight:       { display: 'flex', alignItems: 'center', gap: '12px' },
  verdictBadge:      { fontSize: '13px', fontWeight: 700, padding: '6px 14px', borderRadius: '99px' },
  metaChips:         { display: 'flex', gap: '6px', flexWrap: 'wrap' as const },
  metaChip:          { fontSize: '11px', padding: '4px 8px', background: '#f2f0ec', borderRadius: '6px', color: '#5a6e84', fontFamily: 'monospace' },
  rerunBtn:          { fontSize: '12px', fontWeight: 600, padding: '6px 12px', background: 'transparent', border: '1.5px solid #eae8e3', borderRadius: '6px', cursor: 'pointer', color: '#5a6e84' },
  // Brief
  briefCard:         { background: '#f9f7f4', borderRadius: '10px', padding: '16px', marginBottom: '16px', border: '1px solid #eae8e3' },
  briefLabel:        { fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' as const, color: '#8a9bb0', marginBottom: '8px' },
  briefText:         { fontSize: '13px', color: '#0d1b2a', lineHeight: 1.6, marginBottom: '10px' },
  priorityAction:    { fontSize: '12px', color: '#4a4a6a', paddingTop: '10px', borderTop: '1px solid #eae8e3' },
  priorityLabel:     { fontWeight: 700, color: '#b5713a' },
  // Tabs
  tabRow:            { display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' as const },
  tab:               { fontSize: '12px', fontWeight: 500, padding: '7px 14px', borderRadius: '6px', border: '1.5px solid #eae8e3', background: 'transparent', cursor: 'pointer', color: '#8a9bb0' },
  tabActive:         { background: '#0d1b2a', color: '#ffffff', borderColor: '#0d1b2a', fontWeight: 700 },
  tabContent:        { display: 'flex', flexDirection: 'column' as const, gap: '10px' },
  // Overview
  classRow:          { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#ffffff', border: '1px solid', borderRadius: '8px' },
  classRowLeft:      { display: 'flex', alignItems: 'center', gap: '10px', width: '120px', flexShrink: 0 },
  classScoreBar:     { flex: 1, height: '8px', background: '#f2f0ec', borderRadius: '99px', overflow: 'hidden' },
  scoreBarFill:      { height: '100%', borderRadius: '99px', transition: 'width 0.6s ease' },
  insightGrid:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  insightCard:       { padding: '12px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', transition: 'opacity 0.15s' },
  flagsSection:      { marginTop: '4px' },
  sectionLabel:      { fontSize: '11px', fontWeight: 700, color: '#8a9bb0', letterSpacing: '1px', textTransform: 'uppercase' as const, marginBottom: '8px' },
  flagRow:           { display: 'flex', flexDirection: 'column' as const, gap: '2px', padding: '8px 10px', paddingLeft: '10px', borderLeft: '3px solid', background: '#f9f7f4', borderRadius: '0 6px 6px 0', marginBottom: '4px' },
  // Agent cards
  agentCard:         { background: '#ffffff', border: '1.5px solid', borderRadius: '10px', overflow: 'hidden' },
  agentCardHeader:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px', cursor: 'pointer', gap: '12px' },
  agentCardLeft:     { display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1, minWidth: 0 },
  agentCardRight:    { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
  verdictMini:       { fontSize: '10px', fontWeight: 600, padding: '3px 7px', borderRadius: '4px', border: '1px solid', whiteSpace: 'nowrap' as const },
  agentExpanded:     { padding: '0 16px 16px', borderTop: '1px solid #f2f0ec', paddingTop: '14px', display: 'flex', flexDirection: 'column' as const, gap: '14px' },
  expandedSection:   { display: 'flex', flexDirection: 'column' as const, gap: '6px' },
  expandedLabel:     { fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' as const, color: '#8a9bb0', marginBottom: '2px' },
  findingRow:        { display: 'flex', gap: '10px', fontSize: '12px' },
  findingKey:        { color: '#8a9bb0', minWidth: '160px', flexShrink: 0, textTransform: 'capitalize' as const },
  findingVal:        { color: '#0d1b2a', flex: 1 },
  bulletRow:         { fontSize: '12px', paddingLeft: '8px' },
  actionRow:         { display: 'flex', gap: '10px', alignItems: 'flex-start' },
  priorityDot:       { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: '4px' },
  // Actions tab
  priorityHeader:    { fontSize: '11px', fontWeight: 700, letterSpacing: '1px', marginBottom: '8px' },
  actionCard:        { background: '#ffffff', border: '1px solid #eae8e3', borderRadius: '8px', padding: '14px' },
  scriptHint:        { fontSize: '12px', color: '#b5713a', background: 'rgba(181,113,58,0.08)', padding: '8px 10px', borderRadius: '6px', marginTop: '8px', fontStyle: 'italic' },
  actionMeta:        { display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' as const },
  actionMetaChip:    { fontSize: '10px', padding: '2px 8px', background: '#f2f0ec', borderRadius: '4px', color: '#8a9bb0', fontWeight: 600 },
  // Speed tab
  speedSummary:      { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' },
  speedStat:         { background: '#f9f7f4', borderRadius: '8px', padding: '14px', textAlign: 'center' as const },
  speedStatNum:      { fontFamily: 'monospace', fontSize: '20px', fontWeight: 700, color: '#0d1b2a', marginBottom: '4px' },
  speedStatLabel:    { fontSize: '10px', color: '#8a9bb0', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  speedBars:         { display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  speedBarRow:       { display: 'flex', alignItems: 'center', gap: '10px' },
  speedBarLabel:     { display: 'flex', alignItems: 'center', gap: '6px', width: '180px', flexShrink: 0 },
  speedBarTrack:     { flex: 1, height: '8px', background: '#f2f0ec', borderRadius: '99px', overflow: 'hidden' },
  speedBarFill:      { height: '100%', borderRadius: '99px', transition: 'width 0.6s ease' },
}
