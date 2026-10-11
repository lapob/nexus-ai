# Preview0.3.31 published and graphics verified — 11 October 2026

Public prerelease v0.3.31-preview.1 has eight verified GitHub assets from source8bc6c388514e9094f9a27eb5f66d837ace4e4d6a; Windows/Ubuntu CI38138653842 passes. Installer/bundle/SBOM and packaged smoke pass. The settings contrast correction is now included in the desktop package; no new geometry, font or animation controller. Android114 is unchanged and Control is private. Previous previews remain available. Windows remains unsigned/manual-install; no installation or headless-server restart was performed.

Graphic evidence and proposals are in UI_SPECIFICATION.md. The workstation measurements and synthetic browsers do not certify every OS or phone. ADB found no devices. One native Node test-host abort remains recorded separately from passing Electron tests. Two interrupted QA profiles remain because automatic approval rejected their cleanup; no alternative deletion was attempted. Runtime audit, voice human tests and commercial gates remain open.

# Graphics review and Preview0.3.31 prepared — 11 October 2026

Settings helper text now reuses the shared mist token; no new font, geometry or motion controller. Web Core QA measures renderer draw deltas and rejects absent/nonfinite/frozen metrics. Motion cleanup retries only its own exclusive temporary profile. Focused9PASS; final cloud:check/check/source-smokePASS and isolated suite1061PASS/2SKIP/0FAIL. Three desktop Core/fullscreen/full-reduced motion, ten desktop captures, forty synthetic web states and26 site/web captures were checked; see UI_SPECIFICATION.md for limits and next refinements. ADB had no devices: no new Android physical test is claimed. Version0.3.31 is prepared for an immutable new Preview; prior Preview30 remains untouched until build/installer/packaged-smoke/bundle and publication complete. No server restart, runtime replacement or automatic installation.

# Preview0.3.30 published — 11 October 2026

Public prerelease v0.3.30-preview.1 contains eight GitHub-verified assets from source c65eac6f9feb3438797a44d93b650d8fc3b0d6b3. Desktop memory provenance/expiry/export, editable artifact copies and the bounded local document recipe are included. Android6.5.24/code114 is reused unchanged; private Control is excluded. Windows installer validation, three consecutive packaged smoke runs, SBOM and bundle checks pass; Windows/Ubuntu CI passes. Preview29 remains available for rollback. The smoke shutdown correction uses the normal cleanup barrier; one separate Node test-host abort is recorded in local QA and was not counted as success.

Windows Preview is unsigned and requires manual installation; no automatic installer or active headless-server update was performed. Runtime distribution admission is corrected in source, but the upstream runtime audit remains blocked. Human acoustic tests are postponed by the owner. Web/Android memory and artifact editing parity, further integrations, isolated model comparisons and commercial prerequisites remain open; this release does not complete them.

# Preview smoke shutdown correction — 11 October 2026

Packaged smoke exposed an intermittent native exit3221225477 after forced window destruction during pending service cleanup. The smoke window now uses the normal quit barrier; exit diagnostics retain code and signal. Behavioral lifecycle test8PASS, cloud:check/checkPASS, isolated suite1060PASS/2SKIP/0FAIL and source Electron smokePASS. Rebuild and repeated packaged smoke are required before publishing Preview0.3.30. No installer execution or server runtime replacement.

# Preview0.3.30 build prepared — 11 October 2026

Source version incremented for a new desktop Preview; prior Preview29 assets
remain immutable. New desktop memory/artifact/recipe capabilities reuse existing
components and stores. Android6.5.24/code114 and private Control42 are unchanged.
Release check/check/tests/smoke passed before the metadata-only version change.
Build and installer/bundle validation must complete before publication; this
checkpoint does not claim that new binaries have been published or installed.
No server runtime replacement is included; its upstream audit remains blocked.

# Runtime admission boundary corrected in source — 11 October 2026

Managed Ollama defaults to an immutable distribution security profile. Only
explicit local nonpackaged/nonserver development uses the loopback exception.
Public guest and paired public-ingress chat check admission before settings
adaptation or provider preparation; anonymous model metadata uses the same
guard. Failed admission now stops provider initialization. Health/startup/recovery
require the admitted owned process, including a post-await check when it exits.
Private inference with an external runtime remains supported; public metadata
and public/server Ollama require an admitted distribution-profile managed runtime.
The production server command now invokes the strict distribution CLI gate.

