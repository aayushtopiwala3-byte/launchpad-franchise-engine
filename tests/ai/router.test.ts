import { describe, expect, it } from "vitest";
import { answerQuestion } from "../../lib/ai/answer";
import { ground, groundPatches, routeQuestion } from "../../lib/ai/router";
import type { Patch } from "../../lib/types";
import { policy, runSeed } from "../helpers";

const result = runSeed();
const profile = policy();

const ask = (q: string) => {
  const route = routeQuestion(q, result);
  return { route, answer: answerQuestion(q, route, result, profile) };
};

describe("deterministic chat router", () => {
  it("answers 'why' without AI and cites rule IDs", () => {
    const { route, answer } = ask("why is APP-020 on hold?");
    expect(route.intent).toBe("explain");
    expect(route.deterministic).toBe(true);
    expect(answer.text).toContain("APP-020");
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.citations.some((c) => c.ruleId === "S-01")).toBe(true);
  });

  it("routes a status question", () => {
    const { route, answer } = ask("status of APP-002");
    expect(route.intent).toBe("status");
    expect(route.deterministic).toBe(true);
    expect(answer.text).toContain("APP-002");
    expect(answer.text).toContain("Next step:");
  });

  it("routes 'what is happening with'", () => {
    expect(routeQuestion("what's happening with APP-002?", result).intent).toBe("status");
    expect(routeQuestion("what is happening to APP-002", result).intent).toBe("status");
  });

  it("routes a competitor question about a territory", () => {
    const { route, answer } = ask("who else wanted TER-01?");
    expect(route.intent).toBe("competitors");
    expect(answer.text).toMatch(/applicants? mapped to TER-01|Nobody applied/);
  });

  it("routes a capacity question", () => {
    const { route, answer } = ask("which territories still have free slots?");
    expect(route.intent).toBe("capacity");
    expect(answer.text).toMatch(/territor/);
  });

  it("routes a counts question and names the applicants", () => {
    const { route, answer } = ask("how many approved?");
    expect(route.intent).toBe("counts");
    const approved = result.applicants.filter((a) => a.status === "APPROVED");
    expect(answer.text).toContain(String(approved.length));
    expect(answer.applicationIds).toHaveLength(approved.length);
  });

  it("turns a stated new fact into a patch rather than an answer", () => {
    const { route } = ask("APP-020 has raised their investment to 30 lakh");
    expect(route.intent).toBe("update");
    expect(route.patches).toHaveLength(1);
    expect(route.patches[0]).toMatchObject({
      applicationId: "APP-020",
      field: "investmentLakh",
      newValue: "30",
    });
    // The quote must be the manager's own words, so the audit trail is real.
    expect(route.patches[0].sourceQuote).toContain("raised their investment");
  });

  it("reads the old value from the dataset, never inventing one", () => {
    const { route } = ask("APP-012 has found a shop");
    expect(route.patches[0].oldValue).toBe(
      result.applicants.find((a) => a.applicationId === "APP-012")?.raw.spaceAvailable,
    );
  });

  it("turns one sentence carrying two facts into two patches", () => {
    const { route } = ask("APP-012 has found a shop on the ground floor");
    expect(route.patches.map((p) => p.field).sort()).toEqual(["floor", "spaceAvailable"]);
    expect(route.patches.every((p) => p.sourceQuote.includes("ground floor"))).toBe(true);
  });

  it("proposes nothing when the file already says what the manager just said", () => {
    // APP-019 is already Rented on the ground floor, so there is nothing to change.
    expect(ask("APP-019 has found a shop on the ground floor").route.patches).toHaveLength(0);
  });

  it("says so out loud rather than falling silent when nothing changed", () => {
    const { route, answer } = ask("APP-019 has found a shop on the ground floor");
    expect(route.intent).toBe("no-change");
    expect(route.deterministic).toBe(true);
    expect(answer.text).toContain("Nothing to change");
    expect(answer.text).toContain("APP-019");
    expect(answer.text).toContain("Floor is already Ground");
  });

  it("sees past a differently worded cell when deciding nothing changed", () => {
    // APP-020's Floor cell reads "ground floor"; restating it is still not a change.
    expect(ask("APP-020 has found a shop on the ground floor").route.patches).toHaveLength(0);
  });

  it("says plainly when an application is not in the file", () => {
    const { answer } = ask("why is APP-099 on hold?");
    expect(answer.text).toBe("APP-099 is not in the uploaded file.");
    expect(answer.citations).toEqual([]);
  });

  it("hands an unmatched question to the AI instead of guessing", () => {
    const route = routeQuestion("what do you reckon about the Mysuru market overall?", result);
    expect(route.intent).toBe("unknown");
    expect(route.deterministic).toBe(false);
  });

  it("never invents a value when the manager states no number", () => {
    const { route } = ask("APP-020 has increased their investment");
    expect(route.patches).toHaveLength(0);
    // No value was readable, so this is not a "nothing changed" either.
    expect(route.intent).not.toBe("no-change");
  });
});

describe("grounding the AI's proposed patches", () => {
  const aiPatch = (over: Partial<Patch> = {}): Patch => ({
    applicationId: "APP-012",
    field: "spaceAvailable",
    oldValue: "whatever the model felt like",
    newValue: "Rented",
    sourceQuote: "they have signed a lease",
    ...over,
  });

  it("replaces the model's old value with the one in the file", () => {
    const [patch] = groundPatches([aiPatch()], result);
    expect(patch.oldValue).toBe(
      result.applicants.find((a) => a.applicationId === "APP-012")?.raw.spaceAvailable,
    );
  });

  it("drops a change the file already reflects", () => {
    // APP-019 is already Rented, however confidently the model proposes it.
    expect(groundPatches([aiPatch({ applicationId: "APP-019" })], result)).toHaveLength(0);
  });

  it("keeps an already-true fact aside so the answer can name it", () => {
    const { applied, unchanged } = ground([aiPatch({ applicationId: "APP-019" })], result);
    expect(applied).toHaveLength(0);
    expect(unchanged).toMatchObject([{ applicationId: "APP-019", newValue: "Rented" }]);
  });

  it("drops a patch against an application that is not in the file", () => {
    expect(groundPatches([aiPatch({ applicationId: "APP-099" })], result)).toHaveLength(0);
  });

  it("drops a patch against a field the chat is not allowed to set", () => {
    expect(groundPatches([aiPatch({ field: "applicantName" })], result)).toHaveLength(0);
  });

  it("canonicalises the model's wording before comparing or writing", () => {
    const [patch] = groundPatches(
      [aiPatch({ applicationId: "APP-012", field: "floor", newValue: "ground floor" })],
      result,
    );
    expect(patch.newValue).toBe("Ground");
  });

  it("recognises the model's loose wording as no change at all", () => {
    // APP-019 is already on the ground floor, however the model chooses to phrase it.
    const patches = groundPatches(
      [aiPatch({ applicationId: "APP-019", field: "floor", newValue: "ground floor" })],
      result,
    );
    expect(patches).toHaveLength(0);
  });

  it("refuses a value it cannot read rather than writing the model's prose", () => {
    const patches = groundPatches(
      [aiPatch({ field: "floor", newValue: "somewhere upstairs-ish, they think" })],
      result,
    );
    expect(patches).toHaveLength(0);
  });
});
