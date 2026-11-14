/**
 * @module web/Projects
 * @description Progetti come in Claude: cartelle di conversazioni con istruzioni e file propri, usati come contesto di ogni risposta. Tutto resta su questo dispositivo.
 */
import { AnimatePresence, m } from 'framer-motion';
import { SHEET, VEIL } from './motion';
import { useEffect, useRef, useState } from 'react';
import { acceptedMime, formatSize } from './attachments';
import { Icon } from './Icon';
import { PROJECT_LIMITS, createProject, deleteProject, openProject, uid, updateProject, useStore, type Project, type ProjectFile } from './store';

const TEXT_ACCEPT = 'text/*,.md,.csv,.tsv,.log,.json,.xml,.yaml,.yml,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.html,.css,.sql,.sh,.ps1,.ini,.toml,.srt,.vtt,.tex';

/** Legge solo file di testo, entro i limiti del progetto; gli errori sono già frasi per l'utente. */
export async function readProjectFiles(files: File[], current: ProjectFile[]): Promise<{ accepted: ProjectFile[]; errors: string[] }> {
  const accepted: ProjectFile[] = [];
  const errors: string[] = [];
  let total = current.reduce((sum, file) => sum + file.text.length, 0);
  for (const file of files) {
    if (current.length + accepted.length >= PROJECT_LIMITS.files) { errors.push(`Un progetto contiene al massimo ${PROJECT_LIMITS.files} file.`); break; }
    const mime = acceptedMime(file);
    if (!mime || mime.startsWith('image/') || mime === 'application/pdf') { errors.push(`${file.name}: nei progetti vanno file di testo o codice.`); continue; }
    const text = (await file.text()).replace(/\u0000/g, '');
    if (!text.trim()) { errors.push(`${file.name}: file vuoto.`); continue; }
    if (text.length > PROJECT_LIMITS.fileChars) { errors.push(`${file.name}: supera ${Math.round(PROJECT_LIMITS.fileChars / 1000)} mila caratteri.`); continue; }
    if (total + text.length > PROJECT_LIMITS.totalChars) { errors.push('Spazio del progetto esaurito: rimuovi un file prima di aggiungerne altri.'); break; }
    total += text.length;
    accepted.push({ id: uid(), name: file.name.slice(0, 120), size: file.size, text });
  }
  return { accepted, errors };
}

