/**
 * @module renderer/components/ModelSwitcher
 * @description Selettore rapido del modello conversazionale, separato dalle impostazioni avanzate.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { HardwareProfile, ModelDescriptor, NexusSettings } from '../types/nexus';
import { publicUiError } from '../systems/PublicError';
import { QuietClose } from './QuietClose';
import { modelDisplayName, uniquePresentedModels } from '../systems/ModelPresentation';

// #region 01 — Contratto e metadati leggibili

interface ModelSwitcherProps {
  open: boolean;
  settings: NexusSettings | null;
  models: ModelDescriptor[];
  hardware: HardwareProfile | null;
  remoteInference?: boolean;
  onClose: () => void;
  onSelect: (modelId: string) => Promise<void>;
  onRefresh: (quiet?: boolean) => Promise<ModelDescriptor[]>;
}

function modelMeta(model: ModelDescriptor, remoteInference: boolean): string {
  if (!remoteInference && model.compatible === false) return 'Non consigliata su questo computer';
  if (model.recommended) return 'Scelta consigliata';
  return 'Disponibile';
}

function hardwareLabel(hardware: HardwareProfile | null): string {
  return hardware ? 'Scelta adattata automaticamente a questo computer' : 'Preparazione della scelta migliore';
}

// #endregion

// #region 02 — Superficie rapida

export function ModelSwitcher({
  open, settings, models, hardware, remoteInference = false, onClose, onSelect, onRefresh
}: ModelSwitcherProps) {
  const [query, setQuery] = useState('');
  const [busyModel, setBusyModel] = useState('');
  const [message, setMessage] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const current = settings?.chatModel || settings?.model || settings?.fastModel || '';
  const chatModels = useMemo(() => uniquePresentedModels(models
    .filter((model) => model.capabilities?.chat !== false)
    .filter((model) => !/^nexus-nexus-personal(?::|$)/i.test(model.id)), current)
    .filter((model) => modelDisplayName(model).toLowerCase().includes(query.trim().toLowerCase())), [current, models, query]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let refreshTimer: number | undefined;
    setQuery('');
    setMessage('');
    const focusTimer = window.setTimeout(() => (search.current || closeButton.current)?.focus({ preventScroll: true }), 40);
    // Pianifica la sincronizzazione successiva solo al termine di quella
    // corrente: su PC lenti o provider offline le richieste non si accavallano.
    const refresh = async () => {
      try {
        await onRefresh(true);
      } catch {
        // La superficie conserva l'ultimo elenco valido; il processo principale
        // registra la causa senza esporre dettagli tecnici nel renderer.
      } finally {
        if (!cancelled) refreshTimer = window.setTimeout(refresh, 3_000);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      window.clearTimeout(focusTimer);
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [onRefresh, open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="model-switcher-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
          <motion.section className="model-switcher" role="dialog" aria-modal="true" aria-labelledby="model-switcher-title" initial={{ opacity: 0, y: 8, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.995 }} transition={{ duration: 0.18, ease: 'easeInOut' }}>
            <h2 className="sr-only" id="model-switcher-title">Modelli</h2>
            <QuietClose ref={closeButton} onClick={onClose} label="Chiudi modelli" />
            <p className="model-switcher-context">{remoteInference ? 'Modelli disponibili sul servizio NexusNXS' : hardwareLabel(hardware)}</p>
            {models.length > 6 && (
              <label className="model-search">
                <span className="sr-only">Cerca modello</span>
                <input ref={search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca…" />
              </label>
            )}
            <div className="model-switcher-list" role="listbox" aria-label="Modelli">
              {chatModels.map((model) => {
                const selected = model.id === current;
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-compatible={model.compatible !== false}
                    key={model.id}
                    disabled={Boolean(busyModel)}
                    onClick={async () => {
                      setBusyModel(model.id);
                      setMessage('');
                      try {
                        await onSelect(model.id);
                        onClose();
                      } catch (error) {
                        setMessage(publicUiError(error, 'Non è stato possibile cambiare modello.'));
                      } finally {
                        setBusyModel('');
                      }
                    }}
                  >
                    <span className="model-copy">
                      <strong>{modelDisplayName(model)}</strong>
                      <small>{modelMeta(model, remoteInference)}</small>
                    </span>
                    {selected && <span className="model-active-dot" aria-hidden="true" />}
                    {busyModel === model.id && <em>Selezione…</em>}
                  </button>
                );
              })}
              {!chatModels.length && <p className="model-empty">{remoteInference ? 'Servizio NexusNXS offline o non disponibile.' : 'Nessun modello disponibile.'}</p>}
            </div>
            {message && <p className="model-switcher-status" role="status">{message}</p>}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// #endregion
