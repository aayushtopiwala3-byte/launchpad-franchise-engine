// Acquisition CRM types. A lead is a prospect we are talking to; it is NOT a decision.
// The authoritative verdict on anyone who applies stays with the engine in lib/engine.

export const LEAD_STAGES = [
  "New",
  "Contacted",
  "Interested",
  "Qualification pending",
  "Qualified",
  "Application invited",
  "Application submitted",
  "Converted",
  "Closed",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_SOURCES = [
  "Website enquiry",
  "Referral",
  "Walk-in",
  "Trade expo",
  "Social media",
  "Cold outreach",
  "Existing partner",
  "Other",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export type InteractionKind = "call" | "email" | "meeting" | "message" | "note" | "stage-change";

export interface LeadInteraction {
  id: string;
  at: string;
  kind: InteractionKind;
  summary: string;
  /** Who logged it. Free text — there is no account system to attribute this to. */
  by: string;
}

/**
 * Investment is held as a stated range because a prospect rarely commits to a figure
 * before applying. It is never fed to the engine: the engine reads the application's
 * single declared figure, and a range is not that.
 */
export interface InvestmentRange {
  minLakh: number | null;
  maxLakh: number | null;
}

export type SiteReadiness = "Not started" | "Searching" | "Shortlisted" | "Secured" | "Not stated";

export interface Lead {
  leadId: string;
  name: string;
  /** Contact details are optional: a lead can exist before we have them. */
  email: string | null;
  phone: string | null;
  city: string | null;
  preferredTerritoryId: string | null;
  source: LeadSource;
  /** Free-text owner name. Not an authenticated user. */
  assignedTo: string | null;
  investmentRange: InvestmentRange;
  retailExperienceYears: number | null;
  siteReadiness: SiteReadiness;
  stage: LeadStage;
  notes: string | null;
  createdAt: string;
  lastInteractionAt: string | null;
  nextFollowUpAt: string | null;
  /** Consent to be contacted. Absent means not recorded, which is not the same as refused. */
  consentToContact: boolean | null;
  preferredChannel: "Email" | "Phone" | "WhatsApp" | null;
  /** Set once this lead becomes an application. The engine owns that application. */
  linkedApplicationId: string | null;
  interactions: LeadInteraction[];
  /**
   * True for seeded illustrative records. Never unset by the UI, so a demo lead can
   * never quietly start looking like a real prospect.
   */
  isDemo: boolean;
}

/** A draft produced by AI or by template. Saving one never changes a lead's stage. */
export interface OutreachDraft {
  id: string;
  leadId: string;
  purpose: OutreachPurpose;
  subject: string | null;
  body: string;
  createdAt: string;
  source: "ai" | "template";
}

export const OUTREACH_PURPOSES = [
  "First contact",
  "Follow-up after no response",
  "Request for missing information",
  "Invitation to apply",
  "Request for site details",
  "Meeting confirmation",
  "Next-step summary",
] as const;

export type OutreachPurpose = (typeof OUTREACH_PURPOSES)[number];
