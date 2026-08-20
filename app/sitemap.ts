import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://nexusnxs.com";
  const pages = ["", "/desktop", "/android", "/downloads", "/security", "/status", "/privacy", "/terms"];
  return pages.map((path, index) => ({ url: `${base}${path}`, lastModified: new Date("2026-08-20"), changeFrequency: index === 0 ? "weekly" : path === "/status" ? "daily" : "monthly", priority: index === 0 ? 1 : path === "/downloads" ? 0.9 : 0.7 }));
}
