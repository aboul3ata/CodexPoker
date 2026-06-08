import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': process.env.CODEX_POKER_API_URL ?? 'http://127.0.0.1:8797',
      '/events': process.env.CODEX_POKER_API_URL ?? 'http://127.0.0.1:8797'
    }
  },
  build: {
    outDir: 'dist/client'
  }
})
