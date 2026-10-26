import { describe, expect, it } from "vitest";
import { diffSnapshots, makeVersion, snapshotOf } from "../../lib/state/versions";
import { appRow, run, terRow } from "../helpers";
import type { PipelineResult } from "../../lib/types";

/** Two runs of the same territory, the second with one applicant's investment raised. */
function pair(): [PipelineResult, PipelineResult] {
  const territories = [terRow({ territoryId: "TER-01", openSlots: "2" })];
  const rows = (lakh: string) => [
    appRow({ applicationId: "APP-100", pinCode: "570002", investmentLakh: "40" }),
    appRow({ applicationId: "APP-200", pinCode: "570003", investmentLakh: lakh }),
  ];
  return [run(rows("12"), territories), run(rows("45"), territories)];
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
