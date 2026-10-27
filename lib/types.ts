// Domain types for Launchpad. Everything the engine touches is declared here.

import type { AiCallType } from "./ai/types";

export type Tier = "Tier 1" | "Tier 2" | "Tier 3";
export type Priority = "High" | "Medium" | "Low";
export type SpaceAvailable = "Owned" | "Rented" | "Not yet identified";
export type Floor = "Ground" | "Upper" | "Mall unit" | "Not known";
export type Language = "Kannada" | "English" | "Hindi";

export type Status =
  | "APPROVED"
  | "WAITLISTED"
  | "ON HOLD"
  | "REDIRECTED"
  | "NOT PROCEEDING";

export type Severity = "blocking" | "warning" | "info";

export interface RawApplicationRow {
  /** 1-based row number in the source sheet, as the operator sees it in Excel. */
  rowNumber: number;
  applicationId: string;
  applicantName: string;
  city: string;
  state: string;
  pinCode: string;
  investmentLakh: string;
  retailExperienceYears: string;
  currentBusiness: string;
  spaceAvailable: string;
  spaceSizeSqft: string;
  floor: string;
  targetLaunchMonths: string;
  preferredLanguage: string;
  notes: string;
}

export interface RawTerritoryRow {
  rowNumber: number;
  territoryId: string;
  city: string;
  state: string;
  pinCodesCovered: string;
  cityTier: string;
  openSlots: string;
  priority: string;
  /** True only for the template's grey example row, kept because the operator asked to include it. */
  fromExampleRow?: boolean;
}

export interface RawStoreRow {
  rowNumber: number;
  storeId: string;
  city: string;
  pinCode: string;
  opened: string;
}

/** Normalised applicant fields. `null` always means "not stated" — never a guess, never 0. */
export interface NormalisedApplication {
  applicationId: string;
  applicantName: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  investmentLakh: number | null;
  retailExperienceYears: number | null;
  currentBusiness: string | null;
  spaceAvailable: SpaceAvailable | null;
  spaceSizeSqft: number | null;
  floor: Floor | null;
  targetLaunchMonths: number | null;
  preferredLanguage: Language | null;
  languageWasDefaulted: boolean;
  notes: string | null;
}

export interface NormalisedTerritory {
  territoryId: string;
  city: string | null;
  state: string | null;
  pins: string[];
  tier: Tier | null;
  openSlots: number | null;
  priority: Priority | null;
}

export interface ExistingStore {
  storeId: string;
  city: string;
  pinCode: string;
  opened: string;
  source: "embedded" | "uploaded";
}

export type QualityId =
  | "DQ-01" | "DQ-02" | "DQ-03" | "DQ-04" | "DQ-05" | "DQ-06" | "DQ-07"
  | "DQ-08" | "DQ-09" | "DQ-10" | "DQ-11" | "DQ-12" | "DQ-13";

export interface QualityIssue {
  id: QualityId;
  severity: Severity;
  sheet: "Applications" | "Territories" | "Existing stores";
  row: number;
  column: string;
  originalValue: string | null;
  message: string;
  actionTaken: string;
  /** Application or Territory this issue attaches to, for filtering. */
  subjectId: string;
  /** For DQ-05/06 style issues, the field the operator must confirm. */
  confirmField?: string;
}

export type NormalisationRuleId =
  | "N-01" | "N-02" | "N-03" | "N-04" | "N-05"
  | "N-06" | "N-07" | "N-08" | "N-09";

export interface NormalisationLogEntry {
  ruleId: NormalisationRuleId;
  sheet: "Applications" | "Territories" | "Existing stores";
  row: number;
  column: string;
  from: string;
  to: string;
  subjectId: string;
}

export type GateId = "G-01" | "G-02" | "G-03" | "G-04";
export type ReadinessId = "R-01" | "R-02" | "R-03" | "R-04" | "R-05";
export type RuleId = GateId | ReadinessId | QualityId | NormalisationRuleId | "A-01" | "A-02" | "A-03" | "S-01";

export interface RuleResult {
  ruleId: GateId | ReadinessId;
  /** Plain-English statement of what was checked. */
  checked: string;
  /** The actual values compared, for the trace table and Explain mode. */
  values: Record<string, string | number | null>;
  passed: boolean;
  /** Only present on failure. */
  failReason?: string;
  /** Only present on failure of a readiness check. */
  unlockCondition?: string;
}

export interface DecisionTraceEntry {
  ruleId: RuleId;
  description: string;
  values: Record<string, string | number | null>;
  outcome: string;
  competitorId?: string;
}

