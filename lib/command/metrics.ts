// Command centre arithmetic. Pure: it reads the engine's result, the leads and the recorded
// onboarding progress, and returns numbers. It never stores a count anywhere, so a KPI can
// never disagree with the page it links to — both read the same arrays.
//
// Two rules shape everything here.
//
// 1. Availability comes from `territory.pinHolders`, the map allocation actually writes.
//    `occupiedPins` is the pre-allocation input and lists existing stores only; reading it
//    for display is what caused D-8, where a full territory reported nothing held a pin.
//
// 2. A conversion rate is shown only when both its numerator and its denominator are
//    observable. There is no event log of "how many leads existed before this dataset", so
//    rates across that boundary are reported as unavailable rather than guessed.

import { followUpState, isOpen } from "../crm/leads";
import type { Lead } from "../crm/types";
import { stageLabel, type OnboardingStageLabel } from "../onboarding/journey";
import type { JourneyView } from "../onboarding/types";
import type { Applicant, PendingUpdate, PipelineResult, Status, Territory } from "../types";

export type MetricKey =
  | "applications"
  | "leads"
  | "awaiting-review"
  | "approved"
  | "waitlisted"
  | "on-hold"
  | "redirected"
  | "not-proceeding"
  | "territories-with-capacity"
  | "pins-free"
  | "pins-held"
  | "partners-onboarding"
  | "sites-awaiting-verification"
  | "awaiting-training"
  | "launch-ready"
  | "stores-opened";

export interface Metric {
  key: MetricKey;
  label: string;
  value: number;
  /** Where clicking lands, with the filter already applied. */
  href: string;
  /** What the number counts, in one sentence. Shown on the card. */
  basis: string;
  /** True when the number comes from seeded illustrative records rather than the dataset. */
  includesDemo: boolean;
  tone?: "good" | "warn" | "bad";
}

const STATUS_METRIC: { key: MetricKey; status: Status; label: string; tone: Metric["tone"] }[] = [
  { key: "approved", status: "APPROVED", label: "Approved", tone: "good" },
  { key: "waitlisted", status: "WAITLISTED", label: "Waitlisted", tone: "warn" },
  { key: "on-hold", status: "ON HOLD", label: "On hold", tone: "warn" },
  { key: "redirected", status: "REDIRECTED", label: "Redirected", tone: undefined },
  { key: "not-proceeding", status: "NOT PROCEEDING", label: "Not proceeding", tone: "bad" },
];

export interface MetricsInput {
  result: PipelineResult;
  leads: Lead[];
  journeys: JourneyView[];
  pendingUpdates: PendingUpdate[];
}

/**
 * Applications a human still has to look at. The engine has already decided every one of
 * them — this is not a queue of undecided cases, because there is no such state. It counts
 * applications carrying a blocking data-quality issue or an unanswered partner update,
 * which are the two things that actually need a person.
 */
export function awaitingReview(result: PipelineResult, pendingUpdates: PendingUpdate[]): Applicant[] {
  const pendingIds = new Set(
    pendingUpdates.filter((u) => u.state === "pending").map((u) => u.applicationId),
  );
  return result.applicants.filter(
    (a) => pendingIds.has(a.applicationId) || a.issues.some((i) => i.severity === "blocking"),
  );
}

export function pinTotals(territories: Territory[]): { free: number; held: number } {
  let free = 0;
  let held = 0;
  for (const t of territories) {
    for (const pin of t.pins) {
      if (t.cededPins.includes(pin)) continue;
      if (t.pinHolders[pin]) held += 1;
      else free += 1;
    }
  }
  return { free, held };
}

export function territoriesWithCapacity(territories: Territory[]): Territory[] {
  return territories.filter((t) => {
    const approvals = t.queue.filter((q) => q.status === "APPROVED").length;
    const freePins = t.pins.filter((p) => !t.cededPins.includes(p) && !t.pinHolders[p]).length;
    return approvals < t.usableCapacity && freePins > 0;
  });
}

