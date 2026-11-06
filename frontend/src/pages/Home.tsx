import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import CarImage from '../components/CarImage'
import ModelGrid from '../components/ModelGrid'
import { usePageTitle } from '../lib/usePageTitle'

export default function Home() {
  const { t } = useTranslation()
  usePageTitle(null)

  return (
    <>
      <section className="wrap pt-14 sm:pt-20">
        <p className="eyebrow">{t('home.eyebrow')}</p>
        <h1 className="mt-4 max-w-3xl text-[38px] leading-[1.08] font-semibold tracking-tight sm:text-[56px]">{t('home.title')}</h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-2">{t('home.sub')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/cars" className="btn-primary">
            {t('home.browse')}
          </Link>
          <Link to="/used" className="btn-quiet">
            {t('home.used')}
          </Link>
        </div>
      </section>

      {/* one big car, the showroom moment */}
      <section className="wrap mt-12">
        <Link to="/cars/model-h" className="group relative block overflow-hidden rounded-[20px] bg-mist">
          <CarImage src="/media/model-h/hero.jpg" alt="Model H SUV in deep ocean blue" priority className="aspect-[16/9] w-full sm:aspect-[21/9]" />
          <div className="absolute bottom-0 left-0 p-5 sm:p-8">
            <p className="text-[13px] text-ink-2">{t('home.featured')}</p>
            <p className="mt-1 text-[22px] font-semibold tracking-tight sm:text-[28px]">Model H</p>
            <p className="mt-1 text-[14px] text-ink-2 group-hover:text-ink">{t('home.seePrice')} →</p>
          </div>
        </Link>
      </section>

      <section className="wrap mt-24">
        <div className="mb-8 flex items-end justify-between gap-4">
          <h2 className="text-[26px] font-semibold tracking-tight sm:text-[32px]">{t('home.lineup')}</h2>
          <Link to="/cars" className="text-[14px] text-ink-2 hover:text-ink">
            {t('home.all')} →
          </Link>
        </div>
        <ModelGrid />
      </section>

      <section className="wrap mt-24">
        <div className="grid gap-6 rounded-[20px] bg-mist p-8 sm:grid-cols-[1fr_auto] sm:items-center sm:p-12">
          <div>
            <h2 className="text-[24px] font-semibold tracking-tight">{t('home.usedTitle')}</h2>
            <p className="mt-2 max-w-xl text-[15px] text-ink-2">{t('home.usedSub')}</p>
          </div>
          <Link to="/used" className="btn-primary justify-self-start">
            {t('home.used')}
          </Link>
        </div>
      </section>
    </>
  )
}
