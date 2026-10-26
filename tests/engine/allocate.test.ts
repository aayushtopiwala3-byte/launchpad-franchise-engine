import { describe, expect, it } from "vitest";
import { assertOneStorePerPin } from "../../lib/engine/allocate";
import type { ExistingStore } from "../../lib/types";
import { applicant, appRow, run, statusOf, terRow } from "../helpers";

/** No stores anywhere, so each test controls its own occupancy. */
const NO_STORES: ExistingStore[] = [];

const mysuru = (over = {}) =>
  terRow({ territoryId: "TER-01", city: "Mysuru", pinCodesCovered: "570002, 570003, 570004", openSlots: "2", priority: "High", ...over });

describe("Pass A — claiming a free pin", () => {
  it("approves a ready applicant at their own free pin and spends one slot", () => {
    const r = run([appRow({ applicationId: "APP-001", pinCode: "570002" })], [mysuru()], { stores: NO_STORES });
    const a = applicant(r, "APP-001");
    expect(a.status).toBe("APPROVED");
    expect(a.assignedPin).toBe("570002");
    expect(r.territories[0].freePins).toEqual(["570003", "570004"]);
  });

  it("ranks by score and gives the slot to the stronger applicant", () => {
    const r = run(
      [
        appRow({ applicationId: "APP-001", pinCode: "570002", investmentLakh: "20", retailExperienceYears: "1" }),
        appRow({ applicationId: "APP-002", pinCode: "570003", investmentLakh: "40", retailExperienceYears: "9" }),
      ],
      [mysuru({ openSlots: "1" })],
      { stores: NO_STORES },
    );
    expect(statusOf(r, "APP-002")).toBe("APPROVED");
    expect(statusOf(r, "APP-001")).toBe("WAITLISTED");
    expect(applicant(r, "APP-001").rank).toBe(2);
  });

  it("waitlists once capacity runs out and names who is ahead", () => {
    const r = run(
      [
        appRow({ applicationId: "APP-001", pinCode: "570002", investmentLakh: "40" }),
        appRow({ applicationId: "APP-002", pinCode: "570003", investmentLakh: "20" }),
      ],
      [mysuru({ openSlots: "1" })],
      { stores: NO_STORES },
    );
    const waited = applicant(r, "APP-002");
    expect(waited.status).toBe("WAITLISTED");
    expect(waited.reasonSentence).toContain("ranked 2nd");
    expect(waited.competitors.some((c) => c.applicationId === "APP-001" && c.whyRankedHigher)).toBe(true);
  });
});

