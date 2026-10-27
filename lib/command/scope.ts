// Narrowing the command centre.
//
// Pure: no React, no storage, no clock. It takes everything the dashboard reads and returns
// the same shapes with the filtered-out records removed, so every number on the page comes
// from one narrowed set rather than each panel filtering for itself.
//
// Two things matter here.
//
// 1. `counts` is recomputed from the surviving applicants. Carrying the engine's own totals
//    through a filter would put a KPI card at odds with the list it links to, which is the
//    one thing the command centre is not allowed to do.
//
// 2. A facet that cannot narrow a collection is reported, not quietly ignored. An
//    application in this dataset carries no submission date and no acquisition owner, so a
//    date range or an owner cannot say anything about it. The dashboard prints those notes
//    rather than letting a filter look like it applied to everything.

import type { Lead } from "../crm/types";
import type { JourneyView } from "../onboarding/types";
import type {
  Applicant,
  PendingUpdate,
  PipelineResult,
  Status,
  Territory,
} from "../types";
import type { MetricsInput } from "./metrics";

export interface Scope {
  city: string | null;
  territoryId: string | null;
  status: Status | null;
  leadStage: string | null;
  onboardingStage: string | null;
  owner: string | null;
  priority: string | null;
  from: string | null;
  to: string | null;
  query: string;
}

/** The shape the dashboard already holds for each journey. Kept structural so this module
 * does not have to import the React layer that assembles them. */
export interface ScopedRecord {
  profile: {
    applicationId: string;
    partnerName: string;
    city: string;
    territoryId: string | null;
    isDemo: boolean;
  };
  view: JourneyView;
}

export interface ScopeSubject {
  result: PipelineResult;
  leads: Lead[];
  records: ScopedRecord[];
  pendingUpdates: PendingUpdate[];
}

export interface ScopeResult {
  input: MetricsInput;
  territories: Territory[];
  records: ScopedRecord[];
  /** How many of each collection the filters removed. */
  removed: { applicants: number; leads: number; journeys: number; territories: number };
  /** Facets that could not narrow a collection, and why. Shown on the page. */
  notes: string[];
  isNarrowed: boolean;
}

const EMPTY_COUNTS: Record<Status, number> = {
  APPROVED: 0,
  WAITLISTED: 0,
  "ON HOLD": 0,
  REDIRECTED: 0,
  "NOT PROCEEDING": 0,
};

function countsOf(applicants: Applicant[]): Record<Status, number> {
  const counts = { ...EMPTY_COUNTS };
  for (const a of applicants) counts[a.status] += 1;
  return counts;
}

const hit = (haystack: (string | null | undefined)[], needle: string) =>
  haystack.some((h) => (h ?? "").toLowerCase().includes(needle));

/** An absent date is never excluded by a range — the file was silent, which is not "outside". */
function withinRange(iso: string | null, from: string | null, to: string | null): boolean {
  if (!iso) return true;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** Whitespace is not a search. `scopeDashboard` trims the query, so this must agree with it,
 * or the page would announce itself as filtered while nothing had been removed. */
export function isNarrowing(scope: Scope): boolean {
  return Object.entries(scope).some(([k, v]) =>
    k === "query" ? String(v).trim() !== "" : v !== null,
  );
}

export function scopeDashboard(subject: ScopeSubject, scope: Scope): ScopeResult {
  const { result } = subject;
  const q = scope.query.trim().toLowerCase();

  // Territories first: priority lives on a territory, and an applicant inherits it through
  // the territory it was matched to, so the territory set decides what priority can mean.
  const territories = result.territories.filter((t) => {
    if (scope.city && t.city !== scope.city) return false;
    if (scope.territoryId && t.territoryId !== scope.territoryId) return false;
    if (scope.priority && t.priority !== scope.priority) return false;
    return true;
  });
  const territoryIds = new Set(territories.map((t) => t.territoryId));

  const applicants = result.applicants.filter((a) => {
    if (scope.status && a.status !== scope.status) return false;
    if (scope.city && a.normalised.city !== scope.city) return false;
    if (scope.territoryId && a.territoryId !== scope.territoryId) return false;
    // An applicant with no territory cannot be said to sit inside a priority band.
    if (scope.priority && (!a.territoryId || !territoryIds.has(a.territoryId))) return false;
    if (q && !hit([a.applicationId, a.normalised.applicantName, a.normalised.city, a.assignedPin], q)) {
      return false;
    }
    return true;
  });

  const leads = subject.leads.filter((l) => {
    if (scope.city && l.city !== scope.city) return false;
    if (scope.territoryId && l.preferredTerritoryId !== scope.territoryId) return false;
    if (scope.leadStage && l.stage !== scope.leadStage) return false;
    if (scope.owner && l.assignedTo !== scope.owner) return false;
    if (scope.priority && (!l.preferredTerritoryId || !territoryIds.has(l.preferredTerritoryId))) {
      return false;
    }
    if (!withinRange(l.createdAt, scope.from, scope.to)) return false;
    if (q && !hit([l.leadId, l.name, l.city, l.email, l.phone], q)) return false;
    // A decision status describes an application, never a lead, so a status filter removes
    // every lead rather than pretending some of them carry a verdict.
    if (scope.status) return false;
    return true;
  });

  const records = subject.records.filter((r) => {
    if (scope.city && r.profile.city !== scope.city) return false;
    if (scope.territoryId && r.profile.territoryId !== scope.territoryId) return false;
    if (scope.priority && (!r.profile.territoryId || !territoryIds.has(r.profile.territoryId))) {
      return false;
    }
    if (scope.onboardingStage && r.view.current?.def.key !== scope.onboardingStage) return false;
    // Every journey belongs to an approved application, so any other status excludes them all.
    if (scope.status && scope.status !== "APPROVED") return false;
    if (q && !hit([r.profile.applicationId, r.profile.partnerName, r.profile.city], q)) {
      return false;
    }
    if (scope.from || scope.to) {
      const last = r.view.activity[0]?.at ?? null;
      if (!withinRange(last, scope.from, scope.to)) return false;
    }
    return true;
  });

  const keptIds = new Set(applicants.map((a) => a.applicationId));
  const pendingUpdates = subject.pendingUpdates.filter((u) => keptIds.has(u.applicationId));

  const notes: string[] = [];
  if (scope.from || scope.to) {
    notes.push(
      "An application in this dataset carries no submission date, so the date range narrows leads and journey activity only.",
    );
  }
  if (scope.owner) {
    notes.push(
      "An acquisition owner is recorded against a lead, never against an application, so the owner filter narrows leads only.",
    );
  }
  if (scope.status) {
    notes.push(
      `A decision is something only an application has. Leads are excluded while a status filter is set, because no lead carries ${scope.status}.`,
    );
  }
  if (scope.leadStage) {
    notes.push(
      "An acquisition stage belongs to a lead, so applications and journeys are unaffected by it.",
    );
  }

  return {
    input: {
      result: {
        ...result,
        applicants,
        territories,
        counts: countsOf(applicants),
      },
      leads,
      journeys: records.map((r) => r.view),
      pendingUpdates,
    },
    territories,
    records,
    removed: {
      applicants: result.applicants.length - applicants.length,
      leads: subject.leads.length - leads.length,
      journeys: subject.records.length - records.length,
      territories: result.territories.length - territories.length,
    },
    notes,
    isNarrowed: isNarrowing(scope),
  };
}
