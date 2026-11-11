# Firma dell'installer Windows

Senza una firma Authenticode di un editore riconosciuto, Windows SmartScreen mostra «Editore sconosciuto» al primo
avvio dell'installer. La pipeline è pronta per due modalità; manca solo l'account o il certificato, che il proprietario
deve acquistare o attivare (operazione a pagamento, non automatizzata).

Gli aggiornamenti automatici restano comunque protetti dal manifest firmato Ed25519 (`nxs-preview-1`): la firma
Authenticode serve alla fiducia di Windows, non sostituisce la verifica degli aggiornamenti.

## Modalità consigliata: Azure Artifact Signing (ex Trusted Signing)

Certificato gestito da Microsoft, rinnovato automaticamente, nessun file `.pfx` da custodire; reputazione SmartScreen
legata all'identità verificata. Richiede un abbonamento Azure e la verifica dell'identità (persona o azienda).

1. Nel portale Azure crea un account *Artifact Signing* (regione, ad esempio West Europe → endpoint
   `https://weu.codesigning.azure.net`), completa la *identity validation* e crea un *certificate profile* «Public Trust».
2. Crea una *app registration* Entra ID con un client secret e assegnale il ruolo
   *Artifact Signing Certificate Profile Signer* sull'account.
3. Imposta le variabili solo nella sessione di release (mai in un file del repository):

   | Variabile | Contenuto |
   | --- | --- |
   | `NEXUS_AZURE_SIGN_ENDPOINT` | endpoint regionale `https://<regione>.codesigning.azure.net` |
   | `NEXUS_AZURE_SIGN_ACCOUNT` | nome dell'account di firma |
   | `NEXUS_AZURE_SIGN_PROFILE` | nome del certificate profile |
   | `NEXUS_AZURE_SIGN_PUBLISHER` | nome dell'editore esattamente come nel certificato (CN) |
   | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | credenziali dell'app registration (segrete) |

4. `npm run build:win:signed`: electron-builder installa il modulo PowerShell `TrustedSigning`, firma eseguibili e
   installer con marca temporale Microsoft, poi lo script verifica con `Get-AuthenticodeSignature` che la firma sia
   `Valid` e marcata nel tempo; altrimenti esce con errore e nulla viene pubblicato.

## Alternativa: certificato OV/EV esportabile

`CSC_LINK` (percorso del `.pfx`) e `CSC_KEY_PASSWORD`. I certificati emessi dopo giugno 2023 risiedono su token o HSM
e di norma non sono esportabili: in quel caso usare Azure Artifact Signing.

## Verifica

- `node scripts/check-signing-readiness.js` mostra la modalità rilevata e cosa manca, senza stampare segreti.
- `release-all.js` passa le variabili di firma solo al passo di build firmato; gli altri passi non le vedono.
- Il canale Preview resta non firmato Authenticode finché l'account non è attivo; il canale stabile lo richiede.
