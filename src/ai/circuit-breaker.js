/**
 * @module ai/circuit-breaker
 * @description Isola temporaneamente endpoint AI instabili e consente una singola prova di recupero.
 */
class CircuitBreaker {
  constructor({ failureThreshold = 3, resetAfterMs = 15_000, now = () => Date.now() } = {}) {
    this.failureThreshold = Math.max(1, failureThreshold);
    this.resetAfterMs = Math.max(100, resetAfterMs);
    this.now = now;
    this.failures = 0;
    this.openedAt = 0;
    this.probing = false;
  }

  permit() {
    if (!this.openedAt) return true;
    if (this.now() - this.openedAt < this.resetAfterMs || this.probing) return false;
    this.probing = true;
    return true;
  }

  success() { this.failures = 0; this.openedAt = 0; this.probing = false; }

  failure() {
    this.probing = false;
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.openedAt = this.now();
  }

  status() {
    return { state: this.openedAt ? (this.probing ? 'half-open' : 'open') : 'closed', failures: this.failures, retryAt: this.openedAt ? this.openedAt + this.resetAfterMs : 0 };
  }
}

module.exports = { CircuitBreaker };
