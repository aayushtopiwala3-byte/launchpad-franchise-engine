import { CITY_BY_NAME } from "../reference";
import type {
  ExistingStore,
  NormalisedApplication,
  NormalisedTerritory,
  QualityIssue,
  RawApplicationRow,
  RawTerritoryRow,
} from "../types";
import { investmentUnitsAreAmbiguous, normalisePin } from "./normalise";

export const APP_COLUMNS = {
  applicationId: "Application ID",
  applicantName: "Applicant name",
  city: "City",
  state: "State",
  pinCode: "Pin code",
  investmentLakh: "Investment capacity (rupees lakh)",
  retailExperienceYears: "Retail experience (years)",
  currentBusiness: "Current / past business",
  spaceAvailable: "Space available",
  spaceSizeSqft: "Space size (sq ft)",
  floor: "Floor",
  targetLaunchMonths: "Target launch (months)",
  preferredLanguage: "Preferred language",
  notes: "Notes from applicant",
} as const;

export const TER_COLUMNS = {
  territoryId: "Territory ID",
  city: "City",
  state: "State",
  pinCodesCovered: "Pin codes covered",
  cityTier: "City tier",
  openSlots: "Open slots",
  priority: "Priority",
} as const;

export interface Contradiction {
  field: "City" | "Space available" | "Floor" | "Space size" | "Investment" | "Target launch";
  quote: string;
  explanation: string;
  /** Absent means the deterministic twin found it, so the wording is the engine's own. */
  source?: "ai";
}

export interface AppUnderCheck {
  key: string;
  raw: RawApplicationRow;
  normalised: NormalisedApplication;
  contradictions: Contradiction[];
}

export interface TerritoryUnderCheck {
  raw: RawTerritoryRow;
  normalised: NormalisedTerritory;
  droppedPins: string[];
}

const IMPLAUSIBLE = {
  investmentLakh: 500,
  retailExperienceYears: 50,
  spaceSizeSqft: 20000,
  targetLaunchMonths: 36,
};

/** A contradiction against one of these fields is blocking; anything else is a warning. */
const BLOCKING_CONTRADICTION_FIELDS = new Set(["City", "Space available", "Floor", "Investment"]);

function issue(i: QualityIssue): QualityIssue {
  return i;
}

