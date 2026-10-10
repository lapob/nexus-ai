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
