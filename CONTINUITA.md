# Public continuity checkpoint

Updated 3 October 2026. This file is safe for source collaboration. Private data, credentials, workstation configuration and logs remain outside GitHub.

## Verified delivery

Windows 0.3.25 Founder Preview is published as v0.3.25-preview.1 and installed on the maintainer workstation. Source revision: 00c083e. Eight release assets were verified against GitHub hashes and sizes. Installed ASAR matches the package; installer, native smoke and configured desktop shortcut checks pass. Previous releases remain available for rollback. Android public 6.5.22/code112 is published with verified build, lint and Preview Debug signing; its new physical test is explicitly deferred by the owner. Control 1.19.8 is unchanged. This is a technical Preview, not a Stable or commercially approved Beta.

GitHub complete CI passes on clean Windows and Ubuntu with official Node 24: secret scan, source gate, tests, registry signatures, runtime and tooling audits. Latest local Windows suite: 1024 PASS / 2 SKIP / 0 FAIL. The builder downloader now uses native fetch without the vulnerable HTTP cache chain; valid/invalid checksum tests pass and 49 dependencies were removed.

## Changes and evidence

- Control desktop observations refresh asynchronously and share a bounded cache. Late observations cannot overwrite a completed action. Real authenticated bridge probes after restart pass: first request 286 ms including local decryption, next four 1–2 ms. These are IPC measurements, not mobile end-to-end latency. Bridge and full UI remain hidden on service startup.
- Artifact result/original downloads preserve exact content, with separate icon hitboxes and recovered focus at 100% and 200%. Task phases are compact and explicitly expandable, respecting reduced motion.
- Android assistant uses system dimming, optional supported blur, a readable gradient and one Core renderer. Two icons retain attachment/text access in the same conversation.
- Public download URLs and publisher tags follow one version contract. Published releases accept identical retries without mutation and reject replacement assets; compiled changes require a new version.
- Public personalization passes CSP and four viewport checks. Offline preserves draft/attachment state without automatic send; history reset cancels generation and discards late frames. Live HTTPS health/readiness/home and both download URLs pass on 0.3.25. A synthetic public response completed in 4609 ms (first token 4348 ms); local TTS returned valid WAV in 6379 ms after service startup. These are one-input observations, not a general benchmark or human echo test. Always recheck deployed links after each service restart.
- Nine old recoverable Windows outputs were removed only after matching remote hashes/sizes, freeing 554921279 bytes. Both Git histories have verified recovery bundles and archived branch tips; only three integrated obsolete branches were deleted. Unmerged Dependabot proposals remain for review.

Application/server/Android source is on main; the separate website tree is on website in the same repository. Cloud source checks need no models, private knowledge, production credentials or active service. Source collaboration does not enable product cloud inference.

## Remaining prerequisites

Website source build, performance and 37 tests pass, including clean GitHub execution. Production promotion remains blocked by the dependency security gate for GHSA-vfj7-8cjw-p6xm (braces); do not bypass it. Source publication is not deployment.

Real human voice, STT accuracy and echo tests remain deferred; synthetic TTS does not prove natural conversation quality. Cold boot has not been tested by restarting the PC. Full security coverage, production signing, signed update origin and external restore remain open. No approved training data or model promotion is available. Always-on automations need an owner-selected node; iOS requires macOS/Xcode and a device. A paying pilot needs a selected service and actual customer measurements.

## Resume

Read AGENTS.md, this file, docs/STABILIZATION-STATUS.md and docs/ROADMAP.md; on the workstation read the parent operational checkpoint and RIPRESA.md. Inspect Git, process state, release hashes and logs before repeating an interrupted operation. Keep local inference as default and cloud disabled. Do not restart or shut down the PC without current explicit authorization.
