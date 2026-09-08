"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ProductImageZoom({ children, src, label }: { children: ReactNode; src: string; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  return <>
    <button type="button" className="product-image-open" aria-label={`Ingrandisci: ${label}`} onClick={() => setOpened(true)}>{children}</button>
    {opened && createPortal(<dialog ref={element => { dialog.current = element; if (element && !element.open) element.showModal(); }} onClose={() => setOpened(false)} className="product-image-dialog" aria-label={label}>
      <button type="button" className="product-image-close" onClick={() => dialog.current?.close()}>Chiudi</button>
      {/* Native image preserves the actual capture at its full resolution. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} />
    </dialog>, document.body)}
  </>;
}
