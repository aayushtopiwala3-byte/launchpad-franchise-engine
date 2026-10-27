/**
 * Resolved at build time against the Gemini ListModels endpoint: the newest stable
 * model whose name contains "flash". Re-resolve with `npm run resolve-model`.
 */
export const RESOLVED_MODEL = "gemini-3.8-flash";

/**
 * Ordered fallbacks, used only if the resolved model is rejected at runtime. Every entry
 * must be a model the key can still reach: a retired model here costs a wasted round-trip
 * on every failure and, worse, its "no longer available" error overwrites the real reason
 * the primary model failed.
 */
export const MODEL_FALLBACKS = ["gemini-3.7-flash", "gemini-2.5-flash"] as const;

/** A non-flash model would be slower and dearer than this product is allowed to be. */
export function assertFlashModel(model: string): string {
  if (!model.includes("flash")) {
    throw new Error(
      `Refusing to call "${model}": only flash models are allowed. Check lib/ai/model.ts.`,
    );
  }
  return model;
}

export const ACTIVE_MODEL = assertFlashModel(RESOLVED_MODEL);