export interface ScoreComponent {
  key: "investment" | "experience" | "space" | "business" | "launch";
  label: string;
  points: number;
  max: number;
  basis: string;
}

export interface ScoreBreakdown {
  total: number;
  components: ScoreComponent[];
  /** Space-readiness points before the out-of-band penalty, used as a rank tie-break. */
  spaceReadinessPoints: number;
}

export interface Competitor {
  applicationId: string;
  applicantName: string | null;
  pinCode: string | null;
  score: number;
  status: Status;
  samePin: boolean;
  whyRankedHigher: string | null;
}

export interface OnboardingStep {
  number: number;
  title: string;
  owner: "Partner" | "Brand";
  startDate: string;
  endDate: string;
  timingLabel: string;
  checklist: string[];
}

export interface OnboardingPlan {
  steps: OnboardingStep[];
  launchDate: string;
  targetDate: string | null;
  realisticMinimumMonths: number;
  targetIsAggressive: boolean;
  aggressiveNote: string | null;
  trainingStoreId: string | null;
  trainingStoreCity: string | null;
  trainingWeeks: number;
  trainingLanguage: Language;
  supportCheckIns: { label: string; date: string }[];
}

export interface CounterfactualOption {
  change: string;
  field: string;
  newValue: string;
  resultingStatus: Status;
  resultingReason: string;
  /** True when this single change is enough to reach APPROVED. */
  reachesApproved: boolean;
}

export interface Applicant {
  /** Stable internal key. Equals applicationId except for held duplicates (`APP-023#2`). */
  key: string;
  applicationId: string;
  rowNumber: number;
  raw: RawApplicationRow;
  normalised: NormalisedApplication;
  /** True when this is a second-or-later row sharing an Application ID. */
  isDuplicateHold: boolean;

  territoryId: string | null;
  tier: Tier | null;

  issues: QualityIssue[];
  gateResults: RuleResult[];
  readinessResults: RuleResult[];
  isReady: boolean;

  score: ScoreBreakdown;

  status: Status;
  reasonCode: string;
  reasonSentence: string;
  nextStep: string;
  unlockCondition: string | null;
  rank: number | null;
  assignedPin: string | null;
  reservedUntil: string | null;
  suggestedPins: string[];

  competitors: Competitor[];
  counterfactual: CounterfactualOption[];
  onboardingPlan: OnboardingPlan | null;
  messages: Record<Language, string>;
  partnerToken: string;
  trace: DecisionTraceEntry[];

  /** AI-1 output, or its deterministic fallback. */
  businessClassification: BusinessClassification;
}

export type BusinessCategory =
  | "retail_owner"
  | "customer_facing_adjacent"
  | "unrelated_or_none";

export interface BusinessClassification {
  category: BusinessCategory;
  evidenceQuote: string | null;
  confidence: number;
  source: "ai" | "fallback";
}

export interface Territory {
  territoryId: string;
  city: string | null;
  state: string | null;
  tier: Tier | null;
  pins: string[];
  /** Pins this territory ceded to a lower-numbered territory under DQ-09. */
  cededPins: string[];
  openSlots: number | null;
  priority: Priority | null;
  /**
   * Existing stores only, fixed before allocation runs — it is the input to capacity, not
   * a record of who ended up holding what. For display, read pinHolders instead.
   */
  occupiedPins: string[];
  freePins: string[];
  usableCapacity: number;
  capacityCappedReason: string | null;
  /** Pin -> who holds it. */
  pinHolders: Record<string, { kind: "store" | "approved" | "reserved"; id: string }>;
  queue: { applicationId: string; score: number; status: Status; rank: number }[];
  unfilledSlotBlocker: string | null;
  issues: QualityIssue[];
  rowNumber: number;
}

export interface PolicyProfile {
  name: string;
  brandName: string;
  isDefault: boolean;
  version: number;
  createdAt: string;
  tierMinInvestmentLakh: Record<Tier, number>;
  tierMinSpaceSqft: Record<Tier, number>;
  tierPreferredBand: Record<Tier, { min: number; max: number }>;
  /** Fraction of the tier minimum below which the applicant is NOT PROCEEDING. */
  hardInvestmentFloorRatio: number;
  acceptableFloors: Floor[];
  scoreWeights: {
    investment: number;
    experience: number;
    space: number;
    business: number;
    launch: number;
  };
  reservationWindowDays: number;
  realisticMonthsSpaceSecured: number;
  realisticMonthsNoSpace: number;
  realisticMonthsZeroExperiencePenalty: number;
  trainingWeeks: number;
  trainingWeeksZeroExperienceBonus: number;
  trainingStoreOverrides: Record<string, string>;
  defaultLanguage: Language;
  statusLabels: Record<Status, string>;
}

