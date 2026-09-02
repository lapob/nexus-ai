# Release signing

NexusNXS does not create or store publisher credentials in the repository.
Production releases require three independent trust chains:

- Windows Authenticode through `CSC_LINK` and `CSC_KEY_PASSWORD`;
- Android signing through `NEXUS_ANDROID_KEYSTORE` and the related alias/password variables;
- Ed25519 update-manifest signing through the three `NEXUS_RELEASE_MANIFEST_*` variables.

Keep certificates and keystores outside source control, preferably in an
encrypted hardware-backed or CI secret store. Run `npm run signing:doctor` for
a redacted status report and `npm run signing:gate` before a Stable build.
Neither command prints key material.

Give every active key a unique `NEXUS_RELEASE_MANIFEST_KEY_ID`, named owner,
creation date, planned rotation date and revocation procedure in a private
register. Never rotate by replacing a public key inside an already signed
manifest. Publish a forward-signed transition, pause rollout if verification
fails, and retain the previous public key only for the documented overlap
window. Stable requires an externally recorded rotation rehearsal through
`NEXUS_KEY_ROTATION_CONFIRMED=true`.
