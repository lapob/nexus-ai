/** @module shared/cosmic-zoom-types Typed direct inspection contract. */
export function createCosmicZoom(host: HTMLElement, options?: { onChange?: (value: number) => void; maximum?: number }): {
  readonly value: number;
  set(value: number): number;
  dispose(): void;
};
