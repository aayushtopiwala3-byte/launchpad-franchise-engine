import * as XLSX from "xlsx";
import { APPLICATION_COLUMNS } from "../parse/headers";
import type {
  Applicant,
  Override,
  PipelineResult,
  PolicyProfile,
  QualityIssue,
  Severity,
  Territory,
  Version,
} from "../types";

type Cell = string | number;

export interface ExportInput {
  result: PipelineResult;
  policy: PolicyProfile;
  versions: Version[];
  overrides: Override[];
  datasetLabel: string | null;
  generatedAt: string;
}

/** Blocking first, because that is the order an operator has to fix them in. */
export const SEVERITY_ORDER: Severity[] = ["blocking", "warning", "info"];

export function compareIssues(a: QualityIssue, b: QualityIssue): number {
  return (
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
    a.sheet.localeCompare(b.sheet) ||
    a.row - b.row ||
    a.id.localeCompare(b.id)
  );
}

/**
 * A blank cell in an export reads as "we lost it". A sentence reads as "the file never
 * said". Everything derived goes through here so the difference is never hidden.
 */
const stated = (value: Cell | null | undefined): Cell =>
  value === null || value === undefined || value === "" ? "Not stated" : value;

/** `{ a: 1, b: null }` -> `a = 1; b = not stated`, so a trace row is readable in a cell. */
const describeValues = (values: Record<string, string | number | null>): string =>
  Object.entries(values)
    .map(([k, v]) => `${k} = ${v === null ? "not stated" : v}`)
    .join("; ");

function sheetFrom(rows: Cell[][], widths: number[]): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  return sheet;
}

/** Every data-quality finding that attaches to this applicant, as one cell. */
function flagsOf(applicant: Applicant): string {
  if (applicant.issues.length === 0) return "None";
  return [...applicant.issues]
    .sort(compareIssues)
    .map((i) => `${i.id} ${i.severity}: ${i.message}`)
    .join(" | ");
}

const DECISION_HEADERS = [
  "Decision",
  "Reason",
  "Score out of 100",
  "Rank in territory",
  "Territory",
  "Pin assigned",
  "Reserved until",
  "Next step",
  "What would change it",
  "Flags",
];

/**
 * The uploaded columns come back verbatim, so a judge can diff the export against their
 * own file and see that nothing was rewritten behind their back. Decisions are appended.
 */
function decisionsSheet(result: PipelineResult, policy: PolicyProfile): XLSX.WorkSheet {
  const header = [...APPLICATION_COLUMNS.map((c) => c.label), ...DECISION_HEADERS];

  const rows = result.applicants.map((a): Cell[] => [
    ...APPLICATION_COLUMNS.map((c) => a.raw[c.key] ?? ""),
    policy.statusLabels[a.status],
    a.reasonSentence,
    a.score.total,
    stated(a.rank),
    stated(a.territoryId),
    stated(a.assignedPin),
    stated(a.reservedUntil),
    a.nextStep,
    stated(a.unlockCondition),
    flagsOf(a),
  ]);

  const widths = [
    ...APPLICATION_COLUMNS.map(() => 18),
    16, 60, 14, 14, 12, 12, 14, 48, 48, 60,
  ];
  return sheetFrom([header, ...rows], widths);
}

const countHolders = (t: Territory, kind: "store" | "approved" | "reserved"): number =>
  Object.values(t.pinHolders).filter((h) => h.kind === kind).length;

function territorySheet(result: PipelineResult): XLSX.WorkSheet {
  const header = [
    "Territory",
    "City",
    "State",
    "Tier",
    "Priority",
    "Pins covered",
    "Open slots stated",
    "Usable capacity",
    "Why capacity was capped",
    "Pins held by an existing store",
    "Pins approved",
    "Pins reserved",
    "Pins free",
    "Pins ceded to another territory",
    "Why a slot is still empty",
  ];

  const rows = result.territories.map((t): Cell[] => [
    t.territoryId,
    stated(t.city),
    stated(t.state),
    stated(t.tier),
    stated(t.priority),
    t.pins.join(", "),
    stated(t.openSlots),
    t.usableCapacity,
    stated(t.capacityCappedReason),
    countHolders(t, "store"),
    countHolders(t, "approved"),
    countHolders(t, "reserved"),
    t.freePins.length,
    t.cededPins.length,
    stated(t.unfilledSlotBlocker),
  ]);

  return sheetFrom(
    [header, ...rows],
    [12, 16, 14, 10, 10, 30, 16, 16, 44, 22, 14, 14, 12, 18, 48],
  );
}

