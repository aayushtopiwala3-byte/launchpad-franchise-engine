import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  buildExportWorkbook,
  exportFileName,
  exportToArrayBuffer,
  type ExportInput,
} from "../../lib/export/workbook";
import { SEED_APPLICATIONS } from "../../lib/seed/applications";
import type { Override } from "../../lib/types";
import { applicant, policy, runSeed } from "../helpers";

const result = runSeed();

const input = (over: Partial<ExportInput> = {}): ExportInput => ({
  result,
  policy: policy(),
  versions: [],
  overrides: [],
  datasetLabel: "Sample data",
  generatedAt: "2026-10-26T09:00:00.000Z",
  ...over,
});

/** Reads the written file back, so what is asserted is what Excel would open. */
function roundTrip(over: Partial<ExportInput> = {}): XLSX.WorkBook {
  return XLSX.read(exportToArrayBuffer(input(over)), { type: "array" });
}

const rowsOf = (book: XLSX.WorkBook, name: string): string[][] =>
  XLSX.utils.sheet_to_json<string[]>(book.Sheets[name], { header: 1, raw: false, defval: "" });

describe("the exported workbook", () => {
  const book = roundTrip();

  it("ships every sheet a judge is told to look for", () => {
    expect(book.SheetNames).toEqual([
      "Decisions",
      "Territory summary",
      "Data quality",
      "How values were read",
      "Audit",
      "This run",
    ]);
  });

  it("gives back one decision row per applicant", () => {
    const rows = rowsOf(book, "Decisions");
    expect(rows).toHaveLength(result.applicants.length + 1);
  });

  it("hands back the uploaded columns word for word", () => {
    const [header, ...rows] = rowsOf(book, "Decisions");
    const source = SEED_APPLICATIONS[0];
    const at = (label: string) => rows[0][header.indexOf(label)];
    expect(at("Application ID")).toBe(source.applicationId);
    expect(at("Applicant name")).toBe(source.applicantName);
    expect(at("Investment capacity (rupees lakh)")).toBe(source.investmentLakh);
  });

  it("appends the decision beside the row it belongs to", () => {
    const [header, ...rows] = rowsOf(book, "Decisions");
    const row = rows.find((r) => r[header.indexOf("Application ID")] === "APP-002");
    const a = applicant(result, "APP-002");
    expect(row?.[header.indexOf("Decision")]).toBe(policy().statusLabels[a.status]);
    expect(row?.[header.indexOf("Reason")]).toBe(a.reasonSentence);
    expect(row?.[header.indexOf("Score out of 100")]).toBe(String(a.score.total));
  });

  it("writes 'Not stated' where the engine has no value rather than leaving a blank", () => {
    const [header, ...rows] = rowsOf(book, "Decisions");
    const column = header.indexOf("Reserved until");
    const withoutReservation = rows.filter(
      (r) => result.applicants.find((a) => a.applicationId === r[header.indexOf("Application ID")])
        ?.reservedUntil === null,
    );
    expect(withoutReservation.length).toBeGreaterThan(0);
    expect(withoutReservation.every((r) => r[column] === "Not stated")).toBe(true);
  });

  it("never leaks a rule code into a reason sentence", () => {
    const [header, ...rows] = rowsOf(book, "Decisions");
    const column = header.indexOf("Reason");
    expect(rows.every((r) => !/\b(DQ|G|R|N|A|S)-\d{2}\b/.test(r[column]))).toBe(true);
  });

  it("lists every data-quality finding, blocking ones first", () => {
    const [, ...rows] = rowsOf(book, "Data quality");
    expect(rows).toHaveLength(result.issues.length);
    const severities = rows.map((r) => r[0]);
    const order = ["blocking", "warning", "info"];
    expect(severities.map((s) => order.indexOf(s))).toEqual(
      [...severities.map((s) => order.indexOf(s))].sort((a, b) => a - b),
    );
  });

  it("says what it did about each finding, not only what it found", () => {
    const [header, ...rows] = rowsOf(book, "Data quality");
    const column = header.indexOf("What we did about it");
    expect(rows.every((r) => r[column].length > 0)).toBe(true);
  });

  it("shows every rule the engine evaluated, with the values it compared", () => {
    const [header, ...rows] = rowsOf(book, "Audit");
    const expected = result.applicants.reduce((n, a) => n + a.trace.length, 0);
    expect(rows).toHaveLength(expected);
    expect(header).toContain("Values compared");
  });

  it("totals the territory holders without double-counting a pin", () => {
    const [header, ...rows] = rowsOf(book, "Territory summary");
    const at = (r: string[], label: string) => Number(r[header.indexOf(label)]);
    for (const row of rows) {
      const t = result.territories.find((x) => x.territoryId === row[0]);
      const held =
        at(row, "Pins held by an existing store") +
        at(row, "Pins approved") +
        at(row, "Pins reserved");
      const accounted =
        held + at(row, "Pins free") + at(row, "Pins ceded to another territory");
      expect(accounted).toBe(t?.pins.length);
    }
  });

  it("records the thresholds and the hash the decisions came out of", () => {
    const flat = rowsOf(book, "This run")
      .map((r) => r.join(" | "))
      .join("\n");
    expect(flat).toContain(result.resultHash);
    expect(flat).toContain("2026-10-26");
    expect(flat).toContain("Hard investment floor");
  });

  it("puts overrides on the record with their reason", () => {
    const override: Override = {
      applicationId: "APP-002",
      fromStatus: "ON HOLD",
      toStatus: "APPROVED",
      reason: "Spoke to them; the money is in place.",
      locked: true,
      who: "Operator",
      when: "2026-10-26T00:00:00.000Z",
    };
    const flat = rowsOf(roundTrip({ overrides: [override] }), "This run")
      .map((r) => r.join(" | "))
      .join("\n");
    expect(flat).toContain("Spoke to them; the money is in place.");
  });

  it("names the file after the run it came from, so two exports never collide silently", () => {
    expect(exportFileName(input())).toBe(
      `Launchpad_Decisions_2026-10-26_${result.resultHash}.xlsx`,
    );
  });

  it("builds the same bytes twice from the same run", () => {
    const once = XLSX.write(buildExportWorkbook(input()), { bookType: "xlsx", type: "base64" });
    const twice = XLSX.write(buildExportWorkbook(input()), { bookType: "xlsx", type: "base64" });
    expect(once).toBe(twice);
  });
});
