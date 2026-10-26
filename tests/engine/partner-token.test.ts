import { describe, expect, it } from "vitest";
import { applicant, appRow, run, terRow } from "../helpers";

const TERRITORIES = [terRow({ territoryId: "TER-01", openSlots: "2" })];

const APPLICATIONS = [
  appRow({ applicationId: "APP-001", applicantName: "Asha Rao", investmentLakh: "25" }),
  appRow({ applicationId: "APP-002", applicantName: "Vikram Shet", pinCode: "570003" }),
];

const tokenOf = (apps: typeof APPLICATIONS, id: string) =>
  applicant(run(apps, TERRITORIES), id).partnerToken;

describe("partner tokens", () => {
  it("survives a patch to a decision input, so a sent link keeps working", () => {
    const patched = APPLICATIONS.map((a) =>
      a.applicationId === "APP-001" ? { ...a, investmentLakh: "40" } : a,
    );
    expect(tokenOf(patched, "APP-001")).toBe(tokenOf(APPLICATIONS, "APP-001"));
    expect(tokenOf(patched, "APP-002")).toBe(tokenOf(APPLICATIONS, "APP-002"));
  });

  it("differs between applicants and between datasets", () => {
    expect(tokenOf(APPLICATIONS, "APP-001")).not.toBe(tokenOf(APPLICATIONS, "APP-002"));

    const otherDataset = [...APPLICATIONS, appRow({ applicationId: "APP-003" })];
    expect(tokenOf(otherDataset, "APP-001")).not.toBe(tokenOf(APPLICATIONS, "APP-001"));
  });

  it("starts with the application id, so an operator can read it", () => {
    expect(tokenOf(APPLICATIONS, "APP-001")).toMatch(/^app001-[0-9a-f]{8}$/);
  });
});
