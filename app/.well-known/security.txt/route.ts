export function GET() {
  const body = [
    "Contact: mailto:security@nexusnxs.com",
    "Expires: 2027-08-20T23:59:59.000Z",
    "Preferred-Languages: it, en",
    "Canonical: https://nexusnxs.com/.well-known/security.txt",
    "Policy: https://nexusnxs.com/security",
  ].join("\n");
  return new Response(`${body}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
