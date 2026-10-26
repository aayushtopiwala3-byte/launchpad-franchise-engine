import { z } from "zod";

/**
 * Every AI response is parsed through one of these before it is allowed near the engine.
 * A parse failure is not an error state: the caller falls back to the deterministic twin.
 */

export const classifySchema = z.object({
  category: z.enum(["retail_owner", "customer_facing_adjacent", "unrelated_or_none"]),
  evidence_quote: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type ClassifyResponse = z.infer<typeof classifySchema>;

export const CONTRADICTION_FIELDS = [
  "City",
  "Space available",
  "Floor",
  "Space size",
  "Investment",
  "Target launch",
] as const;

export const contradictionsSchema = z.object({
  contradictions: z.array(
    z.object({
      field: z.enum(CONTRADICTION_FIELDS),
      quote: z.string(),
      explanation: z.string(),
    }),
  ),
});
export type ContradictionsResponse = z.infer<typeof contradictionsSchema>;

export const CHAT_INTENTS = [
  "explain",
  "status",
  "competitors",
  "capacity",
  "counts",
  "update",
  "unknown",
] as const;

export const chatRouteSchema = z.object({
  intent: z.enum(CHAT_INTENTS),
  applicationIds: z.array(z.string()),
  territoryIds: z.array(z.string()),
  patches: z.array(
    z.object({
      applicationId: z.string(),
      field: z.string(),
      oldValue: z.string().nullable(),
      newValue: z.string().nullable(),
      sourceQuote: z.string(),
    }),
  ),
});
export type ChatRouteResponse = z.infer<typeof chatRouteSchema>;

export const polishSchema = z.object({ text: z.string() });

/** The shape the /api/ai proxy accepts. Anything else is a 400 before a token is spent. */
export const aiRequestSchema = z.object({
  callType: z.enum(["classify", "contradictions", "chat", "polish"]),
  prompt: z.string().min(1).max(20000),
  schemaName: z.enum(["classify", "contradictions", "chat", "polish"]),
});

export const SCHEMAS_BY_NAME = {
  classify: classifySchema,
  contradictions: contradictionsSchema,
  chat: chatRouteSchema,
  polish: polishSchema,
} as const;

/**
 * Persisted workspace state. Kept deliberately loose on the engine result, which is
 * recomputed from the raw rows on load rather than trusted from storage.
 */
export const persistedStateSchema = z.object({
  schemaVersion: z.literal(1),
  savedAt: z.string(),
  fileName: z.string().nullable(),
  asOfDate: z.string(),
  rawApplications: z.array(z.record(z.string(), z.unknown())),
  rawTerritories: z.array(z.record(z.string(), z.unknown())),
  uploadedStores: z.array(z.record(z.string(), z.unknown())),
  policyName: z.string(),
  policyOverrides: z.record(z.string(), z.unknown()).nullable(),
  features: z.record(z.string(), z.boolean()),
  overrides: z.array(
    z.object({
      applicationId: z.string(),
      fromStatus: z.string(),
      toStatus: z.string(),
      reason: z.string(),
      locked: z.boolean(),
      who: z.string(),
      when: z.string(),
    }),
  ),
  feedback: z.array(
    z.object({
      applicationId: z.string(),
      verdict: z.enum(["agree", "disagree"]),
      reason: z.string(),
      createdAt: z.string(),
    }),
  ),
  patches: z.array(
    z.object({
      applicationId: z.string(),
      field: z.string(),
      oldValue: z.string().nullable(),
      newValue: z.string().nullable(),
      sourceQuote: z.string(),
      appliedAt: z.string(),
    }),
  ),
});
export type PersistedState = z.infer<typeof persistedStateSchema>;