export function buildMetrics(input: MetricsInput): Metric[] {
  const { result, leads, journeys, pendingUpdates } = input;
  const pins = pinTotals(result.territories);
  const demoLeads = leads.some((l) => l.isDemo);
  const demoJourneys = journeys.some((j) => j.isDemo);

  const stages = journeys.map((j) => stageLabel(j));
  const opened = stages.filter((s) => s === "Opened").length;
  const launchReady = journeys.filter((j) => j.launch.verdict === "Authorised to open").length;
  const awaitingTraining = journeys.filter(
    (j) => j.current?.def.key === "staffing" && j.launch.verdict !== "Store opened",
  ).length;
  const awaitingSite = journeys.filter((j) => j.current?.def.key === "site-inspection").length;

  const metrics: Metric[] = [
    {
      key: "applications",
      label: "Applications",
      value: result.applicants.length,
      href: "/applicants",
      basis: "Rows in the loaded Applications sheet, after duplicate rows are held separately.",
      includesDemo: false,
    },
    {
      key: "leads",
      label: "Acquisition leads",
      value: leads.filter(isOpen).length,
      href: "/acquisition",
      basis: "Leads that have not been converted or closed.",
      includesDemo: demoLeads,
    },
    {
      key: "awaiting-review",
      label: "Awaiting human review",
      value: awaitingReview(result, pendingUpdates).length,
      href: "/applicants?review=1",
      basis: "A blocking data-quality issue, or a partner update nobody has answered.",
      includesDemo: false,
      tone: "warn",
    },
  ];

  for (const s of STATUS_METRIC) {
    metrics.push({
      key: s.key,
      label: s.label,
      value: result.counts[s.status] ?? 0,
      href: `/applicants?status=${encodeURIComponent(s.status)}`,
      basis: `Engine verdict ${s.status}. Issued by the rules, not by anyone here.`,
      includesDemo: false,
      tone: s.tone,
    });
  }

  metrics.push(
    {
      key: "territories-with-capacity",
      label: "Territories with capacity",
      value: territoriesWithCapacity(result.territories).length,
      href: "/territories?capacity=1",
      basis: "An unfilled usable slot and at least one pin nobody holds.",
      includesDemo: false,
    },
    {
      key: "pins-free",
      label: "Free pin codes",
      value: pins.free,
      href: "/territories",
      basis: "Pins with no holder in the allocation map, ceded pins excluded.",
      includesDemo: false,
    },
    {
      key: "pins-held",
      label: "Held pin codes",
      value: pins.held,
      href: "/territories",
      basis: "Held by an existing store, an approved applicant or a reservation.",
      includesDemo: false,
    },
    {
      key: "partners-onboarding",
      label: "Partners onboarding",
      value: journeys.filter((j) => j.launch.verdict !== "Store opened").length,
      href: "/onboarding",
      basis: "Approved partners with a journey that has not reached an opening.",
      includesDemo: demoJourneys,
    },
    {
      key: "sites-awaiting-verification",
      label: "Sites awaiting inspection",
      value: awaitingSite,
      href: "/onboarding?stage=Site",
      basis: "Site submitted, waiting on the expansion team's visit and sign-off.",
      includesDemo: demoJourneys,
      tone: awaitingSite > 0 ? "warn" : undefined,
    },
    {
      key: "awaiting-training",
      label: "Awaiting training",
      value: awaitingTraining,
      href: "/onboarding?stage=Training",
      basis: "Staff hiring and training is the current milestone.",
      includesDemo: demoJourneys,
    },
    {
      key: "launch-ready",
      label: "Authorised to open",
      value: launchReady,
      href: "/onboarding?stage=Launch%20ready",
      basis: "A Brand user has issued the authorisation and the store has not opened yet.",
      includesDemo: demoJourneys,
      tone: "good",
    },
    {
      key: "stores-opened",
      label: "Stores opened",
      value: opened,
      href: "/onboarding?stage=Opened",
      basis: "Recorded as opened in the onboarding journey. Separate from the stores sheet.",
      includesDemo: demoJourneys,
      tone: "good",
    },
  );

  return metrics;
}

export interface FunnelStage {
  label: string;
  count: number;
  /** Null when the step before it cannot be counted from what this product observes. */
  conversionFromPrevious: number | null;
  unavailableReason: string | null;
  href: string;
  source: "leads" | "engine" | "onboarding";
}

/**
 * The twelve-step expansion funnel. Counts are cumulative in intent but each is measured
 * independently, so a step can exceed the one before it — an application can arrive without
 * ever having been a lead in this system. Where that happens the conversion rate is withheld
 * rather than clipped to look tidy, because a tidy number here would be a false one.
 */
