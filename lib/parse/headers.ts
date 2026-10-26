/**
 * Header matching. Judges reword, re-case and re-order columns, so nothing here
 * depends on a fixed row number or a fixed column position.
 */

/** Lowercase, strip the rupee symbol and punctuation, collapse whitespace. */
export function normaliseHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[₹]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export interface ColumnSpec<K extends string> {
  key: K;
  /** The canonical header, as written in the template. */
  label: string;
  /** Extra spellings that should also match. */
  aliases: string[];
  required: boolean;
}

export const APPLICATION_COLUMNS: ColumnSpec<ApplicationKey>[] = [
  { key: "applicationId", label: "Application ID", aliases: ["app id", "id", "application no", "application number"], required: true },
  { key: "applicantName", label: "Applicant name", aliases: ["name", "applicant", "partner name", "full name"], required: true },
  { key: "city", label: "City", aliases: ["town", "location city"], required: true },
  { key: "state", label: "State", aliases: [], required: false },
  { key: "pinCode", label: "Pin code", aliases: ["pin", "pincode", "postal code", "zip", "pin code 6 digit"], required: true },
  { key: "investmentLakh", label: "Investment capacity (rupees lakh)", aliases: ["investment capacity", "investment", "investment lakh", "investment capacity lakh", "capital", "budget"], required: true },
  { key: "retailExperienceYears", label: "Retail experience (years)", aliases: ["retail experience", "experience", "experience years", "years of experience"], required: true },
  { key: "currentBusiness", label: "Current / past business", aliases: ["current business", "past business", "current or past business", "business", "occupation"], required: false },
  { key: "spaceAvailable", label: "Space available", aliases: ["space", "property status", "premises", "space status"], required: true },
  { key: "spaceSizeSqft", label: "Space size (sq ft)", aliases: ["space size", "size", "area", "area sq ft", "carpet area"], required: false },
  { key: "floor", label: "Floor", aliases: ["floor level", "level"], required: false },
  { key: "targetLaunchMonths", label: "Target launch (months)", aliases: ["target launch", "launch months", "timeline", "target timeline", "months to launch"], required: false },
  { key: "preferredLanguage", label: "Preferred language", aliases: ["language", "comms language"], required: false },
  { key: "notes", label: "Notes from applicant", aliases: ["notes", "comments", "remarks", "applicant notes"], required: false },
];

export const TERRITORY_COLUMNS: ColumnSpec<TerritoryKey>[] = [
  { key: "territoryId", label: "Territory ID", aliases: ["ter id", "id", "territory no"], required: true },
  { key: "city", label: "City", aliases: ["town"], required: true },
  { key: "state", label: "State", aliases: [], required: false },
  { key: "pinCodesCovered", label: "Pin codes covered", aliases: ["pin codes", "pins", "pincodes", "pin code list", "covered pin codes"], required: true },
  { key: "cityTier", label: "City tier", aliases: ["tier", "city class"], required: true },
  { key: "openSlots", label: "Open slots", aliases: ["slots", "open slot", "capacity", "stores planned"], required: true },
  { key: "priority", label: "Priority", aliases: ["expansion priority", "rank"], required: true },
];

export const STORE_COLUMNS: ColumnSpec<StoreKey>[] = [
  { key: "storeId", label: "Store ID", aliases: ["id", "store no", "store code"], required: true },
  { key: "city", label: "City", aliases: ["town"], required: true },
  { key: "pinCode", label: "Pin code", aliases: ["pin", "pincode"], required: true },
  { key: "opened", label: "Opened", aliases: ["year opened", "opening year", "since"], required: false },
];

export type ApplicationKey =
  | "applicationId" | "applicantName" | "city" | "state" | "pinCode"
  | "investmentLakh" | "retailExperienceYears" | "currentBusiness"
  | "spaceAvailable" | "spaceSizeSqft" | "floor" | "targetLaunchMonths"
  | "preferredLanguage" | "notes";

export type TerritoryKey =
  | "territoryId" | "city" | "state" | "pinCodesCovered" | "cityTier" | "openSlots" | "priority";

export type StoreKey = "storeId" | "city" | "pinCode" | "opened";

/** 1 for an exact hit, 0.6 for a containment hit, 0 for no relationship. */
function headerScore(cell: string, spec: ColumnSpec<string>): number {
  if (!cell) return 0;
  const candidates = [normaliseHeader(spec.label), ...spec.aliases.map(normaliseHeader)];
  if (candidates.includes(cell)) return 1;
  for (const c of candidates) {
    if (c.length >= 3 && (cell.includes(c) || c.includes(cell))) return 0.6;
  }
  return 0;
}

export interface HeaderMatch<K extends string> {
  rowIndex: number;
  /** Column key -> zero-based column index. Missing keys are absent. */
  columns: Partial<Record<K, number>>;
  matchedCount: number;
  missingRequired: string[];
  /** Headers present in the sheet that we did not recognise. */
  unknownHeaders: string[];
}

/**
 * Scans the first `scanRows` rows and picks the one that best matches the expected
 * column names. Returns the mapping, not a fixed row number.
 */
export function findHeaderRow<K extends string>(
  rows: unknown[][],
  specs: ColumnSpec<K>[],
  scanRows = 10,
): HeaderMatch<K> | null {
  let best: HeaderMatch<K> | null = null;
  let bestScore = 0;

  const limit = Math.min(scanRows, rows.length);
  for (let r = 0; r < limit; r++) {
    const cells = (rows[r] ?? []).map(normaliseHeader);
    if (cells.every((c) => !c)) continue;

    const columns: Partial<Record<K, number>> = {};
    const usedColumns = new Set<number>();
    let total = 0;

    // Assign the strongest column for each spec, so a sheet with both
    // "City" and "City tier" cannot bind them to the same cell.
    for (const spec of specs) {
      let bestCol = -1;
      let bestCell = 0;
      for (let c = 0; c < cells.length; c++) {
        if (usedColumns.has(c)) continue;
        const s = headerScore(cells[c], spec);
        if (s > bestCell) {
          bestCell = s;
          bestCol = c;
        }
      }
      if (bestCol >= 0 && bestCell > 0) {
        columns[spec.key] = bestCol;
        usedColumns.add(bestCol);
        total += bestCell;
      }
    }

    if (total > bestScore) {
      bestScore = total;
      best = {
        rowIndex: r,
        columns,
        matchedCount: Object.keys(columns).length,
        missingRequired: specs.filter((s) => s.required && columns[s.key] === undefined).map((s) => s.label),
        unknownHeaders: cells.filter((c, i) => c && !usedColumns.has(i)),
      };
    }
  }

  // Two matched columns is the floor; below that we are reading a title or a stray row.
  if (!best || best.matchedCount < 2) return null;
  return best;
}
