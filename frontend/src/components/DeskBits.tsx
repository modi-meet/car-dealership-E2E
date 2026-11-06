import { STATUSES, type LeadRow, type LeadStatus, type Timer } from '../lib/desk'

const TONE: Record<Timer['tone'], string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad text-paper',
  done: 'bg-mist text-ink-2',
  late: 'bg-mist text-warn',
}

export function TimerBadge({ t }: { t: Timer }) {
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium tabular-nums ${TONE[t.tone]}`}>
      {(t.tone === 'ok' || t.tone === 'warn' || t.tone === 'bad') && <span className={`size-1.5 rounded-full ${t.tone === 'bad' ? 'bg-paper' : 'bg-current'} animate-pulse`} aria-hidden />}
      {t.text}
    </span>
  )
}

const STATUS_TONE: Record<LeadStatus, string> = {
  new: 'border-accent text-accent',
  contacted: 'border-line text-ink-2',
  test_drive: 'border-line text-ink-2',
  negotiation: 'border-line text-ink',
  won: 'border-ok bg-ok-soft text-ok',
  lost: 'border-line text-ink-3',
}

export function StatusChip({ s }: { s: LeadStatus }) {
  return (
    <span className={`inline-flex h-6 items-center rounded-full border px-2 text-[12px] ${STATUS_TONE[s]}`}>
      {STATUSES.find((x) => x.key === s)?.label}
    </span>
  )
}

export function IntentDot({ intent }: { intent: LeadRow['intent'] }) {
  if (!intent) return null
  const c = intent === 'hot' ? 'bg-bad' : intent === 'warm' ? 'bg-warn' : 'bg-ink-3'
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-ink-3" title={`AI read: ${intent}`}>
      <span className={`size-1.5 rounded-full ${c}`} aria-hidden />
      {intent}
    </span>
  )
}
