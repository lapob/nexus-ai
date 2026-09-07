export async function waitForDeployment(readVersion, previous, { attempts = 8, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const version = await readVersion();
    if (version && version !== previous) return version;
    if (attempt + 1 < attempts) await pause(3000);
  }
  throw new Error('Cloudflare has not confirmed a new active version; verify production before retrying deployment.');
}
