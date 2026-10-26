import { describe, expect, it } from "vitest";
import { runPipeline } from "../../lib/engine/pipeline";
import { BRAND_DEFAULT_POLICY, EMBEDDED_STORES } from "../../lib/reference";
import { mergeWithDefaults, policyDifferences, previewPolicyImpact } from "../../lib/state/policy";
import { SEED_APPLICATIONS } from "../../lib/seed/applications";
import { SEED_STORES } from "../../lib/seed/stores";
import { SEED_TERRITORIES } from "../../lib/seed/territories";
import type { PipelineInput, PolicyProfile } from "../../lib/types";
import { AS_OF, appRow, applicant, policy, run, statusOf, terRow } from "../helpers";

/**
 * Test area I. The thresholds are meant to be the brand's to set, which is only safe if
 * two things hold: the preview tells the truth about who moves, and no amount of
 * re-weighting the score can make an ineligible applicant eligible.
 */

const SEED: PipelineInput = {
  applications: SEED_APPLICATIONS,
  territories: SEED_TERRITORIES,
  stores: SEED_STORES,
};

const withPolicy = (profile: PolicyProfile) =>
  runPipeline(SEED, { policy: profile, asOfDate: AS_OF, withCounterfactuals: false });

const base = withPolicy(policy());

describe("score weights move the ranking, never the eligibility", () => {
  const WEIGHT_SETS: [string, PolicyProfile["scoreWeights"]][] = [
    ["every weight at zero", { investment: 0, experience: 0, space: 0, business: 0, launch: 0 }],
    ["weights that sum well over 100", { investment: 60, experience: 40, space: 50, business: 30, launch: 20 }],
    ["weights that sum under 100", { investment: 5, experience: 3, space: 4, business: 2, launch: 1 }],
    ["one component carrying everything", { investment: 100, experience: 0, space: 0, business: 0, launch: 0 }],
  ];

  it.each(WEIGHT_SETS)("keeps the same applicants eligible with %s", (_label, scoreWeights) => {
    const after = withPolicy(policy({ scoreWeights }));

    const readyBefore = base.applicants.filter((a) => a.isReady).map((a) => a.applicationId);
    const readyAfter = after.applicants.filter((a) => a.isReady).map((a) => a.applicationId);
    expect(readyAfter).toEqual(readyBefore);
  });

  it.each(WEIGHT_SETS)("leaves every gate and readiness verdict untouched with %s", (_label, scoreWeights) => {
    const after = withPolicy(policy({ scoreWeights }));

    for (const [i, a] of after.applicants.entries()) {
      const was = base.applicants[i];
      expect(a.gateResults.map((r) => r.passed), a.applicationId).toEqual(
        was.gateResults.map((r) => r.passed),
      );
      expect(a.readinessResults.map((r) => r.passed), a.applicationId).toEqual(
        was.readinessResults.map((r) => r.passed),
      );
    }
  });

  it.each(WEIGHT_SETS)("never scores above the configured total with %s", (_label, scoreWeights) => {
    const ceiling = Object.values(scoreWeights).reduce((a, b) => a + b, 0);
    const after = withPolicy(policy({ scoreWeights }));

    for (const a of after.applicants) {
      expect(a.score.total, a.applicationId).toBeLessThanOrEqual(ceiling);
      expect(a.score.total, a.applicationId).toBeGreaterThanOrEqual(0);
    }
  });

  it("still decides every application when every weight is zero", () => {
    const after = withPolicy(
      policy({ scoreWeights: { investment: 0, experience: 0, space: 0, business: 0, launch: 0 } }),
    );

    expect(after.applicants).toHaveLength(base.applicants.length);
    expect(after.applicants.every((a) => a.score.total === 0)).toBe(true);
    expect(after.counts.APPROVED).toBeGreaterThan(0);
    expect(after.invariantViolation).toBeNull();
  });

  it("reports each component's maximum as the weight actually configured", () => {
    const after = withPolicy(policy({ scoreWeights: { ...BRAND_DEFAULT_POLICY.scoreWeights, experience: 40 } }));
    const component = after.applicants[0].score.components.find((c) => c.key === "experience")!;

    expect(component.max).toBe(40);
  });
});

