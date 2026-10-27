// Pure derivation. No React, no storage, no clock — the journey view is a function of the
// applicant the engine produced plus the progress that was explicitly recorded.
//
// Nothing here writes a status. A milestone is complete because its tasks and mandatory
// documents are complete, not because anyone stored the word "complete" against it. That
// is what keeps onboarding from becoming a second, competing source of truth.

import type { OnboardingPlan, Status } from "../types";

/**
 * Everything a journey needs from an application. Narrower than `Applicant` on purpose: the
 * demo partner is a synthetic record that satisfies this and nothing more, so the sample
 * portal can never reach into the real dataset.
 */
export interface JourneySubject {
  applicationId: string;
  status: Status;
  onboardingPlan: OnboardingPlan | null;
}
import {
  DOCUMENTS_BY_MILESTONE,
  LAUNCH_AUTHORISATION_TASK,
  MILESTONES,
  STORE_OPENED_TASK,
  TASK_BY_ID,
  TASKS_BY_MILESTONE,
  TOTAL_WEIGHT,
} from "./config";
import type {
  Actor,
  DocumentRecord,
  JourneyProgress,
  JourneyView,
  LaunchReadiness,
  MilestoneKey,
  MilestoneStatus,
  MilestoneView,
} from "./types";

const NOT_SUBMITTED: DocumentRecord = {
  state: "Not submitted",
  at: "",
  note: null,
  fileNameClaimed: null,
};

export function emptyProgress(applicationId: string, isDemo = false): JourneyProgress {
  return { applicationId, tasks: {}, documents: {}, activity: [], siteNotes: null, isDemo };
}

/**
 * The engine's onboarding plan gives real dates for the steps it models. Those steps do not
 * map one-to-one onto these ten milestones, so where a date is borrowed it is flagged as
 * illustrative rather than presented as a commitment the brand has made.
 */
const PLAN_STEP_FOR_MILESTONE: Partial<Record<MilestoneKey, string>> = {
  agreement: "Franchise agreement and fee",
  "site-identification": "Site search",
  "site-inspection": "Site approval and layout sign-off",
  "fit-out": "Fit-out",
  staffing: "Hiring 2-4 staff",
  launch: "Launch, then support check-ins",
};

function dueDateFor(applicant: JourneySubject, key: MilestoneKey): string | null {
  const plan = applicant.onboardingPlan;
  if (!plan) return null;
  const title = PLAN_STEP_FOR_MILESTONE[key];
  if (!title) return null;
  const step = plan.steps.find((s) => s.title.startsWith(title));
  return step?.endDate ?? null;
}

export function buildJourney(applicant: JourneySubject, progress: JourneyProgress): JourneyView {
  const views: MilestoneView[] = [];
  const completeKeys = new Set<MilestoneKey>();

  for (const def of MILESTONES) {
    const taskDefs = TASKS_BY_MILESTONE.get(def.key) ?? [];
    const docDefs = DOCUMENTS_BY_MILESTONE.get(def.key) ?? [];

    const tasks = taskDefs.map((t) => ({ def: t, record: progress.tasks[t.id] ?? null }));
    const documents = docDefs.map((d) => ({
      def: d,
      record: progress.documents[d.id] ?? NOT_SUBMITTED,
    }));

    const blockedBy = def.dependsOn.filter((d) => !completeKeys.has(d));

    const tasksDone = tasks.every((t) => t.record !== null);
    const docsDone = documents.every((d) => !d.def.required || d.record.state === "Accepted");

    // Milestone 1 is not something anyone clicks. It is true exactly when the engine says
    // the application is approved, so the portal cannot show a journey the decision denies.
    const derivedComplete =
      def.key === "approved" ? applicant.status === "APPROVED" : tasksDone && docsDone;

    let status: MilestoneStatus;
    if (derivedComplete) {
      status = "Complete";
    } else if (blockedBy.length > 0) {
      status = "Blocked";
    } else {
      const partnerOutstanding = tasks.filter((t) => t.def.completedBy === "Partner" && !t.record);
      const anyStarted =
        tasks.some((t) => t.record !== null) ||
        documents.some((d) => d.record.state !== "Not submitted");
      if (partnerOutstanding.length === 0 && anyStarted) {
        status = "Awaiting brand verification";
      } else {
        status = anyStarted ? "In progress" : "Not started";
      }
    }

    if (derivedComplete) completeKeys.add(def.key);

    let nextAction: { label: string; owner: Actor } | null = null;
    if (!derivedComplete) {
      const correction = documents.find((d) => d.record.state === "Needs correction");
      const openTask = tasks.find((t) => !t.record);
      const openDoc = documents.find((d) => d.def.required && d.record.state !== "Accepted");
      if (correction) {
        nextAction = { label: `Resubmit ${correction.def.label}`, owner: "Partner" };
      } else if (openTask) {
        nextAction = { label: openTask.def.label, owner: openTask.def.completedBy };
      } else if (openDoc) {
        nextAction = { label: `Submit ${openDoc.def.label}`, owner: "Partner" };
      }
    }

    const dueDate = dueDateFor(applicant, def.key);
    views.push({
      def,
      status,
      tasks,
      documents,
      blockedBy,
      nextAction,
      dueDate,
      dueDateIsIllustrative: dueDate !== null,
    });
  }

  const completedWeight = views
    .filter((v) => v.status === "Complete")
    .reduce((sum, v) => sum + v.def.weight, 0);

  const current = views.find((v) => v.status !== "Complete") ?? null;
  const nextSource = views.find((v) => v.nextAction !== null && v.status !== "Blocked") ?? null;

  return {
    applicationId: applicant.applicationId,
    milestones: views,
    percentComplete: Math.round((completedWeight / TOTAL_WEIGHT) * 100),
    completedWeight,
    totalWeight: TOTAL_WEIGHT,
    current,
    nextAction: nextSource
      ? { ...nextSource.nextAction!, milestone: nextSource.def.key }
      : null,
    launch: launchReadiness(views, progress),
    outstandingDocuments: views
      .flatMap((v) => v.documents)
      .filter((d) => d.record.state !== "Accepted"),
    activity: [...progress.activity].sort((a, b) => (a.at < b.at ? 1 : -1)),
    isDemo: progress.isDemo,
  };
}

