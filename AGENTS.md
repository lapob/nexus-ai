# NexusNXS website source

Read `CONTINUITA.md` before changing the site. This checkout is the `website` branch of `lapob/nexus-ai`; desktop/server/Android source is on `main` with a different source root. Do not merge the two trees or create parallel project folders.

Use Node 24 and `npm ci`. For isolated source work run `npm run cloud:check`. Before production deployment run the existing security, browser, performance and release gates. Source publication is not production promotion; do not suppress dependency findings or use deployment credentials for ordinary editing.

Reuse the existing particle runtime, pointer physics, Inter, design tokens and components. Keep layout centered at narrow/wide widths, preserve shape after scrolling, support reduced motion, and use accessible icons for common actions. Do not copy third-party branding or assets.

Keep secrets, private workstation paths, knowledge, personal data, dependency folders, logs and generated outputs out of Git. Preserve current deployment and rollback. Never publish or deploy without verifying the exact diff and applicable gates. Update `CONTINUITA.md` with measured results, limitations and the next step; never claim perfect compatibility or zero bugs.
