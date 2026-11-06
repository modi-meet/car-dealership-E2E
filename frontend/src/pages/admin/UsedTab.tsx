import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { InlineInput } from '../../components/Inline'
import { EmptyState, ErrorState } from '../../components/States'
import { api } from '../../lib/api'
import { FUELS, type AModel, type AUsed } from './types'

const BLANK = {
  stock_id: '',
  model_slug: 'model-h',
  variant: '',
  fuel: 'petrol',
  transmission: 'Manual',
  year: String(new Date().getFullYear() - 2),
  km: '',
  owners: '1',
  price: '',
  reg_number: '',
  colour: '',
  showroom_id: '1',
  inspection_score: '90',
}

function AddCar({ onDone }: { onDone: () => void }) {
  const models = useQuery({ queryKey: ['admin-models'], queryFn: () => api.get<AModel[]>('/admin/models') })
  const showrooms = useQuery({ queryKey: ['showrooms'], queryFn: () => api.get<{ id: number; locality: string }[]>('/showrooms') })
  const [f, setF] = useState(BLANK)
  const set = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const num = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/\D/g, '') })
  const add = useMutation({
    mutationFn: () =>
      api.post('/admin/used', {
        ...f,
        year: Number(f.year),
        km: Number(f.km),
        owners: Number(f.owners),
        price: Number(f.price),
        showroom_id: Number(f.showroom_id),
        inspection_score: Number(f.inspection_score),
      }),
    onSuccess: () => {
      setF(BLANK)
      onDone()
    },
  })

  return (
    <form
      className="card grid gap-3 p-5 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        add.mutate()
      }}
    >
      <p className="text-[15px] font-medium sm:col-span-4">Add a certified car</p>
      <label>
        <span className="label">Stock ID</span>
        <input className="field h-10" placeholder="UC-1230" value={f.stock_id} onChange={set('stock_id')} required />
      </label>
      <label>
        <span className="label">Model</span>
        <select className="field h-10" value={f.model_slug} onChange={set('model_slug')}>
          {models.data?.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Variant</span>
        <input className="field h-10" value={f.variant} onChange={set('variant')} required />
      </label>
      <label>
        <span className="label">Fuel</span>
        <select className="field h-10" value={f.fuel} onChange={set('fuel')}>
          {FUELS.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Gearbox</span>
        <input className="field h-10" value={f.transmission} onChange={set('transmission')} required />
      </label>
      <label>
        <span className="label">Year</span>
        <input className="field h-10" inputMode="numeric" value={f.year} onChange={num('year')} required />
      </label>
      <label>
        <span className="label">Kilometres</span>
        <input className="field h-10" inputMode="numeric" value={f.km} onChange={num('km')} required />
      </label>
      <label>
        <span className="label">Owners</span>
        <input className="field h-10" inputMode="numeric" value={f.owners} onChange={num('owners')} required />
      </label>
      <label>
        <span className="label">Price (₹)</span>
        <input className="field h-10" inputMode="numeric" value={f.price} onChange={num('price')} required />
      </label>
      <label>
        <span className="label">Registration no.</span>
        <input className="field h-10 uppercase" placeholder="UP32 AB 1234" value={f.reg_number} onChange={set('reg_number')} required />
      </label>
      <label>
        <span className="label">Colour</span>
        <input className="field h-10" value={f.colour} onChange={set('colour')} required />
      </label>
      <label>
        <span className="label">Showroom</span>
        <select className="field h-10" value={f.showroom_id} onChange={set('showroom_id')}>
          {showrooms.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.locality}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Inspection score</span>
        <input className="field h-10" inputMode="numeric" value={f.inspection_score} onChange={num('inspection_score')} required />
      </label>
      <div className="flex items-end sm:col-span-3">
        <p className="text-[12px] text-ink-3">Photos use the model’s studio set for now. The full registration number is only ever shown here.</p>
      </div>
      <div className="flex items-center gap-3 sm:col-span-4">
        <button className="btn-primary" disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add to stock'}
        </button>
        {add.error && <span className="text-[13px] text-bad">{add.error.message}</span>}
      </div>
    </form>
  )
}

export default function UsedTab() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin-used'], queryFn: () => api.get<AUsed[]>('/admin/used') })
  const [adding, setAdding] = useState(false)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-used'] })
    qc.invalidateQueries({ queryKey: ['used'] })
    qc.invalidateQueries({ queryKey: ['used-car'] })
  }
  const patch = (id: number, body: Partial<AUsed>) => api.patch(`/admin/used/${id}`, body).then(refresh)

  if (q.isLoading) return <div className="skeleton h-96 rounded-[var(--radius-card)]" />
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-ink-2">The used-car manager sets every price. Sold cars drop off the site; booked ones stay with a badge.</p>
        <button className="btn-quiet h-10" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Close' : '+ Add car'}
        </button>
      </div>
      {adding && (
        <AddCar
          onDone={() => {
            setAdding(false)
            refresh()
          }}
        />
      )}
      {!q.data?.length ? (
        <EmptyState title="No used stock yet" body="Add the first certified car above." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-3">
                <th className="px-4 py-2 font-normal">Stock</th>
                <th className="px-2 py-2 font-normal">Car</th>
                <th className="px-2 py-2 font-normal">Reg. (private)</th>
                <th className="px-2 py-2 font-normal">Km</th>
                <th className="px-2 py-2 font-normal">Owners</th>
                <th className="px-2 py-2 font-normal">Price</th>
                <th className="px-4 py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.map((c) => (
                <tr key={c.id} className={c.status === 'sold' ? 'text-ink-3' : ''}>
                  <td className="px-4 py-1.5">
                    {c.status === 'sold' ? (
                      c.stock_id
                    ) : (
                      <Link to={`/used/${c.stock_id}`} className="underline underline-offset-2">
                        {c.stock_id}
                      </Link>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {c.year} {c.model_name} {c.variant}
                    <span className="block text-[12px] text-ink-3 capitalize">
                      {c.fuel} · {c.transmission} · {c.inspection.score}/100
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[13px]">{c.reg_number}</td>
                  <td className="px-2 py-1.5">
                    <InlineInput label={`${c.stock_id} km`} type="number" value={c.km} onSave={(x) => patch(c.id, { km: Number(x) })} className="w-24" />
                  </td>
                  <td className="px-2 py-1.5">
                    <InlineInput label={`${c.stock_id} owners`} type="number" value={c.owners} onSave={(x) => patch(c.id, { owners: Number(x) })} className="w-14" />
                  </td>
                  <td className="px-2 py-1.5">
                    <InlineInput label={`${c.stock_id} price`} type="number" prefix="₹" value={c.price} onSave={(x) => patch(c.id, { price: Number(x) })} className="w-32" />
                  </td>
                  <td className="px-4 py-1.5">
                    <select aria-label={`${c.stock_id} status`} className="field h-9 w-32" value={c.status} onChange={(e) => patch(c.id, { status: e.target.value as AUsed['status'] })}>
                      <option value="available">Available</option>
                      <option value="booked">Booked</option>
                      <option value="sold">Sold</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
