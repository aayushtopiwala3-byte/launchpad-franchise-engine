import { describe, expect, it } from "vitest";
import { checkPolish } from "../../lib/ai/polish";

const TEMPLATE =
  "Approved for pin 560043 in TER-01. Your investment of 30 lakh meets the Tier 1 minimum. Planned opening 27 Apr 2027.";

describe("AI-4 polish guard", () => {
  it("accepts a rewrite that only changes wording", () => {
    const polished =
      "Good news — you are approved for pin 560043 in TER-01. Your investment of 30 lakh meets the Tier 1 minimum, and the planned opening is 27 Apr 2027.";
    const check = checkPolish(TEMPLATE, polished);
    expect(check.accepted).toBe(true);
    expect(check.text).toBe(polished);
  });

  it("discards a rewrite that changes a number", () => {
    const check = checkPolish(TEMPLATE, TEMPLATE.replace("30 lakh", "35 lakh"));
    expect(check.accepted).toBe(false);
    expect(check.text).toBe(TEMPLATE);
    expect(check.reason).toContain("Numbers changed");
  });

  it("discards a rewrite that changes a pin code", () => {
    const check = checkPolish(TEMPLATE, TEMPLATE.replace("560043", "560044"));
    expect(check.accepted).toBe(false);
    expect(check.text).toBe(TEMPLATE);
  });

  it("discards a rewrite that changes a territory ID", () => {
    const check = checkPolish(TEMPLATE, TEMPLATE.replace("TER-01", "TER-02"));
    expect(check.accepted).toBe(false);
    expect(check.reason).toContain("Identifiers changed");
  });

  it("discards a rewrite that drops a fact", () => {
    const check = checkPolish(TEMPLATE, "You are approved. Congratulations on joining us.");
    expect(check.accepted).toBe(false);
    expect(check.text).toBe(TEMPLATE);
  });

  it("discards a rewrite that invents a commitment", () => {
    const check = checkPolish(
      TEMPLATE,
      `${TEMPLATE} We will also waive your franchise fee and send a team to help you set up, and we guarantee your store will be profitable within the first year of trading.`,
    );
    expect(check.accepted).toBe(false);
    expect(check.reason).toContain("too much new text");
  });

  it("discards an empty rewrite", () => {
    expect(checkPolish(TEMPLATE, "   ").accepted).toBe(false);
  });
});
