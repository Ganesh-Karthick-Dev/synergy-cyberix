import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // Use relative paths for Electron compatibility
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'chart-vendor': ['chart.js', 'react-chartjs-2', 'recharts'],
          'pdf-vendor': ['jspdf', 'html2canvas'],
          'utils-vendor': ['axios', 'xlsx', 'xml2js'],
        },
      },
    },
  },
})

