import type { Status } from "../types";

/** Every field is already formatted for display. Null means "not stated" and is never guessed. */
export interface MessageVars {
  brandName: string;
  name: string;
  city: string;
  pin: string | null;
  suggestedPins: string[];
  launchDate: string | null;
  reservedUntil: string | null;
  unlockCondition: string | null;
  trainingStore: string | null;
  trainingWeeks: number | null;
}

export type MessageBuilder = (status: Status, v: MessageVars) => string;

/** Collapses the gaps left by any null variable so no message ever reads "undefined". */
export function tidy(parts: (string | null | false)[]): string {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
