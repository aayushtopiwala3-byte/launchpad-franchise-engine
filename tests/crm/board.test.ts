// Sorting and the pipeline board. The temptation these cases exist to block is treating a
// blank cell as a low value: an unstated investment sorting above ₹10L, or a lead with no
// follow-up scheduled heading the "soonest first" list as though it were due yesterday.

import { describe, expect, it } from "vitest";
import {
  SORT_BASIS,
  SORT_LABELS,
  boardColumns,
  canMoveTo,
  nextSort,
  sortLeads,
  type Sort,
  type SortKey,
} from "../../lib/crm/board";
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

const ids = (leads: Lead[]) => leads.map((l) => l.leadId);
const ALL_KEYS: SortKey[] = [
  "name",
  "city",
  "stage",
  "owner",
  "investment",
  "site",
  "followUp",
  "created",
];

describe("every sortable column explains what it orders by", () => {
  it("gives each key a label and a stated basis", () => {
    for (const key of ALL_KEYS) {
      expect(SORT_LABELS[key].trim()).not.toBe("");
      expect(SORT_BASIS[key].trim()).not.toBe("");
    }
  });

  it("says in the investment basis that no midpoint is invented", () => {
    expect(SORT_BASIS.investment).toContain("no midpoint is invented");
  });
});

describe("an unstated value sorts last whichever way the column points", () => {
  const leads = [
    lead({ leadId: "LEAD-001", investmentRange: { minLakh: null, maxLakh: null } }),
    lead({ leadId: "LEAD-002", investmentRange: { minLakh: 10, maxLakh: 10 } }),
    lead({ leadId: "LEAD-003", investmentRange: { minLakh: 40, maxLakh: 60 } }),
  ];

  it("keeps a blank investment at the bottom of lowest-first", () => {
    expect(ids(sortLeads(leads, { key: "investment", direction: "asc" }))).toEqual([
      "LEAD-002",
      "LEAD-003",
      "LEAD-001",
    ]);
  });

  it("keeps the same blank at the bottom of highest-first", () => {
    expect(ids(sortLeads(leads, { key: "investment", direction: "desc" }))).toEqual([
      "LEAD-003",
      "LEAD-002",
      "LEAD-001",
    ]);
  });

  it("does the same for an unscheduled follow-up", () => {
    const byDate = [
      lead({ leadId: "LEAD-001", nextFollowUpAt: null }),
      lead({ leadId: "LEAD-002", nextFollowUpAt: "2026-11-05T09:00:00.000Z" }),
      lead({ leadId: "LEAD-003", nextFollowUpAt: "2026-10-20T09:00:00.000Z" }),
    ];
    expect(ids(sortLeads(byDate, { key: "followUp", direction: "asc" })).at(-1)).toBe("LEAD-001");
    expect(ids(sortLeads(byDate, { key: "followUp", direction: "desc" })).at(-1)).toBe("LEAD-001");
  });

  it("does the same for an unassigned owner and an unrecorded city", () => {
    const leads2 = [
      lead({ leadId: "LEAD-001", assignedTo: null, city: null }),
      lead({ leadId: "LEAD-002", assignedTo: "Asha", city: "Hubballi" }),
    ];
    for (const direction of ["asc", "desc"] as const) {
      expect(ids(sortLeads(leads2, { key: "owner", direction })).at(-1)).toBe("LEAD-001");
      expect(ids(sortLeads(leads2, { key: "city", direction })).at(-1)).toBe("LEAD-001");
    }
  });
});

describe("a stated range keeps its own figures", () => {
  it("orders a range by the lowest figure the lead actually stated", () => {
    const leads = [
      lead({ leadId: "LEAD-001", investmentRange: { minLakh: 20, maxLakh: 40 } }),
      lead({ leadId: "LEAD-002", investmentRange: { minLakh: 25, maxLakh: 25 } }),
    ];
    // By a midpoint, 20–40 would be 30 and would sort after 25. It sorts before it.
    expect(ids(sortLeads(leads, { key: "investment", direction: "asc" }))).toEqual([
      "LEAD-001",
      "LEAD-002",
    ]);
  });

  it("uses the upper figure when only an upper figure was stated", () => {
    const leads = [
      lead({ leadId: "LEAD-001", investmentRange: { minLakh: null, maxLakh: 15 } }),
      lead({ leadId: "LEAD-002", investmentRange: { minLakh: 30, maxLakh: null } }),
    ];
    expect(ids(sortLeads(leads, { key: "investment", direction: "asc" }))).toEqual([
      "LEAD-001",
      "LEAD-002",
    ]);
  });
});

