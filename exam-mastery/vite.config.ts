import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the build works inside the Android WebView (file-relative paths)
export default defineConfig({ plugins: [react()], base: './' })
