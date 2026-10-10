
export default function robots() {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/"] }, sitemap: "https://nexusnxs.com/sitemap.xml", host: "https://nexusnxs.com" };
}
