import { cacheGet, cacheKey, cacheSet } from "./cache";
import { CostLedger, estimateUsd } from "./cost";
import { ACTIVE_MODEL } from "./model";
import type { AiCallType } from "./types";

export interface AiOutcome<T> {
  /** null whenever the caller must use its deterministic fallback. */
  data: T | null;
  reason: string | null;
  cached: boolean;
}

export interface AiClientOptions {
  ledger: CostLedger;
  /** Called for every attempt, so the system log can show what left the browser. */
  onCall?: (entry: AiCallRecord) => void;
}

export interface AiCallRecord {
  callType: AiCallType;
  ok: boolean;
  cached: boolean;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  detail: string;
}

interface RouteResponse {
  ok: boolean;
  data?: unknown;
  reason?: string;
  inputTokens?: number;
  outputTokens?: number;
  ms?: number;
}

/**
 * Single door to the AI. Resolves the cache first, refuses once the ceiling is reached,
 * and returns `data: null` on any failure rather than throwing at the caller.
 */
export async function askAi<T>(
  callType: AiCallType,
  input: unknown,
  { ledger, onCall }: AiClientOptions,
): Promise<AiOutcome<T>> {
  const free = { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };

  const key = await cacheKey(callType, ACTIVE_MODEL, input);
  const hit = cacheGet(key);
  if (hit !== undefined) {
    onCall?.({ callType, ok: true, cached: true, ms: 0, ...free, detail: "Served from cache." });
    return { data: hit as T, reason: null, cached: true };
  }

  if (ledger.exhausted) {
    const reason = `Session cost ceiling of $${ledger.ceilingUsd.toFixed(2)} reached.`;
    onCall?.({ callType, ok: false, cached: false, ms: 0, ...free, detail: reason });
    return { data: null, reason, cached: false };
  }

  const started = Date.now();
  let body: RouteResponse;
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callType, user: JSON.stringify(input) }),
    });
    body = (await res.json()) as RouteResponse;
  } catch (err) {
    const reason = `Could not reach the AI service: ${err instanceof Error ? err.message : String(err)}`;
    const ms = Date.now() - started;
    onCall?.({ callType, ok: false, cached: false, ms, ...free, detail: reason });
    return { data: null, reason, cached: false };
  }

  const ms = body.ms ?? Date.now() - started;
  const inputTokens = body.inputTokens ?? 0;
  const outputTokens = body.outputTokens ?? 0;
  const estimatedUsd = estimateUsd(inputTokens, outputTokens);
  const spend = { inputTokens, outputTokens, estimatedUsd };
  ledger.record({
    at: new Date().toISOString(),
    callType,
    model: ACTIVE_MODEL,
    ...spend,
    cached: false,
    ms,
  });

  if (!body.ok || body.data === undefined) {
    const reason = body.reason ?? "The AI returned nothing usable.";
    onCall?.({ callType, ok: false, cached: false, ms, ...spend, detail: reason });
    return { data: null, reason, cached: false };
  }

  cacheSet(key, body.data);
  onCall?.({
    callType,
    ok: true,
    cached: false,
    ms,
    ...spend,
    detail: `${inputTokens} in / ${outputTokens} out tokens.`,
  });
  return { data: body.data as T, reason: null, cached: false };
}
