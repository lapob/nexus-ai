/**
 * @module scripts/pull-local-model
 * @description Scarica un modello Ollama locale con avanzamento leggibile e ripresa automatica.
 */
const endpoint = String(process.env.NEXUS_OLLAMA_BASE_URL || 'http://127.0.0.1:11435').replace(/\/$/, '');
const model = String(process.argv[2] || '').trim();
if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) {
  process.stderr.write('Uso: npm run ai:pull -- nome-modello\n');
  process.exit(1);
}

(async () => {
  const response = await fetch(`${endpoint}/api/pull`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: true })
  });
  if (!response.ok || !response.body) throw new Error(`Ollama HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastPercent = -5;
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.error) throw new Error(event.error);
      const percent = event.total ? Math.floor(event.completed / event.total * 100) : null;
      if (percent !== null && (percent >= lastPercent + 5 || percent === 100)) {
        lastPercent = percent;
        process.stdout.write(`${model} · ${percent}%\n`);
      }
      if (event.status === 'success') process.stdout.write(`${model} · pronto\n`);
    }
    if (done) break;
  }
})().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
