# NexusNXS Server Operations

## Purpose

The server profile keeps NexusNXS reachable without opening the desktop interface.
It starts the local model runtime and the protected remote gateway, while voice,
visualizers, renderer, and desktop warm-up remain disabled.

## Storage

Source code lives in `.AI`. Mutable server state lives in the sibling
`.nexus-data` directory on the same external SSD. Model libraries remain in the
configured portable Ollama location. The operating system contains only the
scheduled-task registration required to start the server.

## Commands

```powershell
npm run nexus:start
npm run nexus:stop
npm run nexus:restart
npm run nexus:status
npm run nexus:repair

npm run server
npm run server:install
npm run server:start
npm run server:stop
npm run server:restart
npm run server:status
npm run server:remove
npm run server:dashboard
npm run server:check:production
npm run load:gateway
npm run funnel
npm run funnel:status
npm run funnel:disable
```

The `nexus:*` commands are the preferred operator interface. They coordinate
the visible desktop, hidden server, private AI runtime and Tailscale service.
`nexus:repair` is intentionally conservative: it restarts configured services
that fail local health checks, but never changes accounts, models, Funnel,
personal data or user preferences. The lower-level `server:*` commands remain
available for diagnosis and automation.

The single automatic task starts at user sign-in, retries transient failures,
rejects duplicate instances, and has no execution time limit. It starts only
the headless Core, model runtime and protected gateways. The desktop interface
and system Presence are never started by this workstation task; open them with
`npm start`, `npm run nexus:start`, or an approved action from NexusNXS Control.
If the SSD is absent at sign-in, reconnect it and run the task manually from
Windows Task Scheduler.
The manager allows up to 120 seconds for a cold start because Windows may scan
the portable AI runtime after an update; readiness, rather than process age, is
the success condition.
`npm run server` starts only the hidden background task. The optional dashboard
opens visibly in PowerShell 7 and shows health latency, active gateway clients,
remote IP addresses, Tailscale devices, peer ping, processes, storage, and recent
events. Closing the dashboard does not stop the server.

## Network topology

1. Ollama listens on loopback and is never published.
2. The owner gateway listens on loopback for remote access, requires its
   protected device flow, and is never forwarded by the router. Direct private
   LAN listening is enabled only by the explicit home-only setup path.
3. Tailscale carries the owner's private NexusNXS per PC traffic.
4. Tailscale Serve publishes the loopback owner gateway on HTTPS 443.
5. Tailscale Funnel publishes a separate guest-only listener on HTTPS 8443.

The stable public client origin is `https://ai.nexusnxs.com`. Cloudflare
routes that hostname to the guest-only listener; the `*.ts.net:8443` Funnel
address remains a bounded fallback. Administrative and Console traffic never
uses the public domain and remains available only through Tailscale Serve.

`npm run funnel` enables the public route only after the guest listener on
`127.0.0.1:32147` is healthy. The private gateway remains on
`127.0.0.1:32145`; Funnel cannot route to it. The public listener rejects
Console, system telemetry, actions, security administration and privileged
pairing before authentication is evaluated.

Never forward either local port on the router. The free `*.ts.net` hostname is
stable for this workstation, but Funnel has provider bandwidth limits and no
production SLA. Reassess the public edge before commercial distribution.

Before inviting public testers, `npm run server:check:production` must pass.
This gate rejects a vendored Ollama runtime with known High or Critical module
findings, then verifies publication boundaries, dependencies, the SBOM,
security regressions and bounded gateway load. The loopback exception used by
local development is not sufficient evidence for a public service.

## Resource policy

- The selected fast model warms after server readiness without delaying the
  gateway. Larger models remain request-driven when the hardware profile only
  permits one resident model, preventing paging and visual stalls.
- The fast model handles ordinary prompts; deep routing is request-driven.
- Request concurrency is bounded at the gateway.
- Short peaks enter a bounded in-memory queue; saturation and excessive waiting
  fail explicitly instead of overloading the model runtime.
- Model state uses a finite keep-alive and is released after inactivity.
- Logs are structured and stored on the SSD for diagnosis.

The private Console scope can read `/api/system/service` for aggregate uptime,
queue occupancy, connected streams, anonymous-session count, and latency
percentiles. It never exposes conversation text or private knowledge.
It can also open or close the NexusNXS and ChatGPT desktop applications through
an explicit allowlist. Server shutdown is a separate critical operation: it
requires the enrolled device proof, an expiring approval ticket and local
biometric confirmation. There is intentionally no remote start button after
shutdown, because the stopped listener cannot authenticate a new request.
Start it again with `npm run server:start`, the `NexusNXS Server` scheduled task,
or the next Windows sign-in.

Public clients may be built with up to three HTTPS fallback origins through
`NEXUS_SERVICE_FALLBACK_URLS`. Failover is used for health, model discovery,
and session bootstrap. An in-flight chat is deliberately not replayed on a
second origin, preventing duplicate generations and duplicate billing/work.

## Recovery

If mobile clients report offline:

1. Confirm the external SSD is mounted.
2. Run `npm run nexus:status`.
3. Run `npm run nexus:repair`; it repairs only headless services and never opens
   the desktop assistant. Use `server:*` only for deeper diagnosis.
4. Confirm Tailscale is connected for NexusNXS per PC.
5. Run `npm run funnel:status` and confirm both the public listener and Funnel.

Do not make Ollama or the gateway listen on a public interface to bypass a
failed tunnel.

## Verification drills

`npm run load:gateway` creates an isolated loopback gateway, opens twenty
anonymous sessions concurrently, verifies the configured execution ceiling,
the bounded queue and explicit HTTP 429 back-pressure, then writes the result to
`qa-artifacts/gateway-load-test.json`. It does not contact the production
service or retain prompts.

`npm run backup:drill` creates only synthetic temporary records, produces a
crash-consistent SQLite snapshot, protects it, restores it into a separate
temporary directory, verifies both databases, and performs an encrypted archive
round trip. Its privacy-safe receipt is written to
`qa-artifacts/backup-recovery-drill.json`; no real conversation or workstation
path is included.

The resident availability sampler also records only genuine `online` to
`degraded` and `degraded` to `online` transitions in the private security
journal. It never stores endpoint URLs, prompts, responses, IP addresses, or
request bodies, so the operational console can surface incidents without
turning telemetry into another source of sensitive data.

`npm run qa:android:device:strict` requires a physically connected Android
device. It installs both Preview APKs, exercises five display/font profiles,
captures the UI hierarchy, reads `dumpsys gfxinfo`, and fails when a profile has
fewer than 20 rendered frames or more than 18% janky frames. A dedicated manual
self-hosted workflow preserves these artifacts without pretending that an
emulator proves real-device behavior.

## Controls outside software

The application can verify its own restore path, but it cannot create physical
redundancy. Before Stable, keep one encrypted backup on media physically
separate from the portable SSD, test an appropriately sized UPS for workstation
and router, and prove a second Internet path. Record dates and outcomes outside
the repository. `npm run release:stable:gate` accepts those confirmations only
as explicit release-environment inputs and still requires the automated checks.
