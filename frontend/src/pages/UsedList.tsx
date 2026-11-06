import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useSearchParams } from 'react-router'
import CarImage from '../components/CarImage'
import TradeInForm from '../components/TradeInForm'
import { EmptyState, ErrorState } from '../components/States'
import { api } from '../lib/api'
import { km, lakh, ownerLabel } from '../lib/format'
import type { UsedCard } from '../lib/types'
import { usePageTitle } from '../lib/usePageTitle'

const FILTERS = {
  fuel: ['petrol', 'diesel', 'cng', 'electric'],
  body: ['SUV', 'Sedan', 'Compact sedan', 'Hatchback', 'MPV', 'Electric SUV'],
  transmission: ['manual', 'automatic'],
  max_price: ['500000', '800000', '1000000', '1500000'],
  sort: ['newest', 'price_asc', 'price_desc', 'km_asc'],
} as const

type Key = keyof typeof FILTERS

function Pill({ k, value, onChange }: { k: Key; value: string; onChange: (v: string) => void }) {
  // sort always has a value, so only real filters get the filled look
  const active = k !== 'sort' && !!value
  const { t, i18n } = useTranslation()
  const label = (o: string) => (k === 'max_price' ? t('used.under', { amount: lakh(Number(o), i18n.language) }) : t(`used.opt.${o}`, o))
  return (
    <label className="relative shrink-0">
      <span className="sr-only">{t(`used.f.${k}`)}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-10 appearance-none rounded-full border pr-8 pl-4 text-[14px] ${active ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink hover:border-ink-3'}`}
      >
        {k !== 'sort' && <option value="">{t(`used.f.${k}`)}</option>}
        {FILTERS[k].map((o) => (
          <option key={o} value={o}>
            {label(o)}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2" width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M1 1l4 4 4-4" className={active ? 'text-paper' : ''} />
      </svg>
    </label>
  )
}

export function UsedTile({ c }: { c: UsedCard }) {
  const { t, i18n } = useTranslation()
  return (
    <Link to={`/used/${c.stock_id}`} className="group block">
      <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-mist">
        <CarImage
          src={c.photo}
          alt={`${c.year} ${c.model_name} ${c.variant}`}
          sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
          className="aspect-[16/10] w-full transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {c.status === 'booked' && (
          <span className="absolute top-3 left-3 rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-paper">{t('used.booked')}</span>
        )}
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-semibold tracking-tight">
          {c.year} {c.model_name} {c.variant}
        </h3>
        <span className="shrink-0 text-[17px] font-semibold">₹{lakh(c.price, i18n.language)}</span>
      </div>
      <p className="mt-1 text-[14px] text-ink-2">
        {km(c.km, i18n.language)} · {t(`used.opt.${c.fuel}`)} · {c.transmission === 'Manual' ? t('used.opt.manual') : t('used.opt.automatic')} ·{' '}
        {ownerLabel(c.owners, i18n.language)}
      </p>
      <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-ok">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M3 8.5l3 3 7-7" />
        </svg>
        {t('used.inspected', { score: c.inspection_score })}
      </p>
    </Link>
  )
}

export default function UsedList() {
  const { t } = useTranslation()
  usePageTitle(t('used.title'))
  const [params, setParams] = useSearchParams()
  const qs = params.toString()

  const q = useQuery({
    queryKey: ['used', qs],
    queryFn: () => api.get<UsedCard[]>(`/used${qs ? `?${qs}` : ''}`),
    placeholderData: keepPreviousData,
  })

  // the form sits below the grid, so jump to it once the cars are in
  const { hash } = useLocation()
  const ready = !!q.data
  useEffect(() => {
    if (hash === '#trade-in' && ready) document.getElementById('trade-in')?.scrollIntoView()
  }, [hash, ready])

  const set = (k: Key, v: string) =>
    setParams(
      (p) => {
        if (v) p.set(k, v)
        else p.delete(k)
        return p
      },
      { replace: true, preventScrollReset: true },
    )
  const anyFilter = (['fuel', 'body', 'transmission', 'max_price'] as Key[]).some((k) => params.get(k))

  return (
    <div className="wrap pt-14 sm:pt-20">
      <h1 className="text-[34px] font-semibold tracking-tight sm:text-[44px]">{t('used.title')}</h1>
      <p className="mt-3 max-w-2xl text-[16px] text-ink-2">{t('used.sub')}</p>

      <div className="sticky top-16 z-10 -mx-4 mt-10 bg-paper/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
          {(['fuel', 'body', 'transmission', 'max_price'] as Key[]).map((k) => (
            <Pill key={k} k={k} value={params.get(k) ?? ''} onChange={(v) => set(k, v)} />
          ))}
          {anyFilter && (
            <button className="shrink-0 px-3 text-[14px] text-ink-2 hover:text-ink" onClick={() => setParams({}, { replace: true })}>
              {t('used.clear')}
            </button>
          )}
          <div className="ml-auto shrink-0">
            <Pill k="sort" value={params.get('sort') ?? 'newest'} onChange={(v) => set('sort', v === 'newest' ? '' : v)} />
          </div>
        </div>
      </div>

      <div className="mt-6">
        {q.isLoading ? (
          <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="skeleton aspect-[16/10] w-full rounded-[var(--radius-card)]" />
                <div className="skeleton mt-4 h-5 w-2/3" />
                <div className="skeleton mt-2 h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : q.error ? (
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState
            title={t('used.noneTitle')}
            body={t('used.noneBody')}
            action={
              <button className="btn-quiet" onClick={() => setParams({}, { replace: true })}>
                {t('used.clear')}
              </button>
            }
          />
        ) : (
          <>
            <p className="mb-6 text-[14px] text-ink-3">{t('used.count', { count: q.data.length })}</p>
            <div className={`grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 ${q.isFetching ? 'opacity-60' : ''} transition-opacity`}>
              {q.data.map((c) => (
                <UsedTile key={c.stock_id} c={c} />
              ))}
            </div>
          </>
        )}
      </div>

      <div id="trade-in" className="mt-24 max-w-3xl scroll-mt-24">
        <TradeInForm />
      </div>
    </div>
  )
}
