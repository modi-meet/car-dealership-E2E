import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import AiCard from '../components/AiCard'
import { StatusChip, TimerBadge } from '../components/DeskBits'
import { ErrorState, NotFound } from '../components/States'
import { api, ApiError } from '../lib/api'
import { dayLabel, km, rupees, slotLabel } from '../lib/format'
import { STATUSES, timer, TYPE_LABEL, useNow, type LeadDetail, type LeadStatus } from '../lib/desk'
import { usePageTitle } from '../lib/usePageTitle'

type Patch = { status?: LeadStatus; assigned_to?: number; note?: string }

const EVENT_DOT: Record<string, string> = {
  created: 'bg-accent',
  assigned: 'bg-ink-3',
  reassigned: 'bg-warn',
  status: 'bg-ink',
  note: 'bg-ink-3',
  message_sent: 'bg-ok',
  ai: 'bg-accent',
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-[14px]">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  )
}

export default function LeadPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const now = useNow()
  const [note, setNote] = useState('')

  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => api.get<LeadDetail>(`/leads/${id}`), refetchInterval: 30_000 })
  const people = useQuery({ queryKey: ['consultants'], queryFn: () => api.get<{ id: number; name: string; showroom: string }[]>('/consultants') })
  usePageTitle(lead.data ? `${lead.data.name} · lead` : 'Lead')

  const patch = useMutation({
    mutationFn: (p: Patch) => api.patch<LeadDetail>(`/leads/${id}`, p),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['desk-stats'] })
      // handed to another showroom, it's not ours to look at any more
      if (d.moved) return nav('/desk', { replace: true })
      qc.setQueryData(['lead', id], d)
      setNote('')
    },
  })

  if (lead.error instanceof ApiError && lead.error.status === 404) return <NotFound />
  if (lead.error) return <div className="wrap py-24"><ErrorState message={lead.error.message} onRetry={() => lead.refetch()} /></div>
  const l = lead.data
  if (!l) {
    return (
      <div className="wrap pt-10" aria-busy="true">
        <div className="skeleton h-9 w-64" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="skeleton h-96 rounded-[var(--radius-card)]" />
          <div className="skeleton h-72 rounded-[var(--radius-card)]" />
        </div>
      </div>
    )
  }

  const busy = patch.isPending
  const call = () => {
    // a tap on call is the first response, so stop the clock straight away
    if (l.status === 'new') patch.mutate({ status: 'contacted', note: 'called from the desk' })
  }

  return (
    <div className="wrap pt-8">
      <Link to="/desk" className="text-[14px] text-ink-3 hover:text-ink">
        ← Lead desk
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TimerBadge t={timer(l, now)} />
            <StatusChip s={l.status} />
            {l.opted_out && <span className="rounded-full bg-bad-soft px-2.5 py-0.5 text-[12px] text-bad">Opted out, don’t message</span>}
          </div>
          <h1 className="mt-3 text-[30px] font-semibold tracking-tight">{l.name}</h1>
          <p className="mt-1 text-[14px] text-ink-2">
            {TYPE_LABEL[l.type]}
            {l.model ? ` · ${l.model}${l.variant ? ` ${l.variant}` : ''}` : ''} · via <span className="capitalize">{l.source}</span> · {when(l.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`tel:+91${l.phone}`} onClick={call} className="btn-accent">
            Call {l.phone.replace(/(\d{5})(\d{5})/, '$1 $2')}
          </a>
        </div>
      </div>

      {patch.error && (
        <p className="mt-4 rounded-xl bg-bad-soft px-4 py-3 text-[14px] text-bad" role="alert">
          {patch.error.message}
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-8">
          <AiCard lead={l} />

          {l.message && (
            <section className="card p-5">
              <p className="eyebrow">What they said</p>
              <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line">{l.message}</p>
            </section>
          )}

          <section>
            <h2 className="text-[15px] font-medium">Status</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {STATUSES.filter((s) => s.key !== 'new').map((s) => (
                <button
                  key={s.key}
                  disabled={busy}
                  onClick={() => patch.mutate({ status: s.key })}
                  aria-pressed={l.status === s.key}
                  className={`h-9 rounded-full border px-3.5 text-[13px] ${l.status === s.key ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink-3'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-[15px] font-medium">Timeline</h2>
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault()
                if (note.trim()) patch.mutate({ note: note.trim() })
              }}
            >
              <label className="sr-only" htmlFor="note">
                Add a note
              </label>
              <input id="note" className="field" placeholder="Add a note, e.g. ‘wants a Sunday drive’" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn-quiet shrink-0" disabled={busy || !note.trim()}>
                Add note
              </button>
            </form>
            <ol className="mt-5 space-y-0">
              {[...l.events].reverse().map((e) => (
                <li key={e.id} className="relative flex gap-4 pb-5 pl-1 last:pb-0">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${EVENT_DOT[e.kind] ?? 'bg-ink-3'}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[14px] break-words">{e.body}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">
                      {when(e.at)}
                      {e.actor ? ` · ${e.actor}` : ' · system'}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="card p-5">
            <h2 className="text-[15px] font-medium">Owner</h2>
            <label className="sr-only" htmlFor="owner">
              Assigned consultant
            </label>
            <select
              id="owner"
              className="field mt-3"
              value={l.assignee_id ?? ''}
              disabled={busy || !people.data}
              onChange={(e) => e.target.value && patch.mutate({ assigned_to: Number(e.target.value) })}
            >
              {!l.assignee_id && <option value="">Unassigned</option>}
              {people.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.showroom}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[12px] text-ink-3">Re-assigning moves the lead to that consultant’s showroom.</p>
          </section>

          <section className="card px-5 py-3">
            <dl className="divide-y divide-line">
              <Fact k="Mobile" v={<span className="tabular-nums">{l.phone}</span>} />
              {l.email && <Fact k="Email" v={l.email} />}
              <Fact k="City" v={l.city} />
              <Fact k="Language" v={l.lang === 'hi' ? 'Hindi' : 'English'} />
              {l.showroom && <Fact k="Showroom" v={l.showroom} />}
              {l.test_drive && (
                <Fact k="Test drive" v={`${dayLabel(l.test_drive.day)} · ${slotLabel(l.test_drive.slot)} · ${l.test_drive.showroom}`} />
              )}
              {l.used_car && (
                <Fact
                  k="Used car"
                  v={
                    <Link to={`/used/${l.used_car.stock_id}`} className="underline underline-offset-2">
                      {l.used_car.title} · {rupees(l.used_car.price)} · {km(l.used_car.km)}
                    </Link>
                  }
                />
              )}
              {l.model_slug && (
                <Fact
                  k="Quote"
                  v={
                    <Link to={`/cars/${l.model_slug}${l.variant_id ? `?variant=${l.variant_id}&city=${encodeURIComponent(l.city)}` : ''}`} className="underline underline-offset-2">
                      Open on-road price
                    </Link>
                  }
                />
              )}
              <Fact k="Consent" v={l.consent_at ? `given ${when(l.consent_at)}` : '—'} />
            </dl>
          </section>
        </aside>
      </div>
    </div>
  )
}
