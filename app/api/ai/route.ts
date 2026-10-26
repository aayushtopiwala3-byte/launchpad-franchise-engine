import { z } from "zod";
import { callGemini } from "../../../lib/ai/gemini";
import {
  CHAT_SCHEMA,
  CHAT_SYSTEM,
  CLASSIFY_SCHEMA,
  CLASSIFY_SYSTEM,
  CONTRADICTIONS_SCHEMA,
  CONTRADICTIONS_SYSTEM,
  POLISH_SCHEMA,
  POLISH_SYSTEM,
} from "../../../lib/ai/prompts";
import {
  ChatRouteSchema,
  ClassifySchema,
  ContradictionsSchema,
  PolishSchema,
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
} as const;

const RequestSchema = z.object({
  callType: z.enum(["classify", "contradictions", "chat", "polish"]),
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
  });

  return Response.json({ ...result, ms: Date.now() - started });
}
