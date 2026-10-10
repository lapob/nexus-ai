type SocialImage = string | { url: string; width?: number; height?: number; alt?: string };
export type Metadata = {
  title?: string;
  description?: string;
  alternates?: { canonical: string };
  robots?: { index: boolean; follow: boolean };
  openGraph?: { title?: string; description?: string; type?: string; url?: string; siteName?: string; locale?: string; images?: SocialImage[] };
  twitter?: { title?: string; description?: string; card?: string; images?: string[] };
};

export type SiteAssets = { script: string; styles: string[] };
export type StatusSnapshot = { online: boolean; latencyMs: number | null; checkedAt: string; checkedAtLabel: string };
export type SiteDocumentData = { pathname: string; nonce?: string; assets: SiteAssets; status?: StatusSnapshot; failed?: boolean; globalFailed?: boolean };