/** Sezione «Progetti» della barra laterale: elenco, apertura (filtra la cronologia) e creazione. */
export function ProjectNav({ onEdit, disabled }: { onEdit: (id: string) => void; disabled: boolean }) {
  const projects = useStore((state) => state.projects);
  const projectView = useStore((state) => state.projectView);
  const projectOf = useStore((state) => state.projectOf);
  const [open, setOpen] = useState(true);
  const count = (id: string) => Object.values(projectOf).filter((value) => value === id).length;
  return (
    <section className="projects" aria-label="Progetti">
      <header className="projects-head">
        <button type="button" className="projects-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <Icon name="chevron" size={14} />Progetti
        </button>
        <button type="button" className="icon-button small" aria-label="Nuovo progetto" title="Nuovo progetto" disabled={disabled || projects.length >= PROJECT_LIMITS.projects}
          onClick={() => onEdit(createProject())}><Icon name="folderPlus" size={17} /></button>
      </header>
      <AnimatePresence initial={false}>
        {open && (
          <m.ul className="project-list" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}>
            {projects.length === 0 && <li className="muted project-empty">Raccogli chat, istruzioni e file per argomento.</li>}
            {projects.map((project) => (
              <li key={project.id} className="project-row" data-active={projectView === project.id}>
                <button type="button" className="project-open" aria-pressed={projectView === project.id} disabled={disabled}
                  onClick={() => openProject(projectView === project.id ? null : project.id)} title={project.name}>
                  <Icon name="folder" size={17} /><span>{project.name}</span><small>{count(project.id) || ''}</small>
                </button>
                <button type="button" className="icon-button small" aria-label={`Impostazioni di ${project.name}`} title="Istruzioni e file" onClick={() => onEdit(project.id)}><Icon name="sliders" size={16} /></button>
              </li>
            ))}
          </m.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Scheda del progetto: nome, istruzioni, file. Le modifiche si applicano subito; eliminare chiede conferma. */
export function ProjectSheet({ projectId, onClose, notify }: { projectId: string; onClose: () => void; notify: (message: string) => void }) {
  const project = useStore((state) => state.projects.find((item) => item.id === projectId) ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => { if (!project) onClose(); }, [project, onClose]);
  useEffect(() => { if (!confirming) return; const timer = window.setTimeout(() => setConfirming(false), 3_000); return () => window.clearTimeout(timer); }, [confirming]);
  if (!project) return null;
  const used = project.files.reduce((sum, file) => sum + file.text.length, 0);
  const add = async (files: File[]) => {
    if (!files.length) return;
    const { accepted, errors } = await readProjectFiles(files, project.files);
    if (accepted.length) updateProject(project.id, (current) => ({ files: [...current.files, ...accepted] }));
    if (errors.length) notify(errors[0]);
  };
  const patch = (update: Partial<Project>) => updateProject(project.id, () => update);
  return (
    <m.div className="overlay" role="presentation" onMouseDown={onClose} {...VEIL}>
      <m.section className="sheet glass project-sheet" role="dialog" aria-modal="true" aria-labelledby="project-title" onMouseDown={(event) => event.stopPropagation()}
        {...SHEET}>
        <header>
          <h2 id="project-title"><Icon name="folder" />Progetto</h2>
          <button type="button" className="icon-button" aria-label="Chiudi" onClick={onClose}><Icon name="close" /></button>
        </header>
        <label htmlFor="project-name">Nome</label>
        <input id="project-name" className="field" value={project.name} maxLength={PROJECT_LIMITS.name} autoFocus={project.name === 'Nuovo progetto'}
          onFocus={(event) => { if (project.name === 'Nuovo progetto') event.currentTarget.select(); }}
          onChange={(event) => patch({ name: event.target.value })} onBlur={(event) => { if (!event.target.value.trim()) patch({ name: 'Nuovo progetto' }); }} />
        <label htmlFor="project-instructions">Istruzioni</label>
        <textarea id="project-instructions" className="field project-instructions" rows={5} maxLength={PROJECT_LIMITS.instructions} value={project.instructions}
          placeholder="Come deve rispondere NexusNXS in questo progetto: ruolo, tono, formato, cosa evitare…" onChange={(event) => patch({ instructions: event.target.value })} />
        <small className="muted counter">{project.instructions.length.toLocaleString('it-IT')} / {PROJECT_LIMITS.instructions.toLocaleString('it-IT')}</small>
        <div className="project-files-head">
          <span>File del progetto</span>
          <small className="muted">{Math.round((used / PROJECT_LIMITS.totalChars) * 100)}% dello spazio</small>
        </div>
        <div className="project-drop" data-dragging={dragging}
          onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void add([...event.dataTransfer.files]); }}>
          {project.files.length > 0 && (
            <ul className="attachment-list project-files">
              {project.files.map((file) => (
                <li key={file.id} className="attachment">
                  <Icon name="file" /><span title={file.name}>{file.name}</span><small>{formatSize(file.size)}</small>
                  <button type="button" className="icon-button small" aria-label={`Rimuovi ${file.name}`} onClick={() => updateProject(project.id, (current) => ({ files: current.files.filter((item) => item.id !== file.id) }))}><Icon name="close" /></button>
                </li>
              ))}
            </ul>
          )}
          <input ref={fileRef} type="file" accept={TEXT_ACCEPT} multiple hidden onChange={(event) => { void add([...(event.target.files ?? [])]); event.target.value = ''; }} />
          <button type="button" className="row-button" onClick={() => fileRef.current?.click()} disabled={project.files.length >= PROJECT_LIMITS.files}>
            <Icon name="upload" size={18} />{project.files.length ? 'Aggiungi file' : 'Aggiungi o trascina file di testo e codice'}
          </button>
        </div>
        <footer className="project-foot">
          <button type="button" className={`ghost${confirming ? ' danger' : ''}`} onClick={() => { if (!confirming) { setConfirming(true); return; } deleteProject(project.id); notify('Progetto eliminato: le sue chat restano nella cronologia.'); }}>
            <Icon name={confirming ? 'check' : 'trash'} size={17} />{confirming ? 'Conferma eliminazione' : 'Elimina progetto'}
          </button>
          <button type="button" className="primary-small" onClick={onClose}>Fatto</button>
        </footer>
      </m.section>
    </m.div>
  );
}
