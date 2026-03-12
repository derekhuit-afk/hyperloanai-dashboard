'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Lead, AgentState, ActivityFeedItem, Escalation } from '../lib/supabase'

// ── STYLE HELPERS ─────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  shell: { display: 'grid', gridTemplateRows: '48px 1fr', gridTemplateColumns: '220px 1fr', height: '100vh', overflow: 'hidden' },
  topbar: { gridColumn: '1 / -1', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '20px', zIndex: 100 },
  sidebar: { background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '16px 0', overflowY: 'auto' },
  main: { overflowY: 'auto', background: 'var(--bg)' },
}

function mono(text: string, color?: string, size?: string): React.CSSProperties {
  return { fontFamily: 'var(--mono)', fontSize: size ?? '11px', color: color ?? 'var(--text-dim)', ...(size ? {} : {}) }
}

// ── SOURCE CHIP ───────────────────────────────────────────────
const SOURCE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  facebook:  { bg: 'rgba(24,119,242,0.15)',  color: '#4f8fe8', border: 'rgba(24,119,242,0.3)' },
  google:    { bg: 'rgba(234,67,53,0.15)',   color: '#ea4335', border: 'rgba(234,67,53,0.3)' },
  zillow:    { bg: 'rgba(0,112,162,0.15)',   color: '#0070a2', border: 'rgba(0,112,162,0.3)' },
  referral:  { bg: 'rgba(34,197,94,0.15)',   color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
  linkedin:  { bg: 'rgba(10,102,194,0.15)',  color: '#4f97e8', border: 'rgba(10,102,194,0.3)' },
  instagram: { bg: 'rgba(225,48,108,0.15)',  color: '#e1306c', border: 'rgba(225,48,108,0.3)' },
  youtube:   { bg: 'rgba(255,0,0,0.15)',     color: '#ff4444', border: 'rgba(255,0,0,0.3)' },
  website:   { bg: 'rgba(168,85,247,0.15)',  color: '#a855f7', border: 'rgba(168,85,247,0.3)' },
  idx:       { bg: 'rgba(168,85,247,0.15)',  color: '#a855f7', border: 'rgba(168,85,247,0.3)' },
}

function SourceChip({ source }: { source: string }) {
  const c = SOURCE_COLORS[source] ?? { bg: 'var(--surface2)', color: 'var(--text-dim)', border: 'var(--border2)' }
  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase', padding: '3px 7px', borderRadius: '2px', background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {source}
    </span>
  )
}

// ── AGENT STAGE BADGE ─────────────────────────────────────────
const AGENT_COLORS: Record<string, { bg: string; color: string }> = {
  intake:     { bg: 'rgba(0,150,255,0.1)',   color: 'var(--accent)' },
  nurture:    { bg: 'rgba(168,85,247,0.1)',  color: '#a855f7' },
  qualifier:  { bg: 'rgba(34,197,94,0.1)',   color: 'var(--green)' },
  prequal:    { bg: 'rgba(56,189,248,0.1)',  color: '#38bdf8' },
  booking:    { bg: 'rgba(245,158,11,0.1)',  color: 'var(--amber)' },
  handoff:    { bg: 'rgba(239,68,68,0.1)',   color: 'var(--red)' },
  escalation: { bg: 'var(--red-dim)',         color: 'var(--red)' },
  complete:   { bg: 'var(--green-dim)',       color: 'var(--green)' },
}

function AgentBadge({ stage }: { stage: string }) {
  const c = AGENT_COLORS[stage] ?? { bg: 'var(--surface2)', color: 'var(--text-dim)' }
  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', padding: '3px 8px', borderRadius: '2px', background: c.bg, color: c.color, display: 'inline-block' }}>
      {stage.toUpperCase()}
    </span>
  )
}

// ── SEVERITY BADGE ────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, React.CSSProperties> = {
    high:   { background: 'var(--red-dim)',   color: 'var(--red)',   border: '1px solid rgba(239,68,68,0.3)' },
    medium: { background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.3)' },
    low:    { background: 'var(--surface2)',  color: 'var(--text-dim)', border: '1px solid var(--border2)' },
  }
  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase', padding: '3px 8px', borderRadius: '2px', ...styles[severity] }}>
      {severity}
    </span>
  )
}

