# Reload and offline-cache regression candidate — 16 October 2026

The canonical root response covers ordinary GET, service-worker cache requests
with wildcard Accept and bodyless HEAD. APIs remain upstream-owned. Startup also
waits for local history restoration, preventing idle controls before a slow
conversation reload. Four browser cases pass under the actual Worker CSP,
including delayed IndexedDB history, image blobs and reduced motion. The prior
candidate passed44 source tests and30 browser tests; an exact new candidate with
31 browser tests is required for this last refinement. Production remains
unchanged until the independent readiness gate passes; it currently returns503.
# Canonical AI startup candidate — 16 October 2026

The public AI root/index navigation uses one canonical UI instead of depending
on the server version for HTML and a separate shell on tunnel failure. The local
server continues to own all API readiness, authentication and inference. The UI
response is no-store and nonce-protected; blob images and audio retain the same
local-source support as the canonical gateway. Readiness failures remain503.

The shell is generated with the existing sync tool. Startup waits for initialized
controls and a bounded local-font/layout settlement before a short reveal,
respecting reduced motion. Three streaming-browser regressions cover narrow,
landscape and desktop layouts; worker tests verify navigation isolation, nonces
and unchanged upstream readiness responses. These are synthetic browser tests.
Production is not promoted at this checkpoint: the independent AI readiness gate
currently returns503 and must not be bypassed. Previous production is preserved.
# Graphic refinement and Preview0.3.31 promoted — 11 October 2026

Website source 168679539afde6ef16f4b282fd4e781b1471c200 passed the full release gate: 43 Node tests, 27 browser tests, actual Workers runtime, 349 package signatures and zero known dependency audit findings. Immutable candidate 59359312-f4f4-4a71-afb0-2b52df281b4b was promoted through the normal release path as production 956fcc2d-ca66-4bb0-a73a-61f62ec72418. Postdeployment checks passed 14 routes, navigation, headers and independent AI health. No rollback was needed; the prior deployment remains available.

Fresh production browser checks at 320, 390, 844 and 1440 px verify the home action on one line, centered text/icon group, vertical alignment and no horizontal overflow or browser exceptions. The old child font rule caused the narrow-screen wrap and was removed rather than adding another override. The canonical offline shell and verified Preview31 download links are included in the same deployment.

The live AI web app also passes isolated graphic checks at 390 and 1440 px: profile controls are 48 px high, and the composer retains its draft across offline/reconnection without overflow or browser exceptions. No message was submitted and no inference was requested. This is a browser viewport test, not a physical Android or acoustic voice test. Desktop Preview31 is published; no desktop installation or active-server/runtime replacement is included. Runtime distribution audit and commercial prerequisites remain open. This documentation update requires no new deployment.
# Graphic refinement and Preview0.3.31 candidate — 11 October 2026

Removed the legacy16px child rule that wrapped the primary home action at320px; its label now inherits the intended14px typography. The browser regression verifies one line, centered complete text/icon group and vertical alignment at seven widths and three scroll positions. release:sync verified GitHub manifest/hash/size for Preview0.3.31; previous releases are preserved.

The edge offline shell was regenerated through the existing tool from the canonical public AI UI. It includes the already-tested profile styling and browser-local history/reset implementation, plus Preview31 links; this is more than a link-only change. No inference runs at the edge, and no active headless-server restart is included. Full source/browser/runtime/security gates and immutable-candidate promotion are required before publication. Physical Android and human voice are not claimed by this review.

# Preview0.3.30 downloads promoted — 11 October 2026

Website source583c7869d5fa55eeb1eb2bb0bcba4890e9f0d895 passed the full release gate:43 Node tests,27 browser tests, actual Workers runtime,349 package signatures and zero known dependency audit findings. Immutable candidatee5994e88-d0d3-4804-b4a6-a2e7d72b6c69 was verified and the normal promotion completed as production6a155bdf-1f0f-43e9-bcab-36bdc8f4c366. Postdeployment14 routes/navigation/headers and independent AI health pass. A fresh /downloads readback returns200 and the verified Windows0.3.30 link; AIready returns200. No rollback was needed. Public Preview30 retains Preview29 for rollback; Android6.5.24 is unchanged. This is a website download update, without desktop installation or active-server/runtime replacement. Human voice, runtime audit and commercial prerequisites remain open.

# Preview0.3.30 download metadata prepared — 11 October 2026

GitHub prerelease v0.3.30-preview.1 is public with eight verified assets. The existing sync tool verified the public manifest, GitHub SHA-256 digests and sizes before updating only app/data/public-release.json. Windows0.3.30 replaces the public download target; Android6.5.24 is unchanged. Previous production version9580fd57 remains active until the standard full release gate and immutable candidate promotion pass. This metadata update does not install the desktop client or update the headless server; its runtime audit remains blocked.

# Production promoted and verified — 10 October 2026

Source website8bd340bc053eb28f9dd3860ae6bd0ce5aaf86328 passed complete CI
38051859828 and the workstation release gate:43 Node tests,27 browser tests,
actual Workers runtime, unchanged budgets and zero known audit findings.
Immutable candidate8b4e1ea9-4b8b-49b4-b3d8-6b90f3d79851 passed14 preview routes.
The standard promotion path published the same build to production as version
9580fd57-7a33-4b0f-bc8c-f44703ff8750. Postdeployment checks passed14 routes,
navigation, headers and the independently verified AI service. No rollback was
needed; the existing automatic rollback path was retained.

Fresh production Chromium checks also pass centered home text/icon groups and
no horizontal overflow at320/390/768/1440/1920px, including three scroll
positions. Real desktop/Android product image zoom is centered and dismissible
at1440x1000,844x390 and390x844; no browser exceptions were observed.