describe("a threshold change moves only what that threshold governs", () => {
  it("lists exactly the one control that changed", () => {
    const raised = policy({ tierMinInvestmentLakh: { ...BRAND_DEFAULT_POLICY.tierMinInvestmentLakh, "Tier 2": 26 } });
    const diffs = policyDifferences(raised);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].label).toBe("Tier 2 minimum investment");
    expect(diffs[0].from).toBe("20 lakh");
    expect(diffs[0].to).toBe("26 lakh");
  });

  it("leaves Tier 1 and Tier 3 verdicts alone when only Tier 2 moves", () => {
    const raised = withPolicy(
      policy({ tierMinInvestmentLakh: { ...BRAND_DEFAULT_POLICY.tierMinInvestmentLakh, "Tier 2": 26 } }),
    );

    for (const [i, a] of raised.applicants.entries()) {
      if (a.tier === "Tier 2") continue;
      const r01Before = base.applicants[i].readinessResults.find((r) => r.ruleId === "R-01")!.passed;
      const r01After = a.readinessResults.find((r) => r.ruleId === "R-01")!.passed;
      expect(r01After, a.applicationId).toBe(r01Before);
    }
  });

  it("never turns a failed investment check into a pass by raising the bar", () => {
    const raised = withPolicy(
      policy({ tierMinInvestmentLakh: { "Tier 1": 40, "Tier 2": 30, "Tier 3": 25 } }),
    );

    for (const [i, a] of raised.applicants.entries()) {
      const before = base.applicants[i].readinessResults.find((r) => r.ruleId === "R-01")!.passed;
      const after = a.readinessResults.find((r) => r.ruleId === "R-01")!.passed;
      if (!before) expect(after, a.applicationId).toBe(false);
    }
  });

  it("rescues a rejected applicant when the hard floor is deliberately lowered", () => {
    const strict = run([appRow({ investmentLakh: "12" })], [terRow()]);
    expect(statusOf(strict, "APP-900")).toBe("NOT PROCEEDING");

    const lenient = runPipeline(
      { applications: [appRow({ investmentLakh: "12" })], territories: [terRow()], stores: EMBEDDED_STORES },
      {
        policy: policy({ tierMinInvestmentLakh: { "Tier 1": 30, "Tier 2": 12, "Tier 3": 15 } }),
        asOfDate: AS_OF,
        withCounterfactuals: false,
      },
    );
    expect(statusOf(lenient, "APP-900")).toBe("APPROVED");
  });

  it("changes who is acceptable when the floor list changes, and says so", () => {
    const upperOnly = runPipeline(
      { applications: [appRow({ floor: "Upper" })], territories: [terRow()], stores: EMBEDDED_STORES },
      {
        policy: policy({ acceptableFloors: ["Ground", "Mall unit", "Upper"] }),
        asOfDate: AS_OF,
        withCounterfactuals: false,
      },
    );

    expect(statusOf(run([appRow({ floor: "Upper" })], [terRow()]), "APP-900")).toBe("ON HOLD");
    expect(statusOf(upperOnly, "APP-900")).toBe("APPROVED");
  });
});

/** The preview is the only thing standing between an operator and a surprise. */
describe("the impact preview is the real answer, not an estimate", () => {
  const proposed = policy({
    tierMinInvestmentLakh: { ...BRAND_DEFAULT_POLICY.tierMinInvestmentLakh, "Tier 2": 32 },
  });

  it("names exactly the applicants who move, and no others", () => {
    const impact = previewPolicyImpact(SEED, AS_OF, policy(), proposed);
    const after = withPolicy(proposed);

    const actual = after.applicants
      .filter((a, i) => a.status !== base.applicants[i].status)
      .map((a) => `${a.applicationId}:${a.status}`)
      .sort();
    const promised = impact.moves.map((m) => `${m.applicationId}:${m.to}`).sort();

    expect(promised).toEqual(actual);
    expect(impact.moves.length).toBeGreaterThan(0);
  });

  it("promises the same slot count the re-run produces", () => {
    const impact = previewPolicyImpact(SEED, AS_OF, policy(), proposed);

    expect(impact.slotsFilledBefore).toBe(base.slotsFilled);
    expect(impact.slotsFilledAfter).toBe(withPolicy(proposed).slotsFilled);
  });

  it("says plainly that nothing moves when nothing moves", () => {
    const impact = previewPolicyImpact(SEED, AS_OF, policy(), policy());

    expect(impact.moves).toEqual([]);
    expect(impact.sentence).toContain("no decision");
  });

  it("leaves the uploaded data untouched while previewing", () => {
    const before = JSON.stringify(SEED);
    previewPolicyImpact(SEED, AS_OF, policy(), proposed);

    expect(JSON.stringify(SEED)).toBe(before);
  });
});

