import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Supabase + Recharts + Radix is a genuinely chunky dependency graph.
    // Split the heaviest vendors so the login route stays small and fast.
    //
    // This has to be the function form: Vite 8 bundles with Rolldown, which
    // rejects the object form of `manualChunks`.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          const path = id.replace(/\\/g, '/')
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(path)) {
            return 'react'
          }
          if (path.includes('node_modules/@supabase/')) return 'supabase'
          if (path.includes('node_modules/recharts') || path.includes('node_modules/d3-')) {
            return 'charts'
          }
          return undefined
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
