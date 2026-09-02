# Incident response

This runbook is for the NexusNXS maintainer. It intentionally contains no real
hostnames, credentials, device identifiers or workstation paths.

## First ten minutes

1. Preserve the time, release version and user-visible symptom. Do not delete
   logs or rebuild the affected machine before evidence is copied to protected
   storage.
2. If public inference may be unsafe, disable the public edge and set
   `NEXUS_DISABLE_UPDATES=1` on the release service. Keep the private runtime
   inaccessible from the Internet.
3. Revoke affected device sessions and pairing tokens. Rotate only credentials
   that may have been exposed; never paste replacements into an issue or log.
4. Stop the affected release rollout. Do not overwrite an existing package or
   reuse its version number.

## Triage

- Separate availability, account or pairing abuse, data exposure, malicious
  input and compromised release artifacts.
- Export security audit events, gateway health, AI circuit state and the signed
  package hashes. Redact prompts, personal memory and local paths before sharing.
- Compare the package SHA-256, SBOM and signature with the published release.
- Reproduce on an isolated clean Windows user and a test mobile device. Never
  reproduce destructive actions on the production workstation.

## Recovery

1. Fix on a dedicated branch and run `npm run release:preflight`.
2. Build a newly versioned, signed candidate and verify installation, upgrade,
   offline behavior, update detection and uninstall on a clean Windows system.
3. Publish to the beta channel first. Expand gradually only while error rate,
   latency and security events remain normal.
4. Restore the public edge last, then verify desktop and both Android clients
   from an external network.

## If an update is defective

Publish a higher, corrected version. Do not mutate or silently replace the bad
installer. Keep its hashes and incident timeline for audit, but remove it from
automatic rollout.

## Closure

Record the root cause, affected versions, detection gap, corrective tests and
credential rotations in a private incident record. Add a regression test before
closing the incident and confirm that no private evidence entered Git history.
