import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export type ContactValue = { name: string; phone: string; message: string; consent: boolean }
export const emptyContact: ContactValue = { name: '', phone: '', message: '', consent: false }

// same check the server does, just earlier so people see it before submitting
export function phoneOk(p: string) {
  let d = p.replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d)
}

export function contactReady(v: ContactValue) {
  return v.name.trim().length >= 2 && phoneOk(v.phone) && v.consent
}

type Props = { value: ContactValue; onChange: (v: ContactValue) => void; messageLabel?: string; showErrors?: boolean }

export default function ContactFields({ value, onChange, messageLabel, showErrors }: Props) {
  const { t } = useTranslation()
  const set = (patch: Partial<ContactValue>) => onChange({ ...value, ...patch })
  const badPhone = (showErrors || value.phone.length >= 10) && value.phone !== '' && !phoneOk(value.phone)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="c-name">
            {t('contact.name')}
          </label>
          <input id="c-name" className="field" autoComplete="name" maxLength={80} value={value.name} onChange={(e) => set({ name: e.target.value })} />
          {showErrors && value.name.trim().length < 2 && <p className="mt-1 text-[13px] text-bad">{t('contact.nameNeeded')}</p>}
        </div>
        <div>
          <label className="label" htmlFor="c-phone">
            {t('contact.phone')}
          </label>
          <input
            id="c-phone"
            className={`field ${badPhone ? 'border-bad' : ''}`}
            inputMode="tel"
            autoComplete="tel"
            placeholder="98390 12345"
            maxLength={16}
            value={value.phone}
            onChange={(e) => set({ phone: e.target.value })}
            aria-invalid={badPhone}
            aria-describedby="c-phone-err"
          />
          {(badPhone || (showErrors && !phoneOk(value.phone))) && (
            <p id="c-phone-err" className="mt-1 text-[13px] text-bad">
              {t('contact.phoneBad')}
            </p>
          )}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="c-msg">
          {messageLabel ?? t('contact.message')} <span className="text-ink-3">({t('contact.optional')})</span>
        </label>
        <textarea
          id="c-msg"
          rows={3}
          maxLength={1000}
          className="field h-auto py-2.5"
          value={value.message}
          onChange={(e) => set({ message: e.target.value })}
        />
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-ink-2">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]" checked={value.consent} onChange={(e) => set({ consent: e.target.checked })} />
        <span>
          {t('contact.consent')}{' '}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-ink" target="_blank">
            {t('contact.privacy')}
          </Link>
          .
        </span>
      </label>
      {showErrors && !value.consent && <p className="-mt-2 text-[13px] text-bad">{t('contact.consentNeeded')}</p>}
    </div>
  )
}
