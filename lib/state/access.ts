// Who may write what.
//
// Pure: no React, no storage, no clock. The store imports it and refuses an action the
// current role has no capability for, in the reducer — the same place the onboarding actor
// rule already lives. That matters more than it sounds: a rule that only hides a button is
// not a rule, it is a suggestion, and the brief says so explicitly.
//
// What this IS: a real check at the point the data is written, so a mistaken click in the
// wrong workspace cannot alter a record that workspace does not own.
//
// What this is NOT: authentication. There are no accounts and no server in this build. The
// role is a value in this browser. Anyone looking at the page can change it, exactly as they
// could edit the stored JSON directly. ACCESS_LIMITATION below says so on the page rather
// than letting the control imply a security boundary that does not exist.

import type { Actor } from "../onboarding/types";

export const ROLES = ["Expansion team", "Franchise partner"] as const;
export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = "Expansion team";

export type Capability =
  /** Load, replace or clear the dataset the engine reads. */
  | "dataset"
  /** Change thresholds, feature flags or anything that moves a verdict. */
  | "policy"
  /** Create, edit, move or correspond with an acquisition lead. */
  | "leads"
  /** Answer a partner's proposed change — accept it into the dataset or decline it. */
  | "answer-update"
  /** Record onboarding progress: tasks, documents, site notes. */
  | "onboarding";

const GRANTS: Record<Role, Capability[]> = {
  // The expansion side runs the pipeline and the acquisition desk, and records the brand's
  // own onboarding steps. The task-level rule still stops it closing a partner's task.
  "Expansion team": ["dataset", "policy", "leads", "answer-update", "onboarding"],
  // A partner works their own journey. They may not load a workbook, move a threshold,
  // touch somebody else's lead, or answer their own request for a change.
  "Franchise partner": ["onboarding"],
};

export const ROLE_SUMMARY: Record<Role, string> = {
  "Expansion team":
    "Runs the pipeline: loads the workbook, edits policy, works the acquisition desk and records the brand's side of every onboarding.",
  "Franchise partner":
    "Works their own onboarding only. Cannot load data, change a threshold, open the acquisition desk, or answer their own request for a correction.",
};

/** The onboarding actor a role acts as. The task rule is separate and still applies on top. */
export const ACTOR_FOR_ROLE: Record<Role, Actor> = {
  "Expansion team": "Brand",
  "Franchise partner": "Partner",
};

const CAPABILITY_VERBS: Record<Capability, string> = {
  dataset: "load or clear the dataset",
  policy: "change policy or feature flags",
  leads: "change an acquisition lead",
  "answer-update": "answer a proposed change to an application",
  onboarding: "record onboarding progress",
};

export function can(role: Role, capability: Capability): boolean {
  return GRANTS[role].includes(capability);
}

export function deniedReason(role: Role, capability: Capability): string | null {
  if (can(role, capability)) return null;
  return `The ${role} role cannot ${CAPABILITY_VERBS[capability]}. Switch role to act on this.`;
}

/**
 * Which capability each kind of write needs. Kept here rather than in the store so it can be
 * read and tested without a React tree, and so there is one list to check against rather than
 * a condition scattered through a reducer.
 *
 * An action absent from this map needs no capability. That is deliberate for reading, logging,
 * chatting, hydration, and a partner submitting a proposed change to their own application —
 * refusing to record that something happened would make the event log lie.
 */
export const REQUIRED_CAPABILITY: Record<string, Capability> = {
  dataset: "dataset",
  result: "dataset",
  reset: "dataset",
  "demo:seed": "dataset",
  "demo:clear": "dataset",
  policy: "policy",
  profiles: "policy",
  flags: "policy",
  override: "policy",
  removeOverride: "policy",
  "lead:add": "leads",
  "lead:update": "leads",
  "lead:interaction": "leads",
  "outreach:save": "leads",
  resolvePendingUpdate: "answer-update",
  "journey:task": "onboarding",
  "journey:document": "onboarding",
  "journey:siteNotes": "onboarding",
};

/** Null when the write may proceed; otherwise the sentence to show the person who tried. */
export function guardAction(role: Role, actionType: string): string | null {
  const needs = REQUIRED_CAPABILITY[actionType];
  return needs ? deniedReason(role, needs) : null;
}

export const ACCESS_LIMITATION =
  "This role is a setting in your browser, not an account. There is no authentication in this build — no login, no server, no identity provider — so anyone who can open this page can change the role, and all records live in this browser's own storage. The rules are enforced where data is written rather than by hiding controls, which stops a wrong-workspace click from altering a record that workspace does not own. It does not stop someone who wants to get around it. Production use needs a real identity provider and a server that re-checks every write.";
