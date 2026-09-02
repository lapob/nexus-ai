/**
 * @module infrastructure/windows/wake-word-listener
 * @description Listener locale opt-in basato su Windows SAPI e grammatica chiusa.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const DEFAULT_CONFIDENCE = 0.84;
const DEFAULT_COOLDOWN_MS = 5_000;
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[a-z]{2})?$/i;
const LOCALIZED_WAKE_WORDS = Object.freeze({
  it: Object.freeze(['Nexus', 'Ehi Nexus']),
  en: Object.freeze(['Nexus', 'Hey Nexus']),
  es: Object.freeze(['Nexus', 'Hola Nexus', 'Oye Nexus']),
  fr: Object.freeze(['Nexus', 'Salut Nexus']),
  de: Object.freeze(['Nexus', 'Hallo Nexus']),
  pt: Object.freeze(['Nexus', 'Ola Nexus'])
});

// #region Configurazione e processo SAPI confinato

function finiteRange(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function normalizeWakeLocale(value = 'en-US') {
  const candidate = String(value || '').trim().replace('_', '-');
  if (!LOCALE_PATTERN.test(candidate)) return 'en-US';
  const [language, region] = candidate.split('-');
  return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase();
}

function wakeWordsForLocale(locale = 'en-US') {
  const language = normalizeWakeLocale(locale).split('-')[0];
  return LOCALIZED_WAKE_WORDS[language] || LOCALIZED_WAKE_WORDS.en;
}

function normalizeWakeWordConfiguration(value = {}) {
  const locale = normalizeWakeLocale(value.wakeWordLocale ?? value.locale);
  return Object.freeze({
    enabled: value.wakeWordEnabled === true || value.enabled === true,
    suspended: value.wakeWordSuspended === true || value.suspended === true,
    confidence: finiteRange(value.wakeWordConfidence ?? value.confidence, DEFAULT_CONFIDENCE, 0.7, 0.95),
    cooldownMs: Math.round(finiteRange(value.wakeWordCooldownMs ?? value.cooldownMs, DEFAULT_COOLDOWN_MS, 2_000, 30_000)),
    locale,
    phrases: wakeWordsForLocale(locale)
  });
}

function powershellExecutable(env = process.env) {
  const windowsRoot = String(env.SystemRoot || env.WINDIR || 'C:\\Windows');
  return path.join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function wakeWordPowerShellScript(configuration = {}) {
  const normalized = normalizeWakeWordConfiguration(configuration);
  const confidence = normalized.confidence.toFixed(3);
  const cooldownMs = String(normalized.cooldownMs);
  const locale = normalized.locale.replace(/'/g, "''");
  const phrases = normalized.phrases.map((phrase) => `'${phrase.replace(/'/g, "''")}'`).join(', ');
  // Non carica dizionari liberi: SAPI riceve soltanto la grammatica localizzata prevista.
  return String.raw`$ErrorActionPreference = 'Stop'
$recognizer = $null
try {
  Add-Type -AssemblyName System.Speech
  $cultureName = '${locale}'
  $culture = [System.Globalization.CultureInfo]::GetCultureInfo($cultureName)
  $installed = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
  $matching = $installed | Where-Object { $_.Culture.Name -eq $culture.Name } | Select-Object -First 1
  if ($null -ne $matching) {
    $recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::new($matching)
  } else {
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  }
  $phrases = [string[]]@(${phrases})
  $choices = New-Object System.Speech.Recognition.Choices
  $choices.Add($phrases)
  $builder = New-Object System.Speech.Recognition.GrammarBuilder
  if ($null -ne $matching) { $builder.Culture = $culture }
  $builder.Append($choices)
  $recognizer.LoadGrammar((New-Object System.Speech.Recognition.Grammar($builder)))
  $recognizer.SetInputToDefaultAudioDevice()
  $recognizer.InitialSilenceTimeout = [TimeSpan]::FromSeconds(12)
  $recognizer.BabbleTimeout = [TimeSpan]::FromSeconds(2)
  $recognizer.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(180)
  $recognizer.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(420)
  $threshold = [double]${confidence}
  $cooldown = [int]${cooldownMs}
  $script:nexusLastWake = [DateTimeOffset]::MinValue
  $recognizer.add_SpeechRecognized({
    param($sender, $eventArgs)
    $now = [DateTimeOffset]::UtcNow
    if ([double]$eventArgs.Result.Confidence -lt $threshold) { return }
    if (($now - $script:nexusLastWake).TotalMilliseconds -lt $cooldown) { return }
    $text = [string]$eventArgs.Result.Text
    if ($text -notin $phrases) { return }
    $script:nexusLastWake = $now
    [Console]::Out.WriteLine((@{ type = 'wake'; phrase = $text; confidence = [Math]::Round([double]$eventArgs.Result.Confidence, 3) } | ConvertTo-Json -Compress))
  })
  [Console]::Out.WriteLine('{"type":"ready"}')
  $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
  [void][Console]::In.ReadLine()
} catch {
  [Console]::Out.WriteLine('{"type":"error","code":"SAPI_UNAVAILABLE"}')
} finally {
  if ($null -ne $recognizer) {
    try { $recognizer.RecognizeAsyncCancel() } catch {}
    try { $recognizer.Dispose() } catch {}
  }
}`;
}

// #endregion
// #region Ciclo di vita del listener

function createWakeWordListener({
  platform = process.platform,
  env = process.env,
  launch = spawn,
  logger = console,
  onWake = () => {},
  onListeningChange = () => {},
  stopTimeoutMs = 1_200
} = {}) {
  let configuration = normalizeWakeWordConfiguration();
  let child = null;
  let listening = false;
  let retryAfter = 0;
  let operation = Promise.resolve();

  const setListening = (value) => {
    const next = value === true;
    if (next === listening) return;
    listening = next;
    try { onListeningChange(next); } catch {}
  };

  const stopCurrent = async () => {
    const current = child;
    child = null;
    setListening(false);
    if (!current) return;
    await new Promise((resolve) => {
      let complete = false;
      const finish = () => {
        if (complete) return;
        complete = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        try { current.kill(); } catch {}
        finish();
      }, Math.max(100, Number(stopTimeoutMs) || 1_200));
      timer.unref?.();
      current.once?.('close', finish);
      current.once?.('error', finish);
      try {
        current.stdin?.write?.('\n');
        current.stdin?.end?.();
      } catch { finish(); }
    });
  };

  const startCurrent = () => {
    if (platform !== 'win32' || !configuration.enabled || configuration.suspended) return;
    const encoded = Buffer.from(wakeWordPowerShellScript(configuration), 'utf16le').toString('base64');
    const current = launch(powershellExecutable(env), [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded
    ], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...env }
    });
    child = current;
    let buffer = '';
    current.stdout?.setEncoding?.('utf8');
    current.stdout?.on?.('data', (chunk) => {
      buffer += String(chunk || '');
      let boundary = buffer.indexOf('\n');
      while (boundary >= 0) {
        const line = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 1);
        boundary = buffer.indexOf('\n');
        if (!line || line.length > 512) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event?.type === 'ready') setListening(true);
        if (event?.type === 'error') {
          retryAfter = Date.now() + 60_000;
          setListening(false);
          logger.warn?.('Richiamo vocale locale non disponibile.', { code: 'SAPI_UNAVAILABLE' });
        }
        if (event?.type === 'wake' && listening && configuration.phrases.includes(String(event.phrase))) {
          Promise.resolve(onWake(Object.freeze({
            phrase: String(event.phrase),
            confidence: finiteRange(event.confidence, configuration.confidence, 0, 1),
            detectedAt: Date.now()
          }))).catch((error) => logger.warn?.('Attivazione vocale locale non riuscita.', { error }));
        }
      }
    });
    const ended = () => {
      if (child === current) {
        child = null;
        retryAfter = Date.now() + 60_000;
      }
      setListening(false);
    };
    current.once?.('error', (error) => {
      logger.warn?.('Processo di richiamo vocale locale non avviato.', { code: error?.code });
      ended();
    });
    current.once?.('close', ended);
  };

  const configure = (value) => {
    const next = normalizeWakeWordConfiguration(value);
    operation = operation.then(async () => {
      const unchanged = configuration.enabled === next.enabled
        && configuration.suspended === next.suspended
        && configuration.confidence === next.confidence
        && configuration.cooldownMs === next.cooldownMs
        && configuration.locale === next.locale;
      configuration = next;
      if (!unchanged) retryAfter = 0;
      if (unchanged && (child || Date.now() < retryAfter)) return;
      await stopCurrent();
      startCurrent();
    });
    return operation.then(() => status());
  };

  const stop = () => {
    configuration = Object.freeze({ ...configuration, enabled: false });
    retryAfter = 0;
    operation = operation.then(stopCurrent);
    return operation;
  };

  const status = () => Object.freeze({
    available: platform === 'win32',
    enabled: configuration.enabled,
    suspended: configuration.suspended,
    listening,
    confidence: configuration.confidence,
    cooldownMs: configuration.cooldownMs,
    locale: configuration.locale,
    phrases: [...configuration.phrases]
  });

  return Object.freeze({ configure, stop, status });
}

// #endregion

module.exports = {
  DEFAULT_CONFIDENCE,
  DEFAULT_COOLDOWN_MS,
  createWakeWordListener,
  normalizeWakeWordConfiguration,
  normalizeWakeLocale,
  powershellExecutable,
  wakeWordsForLocale,
  wakeWordPowerShellScript
};
