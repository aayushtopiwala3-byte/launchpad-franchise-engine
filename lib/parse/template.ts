import * as XLSX from "xlsx";
import { ALLOWED_CITIES, EMBEDDED_STORES, LANGUAGES } from "../reference";
import { APPLICATION_EXAMPLE, TERRITORY_EXAMPLE } from "./exampleRow";
import { APPLICATION_COLUMNS, STORE_COLUMNS, TERRITORY_COLUMNS } from "./headers";

const GREY = { font: { color: { rgb: "808080" }, italic: true } };
const TITLE = { font: { bold: true } };
const HEADER = { font: { bold: true } };

/** Builds a sheet with the exact shape the parser expects: title, headers, grey example. */
function buildSheet(title: string, headers: string[], example: string[]): XLSX.WorkSheet {
  const aoa = [[title], headers, example];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = headers.map((h) => ({ wch: Math.max(14, Math.min(42, h.length + 6)) }));

  const style = (r: number, c: number, s: object) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (sheet[ref]) (sheet[ref] as { s?: object }).s = s;
  };
  style(0, 0, TITLE);
  headers.forEach((_, c) => style(1, c, HEADER));
  example.forEach((_, c) => style(2, c, GREY));
  return sheet;
}

export function buildBlankTemplate(): XLSX.WorkBook {
  const book = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    book,
    buildSheet(
      "Applications — one row per franchise applicant. Row 3 is a grey example; overwrite it or delete it.",
      APPLICATION_COLUMNS.map((c) => c.label),
      APPLICATION_COLUMNS.map((c) => APPLICATION_EXAMPLE[c.key]),
    ),
    "Applications",
  );

  XLSX.utils.book_append_sheet(
    book,
    buildSheet(
      "Territories — one row per territory. Applicants are linked to territories by pin code, not by a Territory ID column.",
      TERRITORY_COLUMNS.map((c) => c.label),
      TERRITORY_COLUMNS.map((c) => TERRITORY_EXAMPLE[c.key]),
    ),
    "Territories",
  );

  const storeHeaders = STORE_COLUMNS.map((c) => c.label);
  const storeSheet = XLSX.utils.aoa_to_sheet([
    ["Existing stores — leave this sheet as-is unless your store list has changed."],
    storeHeaders,
    ...EMBEDDED_STORES.map((s) => [s.storeId, s.city, s.pinCode, s.opened]),
  ]);
  storeSheet["!cols"] = storeHeaders.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(book, storeSheet, "Existing stores");

  const allowed = XLSX.utils.aoa_to_sheet([
    ["Allowed values — for reference only. This sheet is ignored when the file is read."],
    ["City", "State", "Pin prefix", "City tier"],
    ...ALLOWED_CITIES.map((c) => [c.city, c.state, c.pinPrefix, c.tier]),
    [],
    ["Space available", "Owned", "Rented", "Not yet identified"],
    ["Floor", "Ground", "Upper", "Mall unit", "Not known"],
    ["Priority", "High", "Medium", "Low"],
    ["Preferred language", ...LANGUAGES],
    ["Investment capacity", "In rupees lakh. 25 means 25,00,000."],
  ]);
  allowed["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(book, allowed, "Allowed values");

  return book;
}

export function templateToArrayBuffer(): ArrayBuffer {
  return XLSX.write(buildBlankTemplate(), { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}
