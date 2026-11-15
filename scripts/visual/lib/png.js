/**
 * @module scripts/visual/lib/png
 * @description Lettura e scrittura PNG RGBA per la regressione visiva (pngjs, nessuna dipendenza nativa).
 */
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

/** @typedef {{ width: number, height: number, data: Buffer | Uint8Array }} Image */

/** @returns {Image} */
function decode(bytes) {
  const png = PNG.sync.read(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  return { width: png.width, height: png.height, data: png.data };
}

function readImage(file) { return decode(fs.readFileSync(file)); }

/** @param {Image} image */
function encode(image) {
  const png = new PNG({ width: image.width, height: image.height });
  Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength).copy(png.data);
  return PNG.sync.write(png, { colorType: 6 });
}

function writeImage(file, image) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encode(image));
}

/** Immagine vuota (trasparente) delle dimensioni date. */
function blank(width, height) { return { width, height, data: Buffer.alloc(width * height * 4) }; }

module.exports = { blank, decode, encode, readImage, writeImage };
