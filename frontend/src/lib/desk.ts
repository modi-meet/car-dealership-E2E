import { useEffect, useState } from 'react'

export type LeadStatus = 'new' | 'contacted' | 'test_drive' | 'negotiation' | 'won' | 'lost'

export type LeadRow = {
  id: number
  name: string
  phone: string
  type: 'enquiry' | 'test_drive' | 'used' | 'trade_in'
  source: 'web' | 'portal' | 'walkin'
  status: LeadStatus
  model: string | null
  message: string
  assignee: string | null
  assignee_id: number | null
  showroom: string | null
  created_at: string
  due_at: string
  first_response_at: string | null
  opted_out: boolean
  ai_status: string
  intent: 'hot' | 'warm' | 'cold' | null
}

export type LeadEvent = { id: number; kind: string; body: string; at: string; actor: string | null }

export type AiSummary = {
  summary?: string
  intent?: 'hot' | 'warm' | 'cold'
  timeframe?: string
  budget?: string
  missing_info?: string[]
  confidence?: number
  why?: string
}

export type LeadDetail = LeadRow & {
  email: string | null
  lang: string
  city: string
  consent_at: string | null
  model_slug: string | null
  variant: string | null
  variant_id: number | null
  used_car: { stock_id: string; title: string; price: number; km: number } | null
  test_drive: { day: string; slot: string; showroom: string; status: string } | null
  ai_summary: AiSummary
  ai_draft: string
  events: LeadEvent[]
  moved?: boolean
}

export type Stats = {
  today: number
  within_sla_pct: number | null
  median_response_min: number | null
  overdue_now: number
  waiting_now: number
}

export const STATUSES: { key: LeadStatus; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'test_drive', label: 'Test drive' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
]

export const TYPE_LABEL: Record<LeadRow['type'], string> = {
  enquiry: 'Enquiry',
  test_drive: 'Test drive',
  used: 'Used car',
  trade_in: 'Trade-in',
}

export const SLA_MS = 5 * 60_000

// one clock for the whole page so every badge ticks together
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

export function ago(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// "4:07" style clock for the first five minutes
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export type Timer = { tone: 'ok' | 'warn' | 'bad' | 'done' | 'late'; text: string }

export function timer(row: Pick<LeadRow, 'created_at' | 'first_response_at'>, now: number): Timer {
  const created = Date.parse(row.created_at)
  if (row.first_response_at) {
    const took = Date.parse(row.first_response_at) - created
    return took <= SLA_MS ? { tone: 'done', text: `Replied in ${ago(took)}` } : { tone: 'late', text: `Replied in ${ago(took)}` }
  }
  const waited = now - created
  if (waited < 3 * 60_000) return { tone: 'ok', text: clock(waited) }
  if (waited <= SLA_MS) return { tone: 'warn', text: clock(waited) }
  return { tone: 'bad', text: `Overdue ${ago(waited - SLA_MS)}` }
}
