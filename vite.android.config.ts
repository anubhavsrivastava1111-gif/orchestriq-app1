// Builds the Lifeline interface for the Android app (android/app/src/main/assets/www).
// Differences from the website build: a strict Content-Security-Policy, no source maps,
// no OrchestrIQ public files, and no service worker / web manifest.
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.anthropic.com https://www.alphavantage.co https://api.mfapi.in",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const androidHtml: Plugin = {
  name: 'lifeline-android-html',
  transformIndexHtml(html) {
    return html
      .replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
      .replace(/\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>/g, '')
  },
}

export default defineConfig({
  plugins: [react(), androidHtml],
  publicDir: false,
  build: {
    outDir: 'android/app/src/main/assets/www',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: { money: resolve(import.meta.dirname, 'money/index.html') } },
  },
})
