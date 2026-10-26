import { BRAND_DEFAULT_POLICY, EMBEDDED_STORES } from "../lib/reference";
import { runPipeline, type PipelineOptions } from "../lib/engine/pipeline";
import { SEED_APPLICATIONS } from "../lib/seed/applications";
import { SEED_STORES } from "../lib/seed/stores";
import { SEED_TERRITORIES } from "../lib/seed/territories";
import type {
  ExistingStore,
  PipelineInput,
  PipelineResult,
  PolicyProfile,
  RawApplicationRow,
  RawTerritoryRow,
} from "../lib/types";

/** Frozen so every expectation in the suite is a fixed date, not "today". */
export const AS_OF = "2026-10-26";

export const policy = (over: Partial<PolicyProfile> = {}): PolicyProfile => ({
  ...BRAND_DEFAULT_POLICY,
  ...over,
});

let nextRow = 4;

export function appRow(over: Partial<RawApplicationRow> = {}): RawApplicationRow {
  return {
    rowNumber: nextRow++,
    applicationId: "APP-900",
    applicantName: "Test Person",
    city: "Mysuru",
    state: "Karnataka",
    pinCode: "570002",
    investmentLakh: "30",
    retailExperienceYears: "5",
    currentBusiness: "Runs a footwear store",
    spaceAvailable: "Rented",
    spaceSizeSqft: "600",
    floor: "Ground",
    targetLaunchMonths: "6",
    preferredLanguage: "Kannada",
    notes: "",
    ...over,
  };
}

export function terRow(over: Partial<RawTerritoryRow> = {}): RawTerritoryRow {
  return {
    rowNumber: nextRow++,
    territoryId: "TER-01",
    city: "Mysuru",
    state: "Karnataka",
    pinCodesCovered: "570002, 570003, 570004",
    cityTier: "Tier 2",
    openSlots: "2",
    priority: "High",
    ...over,
  };
}

export function run(
  applications: RawApplicationRow[],
  territories: RawTerritoryRow[],
  options: Partial<PipelineOptions> & { stores?: ExistingStore[] } = {},
): PipelineResult {
  const { stores, ...rest } = options;
  const input: PipelineInput = {
    applications,
    territories,
    stores: stores ?? EMBEDDED_STORES,
  };
  return runPipeline(input, {
    policy: policy(),
    asOfDate: AS_OF,
    withCounterfactuals: false,
    ...rest,
  });
}

/** The bundled sample set, run exactly as the "Load sample data" button runs it. */
export function runSeed(over: Partial<PipelineOptions> = {}): PipelineResult {
  return runPipeline(
    { applications: SEED_APPLICATIONS, territories: SEED_TERRITORIES, stores: SEED_STORES },
    { policy: policy(), asOfDate: AS_OF, withCounterfactuals: false, ...over },
  );
}

export const statusOf = (result: PipelineResult, id: string) =>
  result.applicants.find((a) => a.applicationId === id)?.status;

export const applicant = (result: PipelineResult, id: string) => {
  const a = result.applicants.find((x) => x.applicationId === id);
  if (!a) throw new Error(`No applicant ${id} in the result.`);
  return a;
};
