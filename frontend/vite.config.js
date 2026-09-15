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
    // Modern browsers need substantially less compatibility code. Native
    // dynamic imports also keep route chunks truly on-demand.
    target: 'es2022',
    cssCodeSplit: true,
    reportCompressedSize: false,
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  server: {
    headers: {
      // Source modules should always be revalidated during development. This
      // prevents tabs from retaining URLs from an older optimized-dep graph.
      'Cache-Control': 'no-store'
    },
    hmr: {
      overlay: true
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
    // Monaco ships as ESM and manages its own worker graph. Pre-bundling its
    // language contributions can leave the dev server with stale hashed URLs
    // after dependency changes (504 "Outdated Optimize Dep").
    exclude: ['monaco-editor']
  }
});
