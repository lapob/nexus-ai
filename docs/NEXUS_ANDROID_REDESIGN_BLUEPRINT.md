# NexusNXS Instant Android blueprint

## Product role

The Android public client is the smallest possible doorway to NexusNXS. The
workstation/server owns inference; Android owns capture, streaming presentation,
local encrypted continuity and speech playback. No model is downloaded or run
on the phone.

## Interaction contract

1. Launch directly into the Core with no tutorial, header, navigation or menu.
2. Tap the Core to open microphone capture immediately.
3. Submit the recognized phrase as one turn and close capture automatically.
4. Stream a short activity label followed by the answer.
5. Read voice-originated answers aloud; typed turns remain silent by default.
6. The keyboard button reveals one rounded composer. Sending closes the IME and
   returns focus to the Core and response.
7. Android Back closes voice capture or the composer before leaving the app.
8. Offline state is explicit; the app never invents a local answer.

## Visual system

- edge-to-edge near-black canvas;
- one cyan reactive Core centered in the initial state;
- motion tied to listening, reasoning and streaming states;
- no ornamental particle load on low-end devices;
- system reduced-motion and measured frame health always win;
- one online/offline mark, one response surface and two input controls maximum.

## Invisible foundations retained

- HTTPS-only public ingress at the configured NexusNXS origin;
- encrypted local conversation store and secure token storage;
- resumable streaming, idempotent request identifiers and bounded offline queue;
- locale inherited from the device;
- lifecycle cancellation, private notifications and local crash diagnostics;
- no workstation paths, model identities or private knowledge in the client.

## Release gates

- Kotlin compile, lint, R8 and resource shrinking;
- contract tests proving `NexusInstantApp` is the launcher surface;
- public endpoint health and representative voice/text prompts;
- cold-start and frame-health measurement on compact and low-refresh devices;
- production APK/AAB signing before public distribution.
