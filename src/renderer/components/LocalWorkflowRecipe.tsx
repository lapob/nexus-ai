/** @module renderer/components/LocalWorkflowRecipe Explicit local document workflow through the existing executor. */
import { useEffect, useState } from 'react';
import { documentCopyRecipe } from '../../shared/local-workflow-recipes.mjs';
import type { LocalWorkflowSnapshot, WorkspaceContext } from '../types/nexus';
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
  const active = workflow && !terminal.has(workflow.status);
  useEffect(() => {
    let disposed = false;
    try {
      const id = localStorage.getItem(CHECKPOINT_KEY);
      if (id) void window.nexus.workflowStatus(id).then(value => { if (!disposed) setWorkflow(value); }).catch(() => { if (!disposed) setError('Attività precedente non disponibile. Puoi prepararne una nuova.'); });
    } catch { /* Storage may be unavailable; the native workflow still persists. */ }
    return () => { disposed = true; };
  }, []);

  const next = async (id: string) => {
    const value = await window.nexus.nextWorkflowStep(id);
    if (value) { setWorkflow(value.workflow); setProposal(value.proposal); }
  };
  return <section className="settings-wide local-workflow" aria-label="Ricetta documenti locale">
    <div className="settings-subsection-title"><strong>Copia e consulta</strong><small>Documenti locali · TXT, MD, JSON o CSV · massimo 2 MiB</small></div>
    <p>Conserva l’originale. Ogni passaggio richiede il tuo consenso; la copia non sovrascrive file esistenti.</p>
    <div className="settings-feature-card"><span><strong>{workspace?.active ? workspace.name : 'Scegli una cartella di lavoro'}</strong></span><button className="settings-quiet-action" type="button" disabled={busy || Boolean(active)} aria-label="Scegli cartella della ricetta" onClick={() => void onSelectWorkspace().catch(() => setError('Cartella non selezionata.'))}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 6h7l2 2h9v12H3z" /></svg></button></div>
    {!active && <div className="local-workflow-fields">
      <label className="settings-field"><span>Documento</span><input aria-label="Documento da copiare" maxLength={1024} value={source} disabled={busy} onChange={event => setSource(event.target.value)} placeholder="documenti/appunti.md" /></label>
      <label className="settings-field"><span>Copia</span><input aria-label="Destinazione della copia" maxLength={1024} value={destination} disabled={busy} onChange={event => setDestination(event.target.value)} placeholder="documenti/appunti-copia.md" /></label>
      <button className="settings-quiet-action" type="button" disabled={busy || !workspace?.active || !source.trim() || !destination.trim()} aria-label="Prepara ricetta documenti" onClick={async () => {
        setBusy(true); setError(''); setProposal(null); setReadOutput(null);
        try {
          const current = await window.nexus.getWorkspace();
          if (!current.active || current.path !== workspace?.path) throw new Error('La cartella di lavoro è cambiata. Riapri le impostazioni.');
          const value = await window.nexus.createWorkflow(documentCopyRecipe(source, destination));
          setWorkflow(value);
          try { localStorage.setItem(CHECKPOINT_KEY, value.id); } catch { setError('Attività salvata localmente, ma il collegamento rapido non è persistente.'); }
          await next(value.id);
        } catch (failure) { setError(publicUiError(failure, 'Ricetta non preparata. Verifica i percorsi nella cartella di lavoro.')); }
        finally { setBusy(false); }
      }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg></button>
    </div>}
    {workflow && <div className="local-workflow-state" role="status"><strong>{statusLabel[workflow.status] || workflow.status}</strong><small>{workflow.cursor} / {workflow.stepCount}</small></div>}
    {proposal && active && <div className="local-workflow-preview"><strong>{proposal.summary}</strong><pre>{proposal.preview}</pre><button className="settings-quiet-action" type="button" disabled={busy} aria-label="Approva questo passaggio" onClick={async () => {
      if (!workflow) return; setBusy(true); setError('');
      try { const value = await window.nexus.decideWorkflowStep(workflow.id, proposal.id, true); setWorkflow(value.workflow); setProposal(null); if (typeof value.result?.stdout === 'string') setReadOutput(value.result.stdout.slice(0, 48_000)); if (value.error) setError(value.error.message); }
      catch (failure) { setProposal(null); setError(publicUiError(failure, 'Passaggio non completato.')); try { setWorkflow(await window.nexus.workflowStatus(workflow.id)); } catch { /* Keep last known state. */ } }
      finally { setBusy(false); }
    }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg></button></div>}
    {active && !proposal && <button className="settings-quiet-action" type="button" disabled={busy} aria-label="Anteprima prossimo passaggio" onClick={async () => { setBusy(true); setError(''); try { await next(workflow.id); } catch (failure) { setError(publicUiError(failure, 'Impossibile preparare il passaggio.')); } finally { setBusy(false); } }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg></button>}
    {active && <button className="settings-quiet-action" type="button" aria-label="Interrompi ricetta" onClick={async () => { try { const value = await window.nexus.cancelWorkflow(workflow.id); setWorkflow(value.workflow); setProposal(null); } catch (failure) { setError(publicUiError(failure, 'Interruzione non completata.')); } }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg></button>}
    {workflow?.steps.filter(step => step.result?.receipt).map(step => <small className="local-workflow-receipt" key={step.id}>{step.id === 'copy-document' ? 'Copia' : 'Lettura'} · ricevuta <button className="settings-quiet-action" type="button" aria-label="Copia ID ricevuta" onClick={() => void window.nexus.copyText(step.result?.receipt?.id || '').catch(() => setError('Copia non riuscita.'))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></svg></button></small>)}
    {readOutput !== null && <div className="local-workflow-preview"><strong>Copia consultata</strong><pre>{readOutput || 'Documento vuoto.'}</pre>{readOutput.length >= 48_000 && <small>Anteprima limitata a 48.000 caratteri; il documento rimane completo.</small>}</div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
// #endregion
