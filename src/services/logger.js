const LEVEL_WEIGHT = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });

function serializeError(error) {
  if (!(error instanceof Error)) return error;
  return { name: error.name, message: error.message, code: error.code };
}

function createLogger({ level = 'info', scope = 'nexus' } = {}) {
  const threshold = LEVEL_WEIGHT[level] ?? LEVEL_WEIGHT.info;
  function write(logLevel, message, context = {}) {
    if (LEVEL_WEIGHT[logLevel] > threshold) return;
    const record = {
      timestamp: new Date().toISOString(),
      level: logLevel,
      scope,
      message,
      ...Object.fromEntries(Object.entries(context).map(([key, value]) => [key, serializeError(value)]))
    };
    const output = JSON.stringify(record);
    if (logLevel === 'error') console.error(output);
    else if (logLevel === 'warn') console.warn(output);
    else console.log(output);
  }
  return Object.freeze({
    error: (message, context) => write('error', message, context),
    warn: (message, context) => write('warn', message, context),
    info: (message, context) => write('info', message, context),
    debug: (message, context) => write('debug', message, context),
    child: (childScope) => createLogger({ level, scope: `${scope}:${childScope}` })
  });
}

module.exports = { createLogger, serializeError };