export function checkApplications(apps: AppUnderCheck[]): QualityIssue[] {
  const out: QualityIssue[] = [];
  const seenIds = new Map<string, string>();
  const seenNamePin = new Map<string, string>();

  for (const app of apps) {
    const { raw, normalised: n } = app;
    const row = raw.rowNumber;
    const subjectId = n.applicationId || `row ${row}`;
    const add = (
      id: QualityIssue["id"],
      severity: QualityIssue["severity"],
      column: string,
      originalValue: string | null,
      message: string,
      actionTaken: string,
      confirmField?: string,
    ) =>
      out.push(
        issue({
          id,
          severity,
          sheet: "Applications",
          row,
          column,
          originalValue,
          message,
          actionTaken,
          subjectId,
          confirmField,
        }),
      );

    // An investment figure whose units N-01 could not settle arrives here as null, the same
    // as a blank cell. It is not blank, so it is reported as its own fault below rather than
    // as a missing field.
    const investmentUnreadable =
      n.investmentLakh === null && investmentUnitsAreAmbiguous(raw.investmentLakh);

    // DQ-01 Missing required field
    const required: [string, unknown, string][] = [
      [APP_COLUMNS.applicationId, n.applicationId || null, raw.applicationId],
      [APP_COLUMNS.applicantName, n.applicantName, raw.applicantName],
      [APP_COLUMNS.city, n.city, raw.city],
      [APP_COLUMNS.state, n.state, raw.state],
      [APP_COLUMNS.pinCode, raw.pinCode?.trim() ? raw.pinCode : null, raw.pinCode],
      [
        APP_COLUMNS.investmentLakh,
        investmentUnreadable ? raw.investmentLakh : n.investmentLakh,
        raw.investmentLakh,
      ],
      [APP_COLUMNS.retailExperienceYears, n.retailExperienceYears, raw.retailExperienceYears],
      [APP_COLUMNS.spaceAvailable, n.spaceAvailable, raw.spaceAvailable],
    ];
    for (const [column, value, original] of required) {
      if (value === null || value === undefined || value === "") {
        add(
          "DQ-01",
          "blocking",
          column,
          original?.toString().trim() ? original : null,
          `${column} is required but is not stated.`,
          `Held ON HOLD until ${column} is confirmed. No value was assumed.`,
          column,
        );
      }
    }

    // DQ-02 Pin code not 6 digits after normalisation
    if (raw.pinCode?.toString().trim()) {
      const { pin, digits } = normalisePin(raw.pinCode);
      if (pin === null) {
        add(
          "DQ-02",
          "blocking",
          APP_COLUMNS.pinCode,
          raw.pinCode,
          `Pin code is ${digits.length} digits after removing spaces and punctuation; a pin code must be exactly 6 digits.`,
          "Held ON HOLD until the pin code is confirmed. The applicant was not linked to any territory.",
          APP_COLUMNS.pinCode,
        );
      }
    }

    // DQ-04 City not in the allowed list  (checked before DQ-03, which needs a known city)
    const cityRef = n.city ? CITY_BY_NAME.get(n.city) : undefined;
    if (n.city && !cityRef) {
      add(
        "DQ-04",
        "blocking",
        APP_COLUMNS.city,
        raw.city,
        `"${n.city}" is not one of the cities this brand operates in.`,
        "Held ON HOLD until the city is confirmed.",
        APP_COLUMNS.city,
      );
    }

    // DQ-03 City and pin prefix mismatch
    if (cityRef && n.pinCode && !n.pinCode.startsWith(cityRef.pinPrefix)) {
      add(
        "DQ-03",
        "blocking",
        `${APP_COLUMNS.city} / ${APP_COLUMNS.pinCode}`,
        `${raw.city} / ${raw.pinCode}`,
        `City is ${n.city} (pin codes start ${cityRef.pinPrefix}) but the pin code given is ${n.pinCode}. One of the two is wrong and we cannot tell which.`,
        "Held ON HOLD. Neither value was changed and no location was assumed.",
        `${APP_COLUMNS.city} / ${APP_COLUMNS.pinCode}`,
      );
    }

    // DQ-05 Not yet identified but size or floor filled
    if (n.spaceAvailable === "Not yet identified") {
      const sizeFilled = n.spaceSizeSqft !== null;
      const floorFilled = n.floor !== null && n.floor !== "Not known";
      if (sizeFilled || floorFilled) {
        const parts = [
          sizeFilled ? `size ${n.spaceSizeSqft} sq ft` : null,
          floorFilled ? `floor ${n.floor}` : null,
        ].filter(Boolean);
        add(
          "DQ-05",
          "blocking",
          APP_COLUMNS.spaceAvailable,
          raw.spaceAvailable,
          `Space is "Not yet identified" but ${parts.join(" and ")} ${parts.length > 1 ? "are" : "is"} filled in. These cannot both be true.`,
          "Held ON HOLD until the space position is confirmed. Neither value was discarded.",
          APP_COLUMNS.spaceAvailable,
        );
      }
    }

    // DQ-06 Owned/Rented but size blank
    if (
      (n.spaceAvailable === "Owned" || n.spaceAvailable === "Rented") &&
      n.spaceSizeSqft === null
    ) {
      add(
        "DQ-06",
        "blocking",
        APP_COLUMNS.spaceSizeSqft,
        raw.spaceSizeSqft?.toString().trim() ? raw.spaceSizeSqft : null,
        `Space is ${n.spaceAvailable} but the size is not stated, so we cannot check it against the minimum.`,
        "Held ON HOLD until the size is confirmed. No size was assumed.",
        APP_COLUMNS.spaceSizeSqft,
      );
    }

    // DQ-07 Implausible numbers
    const plausibility: [string, number | null, number, string][] = [
      [APP_COLUMNS.investmentLakh, n.investmentLakh, IMPLAUSIBLE.investmentLakh, "lakh"],
      [APP_COLUMNS.retailExperienceYears, n.retailExperienceYears, IMPLAUSIBLE.retailExperienceYears, "years"],
      [APP_COLUMNS.spaceSizeSqft, n.spaceSizeSqft, IMPLAUSIBLE.spaceSizeSqft, "sq ft"],
      [APP_COLUMNS.targetLaunchMonths, n.targetLaunchMonths, IMPLAUSIBLE.targetLaunchMonths, "months"],
    ];
    for (const [column, value, ceiling, unit] of plausibility) {
      if (value === null) continue;
      if (value > ceiling) {
        add(
          "DQ-07",
          "blocking",
          column,
          String(rawFor(raw, column)),
          `${column} reads ${value} ${unit}, above the plausible ceiling of ${ceiling} ${unit}. This is almost certainly a typing error.`,
          "Held ON HOLD until the figure is confirmed. The value was not corrected or capped.",
          column,
        );
      } else if (value < 0) {
        add(
          "DQ-07",
          "blocking",
          column,
          String(rawFor(raw, column)),
          `${column} is negative (${value} ${unit}).`,
          "Held ON HOLD until the figure is confirmed.",
          column,
        );
      }
    }

    // DQ-07 A figure whose units we cannot settle. N-01 reads anything above 1,000 as rupees,
    // which is right for 2500000 and wrong for 5000. Where neither reading is plausible the
    // file has not told us what they can invest, and deciding on either number would be
    // deciding on our own arithmetic rather than on their application.
    if (investmentUnreadable) {
      add(
        "DQ-07",
        "blocking",
        APP_COLUMNS.investmentLakh,
        raw.investmentLakh,
        `${APP_COLUMNS.investmentLakh} reads ${String(raw.investmentLakh).trim()}. Read as lakh that is far above anything plausible; read as rupees it is too little to open a store with. We cannot tell which was meant.`,
        "Held ON HOLD until the figure is confirmed. Neither reading was acted on and no value was assumed.",
        APP_COLUMNS.investmentLakh,
      );
    }

    // DQ-08 Duplicate Application ID / same name + pin
    if (n.applicationId) {
      const prior = seenIds.get(n.applicationId);
      if (prior) {
        add(
          "DQ-08",
          "blocking",
          APP_COLUMNS.applicationId,
          raw.applicationId,
          `Application ID ${n.applicationId} already appears on row ${prior}. Two rows cannot share an ID.`,
          "This row is held for confirmation and excluded from allocation. The first row keeps the ID.",
          APP_COLUMNS.applicationId,
        );
      } else {
        seenIds.set(n.applicationId, String(row));
      }
    }
    if (n.applicantName && n.pinCode) {
      const key = `${n.applicantName.toLowerCase()}|${n.pinCode}`;
      const priorId = seenNamePin.get(key);
      if (priorId && priorId !== n.applicationId) {
        add(
          "DQ-08",
          "warning",
          `${APP_COLUMNS.applicantName} / ${APP_COLUMNS.pinCode}`,
          `${raw.applicantName} / ${raw.pinCode}`,
          `${n.applicantName} at pin ${n.pinCode} also appears as ${priorId}. These may be the same person applying twice.`,
          "Both rows kept and allocated normally. Flagged for the manager to merge if they are the same person.",
        );
      } else if (!priorId) {
        seenNamePin.set(key, n.applicationId);
      }
    }

    // DQ-13 Notes contradict the structured fields
    for (const c of app.contradictions) {
      const blocking = BLOCKING_CONTRADICTION_FIELDS.has(c.field);
      const stated = fieldValueFor(n, c.field);
      // A model's free text never speaks in the engine's voice. What it reports that the
      // file can confirm — which field, and a quote that is really there — is kept; its
      // reasoning is not reprinted, because nothing in the file vouches for it.
      const fromAi = c.source === "ai";
      const quoted = quoteIsInNotes(n.notes, c.quote);
      add(
        "DQ-13",
        blocking ? "blocking" : "warning",
        `${APP_COLUMNS.notes} vs ${c.field}`,
        fromAi && !quoted ? null : c.quote,
        !fromAi
          ? `The notes say "${c.quote}" but ${c.field} says ${stated}. ${c.explanation}`
          : quoted
            ? `The notes say "${c.quote}" but ${c.field} says ${stated}. The AI reader flagged this; the quote is from the file.`
            : `The AI reader flagged the notes as contradicting ${c.field}, which says ${stated}. The wording it reported is not in the file, so only the flag was kept.`,
        blocking
          ? `Held ON HOLD until ${c.field} is confirmed. Neither value was overwritten.`
          : "Flagged for the manager. The decision was not changed.",
        blocking ? c.field : undefined,
      );
    }
  }

  return out;
}

