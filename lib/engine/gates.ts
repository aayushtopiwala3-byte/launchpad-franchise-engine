import { CITY_BY_NAME } from "../reference";
import type {
  NormalisedApplication,
  PolicyProfile,
  QualityIssue,
  RuleResult,
  Tier,
} from "../types";
import { APP_COLUMNS } from "./quality";

export interface GateContext {
  policy: PolicyProfile;
  tier: Tier | null;
  /** Territory that owns the applicant's pin, if any. */
  territoryId: string | null;
  /** Store ID occupying the applicant's pin, if any. */
  occupyingStoreId: string | null;
  /** True when the applicant's city has at least one territory anywhere. */
  cityHasTerritory: boolean;
  /** Free pins the applicant could be pointed at, in the same territory then the same city. */
  redirectTargets: string[];
  blockingIssues: QualityIssue[];
}

export interface GateOutcome {
  results: RuleResult[];
  allPassed: boolean;
  /** Set when a gate failed. The allocator turns this into a final status. */
  failure: null | {
    ruleId: "G-01" | "G-02" | "G-03" | "G-04";
    /** What the gate wants to happen. `redirect` may still become WAITLISTED or NOT PROCEEDING. */
    want: "hold" | "redirect" | "reject";
    reason: string;
    unlockCondition: string | null;
  };
}

export function realisticMinimumMonths(
  n: NormalisedApplication,
  policy: PolicyProfile,
): number {
  const spaceSecured = n.spaceAvailable === "Owned" || n.spaceAvailable === "Rented";
  const floorAcceptable = n.floor !== null && policy.acceptableFloors.includes(n.floor);
  let months =
    spaceSecured && floorAcceptable
      ? policy.realisticMonthsSpaceSecured
      : policy.realisticMonthsNoSpace;
  if (n.retailExperienceYears === 0) months += policy.realisticMonthsZeroExperiencePenalty;
  return Math.round(months * 100) / 100;
}

