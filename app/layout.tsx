import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./navigation.css";
import { ConnectivityPresence } from "./components/ConnectivityPresence";
import { NexusPresenceRuntime } from "./components/NexusPresenceRuntime";
import { HardNavigationLink } from "./components/HardNavigationLink";
import { SiteHeader } from "./components/SiteChrome";
import { PRIMARY_NAV_ITEMS } from "./lib/site-navigation";

export const viewport: Viewport = { themeColor: "#020405", colorScheme: "dark" };

export function generateMetadata(): Metadata {
  const origin = "https://nexusnxs.com";
  const title = "NexusNXS — AI locale, privata e connessa";
  const description = "AI locale per PC e Android, con una sola istanza privata, accessi revocabili e continuità cifrata.";
  return {
    metadataBase: new URL("https://nexusnxs.com"),
    title,
    description,
    applicationName: "NexusNXS",
    creator: "NexusNXS",
    publisher: "NexusNXS",
    category: "technology",
    alternates: { canonical: `${origin}/` },
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [{ url: "/nexus-icon.png?v=nexusnxs-2", type: "image/png", sizes: "1024x1024" }],
      shortcut: "/nexus-icon.png?v=nexusnxs-2",
      apple: [{ url: "/nexus-icon.png?v=nexusnxs-2", sizes: "1024x1024", type: "image/png" }],
    },
    openGraph: { title, description, type: "website", url: origin, siteName: "NexusNXS", locale: "it_IT", images: [{ url: `${origin}/og.png`, width: 1672, height: 941, alt: "NexusNXS — AI locale, privata e connessa" }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <head>
        {/* This stylesheet is also consumed by the static offline shell. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/nexus-operational.css" />
        <script src="/register-sw.js" defer />
      </head>
      <body>
        <a className="skip-link" href="#site-content">Vai al contenuto</a>
        <SiteHeader />
        <noscript>
          <style>{`.nxs-header,.nexus-connectivity{display:none!important}.reveal{opacity:1!important;transform:none!important}`}</style>
          <nav className="nxs-noscript" aria-label="Navigazione principale senza JavaScript">
            <HardNavigationLink className="nxs-noscript__brand" href="/">NEXUSNXS</HardNavigationLink>
            <div>
              {PRIMARY_NAV_ITEMS.map(({ href, label }) => <HardNavigationLink key={href} href={href}>{label}</HardNavigationLink>)}
              <HardNavigationLink href="/downloads">Download</HardNavigationLink>
            </div>
          </nav>
        </noscript>
        <div id="site-content" tabIndex={-1}>{children}</div>
        <ConnectivityPresence />
        <NexusPresenceRuntime />
      </body>
    </html>
  );
}
