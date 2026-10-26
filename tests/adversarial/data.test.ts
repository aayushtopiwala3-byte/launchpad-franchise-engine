import { describe, expect, it } from "vitest";
import { investmentPoints } from "../../lib/engine/score";
import { appRow, applicant, run, statusOf, terRow } from "../helpers";

/**
 * Test area D. The single property under attack: a gap in the file must never read as
 * good news. A blank cell may delay a decision, it may never buy one, and it may never
 * be quietly filled in with a plausible-looking value.
 */

const TER = [terRow()];

/** Fields the case study marks required. Each is blanked one at a time. */
const REQUIRED: [string, Partial<ReturnType<typeof appRow>>][] = [
  ["applicant name", { applicantName: "" }],
  ["city", { city: "" }],
  ["state", { state: "" }],
  ["pin code", { pinCode: "" }],
  ["investment", { investmentLakh: "" }],
  ["retail experience", { retailExperienceYears: "" }],
  ["space position", { spaceAvailable: "" }],
];

describe("a missing value delays a decision, never earns one", () => {
  it.each(REQUIRED)("holds an otherwise perfect applicant whose %s is blank", (_label, over) => {
    const result = run([appRow(over)], TER);

    expect(statusOf(result, "APP-900")).not.toBe("APPROVED");
    expect(result.issues.some((i) => i.severity === "blocking")).toBe(true);
  });

  it("approves the same row once every required field is present", () => {
    expect(statusOf(run([appRow()], TER), "APP-900")).toBe("APPROVED");
  });

  it("scores a blank investment no higher than the worst stated figure", () => {
    const blank = investmentPoints(null, 20);
    const dismal = investmentPoints(1, 20);

    expect(blank.points).toBeLessThanOrEqual(dismal.points);
    // The basis says a figure was not read. It does not say the file was blank, because
    // null also arrives from a cell whose units N-01 could not settle.
    expect(blank.basis).toContain("No investment figure was read");
    expect(blank.basis).not.toMatch(/\d/);
  });

  it("scores unstated experience at zero without calling it a rejection", () => {
    const stated = applicant(run([appRow({ retailExperienceYears: "8" })], TER), "APP-900");
    const blank = applicant(run([appRow({ retailExperienceYears: "" })], TER), "APP-900");

    const pointsFor = (a: typeof stated) =>
      a.score.components.find((c) => c.key === "experience")!.points;
    expect(pointsFor(blank)).toBeLessThan(pointsFor(stated));
    expect(blank.status).not.toBe("NOT PROCEEDING");
  });

  it("leaves an unstated field null rather than inventing a value", () => {
    const a = applicant(run([appRow({ spaceSizeSqft: "", floor: "" })], TER), "APP-900");

    expect(a.normalised.spaceSizeSqft).toBeNull();
    expect(a.normalised.floor).toBeNull();
    expect(a.raw.spaceSizeSqft).toBe("");
  });
});

/**
 * "We need something from you" and "you do not meet the bar" are different answers and
 * the operator acts on them differently. The engine must not collapse them.
 */
describe("needing more information is not the same as failing a requirement", () => {
  it("holds a blank investment rather than rejecting it", () => {
    const a = applicant(run([appRow({ investmentLakh: "" })], TER), "APP-900");

    expect(a.status).toBe("ON HOLD");
    expect(a.unlockCondition).toBeTruthy();
    expect(a.gateResults.find((r) => r.ruleId === "G-02")?.passed).toBe(true);
    expect(a.readinessResults.find((r) => r.ruleId === "R-01")?.passed).toBe(false);
  });

  it("rejects a stated investment below the hard floor", () => {
    const a = applicant(run([appRow({ investmentLakh: "10" })], TER), "APP-900");

    expect(a.status).toBe("NOT PROCEEDING");
    expect(a.gateResults.find((r) => r.ruleId === "G-02")?.passed).toBe(false);
  });

  it("asks which of city and pin code is right rather than picking one", () => {
    const a = applicant(run([appRow({ city: "Mysuru", pinCode: "411002" })], TER), "APP-900");

    expect(a.status).toBe("ON HOLD");
    expect(a.normalised.city).toBe("Mysuru");
    expect(a.normalised.pinCode).toBe("411002");
    expect(a.issues.some((i) => i.id === "DQ-03")).toBe(true);
    expect(a.unlockCondition).toContain("Confirm");
  });
});

describe("contradictory rows are held, and neither side is overwritten", () => {
  it("holds a row that says no space yet but states a size and a floor", () => {
    const a = applicant(
      run([appRow({ spaceAvailable: "Not yet identified", spaceSizeSqft: "600", floor: "Ground" })], TER),
      "APP-900",
    );

    expect(a.status).toBe("ON HOLD");
    expect(a.issues.some((i) => i.id === "DQ-05")).toBe(true);
    expect(a.normalised.spaceSizeSqft).toBe(600);
    expect(a.normalised.spaceAvailable).toBe("Not yet identified");
  });

  it("holds a rented space whose size was never given", () => {
    const a = applicant(run([appRow({ spaceAvailable: "Rented", spaceSizeSqft: "" })], TER), "APP-900");

    expect(a.status).toBe("ON HOLD");
    expect(a.issues.some((i) => i.id === "DQ-06")).toBe(true);
  });
});

