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
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
