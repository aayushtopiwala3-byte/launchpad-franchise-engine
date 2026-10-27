// Pure lead logic. No React, no storage, no clock — every function that needs "today"
// takes it as an argument, exactly as the engine does, so results are reproducible.

import { CITY_BY_NAME } from "../reference";
import type { RawApplicationRow } from "../types";
import { LEAD_STAGES, type Lead, type LeadStage } from "./types";

export function stageIndex(stage: LeadStage): number {
  return LEAD_STAGES.indexOf(stage);
}

/** Closed is terminal and sits outside the ladder, so it never counts as "progress". */
export function isOpen(lead: Lead): boolean {
  return lead.stage !== "Closed" && lead.stage !== "Converted";
}

export function nextLeadId(existing: Lead[]): string {
  const numbers = existing
    .map((l) => /^LEAD-(\d+)$/.exec(l.leadId)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);
  const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
  return `LEAD-${String(next).padStart(3, "0")}`;
}

export interface LeadDraft {
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Indian mobile numbers, optionally with a +91 or 0 prefix and spaces or dashes inside.
const PHONE = /^(?:\+?91[-\s]?|0)?[6-9]\d{9}$/;

export function validateLead(draft: LeadDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!draft.name?.trim()) {
    issues.push({ field: "name", message: "A lead needs a name." });
  }
  const email = draft.email?.trim();
  if (email && !EMAIL.test(email)) {
    issues.push({ field: "email", message: "That does not look like an email address." });
  }
  const phone = draft.phone?.trim();
  if (phone && !PHONE.test(phone.replace(/[\s-]/g, ""))) {
    issues.push({ field: "phone", message: "That does not look like an Indian mobile number." });
  }
  const city = draft.city?.trim();
  if (city && !CITY_BY_NAME.has(city)) {
    // A warning, not a block: we take the lead and flag the city rather than lose them.
    issues.push({
      field: "city",
      message: `${city} is not a city we operate in. The lead can still be recorded.`,
    });
  }
  return issues;
}

export function blockingIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => i.field !== "city");
}

const normalise = (v: string | null | undefined) => v?.trim().toLowerCase() ?? "";
const digits = (v: string | null | undefined) => v?.replace(/\D/g, "").slice(-10) ?? "";

/**
 * Same person, already in the pipeline? Email and phone are strong signals; name plus
 * city is weak, so it is reported as a possible match for a human to judge rather than
 * silently blocked.
 */
export function findDuplicates(
  leads: Lead[],
  draft: LeadDraft,
): { lead: Lead; on: "email" | "phone" | "name and city"; strong: boolean }[] {
  const email = normalise(draft.email);
  const phone = digits(draft.phone);
  const name = normalise(draft.name);
  const city = normalise(draft.city);
  const out: { lead: Lead; on: "email" | "phone" | "name and city"; strong: boolean }[] = [];
  for (const lead of leads) {
    if (email && normalise(lead.email) === email) {
      out.push({ lead, on: "email", strong: true });
    } else if (phone && digits(lead.phone) === phone) {
      out.push({ lead, on: "phone", strong: true });
    } else if (name && normalise(lead.name) === name && city && normalise(lead.city) === city) {
      out.push({ lead, on: "name and city", strong: false });
    }
  }
  return out;
}

export type FollowUpState = "overdue" | "due today" | "scheduled" | "none";

export function followUpState(lead: Lead, asOfDate: string): FollowUpState {
  if (!lead.nextFollowUpAt) return "none";
  const due = lead.nextFollowUpAt.slice(0, 10);
  if (due < asOfDate) return "overdue";
  if (due === asOfDate) return "due today";
  return "scheduled";
}

export interface Workload {
  dueToday: Lead[];
  overdue: Lead[];
  uncontacted: Lead[];
  awaitingApplicantInfo: Lead[];
  qualifiedWithoutNextAction: Lead[];
}

