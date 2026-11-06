import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { api } from '../lib/api'
import { dateShort, priceDetail, rupees } from '../lib/format'
import type { Accessory, Price, Variant } from '../lib/types'
import { ErrorState } from './States'

type Props = {
  slug: string
  variant: Variant
  city: string
  cities: string[]
  accIds: number[] | null // null means "whatever the defaults are"
  onCity: (c: string) => void
  onAcc: (ids: number[]) => void
}

export function usePrice(variantId: number, city: string, accIds: number[] | null) {
  const acc = accIds === null ? '' : `&acc=${accIds.join(',')}`
  return useQuery({
    queryKey: ['price', variantId, city, accIds],
    queryFn: () => api.get<Price>(`/price?variant_id=${variantId}&city=${encodeURIComponent(city)}${acc}`),
    // keep the old numbers on screen while the new ones load, no flicker
    placeholderData: keepPreviousData,
    enabled: variantId > 0,
  })
}

export default function PriceCard({ slug, variant, city, cities, accIds, onCity, onAcc }: Props) {
  const { t, i18n } = useTranslation()
  const price = usePrice(variant.id, city, accIds)
  const packs = useQuery({
    queryKey: ['accessories', variant.id],
    queryFn: () => api.get<Accessory[]>(`/accessories?variant_id=${variant.id}`),
  })
  const chosen = accIds ?? price.data?.accessory_ids ?? []
  const p = price.data

  const toggle = (id: number) => onAcc(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id])
  const label = (key: string, fallback: string) => (key.startsWith('acc_') ? fallback : t(`price.lines.${key}`, fallback))

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="price-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="price-h" className="text-[15px] font-medium">
          {t('price.title')}
        </h2>
        <label className="sr-only" htmlFor="city">
          {t('price.city')}
        </label>
        <select id="city" value={city} onChange={(e) => onCity(e.target.value)} className="field h-9 w-auto rounded-full pr-8 text-[14px]">
          {cities.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      {price.isLoading ? (
        <div className="mt-6 space-y-3" aria-busy="true">
          <div className="skeleton h-9 w-2/3" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-4" />
          ))}
        </div>
      ) : price.error ? (
        <div className="mt-6">
          <ErrorState message={price.error.message} onRetry={() => price.refetch()} />
        </div>
      ) : p && !p.available ? (
        // a missing rule means we don't show a number at all
        <div className="mt-6">
          <p className="text-[26px] font-semibold tracking-tight">{t('price.onRequest')}</p>
          <p className="mt-2 text-[14px] text-ink-2">{t('price.onRequestWhy', { city })}</p>
        </div>
      ) : p ? (
        <div className={price.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <p className="mt-5 text-[13px] text-ink-3">
            {t('price.onRoadIn', { city: p.city })} · {variant.name}
          </p>
          <p className="mt-1 text-[34px] leading-none font-semibold tracking-tight tabular-nums">{rupees(p.total!)}</p>

          <dl className="mt-6 divide-y divide-line border-y border-line text-[14px]">
            {p.lines.map((l) => (
              <div key={l.key} className="flex items-start justify-between gap-4 py-2.5">
                <dt>
                  <span className={l.key === 'ex_showroom' ? 'font-medium' : ''}>{label(l.key, l.label)}</span>
                  {l.key !== 'ex_showroom' && priceDetail(l.key, l.detail, i18n.language) && (
                    <span className="block text-[12px] text-ink-3">{priceDetail(l.key, l.detail, i18n.language)}</span>
                  )}
                </dt>
                <dd className="shrink-0 tabular-nums">{rupees(l.amount)}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
            {t('price.validUntil', { date: dateShort(p.valid_until!, i18n.language) })} {t('price.note')}
          </p>
        </div>
      ) : null}

      {packs.data && packs.data.length > 0 && p?.available && (
        <fieldset className="mt-6">
          <legend className="text-[13px] font-medium text-ink-2">{t('price.accessories')}</legend>
          <div className="mt-2 space-y-1">
            {packs.data.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 text-[14px] hover:bg-mist">
                <input type="checkbox" checked={chosen.includes(a.id)} onChange={() => toggle(a.id)} className="size-4 accent-[var(--color-ink)]" />
                <span className="flex-1">{a.name}</span>
                <span className="text-ink-3 tabular-nums">{rupees(a.price)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-6 grid gap-2">
        <Link to={`/test-drive?model=${slug}&variant=${variant.id}`} className="btn-accent w-full">
          {t('cars.bookTestDrive')}
        </Link>
      </div>
    </section>
  )
}