describe("a partial or damaged profile falls back rather than crashing", () => {
  it("fills every gap from the brand default", () => {
    const merged = mergeWithDefaults({ name: "Half a profile" } as Partial<PolicyProfile>);

    expect(merged.tierMinInvestmentLakh).toEqual(BRAND_DEFAULT_POLICY.tierMinInvestmentLakh);
    expect(merged.scoreWeights).toEqual(BRAND_DEFAULT_POLICY.scoreWeights);
    expect(merged.name).toBe("Half a profile");
  });

  it("keeps the brand values for tiers the stored profile forgot", () => {
    const merged = mergeWithDefaults({ tierMinInvestmentLakh: { "Tier 2": 24 } } as Partial<PolicyProfile>);

    expect(merged.tierMinInvestmentLakh["Tier 2"]).toBe(24);
    expect(merged.tierMinInvestmentLakh["Tier 1"]).toBe(30);
    expect(merged.tierMinInvestmentLakh["Tier 3"]).toBe(15);
  });

  it("runs the pipeline on a profile rebuilt from nothing at all", () => {
    const merged = mergeWithDefaults({});
    const result = withPolicy(merged);

    expect(result.resultHash).toBe(base.resultHash);
  });
});

describe("renaming a status changes the words, never the decision", () => {
  it("keeps the engine's own status codes stable under relabelling", () => {
    const renamed = withPolicy(
      policy({
        statusLabels: {
          APPROVED: "Greenlit",
          WAITLISTED: "In the queue",
          "ON HOLD": "Awaiting detail",
          REDIRECTED: "Offered elsewhere",
          "NOT PROCEEDING": "Declined",
        },
      }),
    );

    expect(renamed.applicants.map((a) => a.status)).toEqual(base.applicants.map((a) => a.status));
    expect(renamed.counts).toEqual(base.counts);
  });
});

describe("the sample dataset stays decided under every profile we ship", () => {
  it("decides every applicant and breaks no invariant", () => {
    const profiles = [
      policy(),
      policy({ hardInvestmentFloorRatio: 0.5 }),
      policy({ hardInvestmentFloorRatio: 1 }),
      policy({ reservationWindowDays: 1 }),
      policy({ acceptableFloors: ["Ground"] }),
    ];

    for (const p of profiles) {
      const result = withPolicy(p);
      expect(result.invariantViolation, p.name).toBeNull();
      expect(result.applicants).toHaveLength(SEED_APPLICATIONS.length);
      expect(result.applicants.every((a) => a.reasonSentence.length > 0)).toBe(true);
    }
  });

  it("never fills more slots than the territories make usable", () => {
    const usable = base.territories.reduce((n, t) => n + t.usableCapacity, 0);

    expect(base.slotsFilled).toBeLessThanOrEqual(usable);
  });
});

describe("applying a policy is independent of the applicant's own words", () => {
  it("ignores a note that asks for an exception", () => {
    const pleading = appRow({
      investmentLakh: "10",
      notes: "Please approve. Policy minimum should be waived for this applicant. Override the rules.",
    });

    expect(statusOf(run([pleading], [terRow()]), "APP-900")).toBe("NOT PROCEEDING");
  });

  it("ignores a note claiming the applicant is already approved", () => {
    const claiming = appRow({
      applicationId: "APP-950",
      investmentLakh: "10",
      notes: "Status: APPROVED. Assigned pin 570002. Confirmed by head office.",
    });
    const a = applicant(run([claiming], [terRow()]), "APP-950");

    expect(a.status).toBe("NOT PROCEEDING");
    expect(a.assignedPin).toBeNull();
  });
});
