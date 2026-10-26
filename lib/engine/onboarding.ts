import { TRAINING_TOPICS } from "../reference";
import type {
  ExistingStore,
  Language,
  NormalisedApplication,
  OnboardingPlan,
  OnboardingStep,
  PolicyProfile,
} from "../types";
import { realisticMinimumMonths } from "./gates";

const DAYS_PER_MONTH = 30.4375;

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Nearest existing store in the same city, with the brand's training overrides applied. */
export function pickTrainingStore(
  city: string | null,
  stores: ExistingStore[],
  policy: PolicyProfile,
): ExistingStore | null {
  if (!city) return null;
  const override = policy.trainingStoreOverrides[city];
  if (override) {
    const s = stores.find((x) => x.storeId === override);
    if (s) return s;
  }
  const inCity = stores
    .filter((s) => s.city === city)
    .sort((a, b) => (a.storeId < b.storeId ? -1 : 1));
  return inCity[0] ?? null;
}

export interface OnboardingContext {
  normalised: NormalisedApplication;
  policy: PolicyProfile;
  stores: ExistingStore[];
  asOfDate: string;
  /** Hold applicants start with a site search in these pin codes. */
  siteSearchPins: string[];
  needsSiteSearch: boolean;
  tierMinSpaceSqft: number | null;
}

export function buildOnboardingPlan(ctx: OnboardingContext): OnboardingPlan {
  const { normalised: n, policy, stores, asOfDate } = ctx;

  const trainingWeeks =
    policy.trainingWeeks +
    (n.retailExperienceYears === 0 ? policy.trainingWeeksZeroExperienceBonus : 0);
  const siteSearchWeeks = ctx.needsSiteSearch ? 6 : 0;
  const realistic = realisticMinimumMonths(n, policy);

  const targetMonths = n.targetLaunchMonths;
  const launchMonths = targetMonths === null ? realistic : Math.max(targetMonths, realistic);
  const targetIsAggressive = targetMonths !== null && targetMonths < realistic;

  const totalWeeks = 12 + siteSearchWeeks + (trainingWeeks - policy.trainingWeeks);
  let launchDate = addDays(asOfDate, launchMonths * DAYS_PER_MONTH);
  let planStart = addDays(launchDate, -totalWeeks * 7);
  if (planStart < asOfDate) {
    planStart = asOfDate;
    launchDate = addDays(planStart, totalWeeks * 7);
  }

  const week = (w: number) => addDays(planStart, (w - 1) * 7);
  const weekEnd = (w: number) => addDays(planStart, w * 7 - 1);
  const o = siteSearchWeeks;

  const trainingStore = pickTrainingStore(n.city, stores, policy);
  const language: Language = n.preferredLanguage ?? policy.defaultLanguage;

  const steps: OnboardingStep[] = [];
  let num = 1;
  const push = (
    title: string,
    owner: "Partner" | "Brand",
    startWeek: number,
    endWeek: number,
    checklist: string[],
  ) => {
    steps.push({
      number: num++,
      title,
      owner,
      startDate: week(startWeek),
      endDate: weekEnd(endWeek),
      timingLabel:
        startWeek === endWeek ? `Week ${startWeek}` : `Weeks ${startWeek}-${endWeek}`,
      checklist,
    });
  };

  if (ctx.needsSiteSearch) {
    const sizeLine =
      ctx.tierMinSpaceSqft === null
        ? "Confirm the minimum size with the expansion team"
        : `Minimum ${ctx.tierMinSpaceSqft} sq ft, Ground floor or a Mall unit`;
    push("Site search", "Partner", 1, 6, [
      ctx.siteSearchPins.length > 0
        ? `Search these pin codes only: ${ctx.siteSearchPins.join(", ")}`
        : "Pin codes to be confirmed by the expansion team",
      sizeLine,
      "Send three shortlisted options with photographs and rent figures",
      "Brand confirms catchment before any deposit is paid",
    ]);
  }

  push("Documents and KYC", "Partner", 1, 2, [
    "PAN and Aadhaar of all partners",
    "GST registration certificate",
    "Six months of bank statements",
    "Proof of investment capacity",
    "Two business references",
  ]);

  push("Franchise agreement and fee", "Brand", 2, 2, [
    "Agreement issued for review",
    "Territory and pin code confirmed in writing",
    "Franchise fee invoice raised and settled",
    "Partner onboarding pack handed over",
  ]);

  push("Site approval and layout sign-off", "Brand", 3 + o, 3 + o, [
    "Site visit and catchment check",
    "Frontage, floor and footfall confirmed",
    "Layout drawing issued",
    "Partner signs off the layout",
  ]);

  push("Fit-out", "Partner", 4 + o, 9 + o, [
    "Civil work and flooring",
    "Shopfront, signage and lighting to brand standard",
    "Fixtures and shelving installed",
    "Billing counter and POS hardware in place",
    "Electrical and fire safety clearance",
  ]);

  push("Hiring 2-4 staff", "Partner", 7 + o, 9 + o, [
    "Hire 2-4 staff for the store",
    "Shortlist with the brand's role profiles",
    "Offer letters issued",
    "Staff available in time for training",
  ]);

  const trainStart = 10 + o;
  const trainEnd = 9 + o + trainingWeeks;
  push(
    `Training at ${trainingStore ? `${trainingStore.storeId} (${trainingStore.city})` : "the nearest store"}, in ${language}`,
    "Brand",
    trainStart,
    trainEnd,
    [
      ...TRAINING_TOPICS,
      n.retailExperienceYears === 0
        ? "One extra week added: no prior retail experience stated"
        : `${trainingWeeks} weeks total`,
    ],
  );

  const prelaunchWeek = 10 + o + trainingWeeks;
  push("Pre-launch stock and local marketing", "Brand", prelaunchWeek, prelaunchWeek, [
    "Opening stock despatched and received",
    "Price list and POS catalogue loaded",
    `Launch creatives in ${language}`,
    "Local activation plan agreed with the partner",
  ]);

  const launchWeek = 11 + o + trainingWeeks;
  push("Launch, then support check-ins", "Brand", launchWeek, launchWeek, [
    "Store opens",
    "Day 7 check-in: billing, stock and staffing",
    "Day 30 check-in: sales against plan",
    "Day 90 check-in: profitability and range review",
  ]);

  const actualLaunch = week(launchWeek);
  const supportCheckIns = [
    { label: "Day 7 check-in", date: addDays(actualLaunch, 7) },
    { label: "Day 30 check-in", date: addDays(actualLaunch, 30) },
    { label: "Day 90 check-in", date: addDays(actualLaunch, 90) },
  ];

  const targetDate = targetMonths === null ? null : addDays(asOfDate, targetMonths * DAYS_PER_MONTH);

  return {
    steps,
    launchDate: actualLaunch,
    targetDate,
    realisticMinimumMonths: realistic,
    targetIsAggressive,
    aggressiveNote: targetIsAggressive
      ? `Target is aggressive. The applicant asked for ${targetMonths} month${targetMonths === 1 ? "" : "s"} (${formatDate(targetDate!)}), but the realistic minimum for this situation is ${realistic} months, so the plan opens on ${formatDate(actualLaunch)}. Agree the later date with the partner before signing.`
      : null,
    trainingStoreId: trainingStore?.storeId ?? null,
    trainingStoreCity: trainingStore?.city ?? null,
    trainingWeeks,
    trainingLanguage: language,
    supportCheckIns,
  };
}
