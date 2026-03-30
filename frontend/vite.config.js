import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React — always needed, cache separately
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Heavy animation library — shared between pages that use it
          'animation': ['framer-motion'],
          // Socket.io — only loaded for authenticated pages
          'socket': ['socket.io-client'],
          // NOTE: lucide-react and react-icons are intentionally NOT grouped here.
          // Grouping them defeats tree-shaking: every lazy route would pull in the
          // entire icon bundle. Instead we let Rollup tree-shake per route chunk.
        }
      }
    },
    chunkSizeWarningLimit: 500,
    minify: 'esbuild',
    sourcemap: false,
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  server: {
    hmr: {
      overlay: true
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom']
  }
});
