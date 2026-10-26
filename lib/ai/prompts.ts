import { CONTRADICTION_FIELDS } from "./types";

const STR = { type: "STRING" };
const NULLABLE_STR = { type: "STRING", nullable: true };

export const CLASSIFY_SYSTEM = `You label what kind of business a franchise applicant already runs.
Use only the text you are given. Never infer from a name, a city or a pin code.
"retail_owner" means they own or run a shop, store, showroom or retail chain.
"customer_facing_adjacent" means a customer-facing business that is not retail, such as a salon, restaurant or service centre.
"unrelated_or_none" covers everything else, including an empty description.
evidence_quote must be copied verbatim from the input, or null if nothing supports the label.`;

export const CLASSIFY_SCHEMA = {
  type: "OBJECT",
  properties: {
    category: {
      type: "STRING",
      enum: ["retail_owner", "customer_facing_adjacent", "unrelated_or_none"],
    },
    evidence_quote: NULLABLE_STR,
    confidence: { type: "NUMBER" },
  },
  required: ["category", "evidence_quote", "confidence"],
};

export const CONTRADICTIONS_SYSTEM = `You find places where an applicant's free-text notes contradict their structured form fields.
Report a contradiction only when the notes plainly state something that cannot be true alongside the field.
quote must be copied verbatim from the notes. Do not guess, do not infer, and return an empty list when nothing contradicts.
Never comment on spelling, tone or plausibility — only direct contradictions.`;

export const CONTRADICTIONS_SCHEMA = {
  type: "OBJECT",
  properties: {
    contradictions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          field: { type: "STRING", enum: [...CONTRADICTION_FIELDS] },
          quote: STR,
          explanation: STR,
        },
        required: ["field", "quote", "explanation"],
      },
    },
  },
  required: ["contradictions"],
};

export const CHAT_SYSTEM = `You route a franchise manager's question. You do not answer it and you never decide anything.
Extract the intent, any Application IDs (APP-001 style) and Territory IDs (TER-01 style) mentioned.
Use "update" only when the manager states a new fact about an application, and then fill patches.
A patch field must be one of: spaceAvailable, spaceSizeSqft, floor, investmentLakh, targetLaunchMonths, pinCode, currentBusiness, city.
sourceQuote must be copied verbatim from the manager's message. Leave oldValue null if the message does not state it.
Use "unknown" when you cannot tell. Returning "unknown" is always better than guessing.`;

export const CHAT_SCHEMA = {
  type: "OBJECT",
  properties: {
    intent: {
      type: "STRING",
      enum: ["explain", "status", "competitors", "capacity", "counts", "update", "unknown"],
    },
    applicationIds: { type: "ARRAY", items: STR },
    territoryIds: { type: "ARRAY", items: STR },
    patches: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          applicationId: STR,
          field: STR,
          oldValue: NULLABLE_STR,
          newValue: STR,
          sourceQuote: STR,
        },
        required: ["applicationId", "field", "oldValue", "newValue", "sourceQuote"],
      },
    },
  },
  required: ["intent", "applicationIds", "territoryIds", "patches"],
};

export const POLISH_SYSTEM = `You smooth the wording of a message that has already been written and approved.
You may adjust grammar, flow and politeness only.
You must not add, remove or alter any fact, number, date, pin code, ID, status or name.
You must not add new information, advice or pleasantries that imply a commitment.
Keep the same language as the input. Return the rewritten message and nothing else.`;

export const POLISH_SCHEMA = {
  type: "OBJECT",
  properties: { text: STR },
  required: ["text"],
};
