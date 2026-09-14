/**
 * @module renderer/systems/Localization
 * @description Localizzazione essenziale dell'interfaccia basata sulla lingua del sistema operativo.
 */
export type NexusUiLocale = 'it' | 'en';

export function systemUiLocale(): NexusUiLocale {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  return candidates.some((locale) => /^it(?:-|$)/i.test(locale || '')) ? 'it' : 'en';
}

export function resolvedUiLocale(preference: 'system' | NexusUiLocale = 'system'): NexusUiLocale {
  return preference === 'system' ? systemUiLocale() : preference;
}

export function documentUiLocale(): string {
  const language = document.documentElement.lang || navigator.language;
  return language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language || 'en-US';
}

const copy = {
  it: {
    connections: 'Connessioni e strumenti', connectionsDetail: 'Progetti e capacità disponibili',
    activity: 'Attività', activityDetail: 'Cronologia delle azioni eseguite', noActivity: 'Nessuna azione eseguita.',
    tools: 'Strumenti disponibili', toolsHelp: 'Ogni utilizzo segue i permessi configurati. La presenza di uno strumento non autorizza automaticamente le sue azioni.',
    detectedCapabilities: 'Rilevati dal servizio collegato.', localApplications: 'Applicazioni locali', noApplications: 'Nessuna applicazione compatibile rilevata.', noTools: 'Nessuno strumento disponibile.',
    capabilitiesFailed: 'Impossibile verificare le capacità. Chiudi e riapri le impostazioni per riprovare.',
    memoryHelp: 'Modifica o rimuovi i ricordi. Solo le informazioni approvate vengono conservate.',
    memoryEdit: 'Modifica ricordo', memorySave: 'Salva', memoryCancel: 'Annulla', memorySaved: 'Ricordo aggiornato.', memoryFailed: 'Impossibile aggiornare il ricordo. Riprova.',
    settings: 'Impostazioni', voice: 'Voce', voiceDetail: 'Ascolto e risposta', appearance: 'Aspetto',
    appearanceDetail: 'Grafica e fluidità', intelligence: 'Intelligenza', intelligenceDetail: 'Identità e risposte',
    permissions: 'Permessi', permissionsDetail: 'Azioni e controllo', data: 'Dati', dataDetail: 'Memoria e archivio',
    remote: 'Remoto', remoteDetail: 'Telefono e dispositivi', select: 'Seleziona', reasoningFast: 'Ragionamento rapido', reasoningDeep: 'Ragionamento approfondito'
  },
  en: {
    connections: 'Connections and tools', connectionsDetail: 'Projects and available capabilities',
    activity: 'Activity', activityDetail: 'History of executed actions', noActivity: 'No actions executed.',
    tools: 'Available tools', toolsHelp: 'Every use follows configured permissions. An available tool does not automatically authorize its actions.',
    detectedCapabilities: 'Detected by the connected service.', localApplications: 'Local applications', noApplications: 'No compatible applications detected.', noTools: 'No tools available.',
    capabilitiesFailed: 'Could not verify capabilities. Close and reopen settings to try again.',
    memoryHelp: 'Edit or remove memories. Only approved information is retained.',
    memoryEdit: 'Edit memory', memorySave: 'Save', memoryCancel: 'Cancel', memorySaved: 'Memory updated.', memoryFailed: 'Could not update this memory. Try again.',
    settings: 'Settings', voice: 'Voice', voiceDetail: 'Listening and replies', appearance: 'Appearance',
    appearanceDetail: 'Visuals and motion', intelligence: 'Intelligence', intelligenceDetail: 'Identity and replies',
    permissions: 'Permissions', permissionsDetail: 'Actions and control', data: 'Data', dataDetail: 'Memory and archive',
    remote: 'Remote', remoteDetail: 'Phone and devices', select: 'Select', reasoningFast: 'Fast reasoning', reasoningDeep: 'Deep reasoning'
  }
} as const;

export function uiCopy(preference: 'system' | NexusUiLocale = 'system') { return copy[resolvedUiLocale(preference)]; }
