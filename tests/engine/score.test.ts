import { describe, expect, it } from "vitest";
import { NormalisationLog, normaliseApplicationRow } from "../../lib/engine/normalise";
import {
  businessPoints,
  computeScore,
  experiencePoints,
  investmentPoints,
  launchPoints,
  spacePoints,
} from "../../lib/engine/score";
import type { BusinessClassification, NormalisedApplication, RawApplicationRow } from "../../lib/types";
import { appRow, policy } from "../helpers";

const norm = (over: Partial<RawApplicationRow> = {}): NormalisedApplication =>
  normaliseApplicationRow(appRow(over), new NormalisationLog(), "English");

const classified = (category: BusinessClassification["category"]): BusinessClassification => ({
  category,
  evidenceQuote: null,
  confidence: 1,
  source: "fallback",
});

describe("investment headroom, out of 30", () => {
  // Tier 2 minimum is 20 lakh.
  it.each([
    [30, 30, "1.5x or more"],
    [29.9, 25, "1.25x or more"],
    [25, 25, "1.25x or more"],
    [24.9, 18, "meets it"],
    [20, 18, "meets it"],
    [19.9, 8, "below it"],
  ])("%s lakh scores %s", (investment, expected) => {
    expect(investmentPoints(investment, 20).points).toBe(expected);
  });

  it("scores the lowest band, not zero, when no figure was read", () => {
    const out = investmentPoints(null, 20);
    expect(out.points).toBe(8);
    // Changed wording, same contract. Null reaches here from a blank cell and from one
    // whose units N-01 could not settle, so the basis reports what the engine read rather
    // than claiming the file said nothing.
    expect(out.basis).toContain("No investment figure was read");
    expect(out.basis).toContain("lowest band");
  });
});

describe("retail experience, out of 20", () => {
  it.each([
    [0, 0],
    [1, 8],
    [2, 8],
    [3, 15],
    [5, 15],
    [6, 20],
    [25, 20],
  ])("%s years scores %s", (years, expected) => {
    expect(experiencePoints(years).points).toBe(expected);
  });

  it("says plainly that zero experience is not a rejection", () => {
    expect(experiencePoints(0).basis).toContain("Not a rejection");
  });

  it("scores a missing figure at zero without treating it as a rejection", () => {
    const out = experiencePoints(null);
    expect(out.points).toBe(0);
    expect(out.basis).toContain("not stated");
  });
});

describe("space readiness, out of 25", () => {
  const p = policy();

  it("gives 25 for owned space on the ground floor inside the band", () => {
    expect(spacePoints(norm({ spaceAvailable: "Owned" }), "Tier 2", p).points).toBe(25);
  });

  it("gives 22 for rented space on the ground floor inside the band", () => {
    expect(spacePoints(norm(), "Tier 2", p).points).toBe(22);
  });

  it("gives 10 for a secured space on an unusable floor", () => {
    expect(spacePoints(norm({ floor: "Upper" }), "Tier 2", p).points).toBe(10);
  });

  it("gives 8 when the floor is not confirmed", () => {
    expect(spacePoints(norm({ floor: "Not known" }), "Tier 2", p).points).toBe(8);
  });

  it("gives 5 when no space has been identified", () => {
    const n = norm({ spaceAvailable: "Not yet identified", spaceSizeSqft: "", floor: "" });
    expect(spacePoints(n, "Tier 2", p).points).toBe(5);
  });

  it("deducts 5 when the size falls outside the tier's preferred band", () => {
    // Tier 2 band is 350-1000 sq ft.
    const out = spacePoints(norm({ spaceSizeSqft: "1200" }), "Tier 2", p);
    expect(out.points).toBe(17);
    expect(out.raw).toBe(22);
    expect(out.basis).toContain("outside the Tier 2 preferred band");
  });

  it("keeps the raw figure separate so ties break on readiness, not on the band penalty", () => {
    const out = spacePoints(norm({ spaceAvailable: "Owned", spaceSizeSqft: "1200" }), "Tier 2", p);
    expect(out.points).toBe(20);
    expect(out.raw).toBe(25);
  });
});

describe("business relevance, out of 15", () => {
  it("gives 15 to a retail owner", () => {
    expect(businessPoints(classified("retail_owner")).points).toBe(15);
  });

  it("gives 9 to an adjacent customer-facing trade", () => {
    expect(businessPoints(classified("customer_facing_adjacent")).points).toBe(9);
  });

  it("gives 0 when nothing relevant is stated", () => {
    expect(businessPoints(classified("unrelated_or_none")).points).toBe(0);
  });

  it("quotes the evidence it was given", () => {
    const out = businessPoints({
      category: "retail_owner",
      evidenceQuote: "footwear store",
      confidence: 0.9,
      source: "ai",
    });
    expect(out.basis).toContain('"footwear store"');
  });
});

describe("launch fit, out of 10", () => {
  it("gives 10 when the target meets the realistic minimum", () => {
    expect(launchPoints(6, 3).points).toBe(10);
    expect(launchPoints(3, 3).points).toBe(10);
  });

  it("gives 5 when the target is up to a month short", () => {
    expect(launchPoints(2, 3).points).toBe(5);
    expect(launchPoints(2.5, 3).points).toBe(5);
  });

  it("gives 2 when the target is more than a month short", () => {
    expect(launchPoints(1, 3).points).toBe(2);
  });

  it("gives 7 when no target was given", () => {
    expect(launchPoints(null, 3).points).toBe(7);
  });
});

describe("total score", () => {
  const p = policy();

  it("adds to 100 for a perfect Tier 2 application", () => {
    const n = norm({
      investmentLakh: "30",
      retailExperienceYears: "8",
      spaceAvailable: "Owned",
      spaceSizeSqft: "600",
      floor: "Ground",
      targetLaunchMonths: "6",
    });
    const out = computeScore(n, "Tier 2", p, classified("retail_owner"));
    expect(out.total).toBe(100);
    expect(out.components.map((c) => c.max)).toEqual([30, 20, 25, 15, 10]);
  });

  it("re-weighting a component changes its influence but keeps the band shape", () => {
    const n = norm({ retailExperienceYears: "4" });
    const base = computeScore(n, "Tier 2", p, classified("retail_owner"));
    const reweighted = computeScore(
      n,
      "Tier 2",
      policy({ scoreWeights: { ...p.scoreWeights, experience: 40 } }),
      classified("retail_owner"),
    );
    // 15/20 of the band becomes 30/40: the same proportion, twice the influence.
    expect(base.components[1].points).toBe(15);
    expect(reweighted.components[1].points).toBe(30);
    expect(reweighted.components[1].max).toBe(40);
  });

  it("never scores below zero or above the stated maximum", () => {
    const n = norm({
      investmentLakh: "",
      retailExperienceYears: "",
      spaceAvailable: "Not yet identified",
      spaceSizeSqft: "",
      floor: "",
      targetLaunchMonths: "",
    });
    const out = computeScore(n, "Tier 2", p, classified("unrelated_or_none"));
    for (const c of out.components) {
      expect(c.points).toBeGreaterThanOrEqual(0);
      expect(c.points).toBeLessThanOrEqual(c.max);
    }
  });
});
