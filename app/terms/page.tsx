import type { Metadata } from "next";
import { CircleDollarSign, FileText, Scale, ShieldAlert, Wrench } from "lucide-react";
import { SiteFooter } from "../components/SiteChrome";

export const metadata: Metadata = { title: "Termini d’uso — NexusNXS", description: "Condizioni per l’utilizzo del sito e delle versioni preliminari NexusNXS.", alternates: { canonical: "/terms" }, openGraph:{title:"Termini d’uso — NexusNXS",description:"Condizioni d’uso del sito e dei prodotti NexusNXS.",images:[]}, twitter:{title:"Termini d’uso — NexusNXS",description:"Condizioni d’uso del sito e dei prodotti NexusNXS.",images:[]} };

export default function Terms() { return <main className="inner-page legal-page" id="main-content">
  <header className="legal-hero"><p className="eyebrow"><Scale size={14} /> TERMINI D’USO</p><h1>Regole chiare.<br /><em>Software responsabile.</em></h1><p>Ultimo aggiornamento: 31 agosto 2026</p></header>
  <section className="legal-layout"><aside><a href="#scope">Ambito</a><a href="#preview">Versioni preliminari</a><a href="#plans">Piani e pagamenti</a><a href="#security">Uso corretto</a><a href="#availability">Disponibilità</a></aside><article>
    <section id="scope"><FileText /><h2>Ambito</h2><p>Il sito presenta NexusNXS per PC e NexusNXS per Android, la relativa documentazione e lo stato delle release. Le condizioni specifiche e la licenza incluse in ciascuna distribuzione prevalgono per l’uso del software.</p></section>
    <section id="preview"><Wrench /><h2>Versioni preliminari</h2><p>Le versioni indicate come sviluppo, preview o validazione possono cambiare, contenere limitazioni e non essere adatte a dati critici. Un numero di versione mostrato sul sito non equivale automaticamente a disponibilità pubblica.</p></section>
    <section id="plans"><CircleDollarSign /><h2>Piani e pagamenti</h2><p>I prezzi mostrati durante la preparazione della Founder Beta sono indicativi finché non è disponibile un checkout esplicito. Prima di qualsiasi pagamento verranno mostrati prezzo finale, durata, limiti inclusi, rinnovo, modalità di disdetta e condizioni applicabili. NexusNXS non vende piani di utilizzo illimitato.</p></section>
    <section id="security"><ShieldAlert /><h2>Uso corretto</h2><p>Non è consentito utilizzare i servizi pubblici per compromettere sistemi, eludere controlli di accesso, distribuire malware o trattare dati di terzi senza autorizzazione. La ricerca di sicurezza deve rispettare la procedura di divulgazione responsabile.</p></section>
    <section id="availability"><Scale /><h2>Disponibilità e modifiche</h2><p>Funzioni, requisiti e canali di distribuzione possono essere aggiornati per sicurezza o evoluzione del prodotto. Le interruzioni rilevanti dei servizi pubblici verranno documentate nella pagina di stato quando il monitoraggio storico sarà operativo.</p><p>Per informazioni: <a href="mailto:hello@nexusnxs.com">hello@nexusnxs.com</a>.</p></section>
  </article></section><SiteFooter />
</main>; }
