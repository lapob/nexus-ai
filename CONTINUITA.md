# Public continuity checkpoint

Updated 3 October 2026. This file is safe for source collaboration. Private operational logs, data, credentials and workstation paths remain outside GitHub.

## Baseline

Windows 0.3.23 Founder Preview is published; 0.3.24 is the current candidate. Android public 6.5.22/code112 is built and linted, with physical testing explicitly deferred by the owner. Control 1.19.8 is unchanged. Earlier device tests apply to their exact earlier revisions. Preview is not certified as Stable or ready for commercial sale. The private workstation checkpoint holds installed hashes and deployment receipts.

## Current work

- Consolidate the source into the default `main` branch while preserving previous branch tips and history. Publish website source separately on `website` in the same repository.
- Make source checks runnable in an isolated Node 24 environment, without production AI or private knowledge.
- Keep Control status responsive while bounded desktop probes refresh in the background. Prevent old observations from overwriting a completed action.
- Reuse the existing artifact surface for explicit opening, safe text export, original content and diff.
- Clean only identified, reproducible outputs; preserve the current release, rollback, personal data and operational runtimes.

Source checks pass. Full suite: Windows 1016 PASS / 2 SKIP, Linux 1001 PASS / 17 SKIP, no failures. The Linux distribution lacks integrated TypeScript; the generator check remains mandatory on official Node 24 in CI. Native artifact downloads preserve exact result/original content; non-overlapping action hitboxes and keyboard focus recovery pass at 100% and 200%. Nine recoverable old Windows artifacts were removed after matching GitHub hashes/sizes, freeing 554921279 bytes; both Git histories are backed up before branch consolidation.

## Work requiring additional evidence or resources

Real human voice and echo tests are deferred by the owner. Cold boot has not been tested by restarting the PC. Full security coverage, commercial signing and external recovery remain open. No approved training examples or model promotion are available. Always-on automations need an owner-selected node; iOS distribution needs macOS/Xcode and a device. A paying pilot needs a selected service and actual customer measurements.

Website production promotion remains blocked by its dependency security gate. Publishing source is not a production deployment. Do not bypass a dependency finding or retry a blocked model evaluation against the active service.

## Resume

Read `AGENTS.md`, this file, `docs/STABILIZATION-STATUS.md` and `docs/ROADMAP.md`; inspect Git and logs before repeating an interrupted operation. Update this checkpoint with measured results and the next concrete step. Source collaboration in Codex Cloud does not enable cloud inference in the product.
