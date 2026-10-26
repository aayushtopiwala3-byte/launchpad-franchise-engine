import { afterEach, describe, expect, it, vi } from "vitest";
import { EMBEDDED_STORES } from "../../lib/reference";
import * as persistence from "../../lib/state/persistence";
import {
  applyPatchesToInput,
  invertPatches,
  makeVersion,
  snapshotOf,
  undoableVersion,
} from "../../lib/state/versions";
import type { Patch, PipelineInput, Version } from "../../lib/types";
import { appRow, applicant, run, statusOf, terRow } from "../helpers";

/**
 * Test areas H and K. Undo is the only promise in the product that cannot be half kept:
 * an operator who cannot get back is worse off than one who was never offered the button.
 * These tests push past the single-step case into chains, dead ends and damaged storage.
 */

const TERRITORIES = [terRow({ territoryId: "TER-01", openSlots: "2" })];

const inputOf = (applications: PipelineInput["applications"]): PipelineInput => ({
  applications,
  territories: TERRITORIES,
  stores: EMBEDDED_STORES,
});

const decide = (input: PipelineInput) =>
  run(input.applications, input.territories, { stores: input.stores });

const START = inputOf([
  appRow({ applicationId: "APP-100", pinCode: "570002", investmentLakh: "40" }),
  appRow({ applicationId: "APP-200", pinCode: "570003", investmentLakh: "12" }),
]);

const patch = (over: Partial<Patch>): Patch => ({
  applicationId: "APP-200",
  field: "investmentLakh",
  oldValue: "12",
  newValue: "45",
  sourceQuote: "test",
  ...over,
});

describe("a chain of changes unwinds exactly, in reverse", () => {
  const STEPS: Patch[] = [
    patch({ field: "investmentLakh", oldValue: "12", newValue: "45" }),
    patch({ field: "spaceSizeSqft", oldValue: "600", newValue: "420" }),
    patch({ field: "floor", oldValue: "Ground", newValue: "Upper" }),
  ];

  it("returns to the opening result after undoing all three", () => {
    const start = decide(START);

    let input = START;
    const history: PipelineInput[] = [];
    for (const p of STEPS) {
      history.push(input);
      input = applyPatchesToInput(input, [p]);
    }
    expect(snapshotOf(decide(input))).not.toEqual(snapshotOf(start));

    for (const p of [...STEPS].reverse()) {
      input = applyPatchesToInput(input, invertPatches([p], "undo"));
    }

    expect(input.applications).toEqual(START.applications);
    expect(snapshotOf(decide(input))).toEqual(snapshotOf(start));
    expect(decide(input).resultHash).toBe(start.resultHash);
  });

  it("treats an undo as undoable, so a redo needs no rule of its own", () => {
    const start = decide(START);
    const p = STEPS[0];
    const patched = applyPatchesToInput(START, [p]);
    const inverse = invertPatches([p], "undo of v2");

    const v1 = makeVersion([], start, "sample", []);
    const v2 = makeVersion([v1], decide(patched), "chat-patch", [p]);
    const undone = applyPatchesToInput(patched, inverse);
    const v3 = makeVersion([v1, v2], decide(undone), "undo", inverse, "reversed v2");

    expect(undoableVersion([v1, v2, v3])?.versionId).toBe("v3");

    const redone = applyPatchesToInput(undone, invertPatches(inverse, "undo of v3"));
    expect(redone.applications).toEqual(patched.applications);
    expect(decide(redone).resultHash).toBe(decide(patched).resultHash);
  });

  it("restores the knock-on verdict, not only the row that was patched", () => {
    const p = patch({});
    const patched = applyPatchesToInput(START, [p]);
    const undone = applyPatchesToInput(patched, invertPatches([p], "undo"));

    expect(applicant(decide(START), "APP-100").rank).toBe(1);
    expect(applicant(decide(patched), "APP-100").rank).toBe(2);
    expect(applicant(decide(undone), "APP-100").rank).toBe(1);
  });
});

describe("a patch that cannot land changes nothing at all", () => {
  it("ignores an Application ID that is not in the file", () => {
    const after = applyPatchesToInput(START, [patch({ applicationId: "APP-999" })]);

    expect(after.applications).toEqual(START.applications);
  });

  it("returns the identical object when there is nothing to apply", () => {
    expect(applyPatchesToInput(START, [])).toBe(START);
  });

  it("leaves the territories and stores alone whatever the patch says", () => {
    const after = applyPatchesToInput(START, [patch({})]);

    expect(after.territories).toBe(START.territories);
    expect(after.stores).toBe(START.stores);
  });

  it("never touches a row other than the one named", () => {
    const after = applyPatchesToInput(START, [patch({})]);

    expect(after.applications[0]).toEqual(START.applications[0]);
    expect(after.applications[1].investmentLakh).toBe("45");
  });

  /**
   * Two rows sharing an ID is a flagged data-quality fault, not a supported shape. The
   * documented rule is that the first row wins, and the second is held out of allocation
   * anyway — so a patch can never reach a row that is competing for a pin.
   */
  it("patches only the first of two rows sharing an Application ID", () => {
    const duplicated = inputOf([
      appRow({ applicationId: "APP-300", pinCode: "570002", investmentLakh: "40" }),
      appRow({ applicationId: "APP-300", pinCode: "570002", investmentLakh: "41" }),
    ]);
    const after = applyPatchesToInput(duplicated, [
      patch({ applicationId: "APP-300", oldValue: "40", newValue: "55" }),
    ]);

    expect(after.applications[0].investmentLakh).toBe("55");
    expect(after.applications[1].investmentLakh).toBe("41");
  });
});

