import type { Applicant, Feedback, Override, Tier } from "../types";

/** The policy control a rule actually depends on, so a suggestion can point at it. */
const RULE_SETTINGS: Record<string, { rule: string; setting: string; lever: string }> = {
  "G-02": {
    rule: "Hard investment floor",
    setting: "Hard investment floor",
    lever: "the percentage of the tier minimum below which an applicant is dropped outright",
  },
  "R-01": {
    rule: "Investment meets the tier minimum",
    setting: "Minimum investment",
    lever: "the tier's minimum investment",
  },
  "R-02": {
    rule: "A space is owned or rented",
    setting: "Minimum investment",
    lever: "nothing in the policy — this one is a fact about the applicant, not a threshold",
  },
  "R-03": {
    rule: "Floor is acceptable",
    setting: "Acceptable floors",
    lever: "which floors you are willing to accept",
  },
  "R-04": {
    rule: "Space size meets the tier minimum",
    setting: "Minimum space",
    lever: "the tier's minimum space",
  },
  "R-05": {
    rule: "No blocking data-quality issue",
    setting: "Data quality",
    lever: "nothing in the policy — fix the data instead",
  },
  "G-01": {
    rule: "City, pin code and their agreement",
    setting: "Territories",
    lever: "nothing in the policy — this is reference data",
  },
  "G-03": {
    rule: "Pin code is free of an existing store",
    setting: "Territories",
    lever: "nothing in the policy — this protects an existing store",
  },
  "G-04": {
    rule: "Pin code falls inside a territory",
    setting: "Territories",
    lever: "nothing in the policy — this is reference data",
  },
};

export interface RuleDisagreement {
  ruleId: string;
  rule: string;
  count: number;
  applicationIds: string[];
  tiers: Tier[];
  suggestion: string;
  /** The Settings control to open, or null when no threshold would help. */
  setting: string | null;
}

export interface Calibration {
  decided: number;
  reviewed: number;
  agreed: number;
  disagreed: number;
  /** Null until at least one decision has been reviewed — a rate of zero would lie. */
  agreementRate: number | null;
  overrides: number;
  overrideRate: number | null;
  disagreements: RuleDisagreement[];
  headline: string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function calibrate(
  applicants: Applicant[],
  feedback: Feedback[],
  overrides: Override[],
): Calibration {
  const decided = applicants.length;
  const reviewed = feedback.length;
  const agreed = feedback.filter((f) => f.verdict === "agree").length;
  const disagreed = reviewed - agreed;
  const agreementRate = reviewed === 0 ? null : agreed / reviewed;
  const overrideRate = decided === 0 ? null : overrides.length / decided;

  const byRule = new Map<string, Feedback[]>();
  for (const f of feedback.filter((x) => x.verdict === "disagree")) {
    // A decision usually fails more than one rule, so it counts against each of them.
    const rules = f.ruleIds.length > 0 ? f.ruleIds : ["S-01"];
    for (const ruleId of rules) byRule.set(ruleId, [...(byRule.get(ruleId) ?? []), f]);
  }

  const disagreements = [...byRule.entries()]
    .map(([ruleId, items]) => {
      const known = RULE_SETTINGS[ruleId];
      const tiers = [...new Set(items.map((f) => f.tier).filter((t): t is Tier => t !== null))];
      return {
        ruleId,
        rule: known?.rule ?? "Score and ranking",
        count: items.length,
        applicationIds: items.map((f) => f.applicationId),
        tiers,
        suggestion: suggestion(ruleId, items.length, tiers),
        setting: known && known.lever.startsWith("nothing") ? null : (known?.setting ?? null),
      };
    })
    .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId));

  return {
    decided,
    reviewed,
    agreed,
    disagreed,
    agreementRate,
    overrides: overrides.length,
    overrideRate,
    disagreements,
    headline: headline(reviewed, agreementRate, disagreements),
  };
}

function suggestion(ruleId: string, count: number, tiers: Tier[]): string {
  const known = RULE_SETTINGS[ruleId];
  const where = tiers.length === 1 ? ` All of them were ${tiers[0]}.` : "";
  const times = `${count} ${count === 1 ? "decision" : "decisions"} you disagreed with turned on this rule.`;

  if (!known) {
    return `${times} No single threshold explains it, so read the scores side by side before changing anything.`;
  }
  if (known.lever.startsWith("nothing")) {
    return `${times}${where} Changing a threshold will not help: ${known.lever.replace("nothing in the policy — ", "")}.`;
  }
  return `${times}${where} If you think the bar is set wrong, adjust ${known.lever} in Settings.`;
}

function headline(
  reviewed: number,
  agreementRate: number | null,
  disagreements: RuleDisagreement[],
): string {
  if (reviewed === 0) {
    return "No decision has been reviewed yet. Mark a few as right or wrong and this report fills in.";
  }
  if (agreementRate === 1) {
    return `You agreed with all ${reviewed} ${reviewed === 1 ? "decision" : "decisions"} you reviewed. Nothing suggests a threshold is wrong.`;
  }
  const top = disagreements[0];
  const rate = `You agreed with ${pct(agreementRate ?? 0)} of the ${reviewed} decisions you reviewed.`;
  return top
    ? `${rate} The rule you disagreed with most is ${top.ruleId} — ${top.rule.toLowerCase()}.`
    : rate;
}
