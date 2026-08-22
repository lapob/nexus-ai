import { rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [resolve(projectRoot, "dist")];

for (const target of targets) {
  const projectRelative = relative(projectRoot, target);
  if (!projectRelative || projectRelative.startsWith("..") || isAbsolute(projectRelative)) {
    throw new Error(`Refusing to remove path outside the project: ${target}`);
  }
  await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
