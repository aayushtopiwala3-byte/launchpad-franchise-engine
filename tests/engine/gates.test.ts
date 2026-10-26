import { describe, expect, it } from "vitest";
import { evaluateGates, evaluateReadiness, realisticMinimumMonths } from "../../lib/engine/gates";
import { NormalisationLog, normaliseApplicationRow } from "../../lib/engine/normalise";
import type { NormalisedApplication, RawApplicationRow } from "../../lib/types";
import { appRow, policy } from "../helpers";

const norm = (over: Partial<RawApplicationRow> = {}): NormalisedApplication =>
  normaliseApplicationRow(appRow(over), new NormalisationLog(), "English");

const ctx = (over: Partial<Parameters<typeof evaluateGates>[1]> = {}) => ({
  policy: policy(),
  tier: "Tier 2" as const,
  territoryId: "TER-01",
  occupyingStoreId: null,
  cityHasTerritory: true,
  redirectTargets: [],
  blockingIssues: [],
  ...over,
});

describe("G-01 city and pin", () => {
  it("passes when the city is allowed and the pin prefix matches", () => {
    const out = evaluateGates(norm(), ctx());
    expect(out.allPassed).toBe(true);
  });

  it("holds when the pin prefix contradicts the city, because that is fixable", () => {
    const out = evaluateGates(norm({ city: "Mysuru", pinCode: "560043" }), ctx());
    expect(out.failure?.ruleId).toBe("G-01");
    expect(out.failure?.want).toBe("hold");
    expect(out.failure?.unlockCondition).toContain("which of the two is correct");
  });

  it("holds on a short pin code rather than guessing one", () => {
    const out = evaluateGates(norm({ pinCode: "5700" }), ctx());
    expect(out.failure?.ruleId).toBe("G-01");
    expect(out.failure?.want).toBe("hold");
  });

  it("rejects a city outside the brand's footprint with nowhere to put them", () => {
    const out = evaluateGates(
      norm({ city: "Hampi", pinCode: "583239" }),
      ctx({ cityHasTerritory: false, territoryId: null }),
    );
    expect(out.failure?.ruleId).toBe("G-01");
    expect(out.failure?.want).toBe("reject");
  });
});

describe("G-02 investment hard floor", () => {
  it("passes exactly at 75% of the tier minimum", () => {
    // Tier 2 minimum is 20 lakh, so the floor is 15.
    const out = evaluateGates(norm({ investmentLakh: "15" }), ctx());
    expect(out.results.find((r) => r.ruleId === "G-02")?.passed).toBe(true);
  });

  it("rejects just below the floor and offers a co-investor as the route back", () => {
    const out = evaluateGates(norm({ investmentLakh: "14.99" }), ctx());
    expect(out.failure?.ruleId).toBe("G-02");
    expect(out.failure?.want).toBe("reject");
    expect(out.failure?.unlockCondition).toContain("co-investor");
  });

  it("does not reject when the investment is simply not stated", () => {
    const out = evaluateGates(norm({ investmentLakh: "" }), ctx());
    expect(out.results.find((r) => r.ruleId === "G-02")?.passed).toBe(true);
  });
});

describe("G-03 one store per pin", () => {
  it("asks for a redirect when the pin already holds one of our stores", () => {
    const out = evaluateGates(norm(), ctx({ occupyingStoreId: "ST-06" }));
    expect(out.failure?.ruleId).toBe("G-03");
    expect(out.failure?.want).toBe("redirect");
    expect(out.failure?.reason).toContain("ST-06");
  });
});

describe("G-04 pin inside a territory", () => {
  it("redirects when the pin is unmapped but the city has territories", () => {
    const out = evaluateGates(norm(), ctx({ territoryId: null, cityHasTerritory: true }));
    expect(out.failure?.ruleId).toBe("G-04");
    expect(out.failure?.want).toBe("redirect");
  });

  it("rejects when the brand has no territory in that city at all", () => {
    const out = evaluateGates(norm(), ctx({ territoryId: null, cityHasTerritory: false }));
    expect(out.failure?.want).toBe("reject");
    expect(out.failure?.unlockCondition).toContain("territory before this application");
  });
});

