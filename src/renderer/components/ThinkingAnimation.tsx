/**
 * @module renderer/components/ThinkingAnimation
 * @description Indicatore minimale per pensiero e fallback grafico.
 */
import { motion } from 'framer-motion';

export function ThinkingAnimation({ fallback = false }: { fallback?: boolean }) {
  if (fallback) {
    return (
      <div className="thinking-fallback" aria-label="Visualizer essenziale">
        {[0, 1, 2].map((index) => <motion.span key={index} animate={{ opacity: [0.2, 0.9, 0.2] }} transition={{ duration: 1.5, repeat: Infinity, delay: index * 0.16 }} />)}
      </div>
    );
  }
  return (
    <motion.span
      className="thinking-mark"
      aria-label="Elaborazione in corso"
      animate={{ rotate: 360 }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
    >
      <span className="thinking-orbit" />
      <motion.i
        animate={{ scale: [0.72, 1.12, 0.72], opacity: [0.45, 1, 0.45] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.span>
  );
}