// ── NAV ITEM ──────────────────────────────────────────────────
function NavItem({ label, active, badge, badgeColor, onClick }: {
  label: string; active?: boolean; badge?: string | number; badgeColor?: string; onClick: () => void
}) {
  const badgeStyle: Record<string, React.CSSProperties> = {
    red:   { background: 'var(--red-dim)',   color: 'var(--red)',   border: '1px solid rgba(239,68,68,0.3)' },
    amber: { background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.3)' },
    green: { background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.3)' },
  }
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', cursor: 'pointer', borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, fontSize: '13px', fontWeight: 500, color: active ? 'var(--accent)' : 'var(--text-dim)', background: active ? 'rgba(0,150,255,0.06)' : 'transparent', transition: 'all 0.15s', userSelect: 'none' }}>
      {label}
      {badge != null && (
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '10px', padding: '1px 6px', borderRadius: '2px', minWidth: '20px', textAlign: 'center', ...badgeStyle[badgeColor ?? 'red'] }}>
          {badge}
        </span>
      )}
    </div>
  )
}

// ── STAT CARD ─────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', padding: '16px 20px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: '36px', letterSpacing: '1px', color: color ?? '#fff', lineHeight: 1 }}>{value}</div>
    </div>
  )
}

// ── CARD ──────────────────────────────────────────────────────
function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── BUTTON ────────────────────────────────────────────────────
function Btn({ children, primary, danger, onClick }: { children: React.ReactNode; primary?: boolean; danger?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '0.5px', padding: '6px 14px', borderRadius: '2px', border: danger ? '1px solid var(--red)' : primary ? '1px solid var(--accent)' : '1px solid var(--border2)', background: primary ? 'var(--accent)' : 'var(--surface2)', color: primary ? '#000' : danger ? 'var(--red)' : 'var(--text)', cursor: 'pointer', fontWeight: primary ? 600 : 400, whiteSpace: 'nowrap' }}>
      {children}
    </button>
  )
}

