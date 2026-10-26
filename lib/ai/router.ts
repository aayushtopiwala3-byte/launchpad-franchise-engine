import type { Applicant, Patch, PipelineResult, Status } from "../types";

export type ChatIntent =
  | "explain"
  | "status"
  | "competitors"
  | "capacity"
  | "counts"
  | "update"
  | "no-change"
  | "unknown";

export interface RoutedQuestion {
  intent: ChatIntent;
  applicationIds: string[];
  territoryIds: string[];
  patches: Patch[];
  /** Facts the manager stated that the file already records, so chat can say so. */
  unchanged: Patch[];
  /** True when the regex router matched, so no AI call is needed. */
  deterministic: boolean;
}

const APP_ID = /\bAPP-\d+\b/gi;
const TER_ID = /\bTER-\d+\b/gi;

const ids = (text: string, re: RegExp): string[] => [
  ...new Set((text.match(re) ?? []).map((s) => s.toUpperCase())),
];

const STATUS_WORDS: Record<string, Status> = {
  approved: "APPROVED",
  waitlisted: "WAITLISTED",
  "on hold": "ON HOLD",
  redirected: "REDIRECTED",
  "not proceeding": "NOT PROCEEDING",
};

/** Field names a chat update may set, mapped from the words a manager actually types. */
const UPDATE_FIELDS: { re: RegExp; field: string; unit?: string }[] = [
  { re: /\b(investment|budget|capital|funding)\b/i, field: "investmentLakh" },
  { re: /\b(space|shop|site|premises|property)\b/i, field: "spaceAvailable" },
  { re: /\b(sq\s?ft|square feet|size|area)\b/i, field: "spaceSizeSqft" },
  { re: /\b(floor)\b/i, field: "floor" },
  { re: /\b(launch|open|opening|timeline)\b/i, field: "targetLaunchMonths" },
  { re: /\b(pin\s?code|pin)\b/i, field: "pinCode" },
];

const UPDATE_VERB =
  /\b(found|secured|got|signed|increased|raised|will have|now has|has now|moved to|changed to)\b/i;

/**
 * The spec's rule: the deterministic router runs first and the AI only sees what it
 * cannot match. Every branch here is a question we can answer from the result alone.
 */
