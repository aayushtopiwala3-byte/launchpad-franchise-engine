import { describe, expect, it } from "vitest";
import {
  NormalisationLog,
  normaliseApplicationRow,
  normaliseTerritoryRow,
} from "../../lib/engine/normalise";
import {
  checkApplications,
  checkTerritories,
  type AppUnderCheck,
  type Contradiction,
  type TerritoryUnderCheck,
} from "../../lib/engine/quality";
import { EMBEDDED_STORES } from "../../lib/reference";
import type { RawApplicationRow, RawTerritoryRow } from "../../lib/types";

const log = () => new NormalisationLog();

function app(
  over: Partial<RawApplicationRow> = {},
  contradictions: Contradiction[] = [],
  rowNumber = 4,
): AppUnderCheck {
  const raw: RawApplicationRow = {
    rowNumber,
    applicationId: "APP-100",
    applicantName: "Test Person",
    city: "Mysuru",
    state: "Karnataka",
    pinCode: "570002",
    investmentLakh: "25",
    retailExperienceYears: "4",
    currentBusiness: "Runs a shop",
    spaceAvailable: "Rented",
    spaceSizeSqft: "450",
    floor: "Ground",
    targetLaunchMonths: "4",
    preferredLanguage: "Kannada",
    notes: "",
    ...over,
  };
  const normalised = normaliseApplicationRow(raw, log(), "English");
  return { key: `${normalised.applicationId}#0`, raw, normalised, contradictions };
}

function territory(over: Partial<RawTerritoryRow> = {}, rowNumber = 4): TerritoryUnderCheck {
  const raw: RawTerritoryRow = {
    rowNumber,
    territoryId: "TER-01",
    city: "Mysuru",
    state: "Karnataka",
    pinCodesCovered: "570001, 570002, 570008",
    cityTier: "Tier 2",
    openSlots: "3",
    priority: "High",
    ...over,
  };
  const { normalised, droppedPins } = normaliseTerritoryRow(raw, log());
  return { raw, normalised, droppedPins };
}

const ids = (issues: { id: string }[]) => issues.map((i) => i.id);

describe("application data quality", () => {
  it("DQ-01 blocks a missing required field without inventing a value", () => {
    const issues = checkApplications([app({ investmentLakh: "" })]);
    const dq01 = issues.find((i) => i.id === "DQ-01");
    expect(dq01?.severity).toBe("blocking");
    expect(dq01?.column).toBe("Investment capacity (rupees lakh)");
    expect(dq01?.originalValue).toBeNull();
    expect(dq01?.actionTaken).toContain("No value was assumed");
  });

  it("DQ-02 blocks a pin code that is not six digits", () => {
    const issues = checkApplications([app({ pinCode: "5700" })]);
    expect(ids(issues)).toContain("DQ-02");
  });

  it("DQ-03 blocks a city and pin prefix mismatch and changes neither value", () => {
    const issues = checkApplications([app({ city: "Mysuru", pinCode: "560043" })]);
    const dq03 = issues.find((i) => i.id === "DQ-03");
    expect(dq03?.severity).toBe("blocking");
    expect(dq03?.actionTaken).toContain("Neither value was changed");
  });

  it("DQ-04 blocks a city we do not operate in", () => {
    const issues = checkApplications([app({ city: "Hampi", pinCode: "583239" })]);
    expect(ids(issues)).toContain("DQ-04");
  });

  it("DQ-05 blocks 'Not yet identified' with a size and floor filled in", () => {
    const issues = checkApplications([
      app({ spaceAvailable: "Not yet identified", spaceSizeSqft: "600", floor: "Ground" }),
    ]);
    const dq05 = issues.find((i) => i.id === "DQ-05");
    expect(dq05?.severity).toBe("blocking");
    expect(dq05?.message).toContain("600 sq ft");
  });

  it("DQ-06 blocks a secured space with no size", () => {
    const issues = checkApplications([app({ spaceAvailable: "Owned", spaceSizeSqft: "" })]);
    expect(ids(issues)).toContain("DQ-06");
  });

  it("DQ-07 blocks implausible numbers without capping them", () => {
    const issues = checkApplications([
      app({ investmentLakh: "900", spaceSizeSqft: "25000", targetLaunchMonths: "48" }),
    ]);
    const dq07 = issues.filter((i) => i.id === "DQ-07");
    expect(dq07).toHaveLength(3);
    expect(dq07[0].actionTaken).toContain("not corrected or capped");
  });

  it("DQ-07 does not fire on a retail experience of zero", () => {
    const issues = checkApplications([app({ retailExperienceYears: "0" })]);
    expect(ids(issues)).not.toContain("DQ-07");
  });

  it("DQ-08 blocks the second row sharing an Application ID and leaves the first alone", () => {
    const issues = checkApplications([
      app({ applicationId: "APP-023" }, [], 10),
      app({ applicationId: "APP-023", applicantName: "Someone Else" }, [], 11),
    ]);
    const dups = issues.filter((i) => i.id === "DQ-08" && i.severity === "blocking");
    expect(dups).toHaveLength(1);
    expect(dups[0].row).toBe(11);
    expect(dups[0].message).toContain("row 10");
  });

  it("DQ-08 warns, but does not block, on the same name at the same pin", () => {
    const issues = checkApplications([
      app({ applicationId: "APP-030", applicantName: "Anita Rao", pinCode: "570002" }, [], 10),
      app({ applicationId: "APP-031", applicantName: "Anita Rao", pinCode: "570002" }, [], 11),
    ]);
    const warn = issues.filter((i) => i.id === "DQ-08" && i.severity === "warning");
    expect(warn).toHaveLength(1);
    expect(warn[0].actionTaken).toContain("Both rows kept");
  });

  it("DQ-13 blocks a contradiction on a decision field and warns on the rest", () => {
    const blocking = checkApplications([
      app({ spaceAvailable: "Owned" }, [
        { field: "Space available", quote: "still looking for a shop", explanation: "They are searching." },
      ]),
    ]).filter((i) => i.id === "DQ-13");
    expect(blocking[0].severity).toBe("blocking");

    const warning = checkApplications([
      app({}, [{ field: "Target launch", quote: "maybe next year", explanation: "Dates disagree." }]),
    ]).filter((i) => i.id === "DQ-13");
    expect(warning[0].severity).toBe("warning");
    expect(warning[0].actionTaken).toContain("decision was not changed");
  });

  it("a clean row raises nothing at all", () => {
    expect(checkApplications([app()])).toEqual([]);
  });
});

