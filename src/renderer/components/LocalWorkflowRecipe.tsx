/** @module renderer/components/LocalWorkflowRecipe Explicit local document workflow through the existing executor. */
import { useEffect, useRef, useState } from 'react';
import { documentCopyRecipe } from '../../shared/local-workflow-recipes.mjs';
import type { LocalWorkflowSnapshot, LocalWorkflowSummary, WorkspaceContext } from '../types/nexus';
import { publicUiError } from '../systems/PublicError';

// #region Local recipe surface
const CHECKPOINT_KEY = 'nexus.document-workflow.v1';
const terminal = new Set(['complete', 'denied', 'cancelled', 'failed', 'reverted']);
const statusLabel: Record<string, string> = { pending: 'Da preparare', 'awaiting-approval': 'In attesa del tuo consenso', executing: 'In corso', complete: 'Completato', denied: 'Non autorizzato', cancelled: 'Interrotto', failed: 'Non completato', reverted: 'Ripristinato' };

export function LocalWorkflowRecipe({ workspace, onSelectWorkspace }: { workspace: WorkspaceContext | null; onSelectWorkspace: () => Promise<void> }) {
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [workflow, setWorkflow] = useState<LocalWorkflowSnapshot | null>(null);
  const [proposal, setProposal] = useState<{ id: string; summary: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [readOutput, setReadOutput] = useState<string | null>(null);
  const [history, setHistory] = useState<LocalWorkflowSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(20);
  const [truncated, setTruncated] = useState(false);
  const scope = useRef(0);
  const workspaceKey = workspace?.active ? workspace.path : '';
  const latestWorkspace = useRef(workspaceKey); latestWorkspace.current = workspaceKey;
  const current = (token: number, key: string) => token === scope.current && key === latestWorkspace.current;
  const active = workflow && !terminal.has(workflow.status) && !workflow.recoveryRequired;
  const refreshHistory = async (token: number, key: string, limit = historyLimit) => {
    const value = await window.nexus.listWorkflows({ limit });
    if (current(token, key)) { setHistory(value.items); setTruncated(value.truncated); }
    return value.items;
  };
  useEffect(() => {
    const token = ++scope.current, key = workspaceKey;
    setWorkflow(null); setProposal(null); setReadOutput(null); setHistory([]); setTruncated(false); setBusy(false); setError(''); setHistoryLimit(20);
    if (key) void (async () => {
      try {
        const items = await refreshHistory(token, key, 20);
        if (!current(token, key)) return;
        let id = ''; try { id = localStorage.getItem(CHECKPOINT_KEY) || ''; } catch { /* Native history remains available. */ }
        if (id && items.some(item => item.id === id)) {
          const value = await window.nexus.workflowStatus(id);
          if (current(token, key)) setWorkflow(value);
        }
      } catch { if (current(token, key)) setError('Attività recenti non disponibili. Puoi riprovare dalla cronologia.'); }
    })();
    return () => { ++scope.current; };
  }, [workspaceKey]);

  const next = async (id: string, token: number, key: string) => {
    const value = await window.nexus.nextWorkflowStep(id);
    if (value && current(token, key)) { setWorkflow(value.workflow); setProposal(value.proposal); }
  };
  // #endregion
  // #region Recipe and persisted history
  return <section className="settings-wide local-workflow" aria-label="Ricetta documenti locale">
    <div className="settings-subsection-title"><strong>Copia e consulta</strong><small>Documenti locali · TXT, MD, JSON o CSV · massimo 2 MiB</small></div>
    <p>Conserva l’originale. Ogni passaggio richiede il tuo consenso; la copia non sovrascrive file esistenti.</p>
    <div className="local-workflow-history-heading"><span>Attività recenti</span><button className="settings-quiet-action" type="button" disabled={busy || !workspaceKey} aria-label="Mostra attività recenti" aria-expanded={historyOpen} aria-controls="local-workflow-history" onClick={async () => {
      const token = scope.current, key = workspaceKey;
      setHistoryOpen(!historyOpen); setError('');
      if (!historyOpen) { setBusy(true); try { await refreshHistory(token, key); } catch { if (current(token, key)) setError('Cronologia non disponibile. Riprova.'); } finally { if (current(token, key)) setBusy(false); } }
    }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 4v5h5M3.5 9a9 9 0 1 1 .5 7M12 7v5l3 2" /></svg></button></div>
    {historyOpen && <div id="local-workflow-history" className="local-workflow-history">
      {history.length === 0 && <small>Nessuna attività in questa cartella.</small>}
      {history.map(item => <button key={item.id} className="local-workflow-history-item" type="button" disabled={busy} aria-pressed={workflow?.id === item.id} onClick={async () => {
        const token = scope.current, key = workspaceKey; setBusy(true); setError(''); setProposal(null); setReadOutput(null);
        try { const value = await window.nexus.workflowStatus(item.id); if (current(token, key)) { setWorkflow(value); try { localStorage.setItem(CHECKPOINT_KEY, value.id); } catch { /* History does not depend on browser storage. */ } } }
        catch (failure) { if (current(token, key)) setError(publicUiError(failure, 'Attività non disponibile.')); }
        finally { if (current(token, key)) setBusy(false); }
      }}><strong>{item.summary || 'Attività locale'}</strong><small>{item.recoveryRequired ? 'Esito da verificare' : statusLabel[item.status] || item.status} · {item.cursor}/{item.stepCount}</small></button>)}
      {truncated && <small>Elenco limitato alle attività leggibili più recenti.</small>}
      {truncated && historyLimit < 100 && <button type="button" className="settings-quiet-action" aria-label="Mostra altre attività" disabled={busy} onClick={async () => {
        const token = scope.current, key = workspaceKey; setBusy(true); setError('');
        try { await refreshHistory(token, key, 100); if (current(token, key)) setHistoryLimit(100); }
        catch { if (current(token, key)) setError('Altre attività non disponibili. Riprova.'); }
        finally { if (current(token, key)) setBusy(false); }
      }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>}
    </div>}
    <div className="settings-feature-card"><span><strong>{workspace?.active ? workspace.name : 'Scegli una cartella di lavoro'}</strong></span><button className="settings-quiet-action" type="button" disabled={busy || Boolean(active)} aria-label="Scegli cartella della ricetta" onClick={() => void onSelectWorkspace().catch(() => setError('Cartella non selezionata.'))}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 6h7l2 2h9v12H3z" /></svg></button></div>
    {!active && <div className="local-workflow-fields">
      <label className="settings-field"><span>Documento</span><input aria-label="Documento da copiare" maxLength={1024} value={source} disabled={busy} onChange={event => setSource(event.target.value)} placeholder="documenti/appunti.md" /></label>
      <label className="settings-field"><span>Copia</span><input aria-label="Destinazione della copia" maxLength={1024} value={destination} disabled={busy} onChange={event => setDestination(event.target.value)} placeholder="documenti/appunti-copia.md" /></label>
      <button className="settings-quiet-action" type="button" disabled={busy || !workspace?.active || !source.trim() || !destination.trim()} aria-label="Prepara ricetta documenti" onClick={async () => {
        const token = scope.current, key = workspaceKey;
        setBusy(true); setError(''); setProposal(null); setReadOutput(null);
        try {
          const selectedWorkspace = await window.nexus.getWorkspace();
          if (!current(token, key)) return;
          if (!selectedWorkspace.active || selectedWorkspace.path !== workspace?.path) throw new Error('La cartella di lavoro è cambiata. Riapri le impostazioni.');
          const value = await window.nexus.createWorkflow(documentCopyRecipe(source, destination));
          if (!current(token, key)) return;
          setWorkflow(value);
          try { localStorage.setItem(CHECKPOINT_KEY, value.id); } catch { setError('Attività salvata localmente, ma il collegamento rapido non è persistente.'); }
          await next(value.id, token, key); await refreshHistory(token, key);
        } catch (failure) { if (current(token, key)) setError(publicUiError(failure, 'Ricetta non preparata. Verifica i percorsi nella cartella di lavoro.')); }
        finally { if (current(token, key)) setBusy(false); }
      }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg></button>
    </div>}
    {workflow && <div className="local-workflow-state" role="status"><strong>{workflow.recoveryRequired ? 'Esito da verificare' : statusLabel[workflow.status] || workflow.status}</strong><small>{workflow.cursor} / {workflow.stepCount}</small></div>}
    {workflow?.recoveryRequired && <p role="status">L’attività è stata interrotta. Controlla il risultato prima di ripeterla.</p>}
    {proposal && active && <div className="local-workflow-preview"><strong>{proposal.summary}</strong><pre>{proposal.preview}</pre><button className="settings-quiet-action" type="button" disabled={busy} aria-label="Approva questo passaggio" onClick={async () => {
      if (!workflow) return; const token = scope.current, key = workspaceKey; setBusy(true); setError('');
      try { const value = await window.nexus.decideWorkflowStep(workflow.id, proposal.id, true); if (!current(token, key)) return; setWorkflow(value.workflow); setProposal(null); if (typeof value.result?.stdout === 'string') setReadOutput(value.result.stdout.slice(0, 48_000)); if (value.error) setError(value.error.message); await refreshHistory(token, key); }
      catch (failure) { if (!current(token, key)) return; setProposal(null); setError(publicUiError(failure, 'Passaggio non completato.')); try { const value = await window.nexus.workflowStatus(workflow.id); if (current(token, key)) setWorkflow(value); } catch { /* Keep last known state. */ } }
      finally { if (current(token, key)) setBusy(false); }
    }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg></button></div>}
    {active && !proposal && workflow.status !== 'executing' && <button className="settings-quiet-action" type="button" disabled={busy} aria-label="Anteprima prossimo passaggio" onClick={async () => { const token = scope.current, key = workspaceKey; setBusy(true); setError(''); try { await next(workflow.id, token, key); } catch (failure) { if (current(token, key)) setError(publicUiError(failure, 'Impossibile preparare il passaggio.')); } finally { if (current(token, key)) setBusy(false); } }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg></button>}
    {active && <button className="settings-quiet-action" type="button" aria-label="Interrompi ricetta" onClick={async () => { const token = scope.current, key = workspaceKey; try { const value = await window.nexus.cancelWorkflow(workflow.id); if (!current(token, key)) return; setWorkflow(value.workflow); setProposal(null); await refreshHistory(token, key); } catch (failure) { if (current(token, key)) setError(publicUiError(failure, 'Interruzione non completata.')); } }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg></button>}
    {workflow?.steps.filter(step => step.result?.receipt).map(step => <small className="local-workflow-receipt" key={step.id}>{step.id === 'copy-document' ? 'Copia' : 'Lettura'} · ricevuta <button className="settings-quiet-action" type="button" aria-label="Copia ID ricevuta" onClick={() => void window.nexus.copyText(step.result?.receipt?.id || '').catch(() => setError('Copia non riuscita.'))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></svg></button></small>)}
    {readOutput !== null && <div className="local-workflow-preview"><strong>Copia consultata</strong><pre>{readOutput || 'Documento vuoto.'}</pre>{readOutput.length >= 48_000 && <small>Anteprima limitata a 48.000 caratteri; il documento rimane completo.</small>}</div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
// #endregion
