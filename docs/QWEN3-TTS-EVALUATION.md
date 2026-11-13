# Valutazione Qwen3-TTS come voce di NexusNXS

Data: 11–12 novembre 2026. Hardware: AMD RX 9070 XT 16 GB, Windows 11, driver
32.0.32015. Esito: **integrato come opzione sperimentale, non adottato come
predefinito**. Kokoro resta la voce di default e il fallback automatico.

Aggiornamento 12 novembre: il percorso **GGUF** (llama.cpp Vulkan + ONNX
DirectML) misura **RTF 0,18 e 1,2 GB di VRAM** sul 0.6B e **RTF 0,21 e 1,7 GB**
sul 1.7B. Il primo audio è sotto i 330 ms. È candidato a runtime Qwen3
predefinito al posto di PyTorch ROCm (`NEXUS_QWEN3_RUNTIME=gguf`). Questi
numeri valgono con un LLM da ~10,6 GB. Con `qwen3:14b` a 32K (13,7 GB) la
VRAM da 16 GB si esaurisce: LLM e TTS finiscono in parte in memoria
condivisa, il TTS sale a RTF 0,77–1,04 e l'LLM scende a 12–15 token/s.
Serve un budget di VRAM prima di renderlo predefinito (vedi «Convivenza»).
Il 13/11, con l'LLM a 16K, convivono: TTS a RTF ≤ 0,26 e LLM a 38,6
tok/s mentre parla. A 32K il TTS costa all'LLM il 55%, perché lo spinge in
memoria condivisa. Il gate `VramGate` sceglie già Kokoro in quel caso.

## Percorso scelto e alternative

| Percorso | Stato | Motivo |
|---|---|---|
| PyTorch ROCm per Windows (`torch 2.9.1+rocm7.2.1`, ruote ufficiali repo.radeon.com) + `qwen-tts 0.1.1` | **Verificato e misurato** | Unico percorso GPU già validato su questa macchina; nessun export dei pesi |
| GGUF (llama.cpp Vulkan) + ONNX DirectML (HaujetZhao/Qwen3-TTS-GGUF) | **Verificato e misurato** (12/11) | Export dai pesi ufficiali già presenti; RTF 0,18–0,21, VRAM 1,2–1,7 GB. Worker `qwen3-gguf-worker.py`, `NEXUS_QWEN3_RUNTIME=gguf` |
| Server FastAPI OpenAI-compatibile | Scartato | Wrapper sullo stesso stack PyTorch: aggiunge un servizio HTTP senza ridurre la latenza |
| Fork streaming dffdeeq | Scartato | Richiede flash-attn, Triton e build CUDA; nessun supporto ROCm |

L'italiano è una lingua nativa del modello, ma i 9 speaker CustomVoice non sono
italiani. Si usano i modelli **Base** in voice clone (modalità ICL), con
riferimenti generati da Kokoro (`im_nicola`, `if_sara`, ~9 s). In questo modo
l'identità vocale resta quella attuale.

## Streaming e barge-in

Il pacchetto ufficiale non espone uno streaming in uscita (`non_streaming_mode`
riguarda soltanto il testo in ingresso). Il worker `src/voice/qwen3-worker.py`:

- intercetta i frame del codec a 12,5 Hz mentre il talker li genera;
- li decodifica a blocchi (2 frame per il primo blocco, poi 4) con 25 frame di
  contesto sinistro, lo stesso schema causale del decoder ufficiale;
- emette i blocchi PCM su JSONL;
- su `{"type":"cancel"}` interrompe la generazione al frame successivo, senza
  terminare il processo (il modello resta caldo).

Fino al renderer (`src/voice/speech-stream.js`):

- il renderer chiede `synthesizeVoice({ stream: true, streamId })`;
- il processo principale inoltra ogni blocco WAV su `nexus:neural-voice-chunk`
  (id validato, al massimo 4 MB per blocco) e restituisce `{ streamed: true }`
  senza ripetere l'audio;
- `web/src/platform.ts` accoda i blocchi in ordine nel player esistente;
- con Kokoro di ripiego ogni segmento intero diventa un blocco; se Qwen3 cade
  dopo aver già parlato la frase non viene ripetuta.

Verifica in Electron (13 novembre, profilo isolato, `NEXUS_VOICE_ENGINE=qwen3`,
`NEXUS_QWEN3_RUNTIME=gguf`, con `qwen3:14b` residente):

- `VramGate` ha scelto Kokoro (VRAM piena), come previsto;
- 3 frasi in streaming, ogni volta 1 blocco in ordine, senza audio duplicato
  nella risposta, primo blocco a 1,3–1,4 s a caldo (3,6 s a freddo);
- la chiamata senza `stream` restituisce ancora l'audio intero.

Il percorso Qwen3 vero e proprio dentro Electron non è stato eseguito, perché
il gate resta chiuso con il 14b residente. Lo streaming Qwen3 è verificato a
livello di servizio (primo audio a caldo 262 ms) e con i test del relay.

## Misure (0.6B, bf16, SDPA, con un LLM da ~9 GB residente e inattivo)

