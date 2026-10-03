const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { download } = require('app-builder-lib/out/binDownload');

// Exercise the builder's actual download entry point after its scoped migration
// to @electron/get 5. Only a local synthetic artifact is transferred.
for (const validChecksum of [true, false]) {
  test(`builder downloader ${validChecksum ? 'preserves verified bytes' : 'rejects a checksum mismatch'}`, { timeout: 15_000 }, async (t) => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-builder-download-'));
    t.after(() => fs.rm(temporary, { recursive: true, force: true }));
    const content = Buffer.from('NexusNXS synthetic toolchain artifact\n');
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'Content-Length': content.length, 'Cache-Control': 'no-store' });
      response.end(content);
    });
    t.after(() => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/fixture-${path.basename(temporary)}.bin`;
    const output = path.join(temporary, 'artifact.bin');
    const checksum = validChecksum ? createHash('sha256').update(content).digest('hex') : '0'.repeat(64);
    if (validChecksum) {
      await download(url, output, checksum);
      assert.deepEqual(await fs.readFile(output), content);
    } else {
      await assert.rejects(download(url, output, checksum), /checksum|mismatch/i);
      await assert.rejects(fs.stat(output), { code: 'ENOENT' });
    }
  });
}
