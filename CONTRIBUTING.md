# Contributing

NexusNXS is currently owner-maintained. Small, focused pull requests are preferred.

1. Create a feature branch from the current default branch.
2. Keep public guest, personal chat, and workstation-control boundaries separate.
3. Add or update tests for every behavioral change.
4. Run `npm run check` and `npm test`.
5. For experience changes, run `npm run verify:experience`.
6. For visual changes, render and inspect the affected views with
   `node scripts/visual-qa.js --views=<views>`.
7. Never commit generated packages, models, runtime binaries, logs, private
   knowledge, device state, secrets, or personal data.

Pull requests should explain the user impact, security impact, root cause for a
fix, and the exact verification performed.
