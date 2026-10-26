import type {
  Applicant,
  Patch,
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
