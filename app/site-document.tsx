import { Component, type ReactNode } from "react";
import RootLayout, { generateMetadata } from "./layout";
import Home from "./page";
import Desktop, { metadata as desktop } from "./desktop/page";
import Android, { metadata as android } from "./android/page";
import Downloads, { metadata as downloads } from "./downloads/page";
import Security, { metadata as security } from "./security/page";
import Status, { metadata as status } from "./status/page";
import Privacy, { metadata as privacy } from "./privacy/page";
import Terms, { metadata as terms } from "./terms/page";
import Maintenance, { metadata as maintenance } from "./maintenance/page";
import NotFound, { metadata as notFound } from "./not-found";
import ErrorPage from "./error";
import GlobalError from "./global-error";
import Loading from "./loading";
import { SiteErrorBoundary } from "./components/SiteErrorBoundary";
import { SiteMotionRuntime } from "./components/SiteMotionRuntime";
import { NexusPresenceRuntime } from "./components/NexusPresenceRuntime";
import type { Metadata, SiteDocumentData } from "./lib/site-metadata";

const pages = {
  "/": { Page: Home, metadata: {} },
  "/desktop": { Page: Desktop, metadata: desktop },
  "/android": { Page: Android, metadata: android },
  "/downloads": { Page: Downloads, metadata: downloads },
  "/security": { Page: Security, metadata: security },
  "/privacy": { Page: Privacy, metadata: privacy },
  "/terms": { Page: Terms, metadata: terms },
  "/maintenance": { Page: Maintenance, metadata: maintenance },
};
export function isPagePath(pathname: string) { return pathname === "/status" || Object.hasOwn(pages, pathname); }

class DocumentBoundary extends Component<{ data: SiteDocumentData; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <SiteDocument data={{ ...this.props.data, globalFailed: true }} /> : this.props.children;
  }
}

export function SiteDocument({ data }: { data: SiteDocumentData }) {
  const route = Object.hasOwn(pages, data.pathname) ? pages[data.pathname as keyof typeof pages] : null;
  const base = generateMetadata();
  const page: Metadata = data.failed ? { title: "NexusNXS — Richiede attenzione", robots: { index: false, follow: false } }
    : data.pathname === "/status" ? status : route?.metadata ?? { ...notFound, robots: { index: false, follow: true } };
  const title = page.title ?? base.title;
  const description = page.description ?? base.description;
  const canonical = new URL(page.alternates?.canonical ?? base.alternates.canonical, base.metadataBase).href;
  const og = { ...base.openGraph, ...page.openGraph };
  const twitter = { ...base.twitter, ...page.twitter };
  const Page = route?.Page ?? NotFound;
  const head = <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#020405" /><meta name="color-scheme" content="dark" />
    <title>{title}</title><meta name="description" content={description} />
    <meta name="application-name" content={base.applicationName} /><meta name="author" content={base.creator} />
    <meta name="publisher" content={base.publisher} /><meta name="category" content={base.category} />
    {page.robots?.index === false && <meta name="robots" content={page.robots.follow ? "noindex" : "noindex, nofollow"} />}
    <link rel="canonical" href={canonical} /><link rel="manifest" href={base.manifest} />
    <link rel="icon" href={base.icons.icon[0].url} type="image/png" sizes="1024x1024" />
    <link rel="shortcut icon" href={base.icons.shortcut} /><link rel="apple-touch-icon" href={base.icons.apple[0].url} />
    <meta property="og:title" content={og.title} /><meta property="og:description" content={og.description} />
    <meta property="og:type" content={og.type} /><meta property="og:url" content={canonical} />
    <meta property="og:site_name" content={og.siteName} /><meta property="og:locale" content={og.locale} />
    {og.images.map((item) => typeof item === "string" ? <meta key={item} property="og:image" content={item} /> : <meta key={item.url} property="og:image" content={item.url} />)}
    <meta name="twitter:card" content={twitter.card} /><meta name="twitter:title" content={twitter.title} /><meta name="twitter:description" content={twitter.description} />
    {twitter.images.map((src) => <meta key={src} name="twitter:image" content={src} />)}
    {data.assets.styles.map((href) => <link key={href} rel="stylesheet" href={href} />)}
  </>;
  const tail = <>
    <script id="nexus-site-state" nonce={data.nonce} type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
    <script nonce={data.nonce} type="module" src={data.assets.script} />
  </>;
  if (data.globalFailed) return <GlobalError error={new Error("NexusNXS interface unavailable")} reset={() => window.location.reload()} head={<>
    <meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    {data.assets.styles.map((href) => <link key={href} rel="stylesheet" href={href} />)}
  </>} tail={tail} />;
  return <DocumentBoundary data={data}><RootLayout pathname={data.pathname} nonce={data.nonce} head={head} tail={tail}>
    <SiteErrorBoundary>
      {data.failed ? <ErrorPage error={new Error("NexusNXS page unavailable")} reset={() => window.location.reload()} />
        : data.pathname === "/status" ? data.status ? <Status status={data.status} /> : <Loading /> : <Page />}
      <SiteMotionRuntime /><NexusPresenceRuntime />
    </SiteErrorBoundary>
  </RootLayout></DocumentBoundary>;
}
