# NexusNXS source instructions

Read `CONTINUITA.md`, `docs/STABILIZATION-STATUS.md` and `docs/ROADMAP.md` before making changes. On the owner's workstation, the parent `CONTINUITA.md` and `RIPRESA.md`, when present, contain the authoritative operational checkpoint. Never publish their private contents.

Reuse this checkout and existing components. Keep source, tests and documentation in their existing directories. Preserve uncommitted changes; never use destructive reset or blanket cleanup to resume interrupted work.

## Source verification

Use Node 24 and `npm ci`. In an isolated environment run `npm run cloud:check` and `npm test`. These checks need no models, private knowledge, production credentials or active server. Read `docs/CODEX-CLOUD.md` for setup and limitations. Run relevant focused tests during development, then the source gate before committing.

`npm run check`, release gates, Android device checks and live voice tests remain required on the configured workstation for their respective releases. A source check does not certify an installer, deployment, voice quality or commercial readiness.

## Boundaries

- Local inference is the default; optional cloud inference stays disabled.
- Never access production services, download models or launch training as part of source verification. Model changes require authorized reviewed data, separate holdout, resource estimates, isolated comparisons and explicit promotion.
- Votes are not training consent. Preserve authentication, subject isolation, permission checks, cancellation and receipts.
- Never publish credentials, local configuration, private knowledge, chats, models, dependency folders, logs or generated builds. Run publication checks before pushing.
- Do not restart or power off the owner's PC. Test power controls with simulated executors.
- Common actions use accessible icons; retain text for important content, choices and warnings. Reuse Inter, design tokens and existing motion controllers. Verify narrow layouts, contrast, keyboard focus and reduced motion.
- Record the revision, actual checks, unfinished work and next step in `CONTINUITA.md` after each verified block. Keep the public checkpoint free of personal information. Never claim zero bugs or a completed platform test without evidence.
