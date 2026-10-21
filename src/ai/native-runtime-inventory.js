/**
 * @module ai/native-runtime-inventory
 * @description Inventario PE x64 in sola lettura; non equivale ad ammissione o SBOM completa.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// #region 01 — Lettura limitata di import PE normali e ritardati

function invalid() { throw new Error('Immagine PE x64 non valida o non supportata.'); }

function inspectPeImports(bytes) {
  if (!Buffer.isBuffer(bytes)) invalid();
  const range = (offset, size) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0
      || offset + size > bytes.length) invalid();
    return offset;
  };
  const u16 = offset => bytes.readUInt16LE(range(offset, 2));
  const u32 = offset => bytes.readUInt32LE(range(offset, 4));
  if (u16(0) !== 0x5a4d) invalid();
  const pe = u32(0x3c), coff = pe + 4, optional = pe + 24;
  if (u32(pe) !== 0x4550 || u16(coff) !== 0x8664 || u16(optional) !== 0x20b) invalid();
  const count = u16(coff + 2), optionalSize = u16(coff + 16);
  if (!count || count > 96 || optionalSize < 112) invalid();
  range(optional, optionalSize);
  const directoryCount = u32(optional + 108), headersSize = u32(optional + 60);
  if (directoryCount > 16 || 112 + directoryCount * 8 > optionalSize || headersSize > bytes.length) invalid();
  const sections = [], sectionStart = optional + optionalSize;
  range(sectionStart, count * 40);
  for (let index = 0; index < count; index += 1) {
    const header = sectionStart + index * 40;
    const section = { rva: u32(header + 12), size: u32(header + 16), offset: u32(header + 20) };
    range(section.offset, section.size); sections.push(section);
  }
  const rvaOffset = (rva, size) => {
    if (!Number.isSafeInteger(rva) || rva < 0 || rva > 0xffffffff) invalid();
    if (rva < headersSize && rva + size <= headersSize) return range(rva, size);
    const matches = sections.filter(section => rva >= section.rva && rva + size <= section.rva + section.size);
    if (matches.length !== 1) invalid();
    return range(matches[0].offset + rva - matches[0].rva, size);
  };
  const readName = rva => {
    let name = '';
    for (let index = 0; index < 256; index += 1) {
      const char = bytes[rvaOffset(rva + index, 1)];
      if (!char) {
        if (!/^[a-z0-9][a-z0-9._-]*\.dll$/iu.test(name)) invalid();
        return name.toLowerCase();
      }
      if (char < 0x21 || char > 0x7e) invalid();
      name += String.fromCharCode(char);
    }
    invalid();
  };
  const imports = [], delayImports = [];
  for (const [directory, descriptorSize, nameOffset, target] of [[1, 20, 12, imports], [13, 32, 4, delayImports]]) {
    if (directory >= directoryCount) continue;
    const rva = u32(optional + 112 + directory * 8), size = u32(optional + 116 + directory * 8);
    if (!rva && !size) continue;
    if (!rva || size < descriptorSize || size > 1024 * descriptorSize) invalid();
    let terminated = false;
    for (let cursor = 0; cursor + descriptorSize <= size; cursor += descriptorSize) {
      const offset = rvaOffset(rva + cursor, descriptorSize);
      if (bytes.subarray(offset, offset + descriptorSize).every(byte => byte === 0)) { terminated = true; break; }
      // I vecchi descrittori VA dipendono dalla rilocazione: rifiutarli invece di indovinare.
      if (directory === 13 && u32(offset) !== 1) invalid();
      const name = readName(u32(offset + nameOffset));
      if (!target.includes(name)) target.push(name);
    }
    if (!terminated) invalid();
  }
  return { architecture: 'x64', imports: imports.sort(), delayImports: delayImports.sort() };
}

// #endregion

// #region 02 — Inventario completo dei moduli distribuiti, senza eseguirli

async function hashFile(file, signal) {
  signal?.throwIfAborted();
  const hash = crypto.createHash('sha256');
  // Limita gli attraversamenti fs/ASAR in Electron senza saltare byte o usare cache di fiducia.
  for await (const chunk of fs.createReadStream(file, { signal, highWaterMark: 4 * 1024 * 1024 })) {
    signal?.throwIfAborted(); hash.update(chunk);
  }
  return hash.digest('hex');
}

async function inspectNativeRuntime(executablePath, { signal, maxFileBytes = 256 * 1024 * 1024 } = {}) {
  signal?.throwIfAborted();
  if (!path.isAbsolute(executablePath || '')) throw new Error('Serve un percorso eseguibile assoluto.');
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1024 || maxFileBytes > 512 * 1024 * 1024) {
    throw new Error('Limite di lettura PE non valido.');
  }
  const executable = await fs.promises.realpath(executablePath), root = path.dirname(executable);
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  if (entries.length > 4096) throw new Error('Directory runtime troppo estesa.');
  const names = new Set(), files = [];
  for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    signal?.throwIfAborted();
    // Redirect DLL e SxS locali devono essere revisionati prima di accettare il pacchetto.
    if (/\.(?:local|manifest)$/iu.test(entry.name)) throw new Error('Redirect locale del loader non ammesso.');
    if (!/\.(?:dll|exe)$/iu.test(entry.name)) continue;
    const key = entry.name.toLowerCase();
    if (names.has(key) || !entry.isFile() || !/^[a-z0-9][a-z0-9._-]*\.(?:dll|exe)$/iu.test(entry.name)) {
      throw new Error('Nome modulo duplicato, collegamento o file nativo non valido.');
    }
    names.add(key);
    const target = path.join(root, entry.name), canonical = await fs.promises.realpath(target);
    if (path.dirname(canonical) !== root) throw new Error('Modulo nativo esterno alla directory verificata.');
    const before = await fs.promises.stat(canonical, { bigint: true });
    if (!before.isFile() || before.size > BigInt(maxFileBytes)) throw new Error('Dimensione modulo nativo non ammessa.');
    const bytes = await fs.promises.readFile(canonical, { signal });
    const parsed = inspectPeImports(bytes), after = await fs.promises.stat(canonical, { bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ino !== after.ino
      || BigInt(bytes.length) !== after.size) throw new Error('Modulo modificato durante la verifica.');
    files.push({ name: entry.name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), ...parsed });
  }
  if (!files.some(file => file.name.toLowerCase() === path.basename(executable).toLowerCase())) {
    throw new Error('Eseguibile assente dall’inventario PE.');
  }
  const externalImports = new Set();
  for (const file of files) {
    for (const name of [...file.imports, ...file.delayImports]) if (!names.has(name)) externalImports.add(name);
  }
  const inventorySha256 = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return { schemaVersion: 1, executable: path.basename(executable), inventorySha256, files,
    externalImports: [...externalImports].sort(),
    coverage: 'PE files, direct and delay imports; embedded components, dynamic loads and host dependencies require separate review' };
}

module.exports = { hashFile, inspectNativeRuntime, inspectPeImports };

// #endregion
