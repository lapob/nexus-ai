const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
const modelSwitcher = fs.readFileSync(path.join(root, 'src/renderer/components/ModelSwitcher.tsx'), 'utf8');
const commandInput = fs.readFileSync(path.join(root, 'src/renderer/components/CommandInput.tsx'), 'utf8');
const interfacePreferences = fs.readFileSync(path.join(root, 'src/renderer/systems/InterfacePreferences.ts'), 'utf8');
const voiceVisualizer = fs.readFileSync(path.join(root, 'src/renderer/components/VoiceVisualizer.tsx'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/renderer/hooks/useNexusController.ts'), 'utf8');
const voiceRecognition = fs.readFileSync(path.join(root, 'src/renderer/systems/VoiceRecognition.ts'), 'utf8');
const settingsOverlay = fs.readFileSync(path.join(root, 'src/renderer/components/SettingsOverlay.tsx'), 'utf8');
const appCss = fs.readFileSync(path.join(root, 'src/renderer/styles/app.css'), 'utf8');
const unifiedCss = fs.readFileSync(path.join(root, 'src/renderer/styles/unified-surfaces.css'), 'utf8');
const performanceCss = fs.readFileSync(path.join(root, 'src/renderer/styles/adaptive-performance.css'), 'utf8');
const mainScene = fs.readFileSync(path.join(root, 'src/renderer/scene/MainScene.tsx'), 'utf8');
const conversationTranscript = fs.readFileSync(path.join(root, 'src/renderer/components/ConversationTranscript.tsx'), 'utf8');
const voiceVocabulary = fs.readFileSync(path.join(root, 'src/renderer/systems/VoiceVocabulary.ts'), 'utf8');
const responseSurface = fs.readFileSync(path.join(root, 'src/renderer/components/ResponseSurface.tsx'), 'utf8');
const registerIpc = fs.readFileSync(path.join(root, 'src/application/register-ipc.js'), 'utf8');
const electronLauncher = fs.readFileSync(path.join(root, 'scripts/start-electron.js'), 'utf8');
const conversationHistory = fs.readFileSync(path.join(root, 'src/renderer/systems/ConversationHistory.ts'), 'utf8');
const conversationHistoryComponent = fs.readFileSync(path.join(root, 'src/renderer/components/ConversationHistory.tsx'), 'utf8');
const createMainWindow = fs.readFileSync(path.join(root, 'src/infrastructure/electron/create-main-window.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'src/application/bootstrap.js'), 'utf8');
const uiOverlay = fs.readFileSync(path.join(root, 'src/renderer/components/UIOverlay.tsx'), 'utf8');
const finalPolishCss = fs.readFileSync(path.join(root, 'src/renderer/styles/final-polish.css'), 'utf8');
const rendererProtocol = fs.readFileSync(path.join(root, 'src/infrastructure/electron/renderer-protocol.js'), 'utf8');
const nexusCore = fs.readFileSync(path.join(root, 'src/renderer/scene/NexusCore.tsx'), 'utf8');
const companionWindow = fs.readFileSync(path.join(root, 'src/infrastructure/electron/companion-window.js'), 'utf8');

test('il polling dei modelli riceve un callback stabile e non riparte a ogni render', () => {
  assert.match(app, /const refreshModels = useCallback\(/);
  assert.match(app, /onRefresh=\{refreshModels\}/);
  assert.doesNotMatch(app, /onRefresh=\{\(quiet\) => nexus\.detectModels/);
  assert.match(modelSwitcher, /\[onRefresh, open\]/);
  assert.match(modelSwitcher, /await onRefresh\(true\)/);
  assert.doesNotMatch(modelSwitcher, /setInterval\([^)]*onRefresh/);
});

test('il composer cattura Space e la qualità grafica resta selezionabile', () => {
  assert.match(commandInput, /event\.stopPropagation\(\)/);
  assert.match(commandInput, /focus\(\{ preventScroll: true \}\)/);
  assert.match(commandInput, /aria-describedby="attachment-trigger-hint"/);
  assert.match(commandInput, /Foto, documenti e codice/);
  assert.match(createMainWindow, /smokeView === 'queued-text' \|\| smokeView === 'response' \|\| smokeView === 'command' \|\| smokeView === 'command-policy'/);
  assert.match(createMainWindow, /Una bozza resta leggibile mentre scrivi/);
  assert.doesNotMatch(app, /ContextualGuide|GuideContext/);
  assert.equal(fs.existsSync(path.join(root, 'src/renderer/components/ContextualGuide.tsx')), false);
  assert.match(interfacePreferences, /\['auto', 'efficient', 'balanced', 'ultra', 'super'\]/);
  assert.match(interfacePreferences, /\['auto', 'on', 'off'\]/);
});

test('il movimento ridotto governa anche le animazioni Framer Motion', () => {
  assert.match(app, /import \{ MotionConfig \} from 'framer-motion'/);
  assert.match(app, /<MotionConfig reducedMotion=\{nexus\.interfacePreferences\.motion === 'reduced'/);
  assert.match(app, /nexus\.interfacePreferences\.motion === 'system' \? 'user' : 'never'/);
  assert.match(app, /motion: nexus\.interfacePreferences\.motion/);
  assert.doesNotMatch(appCss, /\.companion-surface/);
});

test('la superficie quotidiana espone soltanto voce e scrittura, mentre le capacità restano richiamabili', () => {
  const overlay = fs.readFileSync(require.resolve('../src/renderer/components/UIOverlay.tsx'), 'utf8');
  const switcher = fs.readFileSync(require.resolve('../src/renderer/components/ModelSwitcher.tsx'), 'utf8');
  assert.match(overlay, /<small>PARLA<\/small>/);
  assert.match(overlay, /<small>SCRIVI<\/small>/);
  assert.doesNotMatch(overlay, /<small>MODELLI<\/small>/);
  assert.doesNotMatch(overlay, /<small>IMPOSTAZIONI<\/small>/);
  assert.match(overlay, /Capacità disponibili a voce/);
  assert.doesNotMatch(overlay, /<small>risposta<\/small>/);
  assert.match(switcher, />Modelli<\/h2>/);
  assert.match(switcher, /Nessun modello disponibile/);
});

test('voce e testo possono aprire le superfici nascoste e avviare il collegamento telefono', () => {
  assert.match(controller, /(?:collega\|associa\|connetti\|pair\|connect)/);
  assert.match(controller, /nexus:start-pairing/);
  assert.match(controller, /(?:impostazioni\|settings)/);
  assert.match(controller, /(?:tastiera\|scrittura\|composer\|keyboard\|type)/);
});

test('il visualizer non può attivare la voce mentre il composer è aperto', () => {
  assert.match(voiceVisualizer, /if \(!interactionDisabled\) onActivate\(\)/);
  assert.match(voiceVisualizer, /aria-disabled=\{interactionDisabled\}/);
  assert.match(controller, /document\.querySelector\('\.command-input'\)/);
  assert.match(appCss, /data-command-open="true"\] \.voice-visualizer/);
  assert.match(appCss, /data-command-open="true"\] \.answer-surface/);
  assert.match(fs.readFileSync(path.join(root, 'src\/renderer\/styles\/surfaces-minimal.css'), 'utf8'), /\.command-input\s*\{[\s\S]*top:\s*50%;[\s\S]*translate:\s*-50% -50%/);
});

test('lo stream ha una cadenza fluida e i link verificati passano dal bridge sicuro', () => {
  assert.match(controller, /performanceLevel === 1 \? 44/);
  assert.match(controller, /tier === 'balanced' \? 30 : 24/);
  assert.match(responseSurface, /window\.nexus\.openExternal\(url\)/);
  assert.match(responseSurface, /className="rich-link-preview"/);
  assert.doesNotMatch(responseSurface, /target="_blank"/);
});

test('le richieste operative naturali entrano nel runtime e possono completare ricognizione e modifica', () => {
  assert.match(controller, /function isActionRequest\(text: string\)/);
  assert.match(controller, /vorrei che\|voglio che\|mi serve che/);
  assert.match(controller, /sistema\(\?:re\|mi\)/);
  assert.match(controller, /if \(isActionRequest\(text\)\)/);
  assert.match(controller, /const MAX_ACTION_STEPS = 5/);
  assert.match(controller, /INSPECTION_TOOLS\.has\(planned\.proposal\.tool\)/);
  assert.match(controller, /window\.nexus\.planAction\(\{ instruction, observations \}\)/);
  assert.doesNotMatch(controller, /Ricognizione locale già eseguita/);
  assert.match(controller, /Scegli una cartella o un’unità/);
});

test('un secondo turno vocale attende la trascrizione precedente', () => {
  assert.match(controller, /const voiceTranscribing = useRef\(false\)/);
  assert.match(controller, /if \(voiceTranscribing\.current\)/);
  assert.match(controller, /voiceTranscribing\.current = true;[\s\S]*?finally \{\s*voiceTranscribing\.current = false;/);
});

test('la cattura vocale adatta il guadagno senza amplificare il silenzio', () => {
  assert.match(voiceRecognition, /autoGainControl: true/);
  assert.match(voiceRecognition, /voicedRms >= 0\.004/);
  assert.match(voiceRecognition, /Math\.min\(3\.6, desiredGain/);
  assert.match(voiceRecognition, /Math\.tanh\(amplified/);
});

test('tutte le pagine delle impostazioni condividono un solo salvataggio persistente', () => {
  assert.doesNotMatch(settingsOverlay, /settings-page-save/);
  assert.match(settingsOverlay, /<footer className="settings-footer">/);
  assert.match(settingsOverlay, /disabled=\{busy \|\| !hasUnsavedChanges\}/);
  assert.match(settingsOverlay, /onClick=\{saveAll\}/);
});

test('le impostazioni hanno ricerca e titoli descrittivi senza esporre diagnostica tecnica', () => {
  assert.match(settingsOverlay, /placeholder="Cerca impostazioni"/);
  assert.match(settingsOverlay, /Voce, ascolto e conversazione naturale/);
  assert.match(settingsOverlay, /Permessi, strumenti e controllo delle azioni/);
  assert.match(settingsOverlay, /Memoria, conoscenza e dati personali/);
  assert.match(settingsOverlay, /Dispositivi, continuità e accesso remoto/);
  assert.match(settingsOverlay, /visibleSettingsSections/);
  assert.match(settingsOverlay, /Aperta la sezione/);
  assert.match(settingsOverlay, /scrollTo\(\{ top: 0, behavior: 'smooth' \}\)/);
});

test('lo scorrimento delle impostazioni dissolve e sfoca il contenuto superiore', () => {
  const settingsCss = fs.readFileSync(path.join(root, 'src/renderer/styles/settings-minimal.css'), 'utf8');
  assert.match(settingsOverlay, /data-scrolled=\{settingsScrolled\}/);
  assert.match(settingsCss, /\.settings-scroll-blur\s*\{/);
  assert.match(settingsCss, /backdrop-filter:\s*blur\(10px\)/);
});

test('le impostazioni non espongono la vecchia finestra compatta o la valutazione tecnica dei modelli', () => {
  assert.doesNotMatch(settingsOverlay, /Modalità compatta|Scelta verificata|Valuta modelli/);
  assert.match(settingsOverlay, /setCompactWindow\(false\)/);
  assert.match(settingsOverlay, /Ripristina aspetto/);
});

test('il controllo NexusNXS riassume AI voce e runtime senza mostrare dati tecnici', () => {
  assert.match(settingsOverlay, /window\.nexus\.diagnostics\(\)/);
  assert.match(settingsOverlay, /Controllo di funzionamento/);
  assert.match(settingsOverlay, /NexusNXS è pronto/);
  assert.doesNotMatch(settingsOverlay, /uptimeSeconds|memoryMb|hardwareProfile/);
});

test('l interfaccia ordinaria nasconde diagnostica e statistiche della memoria', () => {
  assert.match(settingsOverlay, /Cancella memoria/);
  assert.doesNotMatch(settingsOverlay, /Aggiorna diagnostica|Benchmark modelli locali|Valuta memoria|prontezza|tok\/s/);
  assert.match(settingsOverlay, /Adattamento automatico/);
  assert.doesNotMatch(settingsOverlay, /AES-256|temperatura ridotta|profilo hardware/i);
});

test('la knowledge locale si aggiorna con un controllo semplice e non distruttivo', () => {
  assert.match(settingsOverlay, /Conoscenza locale/);
  assert.match(settingsOverlay, /window\.nexus\.reindex\(\)/);
  assert.match(settingsOverlay, /Aggiorna conoscenza/);
});

test('l anteprima della voce rispetta lingua e genere prima del primo elemento', () => {
  assert.match(settingsOverlay, /startsWith\(preferredLanguage\) && genderPattern\.test\(voice\.name\)/);
  assert.match(settingsOverlay, /voice\.localService/);
});

test('desktop parte direttamente senza tutorial o stato di onboarding', () => {
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  assert.doesNotMatch(app, /Onboarding|onboardingOpen|open-onboarding/);
  assert.doesNotMatch(settingsOverlay, /Riapri tutorial|Anteprima guidata|open-onboarding/);
  assert.equal(fs.existsSync(path.join(root, 'src/renderer/components/Onboarding.tsx')), false);
});

test('gli overlay leggeri non ricompongono WebGL e la lettura lunga lo sospende', () => {
  const scene = fs.readFileSync(path.join(root, 'src/renderer/scene/MainScene.tsx'), 'utf8');
  const performanceCss = fs.readFileSync(path.join(root, 'src/renderer/styles/adaptive-performance.css'), 'utf8');
  assert.match(scene, /frameloop=\{suspended \|\| !runtime\.visible[\s\S]*'always'/);
  assert.match(performanceCss, /\.settings-scrim,[\s\S]*backdrop-filter: none !important/);
});

test('gli shader particellari dichiarano la luminosità in ogni stadio che la usa', () => {
  for (const file of ['ParticleEngine.tsx', 'SaturnVisualizer.tsx']) {
    const source = fs.readFileSync(path.join(root, 'src/renderer/scene', file), 'utf8');
    const fragment = source.split('const fragmentShader')[1] || '';
    assert.match(fragment, /uniform float uLuminosity;/, file);
    assert.match(fragment, /uLuminosity/, file);
  }
});

test('tutti i visualizer reagiscono in modo progressivo a mouse e touch', () => {
  const neural = fs.readFileSync(path.join(root, 'src/renderer/scene/ParticleEngine.tsx'), 'utf8');
  const saturn = fs.readFileSync(path.join(root, 'src/renderer/scene/SaturnVisualizer.tsx'), 'utf8');
  const reactor = fs.readFileSync(path.join(root, 'src/renderer/scene/NexusCore.tsx'), 'utf8');
  assert.match(mainScene, /onPointerMove/);
  assert.match(mainScene, /pointerType === 'touch'/);
  assert.match(mainScene, /preferences\.particleInteraction === 'off'/);
  assert.match(mainScene, /pointerPresence\.current = pointerIntensity/);
  assert.match(mainScene, /getBoundingClientRect\(\)/);
  assert.match(mainScene, /event\.clientX - bounds\.left/);
  assert.match(mainScene, /events=\{viewportPointerEvents\}/);
  assert.match(mainScene, /onPointerCancel/);
  assert.match(mainScene, /onLostPointerCapture/);
  assert.match(neural, /uPointerStrength/);
  assert.match(saturn, /uPointerStrength/);
  assert.match(reactor, /pointerEnergy\.current/);
  assert.match(neural, /Raycaster/);
  assert.match(saturn, /Raycaster/);
  assert.match(neural, /worldToLocal\(interactionPoint\)/);
  assert.match(saturn, /worldToLocal\(interactionPoint\)/);
  assert.doesNotMatch(neural, /uPointer\.x \* 5\.8/);
  assert.doesNotMatch(saturn, /uPointer\.x \* 3\.9/);
  assert.match(settingsOverlay, /Interazione con le particelle/);
});

test('gli effetti narrativi seguono gli stati e rispettano il profilo hardware', () => {
  assert.match(voiceVisualizer, /transition\.from === 'speaking'/);
  assert.match(voiceVisualizer, /className="comprehension-wave"/);
  assert.match(voiceVisualizer, /className="voice-echo voice-echo-primary"/);
  assert.match(appCss, /\.voice-visualizer\[data-entity-state="listening"\] \.ambient-depth/);
  assert.match(appCss, /@keyframes comprehension-pulse/);
  assert.match(appCss, /@keyframes idle-presence/);
  assert.match(performanceCss, /data-hardware-tier="lite"\] \.visualizer-transition/);
  assert.match(appCss, /data-performance-level="4"[\s\S]*\.ambient-depth[\s\S]*will-change: transform, opacity/);
  assert.match(appCss, /settings-overlay,[\s\S]*\.ambient-depth[\s\S]*animation-play-state: paused/);
});

test('una risposta lunga ritira la scena ma Space ripristina il visualizer', () => {
  assert.match(appCss, /answer-surface\[data-size="expanded"\]\[data-reveal="ready"\][\s\S]*mask-image:/);
  assert.match(appCss, /data-barge-in="true"[\s\S]*\.voice-visualizer[\s\S]*mask-image: none/);
});

test('la scala dell’interfaccia resta leggibile su Full HD, QHD e ultrawide', () => {
  assert.match(appCss, /@media \(min-width: 1600px\) and \(min-height: 850px\)[\s\S]*font-size: clamp\(16px, 0\.84vw, 18px\)/);
  assert.match(appCss, /@media \(max-width: 620px\)[\s\S]*\.ui-overlay/);
});

test('una chat archiviata riapre l’intera conversazione e disattiva le scorciatoie vocali', () => {
  assert.match(conversationTranscript, /record\.turns\.map/);
  assert.match(conversationTranscript, /data-role=\{turn\.role\}/);
  assert.match(app, /record=\{nexus\.viewedConversation\}/);
  assert.match(app, /Boolean\(nexus\.viewedConversation\)/);
  assert.match(controller, /setViewedConversation\(record\)/);
  assert.match(controller, /historyOpen \|\| Boolean\(viewedConversation\)/);
  assert.match(controller, /if \(viewedConversation\) \{\s*closeConversationView\(\);\s*return;/);
  assert.match(controller, /responseRef\.current = '';\s*setResponse\(''\);\s*setTranscript\(''\)/);
  assert.match(app, /!nexus\.privacyMode && !nexus\.viewedConversation/);
  assert.match(controller, /completeConversation\(event\.requestId, event\.result\?\.incomplete === true\)/);
  assert.match(conversationTranscript, /record\.incomplete/);
  assert.match(conversationTranscript, /<MarkdownContent text=\{turn\.content\}/);
  assert.doesNotMatch(createMainWindow, /join\('\\\\\\\\n\\\\\\\\n'\)/, 'la conversazione QA deve usare ritorni a capo reali');
  assert.match(conversationTranscript, /conversation-transcript-progress/);
  assert.match(conversationTranscript, /conversation-chapter-rail/);
  assert.match(conversationTranscript, /aria-label="Capitoli della conversazione"/);
  assert.match(conversationTranscript, /goToChapter/);
  assert.match(conversationTranscript, /requestAnimationFrame/);
  assert.doesNotMatch(conversationTranscript, /Continua conversazione|conversation-transcript-actions/);
  assert.match(controller, /setViewedConversation\(null\);[\s\S]{0,300}setHistoryOpen\(true\)/);
  assert.match(app, /suspended=\{surfaceOpen\}/);
});

test('la conversazione offre ricerca, capitoli e segnalibri locali', () => {
  assert.match(conversationTranscript, /conversation-transcript-search/);
  assert.match(conversationTranscript, /goToMatch/);
  assert.match(conversationTranscript, /conversation\.bookmarks/);
  assert.match(conversationTranscript, /conversation-bookmark/);
});

test('le azioni dei messaggi restano compatte in menu accessibili', () => {
  assert.match(conversationTranscript, /conversation-turn-menu-trigger/);
  assert.match(conversationTranscript, /role="menu"/);
  assert.match(responseSurface, /answer-action-menu-trigger/);
  assert.match(responseSurface, /Altre azioni sulla risposta/);
});

test('il modello rapido segue la policy adattiva e non preriscalda il client pubblico', () => {
  assert.match(bootstrap, /runtimeWarmupPolicy\(\{/);
  assert.match(bootstrap, /publicClientMode,/);
  assert.match(bootstrap, /managedRuntimeAvailable:\s*managedRuntimeState\.available/);
  assert.match(bootstrap, /setInterval\(\(\)\s*=>\s*\{/);
  assert.match(bootstrap, /clearInterval\(aiKeepWarm\)/);
});

test('il vocabolario vocale corregge localmente soltanto termini quasi identici', () => {
  assert.match(voiceVocabulary, /distanceAtMostOne/);
  assert.match(voiceVocabulary, /normalized\.length >= 5/);
  assert.match(controller, /applyVoiceVocabulary/);
  assert.match(settingsOverlay, /Parole importanti/);
});

test('le azioni vocali incerte richiedono conferma esplicita', () => {
  assert.match(controller, /pendingVoiceConfirmation/);
  assert.match(controller, /result\.confidence < 0\.72/);
  assert.match(controller, /Di' conferma oppure annulla/);
});

test('HDR usa buffer ad alta precisione e mantiene il fallback SDR automatico', () => {
  assert.match(mainScene, /HalfFloatType/);
  assert.match(mainScene, /ACESFilmicToneMapping/);
  assert.match(mainScene, /NoToneMapping/);
  assert.match(appCss, /dynamic-range: high/);
  assert.match(interfacePreferences, /hdr: \['auto', 'on', 'off'\]/);
});

test('focus e safe area impediscono sovrapposizioni con scaling Windows elevato', () => {
  assert.match(app, /data-focus=/);
  assert.match(appCss, /--safe-top/);
  assert.match(appCss, /resolution >= 1\.25dppx/);
  assert.match(appCss, /resolution >= 1\.75dppx/);
  assert.match(appCss, /prefers-contrast: more/);
});

test('WebGL si ripristina senza lasciare il visualizer bloccato', () => {
  assert.match(mainScene, /webglcontextlost/);
  assert.match(mainScene, /forceContextRestore/);
  assert.match(mainScene, /webglcontextrestored/);
  assert.match(mainScene, /Ripristino grafica/);
});

test('densità, focus finestra e protezione OLED restano adattivi', () => {
  assert.match(app, /data-density=\{density\}/);
  assert.match(app, /data-window-active=\{windowActive\}/);
  assert.match(app, /suspended=\{surfaceOpen\}/);
  assert.match(appCss, /oled-pixel-shift/);
  assert.match(appCss, /data-window-active="false"/);
});

test('le opzioni sono organizzate nella propria sezione e il composer resta composto', () => {
  assert.match(settingsOverlay, /settings-navigation/);
  assert.match(settingsOverlay, /Permessi/);
  assert.match(settingsOverlay, /Memoria, conoscenza e dati personali/);
  assert.doesNotMatch(settingsOverlay, /Altre opzioni|data-advanced=\{advancedVisible\}/);
  assert.match(settingsOverlay, /Modello principale/);
  assert.match(settingsOverlay, /autoSelectModel: true/);
  assert.match(settingsOverlay, /chatModel: model, autoSelectModel: false/);
  assert.match(app, /models=\{nexus\.models\}/);
  assert.doesNotMatch(appCss, /command-context:hover/);
  assert.match(unifiedCss, /workspace-chip:hover \+ \.workspace-clear/);
  assert.match(commandInput, /Scrivi, cerca o chiedi/);
});

test('la sessione remota resta disattivabile, associabile e revocabile dalle impostazioni', () => {
  assert.match(settingsOverlay, /Accesso remoto/);
  assert.match(settingsOverlay, /window\.nexus\.remoteStatus\(\)/);
  assert.match(settingsOverlay, /window\.nexus\.configureRemote/);
  assert.match(settingsOverlay, /window\.nexus\.createRemotePairing\(\)/);
  assert.match(settingsOverlay, /result\.status === 'ready'[\s\S]*setPairingCode\(await window\.nexus\.createRemotePairing\(\)\)/);
  assert.match(settingsOverlay, /QRCode\.toDataURL/);
  assert.match(settingsOverlay, /Collega dispositivo/);
  assert.match(settingsOverlay, /Copia collegamento/);
  assert.match(settingsOverlay, /window\.nexus\.revokeRemoteDevice/);
  assert.doesNotMatch(settingsOverlay, /Prepara rete di casa|Configura fuori casa|Usa dal telefono/);
  assert.match(registerIpc, /const allowLan = mode === 'home'/);
  assert.match(registerIpc, /remoteGateway\.configure\(\{ enabled: true, allowLan, port:/);
  assert.doesNotMatch(registerIpc, /remoteGateway\.configure\(\{ enabled: true, allowLan: true, port: status\.port/);
});

test('l avvio con Windows resta una scelta semplice nella sezione remota', () => {
  assert.match(settingsOverlay, /Core e Presence all’accensione/);
  assert.match(settingsOverlay, /senza aprire l’interfaccia completa/);
  assert.match(settingsOverlay, /window\.nexus\.startupStatus\(\)/);
  assert.match(settingsOverlay, /window\.nexus\.configureStartup\(event\.target\.checked\)/);
});

test('le richieste complesse mostrano fasi comprensibili senza nomi tecnici dei modelli', () => {
  const controller = fs.readFileSync(path.join(root, 'src/renderer/hooks/useNexusController.ts'), 'utf8');
  const taskPanel = fs.readFileSync(path.join(root, 'src/renderer/components/TaskPanel.tsx'), 'utf8');
  assert.match(controller, /Comprendo il problema/);
  assert.match(controller, /Cerco il contesto utile/);
  assert.match(controller, /Costruisco una soluzione completa/);
  assert.match(controller, /Rileggo e verifico la risposta/);
  assert.match(taskPanel, /Approfondita/);
  assert.doesNotMatch(taskPanel, /qwen|ollama|token|runtime/i);
});

test('le fasi desktop seguono eventi reali del backend senza esporre il ragionamento interno', () => {
  const registration = fs.readFileSync(path.join(root, 'src/application/register-ipc.js'), 'utf8');
  assert.match(registration, /type: 'phase'/);
  assert.match(registration, /Organizzo la conversazione e il contesto/);
  assert.match(registration, /Rileggo e verifico il risultato/);
  assert.match(controller, /event\.type === 'phase'/);
  assert.doesNotMatch(controller, /event\.phase.*chunk/);
});

test('la continuità della stessa conversazione è visibile nel contesto e nel composer', () => {
  assert.match(app, /Stessa conversazione/);
  assert.match(app, /puoi continuare da qui/);
  assert.match(app, /conversation=\{continuingConversation\}/);
  assert.match(commandInput, /command-thread-context/);
  assert.match(unifiedCss, /session-continuity-signal/);
  assert.match(unifiedCss, /conversation-history\[data-density="sparse"\]/);
});

test('il renderer non reintroduce header o navbar tradizionali', () => {
  const rendererComponents = fs.readdirSync(path.join(root, 'src/renderer/components'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => fs.readFileSync(path.join(root, 'src/renderer/components', file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(rendererComponents, /<(?:header|nav)\b/i);
  assert.doesNotMatch(rendererComponents, /navbar/i);
  assert.match(commandInput, /'Automatico'/);
});

test('la presenza nasconde i controlli inattivi e le superfici restano progressive', () => {
  assert.match(app, /data-presence-quiet/);
  assert.match(app, /4_800/);
  assert.match(commandInput, /data-expanded/);
  assert.match(conversationHistoryComponent, /conversation-history-group/);
  assert.match(conversationHistoryComponent, /HISTORY_PAGE_SIZE = 80/);
  assert.match(conversationHistoryComponent, /renderedRecords/);
  assert.match(unifiedCss, /command-thread-context/);
});

test('Core e Presence si materializzano con particelle adattive senza nuove texture', () => {
  assert.match(nexusCore, /layer: 'rings' \| 'core' \| 'scanner' \| 'aura'/);
  assert.match(nexusCore, /emergence\.current/);
  assert.match(nexusCore, /geometries\.aura/);
  assert.match(companionWindow, /presenceParticles/);
  assert.match(companionWindow, /presence-materialize/);
  assert.match(companionWindow, /data-quality=efficient.*presence-particles/s);
});

test('le generazioni al limite continuano prima di essere archiviate', () => {
  assert.match(registerIpc, /result\.finishReason === 'length'/);
  assert.match(registerIpc, /continuation < 3/);
  assert.match(registerIpc, /`\$\{requestId\}-continuation-\$\{continuation \+ 1\}`/);
  assert.match(registerIpc, /result: \{ \.\.\.result, requestId \}/);
  assert.match(registerIpc, /incomplete: result\.finishReason === 'length'/);
  assert.match(registerIpc, /maximumContinuations = resolvedMode === 'deep' \? 4 : 6/);
  assert.match(registerIpc, /REMOTE_RESPONSE_INCOMPLETE/);
});

test('il warmup pubblico prepara soltanto la sessione remota senza inferenza', () => {
  const start = registerIpc.indexOf('const aiWarmup = createWarmupSingleflight');
  const warmup = registerIpc.slice(start, registerIpc.indexOf('const aiReadiness', start));
  assert.ok(start >= 0);
  assert.match(warmup, /aiRuntime\.preloadModel/);
  assert.doesNotMatch(warmup, /distributionMode === 'public'/);
});

test('la risposta può essere chiusa con pulsante o Escape senza riattivare la voce', () => {
  assert.match(controller, /const dismissResponse = useCallback/);
  assert.match(controller, /if \(responseRef\.current \|\| activeRequest\.current\) \{\s*dismissResponse\(\)/);
  assert.match(responseSurface, /label="Chiudi risposta"/);
});

test('lo stop vocale arresta entrambi i motori senza short circuit', () => {
  assert.match(registerIpc, /const neuralStopped = neuralSpeechService\.stop\(\)/);
  assert.match(registerIpc, /const expressiveStopped = expressiveSpeechService\?\.stop\?\.\(\)/);
  assert.doesNotMatch(registerIpc, /neuralSpeechService\.stop\(\) \|\| expressiveSpeechService/);
});

test('la voce adatta il tono e richiama per nome una sola volta dopo una domanda', () => {
  assert.match(controller, /inferVoiceDelivery\(clean\)/);
  assert.match(controller, /attentiveFollowUpTimer/);
  assert.match(controller, /Ci sei, \$\{name\}\?/);
  assert.match(controller, /speak\(`Ci sei, \$\{name\}\?`, `attention-\$\{Date\.now\(\)\}`, false\)/);
  assert.match(settingsOverlay, /Presenza naturale/);
});

test('la cronologia rispetta un budget prima di scrivere nel local storage', () => {
  assert.match(conversationHistory, /STORAGE_CHARACTER_BUDGET\s*=\s*4_500_000/);
  assert.match(conversationHistory, /fitConversationBudget\(\[normalized, \.\.\.current\]\)/);
  assert.match(conversationHistory, /record\.turns\.slice\(-6\)/);
});

test('il launcher filtra soltanto il rumore WidgetHost di Chromium', () => {
  assert.match(electronLauncher, /CHROMIUM_WIDGETHOST_NOISE/);
  assert.match(electronLauncher, /child\.stderr\.on\('data'/);
  assert.match(electronLauncher, /process\.stderr\.write/);
  assert.match(electronLauncher, /windowsHide: true/);
  assert.match(electronLauncher, /child\.once\('close'/);
  assert.match(electronLauncher, /stdio:\s*\['ignore',\s*'ignore',\s*'pipe'\]/);
  assert.match(electronLauncher, /reusableCoreRuntime/);
  assert.match(electronLauncher, /NEXUS_MANAGED_OLLAMA:\s*presenceMode\s*\|\|\s*reusableCoreRuntime\s*\?\s*'0'\s*:\s*'1'/);
  assert.match(electronLauncher, /NEXUS_OLLAMA_BASE_URL:\s*coreRuntimeBaseUrl/);
  assert.doesNotMatch(electronLauncher, /runtimePreflight|--runtime-only|preflight\.unref/);
});

test('il composer usa il selettore NexusNXS accessibile senza menu nativo', () => {
  const commandInput = fs.readFileSync(path.join(root, 'src/renderer/components/CommandInput.tsx'), 'utf8');
  const nexusSelect = fs.readFileSync(path.join(root, 'src/renderer/components/NexusSelect.tsx'), 'utf8');
  assert.match(commandInput, /<NexusSelect/);
  assert.doesNotMatch(commandInput, /<select/);
  assert.match(nexusSelect, /role="listbox"/);
  assert.match(nexusSelect, /event\.key === 'ArrowDown'/);
  assert.match(nexusSelect, /event\.key === 'Escape'/);
  assert.match(nexusSelect, /data-side=\{side\}/);
  assert.doesNotMatch(nexusSelect, />✓</);
  assert.doesNotMatch(nexusSelect, />⌄</);
});

test('le superfici sospendono il visualizer e la risposta non applica una seconda battitura lenta', () => {
  const responseCss = fs.readFileSync(path.join(root, 'src/renderer/styles/response-surface.css'), 'utf8');
  assert.match(app, /suspended=\{surfaceOpen\}/);
  assert.match(responseCss, /detail-emerge 220ms/);
  assert.doesNotMatch(responseCss, /detail-emerge 540ms/);
});

test('la risposta usa il contesto privato ma pubblica soltanto citazioni web', () => {
  assert.doesNotMatch(responseSurface, /answer-sources|Fonti locali|openNote\(source/);
  assert.doesNotMatch(controller, /responseSources|setResponseSources/);
  const ipc = fs.readFileSync(path.join(root, 'src/application/register-ipc.js'), 'utf8');
  assert.match(ipc, /type: 'sources'[\s\S]{0,120}sources: prepared\.publicSources/);
  assert.doesNotMatch(ipc, /type: 'sources'[\s\S]{0,120}sources: prepared\.sources/);
  assert.match(ipc, /return \{ answer:[\s\S]{0,240}sources: prepared\.publicSources/);
  assert.doesNotMatch(ipc, /Collego le informazioni locali pertinenti/);
});

test('cronologia e lettura conversazione hanno chiusure visibili e layout confinato', () => {
  const transcript = fs.readFileSync(path.join(root, 'src/renderer/components/ConversationTranscript.tsx'), 'utf8');
  const visualQa = fs.readFileSync(path.join(root, 'scripts/visual-qa.js'), 'utf8');
  const accessibilityQa = fs.readFileSync(path.join(root, 'scripts/accessibility-qa.js'), 'utf8');
  assert.match(transcript, /label="Chiudi conversazione"/);
  assert.match(visualQa, /\['conversation', 1090, 613\]/);
  assert.match(visualQa, /\['history', 1920, 1080\]/);
  assert.match(visualQa, /\['settings-select', 720, 640\]/);
  assert.match(visualQa, /\['command', 1090, 700\]/);
  assert.match(accessibilityQa, /'conversation', 'command', 'command-policy'/);
  assert.match(app, /<ConversationHistory[\s\S]*open=\{nexus\.historyOpen\}[\s\S]*onClose=\{\(\) => nexus\.setHistoryOpen\(false\)\}/);
});

test('gli artefatti operativi offrono diff, confronto, timeline e ricerca persistente', () => {
  assert.match(responseSurface, /Prima \/ dopo/);
  assert.match(responseSurface, /artifact-timeline/);
  assert.match(responseSurface, /previousResponse/);
  assert.match(responseSurface, /1_200/);
  assert.match(conversationHistoryComponent, /File modificati/);
  assert.match(conversationHistoryComponent, /turn\.artifacts/);
  assert.match(conversationHistory, /previousContent/);
});

test('la vecchia superficie pet è stata sostituita dalla Presence visualizer', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/renderer/components/NexusPet.tsx')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/renderer/components/CompanionSurface.tsx')), false);
  assert.doesNotMatch(interfacePreferences, /petFloating:/);
  assert.doesNotMatch(settingsOverlay, /pet-gallery/);
  assert.match(interfacePreferences, /coreAppearance/);
});
