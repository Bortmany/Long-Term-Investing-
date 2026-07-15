// A tiny, dependency-free structured logger (engineering-standards §4).
//
// Every event is written as ONE JSON line: { level, time, message, context }.
// One line per event means any host's log viewer (Railway, etc.) can search
// and filter them without special parsing. Use this instead of scattered
// console.log calls.
//
// SECRETS ARE REDACTED: any context key whose NAME looks like a secret
// (token, password, api key, cookie, dsn, …) has its value replaced with
// "[redacted]" before anything is written. We match on the key name, so we
// never have to know the secret's value — a token can't leak into the logs.

type LogLevel = "debug" | "info" | "warn" | "error";

const SECRET_KEY_PATTERN =
  /(secret|token|password|passwd|api[-_]?key|apikey|authorization|cookie|dsn|session|credential)/i;

const REDACTED = "[redacted]";

/** Recursively replace secret-looking values by key name (bounded depth). */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redact(val, depth + 1);
  }
  return out;
}

function write(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const line = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? { context: redact(context) } : {}),
  };

  let serialized: string;
  try {
    serialized = JSON.stringify(line);
  } catch {
    // A circular or non-serializable context must never crash a request path.
    serialized = JSON.stringify({ level, time: line.time, message });
  }

  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) =>
    write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    write("error", message, context),
};
