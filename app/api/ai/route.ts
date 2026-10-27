import { z } from "zod";
import { callGemini } from "../../../lib/ai/gemini";
import {
  BRIEF_SCHEMA,
  BRIEF_SYSTEM,
  CHAT_SCHEMA,
  CHAT_SYSTEM,
  CLASSIFY_SCHEMA,
  CLASSIFY_SYSTEM,
  CONTRADICTIONS_SCHEMA,
  CONTRADICTIONS_SYSTEM,
  OUTREACH_SCHEMA,
  OUTREACH_SYSTEM,
  OWNER_ASSIST_SCHEMA,
  OWNER_ASSIST_SYSTEM,
  POLISH_SCHEMA,
  POLISH_SYSTEM,
  QUALIFY_SCHEMA,
  QUALIFY_SYSTEM,
} from "../../../lib/ai/prompts";
import {
  AI_CALL_TYPES,
  type AiCallType,
  BriefSchema,
  ChatRouteSchema,
  ClassifySchema,
  ContradictionsSchema,
  OutreachSchema,
  OwnerAssistSchema,
  PolishSchema,
  QualifySchema,
} from "../../../lib/ai/types";

const CALLS = {
  classify: { system: CLASSIFY_SYSTEM, responseSchema: CLASSIFY_SCHEMA, schema: ClassifySchema },
  contradictions: {
    system: CONTRADICTIONS_SYSTEM,
    responseSchema: CONTRADICTIONS_SCHEMA,
    schema: ContradictionsSchema,
  },
  chat: { system: CHAT_SYSTEM, responseSchema: CHAT_SCHEMA, schema: ChatRouteSchema },
  polish: { system: POLISH_SYSTEM, responseSchema: POLISH_SCHEMA, schema: PolishSchema },
  brief: { system: BRIEF_SYSTEM, responseSchema: BRIEF_SCHEMA, schema: BriefSchema },
  qualify: { system: QUALIFY_SYSTEM, responseSchema: QUALIFY_SCHEMA, schema: QualifySchema },
  outreach: { system: OUTREACH_SYSTEM, responseSchema: OUTREACH_SCHEMA, schema: OutreachSchema },
  ownerAssist: {
    system: OWNER_ASSIST_SYSTEM,
    responseSchema: OWNER_ASSIST_SCHEMA,
    schema: OwnerAssistSchema,
  },
} as const;

/**
 * The original four return a label, a short list or one rewritten sentence, and 8 seconds is
 * generous for that. The four added later write a multi-field brief or a whole message; held
 * to the same deadline they time out for no reason except length, and the user is told the
 * AI is unavailable when in fact it was answering.
 */
const SLOW_CALLS = new Set<AiCallType>(["brief", "qualify", "outreach", "ownerAssist"]);
const SLOW_TIMEOUT_MS = 25_000;

const RequestSchema = z.object({
  callType: z.enum(AI_CALL_TYPES),
  user: z.string().min(1).max(20_000),
});

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, reason: "No GEMINI_API_KEY is configured on the server." },
      { status: 503 },
    );
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, reason: "Malformed AI request." }, { status: 400 });
  }

  const { callType, user } = parsed.data;
  const call = CALLS[callType];
  const started = Date.now();
  const result = await callGemini(apiKey, {
    system: call.system,
    user,
    schema: call.schema as never,
    responseSchema: call.responseSchema as Record<string, unknown>,
    timeoutMs: SLOW_CALLS.has(callType) ? SLOW_TIMEOUT_MS : undefined,
  });

  return Response.json({ ...result, ms: Date.now() - started });
}
