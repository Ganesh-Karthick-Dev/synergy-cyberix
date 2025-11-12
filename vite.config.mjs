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
    port: 3000,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
  },
})


