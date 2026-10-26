import { classifyBusinessFallback, detectContradictionsFallback } from "../ai/fallbacks";
import { CITY_BY_NAME, SOURCING_CHANNELS } from "../reference";
import type {
  Applicant,
  BusinessClassification,
  Competitor,
  Language,
  PipelineInput,
  PipelineResult,
  PolicyProfile,
  QualityIssue,
  RecruitmentGap,
  Status,
  Territory,
  Tier,
} from "../types";
import { allocate, assertOneStorePerPin, type AllocationCandidate } from "./allocate";
import { buildCounterfactual } from "./counterfactual";
import { evaluateGates, evaluateReadiness } from "./gates";
import { NormalisationLog, normaliseApplicationRow, normaliseTerritoryRow } from "./normalise";
import { buildOnboardingPlan, formatDate } from "./onboarding";
import { computeScore } from "./score";
import {
  checkApplications,
  checkTerritories,
  type AppUnderCheck,
  type Contradiction,
  type TerritoryUnderCheck,
} from "./quality";
import { renderMessages } from "../messages/render";

export interface PipelineOptions {
  policy: PolicyProfile;
  asOfDate: string;
  /** AI-1 results keyed by Application ID. Missing entries fall back to the keyword matcher. */
  classifications?: Map<string, BusinessClassification>;
  /** AI-2 results keyed by Application ID. Missing entries fall back to phrase matching. */
  contradictions?: Map<string, Contradiction[]>;
  /** Off during counterfactual re-runs, which would otherwise recurse. */
  withCounterfactuals?: boolean;
  /** Locked operator overrides, applied last. */
  lockedOverrides?: Map<string, Status>;
}

