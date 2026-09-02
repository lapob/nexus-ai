# Sicurezza agentica

Questo documento collega i confini operativi di NexusNXS alla tassonomia
[OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/).
È un threat model verificabile, non una dichiarazione di invulnerabilità.

| Rischio OWASP | Controllo NexusNXS | Evidenza automatica |
| --- | --- | --- |
| ASI01 Agent Goal Hijack | input e allegati esterni restano materiale non fidato; un output del modello non è mai un'autorizzazione | `tests/prompt-security.test.js`, `tests/security-boundaries.test.js` |
| ASI02 Tool Misuse | strumenti in allowlist, argomenti senza shell implicita, dry-run obbligatorio e ticket monouso | `tests/action-runtime.test.js` |
| ASI03 Identity & Privilege Abuse | capability legata a dispositivo e workspace; scope Chat, Remote e Console separati | `tests/action-runtime.test.js`, `tests/remote-session-gateway.test.js` |
| ASI04 Agentic Supply Chain | audit dipendenze, SBOM CycloneDX, manifest artefatti e feed firmato Ed25519 | `tests/release-integrity.test.js`, `npm run audit:runtime`, `npm run sbom` |
| ASI05 Unexpected Code Execution | nessuna shell implicita, comandi e interpreti in allowlist, working directory confinata | `tests/action-runtime.test.js`, `tests/security.test.js` |
| ASI06 Memory & Context Poisoning | memoria personale esclusa dal client pubblico; file sensibili e hidden esclusi dal contesto | `tests/security-boundaries.test.js`, `tests/prompt-security.test.js` |
| ASI07 Insecure Inter-Agent Communication | nessuna fiducia derivata da header client; token, scope e identità dispositivo verificati al gateway | `tests/remote-session-gateway.test.js` |
| ASI08 Cascading Failures | limiti per rotta, coda finita, timeout, cancellazione e shutdown idempotente | `tests/remote-session-gateway.test.js`, `tests/app-lifecycle-security.test.js` |
| ASI09 Human-Agent Trust Exploitation | anteprima concreta prima dell'azione, rischio esplicito, consenso configurabile e audit locale | `tests/action-runtime.test.js` |
| ASI10 Rogue Agents | stop cancella processi posseduti, invalida ticket e impedisce nuove azioni; scritture fallite vengono ripristinate | `tests/action-runtime.test.js`, `tests/app-lifecycle-security.test.js` |

## Invarianti operative

- Il modello propone; il runtime valida e decide se l'azione è eseguibile.
- Un ticket non può essere riusato, trasferito a un altro dispositivo o eseguito
  dopo il cambio dello spazio di lavoro.
- Ogni mutazione mostra prima il dry-run. Le scritture file hanno checkpoint e
  rollback automatico in caso di errore.
- I log operativi conservano solo metadati sanitizzati; gli eventi di sicurezza
  sono concatenati per rendere evidente una manomissione.
- Le operazioni sensibili hanno budget più stretti del traffico di lettura. Le
  mappe dei limiter e le code hanno capacità massima.
- Beta e Stable accettano aggiornamenti solo se distinta, `latest.yml` e
  installer appartengono alla stessa catena firmata. La chiave privata non entra
  mai nel pacchetto.

## Rischio residuo e gate di rilascio

L'esecuzione di uno script autorizzato può produrre effetti che il runtime non
può annullare. Va quindi mantenuta in una cartella scelta dall'utente, con
anteprima e consenso coerenti con la modalità permessi. Prima di Beta o Stable:

1. eseguire `npm run security:regression`;
2. eseguire `npm run audit:runtime` e `npm run sbom`;
3. produrre il bundle con chiavi Ed25519 custodite fuori dal repository;
4. eseguire `npm run release:verify-bundle` sul bundle finale;
5. pubblicare insieme `release-manifest.json`, `release-manifest.sig.json`,
   `latest.yml`, installer e blockmap, senza rinominarli dopo la firma.
