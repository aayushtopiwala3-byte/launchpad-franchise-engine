import type {
  Applicant,
  Patch,
  PipelineInput,
  PipelineResult,
  StatusSnapshotEntry,
  Version,
  VersionDiffEntry,
  VersionTrigger,
} from "../types";

export function snapshotOf(result: PipelineResult): StatusSnapshotEntry[] {
  return result.applicants.map((a) => ({
    key: a.key,
    applicationId: a.applicationId,
    status: a.status,
    reasonSentence: a.reasonSentence,
    score: a.score.total,
    rank: a.rank,
    assignedPin: a.assignedPin,
    reservedUntil: a.reservedUntil,
  }));
}

/**
 * A row appears in the diff only if something an operator would act on moved:
 * status, reason, score, rank or the pin they hold. "Displaced" is the case worth
 * naming out loud — they held a pin before and do not now.
 */
export function diffSnapshots(
  before: StatusSnapshotEntry[],
  after: StatusSnapshotEntry[],
  applicants: Applicant[],
): VersionDiffEntry[] {
  const prior = new Map(before.map((s) => [s.key, s]));
  const nameOf = new Map(applicants.map((a) => [a.key, a.normalised.applicantName]));

  return after.flatMap((now) => {
    const was = prior.get(now.key) ?? null;
    const changed =
      was === null ||
      was.status !== now.status ||
      was.reasonSentence !== now.reasonSentence ||
      was.score !== now.score ||
      was.rank !== now.rank ||
      was.assignedPin !== now.assignedPin;
    if (!changed) return [];
    return [
      {
        key: now.key,
        applicationId: now.applicationId,
        applicantName: nameOf.get(now.key) ?? null,
        fromStatus: was?.status ?? null,
        toStatus: now.status,
        fromReason: was?.reasonSentence ?? null,
        toReason: now.reasonSentence,
        fromScore: was?.score ?? null,
        toScore: now.score,
        fromRank: was?.rank ?? null,
        toRank: now.rank,
        displaced: was?.assignedPin != null && now.assignedPin === null,
      },
    ];
  });
}

const TRIGGER_LABELS: Record<VersionTrigger, string> = {
  upload: "Workbook uploaded",
  sample: "Sample data loaded",
  "chat-patch": "Updated from chat",
  "policy-change": "Policy changed",
  override: "Decision overridden",
  "partner-update": "Partner update accepted",
  "include-example-row": "Example row included",
  "ai-enrichment": "AI reading applied",
  undo: "Change undone",
};

export function makeVersion(
  previous: Version[],
  result: PipelineResult,
  trigger: VersionTrigger,
  patches: Patch[],
  detail?: string,
): Version {
  const snapshot = snapshotOf(result);
  const last = previous[previous.length - 1];
  // Numbered from the last version rather than the array length, so trimming an old
  // version for storage never makes two versions share an id.
  const number = last ? Number(last.versionId.slice(1)) + 1 : 1;
  return {
    versionId: `v${number}`,
    // Versions are ordered by the array, so the clock is display-only and may
    // safely be the wall clock — it never feeds the engine.
    createdAt: new Date().toISOString(),
    trigger,
    label: detail ? `${TRIGGER_LABELS[trigger]} — ${detail}` : TRIGGER_LABELS[trigger],
    patches,
    snapshot,
    diff: last ? diffSnapshots(last.snapshot, snapshot, result.applicants) : [],
  };
}

export function versionById(versions: Version[], id: string): Version | undefined {
  return versions.find((v) => v.versionId === id);
}

export function diffBetween(
  versions: Version[],
  fromId: string,
  toId: string,
  applicants: Applicant[],
): VersionDiffEntry[] {
  const from = versionById(versions, fromId);
  const to = versionById(versions, toId);
  if (!from || !to) return [];
  return diffSnapshots(from.snapshot, to.snapshot, applicants);
}

/** Applications are patched by Application ID; the first matching row wins. */
export function applyPatchesToInput(input: PipelineInput, patches: Patch[]): PipelineInput {
  if (patches.length === 0) return input;
  const applied = new Set<string>();
  return {
    ...input,
    applications: input.applications.map((row) => {
      let next = row;
      for (const p of patches) {
        const once = `${p.applicationId}|${p.field}`;
        if (row.applicationId !== p.applicationId || applied.has(once)) continue;
        applied.add(once);
        next = { ...next, [p.field]: p.newValue ?? "" };
      }
      return next;
    }),
  };
}

/**
 * The inverse of a patch is the same patch read backwards. A patch's `oldValue` is re-read
 * from the applicant's own raw cell when it is grounded, never taken from the model, so
 * swapping the two values puts back the exact text the file held — which is what lets the
 * re-run land on the earlier result rather than merely near it. The quote is the system
 * naming its own action; inventing words the operator never said would be a worse lie than
 * leaving it blank.
 */
export function invertPatches(patches: Patch[], sourceQuote: string): Patch[] {
  return patches.map((p) => ({
    applicationId: p.applicationId,
    field: p.field,
    oldValue: p.newValue,
    newValue: p.oldValue,
    sourceQuote,
  }));
}

/**
 * The change an undo would reverse: the newest version that carried patches, which in
 * practice is a chat update or an accepted partner update. An undo carries the inverse
 * patches and so is itself undoable — a redo falls out of the same rule rather than
 * needing one of its own.
 */
export function undoableVersion(versions: Version[]): Version | null {
  return [...versions].reverse().find((v) => v.patches.length > 0) ?? null;
}
