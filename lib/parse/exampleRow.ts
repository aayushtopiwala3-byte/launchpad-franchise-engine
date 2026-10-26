import { normaliseHeader } from "./headers";
import type { ApplicationKey, HeaderMatch, TerritoryKey } from "./headers";

/**
 * The grey example row in row 3 of the template. A judge may delete it, leave it, or
 * overwrite it with real data — so it is only excluded when every field matches exactly.
 */
export const APPLICATION_EXAMPLE: Record<ApplicationKey, string> = {
  applicationId: "APP-001",
  applicantName: "Ravi Kumar",
  city: "Mysuru",
  state: "Karnataka",
  pinCode: "570001",
  investmentLakh: "25",
  retailExperienceYears: "4",
  currentBusiness: "Runs a footwear store",
  spaceAvailable: "Rented",
  spaceSizeSqft: "450",
  floor: "Ground",
  targetLaunchMonths: "3",
  preferredLanguage: "Kannada",
  notes: "Wants to open before Diwali",
};

export const TERRITORY_EXAMPLE: Record<TerritoryKey, string> = {
  territoryId: "TER-01",
  city: "Mysuru",
  state: "Karnataka",
  pinCodesCovered: "570001, 570002, 570008",
  cityTier: "Tier 2",
  openSlots: "3",
  priority: "High",
};

/** Exact match after the same normalisation used on headers, so casing and spacing are forgiven. */
export function isExampleRow<K extends string>(
  row: unknown[],
  match: HeaderMatch<K>,
  example: Record<string, string>,
): boolean {
  const keys = Object.keys(example) as K[];
  let compared = 0;
  for (const key of keys) {
    const col = match.columns[key];
    if (col === undefined) continue;
    const actual = normaliseHeader(row[col]);
    const expected = normaliseHeader(example[key]);
    if (actual !== expected) return false;
    compared++;
  }
  // A row that only lined up on one or two columns is not evidence of the template.
  return compared >= 5;
}
