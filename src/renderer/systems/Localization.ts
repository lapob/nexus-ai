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
    settings: 'Impostazioni', voice: 'Voce', voiceDetail: 'Ascolto e risposta', appearance: 'Aspetto',
    appearanceDetail: 'Grafica e fluidità', intelligence: 'Intelligenza', intelligenceDetail: 'Identità e risposte',
    permissions: 'Permessi', permissionsDetail: 'Azioni e controllo', data: 'Dati', dataDetail: 'Memoria e archivio',
    remote: 'Remoto', remoteDetail: 'Telefono e dispositivi', select: 'Seleziona'
  },
  en: {
    settings: 'Settings', voice: 'Voice', voiceDetail: 'Listening and replies', appearance: 'Appearance',
    appearanceDetail: 'Visuals and motion', intelligence: 'Intelligence', intelligenceDetail: 'Identity and replies',
    permissions: 'Permissions', permissionsDetail: 'Actions and control', data: 'Data', dataDetail: 'Memory and archive',
    remote: 'Remote', remoteDetail: 'Phone and devices', select: 'Select'
  }
} as const;

export function uiCopy(preference: 'system' | NexusUiLocale = 'system') { return copy[resolvedUiLocale(preference)]; }
