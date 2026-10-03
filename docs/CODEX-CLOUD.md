# Source work in Codex Cloud

Select repository `lapob/nexus-ai`, branch `main` for the desktop/server/Android sources, or `website` for the public site. The branches contain different source roots; do not merge website history into the application tree.

Use Node 24. The setup command is `npm ci`. Configure `ELECTRON_SKIP_BINARY_DOWNLOAD=1` in the environment when only running source checks; Electron's native binary is unnecessary for those checks. Setup requires dependency network access. Agent network access can remain disabled. No production credentials, tokens, private knowledge or models are needed.

For `main`, run:

```sh
npm run cloud:check
npm test
```

`cloud:check` verifies publication safety, source hygiene, generated shared contracts, TypeScript, renderer compilation and its startup budget. Tests use isolated fixtures and simulated executors. OS-specific tests may skip on Linux; report skips explicitly. Native Windows/Android behavior, microphones, signed packages, production services and GPU inference require the existing workstation release gates. Never replace those gates with the cloud gate.

For `website`, run:

```sh
npm run cloud:check
```

Its production release also requires `npm run verify:security`, browser checks, performance budgets and the deployment pipeline. An unresolved dependency advisory blocks deployment even if source checks pass. Never provide a Cloudflare token to a source-only task.

Before publishing a change, inspect the diff, run applicable checks, update the public checkpoint and commit only source or documentation. Keep generated files ignored. For an interrupted task, verify Git and existing effects first; do not repeat deployment or installation blindly.

Official references: [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environment) and [repository instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
