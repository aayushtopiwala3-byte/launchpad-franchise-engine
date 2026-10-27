// Illustrative leads, so the acquisition workspace has something in it before anyone types.
//
// Every record here is invented. None of it describes a real person, so the names are
// prefixed, the email domain is `.invalid` (reserved by RFC 2606 — it can never resolve)
// and the phone numbers sit in a block that is not issued to subscribers. `isDemo` is set
// on every one and the UI never unsets it, so a sample lead cannot quietly start looking
// like a real prospect.

import { addDays } from "../engine/onboarding";
import type { Lead } from "./types";

export const DEMO_LEAD_PREFIX = "Sample — ";

interface Spec {
  id: string;
  name: string;
  city: string;
  territoryId: string | null;
  source: Lead["source"];
  stage: Lead["stage"];
  assignedTo: string;
  min: number | null;
  max: number | null;
  years: number | null;
  site: Lead["siteReadiness"];
  channel: Lead["preferredChannel"];
  consent: boolean | null;
  /** Days from the as-of date. Negative is the past. */
  created: number;
  lastInteraction: number | null;
  followUp: number | null;
  notes: string;
  interactions: { at: number; kind: Lead["interactions"][number]["kind"]; summary: string }[];
}

const SPECS: Spec[] = [
  {
    id: "LEAD-001",
    name: "Anjali Rao",
    city: "Mysuru",
    territoryId: "TER-03",
    source: "Website enquiry",
    stage: "Qualified",
    assignedTo: "Priya N",
    min: 30,
    max: 35,
    years: 6,
    site: "Shortlisted",
    channel: "Email",
    consent: true,
    created: -24,
    lastInteraction: -3,
    followUp: 1,
    notes: "Runs two clothing outlets in the same catchment. Wants a Ground-floor unit.",
    interactions: [
      { at: -24, kind: "note", summary: "Enquiry received through the website form." },
      { at: -21, kind: "call", summary: "Introductory call. Walked through the model and fees." },
      { at: -10, kind: "meeting", summary: "Met at the Mysuru store. Saw the layout and range." },
      { at: -3, kind: "email", summary: "Sent the investment breakdown. Asked for two site options." },
    ],
  },
  {
    id: "LEAD-002",
    name: "Ravi Deshpande",
    city: "Hubballi-Dharwad",
    territoryId: "TER-08",
    source: "Referral",
    stage: "Qualification pending",
    assignedTo: "Priya N",
    min: 18,
    max: null,
    years: 2,
    site: "Searching",
    channel: "Phone",
    consent: true,
    created: -15,
    lastInteraction: -8,
    followUp: -2,
    notes: "Referred by an existing partner. Has not confirmed a pin code or a budget ceiling.",
    interactions: [
      { at: -15, kind: "note", summary: "Referred by the Hubballi partner." },
      { at: -8, kind: "call", summary: "Spoke briefly. Asked for the document checklist." },
    ],
  },
  {
    id: "LEAD-003",
    name: "Sneha Kulkarni",
    city: "Bengaluru",
    territoryId: "TER-02",
    source: "Trade expo",
    stage: "Interested",
    assignedTo: "Arun M",
    min: 45,
    max: 60,
    years: 9,
    site: "Secured",
    channel: "WhatsApp",
    consent: true,
    created: -11,
    lastInteraction: -1,
    followUp: 4,
    notes: "Owns a 900 sq ft mall unit. Strong on capital, wants an exclusivity assurance.",
    interactions: [
      { at: -11, kind: "meeting", summary: "Met at the expo stand. Took the brochure." },
      { at: -6, kind: "message", summary: "Sent photographs of the mall unit." },
      { at: -1, kind: "call", summary: "Asked what territory exclusivity actually covers." },
    ],
  },
  {
    id: "LEAD-004",
    name: "Imtiaz Khan",
    city: "Mangaluru",
    territoryId: "TER-07",
    source: "Social media",
    stage: "New",
    assignedTo: "Arun M",
    min: null,
    max: null,
    years: null,
    site: "Not stated",
    channel: null,
    consent: null,
    created: -4,
    lastInteraction: null,
    followUp: null,
    notes: "Form submitted with contact details only.",
    interactions: [],
  },
  {
    id: "LEAD-005",
    name: "Geetha Prasad",
    city: "Tumakuru",
    territoryId: "TER-06",
    source: "Cold outreach",
    stage: "Contacted",
    assignedTo: "Priya N",
    min: 12,
    max: 16,
    years: 1,
    site: "Not started",
    channel: "Phone",
    consent: false,
    created: -30,
    lastInteraction: -18,
    followUp: -6,
    notes: "Asked not to be contacted by email. Budget is below the Tier 3 minimum as stated.",
    interactions: [
      { at: -30, kind: "call", summary: "Cold call. Interested but cautious about the investment." },
      { at: -18, kind: "call", summary: "Follow-up call. Asked for time to arrange funds." },
    ],
  },
  {
    id: "LEAD-006",
    name: "Nikhil Jain",
    city: "Bengaluru",
    territoryId: "TER-01",
    source: "Existing partner",
    stage: "Application invited",
    assignedTo: "Arun M",
    min: 50,
    max: 50,
    years: 11,
    site: "Secured",
    channel: "Email",
    consent: true,
    created: -40,
    lastInteraction: -2,
    followUp: 2,
    notes: "Second store for an existing partner. One declared figure, so nothing to resolve.",
    interactions: [
      { at: -40, kind: "note", summary: "Existing partner asked about a second location." },
      { at: -30, kind: "meeting", summary: "Reviewed the first store's trading figures." },
      { at: -2, kind: "email", summary: "Application link sent." },
    ],
  },
  {
    id: "LEAD-007",
    name: "Pooja Hegde",
    city: "Davanagere",
    territoryId: "TER-05",
    source: "Walk-in",
    stage: "Closed",
    assignedTo: "Priya N",
    min: 8,
    max: 10,
    years: 0,
    site: "Not started",
    channel: "Phone",
    consent: true,
    created: -55,
    lastInteraction: -35,
    followUp: null,
    notes: "Withdrew. Capital well short of the Tier 3 minimum and no premises in view.",
    interactions: [
      { at: -55, kind: "note", summary: "Walked into the Davanagere store and asked about franchising." },
      { at: -45, kind: "call", summary: "Explained the minimum investment for Tier 3." },
      { at: -35, kind: "call", summary: "Withdrew. Said the figure is out of reach this year." },
    ],
  },
];

