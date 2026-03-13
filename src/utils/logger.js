const LEVELS = ['error', 'warn', 'info', 'debug'];

function resolveLogLevel() {
  const { LOG_LEVEL, DEBUG } = process.env;
  if (LOG_LEVEL && LEVELS.includes(LOG_LEVEL.toLowerCase())) {
    return LOG_LEVEL.toLowerCase();
  }
  if (DEBUG && DEBUG !== '0' && DEBUG.toLowerCase() !== 'false') {
    return 'debug';
  }
  return 'info';
}

function shouldLog(targetLevel, activeLevel) {
  return LEVELS.indexOf(targetLevel) <= LEVELS.indexOf(activeLevel);
}

function resolveConsoleMethod(level) {
  // Always emit structured logs to stderr so we never pollute stdout
  // when running inside stdio transports (e.g., MCP servers).
  // console.error writes to stderr in Node across every level.
  if (typeof console !== 'undefined' && console.error) {
    return console.error;
  }
  return console.log; // Fallback, though this should rarely happen.
}

function structuredLog(level, message, meta) {
  const payload = {
    level,
    message,
    ...meta
  };
  const method = resolveConsoleMethod(level);
  method(JSON.stringify(payload));
}

export class Logger {
  constructor(context) {
    this.context = context;
    this.level = resolveLogLevel();
  }

  log(level, message, meta = {}) {
    if (!shouldLog(level, this.level)) return;
    const details = { ...meta };
    if (details.error instanceof Error) {
      details.error = {
        name: details.error.name,
        message: details.error.message,
        stack: details.error.stack
      };
    }
    const base = this.context ? { context: this.context } : {};
    structuredLog(level, message, { ...base, ...details });
  }

  error(message, meta) {
    this.log('error', message, meta);
  }

  warn(message, meta) {
    this.log('warn', message, meta);
  }

  info(message, meta) {
    this.log('info', message, meta);
  }

  debug(message, meta) {
    this.log('debug', message, meta);
  }
}

export function createLogger(context) {
  return new Logger(context);
}