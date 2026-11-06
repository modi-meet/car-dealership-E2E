import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import CarImage from '../components/CarImage'
import ContactFields, { contactReady, emptyContact } from '../components/ContactFields'
import { ErrorState } from '../components/States'
import { api, ApiError } from '../lib/api'
import { dayLabel, istDay, slotLabel } from '../lib/format'
import type { Booking, DemoCar, Slot } from '../lib/types'
import { usePageTitle } from '../lib/usePageTitle'

const DAYS = 7

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-8">
      <h2 className="flex items-center gap-3 text-[17px] font-medium">
        <span className={`grid size-7 place-items-center rounded-full text-[13px] ${done ? 'bg-ink text-paper' : 'border border-line text-ink-2'}`}>{n}</span>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  )
}

// a tiny .ics so the slot lands in their calendar, made in the browser
function icsHref(b: Booking) {
  const start = `${b.day.replaceAll('-', '')}T${b.slot.replace(':', '')}00`
  const [h, m] = b.slot.split(':').map(Number)
  const end = `${b.day.replaceAll('-', '')}T${String(h).padStart(2, '0')}${String(m + 45).padStart(2, '0')}00`
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Company A//Test drive//EN', 'BEGIN:VEVENT',
    `UID:${b.ref}@companya.demo`, `DTSTART;TZID=Asia/Kolkata:${start}`, `DTEND;TZID=Asia/Kolkata:${end}`,
    `SUMMARY:Test drive · ${b.model} ${b.variant}`, `LOCATION:${b.showroom}, ${b.address}`, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`
}

function Confirmed({ b }: { b: Booking }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="wrap max-w-2xl pt-16 pb-10 sm:pt-24" role="status">
      <div className="grid size-12 place-items-center rounded-full bg-ok-soft text-ok">
        <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M3 8.5l3 3 7-7" />
        </svg>
      </div>
      <h1 className="mt-6 text-[32px] font-semibold tracking-tight">{t('td.confirmed')}</h1>
      <p className="mt-2 text-[16px] text-ink-2">{b.consultant ? t('td.consultant', { name: b.consultant }) : t('td.team')}</p>

      <dl className="card mt-8 divide-y divide-line text-[15px]">
        {[
          [t('td.car'), `${b.model} ${b.variant}`],
          [t('td.when'), `${dayLabel(b.day, i18n.language)} · ${slotLabel(b.slot)}`],
          [t('td.where'), `${b.showroom}, ${b.address}`],
          [t('td.ref'), b.ref],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-4 px-5 py-3.5">
            <dt className="w-24 shrink-0 text-ink-3">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[13px] text-ink-3">{t('td.bring', { phone: b.phone })}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href={icsHref(b)} download={`${b.ref}.ics`} className="btn-primary">
          {t('td.calendar')}
        </a>
        <Link to="/cars" className="btn-quiet">
          {t('td.keepBrowsing')}
        </Link>
      </div>
    </div>
  )
}

export default function TestDrive() {
  const { t, i18n } = useTranslation()
  usePageTitle(t('td.title'))
  const [params] = useSearchParams()
  const qc = useQueryClient()

  const demos = useQuery({ queryKey: ['demo-cars'], queryFn: () => api.get<DemoCar[]>('/demo-cars') })
  const models = useMemo(() => [...new Map((demos.data ?? []).map((d) => [d.model_slug, d])).values()], [demos.data])

  const [model, setModel] = useState(params.get('model') ?? '')
  const [picked, setPicked] = useState<number | null>(null)
  const [day, setDay] = useState(istDay())
  const [slot, setSlot] = useState<string | null>(null)
  const [contact, setContact] = useState(emptyContact)
  const [tried, setTried] = useState(false)

  const atShowrooms = (demos.data ?? []).filter((d) => d.model_slug === model)
  // one showroom for this model? that's the pick, no click needed
  const demoId = atShowrooms.length === 1 ? atShowrooms[0].id : (atShowrooms.find((d) => d.id === picked)?.id ?? null)
  const setDemoId = (id: number) => {
    setPicked(id)
    setSlot(null)
  }

  const slots = useQuery({
    queryKey: ['slots', demoId, day],
    queryFn: () => api.get<Slot[]>(`/slots?demo_car_id=${demoId}&day=${day}`),
    enabled: demoId !== null,
  })

  const book = useMutation({
    mutationFn: () => api.post<Booking>('/test-drives', { ...contact, lang: i18n.language, demo_car_id: demoId, day, slot }),
    onSuccess: () => window.scrollTo({ top: 0 }),
    onError: (e) => {
      // someone beat them to it, show the fresh grid
      if (e instanceof ApiError && e.status === 409) {
        setSlot(null)
        qc.invalidateQueries({ queryKey: ['slots', demoId, day] })
      }
    },
  })

  if (book.data) return <Confirmed b={book.data} />

  const chosen = atShowrooms.find((d) => d.id === demoId)
  const days = Array.from({ length: DAYS }, (_, i) => istDay(i))
  const freeToday = slots.data?.some((s) => s.free)

  return (
    <div className="wrap max-w-3xl pt-14 sm:pt-20">
      <h1 className="text-[34px] font-semibold tracking-tight sm:text-[44px]">{t('td.title')}</h1>
      <p className="mt-3 max-w-xl text-[16px] text-ink-2">{t('td.sub')}</p>

      <div className="mt-12 space-y-10">
        <Step n={1} title={t('td.pickCar')} done={!!demoId}>
          {demos.isLoading ? (
            <div className="flex gap-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-10 w-28 rounded-full" />)}</div>
          ) : demos.error ? (
            <ErrorState message={demos.error.message} onRetry={() => demos.refetch()} />
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('td.pickCar')}>
                {models.map((m) => (
                  <button
                    key={m.model_slug}
                    role="radio"
                    aria-checked={model === m.model_slug}
                    onClick={() => {
                      setModel(m.model_slug)
                      setSlot(null)
                    }}
                    className={`h-10 rounded-full border px-4 text-[14px] ${model === m.model_slug ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink-3'}`}
                  >
                    {m.model}
                  </button>
                ))}
              </div>
              {model && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {atShowrooms.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDemoId(d.id)}
                      aria-pressed={demoId === d.id}
                      className={`flex items-center gap-4 rounded-xl border p-3 text-left ${demoId === d.id ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink-3'}`}
                    >
                      <CarImage src={d.hero_image} alt="" sizes="96px" className="aspect-[16/10] w-24 shrink-0 rounded-lg" />
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium">{d.locality}</span>
                        <span className="block truncate text-[13px] text-ink-2">
                          {d.variant} · {t(`used.opt.${d.fuel}`, d.fuel)}
                        </span>
                        <span className="block text-[12px] text-ink-3">{d.colour}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </Step>

        {chosen && (
          <Step n={2} title={t('td.pickTime')} done={!!slot}>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
              {days.map((d, i) => (
                <button
                  key={d}
                  onClick={() => {
                    setDay(d)
                    setSlot(null)
                  }}
                  aria-pressed={day === d}
                  className={`h-14 min-w-[76px] shrink-0 rounded-xl border px-3 text-[13px] leading-tight ${day === d ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink-3'}`}
                >
                  {i === 0 ? t('td.today') : i === 1 ? t('td.tomorrow') : dayLabel(d, i18n.language).split(',')[0]}
                  <span className={`block text-[12px] ${day === d ? 'text-paper/70' : 'text-ink-3'}`}>{dayLabel(d, i18n.language).replace(/^[^,]*,\s*/, '')}</span>
                </button>
              ))}
            </div>

            <div className="mt-5">
              {slots.isLoading ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
              ) : slots.error ? (
                <ErrorState message={slots.error.message} onRetry={() => slots.refetch()} />
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.data?.map((s) => (
                      <button
                        key={s.slot}
                        disabled={!s.free}
                        onClick={() => setSlot(s.slot)}
                        aria-pressed={slot === s.slot}
                        className={`h-12 rounded-xl border text-[14px] tabular-nums transition-colors ${
                          slot === s.slot
                            ? 'border-accent bg-accent text-paper'
                            : s.free
                              ? 'border-line hover:border-ink'
                              : 'cursor-not-allowed border-transparent bg-mist text-ink-3 line-through'
                        }`}
                        title={s.why === 'booked' ? t('td.taken') : s.why === 'past' ? t('td.tooSoon') : undefined}
                      >
                        {slotLabel(s.slot)}
                      </button>
                    ))}
                  </div>
                  {!freeToday && <p className="mt-3 text-[14px] text-ink-2">{t('td.noneLeft')}</p>}
                </>
              )}
            </div>
          </Step>
        )}

        {chosen && slot && (
          <Step n={3} title={t('td.yourDetails')}>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                setTried(true)
                if (contactReady(contact)) book.mutate()
              }}
              className="space-y-6"
            >
              <ContactFields value={contact} onChange={setContact} showErrors={tried} messageLabel={t('td.anything')} />
              {book.error && (
                <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad" role="alert">
                  {book.error.message}
                </p>
              )}
              <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-mist p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[14px]">
                  <span className="font-medium">
                    {chosen.model} {chosen.variant}
                  </span>
                  <span className="text-ink-2">
                    {' '}
                    · {chosen.locality} · {dayLabel(day, i18n.language)} · {slotLabel(slot)}
                  </span>
                </p>
                <button className="btn-accent shrink-0" disabled={book.isPending}>
                  {book.isPending ? t('td.booking') : t('td.confirm')}
                </button>
              </div>
            </form>
          </Step>
        )}
      </div>
    </div>
  )
}