function cheapHash(input: string): string {
  // FNV-1a. Deterministic, dependency-free, and enough to detect any change in the result.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Turning AI on may add a flag but must never remove one the deterministic twin found,
 * so the merge is a union and the twin's wording wins wherever both flagged a field.
 */
function mergeContradictions(fallback: Contradiction[], ai: Contradiction[] | undefined) {
  if (!ai || ai.length === 0) return fallback;
  const seen = new Set(fallback.map((c) => c.field));
  return [...fallback, ...ai.filter((c) => !seen.has(c.field))];
}

export function runPipeline(input: PipelineInput, options: PipelineOptions): PipelineResult {
  const { policy, asOfDate } = options;
  const withCounterfactuals = options.withCounterfactuals ?? true;
  const log = new NormalisationLog();

  // ---- 1. Normalise ----
  const normalisedApps = input.applications.map((raw) => ({
    raw,
    normalised: normaliseApplicationRow(raw, log, policy.defaultLanguage),
  }));
  const normalisedTerritories = input.territories.map((raw) => {
    const { normalised, droppedPins } = normaliseTerritoryRow(raw, log);
    return { raw, normalised, droppedPins } satisfies TerritoryUnderCheck;
  });

  // ---- 2. AI-shaped inputs, with deterministic twins when AI is off ----
  const classifications = new Map<string, BusinessClassification>();
  const contradictionsByApp = new Map<string, Contradiction[]>();
  for (const { normalised: n } of normalisedApps) {
    const id = n.applicationId;
    classifications.set(
      id,
      options.classifications?.get(id) ??
        classifyBusinessFallback([n.currentBusiness, n.notes].filter(Boolean).join(". ") || null),
    );
    contradictionsByApp.set(
      id,
      mergeContradictions(detectContradictionsFallback(n), options.contradictions?.get(id)),
    );
  }

  // ---- 3. Data quality ----
  const appsUnderCheck: AppUnderCheck[] = normalisedApps.map((a, i) => ({
    key: `${a.normalised.applicationId || "row"}#${i}`,
    raw: a.raw,
    normalised: a.normalised,
    contradictions: contradictionsByApp.get(a.normalised.applicationId) ?? [],
  }));
  const appIssues = checkApplications(appsUnderCheck);
  const {
    issues: terIssues,
    pinOwner,
    kept: keptTerritories,
  } = checkTerritories(normalisedTerritories, input.stores);
  const allIssues = [...appIssues, ...terIssues];

  // ---- 4. Territories ----
  const occupiedPins = new Set(input.stores.map((s) => s.pinCode));
  const territories: Territory[] = keptTerritories.map((t) => {
    const n = t.normalised;
    const owned = n.pins.filter((p) => pinOwner.get(p) === n.territoryId);
    const ceded = n.pins.filter((p) => pinOwner.get(p) !== n.territoryId);
    const occupied = owned.filter((p) => occupiedPins.has(p));
    const free = owned.filter((p) => !occupiedPins.has(p));
    const slots = n.openSlots ?? 0;
    const usableCapacity = Math.max(0, Math.min(slots, free.length));
    return {
      territoryId: n.territoryId,
      city: n.city,
      state: n.state,
      tier: n.tier,
      pins: n.pins,
      cededPins: ceded,
      openSlots: n.openSlots,
      priority: n.priority,
      occupiedPins: occupied,
      freePins: free,
      usableCapacity,
      capacityCappedReason:
        usableCapacity < slots
          ? `${n.territoryId} lists ${slots} open slot${slots === 1 ? "" : "s"} but only ${free.length} free pin code${free.length === 1 ? "" : "s"} remain${free.length === 1 ? "s" : ""}, so capacity is capped at ${usableCapacity}.`
          : null,
      pinHolders: {},
      queue: [],
      unfilledSlotBlocker: null,
      issues: terIssues.filter((i) => i.subjectId === n.territoryId),
      rowNumber: t.raw.rowNumber,
    };
  });

  const territoryByPin = new Map<string, Territory>();
  for (const t of territories) {
    for (const p of t.pins) {
      if (t.cededPins.includes(p)) continue;
      territoryByPin.set(p, t);
    }
  }
  const citiesWithTerritory = new Set(territories.map((t) => t.city).filter(Boolean) as string[]);

  // ---- 5. Per applicant: tier, gates, readiness, score ----
  const seenIds = new Set<string>();
  const candidates: AllocationCandidate[] = [];
  const working = appsUnderCheck.map((a) => {
    const n = a.normalised;
    const issues = allIssues.filter(
      (i) => i.sheet === "Applications" && i.row === a.raw.rowNumber,
    );
    const blockingIssues = issues.filter((i) => i.severity === "blocking");

    const isDuplicateHold = !!n.applicationId && seenIds.has(n.applicationId);
    if (n.applicationId) seenIds.add(n.applicationId);

    const territory = n.pinCode ? (territoryByPin.get(n.pinCode) ?? null) : null;
    const cityRef = n.city ? CITY_BY_NAME.get(n.city) : undefined;
    const prefixMatches = !!cityRef && !!n.pinCode && n.pinCode.startsWith(cityRef.pinPrefix);
    // When city and pin disagree we trust the city the applicant typed, not the pin.
    const tier: Tier | null = prefixMatches
      ? (territory?.tier ?? cityRef?.tier ?? null)
      : (cityRef?.tier ?? territory?.tier ?? null);

    const occupyingStore = n.pinCode
      ? (input.stores.find((s) => s.pinCode === n.pinCode)?.storeId ?? null)
      : null;

    const gates = evaluateGates(n, {
      policy,
      tier,
      territoryId: territory?.territoryId ?? null,
      occupyingStoreId: occupyingStore,
      cityHasTerritory: !!n.city && citiesWithTerritory.has(n.city),
      redirectTargets: [],
      blockingIssues,
    });
    const readiness = evaluateReadiness(n, tier, policy, blockingIssues);
    const classification = classifications.get(n.applicationId)!;
    const score = computeScore(n, tier, policy, classification);
    const isReady = gates.allPassed && readiness.allPassed && !isDuplicateHold;

    const key = a.key;
    candidates.push({
      key,
      applicationId: n.applicationId,
      territoryId: territory?.territoryId ?? null,
      city: n.city,
      pin: n.pinCode,
      score: score.total,
      spaceReadinessPoints: score.spaceReadinessPoints,
      investment: n.investmentLakh ?? 0,
      isReady,
      isDuplicateHold,
      gateFailure: gates.failure,
      // A pin may never be held for someone whose location is unconfirmed.
      eligibleForReservation: gates.failure?.ruleId !== "G-01",
    });

    return { a, n, issues, blockingIssues, isDuplicateHold, territory, tier, gates, readiness, score, classification, key };
  });

  // ---- 6. Allocate ----
  const allocation = allocate(
    candidates,
    territories,
    input.stores,
    asOfDate,
    policy.reservationWindowDays,
  );

  // ---- 7. Build applicants ----
  const applicants: Applicant[] = working.map((w) => {
    const outcome = allocation.byKey.get(w.key)!;
    let status = outcome.status;
    const locked = options.lockedOverrides?.get(w.n.applicationId);
    if (locked) status = locked;

    const firstReadinessFailure = w.readiness.failures[0] ?? null;
    const unlockCondition =
      status === "ON HOLD"
        ? (w.gates.failure?.unlockCondition ??
            mergeUnlocks(w.readiness.failures.map((f) => f.unlockCondition)) ??
            null) || null
        : status === "NOT PROCEEDING"
          ? (w.gates.failure?.unlockCondition ?? null)
          : null;

    const needsSiteSearch =
      w.n.spaceAvailable !== "Owned" && w.n.spaceAvailable !== "Rented"
        ? true
        : !(w.n.floor !== null && policy.acceptableFloors.includes(w.n.floor));

    const makesPlan =
      status === "APPROVED" || (status === "ON HOLD" && outcome.reservedUntil !== null);

    const onboardingPlan = makesPlan
      ? buildOnboardingPlan({
          normalised: w.n,
          policy,
          stores: input.stores,
          asOfDate,
          siteSearchPins:
            outcome.suggestedPins.length > 0
              ? outcome.suggestedPins
              : w.n.pinCode
                ? [w.n.pinCode]
                : [],
          needsSiteSearch,
          tierMinSpaceSqft: w.tier ? policy.tierMinSpaceSqft[w.tier] : null,
        })
      : null;

    const reason = buildReason(
      status,
      w.n,
      w.tier,
      outcome,
      w.gates.failure,
      w.readiness.failures,
      w.territory?.territoryId ?? null,
      w.territory?.usableCapacity ?? 0,
      w.score.total,
    );

    const nextStep = buildNextStep(status, outcome, unlockCondition, onboardingPlan?.launchDate ?? null, w.n);

    const competitors: Competitor[] = outcome.competitors.map((c) => {
      const match = working.find((x) => x.n.applicationId === c.applicationId);
      return {
        ...c,
        applicantName: match?.n.applicantName ?? null,
        status: match ? allocation.byKey.get(match.key)!.status : c.status,
      };
    });
    // Anyone at the exact same pin, whatever their status, is worth naming.
    for (const other of working) {
      if (other.key === w.key) continue;
      if (!other.n.pinCode || other.n.pinCode !== w.n.pinCode) continue;
      if (competitors.some((c) => c.applicationId === other.n.applicationId)) continue;
      competitors.push({
        applicationId: other.n.applicationId,
        applicantName: other.n.applicantName,
        pinCode: other.n.pinCode,
        score: other.score.total,
        status: allocation.byKey.get(other.key)!.status,
        samePin: true,
        whyRankedHigher:
          other.score.total > w.score.total
            ? `Scored ${other.score.total} against ${w.score.total}.`
            : null,
      });
    }

    const applicant: Applicant = {
      key: w.key,
      applicationId: w.n.applicationId,
      rowNumber: w.a.raw.rowNumber,
      raw: w.a.raw,
      normalised: w.n,
      isDuplicateHold: w.isDuplicateHold,
      territoryId: w.territory?.territoryId ?? null,
      tier: w.tier,
      issues: w.issues,
      gateResults: w.gates.results,
      readinessResults: w.readiness.results,
      isReady: w.gates.allPassed && w.readiness.allPassed && !w.isDuplicateHold,
      score: w.score,
      status,
      reasonCode: reasonCodeFor(status, w.gates.failure?.ruleId, firstReadinessFailure?.ruleId),
      reasonSentence: reason,
      nextStep,
      unlockCondition,
      rank: outcome.rank,
      assignedPin: outcome.assignedPin,
      reservedUntil: outcome.reservedUntil,
      suggestedPins: outcome.suggestedPins,
      competitors,
      counterfactual: [],
      onboardingPlan,
      messages: {} as Record<Language, string>,
      partnerToken: "",
      trace: [
        ...w.gates.results.map((r) => ({
          ruleId: r.ruleId,
          description: r.checked,
          values: r.values,
          outcome: r.passed ? "Pass" : `Fail — ${r.failReason}`,
        })),
        ...w.readiness.results.map((r) => ({
          ruleId: r.ruleId,
          description: r.checked,
          values: r.values,
          outcome: r.passed ? "Pass" : `Fail — ${r.failReason}`,
        })),
        {
          ruleId: "S-01" as const,
          description: "Score out of 100 — used for ranking only, never as a verdict",
          values: Object.fromEntries(w.score.components.map((c) => [c.label, `${c.points}/${c.max}`])),
          outcome: `${w.score.total} points.`,
        },
        ...outcome.trace,
      ],
      businessClassification: w.classification,
    };
    return applicant;
  });

  // ---- 8. Invariant, counterfactuals, messages ----
  let invariantViolation: string | null = null;
  try {
    assertOneStorePerPin(applicants, input.stores);
  } catch (err) {
    invariantViolation = err instanceof Error ? err.message : String(err);
  }

  // Salted with identity fields only. A partner link must survive a re-run after their own
  // reported change is applied, and patches never touch identity fields.
  const datasetHash = cheapHash(
    input.applications.map((a) => `${a.applicationId}|${a.applicantName}`).join("\n"),
  );
  for (const a of applicants) {
    a.partnerToken = `${a.applicationId.toLowerCase().replace(/[^a-z0-9]/g, "")}-${cheapHash(a.key + datasetHash)}`;
    if (withCounterfactuals) {
      a.counterfactual = buildCounterfactual(a, input, options);
    }
    a.messages = renderMessages(a, policy);
  }

  // ---- 9. Summary ----
  const counts: Record<Status, number> = {
    APPROVED: 0, WAITLISTED: 0, "ON HOLD": 0, REDIRECTED: 0, "NOT PROCEEDING": 0,
  };
  for (const a of applicants) counts[a.status]++;

  const totalSlots = territories.reduce((sum, t) => sum + t.usableCapacity, 0);
  const slotsFilled = applicants.filter((a) => a.status === "APPROVED").length;
  const slotsOpen = Math.max(0, totalSlots - slotsFilled);
  const highPrioritySlotsEmpty = territories
    .filter((t) => t.priority === "High")
    .reduce((sum, t) => {
      const filled = applicants.filter(
        (a) => a.status === "APPROVED" && a.territoryId === t.territoryId,
      ).length;
      return sum + Math.max(0, t.usableCapacity - filled);
    }, 0);

  const recruitmentGaps: RecruitmentGap[] = territories
    .map((t): RecruitmentGap => {
      const here = applicants.filter((a) => a.territoryId === t.territoryId);
      const filled = here.filter((a) => a.status === "APPROVED").length;
      return {
        territoryId: t.territoryId,
        city: t.city,
        tier: t.tier,
        priority: t.priority,
        freeCapacity: Math.max(0, t.usableCapacity - filled),
        readyApplicants: here.filter((a) => a.isReady && a.status !== "APPROVED").length,
        blockedApplicants: here.filter((a) => a.status === "ON HOLD").length,
        suggestedChannels: t.tier ? SOURCING_CHANNELS[t.tier] : [],
      };
    })
    .filter((g) => g.freeCapacity > 0 && g.readyApplicants === 0)
    .sort((a, b) => {
      const order = { High: 0, Medium: 1, Low: 2 };
      const pa = a.priority ? order[a.priority] : 3;
      const pb = b.priority ? order[b.priority] : 3;
      if (pa !== pb) return pa - pb;
      return b.freeCapacity - a.freeCapacity;
    });

  const todaysBrief = buildBrief(
    applicants, territories, counts, slotsFilled, totalSlots, highPrioritySlotsEmpty, recruitmentGaps, allIssues, policy,
  );

  const resultHash = cheapHash(
    JSON.stringify(
      applicants.map((a) => [a.key, a.status, a.reasonSentence, a.score.total, a.rank, a.assignedPin, a.reservedUntil]),
    ),
  );

  return {
    asOfDate,
    applicants,
    territories,
    stores: input.stores,
    issues: allIssues,
    normalisationLog: log.entries,
    invariantViolation,
    counts,
    slotsFilled,
    slotsOpen,
    highPrioritySlotsEmpty,
    todaysBrief,
    recruitmentGaps,
    resultHash,
  };
}

/**
 * Two rules often ask for the same field, one generically and one with the detail.
 * Keep the specific prompt and drop the one it already contains, so the operator
 * is never asked for the same thing twice in one sentence.
 */
function mergeUnlocks(conditions: (string | null | undefined)[]): string {
  const kept: string[] = [];
  for (const c of conditions.filter((x): x is string => !!x)) {
    if (kept.some((k) => k.includes(c))) continue;
    const i = kept.findIndex((k) => c.includes(k));
    if (i >= 0) kept[i] = c;
    else kept.push(c);
  }
  return kept.join(" ");
}

function reasonCodeFor(
  status: Status,
  gateId: string | undefined,
  readinessId: string | undefined,
): string {
  if (gateId) return gateId;
  if (status === "ON HOLD" && readinessId) return readinessId;
  if (status === "APPROVED") return "A-01";
  if (status === "WAITLISTED") return "A-01";
  if (status === "REDIRECTED") return "A-02";
  return "A-01";
}

function buildReason(
  status: Status,
  n: ReturnType<typeof normaliseApplicationRow>,
  tier: Tier | null,
  outcome: { rank: number | null; assignedPin: string | null; suggestedPins: string[]; pinTakenBy: string | null; reservedUntil: string | null },
  gateFailure: ReturnType<typeof evaluateGates>["failure"],
  readinessFailures: ReturnType<typeof evaluateReadiness>["failures"],
  territoryId: string | null,
  usableCapacity: number,
  score: number,
): string {
  const name = n.applicantName ?? n.applicationId;
  switch (status) {
    case "APPROVED":
      return `Approved for pin ${outcome.assignedPin} in ${territoryId}. ${name} meets every ${tier ?? ""} requirement and took the slot on a score of ${score}.`;
    case "WAITLISTED":
      return `Ready to proceed, but ${territoryId} has only ${usableCapacity} usable slot${usableCapacity === 1 ? "" : "s"} and ${name} is ranked ${ordinal(outcome.rank)}. They move up the moment a slot frees.`;
    case "ON HOLD": {
      if (gateFailure) return `On hold — ${gateFailure.reason}`;
      const f = readinessFailures[0];
      const extra = readinessFailures.length > 1 ? ` (${readinessFailures.length} checks still open)` : "";
      return `On hold — ${f?.failReason ?? "one requirement is still open."}${extra}`;
    }
    case "REDIRECTED": {
      const why = outcome.pinTakenBy
        ? `Pin ${n.pinCode} is taken by ${outcome.pinTakenBy}`
        : gateFailure
          ? gateFailure.reason.replace(/\.$/, "")
          : `Pin ${n.pinCode} cannot take a store`;
      return `${why}, but ${outcome.suggestedPins.length === 1 ? "pin" : "pins"} ${outcome.suggestedPins.join(", ")} ${outcome.suggestedPins.length === 1 ? "is" : "are"} free nearby. This is advice, not a rejection — no slot is taken and no pin is held.`;
    }
    case "NOT PROCEEDING":
      return `Not proceeding — ${gateFailure?.reason ?? "a hard requirement was not met."} The application stays on file.`;
  }
}

function buildNextStep(
  status: Status,
  outcome: { suggestedPins: string[]; reservedUntil: string | null },
  unlockCondition: string | null,
  launchDate: string | null,
  n: ReturnType<typeof normaliseApplicationRow>,
): string {
  switch (status) {
    case "APPROVED":
      return `Send the welcome message, start documents and KYC this week, and issue the franchise agreement. Planned opening ${launchDate ? formatDate(launchDate) : "to be dated"}.`;
    case "WAITLISTED":
      return "Keep warm with a monthly update. They are first in line if an approved partner drops out or a new slot opens.";
    case "ON HOLD":
      return `${unlockCondition ?? "Confirm the open item."}${outcome.reservedUntil ? ` Their pin is held until ${formatDate(outcome.reservedUntil)}.` : ""}`;
    case "REDIRECTED":
      return outcome.suggestedPins.length > 0
        ? `Offer ${outcome.suggestedPins.join(" or ")} and ask them to confirm a site in one of those pin codes.`
        : "Offer an alternative pin code once one frees up.";
    case "NOT PROCEEDING":
      return `Send the polite decline in ${n.preferredLanguage ?? "English"} and keep the application on file.${unlockCondition ? ` ${unlockCondition}` : ""}`;
  }
}

function ordinal(n: number | null): string {
  if (n === null) return "unranked";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function buildBrief(
  applicants: Applicant[],
  territories: Territory[],
  counts: Record<Status, number>,
  slotsFilled: number,
  totalSlots: number,
  highPrioritySlotsEmpty: number,
  gaps: RecruitmentGap[],
  issues: QualityIssue[],
  policy: PolicyProfile,
): string {
  const total = applicants.length;
  const blocking = issues.filter((i) => i.severity === "blocking").length;
  const reservations = applicants.filter((a) => a.reservedUntil).length;
  const parts: string[] = [];

  parts.push(
    `${total} application${total === 1 ? "" : "s"} processed across ${territories.length} territor${territories.length === 1 ? "y" : "ies"}.`,
  );
  parts.push(
    `${counts.APPROVED} approved, ${counts.WAITLISTED} waitlisted, ${counts["ON HOLD"]} on hold, ${counts.REDIRECTED} redirected and ${counts["NOT PROCEEDING"]} not proceeding.`,
  );
  parts.push(
    `${slotsFilled} of ${totalSlots} usable slot${totalSlots === 1 ? "" : "s"} are filled${highPrioritySlotsEmpty > 0 ? `, and ${highPrioritySlotsEmpty} high-priority slot${highPrioritySlotsEmpty === 1 ? " is" : "s are"} still empty` : ""}.`,
  );
  if (blocking > 0) {
    parts.push(
      `${blocking} blocking data issue${blocking === 1 ? "" : "s"} ${blocking === 1 ? "is" : "are"} holding applicants that would otherwise move — clearing those is the fastest win today.`,
    );
  }
  if (reservations > 0) {
    parts.push(
      `${reservations} pin code${reservations === 1 ? " is" : "s are"} provisionally reserved for ${policy.reservationWindowDays} days.`,
    );
  }
  if (gaps.length > 0) {
    const g = gaps[0];
    parts.push(
      `${gaps.length} territor${gaps.length === 1 ? "y has" : "ies have"} capacity but no ready applicant — start with ${g.territoryId} (${g.city}, ${g.priority} priority, ${g.freeCapacity} slot${g.freeCapacity === 1 ? "" : "s"}).`,
    );
  }
  return parts.join(" ");
}
