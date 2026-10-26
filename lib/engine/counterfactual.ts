import { CITY_BY_PREFIX } from "../reference";
import type {
  Applicant,
  CounterfactualOption,
  PipelineInput,
  RawApplicationRow,
} from "../types";
import { runPipeline, type PipelineOptions } from "./pipeline";

interface Candidate {
  field: keyof RawApplicationRow & string;
  label: string;
  newValue: string;
  change: string;
}

/**
 * Proposes one-field changes and re-runs the real rules to see what each one would do.
 * The wording is ours; the resulting status always comes from the engine, never from AI.
 */
export function buildCounterfactual(
  applicant: Applicant,
  input: PipelineInput,
  options: PipelineOptions,
): CounterfactualOption[] {
  if (applicant.status === "APPROVED") return [];

  const { policy } = options;
  const n = applicant.normalised;
  const tier = applicant.tier;
  const failed = new Set([
    ...applicant.gateResults.filter((r) => !r.passed).map((r) => r.ruleId),
    ...applicant.readinessResults.filter((r) => !r.passed).map((r) => r.ruleId),
  ]);

  const candidates: Candidate[] = [];
  const add = (c: Candidate) => {
    if (candidates.some((x) => x.field === c.field)) return;
    if ((applicant.raw[c.field] ?? "").toString().trim() === c.newValue) return;
    candidates.push(c);
  };

  if (tier && (failed.has("R-01") || failed.has("G-02"))) {
    const min = policy.tierMinInvestmentLakh[tier];
    add({
      field: "investmentLakh",
      label: "Investment capacity",
      newValue: String(min),
      change: `Raise investment to ${min} lakh, the ${tier} minimum`,
    });
  }

  if (failed.has("R-02")) {
    add({
      field: "spaceAvailable",
      label: "Space available",
      newValue: "Rented",
      change: "Sign a rented space",
    });
  }

  if (failed.has("R-03")) {
    add({
      field: "floor",
      label: "Floor",
      newValue: "Ground",
      change: "Move to a Ground floor unit",
    });
  }

  if (tier && failed.has("R-04")) {
    const min = policy.tierMinSpaceSqft[tier];
    add({
      field: "spaceSizeSqft",
      label: "Space size",
      newValue: String(min),
      change: `Take a space of at least ${min} sq ft`,
    });
  }

  const pinTarget = applicant.suggestedPins[0] ?? null;
  if (pinTarget && (failed.has("G-03") || failed.has("G-04"))) {
    add({
      field: "pinCode",
      label: "Pin code",
      newValue: pinTarget,
      change: `Open in pin ${pinTarget} instead`,
    });
  }

  if (failed.has("G-01")) {
    // When the pin is valid and the city is not, the pin tells us which city was meant.
    const byPin = n.pinCode ? CITY_BY_PREFIX.get(n.pinCode.slice(0, 3)) : undefined;
    if (byPin && byPin.city !== n.city) {
      add({
        field: "city",
        label: "City",
        newValue: byPin.city,
        change: `Confirm the city is ${byPin.city}, which the pin code points to`,
      });
    } else if (pinTarget) {
      add({
        field: "pinCode",
        label: "Pin code",
        newValue: pinTarget,
        change: `Confirm the pin code is ${pinTarget}`,
      });
    }
  }

  // Ready but out-ranked: the only lever left is a stronger application.
  if (applicant.status === "WAITLISTED" && tier && n.investmentLakh !== null) {
    const stretch = Math.round(policy.tierMinInvestmentLakh[tier] * 1.5);
    if (stretch > n.investmentLakh) {
      add({
        field: "investmentLakh",
        label: "Investment capacity",
        newValue: String(stretch),
        change: `Raise investment to ${stretch} lakh (1.5x the ${tier} minimum)`,
      });
    }
  }

  const out: CounterfactualOption[] = [];
  for (const c of candidates.slice(0, 4)) {
    const applications = input.applications.map((row) =>
      row.rowNumber === applicant.rowNumber ? { ...row, [c.field]: c.newValue } : row,
    );
    const rerun = runPipeline(
      { ...input, applications },
      { ...options, withCounterfactuals: false },
    );
    const after = rerun.applicants.find((a) => a.key === applicant.key);
    if (!after || after.status === applicant.status) continue;
    out.push({
      change: c.change,
      field: c.label,
      newValue: c.newValue,
      resultingStatus: after.status,
      resultingReason: after.reasonSentence,
      reachesApproved: after.status === "APPROVED",
    });
  }

  return out.sort((a, b) => Number(b.reachesApproved) - Number(a.reachesApproved));
}
