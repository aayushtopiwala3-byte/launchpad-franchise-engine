import { describe, expect, it } from "vitest";
import type { Applicant, Status } from "../../lib/types";
import { appRow, applicant, run, runSeed, statusOf, terRow } from "../helpers";

/**
 * Test area E. A decision is only as good as the sentence under it. These tests hold the
 * explanation to the decision: every outcome must be reachable from the trace, no sentence
 * may claim a fact the file does not hold, and no score may talk its way past a hard rule.
 */

const seed = runSeed();

/** Every rule namespace in the engine. None of these may leak into operator-facing prose. */
const RULE_CODE = /\b(?:G-\d{2}|R-\d{2}|A-\d{2}|S-\d{2}|DQ-\d{2}|N-\d{2})\b/;

describe("every applicant in the sample set is internally consistent", () => {
  const all = seed.applicants;

  it("gives every applicant a status, a reason and a next step", () => {
    for (const a of all) {
      expect(a.reasonSentence.trim().length, a.applicationId).toBeGreaterThan(0);
      expect(a.nextStep.trim().length, a.applicationId).toBeGreaterThan(0);
      expect(a.reasonCode, a.applicationId).toMatch(RULE_CODE);
    }
  });

  it("keeps rule codes out of the sentences an operator reads", () => {
    for (const a of all) {
      expect(a.reasonSentence, a.applicationId).not.toMatch(RULE_CODE);
      expect(a.nextStep, a.applicationId).not.toMatch(RULE_CODE);
      if (a.unlockCondition) expect(a.unlockCondition, a.applicationId).not.toMatch(RULE_CODE);
    }
  });

  it("traces every gate and readiness rule for every applicant", () => {
    for (const a of all) {
      const traced = new Set(a.trace.map((t) => t.ruleId));
      for (const r of [...a.gateResults, ...a.readinessResults]) {
        expect(traced.has(r.ruleId), `${a.applicationId} missing ${r.ruleId}`).toBe(true);
      }
      expect(traced.has("S-01"), a.applicationId).toBe(true);
    }
  });

  it("never writes the word undefined or null into a sentence", () => {
    for (const a of all) {
      for (const sentence of [a.reasonSentence, a.nextStep, a.unlockCondition ?? ""]) {
        expect(sentence, a.applicationId).not.toMatch(/\b(undefined|null|NaN)\b/);
      }
    }
  });
});

/** Each status carries a promise about the rest of the record. These are those promises. */
describe("a status implies the record that justifies it", () => {
  const check: Record<Status, (a: Applicant) => void> = {
    APPROVED: (a) => {
      expect(a.assignedPin, a.applicationId).not.toBeNull();
      expect(a.territoryId, a.applicationId).not.toBeNull();
      expect(a.gateResults.every((r) => r.passed), a.applicationId).toBe(true);
      expect(a.readinessResults.every((r) => r.passed), a.applicationId).toBe(true);
      expect(a.reservedUntil, a.applicationId).toBeNull();
      expect(a.onboardingPlan, a.applicationId).not.toBeNull();
    },
    WAITLISTED: (a) => {
      expect(a.assignedPin, a.applicationId).toBeNull();
      expect(a.rank, a.applicationId).not.toBeNull();
    },
    REDIRECTED: (a) => {
      expect(a.suggestedPins.length, a.applicationId).toBeGreaterThan(0);
      expect(a.assignedPin, a.applicationId).toBeNull();
      // Advice costs nothing: a redirect must not be holding the pin it was offered.
      expect(a.reservedUntil, a.applicationId).toBeNull();
    },
    "ON HOLD": (a) => {
      expect(a.assignedPin, a.applicationId).toBeNull();
      expect(a.unlockCondition, a.applicationId).toBeTruthy();
    },
    "NOT PROCEEDING": (a) => {
      expect(a.assignedPin, a.applicationId).toBeNull();
      expect(a.reservedUntil, a.applicationId).toBeNull();
      const gate = a.gateResults.find((r) => !r.passed);
      expect(gate, `${a.applicationId} rejected with every gate passing`).toBeDefined();
    },
  };

  it("holds the promise for every applicant in the sample set", () => {
    for (const a of seed.applicants) check[a.status](a);
  });

  it("covers all five outcomes in the sample set, so the promises are exercised", () => {
    for (const status of Object.keys(check) as Status[]) {
      expect(seed.counts[status], status).toBeGreaterThan(0);
    }
  });
});

/**
 * The separation the case study asks for: eligibility is a gate, score is a ranking tool.
 * A perfect score must not reach past a failed gate, in any of the four ways one can fail.
 */