export function evaluateGates(
  n: NormalisedApplication,
  ctx: GateContext,
): GateOutcome {
  const { policy } = ctx;
  const results: RuleResult[] = [];
  let failure: GateOutcome["failure"] = null;

  // A later reject outranks an earlier redirect: a redirect is only meaningful
  // if somewhere exists to redirect to, and a reject proves there is not.
  const FINALITY = { redirect: 0, hold: 1, reject: 2 } as const;
  const fail = (
    ruleId: "G-01" | "G-02" | "G-03" | "G-04",
    want: "hold" | "redirect" | "reject",
    reason: string,
    unlockCondition: string | null,
  ) => {
    if (!failure || FINALITY[want] > FINALITY[failure.want]) {
      failure = { ruleId, want, reason, unlockCondition };
    }
  };

  // ---- G-01: city allowed, pin 6 digits, pin prefix matches the city ----
  const cityRef = n.city ? CITY_BY_NAME.get(n.city) : undefined;
  const pinOk = n.pinCode !== null;
  const prefixOk = !!cityRef && pinOk && n.pinCode!.startsWith(cityRef.pinPrefix);
  const g01Passed = !!cityRef && pinOk && prefixOk;
  results.push({
    ruleId: "G-01",
    checked: "City is one we operate in, the pin code is 6 digits, and the pin code matches the city",
    values: {
      City: n.city,
      "Pin code": n.pinCode,
      "Expected pin prefix": cityRef ? cityRef.pinPrefix : null,
    },
    passed: g01Passed,
    failReason: g01Passed
      ? undefined
      : !cityRef
        ? `${n.city ?? "No city"} is not one of the cities this brand operates in.`
        : !pinOk
          ? "The pin code is not 6 digits, so we cannot place this applicant."
          : `City ${n.city} uses pin codes starting ${cityRef.pinPrefix}, but the pin code given is ${n.pinCode}.`,
    unlockCondition: g01Passed
      ? undefined
      : !cityRef
        ? "Confirm: City — which of our cities is this?"
        : !pinOk
          ? "Confirm: Pin code — we need the 6-digit pin code."
          : "Confirm: City / Pin code — which of the two is correct?",
  });
  if (!g01Passed) {
    // Resolvable means there is somewhere to put them once the contradiction is settled.
    const resolvable = ctx.cityHasTerritory || !!cityRef;
    fail(
      "G-01",
      resolvable ? "hold" : "reject",
      results[0].failReason!,
      results[0].unlockCondition ?? null,
    );
  }

  // ---- G-02: investment at or above the hard floor ----
  const tierMin = ctx.tier ? policy.tierMinInvestmentLakh[ctx.tier] : null;
  const hardFloor = tierMin === null ? null : Math.round(tierMin * policy.hardInvestmentFloorRatio * 100) / 100;
  const inv = n.investmentLakh;
  const g02Passed = hardFloor === null || inv === null ? true : inv >= hardFloor;
  results.push({
    ruleId: "G-02",
    checked: `Investment is at least ${Math.round(policy.hardInvestmentFloorRatio * 100)}% of the ${ctx.tier ?? "tier"} minimum`,
    values: {
      Investment: inv === null ? null : `${inv} lakh`,
      Tier: ctx.tier,
      "Tier minimum": tierMin === null ? null : `${tierMin} lakh`,
      "Hard floor": hardFloor === null ? null : `${hardFloor} lakh`,
    },
    passed: g02Passed,
    failReason: g02Passed
      ? undefined
      : `Investment of ${inv} lakh is below the hard floor of ${hardFloor} lakh for ${ctx.tier} (${Math.round(((inv ?? 0) / (tierMin ?? 1)) * 100)}% of the ${tierMin} lakh minimum).`,
  });
  if (!g02Passed) {
    fail(
      "G-02",
      "reject",
      results[results.length - 1].failReason!,
      `A co-investor or financing taking the total to at least ${tierMin} lakh would make this application viable.`,
    );
  }

  // ---- G-03: the applicant's pin is not already occupied by one of our stores ----
  const g03Passed = ctx.occupyingStoreId === null;
  results.push({
    ruleId: "G-03",
    checked: "The pin code does not already hold one of our stores",
    values: {
      "Pin code": n.pinCode,
      "Store at this pin": ctx.occupyingStoreId,
    },
    passed: g03Passed,
    failReason: g03Passed
      ? undefined
      : `Pin ${n.pinCode} already holds store ${ctx.occupyingStoreId}. The brand never opens two stores in the same pin code.`,
  });
  if (!g03Passed) {
    fail(
      "G-03",
      "redirect",
      results[results.length - 1].failReason!,
      null,
    );
  }

  // ---- G-04: the pin belongs to a territory, or the city has one with free pins ----
  const g04Passed = ctx.territoryId !== null;
  results.push({
    ruleId: "G-04",
    checked: "The pin code falls inside one of our territories",
    values: {
      "Pin code": n.pinCode,
      Territory: ctx.territoryId,
      "City has a territory": ctx.cityHasTerritory ? "yes" : "no",
    },
    passed: g04Passed,
    failReason: g04Passed
      ? undefined
      : ctx.cityHasTerritory
        ? // Stops at the fact: this branch always ends in a redirect, and the
          // redirect sentence names the alternative pins itself.
          `Pin ${n.pinCode} is not inside any territory we have mapped.`
        : `Pin ${n.pinCode} is not inside any territory, and we have no territory in ${n.city} at all.`,
  });
  if (!g04Passed) {
    fail(
      "G-04",
      ctx.cityHasTerritory ? "redirect" : "reject",
      results[results.length - 1].failReason!,
      ctx.cityHasTerritory
        ? null
        : `We would need to open a ${n.city} territory before this application could proceed.`,
    );
  }

  return { results, allPassed: failure === null, failure };
}

export interface ReadinessOutcome {
  results: RuleResult[];
  allPassed: boolean;
  failures: RuleResult[];
}

