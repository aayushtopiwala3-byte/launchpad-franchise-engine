import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { runPipeline } from "../../lib/engine/pipeline";
import { parseWorkbook } from "../../lib/parse/workbook";
import { SEED_APPLICATIONS } from "../../lib/seed/applications";
import { SEED_TERRITORIES } from "../../lib/seed/territories";
import { buildSampleWorkbook } from "../../lib/seed/workbook";
import { AS_OF, policy, runSeed } from "../helpers";

const bytes = () =>
  XLSX.write(buildSampleWorkbook(), { bookType: "xlsx", type: "array" }) as ArrayBuffer;

describe("the sample workbook", () => {
  const { input, report } = parseWorkbook(bytes(), { fileName: "Launchpad_Sample_Data.xlsx" });

  it("keeps the template shape, so the grey example row is excluded", () => {
    expect(report.headerRows.Applications).toBe(2);
    expect(report.exampleRowsExcluded).toHaveLength(2);
    expect(report.rowErrors).toEqual([]);
  });

  it("reads back every seed row, messy values and duplicate ID included", () => {
    expect(input.applications).toHaveLength(SEED_APPLICATIONS.length);
    expect(input.territories).toHaveLength(SEED_TERRITORIES.length);
    expect(input.stores).toHaveLength(10);
    expect(input.applications[0].rowNumber).toBe(4);
    expect(input.applications.find((a) => a.applicationId === "APP-020")?.investmentLakh).toBe("25 lakh");
    expect(input.applications.filter((a) => a.applicationId === "APP-023")).toHaveLength(2);
  });

  it("decides identically to the in-memory sample the button loads", () => {
    const fromFile = runPipeline(input, { policy: policy(), asOfDate: AS_OF, withCounterfactuals: false });
    expect(fromFile.resultHash).toBe(runSeed().resultHash);
  });
});
