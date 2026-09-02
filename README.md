# NexusNXS

NexusNXS is a privacy-first AI assistant for Windows with native Android
clients, voice interaction, private computer control, and an isolated public
guest mode. Public clients use NexusNXS Core through HTTPS; local model tooling
is reserved for the maintainer/server profile. The architecture is built around
explicit consent, portable storage, and strict separation between public AI
access and private workstation operations.

> **Project status:** release candidate. The public guest API is not intended
> to be exposed directly to the Internet. Put an authenticated, rate-limited
> audited public edge in front of it before deployment. The current development
> profile uses a separate Tailscale Funnel listener and never publishes the
> administrative gateway.

## Product surfaces

- **NexusNXS per PC** — the full Windows assistant, voice experience, local
  knowledge, projects, conversation history, and approved computer actions.
- **NexusNXS per Android** — a mobile chat and voice client that uses the model
  runtime hosted by the workstation. Guest conversations are isolated from the
  owner's memory, private knowledge, files, and tools.
- **NexusNXS PC Control** — a private Tailscale-only Android companion for health,
  security telemetry, restart, and shutdown. Sensitive actions always require
  explicit confirmation.
- **NexusNXS Server** — a windowless Windows process that starts only the local
  model runtime, encrypted stores, security audit, and remote gateway. It does
  not launch the desktop interface, microphone, visualizer, or voice warm-up.

## Security boundary

The public and private paths are intentionally different:

| Surface | Network | Data and capabilities |
| --- | --- | --- |
| Public guest AI | Tailscale Funnel on an isolated listener | Ephemeral guest context and public knowledge only |
| Personal AI sync | Paired device session | Owner conversations and synchronized preferences |
| NexusNXS per PC | Tailscale private network | Telemetry and explicitly approved workstation actions |
| Model runtime | Loopback only | Never exposed directly to LAN or Internet |

Do not publish `.env` files, pairing state, device tokens, private knowledge,
models, runtime binaries, logs, databases, APKs, installers, or signing keys.
The repository ignore rules enforce these boundaries for normal Git workflows.

Web-grounded answers are orchestrated on the NexusNXS server. Search runs only
for explicit research or time-sensitive questions, uses bounded HTTPS
providers, and returns public citations without exposing client or workstation
secrets. Provider reasoning tokens remain private; clients render concise
operational phases and the streamed final answer.

## Requirements

- Windows 11 x64
- Node.js 22 or newer
- PowerShell 7 recommended
- A compatible local Ollama model library
- Android Studio only when building the Android clients

Large models and bundled runtimes are deliberately not stored in Git. NexusNXS
discovers or provisions them on the workstation independently from source code.

The public desktop and Android clients do not require a local model. They send
requests to the configured NexusNXS HTTPS service; the development and server
profiles retain the local model tooling used by the maintainer.

Android endpoints are deliberately absent from source. Copy
`config/android-endpoints.example.properties` to the ignored
`config/android-endpoints.local.properties`, or supply the equivalent
environment variables only in the local build environment. Never commit real
tailnet hostnames, LAN addresses, pairing links, or signing credentials.

## Development

The public desktop build is a thin HTTPS client. It never bundles or downloads
Ollama models; local provisioning remains a maintainer/server capability.

```powershell
npm run dev
npm run ai:provision
npm run ai:pull -- qwen3:14b
```

Create the public Windows installer by providing the production service origin:

```powershell
$env:NEXUS_SERVICE_URL='https://ai.example.com'
npm run build:win
```

```powershell
npm ci
npm run dev
```

Useful commands:

```powershell
npm start                 # Start the desktop application
npm run server            # Start the headless AI server in the background
npm run server:foreground # Diagnostic foreground mode
npm run server:dashboard  # Open a minimized live technical monitor
npm run server:install    # Start the headless server automatically at sign-in
npm run server:start      # Start it manually without a visible window
npm run server:stop       # Stop the background server
npm run server:restart    # Restart it and wait for the health check
npm run server:status     # Inspect the scheduled server task
npm run server:remove     # Remove automatic startup
npm run check             # Static, source, knowledge, and renderer checks
npm run check:publication # Reject secrets and maintainer-specific infrastructure
npm test                  # Automated test suite
npm run verify:experience # AI, voice, Electron, and soak verification
npm run release:check     # Verify that the source tree is safe for GitHub
```

The headless server stores mutable data next to the project on the external
drive at `../.nexus-data`. Windows Task Scheduler stores only its small startup
registration in the operating system; code, models, logs, and databases remain
on the external SSD.

## Headless server operation

The scheduled task starts after the owner signs in and restarts after failures.
It runs only `scripts/start-electron.js --server`, which suppresses every
desktop UI surface and starts the model runtime and protected gateways. The
desktop assistant and Presence remain off until the user runs `npm start`,
`npm run nexus:start`, or requests an approved launch from NexusNXS Control.

If automatic startup is unavailable, open PowerShell in this directory and run:

```powershell
npm run server
```

To stop the current development server, close that PowerShell session. For an
installed background build, stop **NexusNXS Server** from Task Scheduler or use
the operational scripts described in [`docs/SERVER_OPERATIONS.md`](docs/SERVER_OPERATIONS.md).

## Repository layout

- `src/` — desktop, AI runtime, voice, remote gateway, storage, and security
- `android/` — two independent native Android clients
- `knowledge-public/` — distributable public knowledge seed
- `knowledge-packs/` — curated public knowledge manifests
- `scripts/` — build, verification, provisioning, and operations
- `tests/` — security, runtime, remote, storage, UI contract, and voice tests
- `docs/` — architecture and operating documentation

## Validation and releases

Every product change must keep AI, voice, desktop, and remote behavior green.
The authoritative local gate is:

```powershell
npm run verify:experience
```

Use `npm run verify` for the complete baseline and `npm run verify:full` for
extended model evaluation, visual QA, knowledge benchmarks, tooling audit, and
SBOM generation.

## Contributing and security

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a change. Security
issues must follow [`SECURITY.md`](SECURITY.md) and must never be disclosed in a
public issue.

No open-source license has been granted yet. Public visibility does not grant
permission to copy, redistribute, or commercially use the code. See
[`LICENSE`](LICENSE) and the [`public release runbook`](docs/PUBLIC_RELEASE.md).
