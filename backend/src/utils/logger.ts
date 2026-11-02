type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogPayload {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: any;
}

function formatLog(level: LogLevel, message: string, meta: Record<string, any> = {}): string {
  const payload: LogPayload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta
  };
  return JSON.stringify(payload);
}

export const logger = {
  info(message: string, meta?: Record<string, any>): void {
    console.log(formatLog('info', message, meta));
  },
  warn(message: string, meta?: Record<string, any>): void {
    console.warn(formatLog('warn', message, meta));
  },
  error(message: string, meta?: Record<string, any>): void {
    console.error(formatLog('error', message, meta));
  },
  debug(message: string, meta?: Record<string, any>): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLog('debug', message, meta));
    }
  }
};
