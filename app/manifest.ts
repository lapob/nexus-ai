import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "NexusNXS", short_name: "NexusNXS", description: "Software privato e connesso per PC e Android.", start_url: "/", display: "standalone", background_color: "#07070b", theme_color: "#7561e8", lang: "it", categories: ["productivity", "utilities"], icons: [{ src: "/nexus-icon.png", sizes: "1024x1024", type: "image/png", purpose: "any maskable" }] };
}
