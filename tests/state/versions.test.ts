import { describe, expect, it } from "vitest";
import {
  applyPatchesToInput,
  diffSnapshots,
  invertPatches,
  makeVersion,
  snapshotOf,
  undoableVersion,
} from "../../lib/state/versions";
import { EMBEDDED_STORES } from "../../lib/reference";
import { appRow, applicant, run, statusOf, terRow } from "../helpers";
import type { Patch, PipelineInput, PipelineResult } from "../../lib/types";

/** Two runs of the same territory, the second with one applicant's investment raised. */
function pair(): [PipelineResult, PipelineResult] {
  const territories = [terRow({ territoryId: "TER-01", openSlots: "2" })];
  const rows = (lakh: string) => [
    appRow({ applicationId: "APP-100", pinCode: "570002", investmentLakh: "40" }),
    appRow({ applicationId: "APP-200", pinCode: "570003", investmentLakh: lakh }),
  ];
  return [run(rows("12"), territories), run(rows("45"), territories)];
}

/**
 * One chat update and its undo, carried through the same two steps the store takes: apply
 * the patches to the input, then re-run the rules over it. Nothing here replays a stored
 * result, because that is exactly the shortcut an undo must not take.
 *
 * The fixture is chosen so the patch moves two applicants rather than one. APP-200's own
 * verdict changes, and APP-100's rank slips only because somebody overtook them — a restore
 * that fixed the patched row and left that knock-on behind would still look undone if you
 * only ever checked the row that was patched.
 */
function undoCycle() {
  const territories = [terRow({ territoryId: "TER-01", openSlots: "2" })];
  const before: PipelineInput = {
    applications: [
      appRow({ applicationId: "APP-100", pinCode: "570002", investmentLakh: "40" }),
      appRow({ applicationId: "APP-200", pinCode: "570003", investmentLakh: "12" }),
    ],
    territories,
    stores: EMBEDDED_STORES,
  };
  // Exactly the shape ground() produces: oldValue re-read from APP-200's own raw cell.
  const patch: Patch = {
    applicationId: "APP-200",
    field: "investmentLakh",
    oldValue: "12",
    newValue: "45",
    sourceQuote: "They can put in 45 lakh now.",
  };
  const inverse = invertPatches([patch], "Undo of v2");
  const patched = applyPatchesToInput(before, [patch]);
  const undone = applyPatchesToInput(patched, inverse);
  const decide = (input: PipelineInput) =>
    run(input.applications, input.territories, { stores: input.stores });

  return {
    patch,
    inverse,
    before: decide(before),
    afterPatch: decide(patched),
    afterUndo: decide(undone),
  };
}

describe("version numbering", () => {
  it("starts at v1 when there is no history", () => {
    const [before] = pair();
    expect(makeVersion([], before, "upload", []).versionId).toBe("v1");
  });

  it("counts on from the last version, so trimming cannot repeat an id", () => {
    const [before, after] = pair();
    const v1 = makeVersion([], before, "upload", []);
    const v2 = makeVersion([v1], after, "chat-patch", []);
    // The oldest is dropped for storage, exactly as the persist step does.
    const v3 = makeVersion([v2], before, "chat-patch", []);
    expect([v1.versionId, v2.versionId, v3.versionId]).toEqual(["v1", "v2", "v3"]);
  });

  it("gives the first version an empty diff, because nothing moved to reach it", () => {
    const [before] = pair();
    expect(makeVersion([], before, "upload", []).diff).toEqual([]);
  });

  it("labels the trigger, and appends the detail when one is given", () => {
    const [before] = pair();
    expect(makeVersion([], before, "upload", []).label).toBe("Workbook uploaded");
    expect(makeVersion([], before, "upload", [], "Restored").label).toBe(
      "Workbook uploaded — Restored",
    );
  });
});

describe("diffing two snapshots", () => {
  it("carries the before and after of every field an operator reads", () => {
    const [before, after] = pair();
    const entries = diffSnapshots(snapshotOf(before), snapshotOf(after), after.applicants);
    const moved = entries.find((d) => d.applicationId === "APP-200")!;
    expect(moved.applicantName).toBe("Test Person");
    expect([moved.fromStatus, moved.toStatus]).toEqual(["NOT PROCEEDING", "APPROVED"]);
    expect([moved.fromScore, moved.toScore]).toEqual([70, 92]);
    expect(moved.toReason).toBe(after.applicants.find((a) => a.key === moved.key)?.reasonSentence);
  });

  /**
   * APP-100's own answer did not change, but a rival overtaking them pushed it to rank 2.
   * Being second in line is a real demotion, so it has to show up as a row with the rank
   * on it — otherwise the timeline prints a line that appears to say nothing.
   */
  it("reports an applicant whose rank slipped because somebody else improved", () => {
    const [before, after] = pair();
    const entries = diffSnapshots(snapshotOf(before), snapshotOf(after), after.applicants);
    const knockOn = entries.find((d) => d.applicationId === "APP-100")!;
    expect(knockOn.fromStatus).toBe(knockOn.toStatus);
    expect(knockOn.fromScore).toBe(knockOn.toScore);
    expect([knockOn.fromRank, knockOn.toRank]).toEqual([1, 2]);
  });

  it("treats an applicant absent from the earlier run as new, not as a change", () => {
    const [before] = pair();
    const entries = diffSnapshots([], snapshotOf(before), before.applicants);
    expect(entries).toHaveLength(before.applicants.length);
    expect(entries.every((d) => d.fromStatus === null)).toBe(true);
  });

  it("flags an applicant who held a pin before and does not now", () => {
    const [before] = pair();
    const held = snapshotOf(before).find((s) => s.assignedPin !== null);
    expect(held).toBeDefined();
    const after = snapshotOf(before).map((s) => ({ ...s, assignedPin: null }));
    const entries = diffSnapshots(snapshotOf(before), after, before.applicants);
    expect(entries.find((d) => d.key === held?.key)?.displaced).toBe(true);
  });

  it("reports nothing when the same run is compared with itself", () => {
    const [before] = pair();
    expect(diffSnapshots(snapshotOf(before), snapshotOf(before), before.applicants)).toEqual([]);
  });
});