Independent prepatch investigation and postpatch review completed. Review found
a process-exit race, reproduced and corrected; its original trigger is rejected.
Focused96 tests pass. cloud:check/check pass; isolated suite1059 passes,2 skips,
zero failures. Electron smoke, synthetic voice sessions at four widths and
encrypted synthetic backup recovery pass. Human voice testing was postponed.
This fixes the source policy mismatch, not upstream runtime vulnerabilities:
the existing runtime audit findings remain open. No running service or runtime
was replaced, restarted or promoted; the deployed service retains its earlier
version. A source fix is not a claim of production remediation or a full audit.

# Desktop memory, artifact copies and local recipe — 10 October 2026

Source changes after Preview29: local memory scope/provenance/last use,
explicit expiry and native unencrypted JSON export; AI artifact originals plus
six bounded editable copies persisted transactionally with stale-save rejection;
finite document copy/read recipe through existing WorkflowRuntime/ActionRuntime,
separate approvals, receipts,2MiB cap and workspace binding. Revocation remains
possible after workspace changes. No project files are changed by artifact edits.
Electron/IPC tests on a disposable synthetic profile pass memory export/cancel,
artifact edit/reload/original/three layouts/conflict, and recipe preview/approvals/
checkpoint reload/copied text/two actual receipts. Focused store/workflow tests
pass. Final cloud:check and check pass; the isolated full suite passes1050tests,
with2intentional skips and zero failures. Publication, hygiene and section
checks including the newly tracked shared modules pass. No new packaged release.

Website website8bd340b is published, complete GitHub CI38051859828 passes.
Its Braces roots are removed through native React/Vite SSR while preserving
the existing product components and Worker boundaries. Full release gate passes
43tests/27browser, actual Workers runtime, budgets and zero known audit findings.
Candidate8b4e1ea9-4b8b-49b4-b3d8-6b90f3d79851 passes14 preview routes.
Production promotion completed through the standard release path, including
postdeployment route/header checks and independent AI health verification.
Production version9580fd57-7a33-4b0f-bc8c-f44703ff8750 uses website8bd340b.
AI readiness recovered to200 automatically after its existing scanner was
restored. The managed runtime uses a pre-existing development-loopback policy;
this recovery does not resolve the separate distribution gate: runtime0.32.15
and candidate0.40.2 still report60 High/Critical module-level findings.
Reachability and the appropriate security profile for a public gateway remain
open. Official signature/archive hash verified; no new runtime was installed
and no new security exception was introduced. Earlier503-blocked notes are
historical. Desktop sourcef1ac4f2 CI38052957705 completed successfully on both
Windows and Ubuntu with secret checks. These features are not in Preview29.

# Completion checks and release evidence — 10 October 2026

Source CI38045727001 at065440f completed successfully on Windows/Ubuntu with
secret and dependency checks. Additional synthetic voice-session checks pass
at four viewports; encrypted backup recovery passes on disposable synthetic
data. These do not certify human speech/echo or external recovery of real data.
Knowledge governance passes; the current training dataset validates with zero
approved examples and zero preference pairs, so SFT/DPO remain blocked.
The100-case evaluation suite validates without running inference. The aggregate
SLO report has six passes, zero failures and three unmeasured indicators:
complete model evaluation, deep quality and the historical availability window.

A release-tooling defect was reproduced and fixed: Founder/Stable readers
rejected the UTF-8 BOM emitted by Windows PowerShell Android matrix reports.
Both gates now accept the leading BOM while preserving malformed-JSON rejection,
APK hashes, timestamp, Online state, profile and frame/jank checks. Both actual
five-profile Android reports are recognized. Nine focused tests pass; the final
source gate and isolated full suite pass:1045PASS,2SKIP,0FAIL. No application
runtime or package changed; published Preview29 remains immutable.

Website dependency remediation remains blocked. Independent scoped review
reproduced the Braces overflow through fast-glob in a fresh local process,
without a concrete public HTTP-input path in the current application. No patched
upstream version is available; no advisory suppression or deployment performed.
This does not complete the separate application-wide partial security scan.
See docs/PROGRAMMA-PRODOTTO.md for measured state and remaining prerequisites.
Installed Windows remains0.3.27; manual29 installation is needed before installed
ASAR/smoke/shortcut verification. A prior automatic installation was policy-blocked
and must not be retried through an alternative mechanism. No PC restart/shutdown,
model training/download, cloud inference or private-data deletion performed.

# Published Preview 0.3.29 — 10 October 2026

