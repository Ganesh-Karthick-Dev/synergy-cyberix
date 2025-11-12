import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
// https://vitejs.dev/config/
export default defineConfig({
  base: './', // Use relative paths for Electron compatibility
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    cors: true,
    hmr: {
      port: 3001,
      host: '127.0.0.1',
    },
    watch: {
      usePolling: true,
      interval: 300,
    },
    fs: {
      strict: false,
    },
  },
  build: {
    outDir: 'dist',
  },
})


