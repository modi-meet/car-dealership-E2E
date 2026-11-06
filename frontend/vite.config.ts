import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // in dev, api calls go to fastapi on 8000
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
})
