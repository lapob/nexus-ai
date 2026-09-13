/** @module security/pdf-allocation-budget Bounds PDFJS typed-array decode allocations in its dedicated worker. */
function installPdfAllocationBudget(maximumBytes = 64 * 1024 * 1024) {
  let remaining = maximumBytes;
  let exceeded = false;
  const NativeArrayBuffer = ArrayBuffer;
  const reserve = (bytes) => {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > remaining) {
      exceeded = true;
      throw Object.assign(new RangeError('PDF decoded allocation budget exceeded.'), { code: 'PDF_RESOURCE_LIMIT' });
    }
    remaining -= bytes;
  };
  // PDFJS DecodeStream/FlateStream grows decoded buffers with new Uint8Array.
  // Count cumulative allocations, not just individual buffers or V8 heap size.
  for (const name of ['Uint8Array', 'Uint8ClampedArray', 'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array']) {
    const Native = globalThis[name];
    for (const method of ['slice', 'map', 'filter']) {
      const original = Native.prototype[method];
      Object.defineProperty(Native.prototype, method, { configurable: true, writable: true, value: function (...args) {
        reserve(this.byteLength);
        return Reflect.apply(original, this, args);
      } });
    }
    globalThis[name] = new Proxy(Native, {
      construct(Target, args) {
        const value = args[0];
        if (!(value instanceof NativeArrayBuffer)) {
          const count = typeof value === 'number' ? value : value == null ? 0 : value.length;
          reserve(count * Target.BYTES_PER_ELEMENT);
        }
        return Reflect.construct(Target, args);
      }
    });
  }
  const slice = NativeArrayBuffer.prototype.slice;
  NativeArrayBuffer.prototype.slice = function (...args) { reserve(this.byteLength); return Reflect.apply(slice, this, args); };
  globalThis.ArrayBuffer = new Proxy(NativeArrayBuffer, {
    construct(Target, args) { reserve(args[0] ?? 0); return Reflect.construct(Target, args); }
  });
  return () => ({ allocatedBytes: maximumBytes - remaining, exceeded });
}
module.exports = { installPdfAllocationBudget };