describe("realistic minimum months", () => {
  const p = policy();

  it("is 3 months with a secured space on an acceptable floor", () => {
    expect(realisticMinimumMonths(norm(), p)).toBe(3);
  });

  it("is 4.5 months with no space secured", () => {
    expect(realisticMinimumMonths(norm({ spaceAvailable: "Not yet identified", spaceSizeSqft: "", floor: "" }), p)).toBe(4.5);
  });

  it("is 4.5 months when the space is secured but on an unusable floor", () => {
    expect(realisticMinimumMonths(norm({ floor: "Upper" }), p)).toBe(4.5);
  });

  it("adds a quarter month for no retail experience", () => {
    expect(realisticMinimumMonths(norm({ retailExperienceYears: "0" }), p)).toBe(3.25);
  });
});

describe("readiness checks", () => {
  const p = policy();

  it("passes all five on a complete, qualifying application", () => {
    const out = evaluateReadiness(norm(), "Tier 2", p, []);
    expect(out.allPassed).toBe(true);
  });

  it("R-01 fails below the tier minimum and states the exact gap", () => {
    const out = evaluateReadiness(norm({ investmentLakh: "17" }), "Tier 2", p, []);
    const r01 = out.results.find((r) => r.ruleId === "R-01")!;
    expect(r01.passed).toBe(false);
    expect(r01.failReason).toContain("3 lakh short");
  });

  it("R-01 fails on a missing figure without assuming zero", () => {
    const out = evaluateReadiness(norm({ investmentLakh: "" }), "Tier 2", p, []);
    const r01 = out.results.find((r) => r.ruleId === "R-01")!;
    expect(r01.failReason).toBe("Investment capacity is not stated.");
  });

  it("R-02 fails when no space is secured", () => {
    const out = evaluateReadiness(norm({ spaceAvailable: "Not yet identified", spaceSizeSqft: "", floor: "" }), "Tier 2", p, []);
    expect(out.results.find((r) => r.ruleId === "R-02")!.passed).toBe(false);
  });

  it("R-03 fails on an upper floor and says why it matters", () => {
    const out = evaluateReadiness(norm({ floor: "Upper" }), "Tier 2", p, []);
    const r03 = out.results.find((r) => r.ruleId === "R-03")!;
    expect(r03.passed).toBe(false);
    expect(r03.failReason).toContain("footfall");
  });

  it("R-03 passes on a mall unit", () => {
    const out = evaluateReadiness(norm({ floor: "Mall unit" }), "Tier 2", p, []);
    expect(out.results.find((r) => r.ruleId === "R-03")!.passed).toBe(true);
  });

  it("R-04 fails below the tier size minimum", () => {
    const out = evaluateReadiness(norm({ spaceSizeSqft: "300" }), "Tier 2", p, []);
    expect(out.results.find((r) => r.ruleId === "R-04")!.passed).toBe(false);
  });

  it("R-04 passes exactly at the minimum", () => {
    const out = evaluateReadiness(norm({ spaceSizeSqft: "350" }), "Tier 2", p, []);
    expect(out.results.find((r) => r.ruleId === "R-04")!.passed).toBe(true);
  });

  it("R-05 fails whenever a blocking data-quality issue is attached", () => {
    const out = evaluateReadiness(norm(), "Tier 2", p, [
      {
        id: "DQ-06",
        severity: "blocking",
        sheet: "Applications",
        row: 4,
        column: "Space size (sq ft)",
        originalValue: null,
        message: "Size missing.",
        actionTaken: "Held.",
        subjectId: "APP-900",
      },
    ]);
    const r05 = out.results.find((r) => r.ruleId === "R-05")!;
    expect(r05.passed).toBe(false);
    expect(r05.unlockCondition).toContain("Confirm:");
  });
});