Published v0.3.29-preview.1 from2dbf0d3086705ccaa518168c8567f4a3eba173e1, with eight assets verified on GitHub. CI38045046741 passes on Windows/Ubuntu with secrets and dependency checks. Windows build, installer inspection, packaged smoke, SBOM346components, six-artifact bundle and Founder package pass. The headless service was restarted without rebooting the PC; live home/health/readiness return200 and the public page exposes the new memory behavior and29 download URLs. Isolated production browser checks pass at390x844 and1440x900 for history reload/reset, offline cached navigation, font and reconnect. Windows automatic installation remains blocked; the published setup must be installed manually before installed smoke and shortcut refresh. Android114 is unchanged.

Account-free web conversations use bounded browser IndexedDB, restored after reload. Reset invalidates late stream frames, pending attachment reads and stale database writes, clears draft/preferences and propagates to other tabs. Storage denial is explicitly shown as temporary memory. Original attachments, images and unsent drafts are not persisted. See docs/LOCAL-DATA.md for deletion and offline limits: browser history alone does not clear site data, and remote inference still requires the server.

The public request ledger persists opaque idempotency metadata without answer text. Replay is bounded RAM with five-minute expiry checks and periodic cleanup; authenticated reset clears only its installation and aborts active work. A late completion cannot recreate forgotten output. Restart retains tombstones without regenerating or replaying lost text. Antiabuse metadata and existing external backups remain distinct. Common conversational guidance preserves calm, criticism, cancellation and honest limits without simulated suffering.

Final source gate PASS; full suite1045PASS2SKIP0FAIL after browser fallback and availability diagnostics. Eleven focused monitoring tests pass. Browser reload/cross-tab reset/stale write/denied storage/late attachments pass, as do offline three viewports, personalization four viewports, web state layout40 captures, accessibility six surfaces and desktop motion. Android public114 was installed and both public114/Control42 passed five physical Online display profiles; no new Android code or APK version is claimed. Voice echo/full-duplex with humans, system assistant-button invocation, full security coverage, production signing, external restore and commercial readiness remain open. Windows29 packaging/publication and service restart are now verified above. Availability monitoring preserves failures and prints each HTTP result; an insufficient historical window is explicitly unmeasured. The latest scheduled failure returned503 while the only local server was powered off; live health/readiness now return200 and automatic boot startup is ready. Alerts remain enabled. Automatic Windows installation remains policy-blocked; no alternate installer attempt or PC reboot is authorized by this checkpoint. Local default/cloud OFF; no model training or download.
# Public continuity checkpoint

Updated 6 October 2026. This file is safe for source collaboration. Private data, credentials, workstation configuration and logs remain outside GitHub.

## Published Preview 0.3.28 / Android 6.5.24

Image providers and signed feeds now share bounded, cancellable response consumption. OpenAI image JSON, Comfy queue/history metadata and binary downloads have separate limits before allocation/parsing; unsuccessful reads cancel their bodies and local output cleanup retains the descriptor boundary. Android provider metadata, attachment reads and backup operations use isolated bounded workers and deadlines. Cancelled composer imports cannot persist into another conversation. Preview decoding runs off the UI thread after dimension/pixel checks and sampling; original attachment bytes and the existing 16 MiB backup limit remain intact.

Published as v0.3.28-preview.1 from58531df, with eight GitHub assets verified by digest and byte count. Source gate passes; complete Windows source suite:1040PASS,2SKIP,0FAIL. Kotlin compilation, Preview lint, Windows build/installer/packaged smoke, six-artifact bundle, registry signatures and clean Windows/Ubuntu CI pass. Accessibility checks cover six surfaces; motion and four views at four DPI scales pass. Preview remains unsigned commercially and updates are manual.

Windows automatic installation was rejected by the approval policy before execution. The installed version remains0.3.27 with its original ASAR; do not claim installed smoke for0.3.28. Manual installation of the verified package is needed before comparing its ASAR and refreshing/testing the configured shortcut. Physical Android provider/decoder/lifecycle tests are pending: ADB currently has no devices. Historical113/Control42 checks do not certify114. An uncooperative provider can retain the two isolated IO workers; admission stays bounded and chat/UI workers are separate, but provider termination is not guaranteed.

The current dependency audit identified GHSA-68fv-2mgg-jv7q in development-only source-map-js1.2.1. The lockfile selects the patched1.2.2; runtime/tooling audits report zero known vulnerabilities and source check/full1040PASS suite pass again. Windows was rebuilt against58531df before publication. Android114 has a verified Preview build; physical tests remain pending.

