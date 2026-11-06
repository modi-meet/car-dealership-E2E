import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import ContactFields, { contactReady, emptyContact } from './ContactFields'

type Props = {
  title: string
  modelSlug?: string
  variantId?: number
  usedStockId?: string
  type?: 'enquiry' | 'trade_in'
}

export default function EnquiryForm({ title, modelSlug, variantId, usedStockId, type = 'enquiry' }: Props) {
  const { t, i18n } = useTranslation()
  const [v, setV] = useState(emptyContact)
  const [tried, setTried] = useState(false)

  const send = useMutation({
    mutationFn: () =>
      api.post<{ ref: string; consultant: string | null }>('/leads', {
        ...v,
        lang: i18n.language,
        type,
        model_slug: modelSlug,
        variant_id: variantId,
        used_stock_id: usedStockId,
      }),
  })

  if (send.data) {
    return (
      <div className="card p-6" role="status">
        <p className="text-[17px] font-medium">{t('enquiry.thanks')}</p>
        <p className="mt-2 text-[15px] text-ink-2">
          {send.data.consultant ? t('enquiry.willCall', { name: send.data.consultant }) : t('enquiry.teamWillCall')}
        </p>
        <p className="mt-4 text-[13px] text-ink-3">
          {t('enquiry.ref')} {send.data.ref}
        </p>
      </div>
    )
  }

  return (
    <form
      className="card space-y-5 p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (contactReady(v)) send.mutate()
      }}
      noValidate
    >
      <h2 className="text-[17px] font-medium">{title}</h2>
      <ContactFields value={v} onChange={setV} showErrors={tried} />
      {send.error && (
        <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad" role="alert">
          {send.error.message}
        </p>
      )}
      <button className="btn-primary w-full sm:w-auto" disabled={send.isPending}>
        {send.isPending ? t('enquiry.sending') : t('enquiry.send')}
      </button>
    </form>
  )
}
