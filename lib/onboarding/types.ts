// The onboarding journey a partner walks after the engine has approved them.
//
// These are PROPOSED workflow milestones for this product. The source case study does not
// mandate this exact ten-step sequence, and nothing here feeds back into the engine: an
// onboarding record can never change an application's status, rank, pin or territory.
//
// Only two things are ever stored: which tasks have been completed and what state each
// document is in. Every milestone status, every percentage and the launch verdict is
// derived from those two, so there is no second place for a status to drift out of step.

export const MILESTONE_KEYS = [
  "approved",
  "agreement",
  "site-identification",
  "site-inspection",
  "commercials",
  "fit-out",
  "equipment",
  "staffing",
  "readiness-review",
  "launch",
] as const;

export type MilestoneKey = (typeof MILESTONE_KEYS)[number];

/** Who is accountable. "Brand" means company staff; a partner can never close one. */
export type Actor = "Partner" | "Brand";

export interface TaskDef {
  id: string;
  milestone: MilestoneKey;
  label: string;
  /**
   * The only actor permitted to mark this done. A partner cannot sign off their own site
   * inspection or declare the store authorised to open — those are Brand tasks, and the
   * owner portal renders them read-only.
   */
  completedBy: Actor;
  help: string | null;
}

export interface DocumentDef {
  id: string;
  milestone: MilestoneKey;
  label: string;
  required: boolean;
  help: string | null;
}

export interface MilestoneDef {
  key: MilestoneKey;
  number: number;
  title: string;
  description: string;
  owner: Actor;
  /**
   * Relative contribution to overall progress. The percentage shown to a partner is the
   * sum of completed weights over the total, so it means something specific rather than
   * being a number chosen to look encouraging.
   */
  weight: number;
  dependsOn: MilestoneKey[];
  completionCriteria: string;
}

export type MilestoneStatus =
  | "Blocked"
  | "Not started"
  | "In progress"
  | "Awaiting brand verification"
  | "Complete";

export type DocumentState =
  | "Not submitted"
  | "Submitted"
  | "Under review"
  | "Accepted"
  | "Needs correction";

export const DOCUMENT_STATES: DocumentState[] = [
  "Not submitted",
  "Submitted",
  "Under review",
  "Accepted",
  "Needs correction",
];

export interface TaskRecord {
  at: string;
  by: Actor;
  /** Free-text name of whoever clicked. There is no account system behind this. */
  byName: string | null;
}

export interface DocumentRecord {
  state: DocumentState;
  at: string;
  note: string | null;
  /**
   * The file name the partner typed or chose. No bytes are stored anywhere — this product
   * has no file storage, so a "submitted" document means "the partner says they sent it",
   * not "we hold a copy". The UI says so.
   */
  fileNameClaimed: string | null;
}

export interface ActivityEntry {
  id: string;
  at: string;
  by: Actor;
  byName: string | null;
  summary: string;
}

/** Everything that is actually persisted for one partner's journey. */
export interface JourneyProgress {
  applicationId: string;
  tasks: Record<string, TaskRecord>;
  documents: Record<string, DocumentRecord>;
  activity: ActivityEntry[];
  /** Partner-entered site facts. Checked against brand requirements, never a new rule. */
  siteNotes: string | null;
  /** True only for the seeded sample partner shown in the demo owner portal. */
  isDemo: boolean;
}

export interface MilestoneView {
  def: MilestoneDef;
  status: MilestoneStatus;
  tasks: { def: TaskDef; record: TaskRecord | null }[];
  documents: { def: DocumentDef; record: DocumentRecord }[];
  /** Dependencies that are not yet complete, named for display. */
  blockedBy: MilestoneKey[];
  /** The single next thing to do, or null when there is nothing outstanding. */
  nextAction: { label: string; owner: Actor } | null;
  dueDate: string | null;
  dueDateIsIllustrative: boolean;
}

export interface LaunchReadiness {
  partnerTasksComplete: boolean;
  brandVerificationComplete: boolean;
  outstandingMandatory: { label: string; owner: Actor }[];
  /** Set only when a Brand actor has closed the final authorisation task. */
  authorised: boolean;
  verdict:
    | "Store opened"
    | "Authorised to open"
    | "Awaiting brand authorisation"
    | "Partner work outstanding";
}

export interface JourneyView {
  applicationId: string;
  milestones: MilestoneView[];
  /** Completed weight over total weight, as a whole number. */
  percentComplete: number;
  completedWeight: number;
  totalWeight: number;
  current: MilestoneView | null;
  nextAction: { label: string; owner: Actor; milestone: MilestoneKey } | null;
  launch: LaunchReadiness;
  outstandingDocuments: { def: DocumentDef; record: DocumentRecord }[];
  activity: ActivityEntry[];
  isDemo: boolean;
}
