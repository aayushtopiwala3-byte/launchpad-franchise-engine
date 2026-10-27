// The configured journey: ten milestones, their tasks and their documents.
//
// This is configuration, not a rule the case study mandates. It is kept in one file so an
// expansion team can see the whole sequence, the weights behind the progress figure and
// which steps only company staff may close.

import type { DocumentDef, MilestoneDef, MilestoneKey, TaskDef } from "./types";

export const MILESTONES: MilestoneDef[] = [
  {
    key: "approved",
    number: 1,
    title: "Application approved",
    description:
      "The decision engine approved the application and reserved a pin code in the territory.",
    owner: "Brand",
    weight: 5,
    dependsOn: [],
    completionCriteria: "The engine's status for this application is APPROVED.",
  },
  {
    key: "agreement",
    number: 2,
    title: "Agreement and documentation",
    description:
      "Franchise agreement issued, signed and returned, with the partner's KYC on file.",
    owner: "Partner",
    weight: 12,
    dependsOn: ["approved"],
    completionCriteria: "Every mandatory document is accepted and the signed agreement is logged.",
  },
  {
    key: "site-identification",
    number: 3,
    title: "Site identification",
    description:
      "The partner shortlists premises inside the allocated pin code and sends the details.",
    owner: "Partner",
    weight: 10,
    dependsOn: ["agreement"],
    completionCriteria: "At least one site has been submitted with size, floor and rent.",
  },
  {
    key: "site-inspection",
    number: 4,
    title: "Site inspection and approval",
    description:
      "Company staff visit the shortlisted site, check the catchment and approve or reject it.",
    owner: "Brand",
    weight: 12,
    dependsOn: ["site-identification"],
    completionCriteria:
      "A Brand user records the visit and the approval. The partner cannot close this.",
  },
  {
    key: "commercials",
    number: 5,
    title: "Investment and commercial terms",
    description: "Franchise fee settled, lease signed and the fit-out budget agreed.",
    owner: "Partner",
    weight: 10,
    dependsOn: ["site-inspection"],
    completionCriteria: "Fee receipt and signed lease are on file and the budget is agreed.",
  },
  {
    key: "fit-out",
    number: 6,
    title: "Fit-out and build",
    description: "Civil work, shopfront, signage and lighting to brand standard.",
    owner: "Partner",
    weight: 13,
    dependsOn: ["commercials"],
    completionCriteria: "Fit-out finished and electrical and fire clearances obtained.",
  },
  {
    key: "equipment",
    number: 7,
    title: "Equipment and systems",
    description: "Fixtures, billing counter, POS hardware and the opening stock plan.",
    owner: "Partner",
    weight: 10,
    dependsOn: ["fit-out"],
    completionCriteria: "POS is installed and tested and the stock order is placed.",
  },
  {
    key: "staffing",
    number: 8,
    title: "Staff hiring and training",
    description:
      "Two to four staff hired and put through the brand's training programme at the nearest store.",
    owner: "Partner",
    weight: 13,
    dependsOn: ["equipment"],
    completionCriteria:
      "Staff are hired and every training module is marked complete by a Brand trainer.",
  },
  {
    key: "readiness-review",
    number: 9,
    title: "Final readiness review",
    description: "Company staff carry out the pre-opening audit against the launch checklist.",
    owner: "Brand",
    weight: 10,
    dependsOn: ["staffing"],
    completionCriteria: "A Brand user records the audit result. The partner cannot close this.",
  },
  {
    key: "launch",
    number: 10,
    title: "Launch",
    description: "Authorisation to open, the opening itself, then the day 7, 30 and 90 check-ins.",
    owner: "Brand",
    weight: 5,
    dependsOn: ["readiness-review"],
    completionCriteria: "A Brand user authorises the opening and then records that the store opened.",
  },
];

export const MILESTONE_BY_KEY = new Map<MilestoneKey, MilestoneDef>(
  MILESTONES.map((m) => [m.key, m]),
);

export const TOTAL_WEIGHT = MILESTONES.reduce((sum, m) => sum + m.weight, 0);

/** The single task that authorises an opening. Brand only, and nothing else grants it. */
export const LAUNCH_AUTHORISATION_TASK = "launch-authorise";
export const STORE_OPENED_TASK = "launch-opened";

