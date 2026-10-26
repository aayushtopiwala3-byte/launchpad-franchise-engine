import { describe, expect, it } from "vitest";
import { classifyBusinessFallback, detectContradictionsFallback } from "../../lib/ai/fallbacks";
import { runPipeline } from "../../lib/engine/pipeline";
import type { Contradiction } from "../../lib/engine/quality";
import { SEED_APPLICATIONS } from "../../lib/seed/applications";
import { SEED_STORES } from "../../lib/seed/stores";
import { SEED_TERRITORIES } from "../../lib/seed/territories";
import { ALL_OFF, ALL_ON, FEATURE_KEYS, FEATURE_PRESETS } from "../../lib/state/features";
import type { BusinessClassification, FeatureFlags, PipelineResult } from "../../lib/types";
import { AS_OF, policy, runSeed } from "../helpers";

const INPUT = {
  applications: SEED_APPLICATIONS,
  territories: SEED_TERRITORIES,
  stores: SEED_STORES,
};

/**
 * Stands in for a model that read the same free text and reached the same reading. This is
 * what the live model actually returned on this dataset, so the comparison is the real one.
 */
const agreeingAi = () => {
  const classifications = new Map<string, BusinessClassification>();
  const contradictions = new Map<string, Contradiction[]>();
  for (const a of runSeed().applicants) {
    classifications.set(a.applicationId, { ...a.businessClassification, source: "ai" });
    contradictions.set(a.applicationId, detectContradictionsFallback(a.normalised));
  }
  return { classifications, contradictions };
};

const AI = agreeingAi();

/**
 * The only switches the engine is even offered. Everything else in FeatureFlags is
 * presentation, and is spread in here so a future wiring mistake fails this test.
 */
function runWith(flags: FeatureFlags): PipelineResult {
  return runPipeline(INPUT, {
    ...flags,
    policy: policy(),
    asOfDate: AS_OF,
    withCounterfactuals: flags.counterfactuals,
    classifications: flags.aiExplanations ? AI.classifications : undefined,
    contradictions: flags.aiContradictionCheck ? AI.contradictions : undefined,
  });
}

/** Everything a judge would call "the decision". Deliberately excludes wording. */
const verdicts = (result: PipelineResult) =>
  result.applicants.map((a) => ({
    applicationId: a.applicationId,
    status: a.status,
    reasonCode: a.reasonCode,
    score: a.score.total,
    rank: a.rank,
    territoryId: a.territoryId,
    assignedPin: a.assignedPin,
    reservedUntil: a.reservedUntil,
  }));

const allocation = (result: PipelineResult) =>
  result.territories.map((t) => ({ territoryId: t.territoryId, pinHolders: t.pinHolders }));

describe("display switches never change a verdict", () => {
  const off = runWith(ALL_OFF);
  const on = runWith(ALL_ON);

  it("decides every applicant the same way with everything off as with everything on", () => {
    expect(verdicts(on)).toEqual(verdicts(off));
  });

  it("fills the same pins in the same territories either way", () => {
    expect(allocation(on)).toEqual(allocation(off));
    expect(on.slotsFilled).toBe(off.slotsFilled);
  });

  it("reaches the same counts either way", () => {
    expect(on.counts).toEqual(off.counts);
  });

  it("breaks no invariant in either direction", () => {
    expect(off.invariantViolation).toBeNull();
    expect(on.invariantViolation).toBeNull();
  });

  it("agrees across every shipped preset too", () => {
    const baseline = verdicts(off);
    for (const [name, preset] of Object.entries(FEATURE_PRESETS)) {
      expect(verdicts(runWith(preset)), `preset ${name} changed a verdict`).toEqual(baseline);
    }
  });

  it("agrees when each switch is flipped on its own", () => {
    const baseline = verdicts(off);
    for (const key of FEATURE_KEYS) {
      const flags = { ...ALL_OFF, [key]: true };
      expect(verdicts(runWith(flags)), `switch ${key} changed a verdict`).toEqual(baseline);
    }
  });
});

describe("what the switches do change", () => {
  it("offers counterfactuals only when that switch is on", () => {
    const off = runWith(ALL_OFF);
    const on = runWith({ ...ALL_OFF, counterfactuals: true });
    expect(off.applicants.every((a) => a.counterfactual.length === 0)).toBe(true);
    expect(on.applicants.some((a) => a.counterfactual.length > 0)).toBe(true);
  });

  it("marks the business reading as AI-sourced only when AI is on", () => {
    expect(
      runWith(ALL_OFF).applicants.every((a) => a.businessClassification.source === "fallback"),
    ).toBe(true);
    expect(
      runWith({ ...ALL_OFF, aiExplanations: true }).applicants.every(
        (a) => a.businessClassification.source === "ai",
      ),
    ).toBe(true);
  });
});

describe("a model that disagrees can add a finding, never silence one", () => {
  const silentAi = new Map(
    SEED_APPLICATIONS.map((r) => [r.applicationId, [] as Contradiction[]]),
  );

  it("keeps every deterministic finding when the model reports nothing", () => {
    const off = runWith(ALL_OFF);
    const withSilentAi = runPipeline(INPUT, {
      policy: policy(),
      asOfDate: AS_OF,
      withCounterfactuals: false,
      contradictions: silentAi,
    });
    expect(verdicts(withSilentAi)).toEqual(verdicts(off));
    expect(withSilentAi.issues.filter((i) => i.id === "DQ-13")).toHaveLength(
      off.issues.filter((i) => i.id === "DQ-13").length,
    );
  });

  it("still reads the business text itself when the model returns nothing for a row", () => {
    const partial = new Map([
      ["APP-001", { ...classifyBusinessFallback("Runs a pharmacy"), source: "ai" as const }],
    ]);
    const result = runPipeline(INPUT, {
      policy: policy(),
      asOfDate: AS_OF,
      withCounterfactuals: false,
      classifications: partial,
    });
    expect(verdicts(result)).toEqual(verdicts(runWith(ALL_OFF)));
  });
});
