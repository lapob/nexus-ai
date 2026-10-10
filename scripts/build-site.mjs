import { build } from "vite";
import { readFile, unlink, writeFile } from "node:fs/promises";

await build({ build: { outDir: "dist/client", manifest: true, rollupOptions: { input: "app/entry-client.tsx" } } });
const manifest = JSON.parse(await readFile("dist/client/.vite/manifest.json", "utf8"));
const entry = manifest["app/entry-client.tsx"];
if (!entry?.isEntry || !entry.file) throw new Error("Missing site client entry");
const styles = new Set();
const visited = new Set();
function collect(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  for (const imported of chunk.imports ?? []) collect(imported);
  for (const css of chunk.css ?? []) styles.add(`/${css}`);
}
collect("app/entry-client.tsx");
await unlink("dist/client/.vite/manifest.json");
await build({
  publicDir: false,
  define: { __NEXUS_SITE_ASSETS__: JSON.stringify({ script: `/${entry.file}`, styles: [...styles] }) },
  ssr: { target: "webworker", noExternal: true },
  build: { ssr: "worker/index.ts", outDir: "dist/server", rollupOptions: { output: { entryFileNames: "index.js" } } },
});
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
delete config.$schema;
config.main = "index.js";
config.assets = { ...config.assets, directory: "../client", run_worker_first: true };
await writeFile("dist/server/wrangler.json", `${JSON.stringify(config, null, 2)}\n`);
