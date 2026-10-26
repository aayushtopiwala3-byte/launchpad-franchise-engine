import { describe, expect, it } from "vitest";
import {
  investmentUnitsAreAmbiguous,
  NormalisationLog,
  normaliseApplicationRow,
  normaliseCity,
  normaliseFloor,
  normaliseInvestment,
  normaliseLanguage,
  normaliseNumber,
  normalisePin,
  normalisePinList,
  normalisePriority,
  normaliseSpace,
  normaliseTerritoryRow,
  normaliseTier,
} from "../../lib/engine/normalise";
import type { RawApplicationRow, RawTerritoryRow } from "../../lib/types";

describe("N-01 investment", () => {
  it.each([
    ["25", 25],
    ["25 lakh", 25],
    ["25L", 25],
    ["25 lacs", 25],
    ["25,00,000", 25],
    ["2500000", 25],
    ["Rs 25", 25],
    ["₹ 25 lakh", 25],
    ["INR 30,00,000", 30],
    ["12.5", 12.5],
    ["1000", 1000],
  ])("reads %s as %s lakh", (input, expected) => {
    expect(normaliseInvestment(input)).toBe(expected);
  });

  /**
   * Changed contract. This used to read "1001" as 0.01 lakh, and G-02 then rejected the
   * applicant outright on that figure. A thousand and one of anything is neither a credible
   * number of lakh nor enough rupees to open a store with, so the cell has not told us what
   * they can invest. Null says exactly that, and quality.ts raises DQ-07 to hold the row.
   */
  it.each(["1001", "5000", "90000"])("returns null for %s, whose units cannot be settled", (v) => {
    expect(normaliseInvestment(v)).toBeNull();
    expect(investmentUnitsAreAmbiguous(v)).toBe(true);
  });

  it("does not call a figure ambiguous when one reading is plausible", () => {
    for (const v of ["25", "1000", "2500000", "", "to be confirmed"]) {
      expect(investmentUnitsAreAmbiguous(v)).toBe(false);
    }
  });

  it("returns null for a blank, never zero", () => {
    expect(normaliseInvestment("")).toBeNull();
    expect(normaliseInvestment("   ")).toBeNull();
    expect(normaliseInvestment(null)).toBeNull();
  });

  it("returns null when there is no number at all", () => {
    expect(normaliseInvestment("to be confirmed")).toBeNull();
  });
});

describe("N-02 pin code", () => {
  it("strips whitespace and keeps six digits as a string", () => {
    expect(normalisePin("560 043").pin).toBe("560043");
    expect(normalisePin(" 570001 ").pin).toBe("570001");
  });

  it("rejects anything that is not exactly six digits", () => {
    expect(normalisePin("5600").pin).toBeNull();
    expect(normalisePin("5600431").pin).toBeNull();
    expect(normalisePin("").pin).toBeNull();
  });

  it("keeps the stripped digits so the operator can see what was typed", () => {
    expect(normalisePin("5600").digits).toBe("5600");
  });
});

describe("N-03 floor", () => {
  it.each([
    ["ground floor", "Ground"],
    ["GROUND", "Ground"],
    ["Upper", "Upper"],
    ["first floor", "Upper"],
    ["1st", "Upper"],
    ["second floor", "Upper"],
    ["Mall unit", "Mall unit"],
    ["in a mall", "Mall unit"],
    ["not known", "Not known"],
    ["n/a", "Not known"],
  ])("reads %s as %s", (input, expected) => {
    expect(normaliseFloor(input)).toBe(expected);
  });
});

describe("N-04 space available", () => {
  it.each([
    ["Owned", "Owned"],
    ["own", "Owned"],
    ["Rented", "Rented"],
    ["on rent", "Rented"],
    ["Not yet identified", "Not yet identified"],
    ["still searching", "Not yet identified"],
    ["looking for a shop", "Not yet identified"],
  ])("reads %s as %s", (input, expected) => {
    expect(normaliseSpace(input)).toBe(expected);
  });

  it("prefers 'not yet identified' over a stray 'own' in the same sentence", () => {
    expect(normaliseSpace("not yet identified, may buy own place")).toBe("Not yet identified");
  });

  it("returns null for a blank", () => {
    expect(normaliseSpace("")).toBeNull();
  });
});

describe("N-05 city aliases", () => {
  it.each([
    ["Bangalore", "Bengaluru"],
    ["bangalore", "Bengaluru"],
    ["Mysore", "Mysuru"],
    ["Mangalore", "Mangaluru"],
    ["Hubli", "Hubballi-Dharwad"],
    ["Hubballi", "Hubballi-Dharwad"],
    ["Belgaum", "Belagavi"],
    ["Tumkur", "Tumakuru"],
  ])("maps %s to %s", (input, expected) => {
    expect(normaliseCity(input)).toBe(expected);
  });

  it("title-cases an unknown city rather than dropping it", () => {
    expect(normaliseCity("  hampi  ")).toBe("Hampi");
  });
});

