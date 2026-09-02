const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

test('desktop rende Markdown semantico anche durante lo streaming', () => {
  const surface = fs.readFileSync(path.join(root, 'src/renderer/components/ResponseSurface.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src/renderer/styles/response-surface.css'), 'utf8');
  assert.match(surface, /streamSafeMarkdown\(response\)/);
  assert.match(surface, /<MarkdownContent text=\{streamSafeMarkdown\(response\)\} streaming \/>/);
  assert.match(surface, /kind: 'callout'/);
  assert.match(surface, /kind: 'table'/);
  assert.match(surface, /className="answer-context"/);
  assert.match(surface, /className="answer-stop"/);
  assert.match(surface, /onClick=\{onStop\}/);
  assert.match(styles, /\.response-callout/);
  assert.match(styles, /\.response-table-wrap/);
  assert.match(styles, /\.code-card-meta/);
});

test('NexusNXS AI Web usa lo stesso renderer durante e dopo la generazione', () => {
  const { enhancePublicAiHtml } = require('../src/remote/public-demo');
  const base = '<!doctype html><html><head></head><body><p id="answer" class="answer"></p><script>legacy()</script></body></html>';
  const html = enhancePublicAiHtml({ base, coreStyle: '', coreScript: '' });
  assert.match(html, /id="answerContext"/);
  assert.match(html, /class="web-answer-context"/);
  assert.match(html, /answer\.textContent=rawAnswer/);
  assert.match(html, /formatAnswer\(responseText\)/);
  assert.match(html, /rawAnswer=recentAnswer\.content;formatAnswer\(recentAnswer\.content\)/);
  assert.match(html, /className = 'web-code-card'/);
  assert.match(html, /className = 'web-callout'/);
  assert.match(html, /className = 'web-table-wrap'/);
  assert.match(html, /id="copyResponse"/);
  assert.match(html, /id="deepenResponse"/);
  assert.match(html, /id="exportResponse"/);
  assert.match(html, /download='nexusnxs-risposta\.md'/);
  assert.match(html, /navigator\.clipboard\.writeText/);
  assert.match(html, /function followAnswer\(\)/);
  assert.match(html, /document\.documentElement\.scrollHeight-innerHeight/);
  assert.match(html, /if\(busy\)followStream=false/);
  assert.match(html, /\.dock\{position:fixed/);
  assert.match(html, /data-mode=stop/);
  assert.match(html, /function stopGeneration\(\)/);
  assert.match(html, /\/api\/guest\/messages\/cancel/);
  assert.match(html, /Riprendo la risposta/);
  assert.match(html, /async function memoryRead\(\)\{return\[\]/);
  assert.doesNotMatch(html, /answer\.textContent\+=pendingAnswer/);
  for (const [index, match] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
    assert.doesNotThrow(() => new vm.Script(match[1]), `script Web generato ${index + 1}`);
  }
});

test('Android condivide gerarchia, stream sicuro e codice evidenziato', () => {
  const activity = fs.readFileSync(path.join(root, 'android/NexusRemote/app/src/main/java/local/nexus/remote/NexusMainActivity.kt'), 'utf8');
  assert.match(activity, /enum class ResponsePresentationKind/);
  assert.match(activity, /ResponseContextHeader\(value, streaming = true/);
  assert.match(activity, /ResponseContextHeader\(turn\.content, streaming = false\)/);
  assert.match(activity, /streamSafeMarkdown\(value\)/);
  assert.match(activity, /HighlightedCodeText\(code/);
  assert.match(activity, /\[!\(NOTE\|TIP\|WARNING\|RESULT\)\]/);
  assert.match(activity, /LinkAnnotation\.Url\(url/);
  assert.match(activity, /TextLinkStyles\(style = SpanStyle\(color = Cyan/);
  assert.match(activity, /horizontalScroll\(rememberScrollState\(\)\)/);
});

test('il prompt impedisce marcatori incompleti e abilita blocchi semantici', () => {
  const ipc = fs.readFileSync(path.join(root, 'src/application/register-ipc.js'), 'utf8');
  assert.match(ipc, /> \[!RESULT\]/);
  assert.match(ipc, /> \[!WARNING\]/);
  assert.match(ipc, /Non mostrare marcatori Markdown incompleti/);
  assert.match(ipc, /blocchi con linguaggio dichiarato per codice completo/);
});
