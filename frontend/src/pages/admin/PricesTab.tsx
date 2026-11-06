import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { InlineInput, Toggle } from '../../components/Inline'
import { usePrice } from '../../components/PriceCard'
import { ErrorState } from '../../components/States'
import { api } from '../../lib/api'
import { dateShort, lakh, rupees } from '../../lib/format'
import { bp, FUELS, pct, type AModel, type ATables, type ATax } from './types'

function Preview({ tables }: { tables: ATables }) {
  const models = useQuery({ queryKey: ['admin-models'], queryFn: () => api.get<AModel[]>('/admin/models') })
  const variants = (models.data ?? []).flatMap((m) => m.variants.map((v) => ({ ...v, label: `${m.name} ${v.name}` })))
  const [vid, setVid] = useState<number | null>(null)
  const [city, setCity] = useState('Lucknow')
  const v = variants.find((x) => x.id === vid) ?? variants.find((x) => x.stock_id === 'NEW-H-02') ?? variants[0]
  const p = usePrice(v?.id ?? 0, city, null)

  return (
    <aside className="card p-5 lg:sticky lg:top-24 lg:self-start">
      <p className="eyebrow">Live preview</p>
      <p className="mt-1 text-[13px] text-ink-3">What a buyer sees right now, from the saved tables.</p>
      <div className="mt-4 grid gap-2">
        <select className="field h-10" aria-label="Preview variant" value={v?.id ?? ''} onChange={(e) => setVid(Number(e.target.value))}>
          {variants.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label} · {x.fuel}
            </option>
          ))}
        </select>
        <select className="field h-10" aria-label="Preview city" value={city} onChange={(e) => setCity(e.target.value)}>
          {tables.cities.map((c) => (
            <option key={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {!p.data ? (
        <div className="skeleton mt-5 h-48" />
      ) : !p.data.available ? (
        <div className="mt-5 rounded-xl bg-warn-soft p-4 text-[14px] text-warn">
          <p className="font-medium">Buyers see “Price on request”</p>
          <p className="mt-1">{p.data.reason}</p>
        </div>
      ) : (
        <div className={p.isFetching ? 'opacity-60' : ''}>
          <p className="mt-5 text-[30px] font-semibold tracking-tight tabular-nums">{rupees(p.data.total!)}</p>
          <dl className="mt-3 divide-y divide-line border-y border-line text-[13px]">
            {p.data.lines.map((l) => (
              <div key={l.key} className="flex justify-between gap-3 py-2">
                <dt>
                  {l.label}
                  {l.detail && <span className="block text-[12px] text-ink-3">{l.detail}</span>}
                </dt>
                <dd className="tabular-nums">{rupees(l.amount)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[12px] text-ink-3">Valid until {dateShort(p.data.valid_until!)}</p>
        </div>
      )}
    </aside>
  )
}

const EMPTY = { fuel: 'petrol', price_from: '0', price_to: '1000000', road_tax: '8', registration_fee: '6500', valid_from: '', valid_until: '' }

function CityRules({ cityId, name, rules, refresh }: { cityId: number; name: string; rules: ATax[]; refresh: () => void }) {
  const [f, setF] = useState(EMPTY)
  const [adding, setAdding] = useState(false)
  const body = (r: ATax) => ({ city_id: r.city_id, fuel: r.fuel, price_from: r.price_from, price_to: r.price_to, road_tax_bp: r.road_tax_bp, registration_fee: r.registration_fee, valid_from: r.valid_from, valid_until: r.valid_until })
  const put = (r: ATax, patch: Partial<ATax>) => api.put(`/admin/tax-rules/${r.id}`, { ...body(r), ...patch }).then(refresh)
  const del = useMutation({ mutationFn: (id: number) => api.del(`/admin/tax-rules/${id}`), onSuccess: refresh })
  const add = useMutation({
    mutationFn: () =>
      api.post('/admin/tax-rules', {
        city_id: cityId,
        fuel: f.fuel,
        price_from: Number(f.price_from),
        price_to: Number(f.price_to),
        road_tax_bp: bp(f.road_tax),
        registration_fee: Number(f.registration_fee),
        valid_from: f.valid_from,
        valid_until: f.valid_until,
      }),
    onSuccess: () => {
      setF(EMPTY)
      setAdding(false)
      refresh()
    },
  })

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-[15px] font-medium">{name}</h3>
        <span className="text-[12px] text-ink-3">{rules.length} rules</span>
      </div>
      {rules.length === 0 && <p className="border-t border-line px-4 py-3 text-[14px] text-warn">No rules yet, so every car here shows “Price on request”.</p>}
      {rules.length > 0 && (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[820px] text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-3">
                <th className="px-4 py-2 font-normal">Fuel</th>
                <th className="px-2 py-2 font-normal">Ex-showroom band</th>
                <th className="px-2 py-2 font-normal">Road tax</th>
                <th className="px-2 py-2 font-normal">Reg. + handling</th>
                <th className="px-2 py-2 font-normal">Valid</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-1.5 capitalize">{r.fuel}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-ink-2">
                    ₹{lakh(r.price_from)} – {r.price_to >= 9_999_999 ? 'and up' : `₹${lakh(r.price_to)}`}
                  </td>
                  <td className="px-2 py-1.5">
                    <InlineInput label={`${name} ${r.fuel} road tax`} type="number" suffix="%" value={pct(r.road_tax_bp)} onSave={(x) => put(r, { road_tax_bp: bp(x) })} className="w-20" />
                  </td>
                  <td className="px-2 py-1.5">
                    <InlineInput label={`${name} ${r.fuel} registration`} type="number" prefix="₹" value={r.registration_fee} onSave={(x) => put(r, { registration_fee: Number(x) })} className="w-28" />
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1">
                      <InlineInput label="valid from" type="date" value={r.valid_from} onSave={(x) => put(r, { valid_from: x })} className="w-36" />
                      <span className="text-ink-3">→</span>
                      <InlineInput label="valid until" type="date" value={r.valid_until} onSave={(x) => put(r, { valid_until: x })} className="w-36" />
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <button className="text-[13px] text-ink-3 hover:text-bad" onClick={() => window.confirm('Delete this rule?') && del.mutate(r.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding ? (
        <form
          className="grid gap-2 border-t border-line p-4 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate()
          }}
        >
          <select className="field h-9" aria-label="Fuel" value={f.fuel} onChange={(e) => setF({ ...f, fuel: e.target.value })}>
            {FUELS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <input className="field h-9" aria-label="Band from (₹)" placeholder="Band from ₹" inputMode="numeric" value={f.price_from} onChange={(e) => setF({ ...f, price_from: e.target.value.replace(/\D/g, '') })} />
          <input className="field h-9" aria-label="Band to (₹)" placeholder="Band to ₹" inputMode="numeric" value={f.price_to} onChange={(e) => setF({ ...f, price_to: e.target.value.replace(/\D/g, '') })} />
          <input className="field h-9" aria-label="Road tax %" placeholder="Road tax %" inputMode="decimal" value={f.road_tax} onChange={(e) => setF({ ...f, road_tax: e.target.value })} />
          <input className="field h-9" aria-label="Registration fee (₹)" placeholder="Reg. fee ₹" inputMode="numeric" value={f.registration_fee} onChange={(e) => setF({ ...f, registration_fee: e.target.value.replace(/\D/g, '') })} />
          <input className="field h-9" aria-label="Valid from" type="date" required value={f.valid_from} onChange={(e) => setF({ ...f, valid_from: e.target.value })} />
          <input className="field h-9" aria-label="Valid until" type="date" required value={f.valid_until} onChange={(e) => setF({ ...f, valid_until: e.target.value })} />
          <div className="flex gap-2">
            <button className="btn-primary h-9 px-4 text-[13px]" disabled={add.isPending}>
              Save rule
            </button>
            <button type="button" className="btn-quiet h-9 px-4 text-[13px]" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
          {add.error && <p className="text-[13px] text-bad sm:col-span-4">{add.error.message}</p>}
        </form>
      ) : (
        <div className="border-t border-line px-4 py-2.5">
          <button className="text-[13px] font-medium text-accent" onClick={() => setAdding(true)}>
            + Add rule for {name}
          </button>
        </div>
      )}
    </section>
  )
}

export default function PricesTab() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin-prices'], queryFn: () => api.get<ATables>('/admin/price-tables') })
  const [city, setCity] = useState('')
  const [pack, setPack] = useState({ name: '', price: '' })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-prices'] })
    qc.invalidateQueries({ queryKey: ['price'] })
    qc.invalidateQueries({ queryKey: ['cities'] })
    qc.invalidateQueries({ queryKey: ['accessories'] })
    qc.invalidateQueries({ queryKey: ['models'] })
  }
  const addCity = useMutation({ mutationFn: () => api.post('/admin/cities', { name: city.trim() }), onSuccess: () => (setCity(''), refresh()) })
  const addPack = useMutation({ mutationFn: () => api.post('/admin/accessories', { name: pack.name, price: Number(pack.price) }), onSuccess: () => (setPack({ name: '', price: '' }), refresh()) })
  const delPack = useMutation({ mutationFn: (id: number) => api.del(`/admin/accessories/${id}`), onSuccess: refresh })

  if (q.isLoading) return <div className="skeleton h-96 rounded-[var(--radius-card)]" />
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
  const t = q.data!

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-10">
        <section>
          <h2 className="text-[17px] font-medium">Road tax and registration, by city</h2>
          <p className="mt-1 text-[14px] text-ink-2">One rule per city, fuel and price band at a time. Overlapping rules are refused so a car never gets two rates.</p>
          <div className="mt-4 space-y-4">
            {/* home city first, the rest a–z */}
            {[...t.cities].sort((a, b) => Number(b.name === 'Lucknow') - Number(a.name === 'Lucknow')).map((c) => (
              <CityRules key={c.id} cityId={c.id} name={c.name} rules={t.tax_rules.filter((r) => r.city_id === c.id)} refresh={refresh} />
            ))}
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (city.trim()) addCity.mutate()
            }}
          >
            <input className="field h-10 w-56" placeholder="Add a city" aria-label="New city name" value={city} onChange={(e) => setCity(e.target.value)} />
            <button className="btn-quiet h-10" disabled={!city.trim() || addCity.isPending}>
              Add city
            </button>
            {addCity.error && <span className="self-center text-[13px] text-bad">{addCity.error.message}</span>}
          </form>
        </section>

        <section>
          <h2 className="text-[17px] font-medium">Insurance</h2>
          <p className="mt-1 text-[14px] text-ink-2">First-year comprehensive, as a share of ex-showroom.</p>
          <div className="card mt-4 divide-y divide-line">
            {t.insurance.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                <span className="w-24 text-[14px] capitalize">{r.fuel}</span>
                <InlineInput label={`${r.fuel} insurance`} type="number" suffix="%" value={pct(r.pct_bp)} onSave={(x) => api.patch(`/admin/insurance/${r.id}`, { pct_bp: bp(x) }).then(refresh)} className="w-20" />
                <span className="inline-flex items-center gap-1">
                  <InlineInput label="valid from" type="date" value={r.valid_from} onSave={(x) => api.patch(`/admin/insurance/${r.id}`, { valid_from: x }).then(refresh)} className="w-36" />
                  <span className="text-ink-3">→</span>
                  <InlineInput label="valid until" type="date" value={r.valid_until} onSave={(x) => api.patch(`/admin/insurance/${r.id}`, { valid_until: x }).then(refresh)} className="w-36" />
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-[17px] font-medium">Accessory packs</h2>
          <p className="mt-1 text-[14px] text-ink-2">Default packs are included in the on-road price unless the buyer unticks them.</p>
          <div className="card mt-4 divide-y divide-line">
            {t.accessories.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <InlineInput label="pack name" value={a.name} onSave={(x) => api.patch(`/admin/accessories/${a.id}`, { name: x }).then(refresh)} className="w-72 max-w-full" />
                <InlineInput label="pack price" type="number" prefix="₹" value={a.price} onSave={(x) => api.patch(`/admin/accessories/${a.id}`, { price: Number(x) }).then(refresh)} className="w-28" />
                <label className="ml-auto flex items-center gap-2 text-[13px] text-ink-2">
                  Default
                  <Toggle label={`${a.name} default`} on={a.is_default} onChange={(v) => api.patch(`/admin/accessories/${a.id}`, { is_default: v }).then(refresh)} />
                </label>
                <button className="text-[13px] text-ink-3 hover:text-bad" onClick={() => window.confirm(`Delete ${a.name}?`) && delPack.mutate(a.id)}>
                  Delete
                </button>
              </div>
            ))}
            <form
              className="flex flex-wrap gap-2 px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault()
                addPack.mutate()
              }}
            >
              <input className="field h-9 w-64" placeholder="New pack name" aria-label="New pack name" value={pack.name} onChange={(e) => setPack({ ...pack, name: e.target.value })} required minLength={2} />
              <input className="field h-9 w-28" placeholder="₹" aria-label="New pack price" inputMode="numeric" value={pack.price} onChange={(e) => setPack({ ...pack, price: e.target.value.replace(/\D/g, '') })} required />
              <button className="btn-quiet h-9 px-4 text-[13px]" disabled={addPack.isPending}>
                Add pack
              </button>
              {addPack.error && <span className="self-center text-[13px] text-bad">{addPack.error.message}</span>}
            </form>
          </div>
        </section>
      </div>
      <Preview tables={t} />
    </div>
  )
}
