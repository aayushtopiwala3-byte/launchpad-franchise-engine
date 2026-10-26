import { describe, expect, it } from "vitest";
import type { PipelineResult, RawApplicationRow, RawTerritoryRow } from "../../lib/types";
import { appRow, run, terRow } from "../helpers";

/** Seeded so a failure can be reproduced exactly rather than "sometimes". */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A spread wide enough that every status appears: contested pins, exhausted
 * capacity, an unmapped city, a blocked applicant and an occupied pin.
 */
const TERRITORIES: RawTerritoryRow[] = [
  terRow({ territoryId: "TER-01", city: "Mysuru", pinCodesCovered: "570002, 570003, 570004", openSlots: "2", priority: "High" }),
  terRow({ territoryId: "TER-02", city: "Mysuru", pinCodesCovered: "570011, 570012", openSlots: "1", priority: "Medium" }),
  terRow({ territoryId: "TER-03", city: "Bengaluru", pinCodesCovered: "560043, 560044, 560045", openSlots: "2", priority: "High" }),
];

const APPLICATIONS: RawApplicationRow[] = [
  appRow({ applicationId: "APP-001", pinCode: "570002", investmentLakh: "40" }),
  appRow({ applicationId: "APP-002", pinCode: "570002", investmentLakh: "25" }),
  appRow({ applicationId: "APP-003", pinCode: "570003", investmentLakh: "32" }),
  appRow({ applicationId: "APP-004", pinCode: "570004", investmentLakh: "28" }),
  appRow({ applicationId: "APP-005", pinCode: "570011", investmentLakh: "35" }),
  appRow({ applicationId: "APP-006", pinCode: "570012", investmentLakh: "21" }),
  appRow({ applicationId: "APP-007", city: "Bengaluru", pinCode: "560043", investmentLakh: "45", retailExperienceYears: "9" }),
  appRow({ applicationId: "APP-008", city: "Bengaluru", pinCode: "560043", investmentLakh: "44", retailExperienceYears: "2" }),
  appRow({ applicationId: "APP-009", city: "Bengaluru", pinCode: "560044", investmentLakh: "30" }),
  appRow({ applicationId: "APP-010", city: "Bengaluru", pinCode: "560045", investmentLakh: "12" }),
  appRow({ applicationId: "APP-011", pinCode: "570003", spaceAvailable: "Owned", spaceSizeSqft: "" }),
  appRow({ applicationId: "APP-012", city: "Belagavi", pinCode: "590011", investmentLakh: "33" }),
  appRow({ applicationId: "APP-013", city: "Mysuru", pinCode: "560043" }),
  appRow({ applicationId: "APP-014", pinCode: "570004", spaceAvailable: "Owned", notes: "We are still hunting for a shop." }),
];

/** The decision set, keyed by Application ID, so array order cannot colour it. */
const decisions = (r: PipelineResult) =>
  [...r.applicants]
    .map((a) => ({
      id: a.applicationId,
      status: a.status,
      score: a.score.total,
      rank: a.rank,
      assignedPin: a.assignedPin,
      reservedUntil: a.reservedUntil,
      suggestedPins: a.suggestedPins,
      reasonCode: a.reasonCode,
    }))
    .sort((x, y) => (x.id < y.id ? -1 : 1));

describe("the same file always produces the same result", () => {
  it("returns an identical result hash over twenty consecutive runs", () => {
    const first = run(APPLICATIONS, TERRITORIES).resultHash;
    for (let i = 0; i < 20; i++) {
      expect(run(APPLICATIONS, TERRITORIES).resultHash).toBe(first);
    }
  });

  it("produces a non-empty hash that changes when one figure changes", () => {
    const base = run(APPLICATIONS, TERRITORIES).resultHash;
    const nudged = run(
      APPLICATIONS.map((a) => (a.applicationId === "APP-002" ? { ...a, investmentLakh: "48" } : a)),
      TERRITORIES,
    ).resultHash;
    expect(base).toBeTruthy();
    expect(nudged).not.toBe(base);
  });
});

describe("row order does not change any decision", () => {
  const expected = decisions(run(APPLICATIONS, TERRITORIES));

  it("reaches the same decisions across fifty shuffles of both sheets", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = mulberry32(seed);
      const r = run(shuffled(APPLICATIONS, rnd), shuffled(TERRITORIES, rnd));
      expect(decisions(r), `row order seed ${seed} changed a decision`).toEqual(expected);
    }
  });

  /**
   * The exact edge of the guarantee, pinned because the documents used to overstate it.
   * resultHash digests the applicant array in the order it came, so re-ordering the sheet
   * re-orders the digest input and the hash moves. Every decision stays put. The hash is a
   * fingerprint of one run of one file, not a fingerprint of the verdicts, and a judge
   * comparing hashes must therefore keep the row order they started with.
   */
  it("moves the hash when rows are re-ordered, without moving a decision", () => {
    const forward = run(APPLICATIONS, TERRITORIES);
    const reversed = run([...APPLICATIONS].reverse(), TERRITORIES);

    expect(decisions(reversed)).toEqual(decisions(forward));
    expect(reversed.resultHash).not.toBe(forward.resultHash);
  });

  it("holds the one-store-per-pin invariant in every shuffle", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = mulberry32(seed);
      const r = run(shuffled(APPLICATIONS, rnd), shuffled(TERRITORIES, rnd));
      expect(r.invariantViolation, `row order seed ${seed}`).toBeNull();

      const held = r.applicants
        .map((a) => a.assignedPin ?? (a.reservedUntil ? a.normalised.pinCode : null))
        .filter((p): p is string => p !== null);
      expect(new Set(held).size).toBe(held.length);
      for (const pin of held) {
        expect(r.stores.some((s) => s.pinCode === pin)).toBe(false);
      }
    }
  });

  it("covers enough ground for the shuffle to be worth running", () => {
    const seen = new Set(run(APPLICATIONS, TERRITORIES).applicants.map((a) => a.status));
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});
