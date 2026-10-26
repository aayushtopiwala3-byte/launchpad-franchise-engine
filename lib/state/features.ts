import type { FeatureFlags } from "../types";

/**
 * Order is load-bearing: it fixes each flag's bit position in the share URL, so a
 * link shared today still means the same thing tomorrow. Append, never reorder.
 */
export const FEATURE_KEYS = [
  "aiExplanations",
  "aiContradictionCheck",
  "counterfactuals",
  "partnerMessages",
  "partnerView",
  "explainMode",
  "autoApplyChatUpdates",
  "costCap",
] as const satisfies readonly (keyof FeatureFlags)[];

export const FEATURE_LABELS: Record<keyof FeatureFlags, { title: string; help: string }> = {
  aiExplanations: {
    title: "AI explanations",
    help: "Lets the AI rephrase a sentence the rules already wrote. Off means you read the rule-written sentence.",
  },
  aiContradictionCheck: {
    title: "AI contradiction check",
    help: "Reads the Notes column for statements that contradict the structured fields. Off falls back to keyword matching.",
  },
  counterfactuals: {
    title: "What would change this decision",
    help: "Re-runs the rules with one minimal change to show what would move the verdict.",
  },
  partnerMessages: {
    title: "Partner messages",
    help: "Drafts the message to send the applicant, in their preferred language.",
  },
  partnerView: {
    title: "Partner view links",
    help: "Login-free status page for each applicant.",
  },
  explainMode: {
    title: "Explain mode",
    help: "Shows rule IDs and raw values beside every number on screen.",
  },
  autoApplyChatUpdates: {
    title: "Auto-apply chat updates",
    help: "Applies a chat-proposed change immediately. Off asks you to confirm each one.",
  },
  costCap: {
    title: "AI cost cap",
    help: "Stops AI calls once the session passes the spend ceiling. Decisions are unaffected either way.",
  },
};

export const FEATURE_PRESETS: Record<string, FeatureFlags> = {
  Full: {
    aiExplanations: true,
    aiContradictionCheck: true,
    counterfactuals: true,
    partnerMessages: true,
    partnerView: true,
    explainMode: false,
    autoApplyChatUpdates: true,
    costCap: true,
  },
  "Judge demo": {
    aiExplanations: true,
    aiContradictionCheck: true,
    counterfactuals: true,
    partnerMessages: true,
    partnerView: true,
    explainMode: true,
    autoApplyChatUpdates: false,
    costCap: true,
  },
  "Safe mode": {
    aiExplanations: false,
    aiContradictionCheck: false,
    counterfactuals: true,
    partnerMessages: true,
    partnerView: true,
    explainMode: false,
    autoApplyChatUpdates: false,
    costCap: true,
  },
};

export const DEFAULT_FLAGS: FeatureFlags = FEATURE_PRESETS["Judge demo"];

function everyFlag(value: boolean): FeatureFlags {
  const out = {} as FeatureFlags;
  for (const key of FEATURE_KEYS) out[key] = value;
  return out;
}

export const ALL_ON: FeatureFlags = everyFlag(true);
export const ALL_OFF: FeatureFlags = everyFlag(false);

/** Flags as a base36 bitfield, short enough to paste into a message. */
export function encodeFlags(flags: FeatureFlags): string {
  let bits = 0;
  FEATURE_KEYS.forEach((key, i) => {
    if (flags[key]) bits |= 1 << i;
  });
  return bits.toString(36);
}

export function decodeFlags(encoded: string | null | undefined): FeatureFlags | null {
  if (!encoded) return null;
  const bits = Number.parseInt(encoded, 36);
  if (!Number.isInteger(bits) || bits < 0) return null;
  const out = {} as FeatureFlags;
  FEATURE_KEYS.forEach((key, i) => {
    out[key] = (bits & (1 << i)) !== 0;
  });
  return out;
}

export function countDifferences(a: FeatureFlags, b: FeatureFlags): number {
  return FEATURE_KEYS.filter((k) => a[k] !== b[k]).length;
}

export function presetNameFor(flags: FeatureFlags): string | null {
  for (const [name, preset] of Object.entries(FEATURE_PRESETS)) {
    if (countDifferences(flags, preset) === 0) return name;
  }
  return null;
}
