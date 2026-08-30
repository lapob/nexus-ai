"use client";

import { ArrowUp, Keyboard, Mic, Square } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type DemoPhase = "idle" | "listening" | "thinking" | "responding";

const DEMO_RESPONSE = "Ho capito. Nel prodotto completo NexusNXS mantiene il contesto, sceglie il livello di ragionamento e chiede consenso prima di agire sul computer.";

function phaseLabel(phase: DemoPhase): string {
  if (phase === "listening") return "Ti ascolto";
  if (phase === "thinking") return "Sto collegando il contesto";
  if (phase === "responding") return "Risposta pronta";
  return "Tocca il Core e parla";
}

export function NexusCoreDemo() {
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const [textMode, setTextMode] = useState(false);
  const [draft, setDraft] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const timers = useRef<number[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const particles = useMemo(() => Array.from({ length: 28 }, (_, index) => index), []);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  const runDemo = (value: string) => {
    const clean = value.trim() || "Continua la conversazione dal mio telefono";
    clearTimers();
    setPrompt(clean);
    setAnswer("");
    setTextMode(false);
    setPhase("thinking");
    timers.current.push(window.setTimeout(() => {
      setPhase("responding");
      setAnswer(DEMO_RESPONSE);
    }, 620));
    timers.current.push(window.setTimeout(() => setPhase("idle"), 2_900));
  };

  useEffect(() => () => clearTimers(), [clearTimers]);
  useEffect(() => { if (textMode) input.current?.focus(); }, [textMode]);

  const activateVoice = () => {
    if (phase !== "idle") {
      clearTimers();
      setPhase("idle");
      return;
    }
    setTextMode(false);
    setAnswer("");
    setPrompt("");
    setPhase("listening");
    timers.current.push(window.setTimeout(() => runDemo("Organizza il lavoro e continua dal telefono"), 1_250));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    runDemo(draft);
    setDraft("");
  };

  return (
    <section className="core-demo" data-phase={phase} data-text-mode={textMode} aria-labelledby="core-demo-title">
      <div className="core-demo-copy">
        <p className="section-label">/ 05 — UNA SOLA INTERFACCIA</p>
        <h2 id="core-demo-title">Parla al Core.<br /><em>Oppure scrivi.</em></h2>
        <p>La demo resta locale nel browser. Mostra lo stesso linguaggio di PC e Android senza inviare audio, testo o dati al servizio.</p>
      </div>
      <div className="core-demo-stage">
        <div className="core-demo-exchange" aria-live="polite">
          {prompt && <p><small>TU</small>{prompt}</p>}
          {answer && <p><small>NEXUSNXS</small>{answer}</p>}
        </div>
        <button className="core-demo-orb" type="button" onClick={activateVoice} aria-label={phase === "idle" ? "Avvia dimostrazione vocale" : "Interrompi dimostrazione"}>
          <span className="core-demo-particles" aria-hidden="true">{particles.map((particle) => <i key={particle} style={{ "--particle": particle } as React.CSSProperties} />)}</span>
          <span className="core-demo-nucleus" aria-hidden="true"><Mic size={30} strokeWidth={1.35} /></span>
        </button>
        <strong className="core-demo-status"><i aria-hidden="true" />{phaseLabel(phase)}</strong>
        {textMode ? (
          <form className="core-demo-composer" onSubmit={submit}>
            <input ref={input} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Scrivi a NexusNXS" maxLength={240} aria-label="Messaggio dimostrativo" />
            <button type="submit" disabled={!draft.trim()} aria-label="Invia messaggio dimostrativo"><ArrowUp size={18} /></button>
          </form>
        ) : (
          <button className="core-demo-keyboard" type="button" onClick={() => setTextMode(true)}><Keyboard size={18} /><span>Scrivi</span></button>
        )}
        {phase !== "idle" && <span className="core-demo-stop" aria-hidden="true"><Square size={9} fill="currentColor" /></span>}
      </div>
    </section>
  );
}
