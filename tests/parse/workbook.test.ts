import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { findHeaderRow, normaliseHeader, APPLICATION_COLUMNS, TERRITORY_COLUMNS } from "../../lib/parse/headers";
import { buildBlankTemplate } from "../../lib/parse/template";
import { parseWorkbook } from "../../lib/parse/workbook";

function toBuffer(book: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

function bookFrom(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const book = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return toBuffer(book);
}

const APP_HEADERS = APPLICATION_COLUMNS.map((c) => c.label);
const TER_HEADERS = TERRITORY_COLUMNS.map((c) => c.label);

const APP_ROW = [
  "APP-050", "Lakshmi Devi", "Mysuru", "Karnataka", "570002",
  "30", "5", "Runs a saree store", "Rented", "600", "Ground", "6", "Kannada", "",
];
const TER_ROW = ["TER-01", "Mysuru", "Karnataka", "570002, 570003", "Tier 2", "2", "High"];

describe("header location", () => {
  it("normalises away case, punctuation and the rupee symbol", () => {
    expect(normaliseHeader("  Investment capacity (₹ lakh) ")).toBe("investment capacity lakh");
    expect(normaliseHeader("Pin-Code")).toBe("pin code");
  });

  it("finds the header row wherever it sits, not at a fixed row number", () => {
    const rows = [["A title"], [], ["Another note"], APP_HEADERS, APP_ROW];
    const match = findHeaderRow(rows, APPLICATION_COLUMNS);
    expect(match?.rowIndex).toBe(3);
    expect(match?.missingRequired).toEqual([]);
  });

  it("does not bind City and City tier to the same column", () => {
    const match = findHeaderRow([TER_HEADERS], TERRITORY_COLUMNS);
    expect(match?.columns.city).toBe(1);
    expect(match?.columns.cityTier).toBe(4);
  });

  it("matches reworded headers", () => {
    const reworded = ["App ID", "Name", "Town", "State", "Pincode", "Investment", "Experience", "Business", "Property status", "Area", "Floor level", "Timeline", "Language", "Remarks"];
    const match = findHeaderRow([reworded], APPLICATION_COLUMNS);
    expect(match?.missingRequired).toEqual([]);
    expect(match?.columns.applicationId).toBe(0);
    expect(match?.columns.pinCode).toBe(4);
  });

  it("returns null when the rows are not headers at all", () => {
    expect(findHeaderRow([["hello"], ["world"]], APPLICATION_COLUMNS)).toBeNull();
  });
});

describe("workbook parsing", () => {
  it("reads the blank template and excludes the grey example row", () => {
    const { input, report } = parseWorkbook(toBuffer(buildBlankTemplate()), { fileName: "template.xlsx" });
    expect(input.applications).toHaveLength(0);
    expect(input.territories).toHaveLength(0);
    expect(report.exampleRowsExcluded).toHaveLength(2);
    expect(report.headerRows.Applications).toBe(2);
    expect(report.rowErrors).toEqual([]);
  });

  it("keeps the example row when the operator asks for it", () => {
    const { input, report } = parseWorkbook(toBuffer(buildBlankTemplate()), {
      fileName: "template.xlsx",
      includeExampleRow: true,
    });
    expect(input.applications).toHaveLength(1);
    expect(input.applications[0].applicationId).toBe("APP-001");
    expect(report.exampleRowsExcluded).toHaveLength(0);
    expect(report.exampleRowIncluded).toBe(true);
  });

  it("treats an overwritten example row as real data", () => {
    const data = bookFrom({
      Applications: [["Title"], APP_HEADERS, APP_ROW],
      Territories: [["Title"], TER_HEADERS, TER_ROW],
    });
    const { input, report } = parseWorkbook(data, { fileName: "real.xlsx" });
    expect(input.applications).toHaveLength(1);
    expect(input.applications[0].applicationId).toBe("APP-050");
    expect(report.exampleRowsExcluded).toHaveLength(0);
  });

  it("skips fully blank rows and records the real row numbers", () => {
    const data = bookFrom({
      Applications: [["Title"], APP_HEADERS, [], APP_ROW, [], ["", "", "", "", "", "", ""]],
      Territories: [["Title"], TER_HEADERS, TER_ROW],
    });
    const { input } = parseWorkbook(data, { fileName: "gappy.xlsx" });
    expect(input.applications).toHaveLength(1);
    expect(input.applications[0].rowNumber).toBe(4);
  });

  it("reads columns in any order", () => {
    const shuffled = [...APP_HEADERS].reverse();
    const shuffledRow = [...APP_ROW].reverse();
    const data = bookFrom({
      Applications: [["Title"], shuffled, shuffledRow],
      Territories: [["Title"], TER_HEADERS, TER_ROW],
    });
    const { input } = parseWorkbook(data, { fileName: "shuffled.xlsx" });
    expect(input.applications[0]).toMatchObject({
      applicationId: "APP-050",
      city: "Mysuru",
      pinCode: "570002",
      floor: "Ground",
    });
  });

  it("finds sheets by fuzzy name and ignores reference sheets", () => {
    const data = bookFrom({
      "Allowed values": [["City", "Tier"], ["Mysuru", "Tier 2"]],
      "  applications ": [["Title"], APP_HEADERS, APP_ROW],
      Territory: [["Title"], TER_HEADERS, TER_ROW],
    });
    const { input, report } = parseWorkbook(data, { fileName: "fuzzy.xlsx" });
    expect(input.applications).toHaveLength(1);
    expect(input.territories).toHaveLength(1);
    expect(report.sheetsFound.map((s) => s.requested)).toContain("Territories");
  });

  it("treats a lone CSV-style sheet as Applications", () => {
    const data = bookFrom({ Sheet1: [APP_HEADERS, APP_ROW] });
    const { input } = parseWorkbook(data, { fileName: "apps.csv" });
    expect(input.applications).toHaveLength(1);
    expect(input.territories).toHaveLength(0);
  });

  it("treats a lone sheet as Territories when those headers fit better", () => {
    const data = bookFrom({ Sheet1: [TER_HEADERS, TER_ROW] });
    const { input } = parseWorkbook(data, { fileName: "ters.csv" });
    expect(input.territories).toHaveLength(1);
    expect(input.applications).toHaveLength(0);
  });

  it("falls back to the embedded store list when the sheet is absent", () => {
    const data = bookFrom({
      Applications: [["Title"], APP_HEADERS, APP_ROW],
      Territories: [["Title"], TER_HEADERS, TER_ROW],
    });
    const { input, report } = parseWorkbook(data, { fileName: "nostores.xlsx" });
    expect(report.storesSource).toBe("embedded");
    expect(input.stores).toHaveLength(10);
  });

  it("prefers an uploaded store list and reports every difference", () => {
    const data = bookFrom({
      Applications: [["Title"], APP_HEADERS, APP_ROW],
      Territories: [["Title"], TER_HEADERS, TER_ROW],
      "Existing stores": [
        ["Title"],
        ["Store ID", "City", "Pin code", "Opened"],
        ["ST-01", "Bengaluru", "560001", "2019"],
        ["ST-99", "Mysuru", "570044", "2025"],
      ],
    });
    const { input, report } = parseWorkbook(data, { fileName: "stores.xlsx" });
    expect(report.storesSource).toBe("uploaded");
    expect(input.stores).toHaveLength(2);
    expect(report.storeDifferences.some((d) => d.includes("ST-99") && d.includes("new"))).toBe(true);
    expect(report.storeDifferences.some((d) => d.includes("ST-06"))).toBe(true);
  });

  it("reports a missing sheet rather than throwing", () => {
    const data = bookFrom({ Applications: [["Title"], APP_HEADERS, APP_ROW] });
    const { report } = parseWorkbook(data, { fileName: "partial.xlsx" });
    expect(report.sheetsMissing).toContain("Territories");
  });
});
