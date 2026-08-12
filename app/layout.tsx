import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nexus — La tua AI personale",
  description: "Nexus è l'intelligenza personale che comprende il tuo mondo. Disponibile per Android e Windows.",
  openGraph: { title: "Nexus — La tua AI personale", description: "Non è un assistente. È il tuo Nexus.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "Nexus — La tua AI personale", description: "Non è un assistente. È il tuo Nexus.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
