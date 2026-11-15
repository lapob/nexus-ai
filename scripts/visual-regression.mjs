/**
 * Regressione visiva del sito: sezioni principali della home e pagine chiave, desktop e telefono, confrontate con le
 * baseline approvate in qa-artifacts/visual-baselines/site (diff percettivo, rapporto HTML in
 * qa-artifacts/visual-runs/site/report.html). Riusa il motore condiviso di ../.AI/scripts/visual (stesso diff,
 * stesse baseline, stesso tempo deterministico: orologio Playwright fermo e Math.random con seed).
 * Uso: npm run build && npm run qa:visual [-- --update] [--only=prefisso] [--qa-time]
 * Approvazione intenzionale: npm run qa:visual:approve [-- nome | prefisso*]
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shared = path.resolve(root, "..", ".AI", "scripts", "visual", "lib");
if (!fs.existsSync(path.join(shared, "browser.mjs"))) {
  console.error("Motore visivo condiviso non trovato in ../.AI/scripts/visual: verifica solo sulla workstation completa.");
  process.exit(2);
}
if (!fs.existsSync(path.join(root, "dist", "server", "index.js"))) {
  console.error("dist assente: eseguire prima npm run build.");
  process.exit(2);
}
const { closeNetwork, freePort, freezeTime, launch, loadPlaywright, QA_TIME_PARAM, settle, stopProcess } = await import(pathToFileURL(path.join(shared, "browser.mjs")).href);
const require = createRequire(import.meta.url);
const { createSuite } = require(path.join(shared, "baselines.js"));

const argv = process.argv.slice(2);
const update = argv.includes("--update");
// L'orologio fermo di Playwright da solo è deterministico al pixel. Con ?nxs-qa-time (bb759c5) due esecuzioni
// della stessa build differivano dello 0,3–0,7% (home vision/apps desktop), quindi l'aggancio resta opzionale.
const useQaTime = argv.includes("--qa-time");
const only = argv.find((arg) => arg.startsWith("--only="))?.slice(7) ?? "";

const VIEWPORTS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "mobile", width: 390, height: 844, mobile: true },
];
// Sezioni della narrazione (app/page.tsx) e pagine principali; `scroll` porta la sezione in vista.
const SHOTS = [
  { id: "home-hero", path: "/", scroll: "#top" },
  { id: "home-vision", path: "/", scroll: "#vision" },
  { id: "home-interlude", path: "/", scroll: ".astral-interlude" },
  { id: "home-apps", path: "/", scroll: "#apps" },
  { id: "home-presence", path: "/", scroll: ".presence-system" },
  { id: "home-saturn", path: "/", scroll: "[data-cosmic-form='saturn']" },
  { id: "home-security", path: "/", scroll: "#security" },
  { id: "desktop", path: "/desktop" },
  { id: "downloads", path: "/downloads" },
  { id: "security", path: "/security" },
];
const QA_TIME = 4; // secondi di scena: ingresso concluso, forma composta
const TOLERANCE = { threshold: 0.1, maxDiffRatio: 0.002, maxDiffPixels: 150 };

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(root, "scripts", "serve-site.mjs"), "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: root, stdio: "ignore", windowsHide: true });
  const origin = `http://127.0.0.1:${port}`;
  for (const deadline = Date.now() + 30_000; Date.now() < deadline;) {
    try { if ((await fetch(`${origin}/`)).status < 500) return { origin, stop: () => stopProcess(child) }; } catch { /* in avvio */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  stopProcess(child);
  throw new Error("server del sito non pronto");
}

const playwright = await loadPlaywright(root);
const server = await startServer();
const browser = await launch(playwright);
const browserVersion = browser.version();
const suite = createSuite({ root, suite: "site", update, defaults: TOLERANCE });
try {
  for (const viewport of VIEWPORTS) for (const shot of SHOTS) {
    const name = `${shot.id}-${viewport.id}`;
    if (only && !only.split(",").some((prefix) => name.startsWith(prefix))) continue;
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1,
      isMobile: Boolean(viewport.mobile), hasTouch: Boolean(viewport.mobile), colorScheme: "dark", locale: "it-IT", timezoneId: "Europe/Rome" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    try {
      // Rete chiusa: solo il server locale; lo stato del servizio è simulato e stabile.
      await closeNetwork(context, server.origin, { "/api/status": { status: "online", checkedAt: "2026-01-15T09:30:00.000Z" } });
      await freezeTime(context, page);
      // --qa-time: aggancio del sito (tempo della scena congelato, ingresso completo, seed fissi).
      await page.goto(`${server.origin}${shot.path}${useQaTime ? `?${QA_TIME_PARAM}=${QA_TIME}` : ""}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await settle(page, 4000);
      const field = page.locator("canvas.nxs-cosmic-field");
      if (await field.count()) {
        for (let frame = 0; frame < 40 && await field.first().getAttribute("data-qa") !== "ready"; frame += 1) await settle(page, 50);
      }
      if (shot.scroll) {
        await page.locator(shot.scroll).first().evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
        await settle(page, 2500);
      }
      const png = await page.screenshot({ animations: "disabled", caret: "hide" });
      const result = suite.check(name, png);
      if (errors.length) suite.assert(`${name}-integrita`, errors.map((error) => `errore pagina: ${error}`));
      console.log(`${["pass", "approved"].includes(result.status) && !errors.length ? "✔" : "✖"} site ${name} ${result.status}${result.diffRatio !== undefined ? ` ${(result.diffRatio * 100).toFixed(3)}%` : ""}${errors.length ? ` · ${errors[0]}` : ""}`);
    } catch (error) {
      suite.assert(name, [String(error.message).split("\n")[0]]);
      console.log(`✖ site ${name}: ${String(error.message).split("\n")[0]}`);
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  server.stop();
}
const summary = suite.finish({ browser: browserVersion });
console.log(`\n${summary.failed ? "✖" : "✔"} ${summary.total - summary.failed}/${summary.total} · rapporto ${path.relative(root, summary.report)}`);
if (summary.failed && !update) console.log("Se il cambiamento è voluto: npm run qa:visual:approve -- <nome | prefisso*>");
process.exit(summary.failed ? 1 : 0);
