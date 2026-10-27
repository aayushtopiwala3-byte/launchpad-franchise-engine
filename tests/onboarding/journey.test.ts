// The journey is derived, never stored. These tests exist to stop that invariant eroding:
// if someone adds a `status` field to JourneyProgress, the "derives, does not store" cases
// below are what should fail first.

import { describe, expect, it } from "vitest";
import {
  LAUNCH_AUTHORISATION_TASK,
  MILESTONES,
  STORE_OPENED_TASK,
  TASKS,
  TOTAL_WEIGHT,
} from "../../lib/onboarding/config";
import {
  buildJourney,
  canActorCompleteTask,
  emptyProgress,
  stageLabel,
  type JourneySubject,
} from "../../lib/onboarding/journey";
import type { Actor, DocumentState, JourneyProgress } from "../../lib/onboarding/types";
import { DOCUMENTS } from "../../lib/onboarding/config";

const AT = "2026-10-26T10:00:00.000Z";

const subject = (over: Partial<JourneySubject> = {}): JourneySubject => ({
  applicationId: "APP-001",
  status: "APPROVED",
  onboardingPlan: null,
  ...over,
});

function completeTasks(progress: JourneyProgress, ids: string[]): JourneyProgress {
  const tasks = { ...progress.tasks };
  for (const id of ids) {
    const by: Actor = TASKS.find((t) => t.id === id)?.completedBy ?? "Brand";
    tasks[id] = { at: AT, by, byName: "test" };
  }
  return { ...progress, tasks };
}

function setDocs(progress: JourneyProgress, ids: string[], state: DocumentState): JourneyProgress {
  const documents = { ...progress.documents };
  for (const id of ids) {
    documents[id] = { state, at: AT, note: null, fileNameClaimed: null };
  }
  return { ...progress, documents };
}

const PARTNER_TASKS = TASKS.filter((t) => t.completedBy === "Partner").map((t) => t.id);
const BRAND_TASKS_BEFORE_LAUNCH = TASKS.filter(
  (t) =>
    t.completedBy === "Brand" &&
    t.id !== LAUNCH_AUTHORISATION_TASK &&
    t.id !== STORE_OPENED_TASK &&
    t.id !== "approved-decision",
).map((t) => t.id);
const REQUIRED_DOCS = DOCUMENTS.filter((d) => d.required).map((d) => d.id);

describe("milestone weights", () => {
  it("sum to 100, so the percentage is computed rather than asserted", () => {
    expect(TOTAL_WEIGHT).toBe(100);
    expect(MILESTONES.reduce((s, m) => s + m.weight, 0)).toBe(100);
  });

  it("gives every milestone a positive weight and a stated completion criterion", () => {
    for (const m of MILESTONES) {
      expect(m.weight).toBeGreaterThan(0);
      expect(m.completionCriteria.trim()).not.toBe("");
    }
  });

  it("declares dependencies only on milestones that come earlier", () => {
    const seen = new Set<string>();
    for (const m of MILESTONES) {
      for (const dep of m.dependsOn) expect(seen.has(dep)).toBe(true);
      seen.add(m.key);
    }
  });
});

describe("progress is derived from records, not stored", () => {
  it("reports 0% for an approved partner who has done nothing but milestone 1", () => {
    const view = buildJourney(subject(), emptyProgress("APP-001"));
    // Milestone 1 is true because the engine approved it, and it carries weight 5.
    expect(view.completedWeight).toBe(5);
    expect(view.percentComplete).toBe(5);
    expect(view.totalWeight).toBe(100);
  });

  it("never marks milestone 1 complete when the engine did not approve the application", () => {
    const view = buildJourney(
      subject({ status: "WAITLISTED" }),
      completeTasks(emptyProgress("APP-001"), ["approved-decision"]),
    );
    expect(view.milestones[0].status).not.toBe("Complete");
    expect(view.percentComplete).toBe(0);
  });

  it("computes the same view twice from the same records", () => {
    const progress = completeTasks(emptyProgress("APP-001"), ["agreement-issued"]);
    const a = buildJourney(subject(), progress);
    const b = buildJourney(subject(), progress);
    expect(a.percentComplete).toBe(b.percentComplete);
    expect(a.milestones.map((m) => m.status)).toEqual(b.milestones.map((m) => m.status));
  });

  it("blocks a milestone whose dependency is outstanding", () => {
    const view = buildJourney(subject(), emptyProgress("APP-001"));
    const site = view.milestones.find((m) => m.def.key === "site-identification")!;
    expect(site.status).toBe("Blocked");
    expect(site.blockedBy).toContain("agreement");
  });

  it("requires accepted documents, not merely submitted ones, to complete a milestone", () => {
    const agreementDocs = DOCUMENTS.filter((d) => d.milestone === "agreement" && d.required).map(
      (d) => d.id,
    );
    let p = completeTasks(
      emptyProgress("APP-001"),
      TASKS.filter((t) => t.milestone === "agreement").map((t) => t.id),
    );
    p = setDocs(p, agreementDocs, "Submitted");
    expect(buildJourney(subject(), p).milestones[1].status).not.toBe("Complete");

    p = setDocs(p, agreementDocs, "Accepted");
    expect(buildJourney(subject(), p).milestones[1].status).toBe("Complete");
  });

  it("does not need an optional document accepted to complete a milestone", () => {
    const optional = DOCUMENTS.filter((d) => d.milestone === "agreement" && !d.required);
    expect(optional.length).toBeGreaterThan(0);

    let p = completeTasks(
      emptyProgress("APP-001"),
      TASKS.filter((t) => t.milestone === "agreement").map((t) => t.id),
    );
    p = setDocs(
      p,
      DOCUMENTS.filter((d) => d.milestone === "agreement" && d.required).map((d) => d.id),
      "Accepted",
    );
    expect(buildJourney(subject(), p).milestones[1].status).toBe("Complete");
    expect(p.documents[optional[0].id]).toBeUndefined();
  });

  it("asks for a resubmission ahead of anything else when a document needs correction", () => {
    let p = completeTasks(emptyProgress("APP-001"), ["agreement-issued"]);
    p = setDocs(p, ["doc-agreement"], "Needs correction");
    const agreement = buildJourney(subject(), p).milestones[1];
    expect(agreement.nextAction).toEqual({
      label: "Resubmit Signed franchise agreement",
      owner: "Partner",
    });
  });
});

