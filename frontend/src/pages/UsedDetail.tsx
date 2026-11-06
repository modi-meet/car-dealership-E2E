import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import CarImage from '../components/CarImage'
import EnquiryForm from '../components/EnquiryForm'
import { ErrorState, NotFound } from '../components/States'
import { api, ApiError } from '../lib/api'
import { dateShort, km, lakh, ordinal, rupees } from '../lib/format'
import type { UsedDetail as Detail } from '../lib/types'
import { usePageTitle } from '../lib/usePageTitle'

export default function UsedDetail() {
  const { stockId = '' } = useParams()
  const { t, i18n } = useTranslation()
  const [photo, setPhoto] = useState(0)
  const q = useQuery({ queryKey: ['used-car', stockId], queryFn: () => api.get<Detail>(`/used/${stockId}`) })
  const c = q.data
  usePageTitle(c ? `${c.year} ${c.model_name} ${c.variant}, used` : null)

  if (q.error instanceof ApiError && q.error.status === 404) return <NotFound />
  if (q.error) return <div className="wrap py-24"><ErrorState message={q.error.message} onRetry={() => q.refetch()} /></div>
  if (!c) {
    return (
      <div className="wrap pt-10" aria-busy="true">
        <div className="skeleton h-10 w-72" />
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
          <div className="skeleton aspect-[16/10] rounded-[20px]" />
          <div className="skeleton h-80 rounded-[var(--radius-card)]" />
        </div>
      </div>
    )
  }

  const facts = [
    [t('used.fact.year'), c.year],
    [t('used.fact.km'), km(c.km)],
    [t('used.fact.owners'), t('used.owner', { n: ordinal(c.owners) })],
    [t('used.fact.fuel'), t(`used.opt.${c.fuel}`)],
    [t('used.fact.gearbox'), c.transmission],
    [t('used.fact.colour'), c.colour],
    [t('used.fact.reg'), <span key="reg" className="font-mono text-[14px]">{c.reg_masked}</span>],
    [t('used.fact.at'), c.showroom ?? c.city],
  ] as const
  const flagged = c.inspection.checks.filter((x) => x.status !== 'ok').length

  return (
    <div className="wrap pt-8 pb-24 sm:pt-10 lg:pb-0">
      <Link to="/used" className="text-[14px] text-ink-3 hover:text-ink">
        ← {t('used.title')}
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="eyebrow">
          {t('used.certified')} · {c.stock_id}
        </p>
        {c.status === 'booked' && <span className="rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-medium text-paper">{t('used.booked')}</span>}
      </div>
      <h1 className="mt-2 text-[32px] leading-tight font-semibold tracking-tight sm:text-[44px]">
        {c.year} {c.model_name} {c.variant}
      </h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
        <div className="space-y-12">
          <div>
            <div className="overflow-hidden rounded-[20px] bg-mist">
              <CarImage src={c.photos[photo]} alt={`${c.model_name}, photo ${photo + 1}`} priority className="aspect-[16/10] w-full" sizes="(min-width: 1024px) 720px, 100vw" />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {c.photos.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setPhoto(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-current={i === photo}
                  className={`shrink-0 overflow-hidden rounded-lg border-2 ${i === photo ? 'border-ink' : 'border-transparent opacity-70 hover:opacity-100'}`}
                >
                  <CarImage src={src} alt="" sizes="96px" priority className="aspect-[16/10] w-24" />
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-ink-3">{t('used.photoNote')}</p>
          </div>

          <section>
            <h2 className="text-[15px] font-medium">{t('used.facts')}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-4">
              {facts.map(([k, v]) => (
                <div key={k} className="bg-paper p-4">
                  <dt className="text-[12px] text-ink-3">{k}</dt>
                  <dd className="mt-1 text-[15px] font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-medium">{t('used.report')}</h2>
                <p className="mt-1 text-[13px] text-ink-3">{t('used.inspectedOn', { date: dateShort(c.inspection.inspected_on, i18n.language) })}</p>
              </div>
              <p className="text-right">
                <span className="text-[28px] font-semibold tracking-tight">{c.inspection.score}</span>
                <span className="text-[15px] text-ink-3">/100</span>
              </p>
            </div>
            <ul className="mt-4 divide-y divide-line rounded-[var(--radius-card)] border border-line">
              {c.inspection.checks.map((x) => (
                <li key={x.item} className="flex items-start justify-between gap-4 px-4 py-3 text-[14px]">
                  <span>
                    {x.item}
                    {x.note && <span className="block text-[13px] text-ink-3">{x.note}</span>}
                  </span>
                  {x.status === 'ok' ? (
                    <span className="shrink-0 rounded-full bg-ok-soft px-2.5 py-0.5 text-[12px] font-medium text-ok">{t('used.ok')}</span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-warn-soft px-2.5 py-0.5 text-[12px] font-medium text-warn">{t('used.attention')}</span>
                  )}
                </li>
              ))}
            </ul>
            {flagged > 0 && <p className="mt-3 text-[13px] text-ink-3">{t('used.flaggedNote', { count: flagged })}</p>}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5 sm:p-6">
            <p className="text-[13px] text-ink-3">{t('used.price')}</p>
            <p className="mt-1 text-[34px] leading-none font-semibold tracking-tight tabular-nums">{rupees(c.price)}</p>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-3">{t('used.priceNote')}</p>
            {c.status === 'booked' && <p className="mt-4 rounded-xl bg-mist px-3.5 py-2.5 text-[14px] text-ink-2">{t('used.bookedNote')}</p>}
          </div>
          <div id="enquire">
            <EnquiryForm title={c.status === 'booked' ? t('used.notifyMe') : t('used.enquire')} usedStockId={c.stock_id} />
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur lg:hidden">
        <div className="wrap flex h-[72px] items-center justify-between gap-4">
          <div>
            <p className="text-[12px] text-ink-3">
              {c.year} {c.model_name} {c.variant}
            </p>
            <p className="text-[18px] font-semibold">₹{lakh(c.price)}</p>
          </div>
          <a href="#enquire" className="btn-accent">
            {t('used.enquireShort')}
          </a>
        </div>
      </div>
    </div>
  )
}