export function evaluateReadiness(
  n: NormalisedApplication,
  tier: Tier | null,
  policy: PolicyProfile,
  blockingIssues: QualityIssue[],
): ReadinessOutcome {
  const results: RuleResult[] = [];
  const tierMinInv = tier ? policy.tierMinInvestmentLakh[tier] : null;
  const tierMinSpace = tier ? policy.tierMinSpaceSqft[tier] : null;

  // A figure whose units N-01 could not settle arrives as null, the same as a blank cell.
  // Calling a cell that holds 5000 "not stated" would be its own untruth, so R-01 says only
  // that it could not be read and leaves the detail to the DQ-07 issue that raised it.
  const investmentUnreadable =
    n.investmentLakh === null &&
    blockingIssues.some((i) => i.id === "DQ-07" && i.column === APP_COLUMNS.investmentLakh);

  // R-01 Investment at or above the tier minimum
  const r01 = tierMinInv === null || n.investmentLakh === null ? false : n.investmentLakh >= tierMinInv;
  const gap =
    tierMinInv !== null && n.investmentLakh !== null
      ? Math.round((tierMinInv - n.investmentLakh) * 100) / 100
      : null;
  results.push({
    ruleId: "R-01",
    checked: `Investment meets the ${tier ?? "tier"} minimum`,
    values: {
      Investment: n.investmentLakh === null ? null : `${n.investmentLakh} lakh`,
      Minimum: tierMinInv === null ? null : `${tierMinInv} lakh`,
      Gap: gap === null ? null : `${Math.max(0, gap)} lakh`,
    },
    passed: r01,
    failReason: r01
      ? undefined
      : investmentUnreadable
        ? "Investment capacity was written in units we could not settle, so it has not been read."
        : n.investmentLakh === null
          ? "Investment capacity is not stated."
          : `Investment of ${n.investmentLakh} lakh is ${gap} lakh short of the ${tierMinInv} lakh minimum for ${tier}.`,
    unlockCondition: r01
      ? undefined
      : n.investmentLakh === null
        ? `Confirm: ${APP_COLUMNS.investmentLakh}`
        : `Investment gap of ${gap} lakh — could qualify with a co-investor or financing.`,
  });

  // R-02 Space is Owned or Rented
  const r02 = n.spaceAvailable === "Owned" || n.spaceAvailable === "Rented";
  results.push({
    ruleId: "R-02",
    checked: "A space is already owned or rented",
    values: { "Space available": n.spaceAvailable },
    passed: r02,
    failReason: r02
      ? undefined
      : n.spaceAvailable === null
        ? "Space position is not stated."
        : "No space has been identified yet.",
    unlockCondition: r02
      ? undefined
      : "Secure a space — see the suggested pin codes and the size requirement below.",
  });

  // R-03 Floor is acceptable
  const r03 = n.floor !== null && policy.acceptableFloors.includes(n.floor);
  results.push({
    ruleId: "R-03",
    checked: `Floor is one of: ${policy.acceptableFloors.join(", ")}`,
    values: { Floor: n.floor, Acceptable: policy.acceptableFloors.join(", ") },
    passed: r03,
    failReason: r03
      ? undefined
      : n.floor === "Not known" || n.floor === null
        ? "The floor has not been confirmed."
        : `The space is on the ${n.floor} floor, which loses passing footfall and walk-in trade.`,
    unlockCondition: r03
      ? undefined
      : n.floor === "Not known" || n.floor === null
        ? "Confirm: Floor — is the space Ground, Upper or a Mall unit?"
        : `Move to a ${policy.acceptableFloors.join(" or ")} space.`,
  });

  // R-04 Space size at or above the tier minimum
  const r04 =
    tierMinSpace === null
      ? false
      : n.spaceSizeSqft === null
        ? false
        : n.spaceSizeSqft >= tierMinSpace;
  results.push({
    ruleId: "R-04",
    checked: `Space size meets the ${tier ?? "tier"} minimum`,
    values: {
      "Space size": n.spaceSizeSqft === null ? null : `${n.spaceSizeSqft} sq ft`,
      Minimum: tierMinSpace === null ? null : `${tierMinSpace} sq ft`,
    },
    passed: r04,
    failReason: r04
      ? undefined
      : n.spaceSizeSqft === null
        ? "Space size is not stated."
        : `Space is ${n.spaceSizeSqft} sq ft; the minimum for ${tier} is ${tierMinSpace} sq ft.`,
    unlockCondition: r04
      ? undefined
      : n.spaceSizeSqft === null
        ? "Confirm: Space size (sq ft)"
        : `Space is ${n.spaceSizeSqft} sq ft; minimum for ${tier} is ${tierMinSpace} sq ft.`,
  });

  // R-05 No blocking data-quality issue
  const r05 = blockingIssues.length === 0;
  results.push({
    ruleId: "R-05",
    checked: "No blocking data-quality issue on this application",
    values: {
      "Blocking issues": blockingIssues.length,
      Issues: blockingIssues.map((i) => i.id).join(", ") || null,
    },
    passed: r05,
    // The operator reads the sentence; the codes stay in `values` for the trace.
    failReason: r05
      ? undefined
      : blockingIssues.length === 1
        ? blockingIssues[0].message
        : `${blockingIssues[0].message} There ${blockingIssues.length === 2 ? "is 1 other" : `are ${blockingIssues.length - 1} other`} data-quality issue${blockingIssues.length === 2 ? "" : "s"} on this row.`,
    unlockCondition: r05
      ? undefined
      : blockingIssues
          .map((i) => `Confirm: ${i.confirmField ?? i.column} — ${i.message}`)
          .join(" "),
  });

  const failures = results.filter((r) => !r.passed);
  return { results, allPassed: failures.length === 0, failures };
}
