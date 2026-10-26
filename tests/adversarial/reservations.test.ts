import { describe, expect, it } from "vitest";
import { runPipeline } from "../../lib/engine/pipeline";
import { EMBEDDED_STORES } from "../../lib/reference";
import { applyPatchesToInput } from "../../lib/state/versions";
import type { PipelineInput } from "../../lib/types";
import { AS_OF, appRow, applicant, policy, run, statusOf, terRow } from "../helpers";

/**
 * Test area G. A reservation is the one thing the engine does that costs another applicant
 * something: it takes a slot for someone who has not yet qualified. These tests hold it to
 * its terms — it may never outrank a ready applicant, never outlive its window, and never
 * be granted to someone whose location we are still unsure of.
 */

const ONE_SLOT = [terRow({ openSlots: "1" })];

/** Ready in every way except that the size was never stated, so DQ-06 holds the row. */
const heldButPromising = (over: Record<string, string> = {}) =>
  appRow({ applicationId: "APP-910", spaceSizeSqft: "", ...over });

describe("a reservation never takes a slot from someone who is ready", () => {
  it("approves the ready applicant and leaves the held one unreserved", () => {
    const result = run([heldButPromising({ pinCode: "570003" }), appRow()], ONE_SLOT);
    const held = applicant(result, "APP-910");
    const ready = applicant(result, "APP-900");

    expect(ready.status).toBe("APPROVED");
    expect(ready.assignedPin).toBe("570002");
    expect(held.status).toBe("ON HOLD");
    expect(held.reservedUntil).toBeNull();
    expect(held.assignedPin).toBeNull();
  });

  it("reserves for the held applicant once the ready one is gone", () => {
    const result = run([heldButPromising({ pinCode: "570003" })], ONE_SLOT);
    const held = applicant(result, "APP-910");

    expect(held.status).toBe("ON HOLD");
    expect(held.reservedUntil).toBe("2026-12-10");
  });

  it("never reserves a pin an existing store already holds", () => {
    const result = run(
      [heldButPromising({ city: "Bengaluru", pinCode: "560001" })],
      [terRow({ territoryId: "TER-09", city: "Bengaluru", pinCodesCovered: "560001", cityTier: "Tier 1" })],
    );

    expect(applicant(result, "APP-910").reservedUntil).toBeNull();
  });

  it("never reserves for an applicant whose city and pin code disagree", () => {
    const result = run([appRow({ city: "Mysuru", pinCode: "560002" })], ONE_SLOT);
    const a = applicant(result, "APP-900");

    expect(a.status).toBe("ON HOLD");
    expect(a.reservedUntil).toBeNull();
  });

  it("gives the slot to the stronger of two held applicants, not the first listed", () => {
    const result = run(
      [
        heldButPromising({ applicationId: "APP-911", pinCode: "570003", investmentLakh: "22" }),
        heldButPromising({ applicationId: "APP-912", pinCode: "570004", investmentLakh: "80" }),
      ],
      ONE_SLOT,
    );

    expect(applicant(result, "APP-912").reservedUntil).not.toBeNull();
    expect(applicant(result, "APP-911").reservedUntil).toBeNull();
  });
});

