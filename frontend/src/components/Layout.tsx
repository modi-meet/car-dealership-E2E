import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, ScrollRestoration, useNavigate } from 'react-router'
import { setLang } from '../i18n'
import { useMe, useSignOut } from '../lib/auth'

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Company A home">
      <img src="/favicon.svg" alt="" className="size-7" />
      <span className="text-[17px] font-semibold tracking-tight">Company A</span>
    </Link>
  )
}

function LangSwitch() {
  const { i18n } = useTranslation()
  const other = i18n.language === 'hi' ? 'en' : 'hi'
  return (
    <button
      onClick={() => setLang(other)}
      className="h-9 rounded-full px-3 text-[14px] text-ink-2 hover:bg-mist"
      aria-label={other === 'hi' ? 'हिंदी में देखें' : 'View in English'}
    >
      {other === 'hi' ? 'हिंदी' : 'English'}
    </button>
  )
}

export default function Layout() {
  const { t } = useTranslation()
  const { data: me } = useMe()
  const signOut = useSignOut()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)

  const links = [
    { to: '/cars', label: t('nav.newCars') },
    { to: '/used', label: t('nav.used') },
    { to: '/test-drive', label: t('nav.testDrive') },
    ...(me && me.role !== 'buyer' ? [{ to: '/desk', label: t('nav.desk') }] : []),
    ...(me?.role === 'admin' ? [{ to: '/admin', label: t('nav.admin') }] : []),
  ]

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-2 text-[14px] transition-colors ${isActive ? 'text-ink font-medium' : 'text-ink-2 hover:text-ink'}`

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="wrap flex h-16 items-center justify-between gap-4">
          <Wordmark />
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={linkCls}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <LangSwitch />
            {me ? (
              <button
                className="hidden h-9 rounded-full px-3 text-[14px] text-ink-2 hover:bg-mist md:block"
                onClick={async () => {
                  await signOut()
                  nav('/')
                }}
                title={me.email}
              >
                {t('nav.signOut')}
              </button>
            ) : (
              <Link to="/login" className="hidden h-9 items-center rounded-full px-3 text-[14px] text-ink-2 hover:bg-mist md:flex">
                {t('nav.signIn')}
              </Link>
            )}
            <button
              className="grid size-10 place-items-center rounded-full hover:bg-mist md:hidden"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label="Menu"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <nav className="wrap flex flex-col border-t border-line py-2 md:hidden" onClick={() => setOpen(false)}>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className="py-3 text-[16px]">
                {l.label}
              </NavLink>
            ))}
            {me ? (
              <button className="py-3 text-left text-[16px] text-ink-2" onClick={() => signOut().then(() => nav('/'))}>
                {t('nav.signOut')}
              </button>
            ) : (
              <Link to="/login" className="py-3 text-[16px] text-ink-2">
                {t('nav.signIn')}
              </Link>
            )}
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
      {/* new page starts at the top, back button returns to where you were */}
      <ScrollRestoration getKey={(loc) => loc.pathname} />

      <footer className="mt-24 border-t border-line">
        <div className="wrap flex flex-col gap-6 py-10 text-[14px] text-ink-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Wordmark />
            <p className="max-w-sm text-[13px] text-ink-3">{t('footer.note')}</p>
          </div>
          <div className="space-y-1">
            <p className="eyebrow mb-2">{t('footer.showrooms')}</p>
            <p>Gomti Nagar · Aliganj · Alambagh</p>
            <p className="text-ink-3">0522 400 1100</p>
          </div>
          <Link to="/privacy" className="hover:text-ink">
            {t('footer.privacy')}
          </Link>
        </div>
      </footer>
    </div>
  )
}
