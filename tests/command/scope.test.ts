// Narrowing the command centre. The thing worth pinning here is not that a filter removes
// rows — it is that the KPI numbers move with them, and that a facet which cannot narrow a
// collection says so instead of looking as though it applied.

import { describe, expect, it } from "vitest";
import { buildMetrics } from "../../lib/command/metrics";
import {
  isNarrowing,
  scopeDashboard,
  type Scope,
  type ScopeSubject,
  type ScopedRecord,
} from "../../lib/command/scope";
import { buildJourney, emptyProgress } from "../../lib/onboarding/journey";
import type { Lead } from "../../lib/crm/types";
import type { PendingUpdate } from "../../lib/types";
import { runSeed } from "../helpers";

const result = runSeed();

const EMPTY: Scope = {
  city: null,
  territoryId: null,
  status: null,
  leadStage: null,
  onboardingStage: null,
  owner: null,
  priority: null,
  from: null,
  to: null,
  query: "",
};

const scope = (over: Partial<Scope> = {}): Scope => ({ ...EMPTY, ...over });

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

const record = (over: Partial<ScopedRecord["profile"]> = {}): ScopedRecord => {
  const applicationId = over.applicationId ?? "APP-001";
  return {
    profile: {
      applicationId,
      partnerName: "Sample Partner",
      city: "Mysuru",
      territoryId: null,
      isDemo: false,
      ...over,
    },
    view: buildJourney(
      { applicationId, status: "APPROVED", onboardingPlan: null },
      emptyProgress(applicationId),
    ),
  };
};

const subject = (over: Partial<ScopeSubject> = {}): ScopeSubject => ({
  result,
  leads: [],
  records: [],
  pendingUpdates: [],
  ...over,
});

describe("knowing whether anything is filtered at all", () => {
  it("reports an untouched filter set as not narrowing", () => {
    expect(isNarrowing(EMPTY)).toBe(false);
    expect(scopeDashboard(subject(), EMPTY).isNarrowed).toBe(false);
  });

  it("counts an empty-string query as no filter, but any text as one", () => {
    expect(isNarrowing(scope({ query: "   " }))).toBe(false);
    expect(isNarrowing(scope({ query: "asha" }))).toBe(true);
  });

  it("removes nothing when no facet is set", () => {
    const out = scopeDashboard(
      subject({ leads: [lead()], records: [record()] }),
      EMPTY,
    );
    expect(out.removed).toEqual({ applicants: 0, leads: 0, journeys: 0, territories: 0 });
    expect(out.notes).toEqual([]);
  });
});

describe("the KPI cards follow the narrowed set", () => {
  it("recomputes the status counts rather than carrying the engine's totals through", () => {
    const out = scopeDashboard(subject(), scope({ status: "APPROVED" }));
    const counts = out.input.result.counts;
    expect(counts.APPROVED).toBe(out.input.result.applicants.length);
    expect(counts.WAITLISTED).toBe(0);
    expect(counts["ON HOLD"]).toBe(0);
    expect(counts.REDIRECTED).toBe(0);
    expect(counts["NOT PROCEEDING"]).toBe(0);
  });

  it("keeps a card and the list it links to in step", () => {
    const city = result.territories[0].city!;
    const out = scopeDashboard(subject(), scope({ city }));
    const metrics = buildMetrics(out.input);
    expect(metrics.find((m) => m.key === "applications")!.value).toBe(
      out.input.result.applicants.length,
    );
    expect(metrics.find((m) => m.key === "approved")!.value).toBe(
      out.input.result.counts.APPROVED,
    );
  });

  it("leaves the totals untouched when nothing is filtered", () => {
    const out = scopeDashboard(subject(), EMPTY);
    expect(out.input.result.counts).toEqual(result.counts);
    expect(out.input.result.applicants).toHaveLength(result.applicants.length);
  });
});

describe("a facet that cannot narrow a collection is reported, not hidden", () => {
  it("says a date range cannot touch applications, because none carries a date", () => {
    const out = scopeDashboard(subject(), scope({ from: "2026-10-01" }));
    expect(out.removed.applicants).toBe(0);
    expect(out.notes.join(" ")).toContain("no submission date");
  });

  it("says an owner is recorded against a lead, never an application", () => {
    const out = scopeDashboard(subject({ leads: [lead()] }), scope({ owner: "Ops" }));
    expect(out.removed.applicants).toBe(0);
    expect(out.notes.join(" ")).toContain("narrows leads only");
  });

  it("says an acquisition stage leaves applications and journeys alone", () => {
    const out = scopeDashboard(subject({ records: [record()] }), scope({ leadStage: "New" }));
    expect(out.removed.journeys).toBe(0);
    expect(out.notes.join(" ")).toContain("acquisition stage belongs to a lead");
  });

  it("names the status in the note it prints about leads", () => {
    const out = scopeDashboard(subject({ leads: [lead()] }), scope({ status: "WAITLISTED" }));
    expect(out.notes.join(" ")).toContain("WAITLISTED");
  });
});

