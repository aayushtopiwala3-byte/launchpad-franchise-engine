import { describe, expect, it } from "vitest";
import { answerQuestion } from "../../lib/ai/answer";
import { routeQuestion } from "../../lib/ai/router";
import { runPipeline } from "../../lib/engine/pipeline";
import { SEED_APPLICATIONS } from "../../lib/seed/applications";
import { SEED_STORES } from "../../lib/seed/stores";
import { SEED_TERRITORIES } from "../../lib/seed/territories";
import { applyPatchesToInput } from "../../lib/state/versions";
import type { PipelineInput, PipelineResult } from "../../lib/types";
import { AS_OF, policy } from "../helpers";

/**
 * The twelve chat sequences a judge was told to try, with the AI off so only the
 * deterministic router is under test. The rule being defended throughout: a sentence may
 * change one applicant's one field, or it may ask for clarification, but it may never
 * quietly pick an applicant the manager did not name.
 */
const profile = policy();

const SEED: PipelineInput = {
  applications: SEED_APPLICATIONS,
  territories: SEED_TERRITORIES,
  stores: SEED_STORES,
};

const rerun = (input: PipelineInput): PipelineResult =>
  runPipeline(input, { policy: profile, asOfDate: AS_OF, withCounterfactuals: false });

const seed = rerun(SEED);

const route = (q: string, context?: { applicationIds: string[] }) =>
  routeQuestion(q, seed, context);

const answerFor = (q: string) => answerQuestion(q, route(q), seed, profile);

describe("questions answer without touching the data", () => {
  it("explains a held applicant and proposes nothing", () => {
    const r = route("Why is APP-007 on hold?");

    expect(r.intent).toBe("explain");
    expect(r.patches).toEqual([]);
    expect(r.applicationIds).toEqual(["APP-007"]);
    expect(answerFor("Why is APP-007 on hold?").text).toContain("APP-007");
  });

  it("answers a counts question with no patches", () => {
    const r = route("How many applicants are approved?");

    expect(r.intent).toBe("counts");
    expect(r.patches).toEqual([]);
  });

  it("leaves the dataset byte-identical after a question", () => {
    const after = applyPatchesToInput(SEED, route("Why is APP-007 on hold?").patches);

    expect(after.applications).toEqual(SEED.applications);
    expect(rerun(after).resultHash).toBe(seed.resultHash);
  });
});

describe("a stated fact becomes a proposal for exactly one applicant", () => {
  it("reads the field and the value the manager actually typed", () => {
    const r = route("APP-012 has now found a ground-floor space.");

    expect(r.intent).toBe("update");
    expect(new Set(r.patches.map((p) => p.applicationId))).toEqual(new Set(["APP-012"]));
    expect(r.patches.map((p) => p.field).sort()).toEqual(["floor", "spaceAvailable"]);
    expect(r.patches.find((p) => p.field === "floor")?.newValue).toBe("Ground");
  });

  it("carries the applicant forward only for a sentence that points back", () => {
    const r = route("It is 450 sq ft.", { applicationIds: ["APP-012"] });

    expect(r.intent).toBe("update");
    expect(r.patches).toHaveLength(1);
    expect(r.patches[0]).toMatchObject({
      applicationId: "APP-012",
      field: "spaceSizeSqft",
      newValue: "450",
    });
  });

  it("re-reads the old value from the file rather than asserting one", () => {
    const r = route("Increase APP-012 investment capacity to 30 lakh.");
    const patch = r.patches.find((p) => p.field === "investmentLakh");
    const row = SEED.applications.find((a) => a.applicationId === "APP-012");

    expect(patch?.newValue).toBe("30");
    expect(patch?.oldValue).toBe(row?.investmentLakh);
  });

  it("takes a correction as a fresh proposal, not a compounding one", () => {
    const first = route("Increase APP-012 investment capacity to 30 lakh.");
    const corrected = route("Actually APP-012 investment should be 35 lakh.");

    expect(first.patches.find((p) => p.field === "investmentLakh")?.newValue).toBe("30");
    expect(corrected.patches.find((p) => p.field === "investmentLakh")?.newValue).toBe("35");
  });

  it("says the file already records a fact rather than proposing a no-op change", () => {
    const row = SEED.applications.find((a) => a.applicationId === "APP-012");
    const r = route(`APP-012 now has ${row?.investmentLakh} lakh investment.`);

    expect(r.intent).toBe("no-change");
    expect(r.patches).toEqual([]);
    expect(r.unchanged).not.toHaveLength(0);
  });
});

describe("ambiguity is never resolved by guessing", () => {
  it("refuses to guess which of two named applicants a fact belongs to", () => {
    const r = route("APP-007 and APP-012 have both now found a ground-floor space.");

    expect(r.patches.map((p) => p.applicationId)).not.toEqual(["APP-007"]);
    expect(r.intent).not.toBe("update");
  });

  it("refuses to guess when the manager says 'the second one'", () => {
    const r = route("Update the second one to 40 lakh investment.", {
      applicationIds: ["APP-007", "APP-012"],
    });

    expect(r.patches).toEqual([]);
    expect(r.intent).not.toBe("update");
  });

  it("refuses a pointing-back sentence when the last turn named two applicants", () => {
    const r = route("It has now found a ground-floor site.", {
      applicationIds: ["APP-007", "APP-012"],
    });

    expect(r.patches).toEqual([]);
    expect(r.intent).not.toBe("update");
  });

  it("does not update on a vague sentence with no field and no value", () => {
    const r = route("It is ready now.", { applicationIds: ["APP-012"] });

    expect(r.patches).toEqual([]);
    expect(r.intent).not.toBe("update");
  });

  it("does not update on a pronoun with no conversation behind it", () => {
    const r = route("It is ready now.");

    expect(r.patches).toEqual([]);
    expect(r.applicationIds).toEqual([]);
    expect(r.intent).not.toBe("update");
  });

  it("proposes nothing for an Application ID that is not in the file", () => {
    const r = route("APP-999 has now found a ground-floor space.");

    expect(r.patches).toEqual([]);
    expect(r.intent).not.toBe("update");
  });

  it("never writes a value the manager did not type", () => {
    const r = route("APP-012 has now found a space.");

    expect(r.patches.every((p) => p.newValue !== null && p.newValue !== "")).toBe(true);
    expect(r.patches.some((p) => p.field === "spaceSizeSqft")).toBe(false);
  });
});

describe("a hypothetical is not an instruction", () => {
  it("does not mutate anything when asked what would happen", () => {
    const r = route("What if APP-012 had 600 sq ft?");
    const after = applyPatchesToInput(SEED, r.patches);

    expect(r.intent).not.toBe("update");
    expect(after.applications).toEqual(SEED.applications);
    expect(rerun(after).resultHash).toBe(seed.resultHash);
  });
});
