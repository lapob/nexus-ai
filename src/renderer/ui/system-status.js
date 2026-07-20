const VALID_SYSTEM = new Set(['initializing', 'ready', 'degraded', 'error', 'offline']);
const VALID_ACTIVITY = new Set(['idle', 'indexing', 'thinking', 'searching', 'executing']);

export class SystemStatus {
  constructor(shell, statusElement, activityElement) {
    this.shell = shell; this.statusElement = statusElement; this.activityElement = activityElement;
    this.system = 'initializing'; this.activity = 'idle'; this.render();
  }
  setSystem(state, detail = '') { if (!VALID_SYSTEM.has(state)) throw new Error(`Invalid system state: ${state}`); this.system = state; this.detail = detail; this.render(); }
  setActivity(activity) { if (!VALID_ACTIVITY.has(activity)) throw new Error(`Invalid activity: ${activity}`); this.activity = activity; this.render(); }
  render() {
    this.shell.dataset.systemState = this.system; this.shell.dataset.activity = this.activity;
    this.statusElement.textContent = this.system.toUpperCase();
    this.statusElement.title = this.detail || this.system;
    this.activityElement.textContent = this.activity === 'idle' ? 'LOCAL WORKSPACE' : this.activity.toUpperCase();
  }
}
