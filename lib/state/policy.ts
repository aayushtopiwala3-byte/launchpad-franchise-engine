import { runPipeline } from "../engine/pipeline";
import { BRAND_DEFAULT_POLICY } from "../reference";
import type { PipelineInput, PolicyProfile, Status, Tier } from "../types";

const TIERS: Tier[] = ["Tier 1", "Tier 2", "Tier 3"];

export interface PolicyDifference {
  label: string;
  from: string;
  to: string;
}

/**
 * Every threshold that differs from the brand default, in the words the settings
 * screen uses. Drives both the "N thresholds differ" banner and the diff list.
 */
export function policyDifferences(
  profile: PolicyProfile,
  against: PolicyProfile = BRAND_DEFAULT_POLICY,
): PolicyDifference[] {
  const out: PolicyDifference[] = [];
  const add = (label: string, from: unknown, to: unknown) => {
    if (String(from) !== String(to)) out.push({ label, from: String(from), to: String(to) });
  };

  for (const tier of TIERS) {
    add(
      `${tier} minimum investment`,
      `${against.tierMinInvestmentLakh[tier]} lakh`,
      `${profile.tierMinInvestmentLakh[tier]} lakh`,
    );
    add(
      `${tier} minimum space`,
      `${against.tierMinSpaceSqft[tier]} sq ft`,
      `${profile.tierMinSpaceSqft[tier]} sq ft`,
    );
    add(
      `${tier} preferred band`,
      `${against.tierPreferredBand[tier].min}–${against.tierPreferredBand[tier].max} sq ft`,
      `${profile.tierPreferredBand[tier].min}–${profile.tierPreferredBand[tier].max} sq ft`,
    );
  }

  add(
    "Hard investment floor",
    `${Math.round(against.hardInvestmentFloorRatio * 100)}% of the minimum`,
    `${Math.round(profile.hardInvestmentFloorRatio * 100)}% of the minimum`,
  );
  add("Acceptable floors", against.acceptableFloors.join(", "), profile.acceptableFloors.join(", "));

  for (const key of Object.keys(against.scoreWeights) as (keyof PolicyProfile["scoreWeights"])[]) {
    add(`Score weight — ${key}`, against.scoreWeights[key], profile.scoreWeights[key]);
  }

  add("Reservation window", `${against.reservationWindowDays} days`, `${profile.reservationWindowDays} days`);
  add(
    "Realistic build, space secured",
    `${against.realisticMonthsSpaceSecured} months`,
    `${profile.realisticMonthsSpaceSecured} months`,
  );
  add(
    "Realistic build, no space yet",
    `${against.realisticMonthsNoSpace} months`,
    `${profile.realisticMonthsNoSpace} months`,
  );
  add("Training weeks", against.trainingWeeks, profile.trainingWeeks);
  add("Default language", against.defaultLanguage, profile.defaultLanguage);
  add("Brand name", against.brandName, profile.brandName);

  return out;
}

export interface ImpactMove {
  applicationId: string;
  applicantName: string | null;
  from: Status;
  to: Status;
}

export interface PolicyImpact {
  moves: ImpactMove[];
  countsBefore: Record<Status, number>;
  countsAfter: Record<Status, number>;
  slotsFilledBefore: number;
  slotsFilledAfter: number;
  sentence: string;
}

/**
 * Runs the whole pipeline twice so the preview is the real answer rather than an
 * estimate. The spec requires naming the IDs that move before the change is applied.
 */
export function previewPolicyImpact(
  input: PipelineInput,
  asOfDate: string,
  current: PolicyProfile,
  proposed: PolicyProfile,
): PolicyImpact {
  const before = runPipeline(input, { policy: current, asOfDate, withCounterfactuals: false });
  const after = runPipeline(input, { policy: proposed, asOfDate, withCounterfactuals: false });

  const priorStatus = new Map(before.applicants.map((a) => [a.key, a.status]));
  const moves: ImpactMove[] = after.applicants.flatMap((a) => {
    const from = priorStatus.get(a.key);
    if (from === undefined || from === a.status) return [];
    return [
      {
        applicationId: a.applicationId,
        applicantName: a.normalised.applicantName,
        from,
        to: a.status,
      },
    ];
  });

  return {
    moves,
    countsBefore: before.counts,
    countsAfter: after.counts,
    slotsFilledBefore: before.slotsFilled,
    slotsFilledAfter: after.slotsFilled,
    sentence: impactSentence(moves, before.slotsFilled, after.slotsFilled),
  };
}

function impactSentence(moves: ImpactMove[], filledBefore: number, filledAfter: number): string {
  if (moves.length === 0) return "This changes no decision in the current dataset.";

  const grouped = new Map<string, string[]>();
  for (const m of moves) {
    const key = `${m.from} to ${m.to}`;
    grouped.set(key, [...(grouped.get(key) ?? []), m.applicationId]);
  }

  const parts = [...grouped.entries()].map(
    ([move, ids]) =>
      `${ids.length} ${ids.length === 1 ? "applicant" : "applicants"} from ${move} (${ids.join(", ")})`,
  );

  const slots =
    filledAfter === filledBefore
      ? ""
      : ` Slots filled goes from ${filledBefore} to ${filledAfter}.`;

  return `This moves ${parts.join("; ")}.${slots}`;
}

export function isDefaultProfile(profile: PolicyProfile): boolean {
  return policyDifferences(profile).length === 0;
}

/** Profiles round-trip as JSON; anything missing falls back to the brand default. */
export function mergeWithDefaults(partial: Partial<PolicyProfile>): PolicyProfile {
  return {
    ...BRAND_DEFAULT_POLICY,
    ...partial,
    tierMinInvestmentLakh: {
      ...BRAND_DEFAULT_POLICY.tierMinInvestmentLakh,
      ...partial.tierMinInvestmentLakh,
    },
    tierMinSpaceSqft: { ...BRAND_DEFAULT_POLICY.tierMinSpaceSqft, ...partial.tierMinSpaceSqft },
    tierPreferredBand: { ...BRAND_DEFAULT_POLICY.tierPreferredBand, ...partial.tierPreferredBand },
    scoreWeights: { ...BRAND_DEFAULT_POLICY.scoreWeights, ...partial.scoreWeights },
    statusLabels: { ...BRAND_DEFAULT_POLICY.statusLabels, ...partial.statusLabels },
    trainingStoreOverrides: {
      ...BRAND_DEFAULT_POLICY.trainingStoreOverrides,
      ...partial.trainingStoreOverrides,
    },
  };
}