describe("Pass B — relocating when the pin is taken", () => {
  it("redirects the loser of a same-pin contest to a free pin in the same territory", () => {
    const r = run(
      [
        appRow({ applicationId: "APP-001", pinCode: "570002", investmentLakh: "40" }),
        appRow({ applicationId: "APP-002", pinCode: "570002", investmentLakh: "25" }),
      ],
      [mysuru()],
      { stores: NO_STORES },
    );
    expect(statusOf(r, "APP-001")).toBe("APPROVED");
    const redirected = applicant(r, "APP-002");
    expect(redirected.status).toBe("REDIRECTED");
    expect(redirected.suggestedPins).toEqual(["570003", "570004"]);
    expect(redirected.reasonSentence).toContain("not a rejection");
  });

  it("flags the other applicant at the same pin as a competitor", () => {
    const r = run(
      [
        appRow({ applicationId: "APP-001", pinCode: "570002", investmentLakh: "40" }),
        appRow({ applicationId: "APP-002", pinCode: "570002", investmentLakh: "25" }),
      ],
      [mysuru()],
      { stores: NO_STORES },
    );
    const c = applicant(r, "APP-002").competitors.find((x) => x.applicationId === "APP-001");
    expect(c?.samePin).toBe(true);
    expect(c?.whyRankedHigher).toContain("Scored");
  });

  it("points an unmapped pin at another territory in the same city", () => {
    const r = run(
      [appRow({ applicationId: "APP-001", city: "Mysuru", pinCode: "570044" })],
      [terRow({ territoryId: "TER-02", city: "Mysuru", pinCodesCovered: "570011, 570012", openSlots: "1", priority: "Medium" })],
      { stores: NO_STORES },
    );
    const a = applicant(r, "APP-001");
    expect(a.status).toBe("REDIRECTED");
    expect(a.reasonCode).toBe("G-04");
    expect(a.suggestedPins).toEqual(["570011", "570012"]);
  });

  it("waitlists rather than relocating once capacity is gone, even at a taken pin", () => {
    // Pass A tests capacity before it tests the pin, so the slot is the binding constraint.
    const r = run(
      [
        appRow({ applicationId: "APP-001", pinCode: "570002", investmentLakh: "40" }),
        appRow({ applicationId: "APP-002", pinCode: "570002", investmentLakh: "25" }),
      ],
      [mysuru({ openSlots: "1" })],
      { stores: NO_STORES },
    );
    expect(statusOf(r, "APP-002")).toBe("WAITLISTED");
    expect(r.territories[0].freePins).toEqual(["570003", "570004"]);
  });

  it("waitlists rather than redirecting when there is nothing to point at", () => {
    const r = run(
      [
        appRow({ applicationId: "APP-001", pinCode: "570002", investmentLakh: "40" }),
        appRow({ applicationId: "APP-002", pinCode: "570002", investmentLakh: "25" }),
      ],
      [mysuru({ pinCodesCovered: "570002", openSlots: "1" })],
      { stores: NO_STORES },
    );
    expect(statusOf(r, "APP-002")).toBe("WAITLISTED");
  });

  it("redirects away from a pin that already holds one of our stores", () => {
    const r = run(
      [appRow({ applicationId: "APP-001", pinCode: "570009" })],
      [terRow({ territoryId: "TER-01", city: "Mysuru", pinCodesCovered: "570009, 570011", openSlots: "2" })],
    );
    const a = applicant(r, "APP-001");
    expect(a.status).toBe("REDIRECTED");
    expect(a.suggestedPins).toContain("570011");
    expect(a.reasonCode).toBe("G-03");
  });
});

describe("Pass C — provisional reservations", () => {
  it("reserves the applicant's own pin for 45 days while a block is cleared", () => {
    const r = run(
      [appRow({ applicationId: "APP-001", pinCode: "570002", spaceSizeSqft: "", spaceAvailable: "Owned" })],
      [mysuru()],
      { stores: NO_STORES },
    );
    const a = applicant(r, "APP-001");
    expect(a.status).toBe("ON HOLD");
    expect(a.reservedUntil).toBe("2026-12-10");
    expect(a.assignedPin).toBeNull();
  });

  it("never reserves a pin for someone whose location is unconfirmed", () => {
    const r = run(
      [appRow({ applicationId: "APP-001", city: "Mysuru", pinCode: "560043" })],
      [
        mysuru(),
        terRow({ territoryId: "TER-02", city: "Bengaluru", pinCodesCovered: "560043, 560044", openSlots: "2", priority: "Medium" }),
      ],
      { stores: NO_STORES },
    );
    const a = applicant(r, "APP-001");
    expect(a.status).toBe("ON HOLD");
    expect(a.reservedUntil).toBeNull();
  });

  it("gives the reservation to the higher-ranked applicant when capacity is short", () => {
    const r = run(
      [
        appRow({ applicationId: "APP-001", pinCode: "570002", spaceAvailable: "Owned", spaceSizeSqft: "", investmentLakh: "40" }),
        appRow({ applicationId: "APP-002", pinCode: "570003", spaceAvailable: "Owned", spaceSizeSqft: "", investmentLakh: "22" }),
      ],
      [mysuru({ openSlots: "1" })],
      { stores: NO_STORES },
    );
    expect(applicant(r, "APP-001").reservedUntil).not.toBeNull();
    expect(applicant(r, "APP-002").reservedUntil).toBeNull();
  });

  it("does not reserve a pin for a held duplicate row", () => {
    const r = run(
      [
        appRow({ applicationId: "APP-001", pinCode: "570002" }),
        appRow({ applicationId: "APP-001", applicantName: "Someone Else", pinCode: "570003" }),
      ],
      [mysuru()],
      { stores: NO_STORES },
    );
    const dup = r.applicants[1];
    expect(dup.isDuplicateHold).toBe(true);
    expect(dup.status).toBe("ON HOLD");
    expect(dup.reservedUntil).toBeNull();
  });
});

