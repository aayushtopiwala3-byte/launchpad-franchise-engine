import type {
  FeatureFlags,
  Feedback,
  Override,
  PendingUpdate,
  PolicyProfile,
  Version,
} from "../types";

const KEY = "launchpad.v1";

/**
 * Only the things a reload should survive. The pipeline result is deliberately
 * absent: it is derived, it is large, and re-running it from the raw rows is both
 * fast and the only way to guarantee the stored view matches the current rules.
 */
export interface PersistedState {
  schemaVersion: 1;
  rawInput: unknown | null;
  asOfDate: string | null;
  datasetLabel: string | null;
  policy: PolicyProfile | null;
  profiles: PolicyProfile[];
  flags: FeatureFlags | null;
  feedback: Feedback[];
  overrides: Override[];
  pendingUpdates: PendingUpdate[];
  includeExampleRow: boolean;
  /**
   * Unlike the result, history is not derivable: a past snapshot records what the
   * decisions were under inputs that no longer exist. Losing it to a reload would let a
   * verdict change quietly, which is the one thing the timeline exists to prevent.
   */
  versions: Version[];
}

export interface LoadOutcome {
  state: PersistedState | null;
  /** Set when storage held something unreadable; the UI offers this as a download. */
  corruptPayload: string | null;
  available: boolean;
}

export function isSafeMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("safe") === "1";
}

export function load(): LoadOutcome {
  if (typeof window === "undefined") return { state: null, corruptPayload: null, available: false };
  if (isSafeMode()) return { state: null, corruptPayload: null, available: false };

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Private browsing and blocked-cookie modes throw on access, not on write.
    return { state: null, corruptPayload: null, available: false };
  }
  if (raw === null) return { state: null, corruptPayload: null, available: true };

  try {
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed?.schemaVersion !== 1) {
      return { state: null, corruptPayload: raw, available: true };
    }
    return { state: parsed, corruptPayload: null, available: true };
  } catch {
    return { state: null, corruptPayload: raw, available: true };
  }
}

export function save(state: PersistedState): { ok: boolean; error: string | null } {
  if (typeof window === "undefined") return { ok: false, error: "No window." };
  if (isSafeMode()) return { ok: false, error: "Safe mode — persistence is off." };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    return { ok: true, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message.includes("quota") ? "Storage is full." : message };
  }
}

export function clear(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do: if removal is blocked the next load will fail closed anyway.
  }
}

export function downloadRecovery(payload: string, fileName = "launchpad-recovered-state.json"): void {
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