Script: `node scripts/evaluate-qwen3-voice.js --size 0.6b`. Sei frasi italiane,
le stesse di `evaluate-local-voice.js`; mediane sulle 5 frasi a caldo.

| Metrica | Kokoro (CPU) | Qwen3 0.6B (GPU) | Qwen3 1.7B (GPU)* |
|---|---|---|---|
| Primo audio (worker) | 1026 ms (WAV intero) | **194 ms** (max 243) | ~276 ms |
| Sintesi completa di una frase da ~6 s | ~1,0 s | ~5,6 s | ~8,2 s |
| RTF | 0,16 | **0,98** (0,97–1,02) | 1,26–1,31 |
| Avvio a freddo | 2,4 s | 11,4 s (+ ~3 s alla prima frase) | ~16 s |
| VRAM | 0 | 2,6 GB | 4,5 GB |
| Barge-in: da stop a sintesi chiusa | – | **69 ms**, worker resta caldo | – |
| WER Whisper medium (intelligibilità) | 0,048 | 0,066 | – |

\*1.7B misurato con il profiler del worker (`torch.cuda.synchronize` per passo),
non con l'A/B completo: con l'LLM residente non entrava in VRAM.

Qualità: l'intelligibilità è equivalente. L'unico errore specifico di Qwen3 è
"NexusNXS" pronunciato male in una frase. Sull'uso di "40%" pesa soltanto la
normalizzazione, per entrambi i motori. La naturalezza va giudicata ad ascolto:
i WAV A/B sono in `qa-artifacts/qwen3-voice/` (locale, non pubblicato).

## Convivenza con l'LLM

- Con un `llama-server` da ~9,9 GB residente, l'uso della GPU era di 12,4/16 GB:
  il 0.6B (2,6 GB) entra con ~1,3 GB di margine, il 1.7B (4,5 GB) no.
- Con l'LLM residente ma inattivo, latenze e RTF del 0.6B non sono cambiati
  rispetto alla GPU libera.
- **Non misurato:** TTS e LLM in generazione contemporanea. Lo script è pronto
  (`scripts/evaluate-qwen3-coexistence.js`) e attende una GPU non occupata da
  eval di altre sessioni. Con RTF ≈ 1 qualunque contesa sulla GPU produce
  interruzioni nell'audio.
- `torch.cuda.mem_get_info` su HIP/Windows non vede la VRAM degli altri
  processi: fanno fede i contatori Windows `GPU Process Memory`.

## Percorso GGUF: llama.cpp Vulkan + ONNX DirectML (12 novembre)

Componenti: il talker (q5_k) e il code predictor (q8_0) girano su llama.cpp
b11789 Vulkan. Il decoder del codec (fp16) usa ONNX Runtime DirectML 1.24.4,
gli encoder ONNX la CPU. Il worker `src/voice/qwen3-gguf-worker.py` usa lo
stesso protocollo JSONL del worker PyTorch:

- genera un frame da 16 codebook per passo;
- un thread separato decodifica a blocchi con il decoder ONNX stateful: 4 frame
  per il primo blocco, poi 12;
- la decodifica si sovrappone alla generazione invece di sommarsi;
- il `cancel` viene controllato a ogni frame.

Script: `node scripts/evaluate-qwen3-voice.js --runtime gguf --size 0.6b|1.7b`.
Sono le stesse sei frasi della baseline, con mediane sulle 5 a caldo e un
`llama-server` da ~10,6 GB residente e inattivo, come nella baseline (era il
27B dell'eval di un'altra sessione). La VRAM è letta dai contatori Windows
`GPU Process Memory` sull'albero di processi del worker: il `python.exe` del
venv è solo un launcher.

| Metrica | Kokoro (CPU) | PyTorch 0.6B | **GGUF 0.6B** | PyTorch 1.7B* | **GGUF 1.7B** |
|---|---|---|---|---|---|
| Primo audio (worker) | 997 ms (WAV intero) | 194 ms | **252 ms** (max 261) | ~276 ms | **309 ms** (max 326) |
| RTF | 0,19 | 0,98 | **0,18** | 1,26–1,31 | **0,21** |
| Sintesi completa di una frase da ~6 s | ~1,0 s | ~5,6 s | **~1,0 s** | ~8,2 s | **~1,3 s** |
| Avvio a freddo (fino a `ready`) | 1,4 s | 11,4 s (+ ~3 s) | **4,3 s** | ~16 s | **6,4 s** (+ ~2 s alla 1ª frase) |
| VRAM | 0 | 2,6 GB | **1,16–1,20 GB** | 4,5 GB | **1,63–1,66 GB** |
| Barge-in: da stop a sintesi chiusa | – | 69 ms | **4 ms**, worker caldo | – | **12 ms**, worker caldo |
| WER Whisper medium | 0,048 | 0,066 | 0,078 | – | **0,036** |

\*Baseline PyTorch 1.7B dal profiler del worker, come sopra.

Osservazioni:

