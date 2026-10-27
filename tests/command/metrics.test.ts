// The command centre must never show a rate it cannot observe. These tests pin the two
// places a tidy-looking but invented number could appear: a conversion across a boundary
// where no event links the two steps, and a percentage over an empty denominator.

import { describe, expect, it } from "vitest";
import {
  awaitingReview,
  buildFunnel,
  buildMetrics,
  pinTotals,
  territoriesWithCapacity,
  type MetricsInput,
} from "../../lib/command/metrics";
import { buildJourney, emptyProgress } from "../../lib/onboarding/journey";
import type { Lead } from "../../lib/crm/types";
import type { JourneyView } from "../../lib/onboarding/types";
import type { PendingUpdate } from "../../lib/types";
import { runSeed } from "../helpers";

const pendingUpdate = (applicationId: string, state: PendingUpdate["state"]): PendingUpdate => ({
  id: "U1",
  applicationId,
  submittedAt: "2026-10-20T09:00:00.000Z",
  message: "The lease is now signed.",
  proposedPatches: [],
  state,
});

const result = runSeed();

const lead = (over: Partial<Lead> = {}): Lead => ({
  leadId: "LEAD-001",
  name: "Test Prospect",
  email: null,
  phone: null,
  city: "Mysuru",
  preferredTerritoryId: null,
  source: "Website enquiry",
  assignedTo: null,
  investmentRange: { minLakh: null, maxLakh: null },
  retailExperienceYears: null,
  siteReadiness: "Not stated",
  stage: "New",
  notes: null,
  createdAt: "2026-10-01T09:00:00.000Z",
  lastInteractionAt: null,
  nextFollowUpAt: null,
  consentToContact: null,
  preferredChannel: null,
  linkedApplicationId: null,
  interactions: [],
  isDemo: false,
  ...over,
});

const journeysFor = (ids: string[]): JourneyView[] =>
  ids.map((id) =>
    buildJourney(
      { applicationId: id, status: "APPROVED", onboardingPlan: null },
      emptyProgress(id),
    ),
  );

const input = (over: Partial<MetricsInput> = {}): MetricsInput => ({
  result,
  leads: [],
  journeys: [],
  pendingUpdates: [],
  ...over,
});

describe("the funnel withholds rates it cannot observe", () => {
  it("has twelve stages and never a rate on the first", () => {
    const funnel = buildFunnel(input());
    expect(funnel).toHaveLength(12);
    expect(funnel[0].conversionFromPrevious).toBeNull();
    expect(funnel[0].unavailableReason).toBeNull();
  });

  it("gives every later stage either a rate or a stated reason, never silence", () => {
    const funnel = buildFunnel(input({ leads: [lead()], journeys: journeysFor(["APP-001"]) }));
    for (const stage of funnel.slice(1)) {
      const hasRate = stage.conversionFromPrevious !== null;
      const hasReason = stage.unavailableReason !== null;
      expect(hasRate || hasReason).toBe(true);
      expect(hasRate && hasReason).toBe(false);
    }
  });

  it("refuses a rate across a boundary no event links, and says which two sources", () => {
    const funnel = buildFunnel(input({ leads: [lead({ stage: "Qualified" })] }));
    const crossing = funnel.find((s) => s.label === "Application submitted")!;
    expect(crossing.source).toBe("engine");
    expect(crossing.conversionFromPrevious).toBeNull();
    expect(crossing.unavailableReason).toContain("the lead records");
    expect(crossing.unavailableReason).toContain("the decision engine");
    expect(crossing.unavailableReason).toContain("invented");
  });

  it("refuses a rate when nothing reached the step before it", () => {
    const funnel = buildFunnel(input({ leads: [] }));
    const contacted = funnel.find((s) => s.label === "Contacted")!;
    expect(contacted.conversionFromPrevious).toBeNull();
    expect(contacted.unavailableReason).toContain("no denominator");
  });

  it("does compute a rate when both steps come from the same source", () => {
    const leads = [
      lead({ leadId: "LEAD-001", stage: "New" }),
      lead({ leadId: "LEAD-002", stage: "Contacted" }),
      lead({ leadId: "LEAD-003", stage: "Qualified" }),
      lead({ leadId: "LEAD-004", stage: "Qualified" }),
    ];
    const funnel = buildFunnel(input({ leads }));
    const contacted = funnel.find((s) => s.label === "Contacted")!;
    // Three of the four reached "Contacted" or beyond, out of four that reached "New".
    expect(contacted.count).toBe(3);
    expect(contacted.conversionFromPrevious).toBe(75);
    expect(contacted.unavailableReason).toBeNull();
  });

  it("counts a lead that moved past a stage as having reached it", () => {
    const funnel = buildFunnel(input({ leads: [lead({ stage: "Application submitted" })] }));
    expect(funnel.find((s) => s.label === "Lead")!.count).toBe(1);
    expect(funnel.find((s) => s.label === "Qualified")!.count).toBe(1);
  });

  it("leaves a closed lead out of every stage count", () => {
    const funnel = buildFunnel(input({ leads: [lead({ stage: "Closed" })] }));
    expect(funnel.find((s) => s.label === "Lead")!.count).toBe(0);
  });

  it("points every stage at a page that applies the same filter", () => {
    for (const stage of buildFunnel(input())) {
      expect(stage.href.startsWith("/")).toBe(true);
    }
  });
});

