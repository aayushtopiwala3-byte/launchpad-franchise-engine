import { APPLICATION_COLUMNS } from "./parse/headers";

/**
 * The fields a partner may report a change to. Identity fields are left out —
 * a partner correcting their own Application ID or name is not a decision input.
 */
export const PARTNER_REPORTABLE_FIELDS = [
  "spaceAvailable",
  "spaceSizeSqft",
  "floor",
  "investmentLakh",
  "targetLaunchMonths",
  "pinCode",
  "currentBusiness",
] as const;

export type PartnerReportableField = (typeof PARTNER_REPORTABLE_FIELDS)[number];

export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  APPLICATION_COLUMNS.map((c) => [c.key, c.label]),
);
