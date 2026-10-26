import { CITY_ALIASES } from "../reference";
import type {
  Floor,
  Language,
  NormalisationLogEntry,
  NormalisationRuleId,
  NormalisedApplication,
  NormalisedTerritory,
  Priority,
  RawApplicationRow,
  RawTerritoryRow,
  SpaceAvailable,
  Tier,
} from "../types";

export type SheetName = "Applications" | "Territories" | "Existing stores";

export class NormalisationLog {
  readonly entries: NormalisationLogEntry[] = [];

  record(
    ruleId: NormalisationRuleId,
    sheet: SheetName,
    row: number,
    column: string,
    from: string,
    to: string,
    subjectId: string,
  ) {
    // Only a real change is worth showing the operator.
    if (from.trim() === to) return;
    this.entries.push({ ruleId, sheet, row, column, from, to, subjectId });
  }
}

const blank = (v: unknown): boolean =>
  v === null || v === undefined || String(v).trim() === "";

export const text = (v: unknown): string | null => {
  if (blank(v)) return null;
  return String(v).replace(/\s+/g, " ").trim();
};

/**
 * N-01 Investment. Accepts 25, "25 lakh", "25L", "25 lacs", "25,00,000", "2500000", "Rs 25".
 * Any resulting number above 1,000 is read as rupees and divided by 1,00,000.
 */
export function normaliseInvestment(raw: unknown): number | null {
  if (blank(raw)) return null;
  const original = String(raw);
  const cleaned = original
    .replace(/[₹]/g, "")
    .replace(/\b(rs|inr|rupees?)\b/gi, "")
    .replace(/\b(lakhs?|lacs?|lakh)\b/gi, "")
    .replace(/(\d)\s*l\b/gi, "$1")
    .replace(/[,\s]/g, "");
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  let n = Number(match[0]);
  if (!Number.isFinite(n)) return null;
  if (n > 1000) n = n / 100000;
  return Math.round(n * 100) / 100;
}

/** N-02 Pin code. Strip everything that is not a digit. Must be exactly 6 digits. */
export function normalisePin(raw: unknown): { pin: string | null; digits: string } {
  if (blank(raw)) return { pin: null, digits: "" };
  const digits = String(raw).replace(/\D/g, "");
  return { pin: digits.length === 6 ? digits : null, digits };
}

/** N-03 Floor. */
export function normaliseFloor(raw: unknown): Floor | null {
  if (blank(raw)) return "Not known";
  const s = String(raw).toLowerCase();
  if (s.includes("ground")) return "Ground";
  if (s.includes("mall")) return "Mall unit";
  if (s.includes("upper") || s.includes("first") || s.includes("1st") || s.includes("second"))
    return "Upper";
  if (
    s.includes("not known") ||
    s.includes("unknown") ||
    s.trim() === "na" ||
    s.trim() === "n/a"
  )
    return "Not known";
  return "Not known";
}

/** N-04 Space available. */
export function normaliseSpace(raw: unknown): SpaceAvailable | null {
  if (blank(raw)) return null;
  const s = String(raw).toLowerCase();
  if (
    s.includes("not yet") ||
    s.includes("not identified") ||
    s.includes("searching") ||
    s.includes("looking")
  )
    return "Not yet identified";
  if (s.includes("own")) return "Owned";
  if (s.includes("rent")) return "Rented";
  return null;
}

const titleCase = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

/** N-05 City. Trim, collapse spaces, title-case, map aliases. */
export function normaliseCity(raw: unknown): string | null {
  if (blank(raw)) return null;
  const collapsed = String(raw).replace(/\s+/g, " ").trim();
  const key = collapsed.toLowerCase().replace(/[^a-z]/g, "");
  const alias = CITY_ALIASES[key];
  if (alias) return alias;
  return titleCase(collapsed);
}

/** N-06 Language. Blank defaults to English and is flagged as defaulted. */
export function normaliseLanguage(
  raw: unknown,
  fallback: Language = "English",
): { language: Language; defaulted: boolean } {
  if (blank(raw)) return { language: fallback, defaulted: true };
  const s = String(raw).toLowerCase();
  if (s.includes("kannada") || s.trim() === "kan") return { language: "Kannada", defaulted: false };
  if (s.includes("hindi")) return { language: "Hindi", defaulted: false };
  if (s.includes("english") || s.trim() === "eng") return { language: "English", defaulted: false };
  return { language: fallback, defaulted: true };
}