describe("what each facet actually removes", () => {
  it("excludes every lead while a decision filter is set", () => {
    const out = scopeDashboard(
      subject({ leads: [lead(), lead({ leadId: "LEAD-002" })] }),
      scope({ status: "APPROVED" }),
    );
    expect(out.input.leads).toEqual([]);
    expect(out.removed.leads).toBe(2);
  });

  it("keeps journeys only when the decision filter is the one they all carry", () => {
    const records = [record()];
    expect(scopeDashboard(subject({ records }), scope({ status: "APPROVED" })).records).toHaveLength(
      1,
    );
    expect(scopeDashboard(subject({ records }), scope({ status: "ON HOLD" })).records).toEqual([]);
  });

  it("narrows an applicant by a priority it inherits through its territory", () => {
    const priority = result.territories.find((t) => t.priority)!.priority!;
    const out = scopeDashboard(subject(), scope({ priority }));
    const kept = new Set(out.territories.map((t) => t.territoryId));
    expect(out.territories.every((t) => t.priority === priority)).toBe(true);
    for (const a of out.input.result.applicants) {
      expect(a.territoryId).not.toBeNull();
      expect(kept.has(a.territoryId!)).toBe(true);
    }
  });

  it("drops an applicant with no territory from a priority band", () => {
    const priority = result.territories.find((t) => t.priority)!.priority!;
    const out = scopeDashboard(subject(), scope({ priority }));
    expect(out.input.result.applicants.some((a) => a.territoryId === null)).toBe(false);
  });

  it("narrows leads by owner and acquisition stage", () => {
    const leads = [
      lead({ leadId: "LEAD-001", assignedTo: "Asha", stage: "New" }),
      lead({ leadId: "LEAD-002", assignedTo: "Ravi", stage: "New" }),
      lead({ leadId: "LEAD-003", assignedTo: "Asha", stage: "Qualified" }),
    ];
    expect(
      scopeDashboard(subject({ leads }), scope({ owner: "Asha" })).input.leads.map((l) => l.leadId),
    ).toEqual(["LEAD-001", "LEAD-003"]);
    expect(
      scopeDashboard(subject({ leads }), scope({ leadStage: "Qualified" })).input.leads.map(
        (l) => l.leadId,
      ),
    ).toEqual(["LEAD-003"]);
  });

  it("narrows leads by the date they were created", () => {
    const leads = [
      lead({ leadId: "LEAD-001", createdAt: "2026-09-01T09:00:00.000Z" }),
      lead({ leadId: "LEAD-002", createdAt: "2026-10-15T09:00:00.000Z" }),
    ];
    const out = scopeDashboard(subject({ leads }), scope({ from: "2026-10-01" }));
    expect(out.input.leads.map((l) => l.leadId)).toEqual(["LEAD-002"]);
  });

  it("narrows journeys by the milestone they are standing on", () => {
    const r = record();
    const current = r.view.current!.def.key;
    expect(scopeDashboard(subject({ records: [r] }), scope({ onboardingStage: current })).records)
      .toHaveLength(1);
    const other = r.view.milestones.find((m) => m.def.key !== current)!.def.key;
    expect(
      scopeDashboard(subject({ records: [r] }), scope({ onboardingStage: other })).records,
    ).toEqual([]);
  });

  it("searches an applicant by id, name, city and allocated pin", () => {
    const a = result.applicants[0];
    for (const needle of [a.applicationId, a.normalised.applicantName!, a.normalised.city!]) {
      const out = scopeDashboard(subject(), scope({ query: needle.toLowerCase() }));
      expect(out.input.result.applicants.map((x) => x.applicationId)).toContain(a.applicationId);
    }
  });

  it("returns nothing at all for a query that matches nothing", () => {
    const out = scopeDashboard(
      subject({ leads: [lead()], records: [record()] }),
      scope({ query: "zzzz-no-such-thing" }),
    );
    expect(out.input.result.applicants).toEqual([]);
    expect(out.input.leads).toEqual([]);
    expect(out.records).toEqual([]);
  });
});

describe("pending updates follow the applications they belong to", () => {
  const update = (applicationId: string): PendingUpdate => ({
    id: `U-${applicationId}`,
    applicationId,
    submittedAt: "2026-10-20T09:00:00.000Z",
    message: "The lease is now signed.",
    proposedPatches: [],
    state: "pending",
  });

  it("keeps an update whose application survived and drops one whose did not", () => {
    const kept = result.applicants[0].applicationId;
    const out = scopeDashboard(
      subject({ pendingUpdates: [update(kept), update("APP-NOT-IN-SET")] }),
      scope({ query: kept.toLowerCase() }),
    );
    expect(out.input.pendingUpdates.map((u) => u.applicationId)).toEqual([kept]);
  });
});

describe("the removed counts describe the same arrays the page renders", () => {
  it("adds up against the inputs it was given", () => {
    const leads = [lead(), lead({ leadId: "LEAD-002", city: "Hubballi" })];
    const records = [record(), record({ applicationId: "APP-002", city: "Hubballi" })];
    const out = scopeDashboard(subject({ leads, records }), scope({ city: "Mysuru" }));
    expect(out.removed.leads).toBe(leads.length - out.input.leads.length);
    expect(out.removed.journeys).toBe(records.length - out.records.length);
    expect(out.removed.applicants).toBe(
      result.applicants.length - out.input.result.applicants.length,
    );
    expect(out.removed.territories).toBe(result.territories.length - out.territories.length);
  });
});