- **Il criterio RTF ≤ 0,6 è superato con ampio margine.** Il collo di
  bottiglia PyTorch (lanci di kernel, ~77 ms per frame) sparisce: il passo
  talker + predictor su Vulkan resta ben sotto gli 80 ms per frame.
- **Il 1.7B GGUF costa poco più del 0.6B:** RTF 0,21 contro 0,18, +0,5 GB e
  ~60 ms di primo audio in più. In cambio ha il WER migliore (0,036, meglio di
  Kokoro) e pronuncia "NexusNXS" correttamente. Il 0.6B sbaglia la stessa
  parola e le sigle ("ITTPS"), come fa la versione PyTorch.
- **Primo audio:** il PyTorch 0.6B partiva con 2 frame, il GGUF con 4. Con un
  primo blocco più corto si scende ancora (`NEXUS_QWEN3_FIRST_FRAMES`), ma
  sotto i 4 frame di lookahead il decoder stateful emette poco audio utile.
- **Varianza da contesa sulla GPU.** Due esecuzioni sono uscite anomale e non
  si sono ripetute nelle esecuzioni successive:
  - il primo A/B del 0.6B ha dato RTF 1,4 e primo audio 1,9 s (tre
    ripetizioni successive: RTF 0,18–0,22);
  - il primo 1.7B ha dato una prima frase a 10,5 s e RTF fino a 0,49 (una
    ripetizione: RTF 0,21).
  In quel periodo il runtime eval dell'altra sessione era stato riavviato
  (ollama 11435, ore 20:30). La causa non è dimostrata. Indica però quanto il
  TTS sia sensibile a un LLM attivo sulla stessa GPU: vedi «Convivenza».
- **Due dispositivi Vulkan.** ggml vede sia la RX 9070 XT sia la iGPU del
  Ryzen 9800X3D. Il servizio imposta `GGML_VK_VISIBLE_DEVICES=0`. Con
  `0,1` le misure sono equivalenti (RTF 0,18): non è stata la causa delle
  anomalie, ma evita che i layer finiscano sulla iGPU.

### Convivenza con l'LLM (GGUF)

- **LLM residente e inattivo** (~10,6 GB): misurato. La GPU arriva a ~13 GB su
  16, e il TTS GGUF (1,2 o 1,7 GB) entra con 1,5–2 GB di margine. Il PyTorch
  1.7B (4,5 GB) non entrava.
