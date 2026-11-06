import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loanSummary } from '../lib/emi'
import { lakh, rupees } from '../lib/format'

const TENURES = [36, 48, 60, 84]
// indicative car-loan rate, the bank sets the real one
const DEFAULT_RATE = 9

export default function EmiCalculator({ price }: { price: number }) {
  const { t, i18n } = useTranslation()
  const [downPct, setDownPct] = useState(20)
  const [rate, setRate] = useState(String(DEFAULT_RATE))
  const [months, setMonths] = useState(60)

  const down = Math.round((price * downPct) / 100)
  const r = Math.min(30, Math.max(0, Number(rate) || 0))
  const s = loanSummary(price, down, r, months)

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="emi-h">
      <h2 id="emi-h" className="text-[15px] font-medium">
        {t('emi.title')}
      </h2>
      <p className="mt-4 text-[13px] text-ink-3">{t('emi.monthly')}</p>
      <p className="mt-1 text-[30px] leading-none font-semibold tracking-tight tabular-nums">
        {rupees(s.monthly)}
        <span className="text-[15px] font-normal text-ink-3"> /{t('emi.mo')}</span>
      </p>

      <div className="mt-6 space-y-5">
        <label className="block">
          <span className="flex justify-between text-[13px]">
            <span className="text-ink-2">{t('emi.down')}</span>
            <span className="tabular-nums">
              {rupees(down)} · {downPct}%
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={90}
            step={5}
            value={downPct}
            onChange={(e) => setDownPct(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--color-ink)]"
            aria-valuetext={`${downPct}% down, ${rupees(down)}`}
          />
        </label>

        <fieldset>
          <legend className="text-[13px] text-ink-2">{t('emi.tenure')}</legend>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {TENURES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={months === m}
                onClick={() => setMonths(m)}
                className={`h-9 rounded-lg border text-[13px] ${months === m ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink-3'}`}
              >
                {m / 12} {t('emi.yrs')}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-ink-2">{t('emi.rate')}</span>
          <span className="flex items-center gap-1">
            <input
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))}
              className="field h-9 w-20 text-right"
              aria-label={t('emi.rate')}
            />
            <span className="text-ink-3">%</span>
          </span>
        </label>
      </div>

      <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-ink-3">{t('emi.loan')}</dt>
          <dd className="tabular-nums">₹{lakh(s.loan, i18n.language)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-3">{t('emi.interest')}</dt>
          <dd className="tabular-nums">₹{lakh(s.interest, i18n.language)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[12px] text-ink-3">{t('emi.note')}</p>
    </section>
  )
}
