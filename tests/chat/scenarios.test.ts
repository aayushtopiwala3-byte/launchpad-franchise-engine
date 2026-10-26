import { describe, expect, it } from "vitest";
import { answerQuestion } from "../../lib/ai/answer";
import { routeQuestion } from "../../lib/ai/router";
import { runPipeline } from "../../lib/engine/pipeline";
import { SEED_APPLICATIONS } from "../../lib/seed/applications";
import { SEED_STORES } from "../../lib/seed/stores";
import { SEED_TERRITORIES } from "../../lib/seed/territories";
import { applyPatchesToInput, diffSnapshots, snapshotOf } from "../../lib/state/versions";
import type { PipelineInput, PipelineResult } from "../../lib/types";
import { AS_OF, appRow, applicant, policy, run, statusOf, terRow } from "../helpers";

/**
 * Section 12's Chat list, end to end against the bundled seed rather than a fixture:
 * the sentence a judge types, routed with the AI off, applied, re-run, and checked
 * against the decision the spec promises. `tests/ai/router.test.ts` already pins the
 * pattern matching; what is pinned here is what the manager actually ends up seeing.
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

/** A question: routed and answered from the stored result, exactly as the page does it. */
const ask = (question: string, result: PipelineResult = seed) => {
  const route = routeQuestion(question, result);
  return { route, answer: answerQuestion(question, route, result, profile) };
};

/**
 * A stated fact: routed, applied to the raw rows and re-run, with the what-changed diff
 * the chat prints underneath. Mirrors `runPatches` on app/chat/page.tsx.
 */
const tell = (
  question: string,
  input: PipelineInput,
  before: PipelineResult,
  context?: { applicationIds: string[] },
) => {
  const route = routeQuestion(question, before, context);
  const next = applyPatchesToInput(input, route.patches);
  const after = rerun(next);
  return {
    route,
    input: next,
    after,
    diff: diffSnapshots(snapshotOf(before), snapshotOf(after), after.applicants),
  };
};

/** Whose status really moved, worked out from the two results rather than from the diff. */
const movedBetween = (before: PipelineResult, after: PipelineResult) => {
  const prior = new Map(before.applicants.map((a) => [a.key, a.status]));
  return after.applicants.filter((a) => prior.get(a.key) !== a.status).map((a) => a.applicationId);
};