- **Con `qwen3:14b` a 32K di contesto, il modello di ogni giorno: misurato,
  e non entra.**
  - Comando: `node scripts/evaluate-qwen3-coexistence.js --ollama <runtime
    dell'app> --model qwen3:14b --size 0.6b --runtime gguf`.
  - Report: `qa-artifacts/qwen3-voice/coexistence-qwen3_14b-gguf-0.6b.json`.

  | | Primo audio (mediana / max) | RTF TTS | LLM token/s |
  |---|---|---|---|
  | LLM da solo | – | – | 15,3 |
  | TTS GGUF 0.6B, LLM inattivo | 1040 / 1093 ms | 0,77 | – |
  | TTS GGUF 0.6B, LLM in generazione | 1422 / 2464 ms | 1,04 | 12,5 |

  **La causa è la VRAM, non il calcolo.** Ollama riporta 13,7 GB per
  `qwen3:14b` a 32K. I contatori Windows mostrano il `llama-server` con
  12,3 GB dedicati e **2,0 GB già riversati nella memoria condivisa**:
  l'adattatore è a 15,0/16 GB, con ~1,6 GB tenuti da dwm, dal desktop e dai
  browser. Per questo l'LLM gira a 15 token/s anche da solo, contro i ~39 con
  tutto in VRAM (`hardware-profile.js`, 9/11). Il TTS (1,2 GB) aggrava la
  pressione: entrambi lavorano in parte nella RAM di sistema via PCIe, e il TTS
  passa da RTF 0,18 a 0,77–1,04.

  Con lo stesso `qwen3:14b` residente e inattivo, e con il `llama-server` a
  11,9 GB dedicati più 2,4 GB condivisi:

  | | RTF | Primo audio | VRAM TTS |
  |---|---|---|---|
  | Decoder DirectML | 0,71 | 961 ms | 0,5–0,85 GB dedicati |
  | Decoder CPU (`--onnx-provider CPU`) | 0,67 | 1002 ms (max 1804) | 0,46–0,48 GB |

  Report: `qa-artifacts/qwen3-voice/qwen3-gguf-0.6b{,-cpudec}-14b-resident`.
  **Spostare il decoder sulla CPU non basta:** il collo di bottiglia è il
  talker su una GPU senza VRAM libera.

  **Conseguenza:** su una GPU da 16 GB, il Qwen3 su GPU (GGUF o PyTorch) e
  `qwen3:14b` a 32K non convivono.

  ### Regola VRAM (scelta del proprietario, 12/11): Kokoro se la VRAM è piena

  `src/voice/gpu-memory.js` (`VramGate`) legge i contatori Windows ogni 20 s,
  in modo asincrono, con una sola passata PowerShell da ~1,5 s:
  - la VRAM totale, dal registro (`qwMemorySize`, a 64 bit);
  - l'uso dedicato e condiviso dell'adattatore principale;
  - l'uso dell'albero di processi del worker Qwen3.

  Qwen3 è disponibile solo se valgono entrambe le condizioni:
  - **VRAM libera**, cioè totale − usata + quella del worker stesso, ≥
    fabbisogno + 512 MB di margine. Fabbisogno misurato: GGUF 1,25 GB (0.6B)
    o 1,7 GB (1.7B); PyTorch 2,7 GB o 4,6 GB.
  - **memoria degli altri processi riversata nella RAM condivisa < 1 GB.** È
    il segnale decisivo: con `qwen3:14b` a 32K risultano ~2 GB "liberi", ma
    l'LLM ha già riversato 2,6 GB in memoria condivisa.

  Se il gate è chiuso:
  - `capabilities()` riporta `available: false` con `unavailableReason:
    'vram-spill' | 'vram-full'`, e `FallbackSpeechService` parla con Kokoro;
  - il worker Qwen3 inattivo viene chiuso, per restituire la VRAM all'LLM. Mai
    durante una sintesi.

  Quando la VRAM torna disponibile, il worker si riscalda da solo. Fino alla
  prima lettura lo stato è `pending` e parla Kokoro, così all'avvio non si
  carica un worker in una GPU piena. Senza contatori (fuori da Windows o se la
  lettura fallisce) il gate non blocca.

  Il gate è collegato in `createQwen3SpeechService`, che bootstrap già usa.
  `vramGate: false` lo esclude, ed è quello che fanno gli script di
  valutazione. Verificato dal vivo con `qwen3:14b` residente: all'avvio lo
  stato è `vram-pending`, dopo la lettura `vram-spill`, e nessun worker parte.
  Test: `tests/gpu-memory.test.js`, con gli snapshot misurati.

  ### 32K contro 16K (13 novembre, con l'LLM dell'app ricaricato e poi riportato a 32K)

  Comando: `evaluate-qwen3-coexistence.js --num-ctx 32768|16384`.
  Report: `qa-artifacts/qwen3-voice/coexistence-qwen3_14b-gguf-0.6b-ctx{32768,16384}.json`.

  Oggi l'LLM a 32K entrava quasi tutto in VRAM (0,15 GB condivisi), a
  differenza del 12/11 (2,4 GB). Come detto sotto, quella quota cambia con
  quanto usa il desktop.

  | `qwen3:14b` + TTS GGUF 0.6B | 32K (13,7 GB) | 16K (11,3 GB) |
  |---|---|---|
  | LLM da solo | 51,9 tok/s | 52,0 tok/s |
  | TTS, LLM inattivo: primo audio / RTF | 294 ms / 0,20 | 315 ms / 0,24 |
  | TTS, LLM in generazione: primo audio / RTF | 455 ms / 0,33 | 363 ms (max 485) / 0,26 |
  | **LLM durante il TTS** | **23,1 tok/s (−55%)** | **38,6 tok/s (−26%)** |
  | Memoria dell'LLM in RAM condivisa dopo il TTS | 1,18 GB | 0,2 GB |
  | Verdetto `VramGate` per il GGUF 0.6B, LLM caricato e TTS spento | `full`, 321 MB liberi | `ok`, 1845 MB liberi |

  Lettura:
  - **A 32K il TTS parla bene, ma lo paga l'LLM.** Windows fa posto al worker
    spostando 1,18 GB dell'LLM nella RAM condivisa, e quella memoria resta lì
    anche dopo la chiusura del TTS. Il dimezzamento dei token/s viene da questo
    e dalla contesa sulla GPU. Il verdetto `full` del gate è quindi corretto:
    Kokoro evita di rallentare l'LLM.
  - **A 16K convivono:** il TTS resta in tempo reale con margine (RTF ≤ 0,26),
    l'LLM perde il 26% solo mentre il TTS sintetizza, e il gate lo ammette da
    solo. Il GGUF 1.7B (servono 1,7 GB + 512) e PyTorch restano esclusi.
  - **A 32K l'LLM è al limite della VRAM anche da solo.** Dopo il ripristino ha
    1,09 GB in memoria condivisa, perché quanto sta in VRAM dipende dal
    desktop: dwm da solo ha 1–1,3 GB. La velocità resta 51,2 tok/s.

  **Applicato:** con `NEXUS_VOICE_ENGINE=qwen3`, `runtimeTuning(hardware, {
  gpuVoice: true })` limita il contesto dell'LLM a 16K sulle GPU sotto i 20 GB.
  Lo passa bootstrap, e il test è in `tests/hardware-profile.test.js`. Senza
  l'opzione Qwen3 nulla cambia: Kokoro predefinito e 32K. Con 24 GB restano
  32K. Il `VramGate` resta la seconda difesa: se il desktop o un altro modello
  occupano la VRAM, parla Kokoro.

  Con l'LLM da ~10,6 GB (sopra) il TTS resta a RTF 0,18: entro quel budget
  la convivenza funziona.

