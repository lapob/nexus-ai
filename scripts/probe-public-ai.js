/**
 * @module scripts/probe-public-ai
 * @description Misura una risposta pubblica reale, inclusi i vuoti tra token.
 */
const { randomUUID } = require('node:crypto');

const base = String(process.env.NEXUS_PUBLIC_AI_URL || 'https://ai.nexusnxs.com').replace(/\/$/, '');
const prompt = String(process.argv.slice(2).join(' ') || 'Cos’è il Darién Gap?').trim();

async function main() {
  const bootstrap = await fetch(`${base}/api/guest/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ installationId: randomUUID() })
  });
  const session = await bootstrap.json();
  if (!bootstrap.ok) throw new Error(session.error || `Bootstrap non disponibile (${bootstrap.status}).`);

  const startedAt = performance.now();
  const response = await fetch(`${base}/api/guest/messages/stream`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prompt, history: [], model: 'nexus-fast', clientMessageId: randomUUID() })
  });
  if (!response.ok) throw new Error(await response.text());
  if (!response.body) throw new Error('Streaming pubblico non disponibile.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ''; let answer = ''; let complete = false; let artifacts = [];
  const phases = [];
  let firstTokenMs = 0; let lastTokenAt = 0; let maxTokenGapMs = 0; let tokenFrames = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const frame = JSON.parse(line);
      if (frame.type === 'token') {
        const now = performance.now();
        if (!firstTokenMs) firstTokenMs = now - startedAt;
        if (lastTokenAt) maxTokenGapMs = Math.max(maxTokenGapMs, now - lastTokenAt);
        lastTokenAt = now;
        tokenFrames += 1;
        answer += String(frame.token || '');
      }
      if (frame.type === 'complete') {
        complete = true;
        if (frame.message) answer = String(frame.message);
        artifacts = Array.isArray(frame.artifacts) ? frame.artifacts : [];
      }
      if (frame.type === 'phase' && frame.activity?.text) phases.push(String(frame.activity.text));
      if (frame.type === 'error') throw new Error(frame.error || 'Risposta non completata.');
    }
  }
  const result = {
    complete,
    characters: answer.length,
    tokenFrames,
    firstTokenMs: Math.round(firstTokenMs),
    maxTokenGapMs: Math.round(maxTokenGapMs),
    elapsedMs: Math.round(performance.now() - startedAt),
    phases: [...new Set(phases)],
    artifacts: artifacts.map((item) => ({ kind: item.kind, title: item.title, url: item.url || '' })),
    answer
  };
  console.log(JSON.stringify(result, null, 2));
  if (!complete || !answer.trim()) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