Codex Security completed an explicitly partial report:50/930 files at immutable b903433, with three source-validated availability findings. Remaining880paths are recorded after the delegated review reached its usage limit; architecture mapping does not count as whole-file audit coverage. Released source differs from that immutable report; Android physical verification remains open. No full security or commercial readiness is claimed. The owner selected local-only automation preparation with no additional always-on node; PC-off availability is not provided.

Live web app HTTPS health/readiness and both0.3.28 download URLs pass. Real service-worker offline/draft/cached-font/reconnection checks pass at390x844 and1440x900. These observations do not certify a long availability window or human voice. Website source has verified0.3.28/6.5.24 metadata and the patched development dependency, but production remains blocked by the braces dependency gate. Existing rollback packages and personal data are preserved.

## Verified 0.3.27 delivery

Windows 0.3.27 is published as v0.3.27-preview.1 from add45bed, with eight GitHub assets verified by digest and byte count. Installation, identical ASAR, native installed smoke and the configured shortcut pass. Clean GitHub Windows/Ubuntu CI, registry signatures, secret scanning and dependency audits pass. The server and desktop bridge are running; boot/logon tasks are enabled and service startup opens neither UI nor pet. The PC was not rebooted.

Live HTTPS health/readiness/home and the current Windows/Android download links pass. Two synthetic input probes completed: chat first token 3347/1075 ms, total 3401/1105 ms; TTS returned valid WAV in 8211/656 ms after startup/warm-up. These are individual observations, not a general benchmark or human voice/echo validation. Six old recoverable Windows installer/blockmap outputs were removed after matching GitHub digests and sizes, freeing 335759902 bytes. Versions 0.3.25, 0.3.26 and 0.3.27 remain locally available.

Android public 6.5.23/code113 and Control 1.19.8/code42 passed five physical Online profiles each; public native QA passed 24 tests. Control's authorized application closure passed through the real authenticated bridge. ADB disconnected before the final power/service confirmation checks; these and invocation from the actual assistant button remain pending. No power action was executed. Website source now has verified 0.3.27/6.5.23 release metadata and 37 passing local tests, but production deployment remains blocked by the dependency security gate.

## Startup recovery evidence

Installation of 0.3.26 exposed a cold Windows DPAPI timeout during bridge startup. The candidate retries a killed timeout once, bounded to 4+8 seconds, while retaining CurrentUser protection and denying cryptographic failures. Shutdown now preserves a bootstrap failure exit code after cleanup, allowing the existing task supervisor to retry. Thirteen focused tests and an actual Electron cleanup/exit1 check pass. Source check and final Windows suite pass: 1033 PASS, 2 SKIP, 0 FAIL. Build, installer, packaged/installed smoke and the six-artifact bundle pass. Android 6.5.23 is unchanged.

## Verified 0.3.26 delivery

Windows 0.3.26 was published as v0.3.26-preview.1 with eight verified assets and installed with an identical ASAR and refreshed shortcut. Clean GitHub CI passes on Windows/Ubuntu for 0055930. Android public 6.5.23/code113 build, lint, Debug signing and five physical Online profiles pass; 24 native tests pass in the separate QA sandbox. Previous releases remain available for rollback. Control 1.19.8 also passes five physical Online profiles; authorized closure of the test-owned Note application succeeds through the real bridge.

Control capabilities now use the common action contract, including authorized application closure. Two behavioral tests cover late microphone acquisition after Stop and overlapping activations. Availability gates recompute the bounded observation coverage from raw samples, filter the requested window and deduplicate observations conservatively. Missing observations cannot certify availability.

Web offline/reconnection and history cancellation checks pass. Codex Security completed an explicitly partial review of revision 8e2925c: 65/929 files reviewed, 864 deferred, one medium finding on untrusted Android ASSIST entry. The candidate protects the assistant Activity with the system signature permission and rejects ASSIST on the public launcher; native regressions pass. This does not constitute full repository security coverage. Physical invocation from the actual assistant button remains pending; the OS rejects shell attempts correctly. The final isolated Windows suite passes: 1030 PASS, 2 SKIP, 0 FAIL. Source check, packaged smoke, installer and six-artifact bundle checks pass. The earlier DPAPI timeout during a concurrent build did not recur in the focused test or isolated full suite. The authorized test application closure and clean GitHub CI were verified; remaining physical button checks are recorded above.

## Previous 0.3.25 delivery

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
