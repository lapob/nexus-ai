import Image from "next/image";
import { ArrowUpRight, BrainCircuit, MessageCircle, Mic2, Zap } from "lucide-react";
import { ProductMockup, SiteFooter } from "./components/SiteChrome";
import { StructuredData } from "./components/StructuredData";
import { HardNavigationLink } from "./components/HardNavigationLink";
import { AstralHero } from "./components/AstralHero";

const apps = [
  { name: "Sul tuo computer.", platform: "NexusNXS per Windows", description: "Scrivi, analizza documenti e prepara codice. Con gli strumenti autorizzati, Nexus può aprire applicazioni e lavorare sui tuoi file. La Presence resta a portata di voce anche quando chiudi la finestra.", device: "desktop", image: "/products/desktop-core.png", alt: "Core particellare reale di NexusNXS per PC", href: "/desktop" },
  { name: "Dove nasce un’idea.", platform: "NexusNXS per Android", description: "Tocca il Core e parla, oppure scrivi e allega una foto o un documento. Imposta Nexus come assistente di sistema sui dispositivi compatibili e richiama la voce senza aprire l’intera app.", device: "android", image: "/products/android-home.png", alt: "Interfaccia reale di NexusNXS per Android", href: "/android" },
];
const presenceStates = [
  { Icon: Mic2, label: "Ascolta", detail: "La tua voce diventa una richiesta.", state: "listening" },
  { Icon: BrainCircuit, label: "Elabora", detail: "Distingue la risposta dall’uso degli strumenti.", state: "thinking" },
  { Icon: MessageCircle, label: "Risponde", detail: "Testo ordinato, codice e fonti consultabili.", state: "responding" },
  { Icon: Zap, label: "Agisce", detail: "Solo con i permessi che hai concesso.", state: "executing" },
];

export default function Home() {
  return <main id="main-content" className="home-continuum narrative-page">
    <StructuredData data={[{"@context":"https://schema.org","@type":"WebSite",name:"NexusNXS",url:"https://nexusnxs.com",inLanguage:"it-IT"},{"@context":"https://schema.org","@type":"Organization",name:"NexusNXS",url:"https://nexusnxs.com",logo:"https://nexusnxs.com/nexus-icon.png",email:"hello@nexusnxs.com"}]} />
    <AstralHero />
    <section className="narrative-copy reveal" id="vision" data-cosmic-scene="right" data-cosmic-form="neural">
      <p className="section-label">DALL’IDEA AL RISULTATO</p>
      <h2>Meno passaggi.<br /><em>Più possibilità.</em></h2>
      <p>Una domanda veloce, un testo da migliorare, un problema da risolvere. Parla con Nexus o scrivi: ricevi una risposta leggibile mentre prende forma.</p>
    </section>
    <section className="astral-interlude" aria-label="Un cursore si compone nello spazio" data-cosmic-scene="center" data-cosmic-form="cursor">
      <div className="cosmic-stage" aria-hidden="true" /><p>La stessa intelligenza. Il tuo modo di usarla.</p>
    </section>
    <section className="apps-section narrative-apps" id="apps" data-cosmic-scene="left">
      <div className="app-grid">{apps.map((app) => <article className="app-card reveal" key={app.device} data-cosmic-scene={app.device === "desktop" ? "right" : "left"} data-cosmic-form={app.device === "desktop" ? "saturn" : "neural"}>
        <div className="narrative-app-copy"><p className="platform">{app.platform}</p><h2>{app.name}</h2><p>{app.description}</p><HardNavigationLink className="text-link" href={app.href}>Esplora {app.device === "desktop" ? "NexusNXS per PC" : "NexusNXS per Android"} <ArrowUpRight size={16} /></HardNavigationLink></div>
        <div className={`app-card-visual ${app.device}`} aria-hidden={app.device === "desktop" ? true : undefined}>{app.device === "android" && <div className="app-card-visual__screen"><Image src={app.image} alt={app.alt} width={360} height={640} sizes="220px" unoptimized /></div>}</div>
      </article>)}</div>
    </section>
    <section className="presence-system reveal" aria-labelledby="presence-title" data-cosmic-scene="right">
      <div className="presence-copy"><p className="section-label">UN DIALOGO CONTINUO</p><h2 id="presence-title">Vedi cosa sta facendo.</h2><p>Il Core segue ascolto, elaborazione e risposta. Quando consulta il web, trovi le fonti; quando agisce, mantieni il controllo. Puoi fermarlo in qualsiasi momento.</p></div>
      <div className="presence-grid">{presenceStates.map(({Icon,label,detail,state}) => <article key={state} data-state={state}><span><Icon strokeWidth={1.4}/></span><div><strong>{label}</strong><small>{detail}</small></div><i aria-hidden="true"/></article>)}</div>
    </section>
    <section className="astral-interlude narrative-forms" aria-label="Saturno particellare" data-cosmic-scene="center" data-cosmic-form="saturn"><div className="cosmic-stage" aria-hidden="true" /></section>
    <section className="one-nexus reveal" data-cosmic-scene="left">
      <div className="one-nexus-copy"><p className="section-label">PC · ANDROID · WEB</p><h2>Un solo prodotto.<br /><em>Più modi di esserci.</em></h2><p>Le app condividono il servizio NexusNXS. Collega il telefono al tuo desktop con una sessione remota autorizzata, oppure apri il web per iniziare senza installazioni.</p><HardNavigationLink className="text-link" href="https://ai.nexusnxs.com">Provalo nel browser <ArrowUpRight size={16}/></HardNavigationLink></div>
      <div className="nexus-stage"><ProductMockup type="desktop"/><ProductMockup type="android"/></div>
    </section>
    <section className="narrative-copy narrative-copy--right reveal" id="security" data-cosmic-scene="left">
      <p className="section-label">IL CONTROLLO RESTA TUO</p><h2>Capace di aiutarti.<br /><em>Non di decidere per te.</em></h2>
      <p>Autorizzazioni esplicite, sessioni revocabili e collegamenti cifrati. I controlli amministrativi privati restano separati dal servizio pubblico.</p>
      <p>NexusNXS è in Preview e può commettere errori. Verifica i risultati importanti; l’accesso richiede che i servizi siano disponibili.</p>
      <HardNavigationLink className="text-link" href="/security">Come proteggiamo il servizio <ArrowUpRight size={16}/></HardNavigationLink>
    </section>
    <SiteFooter continuous />
  </main>;
}