/** A model reports a quote; only the file can confirm it is one. */
function quoteIsInNotes(notes: string | null, quote: string): boolean {
  if (!notes) return false;
  const flat = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return flat(quote).length > 0 && flat(notes).includes(flat(quote));
}

function rawFor(raw: RawApplicationRow, column: string): string {
  switch (column) {
    case APP_COLUMNS.investmentLakh:
      return raw.investmentLakh;
    case APP_COLUMNS.retailExperienceYears:
      return raw.retailExperienceYears;
    case APP_COLUMNS.spaceSizeSqft:
      return raw.spaceSizeSqft;
    case APP_COLUMNS.targetLaunchMonths:
      return raw.targetLaunchMonths;
    default:
      return "";
  }
}

function fieldValueFor(n: NormalisedApplication, field: Contradiction["field"]): string {
  switch (field) {
    case "City":
      return n.city ?? "not stated";
    case "Space available":
      return n.spaceAvailable ?? "not stated";
    case "Floor":
      return n.floor ?? "not stated";
    case "Space size":
      return n.spaceSizeSqft === null ? "not stated" : `${n.spaceSizeSqft} sq ft`;
    case "Investment":
      return n.investmentLakh === null ? "not stated" : `${n.investmentLakh} lakh`;
    case "Target launch":
      return n.targetLaunchMonths === null ? "not stated" : `${n.targetLaunchMonths} months`;
  }
}

