/** @module renderer/components/NexusSymbol Shared offline Material Symbols, Apache-2.0; see bundled third-party notices. */
import { symbolPaths } from './NexusSymbolPaths';

type SymbolName = keyof typeof symbolPaths;

export function NexusSymbol({ name }: { name: SymbolName }) {
  return <svg width="18" height="18" viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
    <path fill="currentColor" stroke="none" d={symbolPaths[name]} />
  </svg>;
}
