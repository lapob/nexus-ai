/**
 * @module shared/sandbox-host
 * @description Pagina ospite dell'anteprima HTML eseguibile. Gira sempre in un iframe `sandbox="allow-scripts"`
 * (origine opaca: niente cookie, storage, accesso alla pagina madre) e con una CSP senza alcuna rete:
 * il codice generato può animarsi e calcolare, ma non può inviare dati da nessuna parte né navigare.
 * La stessa pagina è servita dal desktop (nexus-sandbox://run/v1) e dal sito (nexusnxs.com/sandbox/v1).
 */

const SANDBOX_HOST_HTML = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Anteprima</title>
<style>html,body{margin:0;background:#fff;color:#111;font:15px system-ui,sans-serif}</style></head><body><script>
(function(){var done=false;addEventListener('message',function(event){
if(done||event.source!==parent||!event.data||event.data.type!=='nexus-sandbox-render'||typeof event.data.html!=='string')return;
done=true;document.open();document.write(event.data.html);document.close();});
parent.postMessage({type:'nexus-sandbox-ready'},'*');})();
</script></body></html>`;

/** CSP dell'ospite: script e stili inline del documento generato, immagini solo locali, nessuna connessione. */
function sandboxHostPolicy(frameAncestors) {
  return [
    "default-src 'none'", "script-src 'unsafe-inline' 'unsafe-eval'", "style-src 'unsafe-inline'",
    'img-src data: blob:', 'font-src data:', 'media-src data: blob:', "connect-src 'none'", "worker-src 'none'",
    "form-action 'none'", "base-uri 'none'", "object-src 'none'", `frame-ancestors ${frameAncestors}`
  ].join('; ');
}

const SANDBOX_DESKTOP_URL = 'nexus-sandbox://run/v1';

module.exports = { SANDBOX_DESKTOP_URL, SANDBOX_HOST_HTML, sandboxHostPolicy };