// ── TIME AGO ──────────────────────────────────────────────────
function timeAgo(ts: string | null): string {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── ACTIVITY TYPE → AGENT ────────────────────────────────────
function activityToAgent(type: string): string {
  if (type.includes('capture'))   return 'INTAKE'
  if (type.includes('nurture') || type.includes('sms') || type.includes('email')) return 'NURTURE'
  if (type.includes('score'))     return 'SYSTEM'
  if (type.includes('prequal'))   return 'PREQUAL'
  if (type.includes('appt') || type.includes('booking')) return 'BOOKING'
  if (type.includes('handoff') || type.includes('lo_'))  return 'HANDOFF'
  if (type.includes('escalat'))   return 'ESC'
  return 'SYSTEM'
}

const FEED_AGENT_STYLE: Record<string, React.CSSProperties> = {
  INTAKE:  { background: 'rgba(0,150,255,0.15)', color: 'var(--accent)', border: '1px solid rgba(0,150,255,0.3)' },
  NURTURE: { background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' },
  PREQUAL: { background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' },
  BOOKING: { background: 'rgba(245,158,11,0.15)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.3)' },
  HANDOFF: { background: 'rgba(239,68,68,0.15)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)' },
  ESC:     { background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.5)' },
  SYSTEM:  { background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border2)' },
}

// ═══════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════

export default function Dashboard() {
  const [activePanel, setActivePanel] = useState<string>('escalations')
  const [clock, setClock] = useState('')

  // Data state
  const [leads, setLeads] = useState<Lead[]>([])
  const [agentStates, setAgentStates] = useState<Map<string, AgentState>>(new Map())
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [feed, setFeed] = useState<ActivityFeedItem[]>([])
  const [resolvedEscs, setResolvedEscs] = useState<Set<string>>(new Set())
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)

  // Pipeline counts
  const pipelineCounts = {
    intake:    [...agentStates.values()].filter(s => s.active_agent === 'intake').length,
    nurture:   [...agentStates.values()].filter(s => s.active_agent === 'nurture').length,
    qualifier: [...agentStates.values()].filter(s => s.active_agent === 'qualifier').length,
    prequal:   [...agentStates.values()].filter(s => s.active_agent === 'prequal').length,
    booking:   [...agentStates.values()].filter(s => s.active_agent === 'booking').length,
    handoff:   [...agentStates.values()].filter(s => s.active_agent === 'handoff').length,
    complete:  [...agentStates.values()].filter(s => s.active_agent === 'complete').length,
  }
  const totalActive = leads.filter(l => !['closed','lost','dnc'].includes(l.status)).length
  const activeEscs  = escalations.filter(e => !resolvedEscs.has(e.id))

  // ── CLOCK ──────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Anchorage' }) + ' AKST')
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [])

  // ── INITIAL DATA LOAD ──────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [leadsRes, statesRes, escsRes, feedRes] = await Promise.all([
        supabase.from('leads').select('id,first_name,last_name,email,phone,source,status,ai_score,loan_purpose,est_loan_amount,est_purchase_price,est_credit_score,created_at,last_contact_at').not('status','in','(closed,lost,dnc)').order('created_at', { ascending: false }).limit(100),
        supabase.from('agent_states').select('lead_id,active_agent,response_count,last_borrower_reply,last_agent_message,is_escalated,is_paused,loan_purpose,purchase_price,credit_score_range').limit(200),
        supabase.from('escalations').select('id,lead_id,triggered_by,reason,severity,conversation_summary,recommended_action,created_at,leads(first_name,last_name,source,ai_score,phone,email)').is('resolved_at', null).order('created_at', { ascending: false }),
        supabase.from('lead_activities').select('id,lead_id,actor_type,activity_type,description,metadata,created_at,leads(first_name,last_name,source)').order('created_at', { ascending: false }).limit(50),
      ])

      if (leadsRes.data)  setLeads(leadsRes.data as Lead[])
      if (statesRes.data) {
        const map = new Map<string, AgentState>()
        statesRes.data.forEach((s: any) => map.set(s.lead_id, s))
        setAgentStates(map)
      }
      if (escsRes.data)   setEscalations(escsRes.data as unknown as Escalation[])
      if (feedRes.data)   setFeed(feedRes.data as unknown as ActivityFeedItem[])
      setLoading(false)
    }
    load()
  }, [])

  // ── REALTIME SUBSCRIPTIONS ─────────────────────────────────
  useEffect(() => {
    // 1. Live feed — new activities
    const activitySub = supabase
      .channel('lead_activities_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_activities' }, async (payload) => {
        const item = payload.new as ActivityFeedItem
        // Enrich with lead name
        const { data: lead } = await supabase.from('leads').select('first_name,last_name,source').eq('id', item.lead_id).single()
        if (lead) item.leads = lead
        setFeed(prev => [item, ...prev].slice(0, 60))
      })
      .subscribe()

    // 2. Escalations — new escalations
    const escSub = supabase
      .channel('escalations_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'escalations' }, async (payload) => {
        const esc = payload.new as Escalation
        const { data: lead } = await supabase.from('leads').select('first_name,last_name,source,ai_score,phone,email').eq('id', esc.lead_id).single()
        if (lead) esc.leads = lead as any
        setEscalations(prev => [esc, ...prev])
      })
      .subscribe()

    // 3. Escalation resolved
    const escUpdateSub = supabase
      .channel('escalations_resolved')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'escalations' }, (payload) => {
        if (payload.new.resolved_at) {
          setResolvedEscs(prev => new Set([...prev, payload.new.id]))
        }
      })
      .subscribe()

    // 4. Agent state changes (pipeline updates)
    const stateSub = supabase
      .channel('agent_states_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_states' }, (payload) => {
        const s = (payload.new ?? payload.old) as AgentState
        if (s?.lead_id) setAgentStates(prev => { const m = new Map(prev); m.set(s.lead_id, s); return m })
      })
      .subscribe()

    // 5. New leads
    const leadSub = supabase
      .channel('leads_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        setLeads(prev => [payload.new as Lead, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        setLeads(prev => prev.map(l => l.id === payload.new.id ? { ...l, ...payload.new } : l))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(activitySub)
      supabase.removeChannel(escSub)
      supabase.removeChannel(escUpdateSub)
      supabase.removeChannel(stateSub)
      supabase.removeChannel(leadSub)
    }
  }, [])

  // ── RESOLVE ESCALATION ─────────────────────────────────────
  async function resolveEscalation(escId: string, leadId: string) {
    setResolvedEscs(prev => new Set([...prev, escId]))
    await supabase.from('escalations').update({ resolved_at: new Date().toISOString(), resolved_by: 'derek' }).eq('id', escId)
    await supabase.functions.invoke('agent-orchestrator', {
      body: { type: 'ESCALATION_RESOLVED', lead_id: leadId, org_id: selectedLead?.source, escalation_id: escId }
    })
  }

  if (loading) {
    return <div style={{ background: '#070a0f', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', color: '#4a6280', letterSpacing: '3px', fontSize: '12px' }}>CONNECTING TO AGENT NETWORK...</div>
  }

  return (
    <div style={S.shell}>
      {/* ── TOPBAR ── */}
      <div style={S.topbar}>
        <div style={{ fontFamily: 'var(--display)', fontSize: '20px', letterSpacing: '2px', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', boxShadow: '0 0 8px var(--accent)' }} />
          HYPERLOAN AI
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-mute)', letterSpacing: '1px' }}>COMMAND CENTER</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '24px' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px', padding: '3px 10px', borderRadius: '2px', background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid #16a34a' }}>● AGENTS LIVE</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text-dim)' }}>{clock}</span>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>DH</div>
        </div>
      </div>

      {/* ── SIDEBAR ── */}
      <div style={S.sidebar}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '2px', color: 'var(--text-mute)', textTransform: 'uppercase', padding: '0 16px', marginBottom: '6px' }}>Operations</div>
          <NavItem label="Escalations" active={activePanel === 'escalations'} badge={activeEscs.length || undefined} badgeColor="red" onClick={() => setActivePanel('escalations')} />
          <NavItem label="Agent Pipeline" active={activePanel === 'pipeline'} onClick={() => setActivePanel('pipeline')} />
          <NavItem label="All Leads" active={activePanel === 'leads'} badge={totalActive} badgeColor="amber" onClick={() => setActivePanel('leads')} />
          <NavItem label="Live Feed" active={activePanel === 'feed'} badge="●" badgeColor="green" onClick={() => setActivePanel('feed')} />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '2px', color: 'var(--text-mute)', textTransform: 'uppercase', padding: '0 16px', marginBottom: '6px' }}>Intelligence</div>
          <NavItem label="Source ROI" active={activePanel === 'roi'} onClick={() => setActivePanel('roi')} />
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={S.main}>

        {/* ESCALATIONS */}
        {activePanel === 'escalations' && (
          <div>
            {activeEscs.length > 0 && (
              <div style={{ background: 'var(--red-dim)', borderBottom: '1px solid rgba(239,68,68,0.4)', padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '12px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--red)' }}>
                <div style={{ width: 6, height: 6, background: 'var(--red)', borderRadius: '50%' }} />
                {activeEscs.length} ACTIVE ESCALATION{activeEscs.length !== 1 ? 'S' : ''} — AGENT WORKFLOWS PAUSED ON AFFECTED LEADS
              </div>
            )}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '26px', letterSpacing: '2px', color: '#fff' }}>ESCALATIONS</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>Leads requiring your review — agents paused until resolved</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--border)', borderBottom: '1px solid var(--border)' }}>
              <StatCard label="Active" value={activeEscs.length} color="var(--red)" />
              <StatCard label="High Severity" value={activeEscs.filter(e => e.severity === 'high').length} color="var(--red)" />
              <StatCard label="Medium" value={activeEscs.filter(e => e.severity === 'medium').length} color="var(--amber)" />
              <StatCard label="Resolved Today" value={resolvedEscs.size} color="var(--green)" />
            </div>
            <div style={{ padding: '16px 24px' }}>
              <Card title="Active Escalation Queue">
                {activeEscs.length === 0 ? (
                  <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text-dim)' }}>✓ No active escalations — all agents running</div>
                ) : (
                  activeEscs.map(esc => (
                    <div key={esc.id} style={{ display: 'grid', gridTemplateColumns: '6px 1fr auto', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ background: esc.severity === 'high' ? 'var(--red)' : esc.severity === 'medium' ? 'var(--amber)' : 'var(--text-dim)' }} />
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                            {esc.leads ? `${esc.leads.first_name} ${esc.leads.last_name}` : esc.lead_id.slice(0,8)}
                          </span>
                          {esc.leads && <SourceChip source={esc.leads.source} />}
                          {esc.leads?.ai_score && <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)' }}>Score: {esc.leads.ai_score}</span>}
                          <SeverityBadge severity={esc.severity} />
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text-mute)' }}>{timeAgo(esc.created_at)}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '6px', lineHeight: 1.5 }}>{esc.reason}</div>
                        {esc.conversation_summary && <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5, fontStyle: 'italic', marginBottom: '8px' }}>"{esc.conversation_summary}"</div>}
                        {esc.recommended_action && <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--amber)' }}>→ {esc.recommended_action}</div>}
                      </div>
                      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center' }}>
                        <Btn primary onClick={() => resolveEscalation(esc.id, esc.lead_id)}>Resolve</Btn>
                        <Btn>View Lead</Btn>
                      </div>
                    </div>
                  ))
                )}
              </Card>
            </div>
          </div>
        )}

        {/* PIPELINE */}
        {activePanel === 'pipeline' && (
          <div>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: '26px', letterSpacing: '2px', color: '#fff' }}>AGENT PIPELINE</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>Live view across all 7 agent stages — Realtime</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--border)', borderBottom: '1px solid var(--border)' }}>
              <StatCard label="Active Leads" value={totalActive} />
              <StatCard label="Escalated" value={activeEscs.length} color="var(--red)" />
              <StatCard label="In Booking" value={pipelineCounts.booking} color="var(--amber)" />
              <StatCard label="Handoff Ready" value={pipelineCounts.handoff} color="var(--green)" />
            </div>
            <div style={{ padding: '16px 24px' }}>
              <Card title="Live Agent Funnel">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: 'var(--border)' }}>
                  {(['intake','nurture','qualifier','prequal','booking','handoff','complete'] as const).map(stage => {
                    const count = pipelineCounts[stage]
                    const max = Math.max(...Object.values(pipelineCounts), 1)
                    const c = AGENT_COLORS[stage]
                    return (
                      <div key={stage} style={{ background: 'var(--surface2)', padding: '20px 12px', textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '12px' }}>{stage}</div>
                        <div style={{ fontFamily: 'var(--display)', fontSize: '42px', letterSpacing: '1px', color: c?.color ?? '#fff', lineHeight: 1 }}>{count}</div>
                        <div style={{ marginTop: '12px', height: '3px', background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: c?.color ?? 'var(--accent)', width: `${Math.round(100 * count / max)}%`, transition: 'width 0.8s ease' }} />
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text-dim)', marginTop: '6px' }}>leads</div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ALL LEADS */}
        {activePanel === 'leads' && (
          <div>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: '26px', letterSpacing: '2px', color: '#fff' }}>ALL LEADS</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>{totalActive} active leads — click any row to inspect</div>
            </div>
            <div style={{ padding: '16px 24px' }}>
              <Card title={`Active Lead Table (${totalActive})`}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Lead','Source','Agent Stage','Score','Purpose','Est. Amount','Last Contact','Replies'].map(h => (
                          <th key={h} style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-dim)', padding: '10px 16px', textAlign: 'left', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {leads.slice(0, 50).map(lead => {
                        const state = agentStates.get(lead.id)
                        const score = lead.ai_score ?? 0
                        const scoreColor = score >= 80 ? 'var(--green)' : score < 60 ? 'var(--amber)' : 'var(--accent)'
                        return (
                          <tr key={lead.id} onClick={() => setSelectedLead(lead)} style={{ cursor: 'pointer' }}>
                            <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ fontWeight: 600, color: '#fff', fontSize: '13px' }}>{lead.first_name} {lead.last_name}</div>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>{lead.phone ?? lead.email ?? '—'}</div>
                            </td>
                            <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}><SourceChip source={lead.source} /></td>
                            <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}><AgentBadge stage={state?.active_agent ?? 'intake'} /></td>
                            <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, height: '4px', background: 'var(--border2)', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', background: scoreColor, width: `${score}%`, transition: 'width 0.5s' }} />
                                </div>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-dim)', minWidth: '28px' }}>{score}</span>
                              </div>
                            </td>
                            <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: '13px' }}>{lead.loan_purpose ?? '—'}</td>
                            <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: '12px' }}>
                              {lead.est_loan_amount ? `$${(lead.est_loan_amount/1000).toFixed(0)}K` : lead.est_purchase_price ? `$${(lead.est_purchase_price/1000).toFixed(0)}K` : '—'}
                            </td>
                            <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-dim)' }}>{timeAgo(lead.last_contact_at ?? lead.created_at)}</td>
                            <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: '12px', color: (state?.response_count ?? 0) > 0 ? 'var(--accent)' : 'var(--text-dim)' }}>{state?.response_count ?? 0}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* LIVE FEED */}
        {activePanel === 'feed' && (
          <div>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '26px', letterSpacing: '2px', color: '#fff' }}>LIVE FEED</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>Real-time agent actions via Supabase Realtime</div>
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px', padding: '3px 10px', borderRadius: '2px', background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid #16a34a' }}>● LIVE — {feed.length} events</span>
            </div>
            <div style={{ padding: '16px 24px' }}>
              <Card title="Agent Activity Stream">
                {feed.map(item => {
                  const agent = activityToAgent(item.activity_type)
                  const style = FEED_AGENT_STYLE[agent] ?? FEED_AGENT_STYLE.SYSTEM
                  return (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: '0 12px', padding: '10px 16px', borderBottom: '1px solid var(--border)', alignItems: 'start' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600, flexShrink: 0, marginTop: '2px', ...style }}>{agent.slice(0,6)}</div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#fff', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.leads ? `${item.leads.first_name} ${item.leads.last_name}` : 'System'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px', lineHeight: 1.4 }}>{item.description}</div>
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text-mute)', whiteSpace: 'nowrap', marginTop: '4px' }}>{timeAgo(item.created_at)}</div>
                    </div>
                  )
                })}
                {feed.length === 0 && <div style={{ padding: '48px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text-dim)' }}>Waiting for agent events...</div>}
              </Card>
            </div>
          </div>
        )}

        {/* SOURCE ROI */}
        {activePanel === 'roi' && (
          <div>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: '26px', letterSpacing: '2px', color: '#fff' }}>SOURCE ROI</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>Lead attribution and conversion by source</div>
            </div>
            <div style={{ padding: '16px 24px' }}>
              <Card title="Lead Volume by Source">
                {(() => {
                  const bySource: Record<string, number> = {}
                  leads.forEach(l => { bySource[l.source] = (bySource[l.source] ?? 0) + 1 })
                  const max = Math.max(...Object.values(bySource), 1)
                  return (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            {['Source','Leads','Avg Score','Volume'].map(h => (
                              <th key={h} style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-dim)', padding: '10px 16px', textAlign: 'left', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(bySource).sort((a,b)=>b[1]-a[1]).map(([source, count]) => {
                            const srcLeads = leads.filter(l => l.source === source)
                            const avgScore = Math.round(srcLeads.reduce((s,l) => s + (l.ai_score ?? 0), 0) / srcLeads.length)
                            return (
                              <tr key={source}>
                                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}><SourceChip source={source} /></td>
                                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: '13px' }}>{count}</td>
                                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: '13px', color: avgScore >= 75 ? 'var(--green)' : avgScore >= 60 ? 'var(--accent)' : 'var(--amber)' }}>{avgScore}</td>
                                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', width: '200px' }}>
                                  <div style={{ height: '6px', background: 'var(--border2)' }}>
                                    <div style={{ height: '100%', background: 'var(--accent)', width: `${Math.round(100 * count / max)}%`, transition: 'width 1s ease' }} />
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })()}
              </Card>
            </div>
          </div>
        )}

      </div>

      {/* ── LEAD DETAIL SLIDE-IN ── */}
      {selectedLead && (
        <div onClick={(e) => e.target === e.currentTarget && setSelectedLead(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
          <div style={{ width: 480, height: '100vh', background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--surface2)', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '20px', letterSpacing: '2px', color: '#fff' }}>{selectedLead.first_name} {selectedLead.last_name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <SourceChip source={selectedLead.source} />
                  <AgentBadge stage={agentStates.get(selectedLead.id)?.active_agent ?? 'intake'} />
                </div>
              </div>
              <span onClick={() => setSelectedLead(null)} style={{ cursor: 'pointer', color: 'var(--text-dim)', fontSize: '20px', lineHeight: 1 }}>✕</span>
            </div>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '12px' }}>Contact</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[['PHONE', selectedLead.phone ?? '—'], ['EMAIL', selectedLead.email ?? '—'], ['SOURCE', selectedLead.source], ['STATUS', selectedLead.status]].map(([label, val]) => (
                  <div key={label}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text-mute)', marginBottom: '3px' }}>{label}</div>
                    <div style={{ fontSize: '12px', fontFamily: 'var(--mono)', color: '#fff' }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '12px' }}>Qualification</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[
                  ['AI SCORE', `${selectedLead.ai_score ?? '—'} / 100`],
                  ['LOAN PURPOSE', selectedLead.loan_purpose ?? '—'],
                  ['EST. PRICE', selectedLead.est_purchase_price ? `$${selectedLead.est_purchase_price.toLocaleString()}` : '—'],
                  ['CREDIT RANGE', selectedLead.est_credit_score ?? '—'],
                  ['REPLIES', `${agentStates.get(selectedLead.id)?.response_count ?? 0}`],
                  ['CAPTURED', timeAgo(selectedLead.created_at)],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text-mute)', marginBottom: '3px' }}>{label}</div>
                    <div style={{ fontSize: '12px', fontFamily: 'var(--mono)', color: '#fff' }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '12px' }}>Agent Controls</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Btn primary>Resume Agent</Btn>
                <Btn>Pause Automation</Btn>
                <Btn>Force Handoff</Btn>
                <Btn danger>Mark Lost</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