describe("territory data quality", () => {
  it("DQ-09 gives a contested pin to the lowest Territory ID and flags both", () => {
    const { issues, pinOwner } = checkTerritories(
      [
        territory({ territoryId: "TER-02", pinCodesCovered: "570003, 570004", city: "Mysuru" }, 5),
        territory({ territoryId: "TER-01", pinCodesCovered: "570003, 570005", city: "Mysuru" }, 4),
      ],
      [],
    );
    expect(pinOwner.get("570003")).toBe("TER-01");
    const dq09 = issues.filter((i) => i.id === "DQ-09");
    expect(dq09).toHaveLength(2);
    expect(dq09.find((i) => i.subjectId === "TER-02")?.actionTaken).toContain("Ceded to TER-01");
  });

  it("DQ-10 warns that a pin already holds one of our stores", () => {
    const { issues } = checkTerritories(
      [territory({ territoryId: "TER-05", city: "Mysuru", pinCodesCovered: "570009, 570011" })],
      EMBEDDED_STORES,
    );
    const dq10 = issues.find((i) => i.id === "DQ-10");
    expect(dq10?.message).toContain("ST-06");
  });

  it("DQ-11 caps capacity when open slots exceed free pins", () => {
    const { issues } = checkTerritories(
      [territory({ territoryId: "TER-05", city: "Mysuru", pinCodesCovered: "570009, 570011", openSlots: "3" })],
      EMBEDDED_STORES,
    );
    const dq11 = issues.find((i) => i.id === "DQ-11");
    expect(dq11?.message).toContain("3 open slots but only 1 free pin code");
    expect(dq11?.actionTaken).toContain("capped at 1");
  });

  it("DQ-12 warns when a territory's pins do not match its city prefix", () => {
    const { issues } = checkTerritories(
      [territory({ city: "Mysuru", pinCodesCovered: "570001, 560043" })],
      [],
    );
    const dq12 = issues.find((i) => i.id === "DQ-12");
    expect(dq12?.severity).toBe("warning");
    expect(dq12?.message).toContain("560043");
    expect(dq12?.actionTaken).toContain("still allocatable");
  });

  it("DQ-08 ignores a repeated Territory ID so its slots are not counted twice", () => {
    const { issues, kept } = checkTerritories(
      [
        territory({ territoryId: "TER-01", pinCodesCovered: "570002, 570003", openSlots: "2" }, 4),
        territory({ territoryId: "TER-01", pinCodesCovered: "570002, 570003", openSlots: "2" }, 5),
      ],
      [],
    );
    const dq08 = issues.find((i) => i.id === "DQ-08");
    expect(dq08?.row).toBe(5);
    expect(dq08?.message).toContain("row 4 and row 5");
    expect(dq08?.actionTaken).toContain("not counted twice");
    expect(kept).toHaveLength(1);
    expect(kept[0].raw.rowNumber).toBe(4);
    // The dropped row must not also trip the two-territories-claim-one-pin rule.
    expect(ids(issues)).not.toContain("DQ-09");
  });

  it("DQ-08 lets a real row beat the template example row whatever the order", () => {
    const example = territory({ territoryId: "TER-01", city: "Mysuru" }, 3);
    example.raw.fromExampleRow = true;
    const real = territory({ territoryId: "TER-01", city: "Bengaluru" }, 4);

    const { issues, kept } = checkTerritories([example, real], []);
    expect(kept).toHaveLength(1);
    expect(kept[0].normalised.city).toBe("Bengaluru");
    expect(issues.find((i) => i.id === "DQ-08")?.actionTaken).toContain("template's example row");
  });

  it("a clean territory raises nothing", () => {
    const { issues } = checkTerritories([territory({ pinCodesCovered: "570002, 570003, 570004" })], []);
    expect(issues).toEqual([]);
  });
});
