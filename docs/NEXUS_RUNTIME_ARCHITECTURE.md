# NexusNXS runtime architecture

NexusNXS uses one interaction language across desktop, Android and the public
Web app. `config/nexus-interaction-states.json` is authoritative; generated
TypeScript and Java contracts are checked before the main quality gate.

## Runtime boundaries

- The Core is the primary interaction surface. Keyboard, attachments and
  artifacts are secondary surfaces and do not create a second product mode.
- Public clients negotiate `/api/capabilities`; missing providers fail closed.
  The manifest never includes model names, local paths, IP addresses or private
  device actions.
- Private devices retain the existing signed challenge, scoped pairing,
  one-use tickets, explicit consent and metadata-only receipts.
- The Tool Bus is an internal allowlist. It cannot execute unregistered tools,
  hides private tools from public audiences, propagates cancellation and
  requires consent for mutating operations.
- Artifact frames are typed and size-limited. Public streams reject local file
  changes and unsafe URLs.
- The device graph contains opaque identifiers and aggregate capabilities only;
  addresses, tokens and key material never enter the graph.
- Observability is sampled and content-free. Prompts, responses, paths,
  identities and network addresses are not accepted telemetry attributes.

## Voice

Desktop uses streaming speech activity detection and supports interruption.
The Web app stops a turn after a natural pause and allows the Core to interrupt
playback. Android uses the platform speech endpoint with explicit silence
limits. Capability negotiation switches to the keyboard when server voice is
unavailable. True cross-platform full-duplex WebRTC remains disabled until a
TURN-backed transport and its abuse/security gates are deployed.

## Rendering and performance

Desktop particle simulation already runs in a Worker for high particle counts.
The public Core uses a bounded Canvas2D continuum whose particle count, target
FPS and pointer response adapt to reduced-motion, device memory, CPU threads,
viewport and data-saver signals. Moving it to OffscreenCanvas is permitted only
when the visual and frame-time gates prove an improvement; unsupported browsers
retain the same renderer and interaction contract.

## Quality and release

`npm run ai:eval:continuous` runs the versioned AI suite validation, knowledge
quality audit and voice evaluation, producing a metadata-only report. A release
still requires the full experience, visual, Android device, security, signing
and live endpoint gates. Generated or passing local output is not a production
signature.