export interface TerritoryQualityResult {
  issues: QualityIssue[];
  /** Pin -> the Territory ID that owns it after DQ-09 resolution. */
  pinOwner: Map<string, string>;
  /** Input rows minus any repeat of a Territory ID already described above. */
  kept: TerritoryUnderCheck[];
}

export function checkTerritories(
  allTerritories: TerritoryUnderCheck[],
  stores: ExistingStore[],
): TerritoryQualityResult {
  const out: QualityIssue[] = [];
  const occupied = new Set(stores.map((s) => s.pinCode));

  // DQ-08 — the same Territory ID twice. Keeping both would count its slots twice.
  // A real row always beats the template's example row; otherwise the first row wins.
  const byId = new Map<string, TerritoryUnderCheck>();
  const dropped = new Set<TerritoryUnderCheck>();
  for (const t of allTerritories) {
    const id = t.normalised.territoryId;
    if (!id) continue;
    const held = byId.get(id);
    if (!held) {
      byId.set(id, t);
      continue;
    }
    const loser = held.raw.fromExampleRow && !t.raw.fromExampleRow ? held : t;
    const winner = loser === held ? t : held;
    byId.set(id, winner);
    dropped.add(loser);
    out.push({
      id: "DQ-08",
      severity: "warning",
      sheet: "Territories",
      row: loser.raw.rowNumber,
      column: TER_COLUMNS.territoryId,
      originalValue: loser.raw.territoryId,
      message: `${id} appears on row ${held.raw.rowNumber} and row ${t.raw.rowNumber}. A territory can only be described once.`,
      actionTaken: loser.raw.fromExampleRow
        ? `Row ${loser.raw.rowNumber} is the template's example row, so row ${winner.raw.rowNumber} was used instead. Slots are not counted twice.`
        : `Row ${loser.raw.rowNumber} ignored. Row ${winner.raw.rowNumber} was used, so slots are not counted twice.`,
      subjectId: id,
    });
  }
  const territories = allTerritories.filter((t) => !dropped.has(t));

  // DQ-09 — a pin claimed by more than one territory goes to the lowest Territory ID.
  const claims = new Map<string, TerritoryUnderCheck[]>();
  for (const t of territories) {
    for (const pin of t.normalised.pins) {
      const list = claims.get(pin) ?? [];
      list.push(t);
      claims.set(pin, list);
    }
  }
  const pinOwner = new Map<string, string>();
  for (const [pin, claimants] of claims) {
    if (claimants.length === 1) {
      pinOwner.set(pin, claimants[0].normalised.territoryId);
      continue;
    }
    const sorted = [...claimants].sort((a, b) =>
      a.normalised.territoryId < b.normalised.territoryId ? -1 : 1,
    );
    const winner = sorted[0];
    pinOwner.set(pin, winner.normalised.territoryId);
    for (const c of sorted) {
      const isWinner = c === winner;
      out.push({
        id: "DQ-09",
        severity: "warning",
        sheet: "Territories",
        row: c.raw.rowNumber,
        column: TER_COLUMNS.pinCodesCovered,
        originalValue: pin,
        message: `Pin ${pin} is listed by ${sorted.map((s) => s.normalised.territoryId).join(" and ")}. A pin can only belong to one territory.`,
        actionTaken: isWinner
          ? `Assigned to ${winner.normalised.territoryId} (the lowest Territory ID). Both territories flagged.`
          : `Ceded to ${winner.normalised.territoryId} (the lowest Territory ID). This territory no longer counts ${pin} towards its capacity.`,
        subjectId: c.normalised.territoryId,
      });
    }
  }

  for (const t of territories) {
    const row = t.raw.rowNumber;
    const n = t.normalised;
    const subjectId = n.territoryId || `row ${row}`;
    const add = (
      id: QualityIssue["id"],
      severity: QualityIssue["severity"],
      column: string,
      originalValue: string | null,
      message: string,
      actionTaken: string,
    ) =>
      out.push({ id, severity, sheet: "Territories", row, column, originalValue, message, actionTaken, subjectId });

    // DQ-01 on territories
    const required: [string, unknown, string][] = [
      [TER_COLUMNS.territoryId, n.territoryId || null, t.raw.territoryId],
      [TER_COLUMNS.city, n.city, t.raw.city],
      [TER_COLUMNS.state, n.state, t.raw.state],
      [TER_COLUMNS.pinCodesCovered, n.pins.length > 0 ? "y" : null, t.raw.pinCodesCovered],
      [TER_COLUMNS.cityTier, n.tier, t.raw.cityTier],
      [TER_COLUMNS.openSlots, n.openSlots, t.raw.openSlots],
      [TER_COLUMNS.priority, n.priority, t.raw.priority],
    ];
    for (const [column, value, original] of required) {
      if (value === null || value === undefined || value === "") {
        add(
          "DQ-01",
          "blocking",
          column,
          original?.toString().trim() ? original : null,
          `${column} is required on the Territories sheet but is not stated.`,
          column === TER_COLUMNS.openSlots
            ? "Capacity treated as 0 until confirmed. No slots were assumed."
            : column === TER_COLUMNS.priority
              ? "Ordered last, after every territory with a stated priority."
              : "Territory excluded from allocation until confirmed.",
        );
      }
    }

    if (t.droppedPins.length > 0) {
      add(
        "DQ-02",
        "warning",
        TER_COLUMNS.pinCodesCovered,
        t.droppedPins.join(", "),
        `${t.droppedPins.length} entr${t.droppedPins.length === 1 ? "y" : "ies"} in the pin list ${t.droppedPins.length === 1 ? "is" : "are"} not a 6-digit pin code: ${t.droppedPins.join(", ")}.`,
        "Those entries were dropped. The remaining pins were used.",
      );
    }

    // DQ-12 Territory city and pin prefix mismatch
    const ref = n.city ? CITY_BY_NAME.get(n.city) : undefined;
    if (ref) {
      const bad = n.pins.filter((p) => !p.startsWith(ref.pinPrefix));
      if (bad.length > 0) {
        add(
          "DQ-12",
          "warning",
          TER_COLUMNS.pinCodesCovered,
          bad.join(", "),
          `${n.territoryId} is a ${n.city} territory (pin codes start ${ref.pinPrefix}) but covers ${bad.join(", ")}.`,
          "Those pins were kept and are still allocatable. Flagged for the manager to confirm.",
        );
      }
    } else if (n.city) {
      add(
        "DQ-04",
        "warning",
        TER_COLUMNS.city,
        t.raw.city,
        `"${n.city}" is not one of the cities this brand operates in.`,
        "Territory kept, but applicants in it will not match an allowed city.",
      );
    }

    // Pins this territory actually owns after DQ-09.
    const owned = n.pins.filter((p) => pinOwner.get(p) === n.territoryId);

    // DQ-10 A territory pin is already occupied by an existing store
    const takenByStore = owned.filter((p) => occupied.has(p));
    if (takenByStore.length > 0) {
      const names = takenByStore
        .map((p) => `${p} (${stores.find((s) => s.pinCode === p)!.storeId})`)
        .join(", ");
      add(
        "DQ-10",
        "warning",
        TER_COLUMNS.pinCodesCovered,
        takenByStore.join(", "),
        `${takenByStore.length} of ${n.territoryId}'s pin codes already hold one of our stores: ${names}.`,
        "Those pins were removed from the free list, which reduces usable capacity. The brand never opens two stores in the same pin code.",
      );
    }

    // DQ-11 Open slots greater than free pins
    const freeCount = owned.filter((p) => !occupied.has(p)).length;
    if (n.openSlots !== null && n.openSlots > freeCount) {
      add(
        "DQ-11",
        "warning",
        TER_COLUMNS.openSlots,
        t.raw.openSlots,
        `${n.territoryId} lists ${n.openSlots} open slots but only ${freeCount} free pin code${freeCount === 1 ? "" : "s"} remain${freeCount === 1 ? "s" : ""}.`,
        `Usable capacity capped at ${freeCount}. We cannot approve more partners than there are pin codes to put them in.`,
      );
    }
  }

  return { issues: out, pinOwner, kept: territories };
}

