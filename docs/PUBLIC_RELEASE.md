# Public release runbook

This document separates the public source repository from deployable binaries.
It contains no workstation address, device credential, model, or private data.

## What belongs on GitHub

Publish the reproducible source tree: `.github`, `android`, `build` brand
resources, `config` examples and design tokens, `docs`, `knowledge-packs`,
`scripts`, `src`, `tests`, plus the root metadata and lock files.

Do not publish generated installers or APKs in Git history. Attach only the
signed Windows installer and the signed NexusNXS Android client to a public
GitHub Release. `NexusNXS-Control.apk` is maintainer-only and must never be attached
to a public release, copied to the public site, or listed in its manifest. Never publish
`vendor`, models, local databases, logs, caches, `.env` files, private/public
runtime vaults, pairing state, real endpoints, signing stores, or device data.

## Required gates

```powershell
npm ci
npm run release:check
npm run check
npm test
npm run smoke
npm run release:public:artifacts
```

For a Stable release, use the stricter gate instead of assembling artifacts
directly:

```powershell
npm run release:stable:gate
npm run release:public:stable
```

The Stable gate fails closed unless all signing chains are configured, the SLO
report is current, backup restoration has succeeded, and both Android clients
have passed the five-profile physical-device matrix with measured frame jank.
It also requires externally recorded evidence for an encrypted off-site backup,
UPS, network failover, key rotation, clean-device upgrade, incident rehearsal,
and an independent penetration-test report. These controls cannot be generated
or self-certified by the build.

Every pull request also runs GitHub's pinned dependency review and rejects new
high-severity dependency findings. The scheduled security workflow generates
the CycloneDX SBOM and publishes a GitHub build-provenance attestation for that
exact digest using short-lived OIDC credentials; repository secrets are not
used to sign the attestation.

`release:public:artifacts` creates `release/release-manifest.json`, which is the
only publication allowlist. It contains the Windows installer/update metadata
and NexusNXS for Android; it cannot contain the owner Console. Build the latter
separately with `npm run release:private:artifacts`: its APK and private manifest
are written under ignored `release-private/` and must be delivered only to the
owner. Unsigned Preview artifacts use the dedicated `preview` channel and
never enable automatic updates. Beta and Stable are signed channels: both
require a detached Ed25519 manifest signature; only Stable is a production
rollout.

For a production installer, configure secrets only in the release environment:

```powershell
$env:NEXUS_SERVICE_URL='https://ai.example.com'
$env:NEXUS_UPDATE_URL='https://updates.example.com/windows'
$env:CSC_LINK='path-or-secret-reference'
$env:CSC_KEY_PASSWORD='secret'
$env:NEXUS_URL='https://ai.example.com'
$env:NEXUS_ANDROID_KEYSTORE='path-or-secret-reference'
$env:NEXUS_ANDROID_STORE_PASSWORD='secret'
$env:NEXUS_ANDROID_KEY_ALIAS='release'
$env:NEXUS_ANDROID_KEY_PASSWORD='secret'
$env:NEXUS_RELEASE_MANIFEST_PRIVATE_KEY='path-or-secret-reference'
$env:NEXUS_RELEASE_MANIFEST_PUBLIC_KEY='path-or-secret-reference'
$env:NEXUS_RELEASE_MANIFEST_KEY_ID='release-2026'
npm run release:check:production
npm run release:stable:gate
npm run release:public:stable
```

The public application must call a hardened HTTPS edge. The model runtime,
private NexusNXS per PC gateway, local knowledge, memory, and workstation tools must
remain unreachable from the public origin.

## First GitHub release

1. Protect the default branch and require the CI workflow.
2. Enable private vulnerability reporting and Dependabot alerts.
3. Create a signed tag such as `v0.3.5` only after all gates pass.
4. Create release notes covering features, known limitations, privacy, and
   upgrade behavior.
5. Attach the signed Windows installer, the signed NexusNXS Android client,
   their SHA-256 checksums, and the SBOM. Verify that
   `release/release-manifest.json` contains only public artifacts. Deliver
   `NexusNXS-Control.apk` separately through a private authenticated channel.
6. Verify installation, update detection, offline state, and uninstallation on
   a clean Windows user before marking the release stable.
7. Rehearse the containment and rollback procedure in
   `docs/INCIDENT_RESPONSE.md`; record the maintainer, time and outcome outside
   the repository.