/**
 * Launch readiness keeps four things apart on purpose: what the partner has done, what the
 * company has verified, what is still mandatory, and the single authorisation. A partner
 * finishing every one of their own tasks produces "Awaiting brand authorisation" and nothing
 * stronger — completing a personal checklist is not permission to open a store.
 */
function launchReadiness(views: MilestoneView[], progress: JourneyProgress): LaunchReadiness {
  const allTasks = views.flatMap((v) => v.tasks);
  const partnerTasksComplete = allTasks
    .filter((t) => t.def.completedBy === "Partner")
    .every((t) => t.record !== null);

  const brandTasksBeforeLaunch = allTasks.filter(
    (t) =>
      t.def.completedBy === "Brand" &&
      t.def.id !== LAUNCH_AUTHORISATION_TASK &&
      t.def.id !== STORE_OPENED_TASK &&
      t.def.id !== "approved-decision",
  );
  const brandVerificationComplete = brandTasksBeforeLaunch.every((t) => t.record !== null);

  const outstandingMandatory: { label: string; owner: Actor }[] = [];
  for (const t of allTasks) {
    if (t.record === null && t.def.id !== STORE_OPENED_TASK) {
      outstandingMandatory.push({ label: t.def.label, owner: t.def.completedBy });
    }
  }
  for (const v of views) {
    for (const d of v.documents) {
      if (d.def.required && d.record.state !== "Accepted") {
        outstandingMandatory.push({ label: `${d.def.label} (accepted)`, owner: "Partner" });
      }
    }
  }

  const authorised = Boolean(progress.tasks[LAUNCH_AUTHORISATION_TASK]);
  const opened = Boolean(progress.tasks[STORE_OPENED_TASK]);

  let verdict: LaunchReadiness["verdict"];
  if (opened) verdict = "Store opened";
  else if (authorised) verdict = "Authorised to open";
  else if (partnerTasksComplete && brandVerificationComplete) {
    verdict = "Awaiting brand authorisation";
  } else verdict = "Partner work outstanding";

  return {
    partnerTasksComplete,
    brandVerificationComplete,
    outstandingMandatory,
    authorised,
    verdict,
  };
}

/** A partner may only close tasks marked Partner. Enforced in the reducer, not just the UI. */
export function canActorCompleteTask(actor: Actor, taskId: string): boolean {
  if (taskId === "approved-decision") return false;
  const def = TASK_BY_ID.get(taskId);
  return def ? def.completedBy === actor : false;
}

export type OnboardingStageLabel =
  | "Not started"
  | "Agreement"
  | "Site"
  | "Build"
  | "Training"
  | "Launch ready"
  | "Opened";

/** One coarse label per partner, for the command centre's funnel and bottleneck panels. */
export function stageLabel(view: JourneyView): OnboardingStageLabel {
  if (view.launch.verdict === "Store opened") return "Opened";
  if (view.launch.verdict === "Authorised to open") return "Launch ready";
  const current = view.current?.def.key;
  if (!current) return "Launch ready";
  switch (current) {
    case "approved":
    case "agreement":
      return view.completedWeight > 5 ? "Agreement" : "Not started";
    case "site-identification":
    case "site-inspection":
      return "Site";
    case "commercials":
    case "fit-out":
    case "equipment":
      return "Build";
    case "staffing":
      return "Training";
    default:
      return "Launch ready";
  }
}
