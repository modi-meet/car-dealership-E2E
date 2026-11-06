import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import ContactFields, { contactReady, emptyContact } from './ContactFields'

const YEARS = Array.from({ length: 16 }, (_, i) => new Date().getFullYear() - i)

export default function TradeInForm() {
  const { t, i18n } = useTranslation()
  const [car, setCar] = useState({ name: '', year: '', km: '' })
  const [v, setV] = useState(emptyContact)
  const [tried, setTried] = useState(false)
  const carOk = car.name.trim().length >= 2 && car.year !== ''

  const send = useMutation({
    mutationFn: () =>
      api.post<{ ref: string; consultant: string | null }>('/leads', {
        ...v,
        lang: i18n.language,
        type: 'trade_in',
        // one readable line for the consultant, then whatever they added
        message: `Trade-in: ${car.year} ${car.name.trim()}${car.km ? `, ${Number(car.km).toLocaleString('en-IN')} km` : ''}.${v.message ? ` ${v.message}` : ''}`.slice(0, 1000),
      }),
  })

  if (send.data) {
    return (
      <div className="card p-6" role="status">
        <p className="text-[17px] font-medium">{t('enquiry.thanks')}</p>
        <p className="mt-2 text-[15px] text-ink-2">
          {send.data.consultant ? t('trade.willCall', { name: send.data.consultant }) : t('trade.teamWillCall')}
        </p>
        <p className="mt-4 text-[13px] text-ink-3">
          {t('enquiry.ref')} {send.data.ref}
        </p>
      </div>
    )
  }

  return (
    <form
      noValidate
      className="card space-y-5 p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (carOk && contactReady(v)) send.mutate()
      }}
    >
      <div>
        <h2 className="text-[17px] font-medium">{t('trade.title')}</h2>
        <p className="mt-1 text-[14px] text-ink-2">{t('trade.sub')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px_140px]">
        <label>
          <span className="label">{t('trade.car')}</span>
          <input className="field" placeholder={t('trade.carPh')} maxLength={60} value={car.name} onChange={(e) => setCar({ ...car, name: e.target.value })} />
        </label>
        <label>
          <span className="label">{t('trade.year')}</span>
          <select className="field" value={car.year} onChange={(e) => setCar({ ...car, year: e.target.value })}>
            <option value="">—</option>
            {YEARS.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">{t('trade.km')}</span>
          <input className="field" inputMode="numeric" placeholder="62000" value={car.km} onChange={(e) => setCar({ ...car, km: e.target.value.replace(/\D/g, '').slice(0, 7) })} />
        </label>
      </div>
      {tried && !carOk && <p className="-mt-2 text-[13px] text-bad">{t('trade.carNeeded')}</p>}
      <ContactFields value={v} onChange={setV} showErrors={tried} messageLabel={t('trade.anything')} />
      {send.error && (
        <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad" role="alert">
          {send.error.message}
        </p>
      )}
      <button className="btn-primary" disabled={send.isPending}>
        {send.isPending ? t('enquiry.sending') : t('trade.send')}
      </button>
    </form>
  )
}
