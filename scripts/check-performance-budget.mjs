import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const clientRoot = path.resolve("dist/client");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push({ absolute, relative: path.relative(clientRoot, absolute).replaceAll("\\", "/"), bytes: (await stat(absolute)).size });
  }
  return files;
}

const files = await walk(clientRoot);
const sum = (predicate) => files.filter(predicate).reduce((total, file) => total + file.bytes, 0);
const find = (relative) => files.find((file) => file.relative === relative)?.bytes ?? 0;
const kib = (bytes) => Math.round(bytes / 102.4) / 10;

const checks = [
  { label: "JavaScript client", actual: sum((file) => file.relative.endsWith(".js")), maximum: 525 * 1024 },
  // nexus-operational.css appartiene alla pagina statica di fallback e non
  // viene caricato insieme al bundle applicativo: sommarli falserebbe il peso
  // di una singola navigazione reale.
  // Il Continuum e il footer astrale aggiungono meno di 2 KiB senza aumentare
  // JavaScript o immagini: la nuova soglia resta stretta e verificabile.
  { label: "CSS applicazione", actual: sum((file) => file.relative.endsWith(".css") && file.relative !== "nexus-operational.css"), maximum: 100 * 1024 },
  { label: "CSS fallback operativo", actual: find("nexus-operational.css"), maximum: 12 * 1024 },
  { label: "Font tecnico", actual: find("fonts/jetbrains-mono-latin.woff2"), maximum: 42 * 1024 },
  { label: "Cattura Android", actual: find("products/android-home.png"), maximum: 190 * 1024 },
  { label: "Cattura desktop", actual: find("products/desktop-core.png"), maximum: 190 * 1024 },
  { label: "Icona prodotto", actual: find("nexus-icon.png"), maximum: 240 * 1024 },
  { label: "Anteprima social", actual: find("og.png"), maximum: 1280 * 1024 },
];

const failures = [];
for (const check of checks) {
  const state = check.actual > 0 && check.actual <= check.maximum ? "OK" : "FAIL";
  console.log(`${state} ${check.label}: ${kib(check.actual)} KiB / ${kib(check.maximum)} KiB`);
  if (state === "FAIL") failures.push(check.label);
}

if (failures.length > 0) {
  console.error(`Budget prestazioni superato: ${failures.join(", ")}`);
  process.exitCode = 1;
}
