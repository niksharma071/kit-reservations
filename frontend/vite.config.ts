import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Dev-only: the browser calls /api/... on the Vite origin and Vite
      // forwards it to the Express server, so requests stay same-origin
      // and no CORS preflight is involved.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