export function buildFunnel(input: MetricsInput): FunnelStage[] {
  const { result, leads, journeys } = input;

  const reached = (stage: string) => {
    // A lead that reached "Qualified" and moved on is still evidence it reached it. Stage
    // order is the ladder in LEAD_STAGES; anything at or beyond counts.
    const order = [
      "New",
      "Contacted",
      "Interested",
      "Qualification pending",
      "Qualified",
      "Application invited",
      "Application submitted",
      "Converted",
      "Closed",
    ];
    const idx = order.indexOf(stage);
    return leads.filter((l) => l.stage !== "Closed" && order.indexOf(l.stage) >= idx).length;
  };

  const stageCount = (label: OnboardingStageLabel) =>
    journeys.filter((j) => stageLabel(j) === label).length;

  const openedCount = stageCount("Opened");
  const approved = result.counts.APPROVED ?? 0;

  const raw: Omit<FunnelStage, "conversionFromPrevious" | "unavailableReason">[] = [
    { label: "Lead", count: reached("New"), href: "/acquisition", source: "leads" },
    { label: "Contacted", count: reached("Contacted"), href: "/acquisition?stage=Contacted", source: "leads" },
    { label: "Qualified", count: reached("Qualified"), href: "/acquisition?stage=Qualified", source: "leads" },
    {
      label: "Application submitted",
      count: result.applicants.length,
      href: "/applicants",
      source: "engine",
    },
    {
      label: "Under review",
      count: awaitingReview(result, input.pendingUpdates).length,
      href: "/applicants?review=1",
      source: "engine",
    },
    { label: "Approved", count: approved, href: "/applicants?status=APPROVED", source: "engine" },
    {
      label: "Site secured",
      count: journeys.filter((j) =>
        j.milestones.find((m) => m.def.key === "site-inspection" && m.status === "Complete"),
      ).length,
      href: "/onboarding?stage=Site",
      source: "onboarding",
    },
    {
      label: "Agreement completed",
      count: journeys.filter((j) =>
        j.milestones.find((m) => m.def.key === "agreement" && m.status === "Complete"),
      ).length,
      href: "/onboarding?stage=Agreement",
      source: "onboarding",
    },
    {
      label: "Onboarding",
      count: journeys.filter((j) => j.launch.verdict !== "Store opened").length,
      href: "/onboarding",
      source: "onboarding",
    },
    { label: "Training", count: stageCount("Training"), href: "/onboarding?stage=Training", source: "onboarding" },
    {
      label: "Launch ready",
      count: journeys.filter((j) => j.launch.authorised && j.launch.verdict !== "Store opened").length,
      href: "/onboarding?stage=Launch%20ready",
      source: "onboarding",
    },
    { label: "Store opened", count: openedCount, href: "/onboarding?stage=Opened", source: "onboarding" },
  ];

  return raw.map((stage, i) => {
    if (i === 0) {
      return { ...stage, conversionFromPrevious: null, unavailableReason: null };
    }
    const prev = raw[i - 1];
    if (prev.source !== stage.source) {
      return {
        ...stage,
        conversionFromPrevious: null,
        unavailableReason: `No event links ${prev.label.toLowerCase()} to ${stage.label.toLowerCase()}: one is counted from ${sourceName(prev.source)} and the other from ${sourceName(stage.source)}. A rate across that boundary would be invented.`,
      };
    }
    if (prev.count === 0) {
      return {
        ...stage,
        conversionFromPrevious: null,
        unavailableReason: `Nothing reached ${prev.label.toLowerCase()}, so there is no denominator.`,
      };
    }
    return {
      ...stage,
      conversionFromPrevious: Math.round((stage.count / prev.count) * 100),
      unavailableReason: null,
    };
  });
}

function sourceName(s: FunnelStage["source"]): string {
  if (s === "leads") return "the lead records";
  if (s === "engine") return "the decision engine";
  return "the onboarding journeys";
}

export interface BottleneckItem {
  id: string;
  label: string;
  detail: string;
  href: string;
}

export interface Bottleneck {
  key: string;
  title: string;
  /** Why this list matters, and what it does not claim. */
  note: string | null;
  items: BottleneckItem[];
}

