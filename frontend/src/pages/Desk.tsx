import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { IntentDot, StatusChip, TimerBadge } from '../components/DeskBits'
import { EmptyState, ErrorState } from '../components/States'
import { api } from '../lib/api'
import { useMe } from '../lib/auth'
import { ago, timer, TYPE_LABEL, useNow, type LeadRow, type Stats } from '../lib/desk'
import { usePageTitle } from '../lib/usePageTitle'

const VIEWS = [
  { key: 'waiting', label: 'Needs a call' },
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
] as const

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'ok' }) {
  return (
    <div className="bg-paper p-4">
      <p className="text-[12px] text-ink-3">{label}</p>
      <p className={`mt-1 text-[24px] font-semibold tracking-tight tabular-nums ${tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : ''}`}>{value}</p>
    </div>
  )
}

function Row({ r, now }: { r: LeadRow; now: number }) {
  return (
    <li>
      <Link to={`/desk/leads/${r.id}`} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 py-4 hover:bg-mist sm:grid-cols-[132px_1fr_auto] sm:items-center sm:px-5">
        <div className="row-span-2 sm:row-span-1">
          <TimerBadge t={timer(r, now)} />
        </div>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[15px] font-medium">{r.name}</span>
            <span className="text-[13px] text-ink-3">
              {TYPE_LABEL[r.type]}
              {r.model ? ` · ${r.model}` : ''}
            </span>
            <IntentDot intent={r.intent} />
            {r.opted_out && <span className="rounded-full bg-mist px-2 text-[11px] text-ink-3">opted out</span>}
          </p>
          {r.message && <p className="mt-0.5 truncate text-[13px] text-ink-2">{r.message}</p>}
        </div>
        <div className="col-start-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-3 sm:col-start-3 sm:justify-end">
          <span className="rounded-full bg-mist px-2 py-0.5 capitalize">{r.source}</span>
          <span>
            {r.assignee ?? 'Unassigned'}
            {r.showroom ? ` · ${r.showroom}` : ''}
          </span>
          <span>{ago(now - Date.parse(r.created_at))} ago</span>
          <StatusChip s={r.status} />
        </div>
      </Link>
    </li>
  )
}

export default function Desk() {
  usePageTitle('Lead desk')
  const { data: me } = useMe()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') ?? 'waiting'
  const mine = params.get('mine') === '1'
  const [q, setQ] = useState('')
  const now = useNow()

  const qs = new URLSearchParams({ view, ...(mine ? { mine: 'true' } : {}), ...(q.trim() ? { q: q.trim() } : {}) }).toString()
  // poll so a new web lead shows up without anyone refreshing
  const leads = useQuery({ queryKey: ['leads', qs], queryFn: () => api.get<LeadRow[]>(`/leads?${qs}`), refetchInterval: 20_000, placeholderData: keepPreviousData })
  const stats = useQuery({ queryKey: ['desk-stats'], queryFn: () => api.get<Stats>('/desk/stats'), refetchInterval: 20_000 })

  const set = (k: string, v: string | null) =>
    setParams(
      (p) => {
        if (v) p.set(k, v)
        else p.delete(k)
        return p
      },
      { replace: true },
    )
  const s = stats.data

  return (
    <div className="wrap pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{me?.role === 'admin' ? 'All showrooms' : 'Your showroom'}</p>
          <h1 className="mt-1 text-[30px] font-semibold tracking-tight">Lead desk</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/desk/import" className="btn-quiet h-10">
            Import portal CSV
          </Link>
          {me?.role === 'admin' && (
            <a href="/api/desk/export.csv" className="btn-quiet h-10" download>
              Today’s DMS export
            </a>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-4">
        <Stat label="Waiting for a call" value={s ? String(s.waiting_now) : '–'} />
        <Stat label="Past 5 minutes" value={s ? String(s.overdue_now) : '–'} tone={s && s.overdue_now > 0 ? 'bad' : undefined} />
        <Stat label="Called within 5 min today" value={s?.within_sla_pct != null ? `${s.within_sla_pct}%` : '–'} tone={s?.within_sla_pct != null && s.within_sla_pct >= 90 ? 'ok' : undefined} />
        <Stat label="Median first response" value={s?.median_response_min != null ? `${s.median_response_min} min` : '–'} />
      </div>
      <p className="mt-2 text-[12px] text-ink-3">Target: 90% of web leads called within 5 minutes.</p>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-line p-1" role="tablist">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              role="tab"
              aria-selected={view === v.key}
              onClick={() => set('view', v.key === 'waiting' ? null : v.key)}
              className={`h-8 rounded-full px-3.5 text-[13px] ${view === v.key ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line px-3.5 text-[13px] text-ink-2">
          <input type="checkbox" checked={mine} onChange={(e) => set('mine', e.target.checked ? '1' : null)} className="accent-[var(--color-ink)]" />
          Only mine
        </label>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or phone"
          aria-label="Search leads"
          className="field h-10 w-full rounded-full sm:ml-auto sm:w-64"
        />
      </div>

      <div className="mt-4">
        {leads.isLoading ? (
          <div className="card divide-y divide-line" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-5">
                <div className="skeleton h-7 w-24 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/3" />
                  <div className="skeleton h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : leads.error ? (
          <ErrorState message={leads.error.message} onRetry={() => leads.refetch()} />
        ) : !leads.data?.length ? (
          view === 'waiting' ? (
            <EmptyState title="All caught up" body="Every lead has had a first call. New ones appear here on their own." />
          ) : (
            <EmptyState title="Nothing here" body={q ? 'No lead matches that search.' : 'No leads in this view yet.'} />
          )
        ) : (
          <ul className={`card divide-y divide-line overflow-hidden ${leads.isFetching && !leads.isRefetching ? 'opacity-60' : ''}`}>
            {leads.data.map((r) => (
              <Row key={r.id} r={r} now={now} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
