import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { phoneOk } from '../components/ContactFields'
import { api } from '../lib/api'
import { usePageTitle } from '../lib/usePageTitle'

export default function Privacy() {
  const { t } = useTranslation()
  usePageTitle(t('privacy.title'))
  const [phone, setPhone] = useState('')
  const out = useMutation({ mutationFn: () => api.post('/optout', { phone }) })
  const points = t('privacy.points', { returnObjects: true }) as string[]

  return (
    <div className="wrap max-w-2xl pt-14 sm:pt-20">
      <h1 className="text-[34px] font-semibold tracking-tight">{t('privacy.title')}</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{t('privacy.intro')}</p>
      <ul className="mt-8 space-y-3 text-[15px] leading-relaxed">
        {points.map((p) => (
          <li key={p} className="flex gap-3">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />
            {p}
          </li>
        ))}
      </ul>

      <section className="card mt-12 p-6" aria-labelledby="optout-h">
        <h2 id="optout-h" className="text-[17px] font-medium">
          {t('privacy.optTitle')}
        </h2>
        <p className="mt-1 text-[14px] text-ink-2">{t('privacy.optSub')}</p>
        {out.isSuccess ? (
          <p className="mt-5 rounded-xl bg-ok-soft px-4 py-3 text-[14px] text-ok" role="status">
            {t('privacy.done')}
          </p>
        ) : (
          <form
            className="mt-5 flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              if (phoneOk(phone)) out.mutate()
            }}
          >
            <label className="sr-only" htmlFor="optout-phone">
              {t('contact.phone')}
            </label>
            <input id="optout-phone" className="field" inputMode="tel" placeholder="98390 12345" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button className="btn-primary shrink-0" disabled={!phoneOk(phone) || out.isPending}>
              {t('privacy.optButton')}
            </button>
          </form>
        )}
        {out.error && <p className="mt-3 text-[14px] text-bad">{out.error.message}</p>}
      </section>
    </div>
  )
}
