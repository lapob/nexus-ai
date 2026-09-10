/** @module scripts/android-matrix-evidence
 * One device-evidence policy for Preview invitations and Stable releases.
 */
const fs = require('node:fs');
const crypto = require('node:crypto');

// #region Validation
function validAndroidMatrix(artifact, policy, apkPath) {
  if (apkPath) {
    try {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(apkPath)).digest('hex');
      if (String(artifact.ApkSha256 || artifact.apkSha256 || '').toLowerCase() !== hash) return false;
    } catch { return false; }
  }
  const profiles = artifact.profiles || artifact.Profiles;
  const metrics = artifact.frameMetrics || artifact.FrameMetrics;
  return Array.isArray(profiles) && Array.isArray(metrics)
    && profiles.length >= policy.requiredProfiles
    && new Set(profiles).size === profiles.length
    && metrics.length === profiles.length
    && new Set(metrics.map(entry => entry.Profile ?? entry.profile)).size === profiles.length
    && metrics.every(entry => {
      const frames = entry.TotalFrames ?? entry.totalFrames;
      const jank = entry.JankyPercent ?? entry.jankyPercent;
      return profiles.includes(entry.Profile ?? entry.profile)
        && typeof frames === 'number' && Number.isFinite(frames) && frames >= policy.minimumFramesPerProfile
        && typeof jank === 'number' && Number.isFinite(jank) && jank >= 0 && jank <= policy.maximumJankyPercent;
    });
}
module.exports = { validAndroidMatrix };
// #endregion
