/**
 * @module web/ControlCenter
 * @description Centro di controllo del desktop nella UI unica: modelli e motore, profilo, telefono (associazione QR), memoria, workspace, sistema e dati. Usa soltanto il ponte IPC del preload.
 */
import { m } from 'framer-motion';
import QRCode from 'qrcode';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { setWakeWordEnabled, wakeWordEnabled } from './desktopPresence';
import { desktopBridge } from './platform';

// #region 01 — Tipi del ponte

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
type Tab = 'models' | 'profile' | 'phone' | 'memory' | 'workspace' | 'system' | 'data';
const TABS: Array<[Tab, string]> = [
  ['models', 'Modelli'], ['profile', 'Profilo'], ['phone', 'Telefono'], ['memory', 'Memoria'],
  ['workspace', 'Workspace'], ['system', 'Sistema'], ['data', 'Dati']
];

const bridge = () => desktopBridge as Record<string, (...args: Any[]) => Promise<Any>>;
const formatBytes = (bytes: number) => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
const formatDate = (time: number) => time ? new Date(time).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const message = (error: unknown, fallback: string) => String((error as Error)?.message || fallback).slice(0, 220);

// #endregion

// #region 02 — Contenitore

export function ControlCenter({ onClose, notify }: { onClose: () => void; notify: (text: string) => void }) {
  const [tab, setTab] = useState<Tab>('models');
  const [settings, setSettings] = useState<Any>(null);
  const reload = useCallback(async () => { setSettings((await bridge().bootstrap())?.settings ?? null); }, []);
  useEffect(() => { void reload().catch(() => notify('Impostazioni non leggibili.')); }, [notify, reload]);
  const save = useCallback(async (patch: Any) => {
    try { setSettings(await bridge().saveSettings(patch)); notify('Salvato.'); }
    catch (error) { notify(message(error, 'Salvataggio non riuscito.')); }
  }, [notify]);

  return (
    <m.div className="overlay" role="presentation" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <m.section className="sheet control glass" role="dialog" aria-modal="true" aria-labelledby="control-title" onMouseDown={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}>
        <header><h2 id="control-title">Centro di controllo</h2><button type="button" className="icon-button" aria-label="Chiudi" onClick={onClose}><Icon name="close" /></button></header>
        <div className="tabs" role="tablist" aria-label="Sezioni">
          {TABS.map(([id, label]) => (
            <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} data-active={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {!settings ? <p className="muted">Carico…</p>
            : tab === 'models' ? <Models settings={settings} save={save} notify={notify} />
              : tab === 'profile' ? <Profile settings={settings} save={save} />
                : tab === 'phone' ? <Phone notify={notify} />
                  : tab === 'memory' ? <Memory settings={settings} save={save} notify={notify} />
                    : tab === 'workspace' ? <Workspace notify={notify} />
                      : tab === 'system' ? <System notify={notify} />
                        : <Data notify={notify} onImported={reload} />}
        </div>
      </m.section>
    </m.div>
  );
}

function Switch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="switch-row">
      <span><strong>{label}</strong><small>{hint}</small></span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Row({ children }: { children: ReactNode }) { return <div className="row">{children}</div>; }

// #endregion

// #region 03 — Modelli e motore

function Models({ settings, save, notify }: { settings: Any; save: (patch: Any) => Promise<void>; notify: (text: string) => void }) {
  const [models, setModels] = useState<Any[]>([]);
  const [provisioning, setProvisioning] = useState<Any>(null);
  const [progress, setProgress] = useState('');
  useEffect(() => {
    void bridge().listModels().then((list: Any[]) => setModels(list.filter((item) => item?.capabilities?.chat !== false))).catch(() => setModels([]));
    void bridge().provisioningStatus().then(setProvisioning).catch(() => setProvisioning(null));
    const off = bridge().onProvisioningEvent?.((event: Any) => {
      if (event.type === 'progress' || event.type === 'model-start') setProgress(`${event.model || ''} ${Number.isFinite(event.percent) ? `${Math.round(event.percent)}%` : ''}`.trim());
      if (event.type === 'complete' || event.type === 'cancelled' || event.type === 'error') {
        setProgress(event.type === 'error' ? message(event.error, 'Installazione non riuscita.') : '');
        void bridge().provisioningStatus().then(setProvisioning);
      }
    }) as unknown as (() => void) | undefined;
    return () => off?.();
  }, []);
  const recommended = provisioning?.profiles?.find((profile: Any) => profile.id === provisioning.recommended);
  const current = settings.autoSelectModel !== false ? 'auto' : settings.chatModel || settings.model || 'auto';
  return (
    <>
      <label htmlFor="model-select">Modello di conversazione</label>
      <select id="model-select" className="field" value={current} onChange={(event) => void save(event.target.value === 'auto'
        ? { autoSelectModel: true } : { autoSelectModel: false, chatModel: event.target.value, model: event.target.value })}>
        <option value="auto">Automatico (consigliato)</option>
        {models.map((model) => <option key={model.id} value={model.id}>{model.name || model.id}{model.recommended ? ' · consigliato' : ''}</option>)}
      </select>
      <Switch label="Modalità agente" hint="Usa strumenti in sequenza (calcolo, note, ricerca, azioni sul PC con consenso)." checked={settings.agentMode === true} onChange={(value) => void save({ agentMode: value })} />
      <label htmlFor="temperature">Creatività · {Number(settings.temperature ?? 0.3).toFixed(1)}</label>
      <input id="temperature" type="range" min="0" max="1" step="0.1" defaultValue={settings.temperature ?? 0.3} onChange={(event) => void save({ temperature: Number(event.target.value) })} />
      {provisioning && (
        <div className="card">
          <strong>Motore locale</strong>
          <small>{provisioning.engineAvailable ? 'Motore pronto' : 'Motore non installato'} · {provisioning.installed?.length ?? 0} modelli · disco libero {provisioning.freeDiskBytes ? formatBytes(provisioning.freeDiskBytes) : '—'}</small>
          {!provisioning.engineAvailable && <button type="button" className="secondary" onClick={() => void bridge().openEngineInstaller()}>Installa il motore</button>}
          {recommended && !recommended.complete && (
            provisioning.active || progress
              ? <Row><span className="muted">Installazione {progress}</span><button type="button" className="secondary" onClick={() => void bridge().cancelProvisioning()}>Annulla</button></Row>
              : <button type="button" className="secondary" onClick={async () => {
                if (!window.confirm(`Scaricare il profilo «${recommended.label}» (${formatBytes(recommended.downloadBytes)})?`)) return;
                try { await bridge().startProvisioning(recommended.id); } catch (error) { notify(message(error, 'Installazione non avviata.')); }
              }}>Installa modelli consigliati · {recommended.label} ({formatBytes(recommended.downloadBytes)})</button>
          )}
        </div>
      )}
    </>
  );
}

// #endregion

// #region 04 — Profilo

function Profile({ settings, save }: { settings: Any; save: (patch: Any) => Promise<void> }) {
  const [draft, setDraft] = useState<Any>(settings.personalization ?? {});
  const field = (key: string, label: string, placeholder = '') => (
    <><label htmlFor={`p-${key}`}>{label}</label>
      <input id={`p-${key}`} className="field" value={draft[key] ?? ''} placeholder={placeholder} maxLength={120} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></>
  );
  return (
    <>
      {field('userName', 'Come ti chiami')}
      {field('assistantName', 'Nome dell’assistente', 'NexusNXS')}
      {field('occupation', 'Di cosa ti occupi')}
      {field('interests', 'Interessi')}
      <label htmlFor="p-style">Stile delle risposte</label>
      <select id="p-style" className="field" value={draft.responseStyle ?? 'natural'} onChange={(event) => setDraft({ ...draft, responseStyle: event.target.value })}>
        <option value="concise">Concise</option><option value="natural">Naturali</option><option value="detailed">Dettagliate</option>
      </select>
      <label htmlFor="p-custom">Istruzioni personali</label>
      <textarea id="p-custom" className="field" rows={4} maxLength={2000} value={draft.customInstructions ?? ''} onChange={(event) => setDraft({ ...draft, customInstructions: event.target.value })} />
      <button type="button" className="primary" onClick={() => void save({ personalization: draft })}>Salva profilo</button>
    </>
  );
}

// #endregion

// #region 05 — Telefono

function Phone({ notify }: { notify: (text: string) => void }) {
  const [status, setStatus] = useState<Any>(null);
  const [pairing, setPairing] = useState<Any>(null);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => setStatus(await bridge().remoteStatus()), []);
  useEffect(() => { void refresh().catch(() => setStatus(null)); }, [refresh]);
  useEffect(() => {
    if (!pairing?.code) { setQr(''); return; }
    // Stesso schema della UI precedente: la fotocamera consegna il QR solo all'app NexusNXS.
    const urls: string[] = pairing.urls ?? [];
    const base = urls.find((url) => /\/\/100\.|\.ts\.net/i.test(url)) || urls[0] || status?.publicUrl || status?.localUrl || '';
    if (!base) { setQr(''); return; }
    const server = new URL(base).origin;
    void QRCode.toDataURL(`nexus://remote?pair=${encodeURIComponent(pairing.code)}&server=${encodeURIComponent(server)}`,
      { width: 300, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#A8F4F4', light: '#031010' } }).then(setQr).catch(() => setQr(''));
  }, [pairing, status]);
  const connect = async () => {
    setBusy(true);
    try {
      if (!status?.running) {
        const result = await bridge().setupRemoteAccess('away');
        if (result?.status !== 'ready') {
          notify(result?.status === 'install-required' ? 'Installa Tailscale su PC e telefono con lo stesso account, poi riprova.'
            : result?.status === 'authorization-required' ? 'Completa l’autorizzazione nella pagina aperta, poi riprova.' : 'Collegamento non completato.');
          return;
        }
        await refresh();
      }
      setPairing(await bridge().createRemotePairing());
    } catch (error) { notify(message(error, 'Collegamento non riuscito.')); }
    finally { setBusy(false); }
  };
  return (
    <>
      <p className="muted">Collega NexusNXS Control: inquadra il QR con l’app sul telefono. Il codice vale pochi minuti e si può revocare.</p>
      <button type="button" className="primary" disabled={busy} onClick={() => void connect()}><Icon name="plus" />{busy ? 'Preparo…' : 'Collega un telefono'}</button>
      {pairing && (
        <div className="pairing">
          {qr ? <img src={qr} alt="QR per associare il telefono a NexusNXS" width="220" height="220" /> : null}
          <span className="code" aria-label={`Codice ${pairing.code.split('').join(' ')}`}>{pairing.code}</span>
          <small>Scade alle {new Date(pairing.expiresAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</small>
        </div>
      )}
      <label>Dispositivi collegati</label>
      {status?.devices?.length ? (
        <ul className="list">{status.devices.map((device: Any) => (
          <li key={device.id}><span><strong>{device.name}</strong><small>Ultimo accesso {formatDate(device.lastSeenAt)}</small></span>
            <button type="button" className="icon-button small" aria-label={`Revoca ${device.name}`} onClick={async () => {
              if (!window.confirm(`Revocare l’accesso di «${device.name}»?`)) return;
              setStatus(await bridge().revokeRemoteDevice(device.id));
            }}><Icon name="trash" /></button></li>
        ))}</ul>
      ) : <p className="muted">Nessun telefono collegato.</p>}
    </>
  );
}

// #endregion

// #region 06 — Memoria

function Memory({ settings, save, notify }: { settings: Any; save: (patch: Any) => Promise<void>; notify: (text: string) => void }) {
  const [items, setItems] = useState<Any[] | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ id: number; content: string } | null>(null);
  const refresh = useCallback(async () => setItems(await bridge().listMemories()), []);
  useEffect(() => { void refresh().catch(() => setItems([])); }, [refresh]);
  const visible = (items ?? []).filter((item) => item.content.toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it')));
  return (
    <>
      <Switch label="Memoria automatica" hint="Ricorda fatti utili dalle conversazioni (mai dati sensibili). Spenta: solo ciò che chiedi di ricordare."
        checked={settings.memoryMode === 'automatic'} onChange={(value) => void save({ memoryMode: value ? 'automatic' : 'explicit' })} />
      <Row>
        <input className="field" type="search" placeholder="Cerca nei ricordi…" aria-label="Cerca nei ricordi" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" className="secondary" onClick={async () => { const result = await bridge().exportMemories(); if (result?.status === 'saved') notify(`Esportati ${result.count} ricordi.`); }}>Esporta</button>
      </Row>
      {items === null ? <p className="muted">Carico…</p> : visible.length === 0 ? <p className="muted">Nessun ricordo.</p> : (
        <ul className="list">{visible.map((item) => (
          <li key={item.id}>
            {editing && editing.id === item.id ? (
              <form className="edit" onSubmit={async (event) => {
                event.preventDefault();
                await bridge().updateMemory(item.id, editing.content.trim());
                setEditing(null); await refresh();
              }}>
                <textarea className="field" rows={3} value={editing.content} aria-label="Testo del ricordo" onChange={(event) => setEditing({ id: item.id, content: event.target.value })} />
                <Row><button type="submit" className="primary">Salva</button><button type="button" className="secondary" onClick={() => setEditing(null)}>Annulla</button></Row>
              </form>
            ) : (
              <>
                <span><strong>{item.content}</strong><small>{item.sourceKind === 'derived' ? 'Dedotto' : 'Salvato da te'} · {formatDate(item.updatedAt)}</small></span>
                <span className="actions">
                  <button type="button" className="icon-button small" aria-label="Modifica ricordo" onClick={() => setEditing({ id: item.id, content: item.content })}><Icon name="sliders" /></button>
                  <button type="button" className="icon-button small" aria-label="Dimentica ricordo" onClick={async () => { await bridge().forgetMemory(item.id); await refresh(); }}><Icon name="trash" /></button>
                </span>
              </>
            )}
          </li>
        ))}</ul>
      )}
    </>
  );
}

// #endregion

// #region 07 — Workspace

function Workspace({ notify }: { notify: (text: string) => void }) {
  const [workspace, setWorkspace] = useState<Any>(null);
  useEffect(() => { void bridge().getWorkspace().then(setWorkspace).catch(() => setWorkspace(null)); }, []);
  return (
    <>
      <p className="muted">La cartella di lavoro su cui l’agente può leggere e, con il tuo consenso, modificare file.</p>
      <div className="card"><strong>{workspace?.active ? workspace.name : 'Nessuna cartella'}</strong><small>{workspace?.active ? workspace.path : 'Scegli una cartella per lavorare sui tuoi progetti.'}</small></div>
      <Row>
        <button type="button" className="primary" onClick={async () => { try { setWorkspace(await bridge().selectWorkspace()); } catch (error) { notify(message(error, 'Cartella non disponibile.')); } }}>Scegli cartella</button>
        {workspace?.active && <button type="button" className="secondary" onClick={async () => setWorkspace(await bridge().clearWorkspace())}>Scollega</button>}
      </Row>
    </>
  );
}

// #endregion

// #region 08 — Sistema

function System({ notify }: { notify: (text: string) => void }) {
  const [startup, setStartup] = useState<Any>(null);
  const [update, setUpdate] = useState<Any>(null);
  const [diagnostics, setDiagnostics] = useState<Any>(null);
  const [cache, setCache] = useState<Any>(null);
  const [history, setHistory] = useState<Any[]>([]);
  const [wakeWord, setWakeWord] = useState(wakeWordEnabled);
  useEffect(() => {
    void bridge().startupStatus().then(setStartup).catch(() => null);
    void bridge().updateStatus().then(setUpdate).catch(() => null);
    void bridge().diagnostics().then(setDiagnostics).catch(() => null);
    void bridge().responseCacheStats().then(setCache).catch(() => null);
    void bridge().actionHistory().then((items: Any[]) => setHistory(items.slice(-6).reverse())).catch(() => null);
    const off = bridge().onUpdateEvent?.(setUpdate) as unknown as (() => void) | undefined;
    return () => off?.();
  }, []);
  const updateLabel: Record<string, string> = { disabled: 'Aggiornamenti disattivati', checking: 'Controllo…', current: 'Aggiornato', downloading: 'Scarico l’aggiornamento…', ready: 'Aggiornamento pronto', error: 'Controllo non riuscito' };
  return (
    <>
      <Switch label="Parola di attivazione «Nexus»" hint="Dì «Nexus» e l’entità ti ascolta in voce live. Il riconoscimento è locale; si sospende mentre parli o ascolta."
        checked={wakeWord} onChange={(value) => { setWakeWordEnabled(value); setWakeWord(value); }} />
      {startup?.available && <Switch label="Avvio con Windows" hint="Il motore resta attivo in background; l’interfaccia si apre quando serve."
        checked={startup.enabled === true} onChange={async (value) => setStartup(await bridge().configureStartup(value))} />}
      <div className="card">
        <strong>Versione {update?.version || '—'}</strong>
        <small>{updateLabel[update?.status] || '—'}{update?.status === 'downloading' ? ` · ${Math.round(update.progress || 0)}%` : ''}</small>
        <Row>
          <button type="button" className="secondary" onClick={async () => setUpdate(await bridge().checkForUpdates())}>Controlla aggiornamenti</button>
          {update?.status === 'ready' && <button type="button" className="primary" onClick={() => void bridge().installUpdate()}>Installa e riavvia l’app</button>}
        </Row>
      </div>
      <div className="card">
        <strong>Stato</strong>
        <small>AI {diagnostics?.ai?.ok ? 'pronta' : diagnostics?.ai?.status || '—'} · Voce {diagnostics?.voice?.available ? 'disponibile' : 'non disponibile'} · Motore {diagnostics?.runtime?.available ? 'attivo' : '—'}</small>
        <Row>
          <button type="button" className="secondary" onClick={async () => { const result = await bridge().reindex(); notify(`Indicizzate ${result.notes} note.`); }}>Reindicizza le note</button>
          <button type="button" className="secondary" disabled={!cache?.entries} onClick={async () => { const result = await bridge().clearResponseCache(); setCache({ entries: 0, hits: 0 }); notify(`Cache svuotata (${result.removed}).`); }}>Svuota cache ({cache?.entries ?? 0})</button>
          <button type="button" className="secondary" onClick={() => void bridge().openVoiceSettings()}>Impostazioni voce di Windows</button>
        </Row>
      </div>
      <label>Ultime azioni sul PC</label>
      {history.length ? <ul className="list">{history.map((entry, index) => (
        <li key={`${entry.timestamp}-${index}`}><span><strong>{entry.tool} · {entry.event}</strong><small>{entry.preview || formatDate(Date.parse(entry.timestamp))}</small></span></li>
      ))}</ul> : <p className="muted">Nessuna azione registrata.</p>}
      <button type="button" className="secondary" onClick={async () => { const result = await bridge().undoLastAction(); notify(result?.message || 'Fatto.'); }}>Annulla l’ultima modifica a un file</button>
    </>
  );
}

// #endregion

// #region 09 — Dati

function Data({ notify, onImported }: { notify: (text: string) => void; onImported: () => Promise<void> }) {
  const [passphrase, setPassphrase] = useState('');
  const strong = passphrase.length >= 12;
  return (
    <>
      <p className="muted">Backup cifrato di impostazioni, memoria e cronologia. Senza la frase segreta il file non si può aprire.</p>
      <label htmlFor="backup-pass">Frase segreta (almeno 12 caratteri)</label>
      <input id="backup-pass" className="field" type="password" autoComplete="new-password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
      <Row>
        <button type="button" className="primary" disabled={!strong} onClick={async () => {
          try { const result = await bridge().exportPersonalData({}, passphrase); if (result?.status === 'saved') notify('Backup salvato.'); }
          catch (error) { notify(message(error, 'Backup non riuscito.')); }
        }}>Esporta backup</button>
        <button type="button" className="secondary" disabled={!strong} onClick={async () => {
          if (!window.confirm('Importare un backup? Le impostazioni attuali verranno sostituite.')) return;
          try { const result = await bridge().importPersonalData(passphrase); if (result?.status === 'imported') { notify('Backup importato.'); await onImported(); } }
          catch (error) { notify(message(error, 'Importazione non riuscita.')); }
        }}>Importa backup</button>
      </Row>
    </>
  );
}

// #endregion
