export function createAstralCore(canvas: HTMLCanvasElement, options?: {
  host?: HTMLElement;
  efficient?: boolean;
  reduced?: boolean;
  getReduced?: () => boolean;
  getState?: () => string;
  getEnergy?: () => number;
}): {dispose(): void; setState(state: string): void; getMetrics(): {state: string; phase: number; energy: number; particles: number; draws: number; drawMs: number}};
