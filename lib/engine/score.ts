import type {
  BusinessClassification,
  NormalisedApplication,
  PolicyProfile,
  ScoreBreakdown,
  ScoreComponent,
  Tier,
} from "../types";
import { realisticMinimumMonths } from "./gates";

/**
 * The bands in section 5.6 are expressed against these default maxima. When an operator
 * re-weights a component in Workspace Settings we scale the band result proportionally,
 * so the shape of the judgement is preserved and only its influence changes.
 */
const DEFAULT_MAX = {
  investment: 30,
  experience: 20,
  space: 25,
  business: 15,
  launch: 10,
} as const;

const scale = (points: number, key: keyof typeof DEFAULT_MAX, policy: PolicyProfile) => {
  const weight = policy.scoreWeights[key];
  if (weight === DEFAULT_MAX[key]) return points;
  return Math.round((points / DEFAULT_MAX[key]) * weight);
};

export function investmentPoints(investment: number | null, tierMin: number | null): { points: number; basis: string } {
  if (investment === null || tierMin === null || tierMin <= 0) {
    return { points: 8, basis: "Investment not stated — scored at the lowest band." };
  }
  const ratio = investment / tierMin;
  const r = Math.round(ratio * 100) / 100;
  if (ratio >= 1.5) return { points: 30, basis: `${investment} lakh is ${r}x the ${tierMin} lakh minimum (1.5x or more).` };
  if (ratio >= 1.25) return { points: 25, basis: `${investment} lakh is ${r}x the ${tierMin} lakh minimum (1.25x or more).` };
  if (ratio >= 1.0) return { points: 18, basis: `${investment} lakh is ${r}x the ${tierMin} lakh minimum (meets it).` };
  return { points: 8, basis: `${investment} lakh is ${r}x the ${tierMin} lakh minimum (below it).` };
}

export function experiencePoints(years: number | null): { points: number; basis: string } {
  if (years === null) return { points: 0, basis: "Retail experience not stated — scored 0, and not treated as a rejection." };
  if (years === 0) return { points: 0, basis: "No retail experience — scores 0 here, and adds one extra week of training. Not a rejection." };
  if (years <= 2) return { points: 8, basis: `${years} year${years === 1 ? "" : "s"} of retail experience (1-2 band).` };
  if (years <= 5) return { points: 15, basis: `${years} years of retail experience (3-5 band).` };
  return { points: 20, basis: `${years} years of retail experience (6+ band).` };
}

export function spacePoints(
  n: NormalisedApplication,
  tier: Tier | null,
  policy: PolicyProfile,
): { points: number; raw: number; basis: string } {
  let raw: number;
  let basis: string;
  const acceptable = n.floor !== null && policy.acceptableFloors.includes(n.floor);

  if (n.spaceAvailable === "Not yet identified" || n.spaceAvailable === null) {
    raw = 5;
    basis = n.spaceAvailable === null ? "Space position not stated." : "No space identified yet.";
  } else if (n.floor === "Not known" || n.floor === null) {
    raw = 8;
    basis = `${n.spaceAvailable} space but the floor is not confirmed.`;
  } else if (!acceptable) {
    raw = 10;
    basis = `${n.spaceAvailable} space on the ${n.floor} floor.`;
  } else if (n.spaceAvailable === "Owned") {
    raw = 25;
    basis = `Owned space on the ${n.floor}.`;
  } else {
    raw = 22;
    basis = `Rented space on the ${n.floor}.`;
  }

  let points = raw;
  if (n.spaceSizeSqft !== null && tier) {
    const band = policy.tierPreferredBand[tier];
    if (n.spaceSizeSqft < band.min || n.spaceSizeSqft > band.max) {
      points = raw - 5;
      basis += ` ${n.spaceSizeSqft} sq ft is outside the ${tier} preferred band of ${band.min}-${band.max} sq ft (-5).`;
    } else {
      basis += ` ${n.spaceSizeSqft} sq ft is inside the ${tier} preferred band of ${band.min}-${band.max} sq ft.`;
    }
  }
  return { points, raw, basis };
}

export function businessPoints(c: BusinessClassification): { points: number; basis: string } {
  const quoted = c.evidenceQuote ? ` Evidence: "${c.evidenceQuote}".` : "";
  switch (c.category) {
    case "retail_owner":
      return { points: 15, basis: `Owns or manages a retail store.${quoted}` };
    case "customer_facing_adjacent":
      return { points: 9, basis: `Runs a customer-facing business in an adjacent trade.${quoted}` };
    default:
      return { points: 0, basis: "No related retail or customer-facing business stated." };
  }
}

export function launchPoints(
  target: number | null,
  realisticMin: number,
): { points: number; basis: string } {
  if (target === null)
    return { points: 7, basis: `Target launch not stated. Realistic minimum is ${realisticMin} months.` };
  if (target >= realisticMin)
    return { points: 10, basis: `Target of ${target} months meets the realistic minimum of ${realisticMin} months.` };
  const short = Math.round((realisticMin - target) * 100) / 100;
  if (short <= 1)
    return { points: 5, basis: `Target of ${target} months is ${short} month short of the realistic minimum of ${realisticMin} months.` };
  return { points: 2, basis: `Target of ${target} months is ${short} months short of the realistic minimum of ${realisticMin} months.` };
}

export function computeScore(
  n: NormalisedApplication,
  tier: Tier | null,
  policy: PolicyProfile,
  classification: BusinessClassification,
): ScoreBreakdown {
  const tierMin = tier ? policy.tierMinInvestmentLakh[tier] : null;
  const inv = investmentPoints(n.investmentLakh, tierMin);
  const exp = experiencePoints(n.retailExperienceYears);
  const sp = spacePoints(n, tier, policy);
  const biz = businessPoints(classification);
  const realistic = realisticMinimumMonths(n, policy);
  const lau = launchPoints(n.targetLaunchMonths, realistic);

  const components: ScoreComponent[] = [
    {
      key: "investment",
      label: "Investment headroom",
      points: scale(inv.points, "investment", policy),
      max: policy.scoreWeights.investment,
      basis: inv.basis,
    },
    {
      key: "experience",
      label: "Retail experience",
      points: scale(exp.points, "experience", policy),
      max: policy.scoreWeights.experience,
      basis: exp.basis,
    },
    {
      key: "space",
      label: "Space readiness",
      points: scale(sp.points, "space", policy),
      max: policy.scoreWeights.space,
      basis: sp.basis,
    },
    {
      key: "business",
      label: "Business relevance",
      points: scale(biz.points, "business", policy),
      max: policy.scoreWeights.business,
      basis: biz.basis,
    },
    {
      key: "launch",
      label: "Launch fit",
      points: scale(lau.points, "launch", policy),
      max: policy.scoreWeights.launch,
      basis: lau.basis,
    },
  ];

  return {
    total: components.reduce((a, c) => a + c.points, 0),
    components,
    spaceReadinessPoints: sp.points,
  };
}
