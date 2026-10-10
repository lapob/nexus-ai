import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// CI installs Chromium in Playwright's default cache. Keep the portable local
// cache only on the workstation, and honor an explicitly configured cache.
const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH
  || (!process.env.CI ? path.resolve(root, "..", ".toolchains", "playwright") : undefined);
const cli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const result = spawnSync(process.execPath, [cli, "test", ...process.argv.slice(2)], {
  cwd: root,
  env: { ...process.env, ...(browsers ? { PLAYWRIGHT_BROWSERS_PATH: browsers } : {}) },
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
