import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        // Lifeline — EMI & money rescue app, served at /money/
        money: resolve(__dirname, 'money/index.html'),
      },
    },
  },
  plugins: [react()],
})
