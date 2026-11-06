import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../lib/api'
import type { LeadDetail } from '../lib/desk'

const STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: 'Ready', cls: 'bg-ok-soft text-ok' },
  needs_review: { label: 'Check carefully', cls: 'bg-warn-soft text-warn' },
  fallback: { label: 'AI unavailable · template', cls: 'bg-mist text-ink-2' },
  pending: { label: 'Not run yet', cls: 'bg-mist text-ink-3' },
  skipped: { label: 'Skipped · opted out', cls: 'bg-mist text-ink-3' },
}

// quick hint while typing, the server makes the real call
const DISCOUNTY = /discount|\boffers?\b|cash\s*back|\bdeals?\b|% ?off|छूट|ऑफ़र|ऑफर/i

function Chip({ k, v }: { k: string; v?: string | null }) {
  if (!v || v === 'not stated') return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px]">
      <span className="text-ink-3">{k}</span>
      {v}
    </span>
  )
}

function Draft({ lead }: { lead: LeadDetail }) {
  const qc = useQueryClient()
  const [text, setText] = useState(lead.ai_draft)
  const send = useMutation({
    mutationFn: () => api.post<LeadDetail>(`/leads/${lead.id}/send`, { body: text }),
    onSuccess: (d) => {
      qc.setQueryData(['lead', String(lead.id)], d)
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['desk-stats'] })
    },
  })
  const warn = DISCOUNTY.test(text)
  const sent = send.isSuccess

  return (
    <div className="mt-5">
      <label htmlFor="draft" className="text-[13px] font-medium text-ink-2">
        First reply · edit before sending
      </label>
      <textarea
        id="draft"
        rows={4}
        maxLength={1000}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          send.reset()
        }}
        className="field mt-2 h-auto py-3 leading-relaxed"
        disabled={lead.opted_out}
      />
      <div className="mt-1 flex justify-between text-[12px] text-ink-3">
        <span>{warn ? <span className="text-bad">Remove discount / offer wording, it can’t be sent.</span> : 'No discounts in writing. Prices come from the price table.'}</span>
        <span className="tabular-nums">{text.length}/1000</span>
      </div>
      {send.error && (
        <p className="mt-3 rounded-xl bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad" role="alert">
          {send.error.message}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn-accent" disabled={send.isPending || sent || text.trim().length < 2 || warn || lead.opted_out} onClick={() => send.mutate()}>
          {sent ? 'Sent ✓' : send.isPending ? 'Sending…' : 'Send on WhatsApp'}
        </button>
        <span className="text-[12px] text-ink-3">Mock send · logged on the timeline</span>
      </div>
    </div>
  )
}

export default function AiCard({ lead }: { lead: LeadDetail }) {
  const qc = useQueryClient()
  const regen = useMutation({
    mutationFn: () => api.post<LeadDetail>(`/leads/${lead.id}/ai`),
    onSuccess: (d) => qc.setQueryData(['lead', String(lead.id)], d),
  })
  const s = lead.ai_summary ?? {}
  const st = STATUS[lead.ai_status] ?? STATUS.pending
  const problems = (s as { problems?: string[] }).problems ?? []
  const ran = lead.ai_status !== 'pending' && lead.ai_status !== 'skipped'

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="ai-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 id="ai-h" className="text-[15px] font-medium">
            Buyer read
          </h2>
          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${st.cls}`}>{st.label}</span>
        </div>
        {!lead.opted_out && (
          <button className="btn-quiet h-9 px-4 text-[13px]" disabled={regen.isPending} onClick={() => regen.mutate()}>
            {regen.isPending ? 'Thinking…' : ran ? 'Regenerate' : 'Generate read + draft'}
          </button>
        )}
      </div>

      {regen.error && <p className="mt-3 text-[14px] text-bad">{regen.error.message}</p>}

      {lead.opted_out ? (
        <p className="mt-4 text-[14px] text-ink-2">This buyer withdrew consent. No AI profiling and no messages.</p>
      ) : !ran ? (
        <p className="mt-4 text-[14px] text-ink-2">Get a one-line read of what they want and a first WhatsApp reply to edit.</p>
      ) : (
        <>
          <p className="mt-4 text-[16px] leading-relaxed">{s.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip k="Intent" v={s.intent} />
            <Chip k="When" v={s.timeframe} />
            <Chip k="Budget" v={s.budget} />
          </div>
          {s.missing_info && s.missing_info.length > 0 && (
            <p className="mt-3 text-[14px] text-ink-2">
              <span className="text-ink-3">Ask about:</span> {s.missing_info.join(' · ')}
            </p>
          )}
          {lead.ai_status === 'needs_review' && problems.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[12px] text-ink-3">
            {s.why}
            {typeof s.confidence === 'number' && lead.ai_status !== 'fallback' ? ` · confidence ${Math.round(s.confidence * 100)}%` : ''}
          </p>
          {/* every ai run logs an event, key on it so regenerate always resets the box,
              even when the new draft happens to match the old one */}
          <Draft key={lead.events.filter((e) => e.kind === 'ai').at(-1)?.id ?? 'none'} lead={lead} />
        </>
      )}
    </section>
  )
}
