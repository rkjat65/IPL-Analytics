import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // recharts (+d3) is one ~540 kB chunk loaded only by chart pages
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: they change far less often than app code,
        // so returning visitors keep them cached across deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler|@remix-run)[\\/]/.test(id)) return 'react'
          if (/[\\/](recharts|d3-[^\\/]+|victory-vendor|recharts-scale|decimal\.js-light)[\\/]/.test(id)) return 'charts'
          if (/[\\/](react-simple-maps|topojson-client|d3-geo)[\\/]/.test(id)) return 'maps'
          if (/[\\/]html-to-image[\\/]/.test(id)) return 'export'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
