import { useSearchParams } from 'react-router'
import { usePageTitle } from '../../lib/usePageTitle'
import CarsTab from './CarsTab'
import PricesTab from './PricesTab'
import TeamTab from './TeamTab'
import UsedTab from './UsedTab'

const TABS = [
  { key: 'prices', label: 'Prices', el: <PricesTab /> },
  { key: 'cars', label: 'Cars', el: <CarsTab /> },
  { key: 'used', label: 'Used stock', el: <UsedTab /> },
  { key: 'team', label: 'Team', el: <TeamTab /> },
] as const

export default function Admin() {
  usePageTitle('Admin')
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.key === params.get('tab')) ?? TABS[0]

  return (
    <div className="wrap pt-10">
      <p className="eyebrow">Admin</p>
      <h1 className="mt-1 text-[30px] font-semibold tracking-tight">Showroom settings</h1>
      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab.key === t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[14px] ${tab.key === t.key ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-8">{tab.el}</div>
    </div>
  )
}
