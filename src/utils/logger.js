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

function structuredLog(method, level, message, meta) {
  const payload = {
    level,
    message,
    ...meta
  };
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
    structuredLog(console[level] || console.log, level, message, { ...base, ...details });
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