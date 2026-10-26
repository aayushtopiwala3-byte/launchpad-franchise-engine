import { describe, expect, it } from "vitest";
import { assertOneStorePerPin } from "../../lib/engine/allocate";
import { EMBEDDED_STORES } from "../../lib/reference";
import type { PipelineResult, Tier } from "../../lib/types";
import { appRow, applicant, run, statusOf, terRow } from "../helpers";

/**
 * The one rule the case study states outright: "The brand never opens two stores in the same
 * pin code." Everything here attacks that rule and the capacity arithmetic around it.
 */

/** The city each store sits in, with a tier and two spare pins to redirect into. */
const STORE_CITIES: Record<string, { city: string; tier: Tier; spare: [string, string] }> = {
  Bengaluru: { city: "Bengaluru", tier: "Tier 1", spare: ["560101", "560102"] },
  Mysuru: { city: "Mysuru", tier: "Tier 2", spare: ["570101", "570102"] },
  Mangaluru: { city: "Mangaluru", tier: "Tier 2", spare: ["575101", "575102"] },
  "Hubballi-Dharwad": { city: "Hubballi-Dharwad", tier: "Tier 2", spare: ["580101", "580102"] },
  Belagavi: { city: "Belagavi", tier: "Tier 2", spare: ["590101", "590102"] },
};

/** Every pin an approved applicant or a live reservation is sitting on. */
function claimedPins(result: PipelineResult): string[] {
  return result.applicants
    .map((a) => a.assignedPin ?? (a.reservedUntil ? a.normalised.pinCode : null))
    .filter((p): p is string => p !== null);
}

describe("existing stores are never built over", () => {
  for (const store of EMBEDDED_STORES) {
    it(`refuses to place a new store on ${store.pinCode}, already held by ${store.storeId}`, () => {
      const place = STORE_CITIES[store.city];
      const result = run(
        [
          appRow({
            applicationId: "APP-900",
            city: place.city,
            pinCode: store.pinCode,
            investmentLakh: "60",
            spaceSizeSqft: "900",
          }),
        ],
        [
          terRow({
            territoryId: "TER-01",
            city: place.city,
            pinCodesCovered: `${store.pinCode}, ${place.spare[0]}, ${place.spare[1]}`,
            cityTier: place.tier,
            openSlots: "3",
          }),
        ],
      );

      const a = applicant(result, "APP-900");
      expect(a.status).not.toBe("APPROVED");
      expect(a.assignedPin).not.toBe(store.pinCode);
      expect(claimedPins(result)).not.toContain(store.pinCode);
      expect(result.invariantViolation).toBeNull();
    });
  }

  it("holds even when the applicant is otherwise the strongest possible candidate", () => {
    const result = run(
      [
        appRow({
          applicationId: "APP-900",
          city: "Bengaluru",
          pinCode: "560001",
          investmentLakh: "500",
          retailExperienceYears: "30",
          spaceSizeSqft: "1000",
          floor: "Ground",
          spaceAvailable: "Owned",
          targetLaunchMonths: "2",
        }),
      ],
      [
        terRow({
          city: "Bengaluru",
          pinCodesCovered: "560001, 560101",
          cityTier: "Tier 1",
          openSlots: "2",
        }),
      ],
    );

    expect(statusOf(result, "APP-900")).not.toBe("APPROVED");
    expect(result.invariantViolation).toBeNull();
  });
});

describe("two applicants cannot hold one pin", () => {
  const contenders = [
    appRow({ applicationId: "APP-901", pinCode: "570002", investmentLakh: "40" }),
    appRow({ applicationId: "APP-902", pinCode: "570002", investmentLakh: "35" }),
  ];
  const territory = [terRow({ pinCodesCovered: "570002, 570003", openSlots: "2" })];

  it("gives the pin to exactly one of them even with capacity to spare", () => {
    const result = run(contenders, territory);
    const pins = claimedPins(result);

    expect(pins.filter((p) => p === "570002")).toHaveLength(1);
    expect(new Set(pins).size).toBe(pins.length);
    expect(result.invariantViolation).toBeNull();
  });

  it("picks the same winner when the rows arrive in the opposite order", () => {
    const forward = run(contenders, territory);
    const reversed = run([...contenders].reverse(), territory);

    const winner = (r: PipelineResult) =>
      r.applicants.find((a) => a.assignedPin === "570002")?.applicationId;
    const verdicts = (r: PipelineResult) =>
      [...r.applicants]
        .map((a) => [a.applicationId, a.status, a.rank, a.assignedPin] as const)
        .sort((x, y) => (x[0] < y[0] ? -1 : 1));

    expect(winner(forward)).toBe("APP-901");
    expect(winner(reversed)).toBe("APP-901");
    expect(verdicts(reversed)).toEqual(verdicts(forward));
  });

  /**
   * Known and deliberate: the hash is taken over the applicant array in sheet order, so it
   * identifies a *run*, not a decision set. Every verdict above is order-invariant; the hash
   * is not. Pinned here so the difference is a documented property rather than a surprise.
   */
  it("moves the result hash on reorder even though no verdict moves", () => {
    const forward = run(contenders, territory);
    const reversed = run([...contenders].reverse(), territory);

    expect(reversed.resultHash).not.toBe(forward.resultHash);
  });
});

