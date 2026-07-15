# Git workflow

## Repository scope

Il repository Git dell'applicazione è esclusivamente la directory `.AI`. La
vault Obsidian che la contiene non appartiene a questo repository e non deve
essere aggiunta tramite percorsi esterni, symlink o copie accidentali.

## Ciclo di lavoro sicuro

All'inizio di una sessione, dalla directory `.AI`:

```powershell
git pull --ff-only
git status --short --branch
```

`--ff-only` evita merge commit automatici inattesi. Prima di creare un commit:

```powershell
git status
git diff
git add <FILE_1> <FILE_2>
git diff --cached
git commit -m "<MESSAGGIO>"
git push
```

Preferire `git add` selettivo a `git add .`. Non aggiungere `.env`, credenziali,
modelli, cache, database, log, dati personali o copie della vault.

## Primo collegamento a GitHub privato

Dopo aver creato manualmente un repository GitHub privato vuoto:

```powershell
git remote add origin <PRIVATE_REPOSITORY_URL>
git branch -M main
git push -u origin main
```

Verificare sempre l'URL con `git remote -v` prima del push. Usare Git Credential
Manager o autenticazione SSH; non salvare token nei file del progetto.

## Conflitti

1. Non usare `reset --hard` o force push come prima risposta.
2. Salvare o committare il lavoro locale prima di integrare modifiche remote.
3. Eseguire `git fetch` e ispezionare la divergenza.
4. Risolvere ogni file mantenendo intenzionalmente il contenuto corretto.
5. Eseguire test e `git diff --check` prima del commit di risoluzione.
6. Chiedere una review se il conflitto riguarda sicurezza, configurazione o RAG.

## Backup separato della vault

La vault mantiene una strategia indipendente dal repository applicativo:

- copia principale sulla chiavetta o supporto operativo scelto;
- seconda copia periodica su un altro disco;
- eventuale repository privato separato solo con decisione futura esplicita;
- esclusione preventiva di dati sensibili e file Obsidian non necessari;
- nessuna sincronizzazione automatica implementata in questa fase.

