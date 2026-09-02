/**
 * @module scripts/prepare-founder-preview
 * @description Prepara un pacchetto Preview pubblico e verificabile per tester invitati,
 * escludendo in modo esplicito applicazioni private, credenziali e dati operativi.
 */
const fs = require('node:fs');
const path = require('node:path');
const { verifyArtifactRecords } = require('./release-manifest');

// #region 01 - Contratto del pacchetto

const REQUIRED_KINDS = Object.freeze(['installer', 'apk']);

function option(argumentsList, name, fallback) {
  const value = argumentsList.find((argument) => argument.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : fallback;
}

function assertInsideProject(root, candidate) {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Destinazione Founder Preview non valida: ${candidate}`);
  }
  return absolute;
}

function selectedPublicArtifacts(manifest) {
  if (manifest.visibility !== 'public' || manifest.containsPrivateArtifacts !== false) {
    throw new Error('La distinta Founder Preview deve essere esclusivamente pubblica.');
  }
  if (manifest.releaseClass !== 'preview' || manifest.channel !== 'preview') {
    throw new Error('Il pacchetto per amici deve derivare dal canale Preview.');
  }
  const selected = manifest.artifacts.filter((artifact) => REQUIRED_KINDS.includes(artifact.kind));
  for (const kind of REQUIRED_KINDS) {
    if (selected.filter((artifact) => artifact.kind === kind).length !== 1) {
      throw new Error(`La distinta deve contenere un solo artefatto pubblico ${kind}.`);
    }
  }
  if (selected.some((artifact) => artifact.visibility !== 'public' || /control|console|private/i.test(artifact.name))) {
    throw new Error('Il pacchetto Founder Preview contiene un artefatto privato o ambiguo.');
  }
  return selected;
}

function testerGuide({ manifest, artifacts }) {
  const installer = artifacts.find((artifact) => artifact.kind === 'installer');
  const apk = artifacts.find((artifact) => artifact.kind === 'apk');
  return [
    'NexusNXS - Founder Preview su invito',
    '=====================================',
    '',
    `Versione desktop: ${manifest.version}`,
    `Versione Android: ${apk.componentVersion}`,
    'Servizio AI: https://ai.nexusnxs.com',
    '',
    'Questa e una Preview gratuita per un gruppo ristretto, non una release Stable o Play Store.',
    'Gli aggiornamenti sono manuali. Non disattivare antivirus, firewall o protezioni del dispositivo.',
    '',
    'WINDOWS 10/11 x64',
    `1. Verifica il checksum di ${installer.name} con PowerShell:`,
    `   Get-FileHash .\\${installer.name} -Algorithm SHA256`,
    `2. Il risultato deve essere: ${installer.sha256}`,
    '3. Avvia l installer. Windows puo mostrare un avviso editore perche questa Preview non e ancora firmata commercialmente.',
    '4. Non procedere se il checksum non coincide o il file proviene da un canale diverso da quello concordato.',
    '',
    'ANDROID 8 O SUCCESSIVO',
    `1. Installa ${apk.name} soltanto dal file ricevuto direttamente dal fondatore.`,
    '2. Se richiesto, abilita temporaneamente Installa app sconosciute solo per l app usata ad aprire il file.',
    '3. Dopo l installazione revoca nuovamente quel permesso.',
    `4. SHA-256 APK: ${apk.sha256}`,
    '',
    'PROVA CONSIGLIATA',
    '- una domanda breve nella lingua del dispositivo;',
    '- una richiesta complessa che richieda spiegazione o codice;',
    '- stop e rigenerazione della risposta;',
    '- voce, se microfono e lingua sono supportati;',
    '- stato offline disattivando temporaneamente la rete, poi riconnessione.',
    '- facoltativo: usa Migliora NexusNXS su una risposta verificata; il contributo entra soltanto in quarantena.',
    '',
    'SEGNALAZIONE',
    'Indica piattaforma, versione, ora approssimativa, passaggi, risultato atteso e risultato ottenuto.',
    'Allega solo schermate ritagliate. Non inviare password, token, indirizzi IP, documenti personali o contenuti riservati.',
    'Il contributo al miglioramento e facoltativo e richiede consenso esplicito nell applicazione.',
    '',
    'LIMITI NOTI DELLA PREVIEW',
    '- nessuna firma commerciale Windows o Android;',
    '- aggiornamento manuale;',
    '- disponibilita dipendente dal servizio NexusNXS online;',
    '- nessuna garanzia Stable o supporto di emergenza.',
    ''
  ].join('\n');
}

// #endregion
// #region 02 - Generazione ripetibile

function prepareFounderPreview({ projectRoot, manifestPath, outputDirectory }) {
  const root = path.resolve(projectRoot);
  const absoluteManifest = assertInsideProject(root, manifestPath);
  const destination = assertInsideProject(root, outputDirectory);
  const manifest = JSON.parse(fs.readFileSync(absoluteManifest, 'utf8'));
  verifyArtifactRecords(root, manifest);
  const artifacts = selectedPublicArtifacts(manifest);

  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  for (const artifact of artifacts) {
    fs.copyFileSync(path.resolve(root, artifact.path), path.join(destination, artifact.name));
  }

  const publicManifest = {
    schemaVersion: manifest.schemaVersion,
    product: manifest.product,
    version: manifest.version,
    generatedAt: manifest.generatedAt,
    channel: manifest.channel,
    visibility: manifest.visibility,
    containsPrivateArtifacts: false,
    artifacts
  };
  fs.writeFileSync(path.join(destination, 'release-manifest.preview.json'), `${JSON.stringify(publicManifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(destination, 'CHECKSUMS.sha256'), `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`).join('\n')}\n`, 'utf8');
  fs.writeFileSync(path.join(destination, 'LEGGIMI.txt'), testerGuide({ manifest, artifacts }), 'utf8');

  return { destination, files: fs.readdirSync(destination).sort(), artifacts };
}

// #endregion
// #region 03 - CLI

if (require.main === module) {
  try {
    const projectRoot = path.resolve(__dirname, '..');
    const result = prepareFounderPreview({
      projectRoot,
      manifestPath: option(process.argv.slice(2), 'manifest', 'release/release-manifest.json'),
      outputDirectory: option(process.argv.slice(2), 'output', 'artifacts/founder-preview')
    });
    process.stdout.write(`Founder Preview pronta: ${result.destination}\n${result.files.map((file) => `- ${file}`).join('\n')}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { prepareFounderPreview, selectedPublicArtifacts, testerGuide };

// #endregion