### Preparazione del runtime (riproducibile, gitignored)

Tutto il runtime sta in `vendor/qwen3-tts-gguf/`:

- `src/`: il repo HaujetZhao/Qwen3-TTS-GGUF (main del 12/11, zip codeload).
- `llama-b11789/`: dallo zip in `.toolchains/cache`, SHA-256 `29502BD5…B7EC`.
  Le DLL vanno copiate in `src/qwen3_tts_gguf/inference/bin`.
- `.venv`: Python 3.14 con `onnxruntime-directml 1.24.4`, `gguf`, `numpy`,
  `scipy`, `soundfile`, `sounddevice` e `tokenizers`.
- `.venv-export`: Python 3.12 con `torch 2.10 CPU` e `transformers 4.57.6`,
  più `onnx` e `onnxscript`. Con torch 2.9.1 ROCm l'export dinamo del codec
  encoder e del decoder fallisce, mentre gli script escono comunque con
  codice 0.
- `run-export.ps1 -Size 0.6b|1.7b`: esegue i passi 11→34 sui pesi in
  `vendor/qwen3-tts/models`. Il risultato va in `models/<modello>`: 0.6B
  ~0,8 GB di file d'inferenza, 1.7B ~1,5 GB.

Le voci di riferimento sono quelle di `vendor/qwen3-tts/voices`. Non è stato
scaricato nessun peso.

Patch al vendor, tutte marcate `NexusNXS`:

1. `llama.py` è scritto per b10621. In b11789 `llama_model_params` ha in più
   `lazy_mode` dopo `load_mode`, e `llama_context_params` ha `moe_cache_size`
   dopo `type_v`. Senza i due campi le struct sono disallineate. Le 40 firme di
   funzione usate sono identiche: il confronto è stato fatto sugli header
   `llama.h` dei due tag.
2. `33-Convert-Predictor-GGUF.py` cerca `convert_hf_to_gguf` in
   `ref/llama.cpp`, che non esiste. Ora usa lo stesso percorso dello script 23.
3. `export_config.py` legge sorgente e destinazione da `QWEN3_GGUF_SOURCE` e
   `QWEN3_GGUF_DEST` invece che da `~/.cache/modelscope`.

Il worker rimuove l'handler di log su file del pacchetto: il testo da
sintetizzare non finisce né in `log/latest.log` né su stdout o stderr.

## Problemi trovati su ROCm/Windows (risolti nel worker)

1. **MIOpen** ricade sul solver `GemmFwdRest` senza workspace e ricalibra a ogni
   nuova lunghezza del decoder: da 0,4 a 18 s per blocco. Con
   `torch.backends.cudnn.enabled = False` la convoluzione nativa impiega ~25 ms.
   Effetto sull'RTF: da 2,1 a 1,0.
2. Senza `USERPROFILE` e `LOCALAPPDATA` le cache dei kernel non vengono usate e la
   prima sintesi supera il timeout: il servizio ora le passa al worker.
3. La chiusura dell'interprete con HIP si blocca: il worker termina con
   `os._exit`, e il servizio usa comunque `taskkill /t`.
4. Un'inizializzazione HIP è fallita una volta ("No HIP GPUs are available") ed è
   tornata normale subito dopo: il fallback a Kokoro copre il caso.

## Perché non è il predefinito

Il punto 1 vale solo per il runtime PyTorch: il GGUF lo risolve. I punti 2 e 3
valgono per entrambi i runtime, ma il GGUF scende a ~1,2–1,7 GB residenti, con
un avvio di 4–6 s e circa 0,8–1,5 GB di pesi più il runtime.

1. **RTF ≈ 1 (0.6B, PyTorch):** la generazione tiene appena il ritmo della riproduzione.
   Lo streaming continuo richiede un buffer, e ogni contesa con l'LLM lo svuota.
   Il collo di bottiglia è il passo del talker più il code predictor: ~77 ms
   per frame su un budget di 80 ms. Il costo è dominato dai lanci di kernel,
   e su ROCm Windows non sono disponibili né `torch.compile` né flash-attn.
2. **Contratto attuale dell'app:** il renderer riceve una WAV completa per
   segmento (`synthesizeVoice`). Il primo audio percepito con Qwen3 diventa
   quindi ~5,5 s, contro ~1 s con Kokoro. Il vantaggio di 194 ms esiste solo
   portando i blocchi in streaming fino alla riproduzione.
3. Occupa 2,6 GB di VRAM residenti, ha un avvio a freddo di ~14 s e non è
   distribuibile nell'installer (~6 GB fra runtime e pesi).

## Attivazione (sviluppo)

```powershell
$env:NEXUS_VOICE_ENGINE = 'qwen3'   # vuoto = Kokoro
$env:NEXUS_QWEN3_SIZE = '0.6b'      # o 1.7b
$env:NEXUS_QWEN3_RUNTIME = 'gguf'   # vuoto/torch = PyTorch ROCm
```