describe("the timeline records what moved and keeps what came before", () => {
  it("never shortens history when a change is undone", () => {
    const start = decide(START);
    const p = patch({});
    const patched = decide(applyPatchesToInput(START, [p]));
    const v1 = makeVersion([], start, "sample", []);
    const v2 = makeVersion([v1], patched, "chat-patch", [p]);
    const history: Version[] = [v1, v2];

    const v3 = makeVersion(history, start, "undo", invertPatches([p], "undo"), "reversed v2");

    expect(history).toHaveLength(2);
    expect(v3.versionId).toBe("v3");
    expect(v3.snapshot).toEqual(v1.snapshot);
  });

  it("carries the patch on the version, so the record says what was changed", () => {
    const p = patch({});
    const v = makeVersion([], decide(START), "chat-patch", [p]);

    expect(v.patches).toEqual([p]);
    expect(v.patches[0].sourceQuote).toBe("test");
  });

  it("offers nothing to undo when every version was a policy change", () => {
    const start = decide(START);
    const v1 = makeVersion([], start, "sample", []);
    const v2 = makeVersion([v1], start, "policy-change", [], "Cautious");

    expect(undoableVersion([v1, v2])).toBeNull();
  });
});

describe("a fresh upload replaces the old dataset rather than merging with it", () => {
  it("decides only the rows in the newest file", () => {
    const first = decide(START);
    const second = decide(inputOf([appRow({ applicationId: "APP-700", pinCode: "570004" })]));

    expect(first.applicants.map((a) => a.applicationId)).toEqual(["APP-100", "APP-200"]);
    expect(second.applicants.map((a) => a.applicationId)).toEqual(["APP-700"]);
    expect(second.resultHash).not.toBe(first.resultHash);
  });

  it("frees the pins the previous dataset had claimed", () => {
    const second = decide(inputOf([appRow({ applicationId: "APP-700", pinCode: "570002" })]));

    expect(statusOf(second, "APP-700")).toBe("APPROVED");
    expect(applicant(second, "APP-700").assignedPin).toBe("570002");
  });
});

/** Storage is the one dependency outside our control, so every path out of it is tested. */
describe("storage failures degrade rather than destroy", () => {
  const stubWindow = (over: {
    search?: string;
    getItem?: () => string | null;
    setItem?: () => void;
  }) => {
    vi.stubGlobal("window", {
      location: { search: over.search ?? "" },
      localStorage: {
        getItem: over.getItem ?? (() => null),
        setItem: over.setItem ?? (() => {}),
        removeItem: () => {},
      },
    });
  };

  afterEach(() => vi.unstubAllGlobals());

  it("reports nothing and stays available on a clean first visit", () => {
    stubWindow({});

    expect(persistence.load()).toEqual({ state: null, corruptPayload: null, available: true });
  });

  it("hands back unreadable JSON for recovery instead of throwing it away", () => {
    stubWindow({ getItem: () => "{not json at all" });
    const outcome = persistence.load();

    expect(outcome.state).toBeNull();
    expect(outcome.corruptPayload).toBe("{not json at all");
    expect(outcome.available).toBe(true);
  });

  it("refuses a payload written by a schema it does not know", () => {
    const future = JSON.stringify({ schemaVersion: 99, versions: [] });
    stubWindow({ getItem: () => future });
    const outcome = persistence.load();

    expect(outcome.state).toBeNull();
    expect(outcome.corruptPayload).toBe(future);
  });

  it("treats blocked storage as unavailable rather than as an error to show", () => {
    stubWindow({
      getItem: () => {
        throw new Error("The operation is insecure.");
      },
    });

    expect(persistence.load()).toEqual({ state: null, corruptPayload: null, available: false });
  });

  it("reports a full disk in words an operator can act on", () => {
    stubWindow({
      setItem: () => {
        throw new Error("QuotaExceededError: quota reached");
      },
    });
    const result = persistence.save({ schemaVersion: 1 } as persistence.PersistedState);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Storage is full.");
  });

  it("reads nothing and writes nothing in safe mode", () => {
    stubWindow({ search: "?safe=1", getItem: () => JSON.stringify({ schemaVersion: 1 }) });

    expect(persistence.isSafeMode()).toBe(true);
    expect(persistence.load().state).toBeNull();
    expect(persistence.save({ schemaVersion: 1 } as persistence.PersistedState).ok).toBe(false);
  });

  it("fails closed when rendered on the server, where there is no storage", () => {
    vi.stubGlobal("window", undefined);

    expect(persistence.load()).toEqual({ state: null, corruptPayload: null, available: false });
    expect(persistence.isSafeMode()).toBe(false);
  });
});

describe("history survives being written out and read back", () => {
  it("round-trips a version through JSON without losing a field", () => {
    const p = patch({});
    const v1 = makeVersion([], decide(START), "sample", []);
    const v2 = makeVersion([v1], decide(applyPatchesToInput(START, [p])), "chat-patch", [p]);

    expect(JSON.parse(JSON.stringify([v1, v2]))).toEqual([v1, v2]);
  });

  it("re-runs to the same decisions from the stored raw rows alone", () => {
    const stored = JSON.parse(JSON.stringify(START)) as PipelineInput;

    expect(decide(stored).resultHash).toBe(decide(START).resultHash);
  });
});