describe("score never overrides a hard requirement", () => {
  const PERFECT = {
    investmentLakh: "90",
    retailExperienceYears: "25",
    currentBusiness: "Owns a chain of retail stores",
    spaceAvailable: "Owned",
    spaceSizeSqft: "600",
    floor: "Ground",
    targetLaunchMonths: "12",
  };

  const BREAKS: [string, Record<string, string>][] = [
    ["a city we do not operate in", { city: "Nagpur", pinCode: "440001" }],
    ["a pin code holding one of our stores", { city: "Bengaluru", pinCode: "560001" }],
    ["a pin code outside every territory", { pinCode: "570099" }],
    ["a city and pin code that disagree", { city: "Mysuru", pinCode: "560002" }],
  ];

  it.each(BREAKS)("refuses to approve a top-scoring applicant with %s", (_label, over) => {
    const result = run([appRow({ ...PERFECT, ...over })], [terRow()]);
    const a = applicant(result, "APP-900");

    expect(a.score.total).toBeGreaterThan(70);
    expect(a.status).not.toBe("APPROVED");
    expect(a.assignedPin).toBeNull();
  });

  it("approves the identical applicant once the gate is satisfied", () => {
    expect(statusOf(run([appRow(PERFECT)], [terRow()]), "APP-900")).toBe("APPROVED");
  });

  it("ranks on score but gates first, so a lower scorer can beat a blocked one", () => {
    const result = run(
      [
        appRow({ applicationId: "APP-901", ...PERFECT, pinCode: "570099" }),
        appRow({ applicationId: "APP-902", investmentLakh: "22", retailExperienceYears: "1" }),
      ],
      [terRow()],
    );
    const blocked = applicant(result, "APP-901");
    const modest = applicant(result, "APP-902");

    expect(blocked.score.total).toBeGreaterThan(modest.score.total);
    expect(modest.status).toBe("APPROVED");
    expect(blocked.status).not.toBe("APPROVED");
  });
});

describe("the score itself is never invented", () => {
  it("adds up to the sum of its own components, every time", () => {
    for (const a of seed.applicants) {
      const sum = a.score.components.reduce((n, c) => n + c.points, 0);
      expect(a.score.total, a.applicationId).toBe(sum);
    }
  });

  it("never awards more than a component's stated maximum, nor less than zero", () => {
    for (const a of seed.applicants) {
      for (const c of a.score.components) {
        expect(c.points, `${a.applicationId} ${c.key}`).toBeLessThanOrEqual(c.max);
        expect(c.points, `${a.applicationId} ${c.key}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("states a basis for every component, so no point is unexplained", () => {
    for (const a of seed.applicants) {
      for (const c of a.score.components) {
        expect(c.basis.trim().length, `${a.applicationId} ${c.key}`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the ranking score out of the verdict for a rejected applicant", () => {
    const a = applicant(run([appRow({ investmentLakh: "10" })], [terRow()]), "APP-900");

    expect(a.status).toBe("NOT PROCEEDING");
    expect(a.reasonSentence).not.toMatch(/score/i);
  });
});

describe("competitors and ranks describe what actually happened", () => {
  it("names a real applicant in every competitor entry", () => {
    const ids = new Set(seed.applicants.map((a) => a.applicationId));
    for (const a of seed.applicants) {
      for (const c of a.competitors) {
        expect(ids.has(c.applicationId), `${a.applicationId} cites ${c.applicationId}`).toBe(true);
      }
    }
  });

  /**
   * A duplicate row carries the same Application ID as the original and sits on the same
   * pin, so the same-pin sweep picks it up as a rival. It is not one: it is the same
   * application, already held for confirmation and already barred from taking a slot.
   * Showing it as competing against itself reads as a system that lost track of who is who.
   */
  it("never lists an applicant as its own competitor", () => {
    for (const a of seed.applicants) {
      for (const c of a.competitors) {
        expect(c.applicationId, `${a.applicationId} competes with itself`).not.toBe(
          a.applicationId,
        );
      }
    }
  });

  it("agrees with the live status of the competitor it names", () => {
    for (const a of seed.applicants) {
      for (const c of a.competitors) {
        const live = seed.applicants
          .filter((x) => x.applicationId === c.applicationId)
          .map((x) => x.status);
        expect(live, `${a.applicationId} on ${c.applicationId}`).toContain(c.status);
      }
    }
  });

  it("explains a waitlisting by naming someone who really ranked higher", () => {
    const waitlisted = seed.applicants.filter((a) => a.status === "WAITLISTED" && a.isReady);
    expect(waitlisted.length).toBeGreaterThan(0);

    for (const a of waitlisted) {
      const ahead = a.competitors.filter((c) => c.whyRankedHigher);
      for (const c of ahead) {
        const rival = seed.applicants.find((x) => x.applicationId === c.applicationId)!;
        expect(rival.score.total, `${c.applicationId} vs ${a.applicationId}`).toBeGreaterThanOrEqual(
          a.score.total,
        );
      }
    }
  });
});

describe("dates and deadlines are only ever stated when one exists", () => {
  it("gives a reservation date only to an applicant actually holding a pin", () => {
    for (const a of seed.applicants) {
      if (a.reservedUntil === null) continue;
      expect(a.status, a.applicationId).toBe("ON HOLD");
      expect(a.reservedUntil, a.applicationId).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.reservedUntil! > seed.asOfDate, a.applicationId).toBe(true);
    }
  });

  it("writes an onboarding plan only where there is something to onboard", () => {
    for (const a of seed.applicants) {
      const expected = a.status === "APPROVED" || a.reservedUntil !== null;
      expect(a.onboardingPlan !== null, a.applicationId).toBe(expected);
    }
  });

  it("dates every onboarding milestone on or after the run date", () => {
    for (const a of seed.applicants) {
      if (!a.onboardingPlan) continue;
      for (const step of a.onboardingPlan.steps) {
        const where = `${a.applicationId} step ${step.number} ${step.title}`;
        expect(step.startDate >= seed.asOfDate, where).toBe(true);
        expect(step.endDate >= step.startDate, where).toBe(true);
      }
      expect(a.onboardingPlan.launchDate >= seed.asOfDate, a.applicationId).toBe(true);
    }
  });
});
