// A lead is a conversation, not a verdict. The cases here guard the two places that
// temptation shows up: collapsing a stated investment range into a figure the engine would
// then treat as declared, and letting a stage read as an assessment.

import { describe, expect, it } from "vitest";
import {
  blockingIssues,
  canLink,
  findDuplicates,
  followUpState,
  handoffPlan,
  isOpen,
  nextLeadId,
  stageCounts,
  validateLead,
  workload,
} from "../../lib/crm/leads";
import { LEAD_STAGES, type Lead } from "../../lib/crm/types";

const AS_OF = "2026-10-26";

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

describe("validating a lead", () => {
  it("requires a name and nothing else", () => {
    expect(validateLead({ name: "" }).map((i) => i.field)).toEqual(["name"]);
    expect(validateLead({ name: "   " }).map((i) => i.field)).toEqual(["name"]);
    expect(validateLead({ name: "Asha" })).toEqual([]);
  });

  it("accepts Indian mobile numbers in the shapes people actually type", () => {
    for (const phone of ["9876543210", "+91 98765 43210", "+91-9876543210", "09876543210"]) {
      expect(validateLead({ name: "Asha", phone })).toEqual([]);
    }
  });

  it("rejects a number that is not an Indian mobile", () => {
    for (const phone of ["12345", "1234567890", "+1 555 0100"]) {
      expect(validateLead({ name: "Asha", phone }).map((i) => i.field)).toContain("phone");
    }
  });

  it("rejects an address that is not an email", () => {
    expect(validateLead({ name: "Asha", email: "asha@" }).map((i) => i.field)).toContain("email");
    expect(validateLead({ name: "Asha", email: "asha@example.com" })).toEqual([]);
  });

  it("flags an unknown city without refusing the lead", () => {
    const issues = validateLead({ name: "Asha", city: "Atlantis" });
    expect(issues.map((i) => i.field)).toEqual(["city"]);
    // The point of the distinction: a city we do not serve must not lose us the prospect.
    expect(blockingIssues(issues)).toEqual([]);
  });

  it("still blocks on a bad email even when the city is also unknown", () => {
    const issues = validateLead({ name: "Asha", email: "nope", city: "Atlantis" });
    expect(blockingIssues(issues).map((i) => i.field)).toEqual(["email"]);
  });
});

describe("spotting the same person twice", () => {
  const existing = [
    lead({ leadId: "LEAD-001", email: "Asha@Example.com", phone: "9876543210", name: "Asha Rao" }),
  ];

  it("treats a matching email as a strong match regardless of case", () => {
    const [hit] = findDuplicates(existing, { name: "Someone", email: "asha@example.com" });
    expect(hit.on).toBe("email");
    expect(hit.strong).toBe(true);
  });

  it("treats a matching phone as strong even when written differently", () => {
    const [hit] = findDuplicates(existing, { name: "Someone", phone: "+91 98765 43210" });
    expect(hit.on).toBe("phone");
    expect(hit.strong).toBe(true);
  });

  it("reports name and city as a weak match for a person to judge", () => {
    const [hit] = findDuplicates(existing, { name: "asha rao", city: "Mysuru" });
    expect(hit.on).toBe("name and city");
    expect(hit.strong).toBe(false);
  });

  it("does not match on a name alone", () => {
    expect(findDuplicates(existing, { name: "Asha Rao" })).toEqual([]);
  });
});

describe("follow-up is measured against the as-of date, not the clock", () => {
  it("classifies against the date it is given", () => {
    expect(followUpState(lead({ nextFollowUpAt: "2026-10-20T09:00:00.000Z" }), AS_OF)).toBe(
      "overdue",
    );
    expect(followUpState(lead({ nextFollowUpAt: "2026-10-26T09:00:00.000Z" }), AS_OF)).toBe(
      "due today",
    );
    expect(followUpState(lead({ nextFollowUpAt: "2026-11-02T09:00:00.000Z" }), AS_OF)).toBe(
      "scheduled",
    );
    expect(followUpState(lead({ nextFollowUpAt: null }), AS_OF)).toBe("none");
  });

  it("keeps closed and converted leads out of everyone's queue", () => {
    expect(isOpen(lead({ stage: "Closed" }))).toBe(false);
    expect(isOpen(lead({ stage: "Converted" }))).toBe(false);
    expect(isOpen(lead({ stage: "Qualified" }))).toBe(true);

    const leads = [
      lead({ leadId: "LEAD-001", stage: "Closed", nextFollowUpAt: "2026-10-01T09:00:00.000Z" }),
      lead({ leadId: "LEAD-002", stage: "Contacted", nextFollowUpAt: "2026-10-01T09:00:00.000Z" }),
    ];
    expect(workload(leads, AS_OF).overdue.map((l) => l.leadId)).toEqual(["LEAD-002"]);
  });

  it("counts a brand-new lead with no interactions as never contacted", () => {
    const leads = [
      lead({ leadId: "LEAD-001", stage: "New" }),
      lead({
        leadId: "LEAD-002",
        stage: "New",
        interactions: [
          { id: "i1", at: "2026-10-02T09:00:00.000Z", kind: "call", summary: "Spoke", by: "Ops" },
        ],
      }),
    ];
    expect(workload(leads, AS_OF).uncontacted.map((l) => l.leadId)).toEqual(["LEAD-001"]);
  });

  it("surfaces a qualified lead that nobody scheduled anything for", () => {
    const leads = [
      lead({ leadId: "LEAD-001", stage: "Qualified", nextFollowUpAt: null }),
      lead({ leadId: "LEAD-002", stage: "Qualified", nextFollowUpAt: "2026-11-01T09:00:00.000Z" }),
    ];
    expect(
      workload(leads, AS_OF).qualifiedWithoutNextAction.map((l) => l.leadId),
    ).toEqual(["LEAD-001"]);
  });
});

