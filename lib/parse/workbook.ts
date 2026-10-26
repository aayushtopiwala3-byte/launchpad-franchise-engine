import * as XLSX from "xlsx";
import { EMBEDDED_STORES } from "../reference";
import type {
  ExistingStore,
  ParseReport,
  PipelineInput,
  RawApplicationRow,
  RawTerritoryRow,
} from "../types";
import { APPLICATION_EXAMPLE, TERRITORY_EXAMPLE, isExampleRow } from "./exampleRow";
import {
  APPLICATION_COLUMNS,
  STORE_COLUMNS,
  TERRITORY_COLUMNS,
  findHeaderRow,
  normaliseHeader,
  type ApplicationKey,
  type HeaderMatch,
  type StoreKey,
  type TerritoryKey,
} from "./headers";

export interface ParseOptions {
  fileName: string;
  /** When true the template example row is kept and treated as real data. */
  includeExampleRow?: boolean;
}

export interface ParseOutcome {
  input: PipelineInput;
  report: ParseReport;
}

const SHEET_ALIASES = {
  applications: ["applications", "application", "sheet1", "applicants", "applicant"],
  territories: ["territories", "territory", "sheet2", "territory master"],
  stores: ["existing stores", "existing store", "stores", "store", "sheet3", "our stores"],
} as const;

const IGNORED_SHEETS = ["allowed values", "field guide", "glossary", "instructions", "readme", "notes"];

function cell(row: unknown[], col: number | undefined): string {
  if (col === undefined) return "";
  const v = row[col];
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function pickSheet(book: XLSX.WorkBook, aliases: readonly string[]): string | null {
  const names = book.SheetNames;
  for (const alias of aliases) {
    const hit = names.find((n) => normaliseHeader(n) === alias);
    if (hit) return hit;
  }
  for (const alias of aliases) {
    const hit = names.find((n) => {
      const h = normaliseHeader(n);
      return !IGNORED_SHEETS.includes(h) && (h.includes(alias) || alias.includes(h));
    });
    if (hit) return hit;
  }
  return null;
}

function sheetRows(book: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = book.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });
}

/**
 * Reads data rows under a located header. Fully blank rows are skipped, and a bad row
 * is recorded against its 1-based spreadsheet row number rather than aborting the file.
 */
