// Sorting a lead list, and arranging one as a pipeline board.
//
// Pure: no React, no storage, no clock — the as-of date is passed in like everywhere else.
//
// Two decisions are load-bearing.
//
// 1. A value the file never stated sorts to the bottom in BOTH directions. The alternative
//    is to treat an absent figure as zero or an absent date as the earliest one, which puts
//    a "not stated" row at the top of "lowest first" and makes a silence look like an answer.
//
// 2. A stated investment range stays a range. The column orders by the lowest figure the
//    lead actually stated, and the header says so, rather than collapsing 20–40 to 30.

import { LEAD_STAGES, type Lead, type LeadStage } from "./types";
import { followUpState } from "./leads";

export type SortKey =
  | "name"
  | "city"
  | "stage"
  | "owner"
  | "investment"
  | "site"
  | "followUp"
  | "created";

export type SortDirection = "asc" | "desc";

export interface Sort {
  key: SortKey;
  direction: SortDirection;
}

export const SORT_LABELS: Record<SortKey, string> = {
  name: "Lead",
  city: "City",
  stage: "Stage",
  owner: "Owner",
  investment: "Investment stated",
  site: "Site",
  followUp: "Next follow-up",
  created: "Added",
};

/** What the column actually orders by, shown to the reader so an ordering is never a mystery. */
export const SORT_BASIS: Record<SortKey, string> = {
  name: "Alphabetical by the name recorded.",
  city: "Alphabetical by city. A lead with no city recorded sorts last.",
  stage: "Pipeline order, from New through to Closed.",
  owner: "Alphabetical by owner. An unassigned lead sorts last.",
  investment:
    "By the lowest figure the lead stated. A range stays a range — no midpoint is invented — and a lead that stated nothing sorts last.",
  site: "By how far the site search has got, least advanced first. Not stated sorts last.",
  followUp: "By the date next scheduled. A lead with nothing scheduled sorts last.",
  created: "By the date the lead was recorded.",
};

const SITE_ORDER = ["Not stated", "Not started", "Searching", "Shortlisted", "Secured"];

/** Rank inside a sort, with `null` meaning "the file was silent" rather than a low value. */
type Rank = { value: string | number | null };

function rankOf(lead: Lead, key: SortKey): Rank {
  switch (key) {
    case "name":
      return { value: lead.name.trim().toLowerCase() || null };
    case "city":
      return { value: lead.city?.trim().toLowerCase() || null };
    case "stage":
      return { value: LEAD_STAGES.indexOf(lead.stage) };
    case "owner":
      return { value: lead.assignedTo?.trim().toLowerCase() || null };
    case "investment": {
      const { minLakh, maxLakh } = lead.investmentRange;
      return { value: minLakh ?? maxLakh ?? null };
    }
    case "site": {
      const i = SITE_ORDER.indexOf(lead.siteReadiness);
      return { value: i === -1 || lead.siteReadiness === "Not stated" ? null : i };
    }
    case "followUp":
      return { value: lead.nextFollowUpAt ?? null };
    case "created":
      return { value: lead.createdAt ?? null };
  }
}

function compare(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Stable: equal rows keep the order they arrived in, so flipping a direction twice returns
 * the list you started with rather than a reshuffled one.
 */
export function sortLeads(leads: Lead[], sort: Sort): Lead[] {
  return leads
    .map((lead, index) => ({ lead, index, rank: rankOf(lead, sort.key) }))
    .sort((x, y) => {
      const a = x.rank.value;
      const b = y.rank.value;
      // Unstated last in both directions — a silence is not a small number.
      if (a === null && b === null) return x.index - y.index;
      if (a === null) return 1;
      if (b === null) return -1;
      const c = compare(a, b);
      if (c !== 0) return sort.direction === "asc" ? c : -c;
      return x.index - y.index;
    })
    .map((r) => r.lead);
}

/** Clicking the column you are already sorting by flips it; any other column starts ascending. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

export interface BoardColumn {
  stage: LeadStage;
  leads: Lead[];
  /** Of the leads in this column, how many have a follow-up already past the as-of date. */
  overdue: number;
  /** True for the two stages that take a lead out of everybody's working queue. */
  isClosedStage: boolean;
}

/**
 * Every stage gets a column, including the empty ones: a pipeline with a stage missing reads
 * as though nothing ever sits there, which is a different claim from "nothing sits there now".
 */
export function boardColumns(leads: Lead[], asOfDate: string): BoardColumn[] {
  return LEAD_STAGES.map((stage) => {
    const inStage = leads.filter((l) => l.stage === stage);
    return {
      stage,
      leads: inStage,
      overdue: inStage.filter((l) => followUpState(l, asOfDate) === "overdue").length,
      isClosedStage: stage === "Closed" || stage === "Converted",
    };
  });
}

export type MoveCheck = { ok: true } | { ok: false; reason: string };

/**
 * A stage records how far a conversation has got, so a person may move it anywhere — forwards,
 * backwards, or straight to Closed. The one thing a drag cannot do is manufacture a link to an
 * application, because only the engine ever sees an application.
 */
export function canMoveTo(lead: Lead, stage: LeadStage): MoveCheck {
  if (lead.stage === stage) return { ok: false, reason: `Already at ${stage}.` };
  if (stage === "Converted" && !lead.linkedApplicationId) {
    return {
      ok: false,
      reason:
        "Converted means this lead became an application the engine has read. Use the handover on the lead page to link one — moving the card cannot create it.",
    };
  }
  if (lead.linkedApplicationId && stage !== "Converted") {
    return {
      ok: false,
      reason: `This lead is already linked to ${lead.linkedApplicationId}, so its conversation is finished. Reopening it would leave two records claiming the same prospect.`,
    };
  }
  return { ok: true };
}
