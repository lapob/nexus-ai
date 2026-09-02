# Security Policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use the repository's
private GitHub Security Advisory reporting flow and include:

- the affected version or commit;
- the smallest reproducible proof;
- the expected security boundary;
- the observed impact;
- any temporary mitigation already tested.

Do not include real device tokens, private URLs, personal conversation data,
signing material, model prompts containing private knowledge, or credentials.

## Supported code

Only the latest default branch and the most recent published release receive
security fixes during active development.

## Deployment boundary

- Ollama must remain on loopback.
- NexusNXS per PC must remain on the owner's private Tailscale network.
- Public guest AI must be exposed only through a hardened reverse proxy with
  TLS 1.2 or newer, HSTS, request limits, abuse controls, and origin validation.
- The public site and API must reject TLS 1.0 and 1.1; verify this after every
  DNS, certificate, proxy, or tunnel change.
- Public guest mode must never receive private memory, private knowledge, file
  access, workstation tools, or personal conversation history.
- Pairing state, databases, logs, private knowledge, APKs, signing keys, models,
  and runtime binaries must not be committed.
