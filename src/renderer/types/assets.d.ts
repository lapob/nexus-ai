/**
 * @module renderer/types/assets
 * Dichiarazioni degli asset importati direttamente dal renderer Vite.
 */
declare module '*.css';
declare module '*.png' {
  const source: string;
  export default source;
}
declare module '*.webp' {
  const source: string;
  export default source;
}
