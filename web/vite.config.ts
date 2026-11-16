/**
 * @module web/vite.config
 * @description Compila la web app pubblica (ai.nexusnxs.com/): CSS unico incorporato nel documento, punto d'ingresso
 * e chunk su richiesta in /assets (nomi con hash, cache permanente). Stessa pagina dal gateway, dall'edge e offline:
 * l'edge serve una copia propria di /assets sincronizzata con il documento.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  base: '/',
  plugins: [react()],
  // Worker del nucleo (core-worker.ts): file a sé in /assets (CSP worker-src 'self'); se non si carica,
  // per esempio dal guscio offline dell'edge, il nucleo disegna sul thread principale.
  worker: { format: 'es' },
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
    // Code-splitting: il punto d'ingresso è un modulo in /assets con nonce (non incorporabile: i chunk lo importano
    // per URL e una copia inline verrebbe eseguita due volte); le parti su richiesta (Centro di controllo, pannello,
    // aggiornamento, selettore, conferme, motion) arrivano con import(), ammesse da 'strict-dynamic'.
    // Niente <link modulepreload> inseriti da script: il CSS è già unico.
    modulePreload: false,
    chunkSizeWarningLimit: 400,
    rollupOptions: { output: { codeSplitting: true } }
  }
});
