import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./navigation.css";
import { CspNonceProvider } from "./components/CspNonceContext";
import { ConnectivityPresence } from "./components/ConnectivityPresence";
import { NexusPresenceRuntime } from "./components/NexusPresenceRuntime";
import { HardNavigationLink } from "./components/HardNavigationLink";
import { SiteHeader } from "./components/SiteChrome";
import { PRIMARY_NAV_ITEMS } from "./lib/site-navigation";

export const viewport: Viewport = { themeColor: "#020405", colorScheme: "dark" };

export function generateMetadata(): Metadata {
  const origin = "https://nexusnxs.com";
  const title = "NexusNXS — AI privata, protetta e connessa";
  const description = "AI per PC e Android, con NexusNXS Core, accessi revocabili e continuità protetta tra dispositivi.";
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
    openGraph: { title, description, type: "website", url: origin, siteName: "NexusNXS", locale: "it_IT", images: [{ url: `${origin}/og.png`, width: 1672, height: 941, alt: "NexusNXS — AI privata, protetta e connessa" }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nexusnxs-csp-nonce") ?? undefined;

  return (
    <html lang="it">
      <head>
        {/* This stylesheet is also consumed by the static offline shell. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/nexus-operational.css" />
        <noscript>
          {/* eslint-disable-next-line @next/next/no-css-tags */}
          <link rel="stylesheet" href="/noscript.css" />
        </noscript>
        <script nonce={nonce} src="/register-sw.js" defer />
      </head>
      <body>
        <CspNonceProvider nonce={nonce}>
          <a className="skip-link" href="#site-content">Vai al contenuto</a>
          <SiteHeader />
          <noscript>
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
        </CspNonceProvider>
      </body>
    </html>
  );
}
