import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  realtime: { params: { eventsPerSecond: 10 } }
})

export type LeadStatus = 'new'|'queued'|'contacted'|'nurturing'|'qualified'|'prequal_sent'|'prequal_done'|'docs_requested'|'docs_partial'|'docs_complete'|'appt_scheduled'|'appt_complete'|'handed_off'|'closed'|'lost'|'dnc'
export type AgentStage = 'intake'|'nurture'|'qualifier'|'prequal'|'booking'|'escalation'|'handoff'|'complete'|'paused'

export interface Lead {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  source: string
  status: LeadStatus
  ai_score: number | null
  loan_purpose: string | null
  est_loan_amount: number | null
  est_purchase_price: number | null
  est_credit_score: string | null
  created_at: string
  last_contact_at: string | null
}

export interface AgentState {
  lead_id: string
  active_agent: AgentStage
  response_count: number
  last_borrower_reply: string | null
  last_agent_message: string | null
  is_escalated: boolean
  is_paused: boolean
  loan_purpose: string | null
  purchase_price: number | null
  credit_score_range: string | null
}

export interface ActivityFeedItem {
  id: string
  lead_id: string
  actor_type: string
  activity_type: string
  description: string
  metadata: Record<string, unknown>
  created_at: string
  leads?: { first_name: string; last_name: string; source: string }
}

export interface Escalation {
  id: string
  lead_id: string
  triggered_by: string
  reason: string
  severity: 'low'|'medium'|'high'
  conversation_summary: string | null
  recommended_action: string | null
  created_at: string
  leads?: { first_name: string; last_name: string; source: string; ai_score: number; phone: string; email: string }
}
