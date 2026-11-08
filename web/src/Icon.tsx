/**
 * @module web/Icon
 * @description Icone SVG a tratto, decorative (il nome accessibile resta sul pulsante).
 */
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  menu: 'M4 7h16M4 12h16M4 17h16',
  command: 'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
  arrow: 'M12 19V5M5 12l7-7 7 7',
  stop: 'M7 7h10v10H7z',
  bolt: 'M13 3 4 14h7l-1 7 9-11h-7z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  check: 'M5 12l5 5L20 7',
  retry: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  close: 'M6 6l12 12M18 6 6 18',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  classic: 'M4 5h16v12H4zM8 21h8M12 17v4',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  speaker: 'M4 10v4h4l5 4V6l-5 4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11',
  paperclip: 'M20 11.5l-7.8 7.8a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-7.8 7.8a1.7 1.7 0 0 1-2.4-2.4L14.8 7.3',
  file: 'M14 3H6v18h12V7zM14 3v4h4',
  image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M9 9h0',
  sidebar: 'M4 5h16v14H4zM9 5v14',
  down: 'M12 5v14M5 12l7 7 7-7',
  wave: 'M3 12h2M7 8v8M11 5v14M15 8v8M19 10v4M21 12h0',
  thumbUp: 'M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 3 2l-1 4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7',
  thumbDown: 'M7 13V4H4v9zM7 13l4 7a2 2 0 0 0 3-2l-1-4h5a2 2 0 0 0 2-2.3l-1.2-6A2 2 0 0 0 16.8 4H7'
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
