import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import type { Me } from '../lib/auth'

const DEMO = [
  { who: 'Consultant', email: 'ankit@companya.demo' },
  { who: 'Admin', email: 'admin@companya.demo' },
  { who: 'Buyer', email: 'buyer@companya.demo' },
]

export default function Login() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => api.post<Me>('/auth/login', { email, password }),
    onSuccess: (me) => {
      qc.setQueryData(['me'], me)
      const next = params.get('next')
      // only follow local paths, never an outside url
      const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : null
      nav(safe ?? (me.role === 'admin' ? '/admin' : me.role === 'consultant' ? '/desk' : '/'))
    },
  })

  return (
    <div className="wrap grid min-h-[70dvh] place-items-center py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-[28px] font-semibold tracking-tight">{t('login.title')}</h1>
        <p className="mt-1 text-[15px] text-ink-2">{t('login.sub')}</p>

        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            login.mutate()
          }}
        >
          <div>
            <label className="label" htmlFor="email">
              {t('login.email')}
            </label>
            <input id="email" type="email" autoComplete="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">
              {t('login.password')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {login.error && (
            <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad" role="alert">
              {login.error instanceof ApiError ? login.error.message : 'something went wrong'}
            </p>
          )}
          <button className="btn-primary w-full" disabled={login.isPending}>
            {login.isPending ? t('login.working') : t('login.submit')}
          </button>
        </form>

        <div className="mt-10 border-t border-line pt-6">
          <p className="eyebrow">{t('login.demo')}</p>
          <ul className="mt-3 space-y-1">
            {DEMO.map((d) => (
              <li key={d.email}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[14px] hover:bg-mist"
                  onClick={() => setEmail(d.email)}
                >
                  <span className="text-ink-2">{d.who}</span>
                  <span className="font-mono text-[13px] text-ink-3">{d.email}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-2 text-[12px] text-ink-3">Password is in deployment.md.</p>
        </div>
      </div>
    </div>
  )
}
