import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Hosted at yourappisdead.com/superhumanisdead
export default defineConfig({
  root: __dirname,
  base: '/superhumanisdead/',
  build: {
    outDir: resolve(__dirname, '../out/web'),
    emptyOutDir: true,
    rollupOptions: { input: { home: resolve(__dirname, 'index.html'), login: resolve(__dirname, 'login/index.html') } },
  },
})
