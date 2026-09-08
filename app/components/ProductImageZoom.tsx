"use client";

import { useRef, type ReactNode } from "react";

export function ProductImageZoom({ children, src, label }: { children: ReactNode; src: string; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className="product-image-open" aria-label={`Ingrandisci: ${label}`} onClick={() => dialog.current?.showModal()}>{children}</button>
    <dialog ref={dialog} className="product-image-dialog" aria-label={label}>
      <button type="button" className="product-image-close" onClick={() => dialog.current?.close()}>Chiudi</button>
      {/* Native image preserves the actual capture at its full resolution. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} />
    </dialog>
  </>;
}