/** N-07 Numbers. Empty string becomes null, never 0. */
export function normaliseNumber(raw: unknown): number | null {
  if (blank(raw)) return null;
  const cleaned = String(raw)
    .replace(/\b(sq\.?\s?ft|sqft|square feet|sq feet)\b/gi, "")
    .replace(/\b(yrs?|years?|months?|mos?)\b/gi, "")
    .replace(/[,\s]/g, "");
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/** N-08 Tier. Tolerates "tier-2", "T2", "tier 2". */
export function normaliseTier(raw: unknown): Tier | null {
  if (blank(raw)) return null;
  const s = String(raw).toLowerCase().replace(/[^a-z0-9]/g, "");
  const m = s.match(/(?:tier|t)?([123])/);
  if (!m) return null;
  return `Tier ${m[1]}` as Tier;
}

/** N-08 Priority. */
export function normalisePriority(raw: unknown): Priority | null {
  if (blank(raw)) return null;
  const s = String(raw).toLowerCase();
  if (s.includes("high")) return "High";
  if (s.includes("med")) return "Medium";
  if (s.includes("low")) return "Low";
  return null;
}

/** N-09 Pin lists. Split on commas, semicolons, pipes, newlines and whitespace runs. */
export function normalisePinList(raw: unknown): { pins: string[]; dropped: string[] } {
  if (blank(raw)) return { pins: [], dropped: [] };
  const parts = String(raw)
    .split(/[,;|\n\r\t]+|\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const pins: string[] = [];
  const dropped: string[] = [];
  for (const p of parts) {
    const digits = p.replace(/\D/g, "");
    if (digits.length === 6) {
      if (!pins.includes(digits)) pins.push(digits);
    } else {
      dropped.push(p);
    }
  }
  return { pins, dropped };
}

export function normaliseApplicationRow(
  row: RawApplicationRow,
  log: NormalisationLog,
  defaultLanguage: Language,
): NormalisedApplication {
  const id = text(row.applicationId) ?? `row ${row.rowNumber}`;
  const rec = (
    ruleId: NormalisationRuleId,
    column: string,
    from: string,
    to: string | number | null,
  ) => log.record(ruleId, "Applications", row.rowNumber, column, from, to === null ? "" : String(to), id);

  const investmentLakh = normaliseInvestment(row.investmentLakh);
  rec("N-01", "Investment capacity (rupees lakh)", row.investmentLakh, investmentLakh);

  const { pin } = normalisePin(row.pinCode);
  rec("N-02", "Pin code", row.pinCode, pin);

  const floor = blank(row.floor) ? null : normaliseFloor(row.floor);
  rec("N-03", "Floor", row.floor, floor);

  const spaceAvailable = normaliseSpace(row.spaceAvailable);
  rec("N-04", "Space available", row.spaceAvailable, spaceAvailable);

  const city = normaliseCity(row.city);
  rec("N-05", "City", row.city, city);

  const { language, defaulted } = normaliseLanguage(row.preferredLanguage, defaultLanguage);
  if (defaulted && !blank(row.preferredLanguage)) {
    rec("N-06", "Preferred language", row.preferredLanguage, language);
  } else if (defaulted) {
    log.entries.push({
      ruleId: "N-06",
      sheet: "Applications",
      row: row.rowNumber,
      column: "Preferred language",
      from: "(blank)",
      to: `${language} (defaulted — displayed as "not stated")`,
      subjectId: id,
    });
  } else {
    rec("N-06", "Preferred language", row.preferredLanguage, language);
  }

  const spaceSizeSqft = normaliseNumber(row.spaceSizeSqft);
  rec("N-07", "Space size (sq ft)", row.spaceSizeSqft, spaceSizeSqft);

  const retailExperienceYears = normaliseNumber(row.retailExperienceYears);
  rec("N-07", "Retail experience (years)", row.retailExperienceYears, retailExperienceYears);

  const targetLaunchMonths = normaliseNumber(row.targetLaunchMonths);
  rec("N-07", "Target launch (months)", row.targetLaunchMonths, targetLaunchMonths);

  return {
    applicationId: text(row.applicationId) ?? "",
    applicantName: text(row.applicantName),
    city,
    state: normaliseCity(row.state),
    pinCode: pin,
    investmentLakh,
    retailExperienceYears,
    currentBusiness: text(row.currentBusiness),
    spaceAvailable,
    spaceSizeSqft,
    floor,
    targetLaunchMonths,
    preferredLanguage: language,
    languageWasDefaulted: defaulted,
    notes: text(row.notes),
  };
}

export function normaliseTerritoryRow(
  row: RawTerritoryRow,
  log: NormalisationLog,
): { normalised: NormalisedTerritory; droppedPins: string[] } {
  const id = text(row.territoryId) ?? `row ${row.rowNumber}`;
  const rec = (
    ruleId: NormalisationRuleId,
    column: string,
    from: string,
    to: string | number | null,
  ) => log.record(ruleId, "Territories", row.rowNumber, column, from, to === null ? "" : String(to), id);

  const city = normaliseCity(row.city);
  rec("N-05", "City", row.city, city);

  const { pins, dropped } = normalisePinList(row.pinCodesCovered);
  rec("N-09", "Pin codes covered", row.pinCodesCovered, pins.join(", "));

  const tier = normaliseTier(row.cityTier);
  rec("N-08", "City tier", row.cityTier, tier);

  const priority = normalisePriority(row.priority);
  rec("N-08", "Priority", row.priority, priority);

  const openSlots = normaliseNumber(row.openSlots);
  rec("N-07", "Open slots", row.openSlots, openSlots);

  return {
    normalised: {
      territoryId: text(row.territoryId) ?? "",
      city,
      state: normaliseCity(row.state),
      pins,
      tier,
      openSlots,
      priority,
    },
    droppedPins: dropped,
  };
}