AI readiness recovered to200 automatically after restoration of its existing
scanner. Its managed runtime uses a pre-existing development-loopback policy;
this does not resolve the separate distribution audit, which still reports60
High/Critical module-level findings on both runtime candidates. Reachability
and the appropriate security profile for a public gateway remain open.
No new runtime installation or audit exception was introduced. The503-blocked
notes below describe earlier checkpoints, not current production availability.
Desktop memory/artifact/recipe changes are source-only after Preview29.

# Candidate verified; CI browser cache corrected — 10 October 2026

SSR commit d86517b passed the complete workstation release gate:43 Node tests,
27 browser tests, local Workers runtime, unchanged size budgets and security
audit (349 signatures,96 attestations, zero known vulnerabilities). Immutable
candidate a3af7717-53b5-44ea-ac9f-a388a1989b70 passed14 preview routes.
Source published. CI source passed; browser verification failed before any
test ran because its launcher forced the workstation cache after CI installed
Chromium in the default cache. The launcher now respects explicit cache settings
and uses the default cache in CI. Rerun the actual CI before claiming it passes.
Prepare a new candidate matching this exact revision before promotion.

Production promotion is still blocked by the separate AI readiness503. The
official local runtime0.32.15 and downloaded0.40.2 both fail the existing
distribution gate with60 High/Critical module-level findings. Candidate hash
and official signature were verified; no runtime replacement or audit bypass.
This is separate from the resolved website Braces dependency roots.

# React/Vite SSR dependency remediation — 10 October 2026

Candidate removes both Braces dependency roots and unused RSC tooling while
reusing all existing pages, CSS, Inter, particle physics and product assets.
The Worker still owns AI proxy/offline, maintenance, nonce/CSP and canonical
host redirects. Explicit SSR preserves metadata, security.txt, status, 404,
GET/HEAD, legacy pricing/trailing slash redirects and release output paths.
The internal RSC protocol is no longer emitted; product navigation uses full
links. Dev builds then serves a local preview; no HMR is claimed.

Clean locked install:349 verified signatures,96 attestations, zero known
vulnerabilities. Dependency graph contains no Braces/micromatch/fast-glob or
Vinext/CommonJS chain.43 tests pass; unchanged size budgets pass. Actual local
Workers runtime and Wrangler dry-run pass. Browser review found and corrected
an unnecessary Suspense hydration fallback and lost motion classes; nine
focused repetitions pass, including narrow/wide hydration of seven routes.
Prepatch independent investigation completed. Postpatch independent review
was interrupted before its final report; a separate parent boundary review
completed instead. This is scoped remediation, not a full security audit.

Next: exact clean source commit, complete release gate, immutable candidate
verification, then controlled production promotion with existing rollback.
No deployment has occurred at this checkpoint. Historical notes follow.
# Website source continuity

## Dependency boundary review — 10 October 2026

Independent read-only investigation reproduced the installed Braces overflow
through fast-glob in a fresh local Node process with a nested pattern below
the character limit. No concrete public HTTP-input path was established:
the identified consumers belong to Next lint configuration and Vinext's
build-time CommonJS/configuration loader. Existing built bundles contained
no affected package/plugin identifiers in a textual scan; this is not formal
provenance verification of the deployed artifact.

The official advisory GHSA-vfj7-8cjw-p6xm still lists no patched release.
Registry checks confirm that updating Vinext alone leaves the affected chain.
Inline configuration can reduce one path but does not remove the dependency;
removing the framework would break the current build/runtime contract.
Outcome: blocked, no vulnerability patch applied and no deployment performed.
Do not suppress development findings, fake versions or downgrade the framework
to make the release gate pass. Adopt a compatible corrected release, then rerun
the reproduction, ordinary glob controls and all existing release checks.
The standalone review evidence is retained by Codex Security outside Git;
this scoped investigation does not certify the complete application repository.

## 10 October 2026

Source now references published Windows Preview0.3.29 and unchanged Android6.5.24,
verified against the public GitHub manifest, asset digests and byte counts.
Cloudflare Vite plugin1.63.1, Wrangler4.149.0 and Sharp override0.35.5 replace the
previous tooling versions; the Sharp advisory is removed. The dependency audit
falls from eleven to seven high findings in the remaining Braces chain.
The source gate, build/performance checks and37tests pass with the final lockfile;
registry signatures pass. The release security gate still fails, so production
is unchanged and no deployment bypass is allowed. These are source updates.

Updated 6 October 2026. Source collaboration branch: `website` in `lapob/nexus-ai`. Application/server/Android source uses `main`; these are separate trees.

The public website remains on its previously verified production version. Local source includes links for Windows Preview 0.3.28 and Android 6.5.24. Release metadata was matched against the public GitHub manifest, asset digest, version and byte count. Production promotion remains blocked by the dependency security gate for GHSA-vfj7-8cjw-p6xm in braces. Do not bypass the gate, fabricate a patched version or claim these links are deployed.

The development dependency source-map-js is updated from1.2.1 to the patched1.2.2 for GHSA-68fv-2mgg-jv7q. Source build, performance and37tests pass after this update and the verified0.3.28 metadata; registry signatures pass. The new source commit requires its own remote check. The release security gate still rejects the remaining braces chain. No production version was changed.

Use Node 24 and `npm ci`, then `npm run cloud:check` for source checks. Production additionally requires `npm run verify:security`, the browser/performance checks and the existing prepare/promote pipeline. No Cloudflare credentials are needed for source work. Leave the agent's internet access disabled unless a task requires it; setup needs dependency access.

Before resuming an interrupted operation, inspect Git and previous logs. Keep current production and rollback identifiers in the private workstation checkpoint. Update this public file with actual source checks and commits, excluding tokens, personal information and local data.