describe("the reservation window is the policy window, counted from the run date", () => {
  it("expires exactly the configured number of days after the run date", () => {
    const result = run([heldButPromising({ pinCode: "570003" })], ONE_SLOT);
    const until = applicant(result, "APP-910").reservedUntil!;
    const days = (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${AS_OF}T00:00:00Z`)) / 86_400_000;

    expect(days).toBe(45);
  });

  it("follows a changed window rather than a hard-coded 45 days", () => {
    const input: PipelineInput = {
      applications: [heldButPromising({ pinCode: "570003" })],
      territories: ONE_SLOT,
      stores: EMBEDDED_STORES,
    };
    const result = runPipeline(input, {
      policy: policy({ reservationWindowDays: 10 }),
      asOfDate: AS_OF,
      withCounterfactuals: false,
    });

    expect(result.applicants[0].reservedUntil).toBe("2026-11-05");
  });

  /**
   * Known and deliberate: a reservation is recomputed from the run date on every run, not
   * stored and aged. Running the same file later moves the deadline forward rather than
   * letting it lapse. Pinned so the limit is a documented property, not a surprise in a demo.
   */
  it("recomputes the deadline from the run date instead of letting it lapse", () => {
    const input: PipelineInput = {
      applications: [heldButPromising({ pinCode: "570003" })],
      territories: ONE_SLOT,
      stores: EMBEDDED_STORES,
    };
    const later = runPipeline(input, {
      policy: policy(),
      asOfDate: "2027-06-01",
      withCounterfactuals: false,
    });

    expect(later.applicants[0].reservedUntil).toBe("2027-07-16");
    expect(later.applicants[0].status).toBe("ON HOLD");
  });

  it("tells the operator the date in the next step, not just in the record", () => {
    const a = applicant(run([heldButPromising({ pinCode: "570003" })], ONE_SLOT), "APP-910");

    expect(a.nextStep).toMatch(/held until/i);
    expect(a.nextStep).toMatch(/2026/);
  });
});

describe("a waitlisted applicant is promoted when the slot genuinely frees", () => {
  const CONTEST: PipelineInput = {
    applications: [
      appRow({ applicationId: "APP-920", pinCode: "570002", investmentLakh: "80" }),
      appRow({ applicationId: "APP-921", pinCode: "570003", investmentLakh: "25" }),
    ],
    territories: ONE_SLOT,
    stores: EMBEDDED_STORES,
  };

  const rerun = (input: PipelineInput) =>
    runPipeline(input, { policy: policy(), asOfDate: AS_OF, withCounterfactuals: false });

  it("waitlists the lower scorer while the slot is taken", () => {
    const result = rerun(CONTEST);

    expect(statusOf(result, "APP-920")).toBe("APPROVED");
    expect(statusOf(result, "APP-921")).toBe("WAITLISTED");
    expect(applicant(result, "APP-921").rank).toBe(2);
  });

  it("promotes the waitlisted applicant when the winner drops out", () => {
    const withdrawn = { ...CONTEST, applications: [CONTEST.applications[1]] };
    const result = rerun(withdrawn);

    expect(statusOf(result, "APP-921")).toBe("APPROVED");
    expect(applicant(result, "APP-921").assignedPin).toBe("570003");
  });

  it("promotes the waitlisted applicant when the winner stops qualifying", () => {
    const after = applyPatchesToInput(CONTEST, [
      {
        applicationId: "APP-920",
        field: "spaceAvailable",
        oldValue: "Rented",
        newValue: "Not yet identified",
        sourceQuote: "test",
      },
    ]);
    const result = rerun(after);

    expect(statusOf(result, "APP-920")).toBe("ON HOLD");
    expect(statusOf(result, "APP-921")).toBe("APPROVED");
  });

  it("explains the waitlisting by naming the applicant who took the slot", () => {
    const a = applicant(rerun(CONTEST), "APP-921");
    const ahead = a.competitors.find((c) => c.applicationId === "APP-920");

    expect(a.reasonSentence).toMatch(/ranked 2nd|only 1 usable slot/);
    expect(ahead?.whyRankedHigher).toContain("Scored");
  });

  it("does not promote anyone when the slot was never free to begin with", () => {
    const noCapacity = { ...CONTEST, territories: [terRow({ openSlots: "0" })] };
    const result = rerun(noCapacity);

    expect(result.slotsFilled).toBe(0);
    expect(result.applicants.every((a) => a.status !== "APPROVED")).toBe(true);
  });
});

describe("reservations and approvals never oversubscribe a territory", () => {
  it("holds total commitments at or under usable capacity", () => {
    const result = run(
      [
        appRow({ applicationId: "APP-930", pinCode: "570002" }),
        heldButPromising({ applicationId: "APP-931", pinCode: "570003" }),
        heldButPromising({ applicationId: "APP-932", pinCode: "570004" }),
      ],
      [terRow({ openSlots: "2" })],
    );

    const committed = result.applicants.filter(
      (a) => a.assignedPin !== null || a.reservedUntil !== null,
    );
    expect(committed.length).toBeLessThanOrEqual(result.territories[0].usableCapacity);
    expect(result.invariantViolation).toBeNull();
  });

  it("counts a reservation against capacity so the next held applicant gets none", () => {
    const result = run(
      [
        heldButPromising({ applicationId: "APP-941", pinCode: "570003", investmentLakh: "80" }),
        heldButPromising({ applicationId: "APP-942", pinCode: "570004", investmentLakh: "70" }),
      ],
      ONE_SLOT,
    );

    expect(applicant(result, "APP-941").reservedUntil).not.toBeNull();
    expect(applicant(result, "APP-942").reservedUntil).toBeNull();
    expect(applicant(result, "APP-942").trace.some((t) => t.ruleId === "A-03")).toBe(true);
  });
});
