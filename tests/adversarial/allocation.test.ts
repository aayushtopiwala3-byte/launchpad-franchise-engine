import { describe, expect, it } from "vitest";
import { EMBEDDED_STORES } from "../../lib/reference";
import type { PipelineResult } from "../../lib/types";
import { appRow, applicant, run, statusOf, terRow } from "../helpers";

/**
 * Test area C. Allocation is where the engine spends something real: a pin code, and with it
 * a slot nobody else can have. These tests hold it to the three things that make the spend
 * defensible — a pin is claimed once, a redirect is advice rather than a claim, and a
 * territory is worked in the order the brand asked for rather than the order the file listed.
 */

const claimedPins = (r: PipelineResult) =>
  r.applicants.map((a) => a.assignedPin).filter((p): p is string => p !== null);

describe("an applicant is matched to the territory that owns their pin", () => {
  it("joins the territory covering the pin, not the one naming the city", () => {
    const result = run(
      [appRow({ applicationId: "APP-950", pinCode: "570004" })],
      [
        terRow({ territoryId: "TER-01", pinCodesCovered: "570002, 570003", openSlots: "2" }),
        terRow({ territoryId: "TER-02", pinCodesCovered: "570004, 570005", openSlots: "2" }),
      ],
    );

    expect(applicant(result, "APP-950").territoryId).toBe("TER-02");
    expect(statusOf(result, "APP-950")).toBe("APPROVED");
  });

  it("approves nobody whose pin no territory covers", () => {
    const result = run(
      [appRow({ applicationId: "APP-951", pinCode: "570099" })],
      [terRow({ pinCodesCovered: "570002, 570003", openSlots: "2" })],
    );
    const a = applicant(result, "APP-951");

    expect(a.status).not.toBe("APPROVED");
    expect(a.assignedPin).toBeNull();
    expect(a.gateResults.some((g) => g.ruleId === "G-04" && !g.passed)).toBe(true);
  });

  it("never places an applicant on a pin outside their own city", () => {
    const result = run(
      [appRow({ applicationId: "APP-952", city: "Mysuru", pinCode: "570002" })],
      [
        terRow({ territoryId: "TER-01", pinCodesCovered: "570002", openSlots: "1" }),
        terRow({
          territoryId: "TER-02",
          city: "Belagavi",
          pinCodesCovered: "590001, 590002",
          openSlots: "2",
        }),
      ],
    );

    expect(applicant(result, "APP-952").assignedPin).toBe("570002");
    for (const a of result.applicants) {
      if (a.suggestedPins.length > 0) {
        expect(a.suggestedPins.every((p) => p.startsWith("570"))).toBe(true);
      }
    }
  });
});

describe("a redirect is advice, so it spends nothing", () => {
  const contested = run(
    [
      appRow({ applicationId: "APP-960", pinCode: "570002", investmentLakh: "80" }),
      appRow({ applicationId: "APP-961", pinCode: "570002", investmentLakh: "40" }),
    ],
    [terRow({ pinCodesCovered: "570002, 570003, 570004", openSlots: "3" })],
  );

  it("redirects the loser of a shared pin rather than rejecting them", () => {
    expect(statusOf(contested, "APP-960")).toBe("APPROVED");
    expect(statusOf(contested, "APP-961")).toBe("REDIRECTED");
    expect(applicant(contested, "APP-961").suggestedPins.length).toBeGreaterThan(0);
  });

  it("holds no pin and takes no slot for the redirected applicant", () => {
    const a = applicant(contested, "APP-961");

    expect(a.assignedPin).toBeNull();
    expect(claimedPins(contested)).toEqual(["570002"]);
    expect(contested.slotsFilled).toBe(1);
  });

  it("names only pins that are genuinely free when the advice is given", () => {
    const a = applicant(contested, "APP-961");
    const taken = new Set([...claimedPins(contested), ...EMBEDDED_STORES.map((s) => s.pinCode)]);

    for (const p of a.suggestedPins) expect(taken.has(p)).toBe(false);
  });

  it("says who holds the pin the applicant asked for", () => {
    const a = applicant(contested, "APP-961");

    expect(a.reasonSentence).toContain("APP-960");
    expect(a.reasonSentence).toContain("570002");
  });

  /**
   * A redirect needs a named free pin to point at. With nothing free the spec is explicit
   * that the applicant is waitlisted, because "go somewhere else" with nowhere to go is a
   * rejection wearing a kinder word.
   */
  it("waitlists rather than redirects when the city has no free pin left", () => {
    const result = run(
      [
        appRow({ applicationId: "APP-962", pinCode: "570002", investmentLakh: "80" }),
        appRow({ applicationId: "APP-963", pinCode: "570002", investmentLakh: "40" }),
      ],
      [terRow({ pinCodesCovered: "570002", openSlots: "2" })],
    );
    const a = applicant(result, "APP-963");

    expect(a.status).toBe("WAITLISTED");
    expect(a.suggestedPins).toEqual([]);
  });

  it("points across to another territory in the same city when a store blocks the pin", () => {
    const result = run(
      [appRow({ applicationId: "APP-964", pinCode: "570009" })],
      [
        terRow({ territoryId: "TER-01", pinCodesCovered: "570009", openSlots: "1" }),
        terRow({ territoryId: "TER-02", pinCodesCovered: "570005, 570006", openSlots: "2" }),
      ],
    );
    const a = applicant(result, "APP-964");

    expect(a.status).toBe("REDIRECTED");
    expect(a.suggestedPins).toContain("570005");
    expect(a.assignedPin).toBeNull();
  });

  /**
   * Known and deliberate, and the one place the two redirect paths disagree. An applicant
   * blocked by a *gate* is offered free pins anywhere in their city; an applicant blocked by
   * *capacity* is waitlisted where they stand, even when another territory in the same city
   * has both a free pin and a slot. Pass A tests capacity before it tests the pin, so the
   * cross-territory lookup in Pass B is never reached. Pinned as a documented limit rather
   * than changed, because which of the two is right is a brand decision, not an arithmetic
   * one — see the ambiguities section of the QA report.
   */
  it("waitlists a capacity-blocked applicant without naming the free pin next door", () => {
    const result = run(
      [
        appRow({ applicationId: "APP-966", pinCode: "570002", investmentLakh: "80" }),
        appRow({ applicationId: "APP-967", pinCode: "570002", investmentLakh: "40" }),
      ],
      [
        terRow({ territoryId: "TER-01", pinCodesCovered: "570002", openSlots: "1" }),
        terRow({ territoryId: "TER-02", pinCodesCovered: "570005, 570006", openSlots: "2" }),
      ],
    );
    const a = applicant(result, "APP-967");

    expect(a.status).toBe("WAITLISTED");
    expect(a.suggestedPins).toEqual([]);
    expect(result.territories.find((t) => t.territoryId === "TER-02")!.usableCapacity).toBe(2);
  });
});