function readRows<K extends string>(
  rows: unknown[][],
  match: HeaderMatch<K>,
  sheetLabel: string,
  example: Record<string, string> | null,
  includeExample: boolean,
  build: (get: (key: K) => string, rowNumber: number, fromExampleRow: boolean) => unknown,
  report: ParseReport,
): unknown[] {
  const out: unknown[] = [];
  for (let r = match.rowIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const rowNumber = r + 1;
    if (row.every((c) => String(c ?? "").trim() === "")) continue;
    try {
      const fromExampleRow = !!example && isExampleRow(row, match, example);
      if (fromExampleRow && !includeExample) {
        report.exampleRowsExcluded.push({ sheet: sheetLabel, rowNumber });
        continue;
      }
      out.push(build((key) => cell(row, match.columns[key]), rowNumber, fromExampleRow));
    } catch (err) {
      report.rowErrors.push({
        sheet: sheetLabel,
        row: rowNumber,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

export function parseWorkbook(data: ArrayBuffer | Uint8Array, options: ParseOptions): ParseOutcome {
  const started = Date.now();
  const includeExample = options.includeExampleRow ?? false;
  const report: ParseReport = {
    fileName: options.fileName,
    sheetsFound: [],
    sheetsMissing: [],
    headerRows: {},
    rowsRead: {},
    exampleRowsExcluded: [],
    exampleRowIncluded: includeExample,
    rowErrors: [],
    processedMs: 0,
    storesSource: "embedded",
    storeDifferences: [],
  };

  const book = XLSX.read(data, { type: "array", cellDates: true });

  let appSheet = pickSheet(book, SHEET_ALIASES.applications);
  let terSheet = pickSheet(book, SHEET_ALIASES.territories);
  const storeSheet = pickSheet(book, SHEET_ALIASES.stores);

  // A CSV arrives as a single sheet. Decide what it is by which headers fit better.
  if (book.SheetNames.length === 1 && (!appSheet || !terSheet)) {
    const only = book.SheetNames[0];
    const rows = sheetRows(book, only);
    const asApp = findHeaderRow(rows, APPLICATION_COLUMNS);
    const asTer = findHeaderRow(rows, TERRITORY_COLUMNS);
    if ((asTer?.matchedCount ?? 0) > (asApp?.matchedCount ?? 0)) {
      terSheet = only;
      appSheet = null;
    } else {
      appSheet = only;
      terSheet = null;
    }
  }

  const applications: RawApplicationRow[] = [];
  const territories: RawTerritoryRow[] = [];
  let stores: ExistingStore[] = EMBEDDED_STORES;

  if (appSheet) {
    const rows = sheetRows(book, appSheet);
    const match = findHeaderRow(rows, APPLICATION_COLUMNS);
    if (match) {
      report.sheetsFound.push({ requested: "Applications", matchedAs: appSheet, rows: rows.length });
      report.headerRows.Applications = match.rowIndex + 1;
      applications.push(
        ...(readRows<ApplicationKey>(
          rows, match, "Applications", APPLICATION_EXAMPLE, includeExample,
          (get, rowNumber): RawApplicationRow => ({
            rowNumber,
            applicationId: get("applicationId"),
            applicantName: get("applicantName"),
            city: get("city"),
            state: get("state"),
            pinCode: get("pinCode"),
            investmentLakh: get("investmentLakh"),
            retailExperienceYears: get("retailExperienceYears"),
            currentBusiness: get("currentBusiness"),
            spaceAvailable: get("spaceAvailable"),
            spaceSizeSqft: get("spaceSizeSqft"),
            floor: get("floor"),
            targetLaunchMonths: get("targetLaunchMonths"),
            preferredLanguage: get("preferredLanguage"),
            notes: get("notes"),
          }),
          report,
        ) as RawApplicationRow[]),
      );
      report.rowsRead.Applications = applications.length;
    } else {
      report.sheetsMissing.push("Applications (no header row recognised)");
    }
  } else {
    report.sheetsMissing.push("Applications");
  }

  if (terSheet) {
    const rows = sheetRows(book, terSheet);
    const match = findHeaderRow(rows, TERRITORY_COLUMNS);
    if (match) {
      report.sheetsFound.push({ requested: "Territories", matchedAs: terSheet, rows: rows.length });
      report.headerRows.Territories = match.rowIndex + 1;
      territories.push(
        ...(readRows<TerritoryKey>(
          rows, match, "Territories", TERRITORY_EXAMPLE, includeExample,
          (get, rowNumber, fromExampleRow): RawTerritoryRow => ({
            rowNumber,
            territoryId: get("territoryId"),
            city: get("city"),
            state: get("state"),
            pinCodesCovered: get("pinCodesCovered"),
            cityTier: get("cityTier"),
            openSlots: get("openSlots"),
            priority: get("priority"),
            fromExampleRow,
          }),
          report,
        ) as RawTerritoryRow[]),
      );
      report.rowsRead.Territories = territories.length;
    } else {
      report.sheetsMissing.push("Territories (no header row recognised)");
    }
  } else {
    report.sheetsMissing.push("Territories");
  }

  if (storeSheet) {
    const rows = sheetRows(book, storeSheet);
    const match = findHeaderRow(rows, STORE_COLUMNS);
    if (match) {
      const uploaded = readRows<StoreKey>(
        rows, match, "Existing stores", null, includeExample,
        (get): ExistingStore => ({
          storeId: get("storeId"),
          city: get("city"),
          pinCode: get("pinCode").replace(/\D/g, ""),
          opened: get("opened"),
          source: "uploaded",
        }),
        report,
      ) as ExistingStore[];
      const usable = uploaded.filter((s) => s.storeId && s.pinCode.length === 6);
      if (usable.length > 0) {
        report.sheetsFound.push({ requested: "Existing stores", matchedAs: storeSheet, rows: rows.length });
        report.headerRows["Existing stores"] = match.rowIndex + 1;
        report.rowsRead["Existing stores"] = usable.length;
        report.storesSource = "uploaded";
        report.storeDifferences = diffStores(EMBEDDED_STORES, usable);
        stores = usable;
      }
    }
  }

  report.processedMs = Date.now() - started;
  return { input: { applications, territories, stores }, report };
}

/** Plain-language list of how the uploaded store list differs from the one we ship. */
function diffStores(embedded: ExistingStore[], uploaded: ExistingStore[]): string[] {
  const out: string[] = [];
  const byId = new Map(uploaded.map((s) => [s.storeId, s]));
  for (const e of embedded) {
    const u = byId.get(e.storeId);
    if (!u) {
      out.push(`${e.storeId} (${e.city}, pin ${e.pinCode}) is in our records but not in the uploaded sheet.`);
      continue;
    }
    if (u.pinCode !== e.pinCode) {
      out.push(`${e.storeId} is pin ${u.pinCode} in the uploaded sheet but pin ${e.pinCode} in our records.`);
    }
    if (normaliseHeader(u.city) !== normaliseHeader(e.city)) {
      out.push(`${e.storeId} is in ${u.city} in the uploaded sheet but ${e.city} in our records.`);
    }
  }
  const embeddedIds = new Set(embedded.map((s) => s.storeId));
  for (const u of uploaded) {
    if (!embeddedIds.has(u.storeId)) {
      out.push(`${u.storeId} (${u.city}, pin ${u.pinCode}) is new — it is not in our embedded list.`);
    }
  }
  return out;
}
