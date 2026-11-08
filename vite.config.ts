/**
 * @module vite.config
 * @description Compila l'interfaccia unica NexusNXS (web/) per Electron in renderer-dist, servita da nexus://app/index.html: percorsi relativi, nessuna rete, solo IPC. La versione web pubblica usa web/vite.config.ts.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'web'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'renderer-dist'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'chrome142',
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false }
  }
});
