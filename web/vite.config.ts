/**
 * @module web/vite.config
 * @description Compila la web app pubblica (ai.nexusnxs.com/) in un solo bundle JS e CSS che il gateway incorpora nel documento: stessa pagina dal gateway, dall'edge e offline.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  base: '/',
  plugins: [react()],
  // Solo sviluppo/anteprima locale: le API vanno al servizio reale. In
  // produzione la web app è servita dallo stesso gateway (stessa origine).
  preview: {
    host: '127.0.0.1', port: 4180, strictPort: true,
    // In produzione pagina e API hanno la stessa origine; il proxy locale la
    // riproduce, altrimenti il controllo anti-CSRF del gateway rifiuta (correttamente).
    proxy: Object.fromEntries(['/api', '/readyz', '/nexus-icon.png', '/manifest.webmanifest'].map((route) => [route, {
      target: 'https://ai.nexusnxs.com', changeOrigin: true, secure: true, headers: { Origin: 'https://ai.nexusnxs.com' }
    }]))
  },
  build: {
    outDir: resolve(__dirname, '..', 'web-dist'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2023',
    cssCodeSplit: false,
    // Font e immagini restano file in /assets (la CSP non ammette data:); JS e CSS
    // vengono incorporati dal gateway con nonce (src/remote/public-web-app.js).
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 400,
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
});