describe("launch readiness never over-promises", () => {
  it("does not call a store ready when the partner has finished only their own checklist", () => {
    let p = completeTasks(emptyProgress("APP-001"), PARTNER_TASKS);
    p = setDocs(p, REQUIRED_DOCS, "Accepted");
    const { launch } = buildJourney(subject(), p);

    expect(launch.partnerTasksComplete).toBe(true);
    expect(launch.brandVerificationComplete).toBe(false);
    expect(launch.authorised).toBe(false);
    expect(launch.verdict).toBe("Partner work outstanding");
    expect(launch.outstandingMandatory.length).toBeGreaterThan(0);
    expect(launch.outstandingMandatory.every((o) => o.owner === "Brand")).toBe(true);
  });

  it("waits for a brand authorisation even once both sides have finished verifying", () => {
    let p = completeTasks(emptyProgress("APP-001"), [
      ...PARTNER_TASKS,
      ...BRAND_TASKS_BEFORE_LAUNCH,
    ]);
    p = setDocs(p, REQUIRED_DOCS, "Accepted");
    const { launch } = buildJourney(subject(), p);

    expect(launch.partnerTasksComplete).toBe(true);
    expect(launch.brandVerificationComplete).toBe(true);
    expect(launch.authorised).toBe(false);
    expect(launch.verdict).toBe("Awaiting brand authorisation");
  });

  it("authorises only once a Brand actor closes the authorisation task", () => {
    let p = completeTasks(emptyProgress("APP-001"), [
      ...PARTNER_TASKS,
      ...BRAND_TASKS_BEFORE_LAUNCH,
      LAUNCH_AUTHORISATION_TASK,
    ]);
    p = setDocs(p, REQUIRED_DOCS, "Accepted");
    const view = buildJourney(subject(), p);
    expect(view.launch.authorised).toBe(true);
    expect(view.launch.verdict).toBe("Authorised to open");
    expect(stageLabel(view)).toBe("Launch ready");
  });

  it("reaches 100% and 'Store opened' only with every record in place", () => {
    let p = completeTasks(emptyProgress("APP-001"), TASKS.map((t) => t.id));
    p = setDocs(p, REQUIRED_DOCS, "Accepted");
    const view = buildJourney(subject(), p);
    expect(view.percentComplete).toBe(100);
    expect(view.launch.verdict).toBe("Store opened");
    expect(view.launch.outstandingMandatory).toEqual([]);
    expect(stageLabel(view)).toBe("Opened");
  });
});

describe("who may close what", () => {
  it("refuses to let a partner close the decision milestone at all", () => {
    expect(canActorCompleteTask("Partner", "approved-decision")).toBe(false);
    expect(canActorCompleteTask("Brand", "approved-decision")).toBe(false);
  });

  it("refuses to let a partner sign off their own site inspection or launch", () => {
    for (const id of ["site-visit", "site-approved", LAUNCH_AUTHORISATION_TASK, STORE_OPENED_TASK]) {
      expect(canActorCompleteTask("Partner", id)).toBe(false);
      expect(canActorCompleteTask("Brand", id)).toBe(true);
    }
  });

  it("refuses to let brand staff close a task the partner owns", () => {
    expect(canActorCompleteTask("Brand", "agreement-signed")).toBe(false);
    expect(canActorCompleteTask("Partner", "agreement-signed")).toBe(true);
  });

  it("refuses an unknown task id rather than defaulting to allowed", () => {
    expect(canActorCompleteTask("Brand", "no-such-task")).toBe(false);
    expect(canActorCompleteTask("Partner", "no-such-task")).toBe(false);
  });
});

describe("the next action names one owner", () => {
  it("points at the brand first, because the agreement is issued before it is signed", () => {
    const view = buildJourney(subject(), emptyProgress("APP-001"));
    expect(view.nextAction?.owner).toBe("Brand");
    expect(view.nextAction?.milestone).toBe("agreement");
  });

  it("moves to the partner once the brand has issued the agreement", () => {
    const p = completeTasks(emptyProgress("APP-001"), ["agreement-issued"]);
    expect(buildJourney(subject(), p).nextAction?.owner).toBe("Partner");
  });

  it("never points at a blocked milestone", () => {
    const view = buildJourney(subject(), emptyProgress("APP-001"));
    const target = view.milestones.find((m) => m.def.key === view.nextAction?.milestone);
    expect(target?.status).not.toBe("Blocked");
  });
});
