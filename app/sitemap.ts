import type { MetadataRoute } from "next";
import { PUBLIC_PAGE_PATHS } from "./lib/site-navigation";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://nexusnxs.com";
  return PUBLIC_PAGE_PATHS.map((path, index) => ({
    url: `${base}${path === "/" ? "" : path}`,
    changeFrequency: index === 0 ? "weekly" : path === "/status" ? "daily" : "monthly",
    priority: index === 0 ? 1 : path === "/downloads" ? 0.9 : 0.7,
  }));
}