`qwen3Option()` legge `NEXUS_QWEN3_RUNTIME` e `createQwen3SpeechService()`
costruisce `Qwen3GgufSpeechService`. Bootstrap lo usa con le voci di
`vendor/qwen3-tts/voices` in sviluppo. Il servizio GGUF richiede che in
`vendor/qwen3-tts-gguf` ci siano `.venv`, `llama.dll`, i due GGUF, i tre ONNX
fp16 e `tokenizer.json`, oltre alla voce in `voicesDirectory`. Se manca un
file, la voce resta Kokoro.

Runtime atteso in `vendor/qwen3-tts/` (gitignored): `.venv` Python 3.12 con
torch ROCm e `qwen-tts` installato con `--no-deps` (senza gradio),
`models/Qwen3-TTS-12Hz-{0.6B,1.7B}-Base` e
`voices/nexus-{male,female}-reference.{wav,txt}`. Se manca anche un solo file,
la capability è falsa e la voce resta Kokoro. Dopo 2 errori consecutivi Qwen3
viene escluso per 5 minuti. `FallbackSpeechService` non sostituisce mai una
sintesi annullata con Kokoro.

## Analisi oggettiva dei campioni A/B (13 novembre)

Questa analisi completa l'ascolto del proprietario, non lo sostituisce. È
calcolata su 24 WAV a 24 kHz: 6 frasi per 4 motori, cioè Kokoro, 0.6B PyTorch,
0.6B GGUF e 1.7B GGUF (`-r2`). Non usa modelli scaricati: solo librosa (pyin
per la F0) e soundfile. Metriche per file in
`qa-artifacts/qwen3-voice/ab-metrics.json` (locale). C'è anche una pagina di
ascolto alla cieca ripetibile: `qa-artifacts/qwen3-voice/ascolto-ab.html`, con
24 prove e risultati esportabili in JSON.

| Media su 6 frasi | Kokoro | 0.6B PyTorch | 0.6B GGUF | 1.7B GGUF |
|---|---|---|---|---|
| WER Whisper | 0,048 | 0,066 | 0,078 | 0,036 |
| Sillabe/s nel parlato | 4,9 | 5,4 | 5,3 | 5,3 |
| Estensione F0 (semitoni, p5–p95) | 10,5 | 13,6 | 11,5 | 9,8 |
| Pause interne ≥150 ms (su 2,3 attese) | 1,2 | 0,8 | 0,8 | 1,2 |
| Parlato sonoro (%) | 78 | 65 | 76 | 72 |
| Salti di F0 >5 semitoni, clic | 0 | 0 | 0 | 0–1 |
| Picco (dBFS) / campioni saturi | −1,4 / 0,03 % | −2,8 / 0 | −2,8 / 0 | −2,0 / 0 |
| Finali troncati (ultimi 20 ms > −30 dB) | 0/6 | 2/6 | 2/6 | 1/6 |

**Nessun motore ha artefatti** (glitch di intonazione, clic, rumore nelle pause).
Le differenze sono di prosodia e di chiusura delle frasi.

- **GGUF contro PyTorch (0.6B):** nessuna perdita dovuta all'export.
  - Stesso ritmo, nessun artefatto.
  - Il GGUF ha un timbro più stabile: F0 maschile tra 83 e 93 Hz, contro 88–118
    Hz del PyTorch fra una frase e l'altra.
  - Il GGUF ha meno parlato «soffiato»: 76 % di parlato sonoro, contro 65 %.
  - Su «prosodia» e «dialogo» il PyTorch non fa alcuna pausa.
- **Qwen3 contro Kokoro:**
  - Qwen3 parla circa il 10 % più veloce, fino a 6,6–6,9 sillabe/s su
    «energia» e «pause».
  - Kokoro chiude sempre con silenzio, ma va a 0 dBFS e satura leggermente
    nelle frasi femminili.
- **1.7B contro 0.6B:**
  - Il 1.7B legge meglio (WER 0,036) e fa più pause sulla punteggiatura.
  - L'intonazione è un po' più piatta (9,8 semitoni).
  - Il proprietario ha preferito il 0.6B.
- **Finali troncati** (Qwen3, entrambi i runtime):
  - Alcune frasi finiscono con il parlato ancora a piena energia: l'ultimo
    campione arriva a 0,14 di ampiezza.
  - Il codec smette di generare dentro l'ultimo fonema, e all'ascolto suona
    come una chiusura secca o un piccolo clic.
  - Nel worker non esiste dissolvenza né coda di silenzio.

## Prossimi passi consigliati

1. ~~Misurare il percorso GGUF~~: fatto, RTF 0,18–0,21. Collegato in
   bootstrap con `createQwen3SpeechService` e `NEXUS_QWEN3_RUNTIME=gguf`.
2. ~~Convivenza con `qwen3:14b`~~: misurata, a 32K non c'è VRAM per il TTS.
   ~~Regola automatica~~: fatta, Kokoro se la VRAM è piena (`VramGate`).
   Il decoder ONNX su CPU è stato misurato e non basta. ~~LLM a 16K~~:
   misurato, convivono (vedi «32K contro 16K»). ~~16K automatico quando Qwen3
   è attivo~~: fatto (`runtimeTuning`, `gpuVoice`).