describe("territory priority orders the work without deciding the outcome", () => {
  const verdicts = (r: PipelineResult) =>
    [...r.applicants]
      .map((a) => [a.applicationId, a.status, a.assignedPin] as const)
      .sort((x, y) => (x[0] < y[0] ? -1 : 1));

  const withPriorities = (first: string, second: string) =>
    run(
      [
        appRow({ applicationId: "APP-970", pinCode: "570002" }),
        appRow({ applicationId: "APP-971", pinCode: "570005" }),
      ],
      [
        terRow({ territoryId: "TER-01", pinCodesCovered: "570002", openSlots: "1", priority: first }),
        terRow({ territoryId: "TER-02", pinCodesCovered: "570005", openSlots: "1", priority: second }),
      ],
    );

  /**
   * Capacity and pin codes are both partitioned per territory, so working one territory
   * before another cannot move a verdict. Priority therefore tells the operator where the
   * brand wants stores first; it does not quietly decide who gets one.
   */
  it("reaches the same verdicts whichever territory the brand prioritises", () => {
    expect(verdicts(withPriorities("High", "Low"))).toEqual(
      verdicts(withPriorities("Low", "High")),
    );
    expect(statusOf(withPriorities("Low", "High"), "APP-970")).toBe("APPROVED");
  });

  it("decides the same way when priority is not stated at all", () => {
    expect(verdicts(withPriorities("", ""))).toEqual(verdicts(withPriorities("High", "High")));
  });

  it("flags the missing priority rather than silently ranking it", () => {
    const result = withPriorities("", "High");
    const flagged = result.issues.filter((i) => i.id === "DQ-01" && i.column === "Priority");

    expect(flagged).toHaveLength(1);
    expect(flagged[0].actionTaken).toContain("last");
  });

  it("decides the same way whichever row order the territories arrive in", () => {
    const rows = [
      terRow({ territoryId: "TER-02", pinCodesCovered: "570005", openSlots: "1" }),
      terRow({ territoryId: "TER-01", pinCodesCovered: "570002", openSlots: "1" }),
    ];
    const apps = [
      appRow({ applicationId: "APP-973", pinCode: "570002" }),
      appRow({ applicationId: "APP-974", pinCode: "570005" }),
    ];

    expect(verdicts(run(apps, rows))).toEqual(verdicts(run(apps, [...rows].reverse())));
  });
});

