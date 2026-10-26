import type { HealthState, SystemLogEntry } from "../types";

export const HEALTHY: HealthState = {
  parser: { level: "green", detail: "No file read yet." },
  rules: { level: "green", detail: "No dataset loaded yet." },
  ai: { level: "green", detail: "Not called yet." },
  storage: { level: "green", detail: "Not written yet." },
};

export const LAMP_LABELS: Record<keyof HealthState, string> = {
  parser: "Parser",
  rules: "Rules engine",
  ai: "AI",
  storage: "Storage",
};

export const LAMP_COLORS: Record<"green" | "amber" | "red", string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

export function logEntry(
  kind: SystemLogEntry["kind"],
  ok: boolean,
  message: string,
  detail?: string,
): SystemLogEntry {
  return { at: new Date().toISOString(), kind, ok, message, detail };
}

/** Newest first, and bounded — the log is a debugging aid, not a database. */
export const MAX_LOG_ENTRIES = 200;

export function appendLog(log: SystemLogEntry[], entry: SystemLogEntry): SystemLogEntry[] {
  return [entry, ...log].slice(0, MAX_LOG_ENTRIES);
}

export function worstLevel(health: HealthState): "green" | "amber" | "red" {
  const levels = Object.values(health).map((l) => l.level);
  if (levels.includes("red")) return "red";
  if (levels.includes("amber")) return "amber";
  return "green";
}
