import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replaceAll('\\', '/');
          // Use exact package-path checks rather than the object form. The object
          // form also captures transitive dependencies and previously pulled the
          // JSX runtime into the animation chunk, making Framer Motion critical.
          if (
            moduleId.includes('/node_modules/react/')
            || moduleId.includes('/node_modules/react-dom/')
            || moduleId.includes('/node_modules/react-router/')
            || moduleId.includes('/node_modules/react-router-dom/')
          ) return 'react-vendor';
          if (moduleId.includes('/node_modules/framer-motion/')) return 'animation';
          if (
            moduleId.includes('/node_modules/socket.io-client/')
            || moduleId.includes('/node_modules/engine.io-client/')
            || moduleId.includes('/node_modules/@socket.io/component-emitter/')
          ) return 'socket';
          // lucide-react and react-icons stay ungrouped so route-level
          // tree-shaking can keep unused icons out of each page.
          return undefined;
        },
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