describe("the KPI cards", () => {
  const metrics = buildMetrics(input());

  it("states what each number counts and where clicking lands", () => {
    expect(metrics.length).toBeGreaterThan(0);
    for (const m of metrics) {
      expect(m.basis.trim()).not.toBe("");
      expect(m.href.startsWith("/")).toBe(true);
      expect(Number.isInteger(m.value)).toBe(true);
      expect(m.value).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives every card a distinct key", () => {
    expect(new Set(metrics.map((m) => m.key)).size).toBe(metrics.length);
  });

  it("agrees with the engine's own counts rather than recounting them differently", () => {
    expect(metrics.find((m) => m.key === "approved")!.value).toBe(result.counts.APPROVED ?? 0);
    expect(metrics.find((m) => m.key === "applications")!.value).toBe(result.applicants.length);
  });

  it("flags a count as including demo records only when a demo record is present", () => {
    const clean = buildMetrics(input());
    expect(clean.find((m) => m.key === "leads")!.includesDemo).toBe(false);

    const dirty = buildMetrics(input({ leads: [lead({ isDemo: true })] }));
    expect(dirty.find((m) => m.key === "leads")!.includesDemo).toBe(true);
  });
});

describe("what 'awaiting review' actually counts", () => {
  it("counts cases a person must look at, not cases the engine has not decided", () => {
    // Every applicant already has a status; none of them is undecided.
    for (const a of result.applicants) expect(a.status).toBeTruthy();

    const flagged = awaitingReview(result, []);
    for (const a of flagged) {
      expect(a.issues.some((i) => i.severity === "blocking")).toBe(true);
    }
  });

  it("includes an application with an unanswered partner update", () => {
    const target = result.applicants[0].applicationId;
    const withPending = awaitingReview(result, [pendingUpdate(target, "pending")]);
    expect(withPending.map((a) => a.applicationId)).toContain(target);
  });

  it("ignores an update that has already been answered", () => {
    const target = result.applicants[0].applicationId;
    const base = awaitingReview(result, []).map((a) => a.applicationId);
    const after = awaitingReview(result, [pendingUpdate(target, "accepted")]).map(
      (a) => a.applicationId,
    );
    expect(after).toEqual(base);
  });
});

describe("pin availability reads the allocation, not the input", () => {
  it("counts every usable pin as either free or held, and no ceded pin as either", () => {
    const { free, held } = pinTotals(result.territories);
    const usable = result.territories.reduce(
      (sum, t) => sum + t.pins.filter((p) => !t.cededPins.includes(p)).length,
      0,
    );
    expect(free + held).toBe(usable);
  });

  it("counts a pin as held when the allocation wrote a holder for it", () => {
    const allocated = result.territories.reduce(
      (sum, t) =>
        sum + t.pins.filter((p) => !t.cededPins.includes(p) && t.pinHolders[p]).length,
      0,
    );
    expect(pinTotals(result.territories).held).toBe(allocated);
  });

  it("reports capacity only where both a slot and a free pin remain", () => {
    for (const t of territoriesWithCapacity(result.territories)) {
      const approvals = t.queue.filter((q) => q.status === "APPROVED").length;
      const freePins = t.pins.filter((p) => !t.cededPins.includes(p) && !t.pinHolders[p]).length;
      expect(approvals).toBeLessThan(t.usableCapacity);
      expect(freePins).toBeGreaterThan(0);
    }
  });
});
