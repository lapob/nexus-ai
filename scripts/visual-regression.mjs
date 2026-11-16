/**
 * Regressione visiva del sito: sezioni principali della home e pagine chiave, desktop e telefono, confrontate con le
 * baseline approvate in qa-artifacts/visual-baselines/site (diff percettivo, rapporto HTML in
 * qa-artifacts/visual-runs/site/report.html). Riusa il motore condiviso di ../.AI/scripts/visual (stesso diff,
 * stesse baseline, stesso tempo deterministico: orologio Playwright fermo e Math.random con seed).
 * Uso: npm run build && npm run qa:visual [-- --update] [--only=prefisso] [--clock-only]
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
// Predefinito: orologio Playwright fermo + ?nxs-qa-time. Con immagini decodificate prima dello scroll e ridisegno
// forzato sulla posizione dello scatto è identico al pixel tra esecuzioni (prima 0,3–0,7% su vision/apps desktop);
// l'orologio da solo lascia qualche granello (fino a ~70 px). --clock-only resta per diagnosi.
const useQaTime = !argv.includes("--clock-only");
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
      // Le immagini pigre (loading="lazy", decoding="async") arrivano in tempo reale, non con l'orologio finto:
      // lo scatto prendeva a volte il riquadro ancora nero, e il loro arrivo spostava la pagina dopo lo scroll.
      // Si caricano e decodificano tutte prima dello scroll; lo scroll si ripete subito prima dello scatto.
      await page.evaluate(() => Promise.all(Array.from(document.images, (image) => {
        image.loading = "eager";
        return (image.complete ? Promise.resolve() : new Promise((done) => { image.addEventListener("load", done, { once: true }); image.addEventListener("error", done, { once: true }); }))
          .then(() => image.decode().catch(() => {}));
      })));
      await settle(page, 200);
      if (shot.scroll) {
        // L'evento "scroll" del browser arriva in tempo reale, mentre l'orologio finto corre in pochi millisecondi:
        // a volte la scena (che a riposo si ridisegna solo su scroll) restava al fotogramma con scroll 0.
        // Si emette l'evento subito, così il ridisegno avviene sempre nella posizione dello scatto.
        const scrollToShot = () => page.locator(shot.scroll).first().evaluate((element) => {
          element.scrollIntoView({ block: "start", behavior: "instant" });
          window.dispatchEvent(new Event("scroll"));
        });
        await scrollToShot();
        await settle(page, 2500);
        await scrollToShot();
        await settle(page, 200);
      }
      if (process.env.NXS_VISUAL_DIAG) console.log("DIAG", name, JSON.stringify(await page.evaluate(() => { const c = document.querySelector("canvas.nxs-cosmic-field"); return { y: scrollY, h: document.documentElement.scrollHeight, scene: c?.dataset.sceneProgress, target: c?.dataset.sceneTarget, draws: c?.dataset.draws, arrival: c?.dataset.arrival, t: performance.now() }; })));
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