describe("implausible numbers are questioned, not silently repaired", () => {
  const CASES: [string, Partial<ReturnType<typeof appRow>>][] = [
    ["an investment above the plausible ceiling", { investmentLakh: "600" }],
    ["more retail experience than a working life", { retailExperienceYears: "95" }],
    ["a shop the size of a stadium", { spaceSizeSqft: "95000" }],
    ["a launch horizon past three years", { targetLaunchMonths: "120" }],
    ["a negative investment", { investmentLakh: "-30" }],
  ];

  it.each(CASES)("holds %s without capping the value", (_label, over) => {
    const a = applicant(run([appRow(over)], TER), "APP-900");

    expect(a.status).not.toBe("APPROVED");
    expect(a.issues.some((i) => i.id === "DQ-07")).toBe(true);
    const [[field, value]] = Object.entries(over);
    expect(a.raw[field as keyof typeof a.raw]).toBe(value);
  });
});

/**
 * N-01 reads a figure above 1,000 as rupees rather than lakh, which is right for the
 * person who typed 2500000 and wrong for the person who typed 5000. The guess is only
 * safe while some reading of the cell is plausible. Where none is, the file has not told
 * us what they can invest, and a rejection resting on our own arithmetic is not a
 * decision anyone could defend to the applicant.
 */
describe("a figure we had to guess the units of cannot end the application", () => {
  it("reads a full rupee amount as lakh, because that reading is plausible", () => {
    const a = applicant(run([appRow({ investmentLakh: "2500000" })], TER), "APP-900");

    expect(a.normalised.investmentLakh).toBe(25);
    expect(a.status).toBe("APPROVED");
  });

  it.each(["1001", "5000", "90000"])(
    "holds %s for confirmation rather than rejecting on the re-read value",
    (written) => {
      const a = applicant(run([appRow({ investmentLakh: written })], TER), "APP-900");

      expect(a.status).toBe("ON HOLD");
      expect(a.unlockCondition).toContain("Confirm");
      expect(a.issues.some((i) => i.id === "DQ-07")).toBe(true);
    },
  );

  it("does not state the figure it invented as though the file had said it", () => {
    const a = applicant(run([appRow({ investmentLakh: "5000" })], TER), "APP-900");

    expect(a.status).not.toBe("NOT PROCEEDING");
    expect(a.reasonSentence).not.toContain("0.05 lakh");
    expect(a.raw.investmentLakh).toBe("5000");
  });

  /**
   * The mirror of the test above. Having stopped the engine asserting a figure the file
   * never gave, it must not assert the opposite either: a cell holding 5000 is not blank,
   * so nothing shown to an operator may call it "not stated".
   */
  it("does not call a cell that holds a figure blank, anywhere a reader can see", () => {
    const a = applicant(run([appRow({ investmentLakh: "5000" })], TER), "APP-900");
    const investment = a.score.components.find((c) => c.key === "investment")!;
    const r01 = a.readinessResults.find((r) => r.ruleId === "R-01")!;

    expect(investment.basis).not.toContain("not stated");
    expect(r01.failReason).not.toContain("not stated");
    expect(a.reasonSentence).not.toContain("not stated");
  });

  it("still says plainly when the cell really was blank", () => {
    const a = applicant(run([appRow({ investmentLakh: "" })], TER), "APP-900");

    expect(a.readinessResults.find((r) => r.ruleId === "R-01")!.failReason).toContain("not stated");
    expect(a.issues.some((i) => i.id === "DQ-07")).toBe(false);
  });

  it("still rejects a figure the file states plainly and below the floor", () => {
    expect(statusOf(run([appRow({ investmentLakh: "10" })], TER), "APP-900")).toBe("NOT PROCEEDING");
  });
});

describe("a malformed pin code never guesses its way into a territory", () => {
  it("holds a five-digit pin and links it to nothing", () => {
    const a = applicant(run([appRow({ pinCode: "57000" })], TER), "APP-900");

    expect(a.status).toBe("ON HOLD");
    expect(a.territoryId).toBeNull();
    expect(a.assignedPin).toBeNull();
    expect(a.issues.some((i) => i.id === "DQ-02")).toBe(true);
  });

  it("reads a pin written with a space or a hyphen as the six digits it is", () => {
    const a = applicant(run([appRow({ pinCode: "570 002" })], TER), "APP-900");

    expect(a.normalised.pinCode).toBe("570002");
    expect(a.status).toBe("APPROVED");
  });

  it("never holds a pin for an applicant whose location is unconfirmed", () => {
    const result = run([appRow({ city: "Mysuru", pinCode: "411002" })], TER);
    const a = applicant(result, "APP-900");

    expect(a.reservedUntil).toBeNull();
    expect(a.assignedPin).toBeNull();
    expect(result.territories[0].freePins).toContain("570002");
  });
});

describe("a duplicate Application ID cannot take the original's pin", () => {
  it("holds the second row and leaves the first approved", () => {
    const result = run(
      [appRow(), appRow({ applicantName: "Someone Else", investmentLakh: "60" })],
      TER,
    );
    const [first, second] = result.applicants;

    expect(first.status).toBe("APPROVED");
    expect(first.assignedPin).toBe("570002");
    expect(second.isDuplicateHold).toBe(true);
    expect(second.status).toBe("ON HOLD");
    expect(second.assignedPin).toBeNull();
    expect(second.reservedUntil).toBeNull();
  });
});
