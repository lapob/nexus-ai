/**
 * @module vite.config
 * @description Compila il renderer React/TypeScript nel bundle locale caricato da Electron.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'renderer-dist'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'chrome142',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 1_000,
    // Three.js resta un import dinamico: non deve comparire tra i preload
    // dell'HTML iniziale, altrimenti Chromium scarica quasi 1 MiB prima che la
    // shell sia interattiva. Quando MainScene viene richiesta, Vite conserva i
    // preload del relativo import dinamico e il visualizer si avvia normalmente.
    modulePreload: {
      polyfill: false,
      resolveDependencies: (_filename, dependencies, context) => context.hostType === 'html'
        ? dependencies.filter((dependency) => !/visual-runtime/i.test(dependency))
        : dependencies
    },
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 20_000,
          groups: [
            {
              name: 'visual-runtime',
              test: /node_modules[\\/](@react-three|three|postprocessing|three-stdlib|maath)[\\/]/,
              priority: 30
            },
            {
              name: 'motion-runtime',
              test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/,
              priority: 20
            },
            {
              name: 'react-runtime',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 10
            }
          ]
        }
      }
    }
  }
});