export function buildBottlenecks(
  input: MetricsInput & { asOfDate: string; applicantName: (id: string) => string | null },
): Bottleneck[] {
  const { result, leads, journeys, pendingUpdates, asOfDate } = input;

  const overdue = leads
    .filter((l) => isOpen(l) && followUpState(l, asOfDate) === "overdue")
    .map((l) => ({
      id: l.leadId,
      label: l.name,
      detail: `Follow-up was due ${l.nextFollowUpAt?.slice(0, 10)}.`,
      href: `/acquisition/${l.leadId}`,
    }));

  const uncontacted = leads
    .filter((l) => l.stage === "New" && l.interactions.length === 0)
    .map((l) => ({
      id: l.leadId,
      label: l.name,
      detail: `Recorded ${l.createdAt.slice(0, 10)}, no interaction logged.`,
      href: `/acquisition/${l.leadId}`,
    }));

  const blocking = result.applicants
    .filter((a) => a.issues.some((i) => i.severity === "blocking"))
    .map((a) => ({
      id: a.key,
      label: a.applicationId,
      detail: a.issues.find((i) => i.severity === "blocking")!.message,
      href: `/applicants/${a.applicationId}`,
    }));

  const updates = pendingUpdates
    .filter((u) => u.state === "pending")
    .map((u) => ({
      id: u.id,
      label: u.applicationId,
      detail: u.message.slice(0, 120),
      href: `/applicants/${u.applicationId}`,
    }));

  const noProgress = journeys
    .filter((j) => j.completedWeight <= 5 && j.launch.verdict !== "Store opened")
    .map((j) => ({
      id: j.applicationId,
      label: j.applicationId,
      detail: "Approved, but nothing beyond the approval itself is recorded.",
      href: `/onboarding/${j.applicationId}`,
    }));

  const sites = journeys
    .filter((j) => j.current?.def.key === "site-inspection")
    .map((j) => ({
      id: j.applicationId,
      label: j.applicationId,
      detail: "Waiting on the expansion team's site visit and written approval.",
      href: `/onboarding/${j.applicationId}`,
    }));

  const corrections = journeys.flatMap((j) =>
    j.outstandingDocuments
      .filter((d) => d.record.state === "Needs correction")
      .map((d) => ({
        id: `${j.applicationId}-${d.def.id}`,
        label: `${j.applicationId} · ${d.def.label}`,
        detail: d.record.note ?? "Returned for correction.",
        href: `/onboarding/${j.applicationId}`,
      })),
  );

  const authorisation = journeys
    .filter((j) => j.launch.verdict === "Awaiting brand authorisation")
    .map((j) => ({
      id: j.applicationId,
      label: j.applicationId,
      detail: "Every task and document is clear. Only the authorisation is outstanding.",
      href: `/onboarding/${j.applicationId}`,
    }));

  return [
    { key: "overdue", title: "Overdue follow-ups", note: null, items: overdue },
    { key: "uncontacted", title: "Leads never contacted", note: null, items: uncontacted },
    {
      key: "blocking",
      title: "Applications with blocking data issues",
      note: "The engine still decided these. The issue is the data, not the verdict.",
      items: blocking,
    },
    {
      key: "updates",
      title: "Partner updates awaiting a decision",
      note: null,
      items: updates,
    },
    {
      key: "stalled",
      title: "Approved partners with no onboarding progress",
      note: null,
      items: noProgress,
    },
    { key: "sites", title: "Sites awaiting inspection", note: null, items: sites },
    { key: "corrections", title: "Documents returned for correction", note: null, items: corrections },
    {
      key: "authorisation",
      title: "Awaiting authorisation to open",
      note: "Everything else is clear. A Brand user has to issue the authorisation.",
      items: authorisation,
    },
  ];
}

export interface TerritorySnapshot {
  territory: Territory;
  storePins: string[];
  approvedPins: string[];
  reservedPins: string[];
  freePins: string[];
  /**
   * Pins in the same city held by a *different* territory. This is a prompt to look, not a
   * finding: an exact pin can only be held once, and the engine guarantees that. Two stores
   * in neighbouring pins may or may not take trade from each other, and nothing in the data
   * says which. It is never counted as a conflict.
   */
  possibleOverlap: { pin: string; heldBy: string; territoryId: string }[];
}

export function territorySnapshots(territories: Territory[]): TerritorySnapshot[] {
  return territories.map((t) => {
    const of = (kind: "store" | "approved" | "reserved") =>
      t.pins.filter((p) => !t.cededPins.includes(p) && t.pinHolders[p]?.kind === kind);

    const possibleOverlap: TerritorySnapshot["possibleOverlap"] = [];
    if (t.city) {
      for (const other of territories) {
        if (other.territoryId === t.territoryId || other.city !== t.city) continue;
        for (const pin of other.pins) {
          const holder = other.pinHolders[pin];
          if (holder) {
            possibleOverlap.push({ pin, heldBy: holder.id, territoryId: other.territoryId });
          }
        }
      }
    }

    return {
      territory: t,
      storePins: of("store"),
      approvedPins: of("approved"),
      reservedPins: of("reserved"),
      freePins: t.pins.filter((p) => !t.cededPins.includes(p) && !t.pinHolders[p]),
      possibleOverlap,
    };
  });
}
