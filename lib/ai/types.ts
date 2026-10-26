import { z } from "zod";

export type AiCallType = "classify" | "contradictions" | "chat" | "polish";

export const ClassifySchema = z.object({
  category: z.enum(["retail_owner", "customer_facing_adjacent", "unrelated_or_none"]),
  evidence_quote: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const CONTRADICTION_FIELDS = [
  "City",
  "Space available",
  "Floor",
  "Space size",
  "Investment",
  "Target launch",
] as const;

export const ContradictionsSchema = z.object({
  contradictions: z.array(
    z.object({
      field: z.enum(CONTRADICTION_FIELDS),
      quote: z.string(),
      explanation: z.string(),
    }),
  ),
});

export const ChatRouteSchema = z.object({
  intent: z.enum([
    "explain",
    "status",
    "competitors",
    "capacity",
    "counts",
    "update",
    "unknown",
  ]),
  applicationIds: z.array(z.string()),
  territoryIds: z.array(z.string()),
  patches: z.array(
    z.object({
      applicationId: z.string(),
      field: z.string(),
      oldValue: z.string().nullable(),
      newValue: z.string(),
      sourceQuote: z.string(),
    }),
  ),
});

export const PolishSchema = z.object({ text: z.string() });

export type ClassifyPayload = z.infer<typeof ClassifySchema>;
export type ContradictionsPayload = z.infer<typeof ContradictionsSchema>;
export type ChatRoutePayload = z.infer<typeof ChatRouteSchema>;
export type PolishPayload = z.infer<typeof PolishSchema>;