describe("the chat scenarios section 12 asks a judge to type, with the AI off", () => {
  it("runs the bundled seed the sample button runs", () => {
    expect(seed.resultHash).toBe("fdcce84f");
    expect(seed.applicants).toHaveLength(28);
    expect(seed.territories).toHaveLength(8);
  });

  it("answers every one of the six questions without reaching for the AI", () => {
    const questions = [
      "Why is APP-007 on hold?",
      "APP-013 has secured a ground-floor shop of 500 sq ft",
      "APP-012 has now found a ground-floor space",
      "Who else wanted TER-03?",
      "Which territories still have free slots?",
      "Why is APP-099 on hold?",
    ];
    expect(questions.map((q) => routeQuestion(q, seed).deterministic)).toEqual(
      questions.map(() => true),
    );
  });

  it("explains APP-007's hold with R-03, the floor the file holds, the unlock condition and the reservation deadline", () => {
    const a = applicant(seed, "APP-007");
    const { route, answer } = ask("Why is APP-007 on hold?");

    expect(route.intent).toBe("explain");
    expect(answer.citations.map((c) => c.ruleId)).toContain("R-03");
    // The floor is whatever the file says, not whatever the question implied.
    expect(a.normalised.floor).toBe("Upper");
    expect(answer.text).toContain(a.normalised.floor as string);
    expect(a.unlockCondition).toBeTruthy();
    expect(answer.text).toContain(a.unlockCondition as string);

    const spoken = [answer.text, ...answer.citations.map((c) => c.detail)].join(" ");
    expect(a.reservedUntil).toBe("2026-12-10");
    expect(spoken).toMatch(/2026-12-10|10 Dec 2026/);
  });

  it("moves APP-013 from on hold to approved on a ground-floor shop of 500 sq ft", () => {
    expect(statusOf(seed, "APP-013")).toBe("ON HOLD");
    const { route, after } = tell(
      "APP-013 has secured a ground-floor shop of 500 sq ft",
      SEED,
      seed,
    );

    expect(route.intent).toBe("update");
    expect(route.patches.map((p) => [p.field, p.newValue])).toEqual([
      ["spaceAvailable", "Rented"],
      ["spaceSizeSqft", "500"],
      ["floor", "Ground"],
    ]);
    expect(statusOf(after, "APP-013")).toBe("APPROVED");
    expect(applicant(after, "APP-013").assignedPin).toBe("580029");
    expect(after.invariantViolation).toBeNull();
  });

  it("names every applicant whose status moved in the what-changed list, not only the one patched", () => {
    const { after, diff } = tell("APP-013 has secured a ground-floor shop of 500 sq ft", SEED, seed);

    const moved = movedBetween(seed, after);
    expect(moved).toContain("APP-013");
    expect(diff.filter((d) => d.fromStatus !== d.toStatus).map((d) => d.applicationId)).toEqual(
      moved,
    );
    expect(diff.find((d) => d.applicationId === "APP-013")).toMatchObject({
      applicantName: "Yashoda Bai",
      fromStatus: "ON HOLD",
      toStatus: "APPROVED",
    });
  });

  it("applies space and floor when APP-012 finds a ground-floor space", () => {
    const { route, after } = tell("APP-012 has now found a ground-floor space", SEED, seed);

    expect(route.intent).toBe("update");
    expect(route.patches.map((p) => [p.field, p.newValue])).toEqual([
      ["spaceAvailable", "Rented"],
      ["floor", "Ground"],
    ]);
    expect(applicant(after, "APP-012").raw.spaceAvailable).toBe("Rented");
    expect(applicant(after, "APP-012").raw.floor).toBe("Ground");
  });

  it("leaves APP-012 on hold because the size is still unknown, and says which field", () => {
    const { after, diff } = tell("APP-012 has now found a ground-floor space", SEED, seed);
    const a = applicant(after, "APP-012");

    expect(a.status).toBe("ON HOLD");
    // One field is outstanding, and the operator is told which one by name.
    const outstanding = a.issues.filter((i) => i.confirmField);
    expect(outstanding.map((i) => i.confirmField)).toEqual(["Space size (sq ft)"]);
    expect(a.unlockCondition).toContain("Space size (sq ft)");
    expect(diff.find((d) => d.applicationId === "APP-012")?.toReason).toContain("Space size");
    expect(ask("why is APP-012 on hold?", after).answer.text).toContain("Space size (sq ft)");
  });

  it("never writes a space size the manager did not state", () => {
    const { route, after } = tell("APP-012 has now found a ground-floor space", SEED, seed);

    expect(route.patches.some((p) => p.field === "spaceSizeSqft")).toBe(false);
    expect(applicant(after, "APP-012").raw.spaceSizeSqft).toBe("");
    expect(applicant(after, "APP-012").normalised.spaceSizeSqft).toBeNull();
  });

  it("approves APP-012 once the manager states the size in the follow-up", () => {
    const first = tell("APP-012 has now found a ground-floor space", SEED, seed);
    const second = tell("APP-012 has now got 450 sq ft", first.input, first.after);

    expect(second.route.patches.map((p) => [p.field, p.newValue])).toEqual([
      ["spaceSizeSqft", "450"],
    ]);
    expect(statusOf(second.after, "APP-012")).toBe("APPROVED");
    expect(applicant(second.after, "APP-012").assignedPin).toBe("580023");
    expect(second.diff.find((d) => d.applicationId === "APP-012")).toMatchObject({
      fromStatus: "ON HOLD",
      toStatus: "APPROVED",
    });
    expect(second.after.invariantViolation).toBeNull();
  });

  it("carries APP-012 over into a bare 'it is 450 sq ft' follow-up and approves them", () => {
    const first = tell("APP-012 has now found a ground-floor space", SEED, seed);
    // What the chat page carries forward: the applicants the previous turn named.
    const second = tell("it is 450 sq ft", first.input, first.after, {
      applicationIds: first.route.applicationIds,
    });

    expect(second.route.deterministic).toBe(true);
    expect(second.route.patches.map((p) => [p.applicationId, p.field, p.newValue])).toEqual([
      ["APP-012", "spaceSizeSqft", "450"],
    ]);
    expect(statusOf(second.after, "APP-012")).toBe("APPROVED");
  });

  it("lists everyone who wanted TER-03 in the territory's rank order with their scores", () => {
    const queue = seed.territories.find((t) => t.territoryId === "TER-03")!.queue;
    const { route, answer } = ask("Who else wanted TER-03?");

    expect(route.intent).toBe("competitors");
    expect([...answer.text.matchAll(/APP-\d+/g)].map((m) => m[0])).toEqual(
      queue.map((q) => q.applicationId),
    );
    expect(answer.applicationIds).toEqual(queue.map((q) => q.applicationId));
    for (const q of queue) {
      expect(answer.text).toMatch(new RegExp(`${q.applicationId}[^;]*scored ${q.score}`));
    }
  });

  it("names exactly the territories the board shows as still having room", () => {
    const { route, answer } = ask("Which territories still have free slots?");
    expect(route.intent).toBe("capacity");

    // The board's own measure: the engine fills this in only where capacity is left over.
    const withRoom = seed.territories.filter((t) => t.unfilledSlotBlocker !== null);
    const named = seed.territories.filter((t) => answer.text.includes(`${t.territoryId} (`));
    expect(named).toEqual(withRoom);

    // On the seed every usable slot is taken, so the answer must say so rather than list.
    expect(withRoom).toHaveLength(0);
    expect(seed.slotsFilled).toBe(8);
    expect(answer.text).toBe("Every territory with usable capacity is full.");
  });

  /**
   * `usableCapacity` is already net of the pins existing stores sit on, so counting every
   * pin holder against it subtracts those stores a second time. The seed hides this (every
   * usable slot is taken either way), so the case is built rather than borrowed.
   */
  it("counts a free slot in a territory an existing store already sits in", () => {
    const result = run(
      [appRow({ applicationId: "APP-900", pinCode: "570002" })],
      [terRow({ territoryId: "TER-01", pinCodesCovered: "570002, 570003, 570004", openSlots: "2" })],
      {
        stores: [
          { storeId: "ST-99", city: "Mysuru", pinCode: "570004", opened: "2024-01-01", source: "embedded" },
        ],
      },
    );

    const t = result.territories[0];
    expect(statusOf(result, "APP-900")).toBe("APPROVED");
    // One store pin, one approved pin — but only the approved one consumed a slot.
    expect(Object.keys(t.pinHolders)).toHaveLength(2);
    expect(t.usableCapacity).toBe(2);
    expect(t.unfilledSlotBlocker).toContain("1 slot");

    const { answer } = ask("Which territories still have free slots?", result);
    expect(answer.text).toContain("TER-01");
    expect(answer.text).toContain("has 1 free");
  });

  it("says plainly that APP-099 is not in the uploaded file", () => {
    const { answer } = ask("Why is APP-099 on hold?");
    expect(answer.text).toBe("APP-099 is not in the uploaded file.");
    expect(answer.citations).toEqual([]);
  });
});