describe("N-06 language", () => {
  it("flags a blank as defaulted", () => {
    expect(normaliseLanguage("")).toEqual({ language: "English", defaulted: true });
  });

  it.each([
    ["Kannada", "Kannada"],
    ["kan", "Kannada"],
    ["hindi", "Hindi"],
    ["eng", "English"],
  ])("reads %s as %s and does not flag it", (input, expected) => {
    expect(normaliseLanguage(input)).toEqual({ language: expected, defaulted: false });
  });
});

describe("N-07 numbers", () => {
  it("turns an empty string into null, not zero", () => {
    expect(normaliseNumber("")).toBeNull();
    expect(normaliseNumber("   ")).toBeNull();
  });

  it("keeps a real zero", () => {
    expect(normaliseNumber("0")).toBe(0);
  });

  it.each([
    ["1,200 sq ft", 1200],
    ["450 sqft", 450],
    ["4 yrs", 4],
    ["6 months", 6],
  ])("strips units from %s", (input, expected) => {
    expect(normaliseNumber(input)).toBe(expected);
  });
});

describe("N-08 tier and priority", () => {
  it.each([["Tier 2", "Tier 2"], ["tier-2", "Tier 2"], ["T2", "Tier 2"], ["3", "Tier 3"]])(
    "reads %s as %s",
    (input, expected) => {
      expect(normaliseTier(input)).toBe(expected);
    },
  );

  it.each([["High", "High"], ["medium", "Medium"], ["med", "Medium"], ["LOW", "Low"]])(
    "reads %s as %s",
    (input, expected) => {
      expect(normalisePriority(input)).toBe(expected);
    },
  );
});

describe("N-09 pin lists", () => {
  it("splits on every listed separator and de-duplicates", () => {
    const { pins } = normalisePinList("560001, 560002; 560003 | 560004\n560001");
    expect(pins).toEqual(["560001", "560002", "560003", "560004"]);
  });

  it("drops anything that is not six digits and reports it", () => {
    const { pins, dropped } = normalisePinList("560001, 5600, abc");
    expect(pins).toEqual(["560001"]);
    expect(dropped).toEqual(["5600", "abc"]);
  });
});

const rawApp = (over: Partial<RawApplicationRow> = {}): RawApplicationRow => ({
  rowNumber: 4,
  applicationId: "APP-100",
  applicantName: "Test Person",
  city: "Mysore",
  state: "Karnataka",
  pinCode: "570 001",
  investmentLakh: "₹25 lakh",
  retailExperienceYears: "4",
  currentBusiness: "Runs a shop",
  spaceAvailable: "Rented",
  spaceSizeSqft: "450",
  floor: "Ground",
  targetLaunchMonths: "3",
  preferredLanguage: "Kannada",
  notes: "",
  ...over,
});

describe("row normalisation and logging", () => {
  it("logs only the fields it actually changed", () => {
    const log = new NormalisationLog();
    const n = normaliseApplicationRow(rawApp(), log, "English");

    expect(n.city).toBe("Mysuru");
    expect(n.pinCode).toBe("570001");
    expect(n.investmentLakh).toBe(25);

    const columns = log.entries.map((e) => e.column);
    expect(columns).toContain("City");
    expect(columns).toContain("Pin code");
    expect(columns).toContain("Investment capacity (rupees lakh)");
    // Floor was already "Ground", so there is nothing to report.
    expect(columns).not.toContain("Floor");
  });

  it("records a defaulted language even though nothing was rewritten", () => {
    const log = new NormalisationLog();
    const n = normaliseApplicationRow(rawApp({ preferredLanguage: "" }), log, "English");
    expect(n.preferredLanguage).toBe("English");
    expect(n.languageWasDefaulted).toBe(true);
    expect(log.entries.some((e) => e.ruleId === "N-06" && e.from === "(blank)")).toBe(true);
  });

  it("leaves a missing number as null so nothing is invented", () => {
    const log = new NormalisationLog();
    const n = normaliseApplicationRow(
      rawApp({ spaceSizeSqft: "", targetLaunchMonths: "", retailExperienceYears: "" }),
      log,
      "English",
    );
    expect(n.spaceSizeSqft).toBeNull();
    expect(n.targetLaunchMonths).toBeNull();
    expect(n.retailExperienceYears).toBeNull();
  });

  it("normalises a territory row and reports dropped pins", () => {
    const log = new NormalisationLog();
    const raw: RawTerritoryRow = {
      rowNumber: 4,
      territoryId: "TER-09",
      city: "Hubli",
      state: "Karnataka",
      pinCodesCovered: "580001; 580002 | 58003",
      cityTier: "tier-2",
      openSlots: "2",
      priority: "high",
    };
    const { normalised, droppedPins } = normaliseTerritoryRow(raw, log);
    expect(normalised.city).toBe("Hubballi-Dharwad");
    expect(normalised.pins).toEqual(["580001", "580002"]);
    expect(normalised.tier).toBe("Tier 2");
    expect(normalised.priority).toBe("High");
    expect(normalised.openSlots).toBe(2);
    expect(droppedPins).toEqual(["58003"]);
  });
});
