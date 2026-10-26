import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runSeed } from "../helpers";

/**
 * The locked matrix. This is the same table written out in SEED_EXPECTATIONS.md:
 * Application ID, status, reason code, score, rank, territory, assigned pin,
 * reserved-until, suggested pins. The duplicate APP-023 row appears twice, in
 * sheet order. If a rule changes, this fails first and the change is deliberate.
 */
const MATRIX = `
APP-002 | APPROVED       | A-01 | 100 | 1 | TER-03 | 570001 | -          | -
APP-003 | REDIRECTED     | A-02 |  87 | 3 | TER-03 | -      | -          | 570011, 570016
APP-004 | WAITLISTED     | A-01 |  67 | 5 | TER-03 | -      | -          | -
APP-005 | APPROVED       | A-01 | 100 | 2 | TER-03 | 570008 | -          | -
APP-006 | APPROVED       | A-01 |  80 | 4 | TER-03 | 570002 | -          | -
APP-007 | ON HOLD        | R-03 |  80 | - | TER-07 | -      | 2026-12-10 | -
APP-008 | REDIRECTED     | G-03 |  95 | - | -      | -      | -          | 570011, 570016
APP-009 | REDIRECTED     | G-04 |  81 | - | -      | -      | -          | 570011, 570016
APP-010 | ON HOLD        | R-01 |  70 | - | TER-07 | -      | -          | -
APP-011 | NOT PROCEEDING | G-02 |  48 | - | TER-07 | -      | -          | -
APP-012 | ON HOLD        | R-02 |  70 | - | TER-08 | -      | 2026-12-10 | -
APP-013 | ON HOLD        | R-02 |  75 | - | TER-08 | -      | 2026-12-10 | -
APP-014 | ON HOLD        | G-01 |  95 | - | TER-01 | -      | -          | -
APP-015 | ON HOLD        | R-05 |  97 | - | TER-01 | -      | -          | -
APP-016 | ON HOLD        | R-04 | 100 | - | TER-02 | -      | 2026-12-10 | -
APP-017 | APPROVED       | A-01 |  65 | 2 | TER-07 | 575003 | -          | -
APP-018 | ON HOLD        | R-02 |  62 | - | TER-06 | -      | 2026-12-10 | -
APP-019 | ON HOLD        | R-01 |  57 | - | TER-05 | -      | 2026-12-10 | -
APP-020 | ON HOLD        | R-01 |  70 | - | TER-01 | -      | 2026-12-10 | -
APP-021 | APPROVED       | A-01 |  88 | 1 | TER-01 | 560103 | -          | -
APP-022 | APPROVED       | A-01 | 100 | 1 | TER-02 | 560102 | -          | -
APP-023 | APPROVED       | A-01 |  95 | 1 | TER-07 | 575004 | -          | -
APP-023 | ON HOLD        | R-05 |  95 | - | TER-07 | -      | -          | -
APP-024 | APPROVED       | A-01 |  58 | 1 | TER-04 | 570023 | -          | -
APP-025 | ON HOLD        | R-04 |  68 | - | TER-08 | -      | -          | -
APP-026 | NOT PROCEEDING | G-04 |  95 | - | -      | -      | -          | -
APP-027 | ON HOLD        | R-03 |  59 | - | TER-06 | -      | -          | -
APP-028 | ON HOLD        | R-05 |  79 | - | TER-05 | -      | 2026-12-10 | -
`;

/** Territory ID, city, open slots, usable capacity, occupied, free, ceded, approvals. */
const TERRITORY_MATRIX = `
TER-01 | Bengaluru        | 3 | 2 | 560001, 560034, 560038 | -              | -      | 1
TER-02 | Bengaluru        | 2 | 2 | 560066, 560076         | -              | 560103 | 1
TER-03 | Mysuru           | 3 | 3 | -                      | 570011, 570016 | -      | 3
TER-04 | Mysuru           | 2 | 1 | 570017                 | -              | -      | 1
TER-05 | Davanagere       | 2 | 2 | -                      | 577004         | -      | 0
TER-06 | Tumakuru         | 1 | 1 | -                      | 572102         | -      | 0
TER-07 | Mangaluru        | 3 | 3 | 575001                 | -              | -      | 2
TER-08 | Hubballi-Dharwad | 2 | 2 | 580020                 | -              | -      | 0
`;

