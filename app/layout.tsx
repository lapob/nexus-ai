import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Nexus — Software per menti libere";
  const description = "App Android e desktop potenti, eleganti e progettate intorno alla tua privacy.";
  return {
    title,
    description,
    icons: { icon: "/nexus-icon.png", shortcut: "/nexus-icon.png", apple: "/nexus-icon.png" },
    openGraph: { title, description, type: "website", images: [{ url: `${origin}/og.png`, width: 1733, height: 908, alt: "Nexus — Software per menti libere" }] },
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
      <body
        className={`${inter.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