describe("undoing a change", () => {
  it("swaps the two values of a patch and signs the reversal as a system action", () => {
    const { inverse } = undoCycle();
    expect(inverse).toEqual([
      {
        applicationId: "APP-200",
        field: "investmentLakh",
        oldValue: "45",
        newValue: "12",
        sourceQuote: "Undo of v2",
      },
    ]);
  });

  /** The spec's acceptance test, in its own words. */
  it("restores the previous version exactly", () => {
    const { before, afterPatch, afterUndo } = undoCycle();

    // The patch has to have genuinely moved a decision, or the restore proves nothing.
    expect(statusOf(before, "APP-200")).toBe("NOT PROCEEDING");
    expect(statusOf(afterPatch, "APP-200")).toBe("APPROVED");
    expect(snapshotOf(afterPatch)).not.toEqual(snapshotOf(before));

    // Every status, reason, score, rank, pin and reservation, for every applicant.
    expect(snapshotOf(afterUndo)).toEqual(snapshotOf(before));
    // The codebase treats the hash as the identity of a run, so this is the strongest
    // available way to say the two runs are the same run.
    expect(afterUndo.resultHash).toBe(before.resultHash);
  });

  it("restores the applicant nobody patched, whose rank moved anyway", () => {
    const { before, afterPatch, afterUndo } = undoCycle();
    const rankOf = (result: PipelineResult) => applicant(result, "APP-100").rank;
    expect([rankOf(before), rankOf(afterPatch)]).toEqual([1, 2]);
    expect(rankOf(afterUndo)).toBe(1);
  });

  it("puts an empty cell back as empty, rather than as the word null", () => {
    const before: PipelineInput = {
      applications: [appRow({ applicationId: "APP-100", notes: "" })],
      territories: [terRow({ territoryId: "TER-01" })],
      stores: EMBEDDED_STORES,
    };
    // A cell the file left blank grounds to oldValue null, and null must come back blank.
    const patch: Patch = {
      applicationId: "APP-100",
      field: "notes",
      oldValue: null,
      newValue: "Wants to open in November",
      sourceQuote: "They want to open in November.",
    };
    const patched = applyPatchesToInput(before, [patch]);
    const undone = applyPatchesToInput(patched, invertPatches([patch], "Undo of v2"));
    expect(undone.applications).toEqual(before.applications);
  });

  it("adds a version to the history rather than removing one", () => {
    const { before, afterPatch, afterUndo, patch, inverse } = undoCycle();
    const v1 = makeVersion([], before, "sample", []);
    const v2 = makeVersion([v1], afterPatch, "chat-patch", [patch]);
    const history = [v1, v2];
    const v3 = makeVersion(history, afterUndo, "undo", inverse, "reversed v2");

    expect(history).toHaveLength(2);
    expect([...history, v3].map((v) => v.versionId)).toEqual(["v1", "v2", "v3"]);
    // The undo lands on the state v1 recorded, and says so by carrying the same snapshot.
    expect(v3.snapshot).toEqual(v1.snapshot);
    // And it is a forward step: its diff reads v2's diff backwards.
    const out = v2.diff.find((d) => d.applicationId === "APP-200")!;
    const back = v3.diff.find((d) => d.applicationId === "APP-200")!;
    expect([back.fromStatus, back.toStatus]).toEqual([out.toStatus, out.fromStatus]);
  });

  it("offers the newest version that carried a patch, and nothing when none did", () => {
    const { before, afterPatch, patch } = undoCycle();
    const v1 = makeVersion([], before, "sample", []);
    const v2 = makeVersion([v1], afterPatch, "chat-patch", [patch]);
    const v3 = makeVersion([v2], afterPatch, "policy-change", [], "Cautious");

    expect(undoableVersion([])).toBeNull();
    expect(undoableVersion([v1])).toBeNull();
    // A policy change moves decisions without patching the file, so it is not undoable.
    expect(undoableVersion([v1, v2, v3])?.versionId).toBe("v2");
  });

  it("labels itself on the timeline as a change undone", () => {
    const { afterUndo, inverse } = undoCycle();
    expect(makeVersion([], afterUndo, "undo", inverse, "reversed v2").label).toBe(
      "Change undone — reversed v2",
    );
  });
});
