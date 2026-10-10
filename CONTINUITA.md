# Website source continuity

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
