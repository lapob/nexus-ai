"use client";

import { useEffect, useState } from "react";

type Metrics = { lcp: number | null; cls: number; inp: number | null };
type LayoutShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean };

const initialMetrics: Metrics = { lcp: null, cls: 0, inp: null };

function format(value: number | null, unit = " ms") {
  return value === null ? "In misura" : `${Math.round(value)}${unit}`;
}

export function ClientPerformancePanel() {
  const [metrics, setMetrics] = useState(initialMetrics);

  useEffect(() => {
    if (typeof PerformanceObserver !== "function") return;
    const observers: PerformanceObserver[] = [];
    const observe = (type: string, callback: PerformanceObserverCallback) => {
      try {
        const observer = new PerformanceObserver(callback);
        observer.observe({ type, buffered: true });
        observers.push(observer);
      } catch { /* The browser does not expose this metric. */ }
    };

    observe("largest-contentful-paint", (list) => {
      const entry = list.getEntries().at(-1);
      if (entry) setMetrics((current) => ({ ...current, lcp: entry.startTime }));
    });
    observe("layout-shift", (list) => {
      const delta = list.getEntries()
        .map((entry) => entry as LayoutShiftEntry)
        .filter((entry) => !entry.hadRecentInput)
        .reduce((total, entry) => total + entry.value, 0);
      if (delta) setMetrics((current) => ({ ...current, cls: current.cls + delta }));
    });
    observe("event", (list) => {
      const longest = Math.max(0, ...list.getEntries().map((entry) => entry.duration));
      if (longest) setMetrics((current) => ({ ...current, inp: Math.max(current.inp ?? 0, longest) }));
    });

    return () => observers.forEach((observer) => observer.disconnect());
  }, []);

  return <section className="client-performance" aria-labelledby="client-performance-title">
    <div>
      <p className="section-label">PRESTAZIONI DI QUESTA SESSIONE</p>
      <h2 id="client-performance-title">Velocità misurata.<br /><em>Privacy intatta.</em></h2>
      <p>Questi valori vengono calcolati nel browser e non sono inviati a NexusNXS.</p>
    </div>
    <dl>
      <div><dt>Caricamento principale</dt><dd><span>{format(metrics.lcp)}</span><small>LCP locale</small></dd></div>
      <div><dt>Stabilità visiva</dt><dd><span>{metrics.cls.toFixed(3)}</span><small>CLS locale</small></dd></div>
      <div><dt>Risposta ai comandi</dt><dd><span>{format(metrics.inp)}</span><small>INP locale</small></dd></div>
    </dl>
  </section>;
}
