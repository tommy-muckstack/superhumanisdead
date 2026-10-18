import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Hosted at yourappisdead.com/superhumanisdead
export default defineConfig({
  root: __dirname,
  base: '/superhumanisdead/',
  // The shared Vercel env uses NEXT_PUBLIC_FIREBASE_* / NEXT_PUBLIC_POSTHOG_*; expose those to the client alongside VITE_*
  envPrefix: ['VITE_', 'NEXT_PUBLIC_FIREBASE_', 'NEXT_PUBLIC_POSTHOG_'],
  build: {
    outDir: resolve(__dirname, '../out/web'),
    emptyOutDir: true,
    rollupOptions: { input: { home: resolve(__dirname, 'index.html'), login: resolve(__dirname, 'login/index.html'), pricing: resolve(__dirname, 'pricing/index.html') } },
  },
})