export function routeQuestion(question: string, result: PipelineResult): RoutedQuestion {
  const q = question.trim();
  const appIds = ids(q, APP_ID);
  const terIds = ids(q, TER_ID);
  const base = {
    applicationIds: appIds,
    territoryIds: terIds,
    patches: [],
    unchanged: [],
    deterministic: true,
  };

  if (UPDATE_VERB.test(q) && appIds.length > 0) {
    const { applied, unchanged } = extractPatches(q, appIds, result);
    if (applied.length > 0) return { ...base, intent: "update", patches: applied };
    if (unchanged.length > 0) return { ...base, intent: "no-change", unchanged };
  }

  if (appIds.length > 0) {
    if (/\bwhy\b/i.test(q)) return { ...base, intent: "explain" };
    if (/\bstatus\b/i.test(q)) return { ...base, intent: "status" };
    if (/what(?:'s| is| has)?\s+happening\s+(?:with|to)\b/i.test(q)) {
      return { ...base, intent: "status" };
    }
    if (/\bwho else\b|\bcompetitor|\bagainst\b|\blost (?:out )?to\b/i.test(q)) {
      return { ...base, intent: "competitors" };
    }
  }

  if (terIds.length > 0 && /\bwho else\b|\bwanted\b|\bapplied\b|\bcompetitor/i.test(q)) {
    return { ...base, intent: "competitors" };
  }

  if (/which territor(?:y|ies).*(?:free|open|spare|empty|available)/i.test(q)) {
    return { ...base, intent: "capacity" };
  }
  if (/\b(free|open|spare|empty)\s+slots?\b/i.test(q)) return { ...base, intent: "capacity" };

  if (/\bhow many\b/i.test(q) && Object.keys(STATUS_WORDS).some((w) => q.toLowerCase().includes(w))) {
    return { ...base, intent: "counts" };
  }
  if (/\bhow many\b.*\b(applicant|application)/i.test(q)) return { ...base, intent: "counts" };

  return { ...base, intent: "unknown", deterministic: false };
}

function extractPatches(q: string, appIds: string[], result: PipelineResult): GroundedPatches {
  const applicationId = appIds[0];

  // One statement may carry several facts ("a shop on the ground floor"), so every
  // field the manager touched gets its own patch rather than only the first.
  const stated = UPDATE_FIELDS.filter((f) => f.re.test(q)).flatMap(({ field }) => {
    const newValue = readNewValue(q, field);
    return newValue === null
      ? []
      : [{ applicationId, field, oldValue: null, newValue, sourceQuote: q }];
  });

  return ground(stated, result);
}

const PATCHABLE = new Set(UPDATE_FIELDS.map((f) => f.field));

function oldValueOf(applicant: Applicant, field: string): string | null {
  const raw = applicant.raw[field as keyof typeof applicant.raw];
  return raw === undefined || raw === "" ? null : String(raw);
}

/** True when the file already says this, however differently the cell was worded. */
function isNoOp(applicant: Applicant, field: string, newValue: string): boolean {
  const current = applicant.normalised[field as keyof typeof applicant.normalised];
  return current !== null && current !== undefined && String(current) === newValue;
}

export interface GroundedPatches {
  applied: Patch[];
  /** Readable facts the file already records. Not changes, but worth saying out loud. */
  unchanged: Patch[];
}

/**
 * Whoever proposed a change — the regex router or the AI — may not say what the file
 * currently holds, nor write a value in its own words. Old values are re-read from the
 * dataset and new ones go through the one reader, so both paths are held to the same rule.
 */
export function ground(patches: Patch[], result: PipelineResult): GroundedPatches {
  const applied: Patch[] = [];
  const unchanged: Patch[] = [];

  for (const p of patches) {
    const applicationId = p.applicationId.toUpperCase();
    const applicant = result.applicants.find((a) => a.applicationId === applicationId);
    if (!applicant || !PATCHABLE.has(p.field) || !p.newValue) continue;

    const newValue = readNewValue(p.newValue, p.field);
    if (newValue === null) continue;

    const grounded = {
      applicationId,
      field: p.field,
      oldValue: oldValueOf(applicant, p.field),
      newValue,
      sourceQuote: p.sourceQuote,
    };
    (isNoOp(applicant, p.field, newValue) ? unchanged : applied).push(grounded);
  }

  return { applied, unchanged };
}

export const groundPatches = (patches: Patch[], result: PipelineResult): Patch[] =>
  ground(patches, result).applied;

/** Only reads values the manager actually typed. Returns null rather than inventing one. */
function readNewValue(question: string, field: string): string | null {
  // "APP-020" must never be read as the number 20.
  const q = question.replace(/\b[A-Z]{2,}-\d+\b/gi, " ");

  if (field === "spaceAvailable") {
    if (/\b(rented|rent|lease|leased)\b/i.test(q)) return "Rented";
    if (/\b(owned|own|purchased|bought)\b/i.test(q)) return "Owned";
    if (/\b(found|secured|signed|got)\b/i.test(q)) return "Rented";
    return null;
  }
  // Only the floors the normaliser recognises, so a patch means the same thing to the
  // engine as it does on screen. Anything else is left unread rather than guessed at.
  if (field === "floor") {
    if (/\bground\b/i.test(q)) return "Ground";
    if (/\bmall\b/i.test(q)) return "Mall unit";
    if (/\b(first|1st|upper|second|2nd)\b/i.test(q)) return "Upper";
    return null;
  }
  if (field === "pinCode") {
    const pin = q.match(/\b(\d{6})\b/);
    return pin ? pin[1] : null;
  }

  const number = q.match(/\b(\d+(?:\.\d+)?)\b/);
  return number ? number[1] : null;
}

export { STATUS_WORDS };