const parse = (table: string) =>
  table
    .trim()
    .split("\n")
    .map((line) => line.split("|").map((cell) => cell.trim()));

describe("the seed set matches its locked expectations", () => {
  const r = runSeed();

  it("gives every row the status, score, rank and pin the snapshot records", () => {
    const actual = r.applicants.map((a) => [
      a.applicationId,
      a.status,
      a.reasonCode ?? "-",
      String(a.score.total),
      a.rank === null ? "-" : String(a.rank),
      a.territoryId ?? "-",
      a.assignedPin ?? "-",
      a.reservedUntil ?? "-",
      a.suggestedPins.join(", ") || "-",
    ]);
    expect(actual).toEqual(parse(MATRIX));
  });

  it("shapes every territory the way the snapshot records", () => {
    const actual = r.territories.map((t) => [
      t.territoryId,
      t.city ?? "-",
      String(t.openSlots),
      String(t.usableCapacity),
      t.occupiedPins.join(", ") || "-",
      t.freePins.join(", ") || "-",
      t.cededPins.join(", ") || "-",
      String(t.queue.filter((q) => q.status === "APPROVED").length),
    ]);
    expect(actual).toEqual(parse(TERRITORY_MATRIX));
  });

  it("holds the one-store-per-pin invariant and fills eight slots", () => {
    expect(r.invariantViolation).toBeNull();
    expect(r.slotsFilled).toBe(8);
    expect(r.counts).toEqual({
      APPROVED: 8,
      WAITLISTED: 1,
      "ON HOLD": 14,
      REDIRECTED: 3,
      "NOT PROCEEDING": 2,
    });
  });

  it("is reproducible to the hash", () => {
    expect(r.resultHash).toBe(runSeed().resultHash);
  });

  it("still says in SEED_EXPECTATIONS.md what it says here", () => {
    // The doc is what a judge reads; this stops it rotting away from the engine.
    const doc = readFileSync(join(process.cwd(), "SEED_EXPECTATIONS.md"), "utf8");
    const documented = doc
      .split("\n")
      .filter((line) => /^\| APP-\d+ \|/.test(line))
      .map((line) =>
        line
          .slice(1, -1)
          .split("|")
          .map((cell) => cell.trim().replace(/—/g, "-")),
      );
    expect(documented).toEqual(parse(MATRIX));
    expect(doc).toContain(`\`${r.resultHash}\``);
  });
});

