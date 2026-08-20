import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "NexusNXS — Software per menti libere";
  const description = "App Android e desktop potenti, eleganti e progettate intorno alla tua privacy.";
  return {
    metadataBase: new URL("https://nexusnxs.com"),
    title,
    description,
    applicationName: "NexusNXS",
    creator: "NexusNXS",
    publisher: "NexusNXS",
    category: "technology",
    alternates: { canonical: origin },
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [{ url: "/nexus-icon.png?v=nexusnxs-2", type: "image/png", sizes: "1024x1024" }],
      shortcut: "/nexus-icon.png?v=nexusnxs-2",
      apple: [{ url: "/nexus-icon.png?v=nexusnxs-2", sizes: "1024x1024", type: "image/png" }],
    },
    openGraph: { title, description, type: "website", url: origin, siteName: "NexusNXS", locale: "it_IT", images: [{ url: `${origin}/og.png`, width: 1732, height: 908, alt: "NexusNXS — Software per menti libere" }] },
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
      <body>
        <a className="skip-link" href="#main-content">Vai al contenuto</a>
        {children}
      </body>
    </html>
  );
}
