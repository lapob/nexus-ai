# Valutazione Qwen3-TTS come voce di NexusNXS

Data: 11–12 novembre 2026. Hardware: AMD RX 9070 XT 16 GB, Windows 11, driver
32.0.32015. Esito: **integrato come opzione sperimentale, non adottato come
predefinito**. Kokoro resta la voce di default e il fallback automatico.

Aggiornamento 12 novembre: il percorso **GGUF** (llama.cpp Vulkan + ONNX
DirectML) misura **RTF 0,18 e 1,2 GB di VRAM** sul 0.6B e **RTF 0,21 e 1,7 GB**
sul 1.7B. Il primo audio è sotto i 330 ms. È candidato a runtime Qwen3
predefinito al posto di PyTorch ROCm (`NEXUS_QWEN3_RUNTIME=gguf`). Prima
servono la misura con un LLM in generazione e lo streaming fino al renderer:
vedi «Percorso GGUF».

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
- **LLM in generazione contemporanea: non misurato.** L'unico LLM su disco è
  il 27B in valutazione dall'altra sessione, e un secondo LLM non entra in
  VRAM. Inviare richieste al suo runtime ne avrebbe falsato le misure. Lo
  script `evaluate-qwen3-coexistence.js` è da estendere con `--runtime gguf`
  ed è da eseguire con l'eval di quella sessione terminata. Con RTF ≈ 0,2 il
  margine è ~5× (contro ~1× di PyTorch): un rallentamento anche di 2–3× sotto
  contesa resterebbe in tempo reale, ma va misurato.

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
costruisce `Qwen3GgufSpeechService`. Il collegamento in
`src/application/bootstrap.js` non è ancora fatto: oggi bootstrap istanzia
direttamente `Qwen3SpeechService`. Il servizio GGUF richiede che in
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

## Prossimi passi consigliati

1. ~~Misurare il percorso GGUF~~: fatto, RTF 0,18–0,21. Va collegato
   `createQwen3SpeechService(qwen3Option())` in bootstrap, a cura del
   proprietario di `bootstrap.js`.
2. Misurare TTS e LLM in generazione contemporanea, aggiungendo `--runtime
   gguf` a `evaluate-qwen3-coexistence.js`, quando la GPU non è usata dall'eval
   di un'altra sessione.
3. Streaming dei blocchi fino al renderer: un evento IPC per blocco, buffer di
   riproduzione senza pause da ~300 ms e stop che invia il `cancel` al worker.
   Senza, il primo audio percepito resta la sintesi completa (~1,0–1,3 s con
   il GGUF, paragonabile a Kokoro).
4. Ascolto umano delle coppie A/B (`qa-artifacts/qwen3-voice/qwen3-gguf-*`).
   Scegliere fra 0.6B e 1.7B: il 1.7B GGUF ha il WER migliore a un costo
   marginale.
5. Distribuzione: valutare il pacchetto runtime GGUF (DLL llama.cpp, ONNX
   Runtime DirectML, Python 3.14) per l'installer.