describe("capacity arithmetic", () => {
  it("never approves more applicants than a territory has usable capacity", () => {
    const result = run(
      [
        appRow({ applicationId: "APP-901", pinCode: "570002" }),
        appRow({ applicationId: "APP-902", pinCode: "570003" }),
        appRow({ applicationId: "APP-903", pinCode: "570004" }),
      ],
      [terRow({ pinCodesCovered: "570002, 570003, 570004", openSlots: "2" })],
    );

    const approved = result.applicants.filter((a) => a.status === "APPROVED");
    expect(approved).toHaveLength(2);
    expect(approved.length).toBeLessThanOrEqual(result.territories[0].usableCapacity);
  });

  it("caps capacity at the number of pins actually free, not the slots asked for", () => {
    const result = run(
      [appRow({ applicationId: "APP-901", pinCode: "570002" })],
      [terRow({ pinCodesCovered: "570002, 570009", openSlots: "5" })],
    );

    const t = result.territories[0];
    expect(t.pinHolders["570009"]).toEqual({ kind: "store", id: "ST-06" });
    expect(t.usableCapacity).toBe(1);
    expect(t.capacityCappedReason).not.toBeNull();
  });

  it("does not subtract an existing store from capacity twice", () => {
    const result = run(
      [appRow({ applicationId: "APP-901", pinCode: "570002" })],
      [terRow({ pinCodesCovered: "570002, 570003, 570009", openSlots: "2" })],
    );

    const t = result.territories[0];
    const consumed = Object.values(t.pinHolders).filter((h) => h.kind !== "store").length;

    expect(t.usableCapacity).toBe(2);
    expect(consumed).toBe(1);
    expect(t.usableCapacity - consumed).toBe(1);
    expect(t.unfilledSlotBlocker).toContain("1 slot");
  });

  it("approves nobody in a territory with zero open slots", () => {
    const result = run(
      [appRow({ applicationId: "APP-901", pinCode: "570002" })],
      [terRow({ pinCodesCovered: "570002, 570003", openSlots: "0" })],
    );

    expect(statusOf(result, "APP-901")).not.toBe("APPROVED");
    expect(result.territories[0].usableCapacity).toBe(0);
  });
});

describe("a high score never buys its way past a hard gate", () => {
  const strongest = {
    investmentLakh: "500",
    retailExperienceYears: "30",
    spaceSizeSqft: "1200",
    targetLaunchMonths: "1",
    currentBusiness: "Runs a chain of twelve footwear stores",
  };

  it("fails an under-floor investment however good everything else is", () => {
    const result = run(
      [appRow({ applicationId: "APP-901", ...strongest, investmentLakh: "5" })],
      [terRow()],
    );

    const a = applicant(result, "APP-901");
    expect(a.status).not.toBe("APPROVED");
    expect(a.gateResults.some((g) => !g.passed)).toBe(true);
  });

  it("fails an unacceptable floor however good everything else is", () => {
    const result = run(
      [appRow({ applicationId: "APP-901", ...strongest, floor: "Upper" })],
      [terRow()],
    );

    expect(statusOf(result, "APP-901")).not.toBe("APPROVED");
  });

  it("never approves anyone carrying a failed gate, across a mixed field", () => {
    const result = run(
      [
        appRow({ applicationId: "APP-901", investmentLakh: "5" }),
        appRow({ applicationId: "APP-902", floor: "Upper" }),
        appRow({ applicationId: "APP-903", pinCode: "999999" }),
        appRow({ applicationId: "APP-904", pinCode: "570003" }),
      ],
      [terRow({ pinCodesCovered: "570002, 570003, 570004", openSlots: "4" })],
    );

    for (const a of result.applicants) {
      if (a.status === "APPROVED") {
        expect(a.gateResults.every((g) => g.passed)).toBe(true);
      }
    }
    expect(statusOf(result, "APP-904")).toBe("APPROVED");
  });
});

describe("the invariant assertion itself", () => {
  it("throws when two stores are handed the same pin", () => {
    expect(() =>
      assertOneStorePerPin(
        [],
        [
          { storeId: "ST-A", city: "Mysuru", pinCode: "570002", opened: "2020", source: "embedded" },
          { storeId: "ST-B", city: "Mysuru", pinCode: "570002", opened: "2021", source: "embedded" },
        ],
      ),
    ).toThrow(/one-store-per-pin/i);
  });

  it("holds across every territory of the full sample run", () => {
    const result = run(
      [
        appRow({ applicationId: "APP-901", pinCode: "570002" }),
        appRow({ applicationId: "APP-902", pinCode: "570003" }),
        appRow({ applicationId: "APP-903", pinCode: "570004" }),
      ],
      [terRow({ pinCodesCovered: "570002, 570003, 570004", openSlots: "3" })],
    );

    for (const t of result.territories) {
      const ids = Object.values(t.pinHolders).map((h) => h.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(result.invariantViolation).toBeNull();
  });
});