describe("the twenty-two cases section 11.3 asks the seed to demonstrate", () => {
  const r = runSeed();
  const app = (id: string, nth = 0) => r.applicants.filter((a) => a.applicationId === id)[nth];
  const ter = (id: string) => r.territories.find((t) => t.territoryId === id)!;

  it("1 — a clean strong applicant is approved", () => {
    expect(app("APP-002").status).toBe("APPROVED");
    expect(app("APP-002").score.total).toBe(100);
  });

  it("2 — the loser of a same-pin conflict is redirected to named pins", () => {
    expect(app("APP-003").status).toBe("REDIRECTED");
    expect(app("APP-003").suggestedPins.length).toBeGreaterThan(0);
  });

  it("3 — more ready applicants than slots produces a waitlist with a rank", () => {
    expect(app("APP-004").status).toBe("WAITLISTED");
    expect(app("APP-004").rank).toBe(5);
  });

  it("4 — a pin holding an existing store redirects rather than rejects", () => {
    expect(app("APP-008").status).toBe("REDIRECTED");
    expect(app("APP-008").reasonCode).toBe("G-03");
    expect(app("APP-008").reasonSentence).toContain("ST-06");
  });

  it("5 — a pin in no territory, in a city that has capacity, redirects", () => {
    expect(app("APP-009").status).toBe("REDIRECTED");
    expect(app("APP-009").reasonCode).toBe("G-04");
  });

  it("6 — an upper floor holds the application", () => {
    expect(app("APP-007").reasonCode).toBe("R-03");
    expect(app("APP-007").normalised.floor).toBe("Upper");
  });

  it("7 — space not identified still earns a 45-day reservation", () => {
    expect(app("APP-012").status).toBe("ON HOLD");
    expect(app("APP-012").reservedUntil).toBe("2026-12-10");
  });

  it("8 — investment at 85% of the minimum holds rather than rejects", () => {
    expect(app("APP-010").status).toBe("ON HOLD");
    expect(app("APP-010").reasonSentence).toContain("3 lakh short");
  });

  it("9 — investment at 50% of the minimum does not proceed", () => {
    expect(app("APP-011").status).toBe("NOT PROCEEDING");
    expect(app("APP-011").reasonCode).toBe("G-02");
  });

  it("10 — a city and pin that contradict each other are held", () => {
    expect(app("APP-014").status).toBe("ON HOLD");
    expect(app("APP-014").issues.some((i) => i.id === "DQ-03")).toBe(true);
  });

  it("11 — notes that contradict the fields are held", () => {
    expect(app("APP-015").status).toBe("ON HOLD");
    expect(app("APP-015").issues.some((i) => i.id === "DQ-13")).toBe(true);
  });

  it("12 — owned space with a blank size is held without inventing a number", () => {
    expect(app("APP-016").issues.some((i) => i.id === "DQ-06")).toBe(true);
    expect(app("APP-016").reasonSentence).toContain("not stated");
  });

  it("13 — zero experience but strong elsewhere is approved with an extra training week", () => {
    expect(app("APP-017").status).toBe("APPROVED");
    expect(app("APP-017").onboardingPlan?.trainingWeeks).toBe(3);
  });

  it("14 — a one-month target with no space is flagged as aggressive", () => {
    expect(app("APP-018").onboardingPlan?.targetIsAggressive).toBe(true);
  });

  it("15 — messy values are normalised and logged", () => {
    expect(app("APP-020").normalised.investmentLakh).toBe(25);
    expect(app("APP-020").normalised.pinCode).toBe("560043");
    expect(app("APP-020").normalised.floor).toBe("Ground");
    expect(app("APP-021").normalised.investmentLakh).toBe(30);
    const logged = r.normalisationLog.filter((e) => e.subjectId === "APP-020").map((e) => e.ruleId);
    expect(new Set(logged)).toEqual(new Set(["N-01", "N-02", "N-03"]));
  });

  it("16 — a duplicate Application ID holds the second row and keeps it out of allocation", () => {
    expect(app("APP-023", 0).status).toBe("APPROVED");
    expect(app("APP-023", 1).isDuplicateHold).toBe(true);
    expect(app("APP-023", 1).assignedPin).toBeNull();
    expect(r.issues.some((i) => i.id === "DQ-08")).toBe(true);
  });

  it("17 — territory pins holding existing stores are counted as occupied", () => {
    expect(ter("TER-01").occupiedPins).toEqual(["560001", "560034", "560038"]);
    expect(ter("TER-04").occupiedPins).toEqual(["570017"]);
    expect(ter("TER-07").occupiedPins).toEqual(["575001"]);
    expect(ter("TER-08").occupiedPins).toEqual(["580020"]);
  });

  it("18 — open slots exceeding free pins caps the capacity and says so", () => {
    expect(ter("TER-01").usableCapacity).toBe(2);
    expect(ter("TER-01").capacityCappedReason).toBeTruthy();
    expect(ter("TER-04").usableCapacity).toBe(1);
    expect(r.issues.some((i) => i.id === "DQ-11")).toBe(true);
  });

  it("19 — a high-priority territory with no ready applicant becomes a recruitment gap", () => {
    expect(ter("TER-05").priority).toBe("High");
    expect(ter("TER-05").queue.filter((q) => q.status === "APPROVED")).toHaveLength(0);
    expect(r.recruitmentGaps.map((g) => g.territoryId)).toContain("TER-05");
  });

  it("20 — Tumakuru trains at ST-01 and Davanagere at ST-09", () => {
    expect(app("APP-018").onboardingPlan?.trainingStoreId).toBe("ST-01");
    expect(app("APP-019").onboardingPlan?.trainingStoreId).toBe("ST-09");
  });

  it("21 — all three languages are present in the set", () => {
    const languages = new Set(r.applicants.map((a) => a.normalised.preferredLanguage));
    expect(languages).toEqual(new Set(["Kannada", "English", "Hindi"]));
  });

  it("22 — a cross-territory pin is ceded to the lowest territory ID", () => {
    expect(ter("TER-02").cededPins).toEqual(["560103"]);
    expect(ter("TER-01").pins).toContain("560103");
    expect(r.issues.some((i) => i.id === "DQ-09")).toBe(true);
  });
});
