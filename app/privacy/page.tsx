import type { Metadata } from "next";
import { Database, EyeOff, Mail, ShieldCheck } from "lucide-react";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";

export const metadata: Metadata = { title: "Privacy — NexusNXS", description: "Informativa sulla privacy del sito pubblico e dei prodotti NexusNXS.", alternates: { canonical: "/privacy" }, openGraph:{title:"Privacy — NexusNXS",description:"Come NexusNXS tratta e protegge i dati.",images:[]}, twitter:{title:"Privacy — NexusNXS",description:"Come NexusNXS tratta e protegge i dati.",images:[]} };

export default function Privacy() { return <main className="inner-page legal-page" id="main-content"><SiteHeader />
  <header className="legal-hero"><p className="eyebrow"><ShieldCheck size={14} /> PRIVACY</p><h1>Dati essenziali.<br /><em>Controllo reale.</em></h1><p>Ultimo aggiornamento: 20 agosto 2026</p></header>
  <section className="legal-layout"><aside><a href="#site">Sito pubblico</a><a href="#apps">Applicazioni</a><a href="#security">Sicurezza</a><a href="#rights">Diritti e contatti</a></aside><article>
    <section id="site"><EyeOff /><h2>Sito pubblico</h2><p>NexusNXS non utilizza intenzionalmente cookie pubblicitari, profilazione commerciale o strumenti di tracciamento invasivo. L’infrastruttura può trattare dati tecnici strettamente necessari, come indirizzo IP, data, percorso richiesto e informazioni del browser, per erogazione, sicurezza e prevenzione degli abusi.</p></section>
    <section id="apps"><Database /><h2>Applicazioni NexusNXS</h2><p>Conversazioni, impostazioni e knowledge sono progettate per rimanere nella tua istanza e sui dispositivi collegati, salvo una funzione richiesta esplicitamente. Le app possono trasmettere dati all’istanza configurata dall’utente per sincronizzazione e funzionalità operative.</p><p>Le build pubbliche documenteranno separatamente eventuali autorizzazioni Android, accesso a microfono, file o notifiche e le relative finalità.</p></section>
    <section id="security"><ShieldCheck /><h2>Sicurezza e conservazione</h2><p>I dati tecnici vengono limitati allo scopo operativo e di sicurezza. Token e credenziali non devono essere inseriti nei messaggi di assistenza o nelle segnalazioni pubbliche. In caso di incidente, le informazioni necessarie vengono conservate soltanto per analisi, contenimento e obblighi applicabili.</p></section>
    <section id="rights"><Mail /><h2>Diritti e contatti</h2><p>Per richieste di accesso, correzione, cancellazione o informazioni sul trattamento puoi scrivere a <a href="mailto:privacy@nexusnxs.com">privacy@nexusnxs.com</a>. Per vulnerabilità utilizza invece <a href="mailto:security@nexusnxs.com">security@nexusnxs.com</a>.</p></section>
  </article></section><SiteFooter />
</main>; }
