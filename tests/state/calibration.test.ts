import { describe, expect, it } from "vitest";
import { calibrate } from "../../lib/state/calibration";
import type { Feedback, Override } from "../../lib/types";
import { runSeed } from "../helpers";

const result = runSeed();
const { applicants } = result;

const say = (over: Partial<Feedback> = {}): Feedback => ({
  applicationId: "APP-001",
  verdict: "disagree",
  reason: null,
  ruleIds: ["R-01"],
  tier: "Tier 2",
  createdAt: "2026-10-26T00:00:00.000Z",
  ...over,
});

const override = (over: Partial<Override> = {}): Override => ({
  applicationId: "APP-001",
  fromStatus: "ON HOLD",
  toStatus: "APPROVED",
  reason: "Spoke to them; the money is in place.",
  locked: true,
  who: "Operator",
  when: "2026-10-26T00:00:00.000Z",
  ...over,
});

describe("calibration report", () => {
  it("says plainly that nothing has been reviewed rather than claiming zero agreement", () => {
    const report = calibrate(applicants, [], []);
    expect(report.agreementRate).toBeNull();
    expect(report.headline).toContain("No decision has been reviewed yet");
  });

  it("counts agreement over reviewed decisions, not over the whole file", () => {
    const report = calibrate(applicants, [say({ verdict: "agree" }), say({ applicationId: "APP-002" })], []);
    expect(report.reviewed).toBe(2);
    expect(report.agreementRate).toBe(0.5);
    expect(report.decided).toBe(applicants.length);
  });

  it("measures the override rate against every decision", () => {
    const report = calibrate(applicants, [], [override()]);
    expect(report.overrideRate).toBeCloseTo(1 / applicants.length);
  });

  it("groups disagreements by the rule that drove them, commonest first", () => {
    const report = calibrate(
      applicants,
      [
        say({ applicationId: "APP-001", ruleIds: ["R-01"] }),
        say({ applicationId: "APP-002", ruleIds: ["R-01", "R-04"] }),
        say({ applicationId: "APP-003", ruleIds: ["R-01"] }),
      ],
      [],
    );
    expect(report.disagreements.map((d) => [d.ruleId, d.count])).toEqual([
      ["R-01", 3],
      ["R-04", 1],
    ]);
    expect(report.disagreements[0].applicationIds).toEqual(["APP-001", "APP-002", "APP-003"]);
  });

  it("ignores decisions the manager agreed with when grouping", () => {
    const report = calibrate(applicants, [say({ verdict: "agree", ruleIds: ["R-01"] })], []);
    expect(report.disagreements).toHaveLength(0);
    expect(report.headline).toContain("agreed with all 1");
  });

  it("points at the setting that would move the rule", () => {
    const [top] = calibrate(applicants, [say({ ruleIds: ["R-03"] })], []).disagreements;
    expect(top.setting).toBe("Acceptable floors");
    expect(top.suggestion).toContain("which floors you are willing to accept");
  });

  it("refuses to suggest a threshold where none would help", () => {
    const [top] = calibrate(applicants, [say({ ruleIds: ["G-03"] })], []).disagreements;
    expect(top.setting).toBeNull();
    expect(top.suggestion).toContain("will not help");
  });

  it("names the tier when every disagreement on a rule shares one", () => {
    const [top] = calibrate(
      applicants,
      [say({ tier: "Tier 3" }), say({ applicationId: "APP-002", tier: "Tier 3" })],
      [],
    ).disagreements;
    expect(top.suggestion).toContain("All of them were Tier 3.");
  });

  it("files a disagreement with no failing rule under the score", () => {
    const [top] = calibrate(applicants, [say({ ruleIds: [] })], []).disagreements;
    expect(top.ruleId).toBe("S-01");
    expect(top.setting).toBeNull();
  });
});
