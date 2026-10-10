import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { once } from "node:events";

test("local preview serves product assets and rejects encoded traversal paths", async () => {
  const child = spawn(process.execPath, ["scripts/serve-site.mjs", "--port", "41796"], { cwd: new URL("..", import.meta.url), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  try {
    await Promise.race([once(child.stdout, "data"), once(child, "exit").then(() => { throw new Error("Preview failed to start"); }), new Promise((_, reject) => setTimeout(() => reject(new Error("Preview startup timed out")), 5000).unref())]);
    const origin = "http://127.0.0.1:41796";
    const image = await fetch(`${origin}/products/android-home-astral.png`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    for (const path of ["/%2f..%2f..%2fpackage.json", "/%5c..%5cpackage.json", "/%00package.json", "/%252e%252e/package.json"]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 404);
      assert.ok(!(await response.text()).includes('"devDependencies"'));
    }
  } finally {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await once(child, "exit");
  }
});