function qualitySheet(result: PipelineResult): XLSX.WorkSheet {
  const header = [
    "Severity",
    "Rule",
    "Sheet",
    "Row",
    "Column",
    "Original value",
    "What we found",
    "What we did about it",
    "Applies to",
  ];

  const rows = [...result.issues].sort(compareIssues).map((i): Cell[] => [
    i.severity,
    i.id,
    i.sheet,
    i.row,
    i.column,
    stated(i.originalValue),
    i.message,
    i.actionTaken,
    i.subjectId,
  ]);

  return sheetFrom([header, ...rows], [12, 10, 16, 8, 24, 24, 60, 60, 14]);
}

function normalisationSheet(result: PipelineResult): XLSX.WorkSheet {
  const header = ["Rule", "Sheet", "Row", "Column", "Read as written", "Used as", "Applies to"];

  const rows = result.normalisationLog.map((n): Cell[] => [
    n.ruleId,
    n.sheet,
    n.row,
    n.column,
    n.from,
    n.to,
    n.subjectId,
  ]);

  return sheetFrom([header, ...rows], [10, 16, 8, 24, 30, 30, 14]);
}

/** One row per rule evaluated, in the order the engine evaluated it. */
function auditSheet(result: PipelineResult): XLSX.WorkSheet {
  const header = ["Application ID", "Rule", "What was checked", "Values compared", "Outcome"];

  const rows = result.applicants.flatMap((a) =>
    a.trace.map((t): Cell[] => [
      a.applicationId,
      t.ruleId,
      t.description,
      describeValues(t.values),
      t.outcome,
    ]),
  );

  return sheetFrom([header, ...rows], [16, 10, 48, 56, 48]);
}

/** Provenance: the exact thresholds and the exact run this file came out of. */
function runSheet(input: ExportInput): XLSX.WorkSheet {
  const { result, policy, versions, overrides, datasetLabel, generatedAt } = input;
  const tiers = ["Tier 1", "Tier 2", "Tier 3"] as const;

  const rows: Cell[][] = [
    ["Setting", "Value"],
    ["Brand", policy.brandName],
    ["Dataset", stated(datasetLabel)],
    ["Decisions as of", result.asOfDate],
    ["Exported at", generatedAt],
    ["Policy profile", policy.name],
    ["Policy is the brand default", policy.isDefault ? "Yes" : "No"],
    ["Result hash", result.resultHash],
    ["Versions recorded", versions.length],
    ["Decisions overridden by hand", overrides.length],
    [],
    ["Counts", ""],
    ...Object.entries(result.counts).map(([status, n]): Cell[] => [
      policy.statusLabels[status as keyof typeof policy.statusLabels],
      n,
    ]),
    ["Slots filled", result.slotsFilled],
    ["Slots open", result.slotsOpen],
    ["High-priority slots still empty", result.highPrioritySlotsEmpty],
    [],
    ["Thresholds", ""],
    ...tiers.map((t): Cell[] => [
      `${t} minimum investment (rupees lakh)`,
      policy.tierMinInvestmentLakh[t],
    ]),
    ...tiers.map((t): Cell[] => [`${t} minimum space (sq ft)`, policy.tierMinSpaceSqft[t]]),
    ["Hard investment floor", `${Math.round(policy.hardInvestmentFloorRatio * 100)}% of the tier minimum`],
    ["Acceptable floors", policy.acceptableFloors.join(", ")],
    ["Reservation window (days)", policy.reservationWindowDays],
    ["Training (weeks)", policy.trainingWeeks],
    [],
    ["Score weights", ""],
    ...Object.entries(policy.scoreWeights).map(([k, v]): Cell[] => [k, v]),
  ];

  if (overrides.length > 0) {
    rows.push([], ["Overrides", "From", "To", "Reason", "Who", "When"]);
    for (const o of overrides) {
      rows.push([
        o.applicationId,
        policy.statusLabels[o.fromStatus],
        policy.statusLabels[o.toStatus],
        o.reason,
        o.who,
        o.when,
      ]);
    }
  }

  return sheetFrom(rows, [44, 24, 16, 16, 48, 16, 24]);
}

export function buildExportWorkbook(input: ExportInput): XLSX.WorkBook {
  const book = XLSX.utils.book_new();
  const add = (sheet: XLSX.WorkSheet, name: string) =>
    XLSX.utils.book_append_sheet(book, sheet, name);

  add(decisionsSheet(input.result, input.policy), "Decisions");
  add(territorySheet(input.result), "Territory summary");
  add(qualitySheet(input.result), "Data quality");
  add(normalisationSheet(input.result), "How values were read");
  add(auditSheet(input.result), "Audit");
  add(runSheet(input), "This run");
  return book;
}

export function exportToArrayBuffer(input: ExportInput): ArrayBuffer {
  return XLSX.write(buildExportWorkbook(input), { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

export function exportFileName(input: ExportInput): string {
  const day = input.generatedAt.slice(0, 10);
  return `Launchpad_Decisions_${day}_${input.result.resultHash}.xlsx`;
}
