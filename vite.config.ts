import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The lazily loaded editor chunk (CodeMirror) is ~580 kB
  build: { chunkSizeWarningLimit: 700 },
})
