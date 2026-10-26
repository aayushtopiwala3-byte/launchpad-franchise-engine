import type { ZodType } from "zod";
import { ACTIVE_MODEL, MODEL_FALLBACKS, assertFlashModel } from "./model";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 8000;

export interface GeminiCall<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  /** Gemini's own JSON schema, so the model is constrained rather than merely asked. */
  responseSchema: Record<string, unknown>;
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
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
  let inputTokens = 0;
  let outputTokens = 0;
  let attempts = 0;
  let lastReason = "No attempt was made.";
  let model = ACTIVE_MODEL;

  for (const candidate of models) {
    model = assertFlashModel(candidate);
    let user = call.user;

    for (let attempt = 0; attempt < 2; attempt++) {
      attempts++;
      try {
        const raw = await once(model, apiKey, call.system, user, call.responseSchema);
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
        lastReason = aborted ? `Timed out after ${TIMEOUT_MS} ms.` : String(err);
        // A timeout or transport error will not be fixed by rewording the prompt.
        break;
      }
    }
  }

  return { ok: false, reason: lastReason, model, inputTokens, outputTokens, attempts };
}
