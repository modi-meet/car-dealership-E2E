import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import CarImage from '../components/CarImage'
import EnquiryForm from '../components/EnquiryForm'
import PriceCard, { usePrice } from '../components/PriceCard'
import { ErrorState, NotFound } from '../components/States'
import { api, ApiError } from '../lib/api'
import { lakh, rupees } from '../lib/format'
import type { ModelDetail, Variant } from '../lib/types'
import { usePageTitle } from '../lib/usePageTitle'

const SPEC_ORDER = ['engine', 'battery', 'power', 'mileage', 'range', 'seats', 'boot', 'safety']

function Gallery({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState(0)
  return (
    <div>
      <div className="overflow-hidden rounded-[20px] bg-mist">
        <CarImage src={images[i]} alt={`${name}, photo ${i + 1} of ${images.length}`} priority={i === 0} className="aspect-[16/10] w-full" sizes="(min-width: 1024px) 720px, 100vw" />
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {images.map((src, idx) => (
          <button
            key={src}
            onClick={() => setI(idx)}
            aria-label={`Show photo ${idx + 1}`}
            aria-current={idx === i}
            className={`shrink-0 overflow-hidden rounded-lg border-2 ${idx === i ? 'border-ink' : 'border-transparent opacity-70 hover:opacity-100'}`}
          >
            <CarImage src={src} alt="" sizes="96px" priority className="aspect-[16/10] w-24" />
          </button>
        ))}
      </div>
    </div>
  )
}

function VariantPicker({ variants, value, onChange }: { variants: Variant[]; value: Variant; onChange: (v: Variant) => void }) {
  const { t } = useTranslation()
  return (
    <fieldset>
      <legend className="text-[15px] font-medium">{t('cars.variant')}</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {variants.map((v) => {
          const on = v.id === value.id
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={on}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${on ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink-3'}`}
            >
              <span className="block text-[15px] font-medium">{v.name}</span>
              <span className="block text-[13px] text-ink-2">
                {t(`used.opt.${v.fuel}`, v.fuel)} · {v.transmission}
              </span>
              <span className="mt-1 block text-[13px] text-ink-3">
                {t('cars.exShowroom')} ₹{lakh(v.ex_showroom)}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export default function ModelPage() {
  const { slug = '' } = useParams()
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()

  const model = useQuery({ queryKey: ['model', slug], queryFn: () => api.get<ModelDetail>(`/models/${slug}`) })
  const cities = useQuery({ queryKey: ['cities'], queryFn: () => api.get<string[]>('/cities') })
  usePageTitle(model.data ? `${model.data.name} on-road price` : null)

  // variant + city live in the url so a consultant can share the exact quote
  const m = model.data
  const variant = m?.variants.find((v) => String(v.id) === params.get('variant')) ?? m?.variants[0]
  const city = params.get('city') ?? 'Lucknow'
  const accRaw = params.get('acc')
  const accIds = accRaw === null ? null : accRaw.split(',').filter(Boolean).map(Number)
  const set = (k: string, v: string) =>
    setParams(
      (p) => {
        p.set(k, v)
        return p
      },
      { replace: true, preventScrollReset: true },
    )

  // same query the card uses, so this is free from cache
  const sticky = usePrice(variant?.id ?? 0, city, accIds)

  if (model.error instanceof ApiError && model.error.status === 404) return <NotFound />
  if (model.error) return <div className="wrap py-24"><ErrorState message={model.error.message} onRetry={() => model.refetch()} /></div>
  if (!m || !variant) {
    return (
      <div className="wrap pt-10" aria-busy="true">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton mt-4 h-10 w-64" />
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
          <div className="skeleton aspect-[16/10] w-full rounded-[20px]" />
          <div className="skeleton h-96 rounded-[var(--radius-card)]" />
        </div>
      </div>
    )
  }

  const hi = i18n.language === 'hi'
  const specs = SPEC_ORDER.filter((k) => variant.specs[k] !== undefined)

  return (
    <div className="pb-24 lg:pb-0">
      <div className="wrap pt-8 sm:pt-10">
        <Link to="/cars" className="text-[14px] text-ink-3 hover:text-ink">
          ← {t('nav.newCars')}
        </Link>
        <div className="mt-4">
          <p className="eyebrow">{m.body_type}</p>
          <h1 className="mt-2 text-[36px] leading-tight font-semibold tracking-tight sm:text-[48px]">{m.name}</h1>
          <p className="mt-2 text-[17px] text-ink-2">{hi ? m.tagline_hi : m.tagline_en}</p>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
          <div className="space-y-12">
            <Gallery images={m.gallery} name={m.name} />

            <VariantPicker variants={m.variants} value={variant} onChange={(v) => set('variant', String(v.id))} />

            <section>
              <h2 className="text-[15px] font-medium">{t('cars.colours')}</h2>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
                {variant.colours.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 text-[14px] text-ink-2">
                    <span className="size-5 rounded-full border border-line" style={{ background: c.hex }} aria-hidden />
                    {c.name}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-[15px] font-medium">{t('cars.specs')}</h2>
              <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-3">
                {specs.map((k) => (
                  <div key={k} className="bg-paper p-4">
                    <dt className="text-[12px] text-ink-3">{t(`cars.spec.${k}`, k)}</dt>
                    <dd className="mt-1 text-[15px] font-medium">{String(variant.specs[k])}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="max-w-2xl">
              <h2 className="text-[15px] font-medium">{t('cars.about', { name: m.name })}</h2>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{hi ? m.description_hi : m.description_en}</p>
            </section>

            <div className="max-w-2xl">
              <EnquiryForm title={t('cars.question', { name: m.name })} modelSlug={m.slug} variantId={variant.id} />
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <PriceCard
              slug={m.slug}
              variant={variant}
              city={city}
              cities={cities.data ?? [city]}
              accIds={accIds}
              onCity={(c) => set('city', c)}
              onAcc={(ids) => set('acc', ids.join(','))}
            />
          </aside>
        </div>
      </div>

      {/* phones: price + next step always in reach */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur lg:hidden">
        <div className="wrap flex h-[72px] items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-[12px] text-ink-3">
              {m.name} {variant.name} · {city}
            </p>
            <p className="text-[18px] font-semibold tabular-nums">
              {sticky.data?.available && sticky.data.total ? rupees(sticky.data.total) : t('price.onRequest')}
            </p>
          </div>
          <Link to={`/test-drive?model=${m.slug}&variant=${variant.id}`} className="btn-accent shrink-0">
            {t('cars.testDriveShort')}
          </Link>
        </div>
      </div>
    </div>
  )
}
