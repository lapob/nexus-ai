# Website source continuity

Updated 3 October 2026. Source collaboration branch: `website` in `lapob/nexus-ai`. Application/server/Android source uses `main`; these are separate trees.

The public website remains on its previously verified production version. Local source includes links for Windows Preview 0.3.23, but production promotion is blocked by the dependency security gate for GHSA-vfj7-8cjw-p6xm in braces. Do not bypass the gate, fabricate a patched version or claim these links are deployed.

Use Node 24 and `npm ci`, then `npm run cloud:check` for source checks. Production additionally requires `npm run verify:security`, the browser/performance checks and the existing prepare/promote pipeline. No Cloudflare credentials are needed for source work. Leave the agent's internet access disabled unless a task requires it; setup needs dependency access.

Before resuming an interrupted operation, inspect Git and previous logs. Keep current production and rollback identifiers in the private workstation checkpoint. Update this public file with actual source checks and commits, excluding tokens, personal information and local data.
