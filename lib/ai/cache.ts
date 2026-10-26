const STORAGE_KEY = "launchpad.ai-cache.v1";
const MAX_ENTRIES = 300;

/** Falls back to a synchronous digest where WebCrypto is unavailable (plain http, tests). */
export async function cacheKey(
  callType: string,
  model: string,
  input: unknown,
): Promise<string> {
  const payload = JSON.stringify({ callType, model, input });
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(payload);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761) >>> 0;
    h2 = Math.imul(h2 ^ c, 1597334677) >>> 0;
  }
  return (h1.toString(16) + h2.toString(16)).padStart(16, "0");
}

const memory = new Map<string, unknown>();

function readDisk(): Record<string, unknown> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
  } catch {
    // A corrupt cache is never worth an error — the worst case is one extra call.
    return {};
  }
}

export function cacheGet(key: string): unknown {
  if (memory.has(key)) return memory.get(key);
  const hit = readDisk()[key];
  if (hit !== undefined) memory.set(key, hit);
  return hit;
}

export function cacheSet(key: string, value: unknown): void {
  memory.set(key, value);
  if (typeof localStorage === "undefined") return;
  try {
    const disk = readDisk();
    disk[key] = value;
    const keys = Object.keys(disk);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete disk[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(disk));
  } catch {
    // Quota or private-mode failure. The in-memory cache still serves this session.
  }
}

export function cacheClear(): void {
  memory.clear();
  if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
}
