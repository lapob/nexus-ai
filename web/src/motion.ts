/**
 * @module web/motion
 * @description Linguaggio di movimento unico della UI (web e desktop): una sola molla, fogli che
 * emergono come il nucleo che si ricompone, messaggi che si materializzano. Le feature di
 * framer-motion arrivano in un chunk pigro (`loadMotionFeatures`), fuori dal budget d'avvio.
 * La riduzione del movimento passa da MotionConfig (reducedMotion="user") e dal layer CSS `motion`.
 */
import type { Transition } from 'framer-motion';

const EMPHASIZED = [0.2, 0, 0, 1] as const;
const ACCELERATE = [0.4, 0, 1, 1] as const;

/** Molla condivisa: assestamento rapido, nessun rimbalzo visibile. */
export const SPRING: Transition = { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 };

/** Feature di animazione caricate dopo il primo frame (vedi LazyMotion in App). */
export const loadMotionFeatures = () => import('./motion-features').then((module) => module.default);

/** Fogli e dialoghi: salgono leggermente e si assestano; escono accelerando, più brevi. */
export const SHEET = {
  initial: { opacity: 0, y: 22, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 14, scale: 0.985, transition: { duration: 0.16, ease: ACCELERATE } },
  transition: SPRING
};

/** Velo dei fogli: dissolvenza morbida, più lunga in entrata che in uscita. */
export const VEIL = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.24, ease: EMPHASIZED } },
  exit: { opacity: 0, transition: { duration: 0.18, ease: ACCELERATE } }
};

/**
 * Messaggi: la domanda parte dal composer (in basso a destra) con la molla; la risposta si
 * materializza dal nucleo, da sfocata a nitida. Il filtro si rimuove a fine corsa (`none`),
 * così il testo resta nitido e non crea un contesto di composizione permanente.
 */
export const MESSAGE = {
  user: {
    initial: { opacity: 0, x: 18, y: 10, scale: 0.96 },
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
    transition: { ...SPRING, stiffness: 480, damping: 34 }
  },
  assistant: {
    initial: { opacity: 0, y: 14, filter: 'blur(6px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
    transition: { duration: 0.46, ease: EMPHASIZED }
  }
};

/** Pannello documento: scivola dal bordo destro. */
export const SIDE_PANEL = {
  initial: { opacity: 0, x: 36 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 28, transition: { duration: 0.18, ease: ACCELERATE } },
  transition: SPRING
};