export interface FeatureFlags {
  aiExplanations: boolean;
  aiContradictionCheck: boolean;
  counterfactuals: boolean;
  partnerMessages: boolean;
  partnerView: boolean;
  explainMode: boolean;
  autoApplyChatUpdates: boolean;
  costCap: boolean;
}

export interface Feedback {
  applicationId: string;
  verdict: "agree" | "disagree";
  reason: string | null;
  ruleIds: string[];
  tier: Tier | null;
  createdAt: string;
}

export interface Override {
  applicationId: string;
  fromStatus: Status;
  toStatus: Status;
  reason: string;
  locked: boolean;
  who: string;
  when: string;
}

export interface CostLedgerEntry {
  callType: AiCallType;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedUsd: number;
  cacheHit: boolean;
  at: string;
  ok: boolean;
}

export interface Patch {
  applicationId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  sourceQuote: string;
}

export type VersionTrigger =
  | "upload"
  | "sample"
  | "chat-patch"
  | "policy-change"
  | "override"
  | "partner-update"
  | "include-example-row"
  | "ai-enrichment"
  | "undo";

export interface StatusSnapshotEntry {
  key: string;
  applicationId: string;
  status: Status;
  reasonSentence: string;
  score: number;
  rank: number | null;
  assignedPin: string | null;
  reservedUntil: string | null;
}

export interface VersionDiffEntry {
  key: string;
  applicationId: string;
  applicantName: string | null;
  fromStatus: Status | null;
  toStatus: Status;
  fromReason: string | null;
  toReason: string;
  fromScore: number | null;
  toScore: number;
  /** Rank can move on its own when someone else's score changes — a quiet demotion. */
  fromRank: number | null;
  toRank: number | null;
  displaced: boolean;
}

export interface Version {
  versionId: string;
  createdAt: string;
  trigger: VersionTrigger;
  label: string;
  patches: Patch[];
  snapshot: StatusSnapshotEntry[];
  diff: VersionDiffEntry[];
}

export interface PendingUpdate {
  id: string;
  applicationId: string;
  submittedAt: string;
  message: string;
  proposedPatches: Patch[];
  state: "pending" | "accepted" | "rejected";
}

export interface ParseReport {
  fileName: string;
  sheetsFound: { requested: string; matchedAs: string; rows: number }[];
  sheetsMissing: string[];
  headerRows: Record<string, number>;
  rowsRead: Record<string, number>;
  exampleRowsExcluded: { sheet: string; rowNumber: number }[];
  exampleRowIncluded: boolean;
  rowErrors: { sheet: string; row: number; message: string }[];
  processedMs: number;
  storesSource: "embedded" | "uploaded";
  storeDifferences: string[];
}

export interface PipelineInput {
  applications: RawApplicationRow[];
  territories: RawTerritoryRow[];
  stores: ExistingStore[];
}

export interface PipelineResult {
  asOfDate: string;
  applicants: Applicant[];
  territories: Territory[];
  stores: ExistingStore[];
  issues: QualityIssue[];
  normalisationLog: NormalisationLogEntry[];
  /** Thrown invariant message, if the run was rolled back. Null on a healthy run. */
  invariantViolation: string | null;
  counts: Record<Status, number>;
  slotsFilled: number;
  slotsOpen: number;
  highPrioritySlotsEmpty: number;
  todaysBrief: string;
  recruitmentGaps: RecruitmentGap[];
  /** Hash of the full result, for the determinism test. */
  resultHash: string;
}

export interface RecruitmentGap {
  territoryId: string;
  city: string | null;
  tier: Tier | null;
  priority: Priority | null;
  freeCapacity: number;
  readyApplicants: number;
  blockedApplicants: number;
  suggestedChannels: string[];
}

export interface HealthState {
  parser: { level: "green" | "amber" | "red"; detail: string };
  rules: { level: "green" | "amber" | "red"; detail: string };
  ai: { level: "green" | "amber" | "red"; detail: string };
  storage: { level: "green" | "amber" | "red"; detail: string };
}

export interface SystemLogEntry {
  at: string;
  kind: "ai" | "parse" | "storage" | "engine" | "export";
  ok: boolean;
  message: string;
  detail?: string;
}

export interface ChatCitation {
  ruleId: string;
  /** The rule's own wording, so the citation reads as evidence rather than a code. */
  detail: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Which path produced the answer, surfaced in the UI. */
  routedBy?: "deterministic" | "ai";
  intent?: string;
  citations?: ChatCitation[];
  patches?: Patch[];
  diff?: VersionDiffEntry[];
  versionId?: string;
  at: string;
}
