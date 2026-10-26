import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { APPLICATION_COLUMNS, TERRITORY_COLUMNS } from "../../lib/parse/headers";
import { parseWorkbook } from "../../lib/parse/workbook";
import { EMBEDDED_STORES } from "../../lib/reference";

/**
 * The judges' own file, abused. Every case here is something a real spreadsheet does:
 * renamed tabs, reordered columns, numbers where text was meant, rubbish in the middle.
 * The bar is not "parses everything" — it is "never quietly misreads".
 */

function bookFrom(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const book = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

const APP_HEADERS = APPLICATION_COLUMNS.map((c) => c.label);
const TER_HEADERS = TERRITORY_COLUMNS.map((c) => c.label);

const APP_ROW = [
  "APP-050", "Lakshmi Devi", "Mysuru", "Karnataka", "570002",
  "30", "5", "Runs a saree store", "Rented", "600", "Ground", "6", "Kannada", "",
];
const TER_ROW = ["TER-01", "Mysuru", "Karnataka", "570002, 570003", "Tier 2", "2", "High"];

const parse = (buffer: ArrayBuffer, includeExampleRow = false) =>
  parseWorkbook(buffer, { fileName: "judge.xlsx", includeExampleRow });

describe("the case-study workbook shape", () => {
  it("reads the three-sheet file the judges will actually upload", () => {
    const { input, report } = parse(
      bookFrom({
        Applications: [APP_HEADERS, APP_ROW],
        Territories: [TER_HEADERS, TER_ROW],
        "Existing stores": [
          ["Store ID", "City", "Pin code", "Opened (year)"],
          ["ST-01", "Bengaluru", "560001", "2019"],
        ],
      }),
    );

    expect(input.applications).toHaveLength(1);
    expect(input.territories).toHaveLength(1);
    expect(report.sheetsMissing).toEqual([]);
    expect(input.stores[0].storeId).toBe("ST-01");
  });

  it("falls back to the embedded store list when the judge omits Sheet 3", () => {
    const { input } = parse(
      bookFrom({ Applications: [APP_HEADERS, APP_ROW], Territories: [TER_HEADERS, TER_ROW] }),
    );

    expect(input.stores).toHaveLength(EMBEDDED_STORES.length);
    expect(input.stores.map((s) => s.pinCode)).toContain("560001");
  });

  it("accepts the sheets under other plausible tab names", () => {
    const { input, report } = parse(
      bookFrom({ Sheet1: [APP_HEADERS, APP_ROW], "  territory master ": [TER_HEADERS, TER_ROW] }),
    );

    expect(report.sheetsMissing).toEqual([]);
    expect(input.applications).toHaveLength(1);
    expect(input.territories).toHaveLength(1);
  });
});

describe("messy but recoverable input", () => {
  it("matches columns by name, not position, when the order is scrambled", () => {
    const order = [4, 0, 2, 1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const { input } = parse(
      bookFrom({
        Applications: [order.map((i) => APP_HEADERS[i]), order.map((i) => APP_ROW[i])],
        Territories: [TER_HEADERS, TER_ROW],
      }),
    );

    expect(input.applications[0].applicationId).toBe("APP-050");
    expect(input.applications[0].pinCode).toBe("570002");
    expect(input.applications[0].city).toBe("Mysuru");
  });

  it("ignores extra columns the brand added for its own use", () => {
    const { input } = parse(
      bookFrom({
        Applications: [
          [...APP_HEADERS, "Internal owner", "CRM ref"],
          [...APP_ROW, "Priya", "CRM-9912"],
        ],
        Territories: [TER_HEADERS, TER_ROW],
      }),
    );

    expect(input.applications).toHaveLength(1);
    expect(input.applications[0].applicationId).toBe("APP-050");
  });

  it("reads a pin code stored as a number, keeping all six digits", () => {
    const numeric: unknown[] = [...APP_ROW];
    numeric[4] = 570002;
    numeric[5] = 30;
    const { input } = parse(
      bookFrom({ Applications: [APP_HEADERS, numeric], Territories: [TER_HEADERS, TER_ROW] }),
    );

    expect(input.applications[0].pinCode).toBe("570002");
    expect(input.applications[0].pinCode).toHaveLength(6);
  });

  it("trims whitespace and keeps odd casing for the normaliser to resolve", () => {
    const padded = [...APP_ROW];
    padded[2] = "  mysore  ";
    padded[4] = " 570002 ";
    const { input } = parse(
      bookFrom({ Applications: [APP_HEADERS, padded], Territories: [TER_HEADERS, TER_ROW] }),
    );

    expect(input.applications[0].pinCode).toBe("570002");
    expect(input.applications[0].city).toBe("mysore");
  });

  it("skips blank and trailing rows without counting them as applicants", () => {
    const { input } = parse(
      bookFrom({
        Applications: [APP_HEADERS, APP_ROW, [], ["", "", ""], [], []],
        Territories: [TER_HEADERS, TER_ROW],
      }),
    );

    expect(input.applications).toHaveLength(1);
  });

  it("keeps a row that has only an ID rather than dropping it silently", () => {
    const { input } = parse(
      bookFrom({
        Applications: [APP_HEADERS, APP_ROW, ["APP-051"]],
        Territories: [TER_HEADERS, TER_ROW],
      }),
    );

    expect(input.applications).toHaveLength(2);
    expect(input.applications[1].applicationId).toBe("APP-051");
    expect(input.applications[1].investmentLakh).toBe("");
  });
});

describe("input the parser must refuse rather than guess at", () => {
  it("fails closed on a file that is not a workbook at all", () => {
    const rubbish = new TextEncoder().encode("this is not a spreadsheet").buffer;

    expect(() => parse(rubbish as ArrayBuffer)).toThrow();
  });

  it("fails closed on a truncated workbook", () => {
    const whole = bookFrom({
      Applications: [APP_HEADERS, APP_ROW],
      Territories: [TER_HEADERS, TER_ROW],
    });

    expect(() => parse(whole.slice(0, 40))).toThrow();
  });

  it("names the sheet it could not find instead of inventing rows", () => {
    const { input, report } = parse(bookFrom({ Applications: [APP_HEADERS, APP_ROW] }));

    expect(report.sheetsMissing).toContain("Territories");
    expect(input.territories).toEqual([]);
  });

  it("reports an Applications sheet whose headers are not headers", () => {
    const { input, report } = parse(
      bookFrom({
        Applications: [["total sales"], ["1234"]],
        Territories: [TER_HEADERS, TER_ROW],
      }),
    );

    expect(report.sheetsMissing.join(" ")).toContain("Applications");
    expect(report.sheetsMissing.join(" ")).toContain("no header row recognised");
    expect(input.applications).toEqual([]);
    expect(input.territories).toHaveLength(1);
  });

  it("returns an empty set, not a crash, for a header-only workbook", () => {
    const { input } = parse(
      bookFrom({ Applications: [APP_HEADERS], Territories: [TER_HEADERS] }),
    );

    expect(input.applications).toEqual([]);
    expect(input.territories).toEqual([]);
  });

  it("ignores a Glossary tab shipped in the judges' own template", () => {
    const { input, report } = parse(
      bookFrom({
        Glossary: [["Column", "What it means"], ["Pin code", "Six digits"]],
        Applications: [APP_HEADERS, APP_ROW],
        Territories: [TER_HEADERS, TER_ROW],
      }),
    );

    expect(report.sheetsMissing).toEqual([]);
    expect(input.applications).toHaveLength(1);
  });
});
