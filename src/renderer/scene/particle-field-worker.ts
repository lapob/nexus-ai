/**
 * @module renderer/scene/particle-field-worker
 * @description Genera il campo neurale fuori dal thread dell'interfaccia.
 */

function randomSigned(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

self.onmessage = (event: MessageEvent<{ count: number }>) => {
  const count = Math.max(1, Math.min(600_000, Math.floor(event.data.count)));
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const seedOffset = index * 4;
    const s1 = (randomSigned(index * 0.93 + 1.7) + 1) * 0.5;
    const s2 = (randomSigned(index * 1.31 + 8.2) + 1) * 0.5;
    const s3 = (randomSigned(index * 2.17 + 3.4) + 1) * 0.5;
    const s4 = (randomSigned(index * 3.73 + 9.9) + 1) * 0.5;
    const layer = s4 < 0.68 ? 0 : s4 < 0.9 ? 1 : 2;
    const x = (s1 * 2 - 1) * (5.75 + layer * 0.38);
    const zDensity = Math.pow(s2, 1.55) * (s3 < 0.5 ? -1 : 1);
    const z = zDensity * (2.65 + layer * 0.52);
    const ridge = Math.sin(x * 0.58 + z * 1.12) * (0.22 + layer * 0.18);
    const y = ridge + randomSigned(index * 4.19) * (0.08 + layer * 0.16) + (layer - 0.5) * 0.14;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    seeds[seedOffset] = s1;
    seeds[seedOffset + 1] = s2;
    seeds[seedOffset + 2] = s3;
    seeds[seedOffset + 3] = s4;
  }
  self.postMessage({ count, positions, seeds }, { transfer: [positions.buffer, seeds.buffer] });
};

export {};
