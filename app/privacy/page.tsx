import type { Metadata } from "next";
import { Database, EyeOff, Mail, ShieldCheck } from "lucide-react";
import { SiteFooter } from "../components/SiteChrome";

export const metadata: Metadata = { title: "Privacy — NexusNXS", description: "Informativa sulla privacy del sito pubblico e dei prodotti NexusNXS.", alternates: { canonical: "/privacy" }, openGraph:{title:"Privacy — NexusNXS",description:"Come NexusNXS tratta e protegge i dati.",images:[]}, twitter:{title:"Privacy — NexusNXS",description:"Come NexusNXS tratta e protegge i dati.",images:[]} };

export default function Privacy() { return <main className="inner-page legal-page" id="main-content">
  <header className="legal-hero"><p className="eyebrow"><ShieldCheck size={14} /> PRIVACY</p><h1>Dati essenziali.<br /><em>Controllo reale.</em></h1><p>Ultimo aggiornamento: 20 agosto 2026</p></header>
  <section className="legal-layout"><aside><a href="#site">Sito pubblico</a><a href="#apps">Applicazioni</a><a href="#security">Sicurezza</a><a href="#rights">Diritti e contatti</a></aside><article>
    <section id="site"><EyeOff /><h2>Sito pubblico</h2><p>NexusNXS non utilizza intenzionalmente cookie pubblicitari, profilazione commerciale o strumenti di tracciamento invasivo. L’infrastruttura può trattare dati tecnici strettamente necessari, come indirizzo IP, data, percorso richiesto e informazioni del browser, per erogazione, sicurezza e prevenzione degli abusi.</p></section>
    <section id="apps"><Database /><h2>Applicazioni NexusNXS</h2><p>Cronologia, impostazioni e preferenze sono progettate per restare sui dispositivi associati. Per generare una risposta, le app pubbliche inviano al NexusNXS Core il testo richiesto e gli eventuali allegati scelti dall’utente tramite un canale cifrato; i modelli non vengono scaricati sul dispositivo.</p><p>Microfono, file e notifiche vengono usati soltanto dopo un’autorizzazione del sistema operativo e per la funzione selezionata. Le funzioni pubbliche non hanno accesso agli strumenti o alla knowledge privata di amministrazione.</p></section>
    <section id="security"><ShieldCheck /><h2>Sicurezza e conservazione</h2><p>I dati tecnici vengono limitati allo scopo operativo e di sicurezza. Token e credenziali non devono essere inseriti nei messaggi di assistenza o nelle segnalazioni pubbliche. In caso di incidente, le informazioni necessarie vengono conservate soltanto per analisi, contenimento e obblighi applicabili.</p></section>
    <section id="rights"><Mail /><h2>Diritti e contatti</h2><p>Per richieste di accesso, correzione, cancellazione o informazioni sul trattamento puoi scrivere a <a href="mailto:privacy@nexusnxs.com">privacy@nexusnxs.com</a>. Per vulnerabilità utilizza invece <a href="mailto:security@nexusnxs.com">security@nexusnxs.com</a>.</p></section>
  </article></section><SiteFooter />
</main>; }
