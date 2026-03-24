import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-force-graph') || id.includes('d3-force') || id.includes('d3-') || id.includes('canvas-color-tracker')) {
            return 'graph-vendor'
          }
          if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-')) {
            return 'markdown-vendor'
          }
          if (id.includes('react-dom') || id.includes('/react/')) {
            return 'react-vendor'
          }
        },
      },
    },
  },
})
