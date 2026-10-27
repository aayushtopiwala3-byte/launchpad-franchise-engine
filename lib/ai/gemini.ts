import type { ZodType } from "zod";
import { ACTIVE_MODEL, MODEL_FALLBACKS, assertFlashModel } from "./model";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Enough for a label or a routing decision, which is all the original four calls ask for.
 * The calls that write prose need considerably longer — see `timeoutMs` below.
 */
const DEFAULT_TIMEOUT_MS = 8000;

export interface GeminiCall<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  /** Gemini's own JSON schema, so the model is constrained rather than merely asked. */
  responseSchema: Record<string, unknown>;
  /**
   * How long to wait. A one-word classification and a ten-field written brief are not the
   * same job, and holding both to one deadline means the longer one fails for no reason
   * other than that it is longer.
   */
  timeoutMs?: number;
}

export interface GeminiSuccess<T> {
  ok: true;
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  attempts: number;
}

export interface GeminiFailure {
  ok: false;
  reason: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  attempts: number;
}

export type GeminiResult<T> = GeminiSuccess<T> | GeminiFailure;

interface RawResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

async function once(
  model: string,
  apiKey: string,
  system: string,
  user: string,
  responseSchema: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0,
          // Explanation and routing are mechanical. Thinking would only add cost and latency.
          thinkingConfig: { thinkingLevel: "low" },
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    });
    const body = (await res.json()) as RawResponse;
    if (!res.ok || body.error) {
      throw new Error(body.error?.message ?? `HTTP ${res.status}`);
    }
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return {
      text,
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One call, then one retry with the validation error appended. Never throws — a caller
 * that cannot get valid JSON is expected to use its deterministic fallback instead.
 */
export async function callGemini<T>(
  apiKey: string,
  call: GeminiCall<T>,
): Promise<GeminiResult<T>> {
  const models = [ACTIVE_MODEL, ...MODEL_FALLBACKS];
  const timeoutMs = call.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let inputTokens = 0;
  let outputTokens = 0;
  let attempts = 0;
  let model = ACTIVE_MODEL;
  // Every model's own reason, so a dead fallback cannot mask why the primary one failed.
  const reasons: string[] = [];

  for (const candidate of models) {
    model = assertFlashModel(candidate);
    let user = call.user;
    let lastReason = "No attempt was made.";

    for (let attempt = 0; attempt < 2; attempt++) {
      attempts++;
      try {
        const raw = await once(model, apiKey, call.system, user, call.responseSchema, timeoutMs);
        inputTokens += raw.inputTokens;
        outputTokens += raw.outputTokens;

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.text);
        } catch {
          lastReason = `Model did not return JSON: ${raw.text.slice(0, 160)}`;
          user = `${call.user}\n\nYour previous reply was not valid JSON. Reply with JSON only.`;
          continue;
        }

        const result = call.schema.safeParse(parsed);
        if (result.success) {
          return { ok: true, data: result.data, model, inputTokens, outputTokens, attempts };
        }
        lastReason = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        user = `${call.user}\n\nYour previous reply failed validation: ${lastReason}\nReturn JSON matching the schema exactly.`;
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        lastReason = aborted ? `Timed out after ${timeoutMs} ms.` : String(err);
        // A timeout or transport error will not be fixed by rewording the prompt.
        break;
      }
    }

    reasons.push(`${model}: ${lastReason}`);
  }

  return { ok: false, reason: reasons.join(" | "), model, inputTokens, outputTokens, attempts };
}
