/** @module security/remote-tool-policy Shared authority boundary for paired devices. */
const LOCAL_ONLY_TOOLS = new Set(['run_script', 'run_command', 'open_path', 'open_user_path']);

function remoteToolAllowed(tool) { return !LOCAL_ONLY_TOOLS.has(tool); }

function assertRemoteToolAllowed(tool, remote) {
  if (remote && !remoteToolAllowed(tool)) {
    throw Object.assign(new Error('Questo strumento richiede la sessione locale sul computer.'), {
      code: 'REMOTE_TOOL_FORBIDDEN', status: 403
    });
  }
}

module.exports = { remoteToolAllowed, assertRemoteToolAllowed };
