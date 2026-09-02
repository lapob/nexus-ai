/**
 * @module renderer/components/QuietClose
 * @description Chiusura universale senza glifo di sistema o chrome da finestra.
 */
import { forwardRef } from 'react';

interface QuietCloseProps {
  label: string;
  onClick: () => void;
  className?: string;
}

export const QuietClose = forwardRef<HTMLButtonElement, QuietCloseProps>(function QuietClose(
  { label, onClick, className = '' },
  ref
) {
  return (
    <button
      ref={ref}
      className={`quiet-close ${className}`.trim()}
      type="button"
      onClick={onClick}
      aria-label={label}
    >
      <span aria-hidden="true"><i /><i /></span>
    </button>
  );
});
