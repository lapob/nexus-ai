import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "NexusNXS", short_name: "NexusNXS", description: "AI privata, protetta e connessa per PC e Android.", start_url: "/", display: "standalone", background_color: "#020405", theme_color: "#52EEF0", lang: "it", categories: ["productivity", "utilities"], icons: [{ src: "/nexus-icon.png", sizes: "1024x1024", type: "image/png", purpose: "any" }, { src: "/nexus-icon.png", sizes: "1024x1024", type: "image/png", purpose: "maskable" }] };
}