export function checkStores(
  uploaded: ExistingStore[] | null,
  embedded: ExistingStore[],
): { issues: QualityIssue[]; differences: string[] } {
  if (!uploaded) return { issues: [], differences: [] };
  const issues: QualityIssue[] = [];
  const differences: string[] = [];
  const embeddedById = new Map(embedded.map((s) => [s.storeId, s]));
  const uploadedById = new Map(uploaded.map((s) => [s.storeId, s]));

  for (const s of uploaded) {
    const e = embeddedById.get(s.storeId);
    if (!e) {
      differences.push(`${s.storeId} (${s.city} ${s.pinCode}) is in the uploaded file but not in our records.`);
      continue;
    }
    if (e.pinCode !== s.pinCode || e.city !== s.city) {
      differences.push(
        `${s.storeId}: uploaded file says ${s.city} ${s.pinCode}, our records say ${e.city} ${e.pinCode}.`,
      );
    }
  }
  for (const e of embedded) {
    if (!uploadedById.has(e.storeId)) {
      differences.push(`${e.storeId} (${e.city} ${e.pinCode}) is in our records but missing from the uploaded file.`);
    }
  }
  for (const d of differences) {
    issues.push({
      id: "DQ-10",
      severity: "warning",
      sheet: "Existing stores",
      row: 0,
      column: "Store ID",
      originalValue: null,
      message: d,
      actionTaken: "The uploaded Existing stores sheet was used. The difference is listed here so it can be reconciled.",
      subjectId: "Existing stores",
    });
  }
  return { issues, differences };
}