export function seedDemoLeads(asOfDate: string): Lead[] {
  return SPECS.map((s, i) => ({
    leadId: s.id,
    name: `${DEMO_LEAD_PREFIX}${s.name}`,
    email: `lead${String(i + 1).padStart(3, "0")}@example.invalid`,
    phone: `90000 000${String(i + 1).padStart(2, "0")}`,
    city: s.city,
    preferredTerritoryId: s.territoryId,
    source: s.source,
    assignedTo: s.assignedTo,
    investmentRange: { minLakh: s.min, maxLakh: s.max },
    retailExperienceYears: s.years,
    siteReadiness: s.site,
    stage: s.stage,
    notes: s.notes,
    createdAt: `${addDays(asOfDate, s.created)}T09:00:00.000Z`,
    lastInteractionAt:
      s.lastInteraction === null ? null : `${addDays(asOfDate, s.lastInteraction)}T09:00:00.000Z`,
    nextFollowUpAt: s.followUp === null ? null : `${addDays(asOfDate, s.followUp)}T09:00:00.000Z`,
    consentToContact: s.consent,
    preferredChannel: s.channel,
    linkedApplicationId: null,
    interactions: s.interactions.map((x, j) => ({
      id: `${s.id}-I${j + 1}`,
      at: `${addDays(asOfDate, x.at)}T09:00:00.000Z`,
      kind: x.kind,
      summary: x.summary,
      by: s.assignedTo,
    })),
    isDemo: true,
  }));
}
