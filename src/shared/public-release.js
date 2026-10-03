/** @module shared/public-release
 * @description One version/tag contract for public downloads and immutable Preview publication.
 */
// #region Release target and published artifact verification
function publicReleaseTarget({ version, repository = 'lapob/nexus-ai', tag } = {}) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version || ''))) throw new Error('Invalid public release version.');
  if (!/^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/i.test(repository)) throw new Error('Invalid public release repository.');
  const releaseTag = tag || `v${version}-preview.1`;
  if (!new RegExp(`^v${version.replace(/\./g, '\\.')}\\-preview\\.[1-9]\\d*$`).test(releaseTag)) throw new Error('Release tag must match the component version.');
  const base = `https://github.com/${repository}/releases/download/${releaseTag}/`;
  return Object.freeze({ tag: releaseTag, windowsDownload: `${base}NexusNXS-${version}-Setup.exe`, androidDownload: `${base}NexusNXS-Android.apk` });
}

function assertPublishedReleaseMatches(release, prepared) {
  if (release?.draft !== false || !Array.isArray(release.assets)) throw new Error('Published release state is not verified.');
  for (const asset of prepared) {
    const matches = release.assets.filter(remote => remote.name === asset.name);
    if (matches.length !== 1 || matches[0].size !== asset.size || String(matches[0].digest || '').toLowerCase() !== `sha256:${asset.sha256.toLowerCase()}`) {
      throw new Error(`Published release is immutable: ${asset.name} differs. Bump the version and publish a new release.`);
    }
  }
  return true;
}
// #endregion
module.exports = { publicReleaseTarget, assertPublishedReleaseMatches };
