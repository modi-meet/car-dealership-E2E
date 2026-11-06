import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { api } from '../lib/api'
import { lakh } from '../lib/format'
import type { ModelCard } from '../lib/types'
import CarImage from './CarImage'
import { EmptyState, ErrorState } from './States'

export function useModels() {
  return useQuery({ queryKey: ['models'], queryFn: () => api.get<ModelCard[]>('/models') })
}

function Card({ m }: { m: ModelCard }) {
  const { t, i18n } = useTranslation()
  return (
    <Link to={`/cars/${m.slug}`} className="group block">
      <div className="overflow-hidden rounded-[var(--radius-card)] bg-mist">
        <CarImage
          src={m.hero_image}
          alt={`${m.name} ${m.body_type}`}
          sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
          className="aspect-[16/10] w-full transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <h3 className="text-[19px] font-semibold tracking-tight">{m.name}</h3>
        <span className="text-[13px] text-ink-3">{m.body_type}</span>
      </div>
      <p className="mt-1 line-clamp-1 text-[14px] text-ink-2">{i18n.language === 'hi' ? m.tagline_hi : m.tagline_en}</p>
      <p className="mt-3 text-[14px]">
        {m.from_on_road ? (
          <>
            <span className="text-ink-3">{t('cars.fromOnRoad')} </span>
            <span className="font-medium">₹{lakh(m.from_on_road, i18n.language)}</span>
          </>
        ) : (
          <span className="text-ink-3">{t('price.onRequest')}</span>
        )}
      </p>
    </Link>
  )
}

export default function ModelGrid() {
  const { t } = useTranslation()
  const { data, isLoading, error, refetch } = useModels()

  if (isLoading) {
    return (
      <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[16/10] w-full rounded-[var(--radius-card)]" />
            <div className="skeleton mt-4 h-5 w-1/2" />
            <div className="skeleton mt-2 h-4 w-3/4" />
          </div>
        ))}
      </div>
    )
  }
  if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />
  if (!data?.length) return <EmptyState title={t('cars.none')} />

  return (
    <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((m) => (
        <Card key={m.slug} m={m} />
      ))}
    </div>
  )
}
