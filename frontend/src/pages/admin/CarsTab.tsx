import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import CarImage from '../../components/CarImage'
import { InlineInput, Toggle } from '../../components/Inline'
import { ErrorState } from '../../components/States'
import { usePrice } from '../../components/PriceCard'
import { api } from '../../lib/api'
import { rupees } from '../../lib/format'
import { FUELS, type AModel, type AVariant } from './types'

function OnRoad({ v }: { v: AVariant }) {
  const p = usePrice(v.id, 'Lucknow', null)
  if (!p.data) return <span className="text-ink-3">…</span>
  return p.data.available ? <span className="tabular-nums">{rupees(p.data.total!)}</span> : <span className="text-warn">on request</span>
}

function AddVariant({ model, onDone }: { model: AModel; onDone: () => void }) {
  const [f, setF] = useState({ name: '', fuel: 'petrol', transmission: 'Manual', ex_showroom: '' })
  const add = useMutation({
    mutationFn: () => api.post('/admin/variants', { ...f, model_id: model.id, ex_showroom: Number(f.ex_showroom) }),
    onSuccess: () => {
      setF({ name: '', fuel: 'petrol', transmission: 'Manual', ex_showroom: '' })
      onDone()
    },
  })
  return (
    <form
      className="flex flex-wrap items-end gap-2 border-t border-line px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        add.mutate()
      }}
    >
      <input className="field h-9 w-32" placeholder="Variant name" aria-label="New variant name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      <select className="field h-9 w-28" aria-label="Fuel" value={f.fuel} onChange={(e) => setF({ ...f, fuel: e.target.value })}>
        {FUELS.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <input className="field h-9 w-36" placeholder="Transmission" aria-label="Transmission" value={f.transmission} onChange={(e) => setF({ ...f, transmission: e.target.value })} required />
      <input className="field h-9 w-36" placeholder="Ex-showroom ₹" aria-label="Ex-showroom price" inputMode="numeric" value={f.ex_showroom} onChange={(e) => setF({ ...f, ex_showroom: e.target.value.replace(/\D/g, '') })} required />
      <button className="btn-quiet h-9 px-4 text-[13px]" disabled={add.isPending}>
        Add variant
      </button>
      {add.error && <span className="text-[13px] text-bad">{add.error.message}</span>}
    </form>
  )
}

function ModelCard({ m }: { m: AModel }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-models'] })
    qc.invalidateQueries({ queryKey: ['price'] })
    qc.invalidateQueries({ queryKey: ['models'] })
    qc.invalidateQueries({ queryKey: ['model'] })
  }
  const patchModel = (body: Partial<AModel>) => api.patch(`/admin/models/${m.id}`, body).then(refresh)
  const patchVariant = (id: number, body: Partial<AVariant>) => api.patch(`/admin/variants/${id}`, body).then(refresh)
  const del = useMutation({ mutationFn: (id: number) => api.del(`/admin/variants/${id}`), onSuccess: refresh })

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 p-4">
        <CarImage src={m.hero_image} alt="" sizes="120px" className="aspect-[16/10] w-28 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold tracking-tight">{m.name}</p>
          <p className="text-[13px] text-ink-3">
            {m.body_type} · {m.variants.length} variants ·{' '}
            <Link to={`/cars/${m.slug}`} className="underline underline-offset-2">
              view page
            </Link>
          </p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          {m.is_published ? 'On the site' : 'Hidden'}
          <Toggle label={`Publish ${m.name}`} on={m.is_published} onChange={(v) => patchModel({ is_published: v })} />
        </label>
        <button className="btn-quiet h-9 px-4 text-[13px]" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Close' : 'Edit copy'}
        </button>
      </div>

      {open && (
        <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
          {(['tagline_en', 'tagline_hi', 'description_en', 'description_hi'] as const).map((k) => (
            <label key={k} className="block">
              <span className="label">{k.replace('_', ' · ').replace('en', 'English').replace('hi', 'Hindi')}</span>
              <textarea
                defaultValue={m[k]}
                rows={k.startsWith('desc') ? 4 : 2}
                maxLength={k.startsWith('desc') ? 1000 : 120}
                className="field h-auto py-2"
                onBlur={(e) => e.target.value !== m[k] && patchModel({ [k]: e.target.value })}
              />
            </label>
          ))}
          <p className="text-[12px] text-ink-3 sm:col-span-2">Saves when you click away.</p>
        </div>
      )}

      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[640px] text-[14px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-3">
              <th className="px-4 py-2 font-normal">Variant</th>
              <th className="px-2 py-2 font-normal">Fuel · gearbox</th>
              <th className="px-2 py-2 font-normal">Ex-showroom</th>
              <th className="px-2 py-2 font-normal">On-road, Lucknow</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {m.variants.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-1.5">
                  <InlineInput label={`${m.name} variant name`} value={v.name} onSave={(x) => patchVariant(v.id, { name: x })} className="w-40" />
                </td>
                <td className="px-2 py-1.5 text-ink-2 capitalize">
                  {v.fuel} · {v.transmission}
                </td>
                <td className="px-2 py-1.5">
                  <InlineInput
                    label={`${m.name} ${v.name} ex-showroom`}
                    type="number"
                    prefix="₹"
                    value={v.ex_showroom}
                    onSave={(x) => patchVariant(v.id, { ex_showroom: Number(x) })}
                    className="w-36"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <OnRoad v={v} />
                </td>
                <td className="px-4 py-1.5 text-right">
                  <button
                    className="text-[13px] text-ink-3 hover:text-bad"
                    onClick={() => window.confirm(`Delete ${m.name} ${v.name}?`) && del.mutate(v.id)}
                    aria-label={`Delete ${m.name} ${v.name}`}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {del.error && <p className="px-4 pb-2 text-[13px] text-bad">{del.error.message}</p>}
      </div>
      <AddVariant model={m} onDone={refresh} />
    </section>
  )
}

export default function CarsTab() {
  const q = useQuery({ queryKey: ['admin-models'], queryFn: () => api.get<AModel[]>('/admin/models') })
  if (q.isLoading) return <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-56 rounded-[var(--radius-card)]" />)}</div>
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
  return (
    <div className="space-y-4">
      <p className="text-[14px] text-ink-2">Change an ex-showroom price and the on-road figure updates here and on the site straight away.</p>
      {q.data!.map((m) => (
        <ModelCard key={m.id} m={m} />
      ))}
    </div>
  )
}
