import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

// day 1 hero only, model grid + used strip land with the cars api
export default function Home() {
  const { t } = useTranslation()
  return (
    <section className="wrap pt-16 pb-10 sm:pt-24">
      <p className="eyebrow">{t('home.eyebrow')}</p>
      <h1 className="mt-4 max-w-3xl text-[40px] leading-[1.08] font-semibold tracking-tight sm:text-[56px]">{t('home.title')}</h1>
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
  )
}