export function workload(leads: Lead[], asOfDate: string): Workload {
  const open = leads.filter(isOpen);
  return {
    dueToday: open.filter((l) => followUpState(l, asOfDate) === "due today"),
    overdue: open.filter((l) => followUpState(l, asOfDate) === "overdue"),
    uncontacted: open.filter((l) => l.stage === "New" && l.interactions.length === 0),
    awaitingApplicantInfo: open.filter((l) => l.stage === "Qualification pending"),
    qualifiedWithoutNextAction: open.filter(
      (l) => l.stage === "Qualified" && !l.nextFollowUpAt,
    ),
  };
}

/**
 * What a lead can contribute to an application, and what it cannot.
 *
 * The engine reads `RawApplicationRow`. A lead holds a subset of those fields and holds
 * some of them in a shape the engine does not accept — an investment *range* is not an
 * investment figure. Rather than pick a number out of the range, the range is reported
 * as missing and the applicant is asked. Inventing the midpoint would be exactly the
 * fabrication the engine refuses everywhere else.
 */
export interface HandoffPlan {
  prefill: Partial<RawApplicationRow>;
  missing: { field: string; label: string; why: string }[];
}

export function handoffPlan(lead: Lead): HandoffPlan {
  const prefill: Partial<RawApplicationRow> = {
    applicantName: lead.name,
    city: lead.city ?? "",
    currentBusiness: "",
    notes: lead.notes ?? "",
  };
  if (lead.retailExperienceYears !== null) {
    prefill.retailExperienceYears = String(lead.retailExperienceYears);
  }
  if (lead.siteReadiness === "Secured") prefill.spaceAvailable = "Rented";
  if (lead.siteReadiness === "Not started" || lead.siteReadiness === "Searching") {
    prefill.spaceAvailable = "Not yet identified";
  }

  const missing: HandoffPlan["missing"] = [];
  const { minLakh, maxLakh } = lead.investmentRange;
  if (minLakh !== null && maxLakh !== null && minLakh !== maxLakh) {
    missing.push({
      field: "investmentLakh",
      label: "Investment capacity (rupees lakh)",
      why: `The lead states a range of ${minLakh}–${maxLakh} lakh. The rules need one declared figure, and picking a point inside a range would be inventing it.`,
    });
  } else if (minLakh === null && maxLakh === null) {
    missing.push({
      field: "investmentLakh",
      label: "Investment capacity (rupees lakh)",
      why: "No investment figure was recorded against the lead.",
    });
  } else {
    prefill.investmentLakh = String(maxLakh ?? minLakh);
  }

  if (!lead.city) {
    missing.push({ field: "city", label: "City", why: "No city was recorded against the lead." });
  }
  missing.push({
    field: "pinCode",
    label: "Pin code",
    why: "A lead records a city, never a pin code, and the territory is matched by pin.",
  });
  if (lead.retailExperienceYears === null) {
    missing.push({
      field: "retailExperienceYears",
      label: "Retail experience (years)",
      why: "Not recorded against the lead.",
    });
  }
  for (const [field, label] of [
    ["spaceSizeSqft", "Space size (sq ft)"],
    ["floor", "Floor"],
    ["targetLaunchMonths", "Target launch (months)"],
  ] as const) {
    missing.push({ field, label, why: "A lead does not capture this; the application form does." });
  }
  return { prefill, missing };
}

/** A lead is linkable to an application only once, and only to one that exists. */
export function canLink(
  lead: Lead,
  applicationId: string,
  leads: Lead[],
  knownApplicationIds: Set<string>,
): { ok: true } | { ok: false; reason: string } {
  if (lead.linkedApplicationId) {
    return {
      ok: false,
      reason: `${lead.leadId} is already linked to ${lead.linkedApplicationId}.`,
    };
  }
  if (!knownApplicationIds.has(applicationId)) {
    return { ok: false, reason: `${applicationId} is not in the loaded dataset.` };
  }
  const taken = leads.find((l) => l.linkedApplicationId === applicationId);
  if (taken) {
    return { ok: false, reason: `${applicationId} is already linked to ${taken.leadId}.` };
  }
  return { ok: true };
}

export interface StageCount {
  stage: LeadStage;
  count: number;
}

export function stageCounts(leads: Lead[]): StageCount[] {
  return LEAD_STAGES.map((stage) => ({
    stage,
    count: leads.filter((l) => l.stage === stage).length,
  }));
}