describe("handing a lead over to an application", () => {
  it("refuses to collapse a stated range into a figure the engine would read as declared", () => {
    const plan = handoffPlan(lead({ investmentRange: { minLakh: 20, maxLakh: 40 } }));
    expect(plan.prefill.investmentLakh).toBeUndefined();
    const missing = plan.missing.find((m) => m.field === "investmentLakh");
    expect(missing).toBeDefined();
    expect(missing!.why).toContain("20–40");
    // 30 is the midpoint. It must appear nowhere.
    expect(JSON.stringify(plan.prefill)).not.toContain("30");
  });

  it("carries a single stated figure across unchanged", () => {
    const plan = handoffPlan(lead({ investmentRange: { minLakh: 25, maxLakh: 25 } }));
    expect(plan.prefill.investmentLakh).toBe("25");
    expect(plan.missing.find((m) => m.field === "investmentLakh")).toBeUndefined();
  });

  it("reports an unrecorded investment as missing rather than zero", () => {
    const plan = handoffPlan(lead());
    expect(plan.prefill.investmentLakh).toBeUndefined();
    expect(plan.missing.find((m) => m.field === "investmentLakh")?.why).toContain("No investment");
  });

  it("always asks for a pin code, because a lead records only a city", () => {
    expect(handoffPlan(lead()).missing.map((m) => m.field)).toContain("pinCode");
    expect(handoffPlan(lead({ city: "Mysuru" })).missing.map((m) => m.field)).toContain("pinCode");
  });

  it("gives every missing field a reason rather than a bare label", () => {
    for (const m of handoffPlan(lead()).missing) {
      expect(m.why.trim()).not.toBe("");
      expect(m.label.trim()).not.toBe("");
    }
  });

  it("maps site readiness onto the application's space field only where it is unambiguous", () => {
    expect(handoffPlan(lead({ siteReadiness: "Secured" })).prefill.spaceAvailable).toBe("Rented");
    expect(handoffPlan(lead({ siteReadiness: "Searching" })).prefill.spaceAvailable).toBe(
      "Not yet identified",
    );
    // "Shortlisted" is genuinely ambiguous, so nothing is asserted on the applicant's behalf.
    expect(handoffPlan(lead({ siteReadiness: "Shortlisted" })).prefill.spaceAvailable).toBeUndefined();
  });
});

describe("linking a lead to an application", () => {
  const known = new Set(["APP-001", "APP-002"]);

  it("allows a clean link", () => {
    expect(canLink(lead(), "APP-001", [lead()], known)).toEqual({ ok: true });
  });

  it("refuses an application the engine has never seen", () => {
    const res = canLink(lead(), "APP-999", [lead()], known);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toContain("not in the loaded dataset");
  });

  it("refuses to link a lead twice", () => {
    const already = lead({ linkedApplicationId: "APP-001" });
    const res = canLink(already, "APP-002", [already], known);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toContain("already linked to APP-001");
  });

  it("refuses to point two leads at one application", () => {
    const taken = lead({ leadId: "LEAD-009", linkedApplicationId: "APP-001" });
    const res = canLink(lead(), "APP-001", [taken, lead()], known);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toContain("LEAD-009");
  });
});

describe("lead bookkeeping", () => {
  it("allocates the next free id without reusing one", () => {
    expect(nextLeadId([])).toBe("LEAD-001");
    expect(nextLeadId([lead({ leadId: "LEAD-001" }), lead({ leadId: "LEAD-007" })])).toBe(
      "LEAD-008",
    );
  });

  it("ignores ids that are not in the LEAD-nnn shape", () => {
    expect(nextLeadId([lead({ leadId: "imported-42" })])).toBe("LEAD-001");
  });

  it("reports a count for every stage, including the empty ones", () => {
    const counts = stageCounts([lead({ stage: "Qualified" })]);
    expect(counts.map((c) => c.stage)).toEqual([...LEAD_STAGES]);
    expect(counts.find((c) => c.stage === "Qualified")?.count).toBe(1);
    expect(counts.find((c) => c.stage === "New")?.count).toBe(0);
  });
});
