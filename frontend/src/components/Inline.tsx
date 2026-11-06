import { useState } from 'react'

// edit-in-place cell: saves on blur or enter, reverts and shows why if the server says no

type Props = {
  value: string | number
  onSave: (v: string) => Promise<unknown>
  type?: 'text' | 'number' | 'date'
  prefix?: string
  suffix?: string
  className?: string
  label: string
}

export function InlineInput({ value, onSave, type = 'text', prefix, suffix, className = 'w-28', label }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [err, setErr] = useState('')
  const shown = draft ?? String(value)

  const commit = async () => {
    if (draft === null || draft === String(value)) return setDraft(null)
    setState('saving')
    try {
      await onSave(draft)
      setState('saved')
      setDraft(null)
      setTimeout(() => setState('idle'), 1200)
    } catch (e) {
      setState('error')
      setErr(e instanceof Error ? e.message : 'could not save')
      setDraft(null)
    }
  }

  return (
    <span className="inline-flex flex-col">
      <span
        className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2 text-[14px] focus-within:border-ink ${
          state === 'error' ? 'border-bad' : state === 'saved' ? 'border-ok' : 'border-transparent hover:border-line'
        } ${className}`}
      >
        {prefix && <span className="text-ink-3">{prefix}</span>}
        <input
          aria-label={label}
          type={type}
          value={shown}
          onChange={(e) => {
            setDraft(e.target.value)
            setState('idle')
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setDraft(null)
          }}
          className="w-full min-w-0 bg-transparent tabular-nums outline-none"
        />
        {suffix && <span className="text-ink-3">{suffix}</span>}
      </span>
      {state === 'error' && <span className="mt-0.5 max-w-xs text-[12px] text-bad">{err}</span>}
    </span>
  )
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-ink' : 'bg-line'}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-paper shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}