describe("sorting is stable and non-destructive", () => {
  const leads = [
    lead({ leadId: "LEAD-003", name: "Same Name" }),
    lead({ leadId: "LEAD-001", name: "Same Name" }),
    lead({ leadId: "LEAD-002", name: "Same Name" }),
  ];

  it("leaves equal rows in the order they arrived", () => {
    expect(ids(sortLeads(leads, { key: "name", direction: "asc" }))).toEqual([
      "LEAD-003",
      "LEAD-001",
      "LEAD-002",
    ]);
  });

  it("does not mutate the array it was given", () => {
    const before = ids(leads);
    sortLeads(leads, { key: "name", direction: "desc" });
    expect(ids(leads)).toEqual(before);
  });

  it("returns the original order after two flips of the same column", () => {
    const mixed = [
      lead({ leadId: "LEAD-001", name: "Bala" }),
      lead({ leadId: "LEAD-002", name: "Asha" }),
    ];
    const once = sortLeads(mixed, { key: "name", direction: "asc" });
    const twice = sortLeads(once, { key: "name", direction: "desc" });
    expect(ids(twice)).toEqual(["LEAD-001", "LEAD-002"]);
  });
});

describe("clicking a column header", () => {
  const current: Sort = { key: "name", direction: "asc" };

  it("flips the direction when it is already the sorted column", () => {
    expect(nextSort(current, "name")).toEqual({ key: "name", direction: "desc" });
    expect(nextSort({ key: "name", direction: "desc" }, "name")).toEqual({
      key: "name",
      direction: "asc",
    });
  });

  it("starts a new column ascending", () => {
    expect(nextSort({ key: "name", direction: "desc" }, "city")).toEqual({
      key: "city",
      direction: "asc",
    });
  });
});

describe("the stage column follows the pipeline, not the alphabet", () => {
  it("orders New before Qualified before Closed", () => {
    const leads = [
      lead({ leadId: "LEAD-001", stage: "Closed" }),
      lead({ leadId: "LEAD-002", stage: "New" }),
      lead({ leadId: "LEAD-003", stage: "Qualified" }),
    ];
    expect(ids(sortLeads(leads, { key: "stage", direction: "asc" }))).toEqual([
      "LEAD-002",
      "LEAD-003",
      "LEAD-001",
    ]);
  });
});

describe("the pipeline board", () => {
  it("gives every stage a column, including the ones nothing is sitting in", () => {
    const columns = boardColumns([lead({ stage: "Qualified" })], AS_OF);
    expect(columns.map((c) => c.stage)).toEqual([...LEAD_STAGES]);
    expect(columns.find((c) => c.stage === "New")!.leads).toEqual([]);
  });

  it("puts each lead in exactly one column and loses none", () => {
    const leads = [
      lead({ leadId: "LEAD-001", stage: "New" }),
      lead({ leadId: "LEAD-002", stage: "New" }),
      lead({ leadId: "LEAD-003", stage: "Converted" }),
    ];
    const columns = boardColumns(leads, AS_OF);
    expect(columns.flatMap((c) => c.leads)).toHaveLength(3);
    expect(columns.find((c) => c.stage === "New")!.leads).toHaveLength(2);
  });

  it("counts an overdue follow-up against the as-of date, not the clock", () => {
    const columns = boardColumns(
      [
        lead({ leadId: "LEAD-001", stage: "New", nextFollowUpAt: "2026-10-20T09:00:00.000Z" }),
        lead({ leadId: "LEAD-002", stage: "New", nextFollowUpAt: "2026-11-20T09:00:00.000Z" }),
      ],
      AS_OF,
    );
    expect(columns.find((c) => c.stage === "New")!.overdue).toBe(1);
  });

  it("marks the two stages that take a lead out of the working queue", () => {
    const closed = boardColumns([], AS_OF).filter((c) => c.isClosedStage);
    expect(closed.map((c) => c.stage)).toEqual(["Converted", "Closed"]);
  });
});

describe("moving a card cannot assert something only the engine knows", () => {
  it("refuses to mark a lead Converted without a linked application", () => {
    const res = canMoveTo(lead({ stage: "Qualified" }), "Converted");
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toContain("handover");
  });

  it("allows any other move, forwards or backwards", () => {
    expect(canMoveTo(lead({ stage: "Qualified" }), "Contacted")).toEqual({ ok: true });
    expect(canMoveTo(lead({ stage: "New" }), "Qualified")).toEqual({ ok: true });
    expect(canMoveTo(lead({ stage: "Qualified" }), "Closed")).toEqual({ ok: true });
  });

  it("refuses to move a lead that already became an application", () => {
    const linked = lead({ stage: "Converted", linkedApplicationId: "APP-001" });
    const res = canMoveTo(linked, "Qualified");
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toContain("APP-001");
  });

  it("refuses a move to the stage the lead is already on", () => {
    expect(canMoveTo(lead({ stage: "New" }), "New").ok).toBe(false);
  });
});
