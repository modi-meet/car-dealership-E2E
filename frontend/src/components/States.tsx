import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

// shared empty / error bits so every screen says the same thing the same way

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="card mx-auto max-w-md p-8 text-center" role="alert">
      <p className="text-[15px] text-ink">{message ?? 'Something went wrong.'}</p>
      {onRetry && (
        <button className="btn-quiet mt-5" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-[17px] font-medium">{title}</p>
      {body && <p className="mt-2 text-[15px] text-ink-2">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="wrap py-32 text-center">
      <p className="text-[56px] font-semibold tracking-tight text-ink-3">404</p>
      <p className="mt-2 text-ink-2">{t('common.notFound')}</p>
      <Link to="/" className="btn-quiet mt-8">
        {t('common.home')}
      </Link>
    </div>
  )
}