3. ~~Streaming dei blocchi fino al renderer~~: implementato da un'altra
   sessione (`src/voice/speech-stream.js`, IPC `nexus:neural-voice-chunk`,
   `web/src/platform.ts`).
4. ~~Ascolto umano delle coppie A/B~~: fatto dal proprietario il 13 novembre.
   Scelta: **0.6B**, che è già il valore predefinito di `NEXUS_QWEN3_SIZE`.
   Il 1.7B resta selezionabile.
5. ~~Distribuzione: valutare il pacchetto runtime GGUF~~: valutato il 13
   novembre, vedi «Pacchetto runtime GGUF per l'installer».
6. ~~Chiusura delle frasi~~: fatta il 13 novembre. Entrambi i worker usano
   `TailCloser`, che trattiene gli ultimi 20 ms dello stream e alla fine li
   chiude con una dissolvenza a coseno seguita da 120 ms di silenzio.
   - Rigenerazione GGUF 0.6B (`qwen3-gguf-0.6b-fade`):
     - 6 finali su 6 chiusi in silenzio (137–182 ms), prima erano 2 troncati
       su 6;
     - primo audio 312 ms, RTF 0,23, WER 0,036;
     - barge-in in 7 ms.
   - Il worker PyTorch ha la stessa classe ed è coperto dal test unitario, ma
     non è stato rigenerato.

## Pacchetto runtime GGUF per l'installer (valutazione, 13 novembre)

### Come si distribuisce oggi

- **Installer pubblico (0.3.39, 108 MB)**: client leggero.
  `run-electron-builder.js` svuota `extraResources` e l'installer contiene
  solo `app.asar`. Voce e AI girano sul Core del proprietario.
- **Pacchetto completo** (privato, oppure `NEXUS_BUNDLE_OFFLINE_VOICE=1`):
  aggiunge circa 700 MB di runtime neurali, prima della compressione.

  | Componente | Dimensione |
  |---|---|
  | Kokoro, modelli | 337 MB |
  | Kokoro, site-packages | 166 MB |
  | CPython standalone 3.13 condiviso | 47 MB |
  | Whisper | 154 MB |

- Il modello Kokoro è identico: Python standalone in `resources/python`,
  più `site-packages` e i modelli in `resources/kokoro`.

### Cosa servirebbe per Qwen3 GGUF 0.6B

Solo i file usati a runtime, misurati in `vendor/qwen3-tts-gguf`:

| Parte | Dimensione |
|---|---|
| talker `q5_k.gguf` | 301 MB |
| predictor `q8_0.gguf` | 144 MB |
| decoder ONNX fp16 | 219 MB |
| encoder codec + speaker fp16 (per clonare la voce di riferimento) | 126 MB |
| embeddings `.npy` | 429 MB |
| tokenizer | 11 MB |
| **Modello, totale** | **circa 1,23 GB** |
| DLL llama.cpp Vulkan (senza server, cli, bench e quantize) | circa 60 MB |
| Pacchetto `qwen3_tts_gguf/inference` | pochi MB |
| site-packages (onnxruntime-directml 71, numpy 52, scipy 129 per lo spettrogramma mel, tokenizers, gguf, soundfile, protobuf, flatbuffers; senza sympy, sounddevice, hf_hub, pip) | circa 280 MB |
| CPython 3.14 standalone | circa 50 MB |
| **Totale** | **circa 1,6 GB** |

Il totale scende di circa 250 MB (encoder e scipy) se la voce di riferimento
viene precalcolata. GGUF quantizzato e fp16 si comprimono poco, quindi
l'installer crescerebbe di circa 1,4–1,5 GB.

### Ostacoli concreti

1. **Python.** `qwen3_tts_gguf` dichiara `requires-python >=3.14`, e le 129
   estensioni del venv sono `cp314`. Il venv attuale punta al Python 3.14
   installato nel profilo utente, quindi non si può distribuire così.
   Servirebbe un secondo CPython standalone, con versione e sha256 fissati
   come in `config/python-runtime.json`. In alternativa si può verificare
   la 3.13 (senza garanzia upstream).
2. **Layout.** `Qwen3GgufSpeechService.paths()` cerca
   `<runtime>/.venv/Scripts/python.exe`. Per il pacchetto deve accettare,
   come Kokoro, un `pythonExecutable` condiviso più un `PYTHONPATH`.
   Va cambiato anche `after-pack` per la pulizia delle site-packages.
3. **Limite NSIS.** I dati di un installer NSIS singolo superano male i
   2 GB. Pacchetto completo (circa 0,7 GB) più Qwen3 (circa 1,5 GB) supera
   quella soglia.