describe("a pin claimed by two territories is spent once", () => {
  const overlapping = run(
    [
      appRow({ applicationId: "APP-980", pinCode: "570003" }),
      appRow({ applicationId: "APP-981", pinCode: "570003" }),
    ],
    [
      terRow({ territoryId: "TER-01", pinCodesCovered: "570002, 570003", openSlots: "2" }),
      terRow({ territoryId: "TER-02", pinCodesCovered: "570003, 570005", openSlots: "2" }),
    ],
  );

  it("gives the shared pin to the lowest Territory ID and flags both", () => {
    expect(overlapping.issues.some((i) => i.id === "DQ-09")).toBe(true);
    expect(claimedPins(overlapping)).toEqual(["570003"]);
  });

  it("does not count the ceded pin towards the other territory's capacity", () => {
    const ter02 = overlapping.territories.find((t) => t.territoryId === "TER-02")!;

    expect(ter02.cededPins).toContain("570003");
    expect(ter02.usableCapacity).toBe(1);
  });

  it("never offers a ceded pin as redirect advice", () => {
    for (const a of overlapping.applicants) {
      expect(a.suggestedPins).not.toContain("570003");
    }
    expect(overlapping.invariantViolation).toBeNull();
  });
});

describe("allocation totals always reconcile", () => {
  it("fills exactly as many slots as there are assigned pins", () => {
    const result = run(
      [
        appRow({ applicationId: "APP-990", pinCode: "570002" }),
        appRow({ applicationId: "APP-991", pinCode: "570003" }),
        appRow({ applicationId: "APP-992", pinCode: "570004" }),
        appRow({ applicationId: "APP-993", pinCode: "570005" }),
      ],
      [terRow({ pinCodesCovered: "570002, 570003, 570004, 570005", openSlots: "3" })],
    );

    expect(result.slotsFilled).toBe(claimedPins(result).length);
    expect(result.slotsFilled).toBe(3);
    expect(new Set(claimedPins(result)).size).toBe(3);
    expect(result.counts.APPROVED).toBe(3);
  });

  it("gives every applicant exactly one status and one rank within their territory", () => {
    const result = run(
      [
        appRow({ applicationId: "APP-994", pinCode: "570002", investmentLakh: "80" }),
        appRow({ applicationId: "APP-995", pinCode: "570003", investmentLakh: "60" }),
        appRow({ applicationId: "APP-996", pinCode: "570004", investmentLakh: "40" }),
      ],
      [terRow({ pinCodesCovered: "570002, 570003, 570004", openSlots: "2" })],
    );

    const ranks = result.applicants.map((a) => a.rank);
    expect(ranks).toEqual([1, 2, 3]);
    expect(result.applicants.every((a) => a.status.length > 0)).toBe(true);
  });
});

/**
 * D-8. The territory card answers "who holds this pin?", and it used to answer from
 * occupiedPins — which is fixed before allocation and counts existing stores only. A
 * territory whose slots were all taken by applicants therefore reported holding nothing
 * while showing its slots full. The engine was right throughout: pinHolders carried every
 * claim. These pin the two properties the card now reads, in the layer that can be tested.
 */
describe("every claimed pin names its holder", () => {
  it("records an approved applicant in pinHolders, not only in the queue", () => {
    const result = run(
      [
        appRow({ applicationId: "APP-970", pinCode: "570002" }),
        appRow({ applicationId: "APP-971", pinCode: "570003" }),
      ],
      [terRow({ territoryId: "TER-01", pinCodesCovered: "570002, 570003, 570004", openSlots: "2" })],
    );

    const t = result.territories.find((x) => x.territoryId === "TER-01")!;

    // Exactly the shape the old card missed: no existing store here, so occupiedPins is
    // empty while two pins are genuinely spoken for.
    expect(t.occupiedPins).toEqual([]);
    expect(Object.keys(t.pinHolders).sort()).toEqual(["570002", "570003"]);
    expect(t.pinHolders["570002"]).toEqual({ kind: "approved", id: "APP-970" });
    expect(t.pinHolders["570003"]).toEqual({ kind: "approved", id: "APP-971" });
  });

  it("accounts for every usable pin as either free or held, never as neither", () => {
    const result = run(
      [
        appRow({ applicationId: "APP-972", pinCode: "570002" }),
        appRow({ applicationId: "APP-973", pinCode: "570003" }),
      ],
      [terRow({ territoryId: "TER-01", pinCodesCovered: "570002, 570003, 570004", openSlots: "2" })],
    );

    for (const t of result.territories) {
      const usable = t.pins.filter((p) => !t.cededPins.includes(p));
      const held = usable.filter((p) => t.pinHolders[p]);
      expect(new Set([...held, ...t.freePins]).size).toBe(usable.length);
      expect(held.filter((p) => t.freePins.includes(p))).toEqual([]);
    }
  });

  it("names the existing store holding a pin, and refuses the applicant who wanted it", () => {
    const result = run(
      [appRow({ applicationId: "APP-974", city: "Bengaluru", pinCode: "560034" })],
      [terRow({ territoryId: "TER-01", city: "Bengaluru", pinCodesCovered: "560001, 560034", openSlots: "2" })],
    );

    const t = result.territories.find((x) => x.territoryId === "TER-01")!;
    expect(t.pinHolders["560034"]).toEqual({ kind: "store", id: "ST-02" });
    expect(statusOf(result, "APP-974")).not.toBe("APPROVED");
  });
});
