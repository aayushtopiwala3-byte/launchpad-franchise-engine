import * as XLSX from "xlsx";
import { APPLICATION_COLUMNS, STORE_COLUMNS, TERRITORY_COLUMNS } from "../parse/headers";
import { buildBlankTemplate } from "../parse/template";
import { SEED_APPLICATIONS } from "./applications";
import { SEED_STORES } from "./stores";
import { SEED_TERRITORIES } from "./territories";

/**
 * The sample workbook keeps the template's exact shape — title in row 1, headers
 * in row 2, the grey example in row 3 — so loading it also exercises the example-row
 * exclusion the parser has to get right on a judge's own file.
 */
function fill(sheet: XLSX.WorkSheet, rows: string[][]): XLSX.WorkSheet {
  XLSX.utils.sheet_add_aoa(sheet, rows, { origin: "A4" });
  return sheet;
}

export function buildSampleWorkbook(): XLSX.WorkBook {
  const book = buildBlankTemplate();

  fill(
    book.Sheets.Applications,
    SEED_APPLICATIONS.map((a) => APPLICATION_COLUMNS.map((c) => String(a[c.key] ?? ""))),
  );
  fill(
    book.Sheets.Territories,
    SEED_TERRITORIES.map((t) => TERRITORY_COLUMNS.map((c) => String(t[c.key] ?? ""))),
  );

  // The template already lists the ten stores from row 3; rewrite them so the
  // sample and the embedded list can never drift apart.
  const storeHeaders = STORE_COLUMNS.map((c) => c.label);
  const stores = XLSX.utils.aoa_to_sheet([
    ["Existing stores — the ten stores already trading. One store per pin code."],
    storeHeaders,
    ...SEED_STORES.map((s) => [s.storeId, s.city, s.pinCode, s.opened]),
  ]);
  stores["!cols"] = storeHeaders.map(() => ({ wch: 18 }));
  book.Sheets["Existing stores"] = stores;

  return book;
}

export function sampleToArrayBuffer(): ArrayBuffer {
  return XLSX.write(buildSampleWorkbook(), { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}
