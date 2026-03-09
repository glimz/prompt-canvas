export type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, message: string, data: Record<string, unknown> = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...data
  };

  const text = JSON.stringify(line);
  if (level === "error") {
    console.error(text);
    return;
  }
  if (level === "warn") {
    console.warn(text);
    return;
  }
  console.log(text);
}

export function logInfo(message: string, data: Record<string, unknown> = {}) {
  log("info", message, data);
}

export function logWarn(message: string, data: Record<string, unknown> = {}) {
  log("warn", message, data);
}

export function logError(message: string, data: Record<string, unknown> = {}) {
  log("error", message, data);
}
