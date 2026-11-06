import { useTranslation } from 'react-i18next'
import ModelGrid from '../components/ModelGrid'
import { usePageTitle } from '../lib/usePageTitle'

export default function Cars() {
  const { t } = useTranslation()
  usePageTitle(t('nav.newCars'))
  return (
    <div className="wrap pt-14 sm:pt-20">
      <h1 className="text-[34px] font-semibold tracking-tight sm:text-[44px]">{t('cars.title')}</h1>
      <p className="mt-3 max-w-2xl text-[16px] text-ink-2">{t('cars.sub')}</p>
      <div className="mt-12">
        <ModelGrid />
      </div>
    </div>
  )
}
