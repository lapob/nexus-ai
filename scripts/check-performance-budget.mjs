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
  { label: "CSS client", actual: sum((file) => file.relative.endsWith(".css")), maximum: 96 * 1024 },
  { label: "Cattura Android", actual: find("products/android-home.png"), maximum: 190 * 1024 },
  { label: "Cattura desktop", actual: find("products/desktop-conversation.png"), maximum: 190 * 1024 },
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
