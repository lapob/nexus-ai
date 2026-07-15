class NexusError extends Error {
  constructor(message, { code = 'NEXUS_ERROR', cause } = {}) {
    super(message, { cause });
    this.name = 'NexusError';
    this.code = code;
  }
}

module.exports = { NexusError };
