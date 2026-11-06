import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Toggle } from '../../components/Inline'
import { ErrorState } from '../../components/States'
import { api } from '../../lib/api'
import type { AUser } from './types'

export default function TeamTab() {
  const qc = useQueryClient()
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<AUser[]>('/admin/users') })
  const rooms = useQuery({ queryKey: ['showrooms'], queryFn: () => api.get<{ id: number; locality: string }[]>('/showrooms') })
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<AUser> }) => api.patch(`/admin/users/${id}`, body),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['consultants'] })
    },
  })

  if (users.isLoading) return <div className="skeleton h-80 rounded-[var(--radius-card)]" />
  if (users.error) return <ErrorState message={users.error.message} onRetry={() => users.refetch()} />

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-ink-2">
        Only active consultants get new leads. Switching someone off doesn’t move their open leads; re-assign those from the desk.
      </p>
      {patch.error && (
        <p className="rounded-xl bg-bad-soft px-4 py-3 text-[14px] text-bad" role="alert">
          {patch.error.message}
        </p>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-[14px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-3">
              <th className="px-4 py-2 font-normal">Person</th>
              <th className="px-2 py-2 font-normal">Role</th>
              <th className="px-2 py-2 font-normal">Showroom</th>
              <th className="px-2 py-2 font-normal">Open leads</th>
              <th className="px-4 py-2 font-normal">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.data!.map((u) => (
              <tr key={u.id} className={u.is_active ? '' : 'text-ink-3'}>
                <td className="px-4 py-2">
                  {u.name}
                  <span className="block text-[12px] text-ink-3">{u.email}</span>
                </td>
                <td className="px-2 py-2">
                  <select aria-label={`${u.name} role`} className="field h-9 w-36" value={u.role} onChange={(e) => patch.mutate({ id: u.id, body: { role: e.target.value as AUser['role'] } })}>
                    <option value="buyer">Buyer</option>
                    <option value="consultant">Consultant</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    aria-label={`${u.name} showroom`}
                    className="field h-9 w-40"
                    value={u.showroom_id ?? ''}
                    onChange={(e) => e.target.value && patch.mutate({ id: u.id, body: { showroom_id: Number(e.target.value) } })}
                  >
                    {!u.showroom_id && <option value="">—</option>}
                    {rooms.data?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.locality}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2 tabular-nums">
                  {u.role === 'buyer' ? '—' : u.open_leads}
                  {!u.is_active && u.open_leads > 0 && <span className="ml-2 text-[12px] text-warn">re-assign these</span>}
                </td>
                <td className="px-4 py-2">
                  <Toggle label={`${u.name} active`} on={u.is_active} onChange={(v) => patch.mutate({ id: u.id, body: { is_active: v } })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
