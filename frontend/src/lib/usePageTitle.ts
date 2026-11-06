import { useEffect } from 'react'

const BASE = 'Company A — Brand X cars in Lucknow'

// the server injects real meta for crawlers, this just keeps the tab honest
export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · Company A` : BASE
  }, [title])
}