export const TASKS: TaskDef[] = [
  {
    id: "approved-decision",
    milestone: "approved",
    label: "Decision issued by the engine",
    completedBy: "Brand",
    help: "Derived from the application's status. It is not a button.",
  },
  {
    id: "agreement-issued",
    milestone: "agreement",
    label: "Franchise agreement issued to the partner",
    completedBy: "Brand",
    help: null,
  },
  {
    id: "agreement-signed",
    milestone: "agreement",
    label: "Signed agreement returned",
    completedBy: "Partner",
    help: "Mark this once you have sent the signed copy back.",
  },
  {
    id: "agreement-kyc",
    milestone: "agreement",
    label: "KYC pack sent",
    completedBy: "Partner",
    help: "PAN, Aadhaar, GST certificate and six months of bank statements.",
  },
  {
    id: "site-shortlist",
    milestone: "site-identification",
    label: "Three shortlisted sites sent with photographs and rent figures",
    completedBy: "Partner",
    help: null,
  },
  {
    id: "site-details",
    milestone: "site-identification",
    label: "Size, floor and frontage recorded for the preferred site",
    completedBy: "Partner",
    help: "Entered in the site readiness panel.",
  },
  {
    id: "site-visit",
    milestone: "site-inspection",
    label: "Site visit carried out by the expansion team",
    completedBy: "Brand",
    help: "Company staff only.",
  },
  {
    id: "site-approved",
    milestone: "site-inspection",
    label: "Site approved in writing",
    completedBy: "Brand",
    help: "Company staff only. A partner cannot approve their own site.",
  },
  {
    id: "commercials-fee",
    milestone: "commercials",
    label: "Franchise fee settled",
    completedBy: "Partner",
    help: null,
  },
  {
    id: "commercials-lease",
    milestone: "commercials",
    label: "Lease signed",
    completedBy: "Partner",
    help: null,
  },
  {
    id: "commercials-budget",
    milestone: "commercials",
    label: "Fit-out budget agreed with the brand",
    completedBy: "Brand",
    help: null,
  },
  {
    id: "fitout-civil",
    milestone: "fit-out",
    label: "Civil work and flooring finished",
    completedBy: "Partner",
    help: null,
  },
  {
    id: "fitout-front",
    milestone: "fit-out",
    label: "Shopfront, signage and lighting to brand standard",
    completedBy: "Partner",
    help: null,
  },
  {
    id: "fitout-clearance",
    milestone: "fit-out",
    label: "Electrical and fire safety clearance obtained",
    completedBy: "Partner",
    help: null,
  },
  {
    id: "equipment-fixtures",
    milestone: "equipment",
    label: "Fixtures and shelving installed",
    completedBy: "Partner",
    help: null,
  },
  {
    id: "equipment-pos",
    milestone: "equipment",
    label: "Billing counter and POS hardware installed and tested",
    completedBy: "Partner",
    help: null,
  },
  {
    id: "equipment-stock",
    milestone: "equipment",
    label: "Opening stock order placed",
    completedBy: "Brand",
    help: null,
  },
  {
    id: "staff-hired",
    milestone: "staffing",
    label: "Two to four staff hired",
    completedBy: "Partner",
    help: null,
  },
  {
    id: "staff-training-booked",
    milestone: "staffing",
    label: "Training dates confirmed at the nearest store",
    completedBy: "Partner",
    help: null,
  },
  {
    id: "staff-training-complete",
    milestone: "staffing",
    label: "Training completed and signed off by the trainer",
    completedBy: "Brand",
    help: "The trainer signs this off, not the partner.",
  },
  {
    id: "review-audit",
    milestone: "readiness-review",
    label: "Pre-opening audit carried out",
    completedBy: "Brand",
    help: "Company staff only.",
  },
  {
    id: "review-passed",
    milestone: "readiness-review",
    label: "Readiness review passed",
    completedBy: "Brand",
    help: "Company staff only.",
  },
  {
    id: LAUNCH_AUTHORISATION_TASK,
    milestone: "launch",
    label: "Authorisation to open issued",
    completedBy: "Brand",
    help: "The only thing that makes a store authorised to open.",
  },
  {
    id: STORE_OPENED_TASK,
    milestone: "launch",
    label: "Store opened",
    completedBy: "Brand",
    help: null,
  },
];

export const TASKS_BY_MILESTONE = new Map<MilestoneKey, TaskDef[]>(
  MILESTONES.map((m) => [m.key, TASKS.filter((t) => t.milestone === m.key)]),
);

export const TASK_BY_ID = new Map<string, TaskDef>(TASKS.map((t) => [t.id, t]));

export const DOCUMENTS: DocumentDef[] = [
  {
    id: "doc-agreement",
    milestone: "agreement",
    label: "Signed franchise agreement",
    required: true,
    help: null,
  },
  { id: "doc-pan", milestone: "agreement", label: "PAN card", required: true, help: null },
  { id: "doc-aadhaar", milestone: "agreement", label: "Aadhaar", required: true, help: null },
  {
    id: "doc-gst",
    milestone: "agreement",
    label: "GST registration certificate",
    required: true,
    help: null,
  },
  {
    id: "doc-bank",
    milestone: "agreement",
    label: "Six months of bank statements",
    required: true,
    help: null,
  },
  {
    id: "doc-references",
    milestone: "agreement",
    label: "Two business references",
    required: false,
    help: "Helpful but not mandatory.",
  },
  {
    id: "doc-site-photos",
    milestone: "site-identification",
    label: "Site photographs",
    required: true,
    help: null,
  },
  {
    id: "doc-lease",
    milestone: "commercials",
    label: "Signed lease or rent agreement",
    required: true,
    help: null,
  },
  {
    id: "doc-fee-receipt",
    milestone: "commercials",
    label: "Franchise fee receipt",
    required: true,
    help: null,
  },
  {
    id: "doc-fire",
    milestone: "fit-out",
    label: "Fire safety clearance",
    required: true,
    help: null,
  },
  {
    id: "doc-electrical",
    milestone: "fit-out",
    label: "Electrical clearance",
    required: true,
    help: null,
  },
  {
    id: "doc-trade-licence",
    milestone: "readiness-review",
    label: "Trade licence",
    required: false,
    help: "Requirement varies by municipality. Confirm locally; this is not a configured rule.",
  },
];

export const DOCUMENTS_BY_MILESTONE = new Map<MilestoneKey, DocumentDef[]>(
  MILESTONES.map((m) => [m.key, DOCUMENTS.filter((d) => d.milestone === m.key)]),
);

export const DOCUMENT_BY_ID = new Map<string, DocumentDef>(DOCUMENTS.map((d) => [d.id, d]));

/** Training is tracked as milestones, not delivered here. No content is streamed or certified. */
export const TRAINING_MODULES = [
  "Product knowledge and range",
  "Billing and POS",
  "Stock handling and replenishment",
  "Customer service standards",
  "Hygiene and store standards",
  "Daily cash and banking",
] as const;
