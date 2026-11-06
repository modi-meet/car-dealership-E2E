import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ApiError } from './lib/api'
import './i18n'
import './index.css'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      // a 404 or 403 won't fix itself, only retry network / server hiccups
      retry: (n, e) => n < 1 && !(e instanceof ApiError && e.status >= 400 && e.status < 500),
      refetchOnWindowFocus: false,
      // public data barely moves; 30s means boot data isn't refetched on first paint
      staleTime: 30_000,
    },
  },
})

// the server sends each page's first api answers inside the html, seed them so
// the page draws straight away instead of waiting on a round trip
declare global {
  interface Window {
    __BOOT__?: [unknown[], unknown][]
  }
}
for (const [key, data] of window.__BOOT__ ?? []) qc.setQueryData(key, data)
delete window.__BOOT__

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