describe("gate outcomes end to end", () => {
  it("does not proceed below the hard investment floor", () => {
    const r = run([appRow({ applicationId: "APP-001", investmentLakh: "10" })], [mysuru()], { stores: NO_STORES });
    const a = applicant(r, "APP-001");
    expect(a.status).toBe("NOT PROCEEDING");
    expect(a.reasonCode).toBe("G-02");
    expect(a.reasonSentence).toContain("stays on file");
  });

  it("does not proceed when the city has no territory and the pin is unmapped", () => {
    const r = run(
      [appRow({ applicationId: "APP-001", city: "Belagavi", pinCode: "590001" })],
      [mysuru()],
    );
    expect(statusOf(r, "APP-001")).toBe("NOT PROCEEDING");
  });

  it("holds an applicant whose notes contradict a decision field", () => {
    const r = run(
      [appRow({ applicationId: "APP-001", spaceAvailable: "Owned", notes: "We are still looking for a shop near the market." })],
      [mysuru()],
      { stores: NO_STORES },
    );
    const a = applicant(r, "APP-001");
    expect(a.status).toBe("ON HOLD");
    expect(a.issues.some((i) => i.id === "DQ-13" && i.severity === "blocking")).toBe(true);
  });
});

describe("capacity is bounded by real pin codes", () => {
  it("caps usable capacity at the number of free pins", () => {
    const r = run([], [terRow({ territoryId: "TER-01", city: "Mysuru", pinCodesCovered: "570009, 570017", openSlots: "3" })]);
    const t = r.territories[0];
    expect(t.usableCapacity).toBe(0);
    expect(t.capacityCappedReason).toContain("capped at 0");
  });

  it("counts an existing store's pin as occupied, not free", () => {
    const r = run([], [terRow({ territoryId: "TER-01", city: "Mysuru", pinCodesCovered: "570009, 570011", openSlots: "2" })]);
    const t = r.territories[0];
    expect(t.occupiedPins).toEqual(["570009"]);
    expect(t.usableCapacity).toBe(1);
  });
});

describe("the one-store-per-pin invariant", () => {
  it("never allocates the same pin twice across a crowded run", () => {
    const apps = Array.from({ length: 12 }, (_, i) =>
      appRow({
        applicationId: `APP-${String(i + 1).padStart(3, "0")}`,
        pinCode: ["570002", "570003", "570004"][i % 3],
        investmentLakh: String(20 + i),
      }),
    );
    const r = run(apps, [mysuru({ pinCodesCovered: "570002, 570003, 570004", openSlots: "3" })], { stores: [] });
    expect(r.invariantViolation).toBeNull();

    const held = r.applicants
      .map((a) => a.assignedPin ?? (a.reservedUntil ? a.normalised.pinCode : null))
      .filter(Boolean);
    expect(new Set(held).size).toBe(held.length);
  });

  it("throws when two applicants would hold one pin", () => {
    const r = run([appRow({ applicationId: "APP-001", pinCode: "570002" })], [mysuru()], { stores: NO_STORES });
    const clone = { ...r.applicants[0], applicationId: "APP-002" };
    expect(() => assertOneStorePerPin([r.applicants[0], clone], [])).toThrow(/invariant violated/);
  });

  it("throws when an applicant would sit on an existing store's pin", () => {
    const r = run([appRow({ applicationId: "APP-001", pinCode: "570002" })], [mysuru()], { stores: NO_STORES });
    expect(() =>
      assertOneStorePerPin(r.applicants, [
        { storeId: "ST-X", city: "Mysuru", pinCode: "570002", opened: "2020", source: "embedded" },
      ]),
    ).toThrow(/570002/);
  });
});