4. **Hardware.** Qwen3 serve solo con una GPU Vulkan e VRAM libera (oltre al
   16K, c'è il `VramGate`). Sugli altri PC il pacchetto sarebbe peso morto,
   perché parla comunque Kokoro.
5. **Licenze, compatibili con la ridistribuzione** (da riportare negli
   avvisi di terze parti):

   | Componente | Licenza |
   |---|---|
   | `qwen3-tts-gguf` | MIT |
   | llama.cpp | MIT |
   | ONNX Runtime | MIT |
   | DirectML | Microsoft, redistribuibile con ORT |
   | Pesi Qwen3-TTS | Apache-2.0 |
   | Riferimenti voce generati con Kokoro | Apache-2.0 |

### Raccomandazione

Non mettere Qwen3 nell'installer, né in quello pubblico né in quello
completo. Distribuirlo come **pacchetto voce opzionale scaricato su
richiesta**:

- un archivio di circa 1,3–1,6 GB con manifest sha256, CPython 3.14 fissato
  e solo i file runtime;
- si installa nella cartella dati portabile, con la stessa verifica di
  integrità dei runtime esistenti;
- è proposto solo se l'hardware lo regge (GPU Vulkan, almeno 12 GB di VRAM);
- si attiva con `NEXUS_VOICE_ENGINE=qwen3`, o con una futura impostazione.

Il fallback resta Kokoro. Costi in codice:

- `paths()` con Python condiviso;
- uno script `prepare-qwen3-voice-pack`, che sfoltisce, scrive il manifest
  e crea l'archivio;
- un passo di provisioning.

Non serve nessuna modifica all'installer.

### Implementazione (13 novembre)

| Parte | Cosa fa |
|---|---|
| `src/voice/voice-pack.js` | Gestisce layout, manifest (sha256 e dimensione per file), verifica rapida e profonda, installazione e rimozione. Rifiuta file estranei e percorsi non sicuri, ma tollera `src/log/`, dove la libreria scrive il suo log. |
| `scripts/prepare-qwen3-voice-pack.js` (`npm run voice:qwen3:pack -- --python <CPython 3.14>`) | Crea in `release/voice-packs/` il pacchetto con i soli file di runtime, il manifest e un `.tar` non compresso. Il risultato è una build generata e non va nel repository. |
| `Qwen3GgufSpeechService` | Accetta `pythonExecutable` e `sitePackages`, e avvia il worker con `-I -B` e `site.addsitedir`. Con `-B` il pacchetto resta privo di `__pycache__`. |
| `config/voice-packs.json` | Catalogo con URL e sha256 fissati. Con l'URL vuoto il pacchetto risulta «non ancora pubblicato». |
| Bootstrap | Se `<dati>/voice-packs/qwen3-tts-gguf-0.6b` è valido, attiva Qwen3 GGUF 0.6B con il Python del pacchetto. `NEXUS_VOICE_ENGINE=kokoro` lo lascia spento. Il limite a 16K e il `VramGate` restano attivi. |
| IPC e preload | `voicePackStatus`, `installVoicePack`, `cancelVoicePack`, `removeVoicePack`, `onVoicePackEvent` (avanzamento). Non esistono nel client pubblico. |

Comportamento di installazione e rimozione:

- l'installazione libera prima la voce Qwen3 in uso, e il nuovo pacchetto
  vale dopo il riavvio dell'app;
- la sorgente è l'URL del catalogo; per il proprietario va bene anche un
  archivio locale (`NEXUS_QWEN3_PACK_ARCHIVE`, opzionale
  `NEXUS_QWEN3_PACK_SHA256`);
- un archivio con digest errato o file manomessi non sostituisce il
  pacchetto già installato.

Misure con il pacchetto reale v1:

- 1548 MB, 3040 file;
- archivio `.tar` da 1,63 GB, sha256 `72b3be39…37e4e6`;
- nel pacchetto: Python 3.14.7 (36 MB), site-packages (209 MB),
  libreria e DLL (72 MB), modello (1230 MB).

Verifica (`qa-artifacts/qwen3-voice-pack-smoke.js`):

- installazione da `.tar` con sha256 profondo: 6,5 s;
- sintesi usando solo il pacchetto: primo blocco a caldo in 290 ms, primo
  avvio in circa 26 s;
- dopo l'uso la verifica passa ancora e la rimozione riesce.

In Electron, con un profilo isolato e il pacchetto installato:

- `voicePackStatus` risponde `installed`, `active` ed `eligible`;
- la voce è rimasta Kokoro perché la VRAM era piena: 433 MB liberi, motivo
  `full`. È il comportamento voluto del gate.

Ancora da fare:

- **Hosting.** Pubblicare il `.tar` e compilare `url` e `sha256` nel
  catalogo. Va scelto dove ospitarlo: GitHub Releases ha un limite di 2 GB
  per file, quindi va bene.
- **CPython per la distribuzione.** Il pacchetto v1 contiene il CPython 3.14
  installato in locale. Per la distribuzione conviene un python-build-standalone
  3.14 con versione e sha256 fissati; serve l'approvazione per scaricarlo.
- **Interfaccia.** Manca il pulsante nel Centro di controllo, in un file oggi
  modificato da un'altra sessione. I canali IPC sono pronti.
