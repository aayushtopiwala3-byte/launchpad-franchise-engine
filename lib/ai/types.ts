import { z } from "zod";

export const AI_CALL_TYPES = [
  "classify",
  "contradictions",
  "chat",
  "polish",
  "brief",
  "qualify",
  "outreach",
  "ownerAssist",
] as const;

export type AiCallType = (typeof AI_CALL_TYPES)[number];

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

/**
 * The executive summary. It can describe the numbers it was handed and nothing else: there
 * is no field for a metric, a status or a decision, so a model that wants to invent one has
 * nowhere to put it. `notSupported` is where it must say what the data did not cover.
 */
export const BriefSchema = z.object({
  headline: z.string().min(1).max(300),
  paragraphs: z.array(z.string().max(1200)).min(1).max(4),
  watchPoints: z.array(z.string().max(400)).max(6),
  notSupported: z.array(z.string().max(400)).max(6),
});

/**
 * Lead qualification. Note what is absent: there is no verdict field, no score and no
 * boolean. The schema cannot express "this lead is qualified", so the model cannot say it —
 * moving a stage stays a human action and an application stays the engine's business.
 */
export const QualifySchema = z.object({
  summary: z.string().min(1).max(1500),
  observedFacts: z.array(z.object({ fact: z.string(), fromField: z.string() })).max(12),
  inferences: z.array(z.object({ inference: z.string(), basis: z.string() })).max(8),
  missingInformation: z.array(z.string()).max(10),
  suggestedQuestions: z.array(z.string()).max(8),
  strengths: z.array(z.string()).max(8),
  concerns: z.array(z.string()).max(8),
  factsToVerify: z.array(z.string()).max(8),
  nextActions: z.array(z.string()).max(8),
  outreachAngle: z.string().max(600),
});

/**
 * An outreach draft. `placeholders` is the honest escape hatch: anything the model would
 * otherwise have to invent — a date, a fee, a name it was not given — has to be named here
 * as a gap for the writer to fill rather than written into the body as though it were known.
 */
export const OutreachSchema = z.object({
  subject: z.string().max(200).nullable(),
  body: z.string().min(1).max(3000),
  placeholders: z.array(z.string().max(200)).max(10),
});

/**
 * The owner assistant. `cannotAnswer` exists so "I was not told" is a first-class outcome
 * rather than something the model has to improvise its way out of.
 */
export const OwnerAssistSchema = z.object({
  answer: z.string().min(1).max(2000),
  basedOn: z.array(z.string().max(300)).max(8),
  cannotAnswer: z.boolean(),
  escalateTo: z.string().max(300).nullable(),
});

export type ClassifyPayload = z.infer<typeof ClassifySchema>;
export type ContradictionsPayload = z.infer<typeof ContradictionsSchema>;
export type ChatRoutePayload = z.infer<typeof ChatRouteSchema>;
export type PolishPayload = z.infer<typeof PolishSchema>;
export type BriefPayload = z.infer<typeof BriefSchema>;
export type QualifyPayload = z.infer<typeof QualifySchema>;
export type OutreachPayload = z.infer<typeof OutreachSchema>;
export type OwnerAssistPayload = z.infer<typeof OwnerAssistSchema>;
