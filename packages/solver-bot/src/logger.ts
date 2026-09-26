export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

/**
 * Creates a JSON-line logger.
 *
 * Every entry is a single line of JSON so the daemon can be piped straight
 * into a log collector without any parsing configuration.
 */
export function createLogger(
  level: LogLevel = "info",
  bindings: Record<string, unknown> = {},
  sink: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger {
  const threshold = LEVEL_RANK[level];

  const emit =
    (entryLevel: LogLevel) =>
    (message: string, meta?: Record<string, unknown>): void => {
      if (LEVEL_RANK[entryLevel] < threshold) {
        return;
      }
      sink(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: entryLevel,
          msg: message,
          ...bindings,
          ...meta,
        }),
      );
    };

  return {
    debug: emit("debug"),
    info: emit("info"),
    warn: emit("warn"),
    error: emit("error"),
    child: (childBindings) => createLogger(level, { ...bindings, ...childBindings }, sink),
  };
}

/** Parses a log level from an environment value, defaulting to `info`. */
export function parseLogLevel(value: string | undefined): LogLevel {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn") {
    return normalized;
  }
  return normalized === "error" ? "error" : "info";
}
