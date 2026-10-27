// The sample partner behind the Franchise Owner Dashboard.
//
// This is a synthetic record, not one of the applicants in the loaded dataset. That is the
// whole point: the owner portal is a demonstration, and a demonstration must not be able to
// touch a real application, a real allocation or a real pin. `DEMO-PARTNER-01` is not an
// Application ID the engine ever issues, so nothing in `lib/engine` can match it.
//
// There is no authentication in this product. The portal is therefore presented as a clearly
// labelled sample rather than as an access-controlled partner account, because pretending a
// security boundary exists would be worse than not having one.

import { addDays } from "../engine/onboarding";
import { emptyProgress } from "./journey";
import type { JourneySubject } from "./journey";
import type { JourneyProgress } from "./types";

export const DEMO_APPLICATION_ID = "DEMO-PARTNER-01";

export interface OwnerProfile {
  applicationId: string;
  partnerName: string;
  city: string;
  territoryId: string | null;
  assignedPin: string | null;
  /** Null when no contact is configured. The portal says so rather than inventing one. */
  supportContact: { name: string; role: string; email: string; phone: string } | null;
  /**
   * A date to aim at, not a commitment. Nothing in this product has a brand-confirmed launch
   * date for the sample partner, so the portal says so beside it rather than implying one.
   */
  illustrativeLaunchDate: string | null;
  isDemo: boolean;
}

export function demoOwnerProfile(asOfDate: string): OwnerProfile {
  return {
    applicationId: DEMO_APPLICATION_ID,
    partnerName: "Sample — Kavya Srinivasan",
    city: "Mysuru",
    territoryId: "TER-03",
    assignedPin: "570011",
    supportContact: {
      name: "Sample — Priya N",
      role: "Expansion manager",
      email: "expansion@example.invalid",
      phone: "90000 00099",
    },
    illustrativeLaunchDate: addDays(asOfDate, 84),
    isDemo: true,
  };
}

export function demoSubject(): JourneySubject {
  return { applicationId: DEMO_APPLICATION_ID, status: "APPROVED", onboardingPlan: null };
}

/**
 * The sample partner is mid-journey on purpose: agreement done, site submitted, inspection
 * outstanding. It shows a blocked milestone, a document returned for correction and a Brand
 * task the partner is not allowed to close — the three things worth seeing.
 */
export function seedDemoProgress(asOfDate: string): JourneyProgress {
  const at = (days: number) => `${addDays(asOfDate, days)}T10:00:00.000Z`;
  const partner = (days: number) => ({ at: at(days), by: "Partner" as const, byName: "Sample — Kavya Srinivasan" });
  const brand = (days: number) => ({ at: at(days), by: "Brand" as const, byName: "Sample — Priya N" });

  const progress = emptyProgress(DEMO_APPLICATION_ID, true);
  progress.tasks = {
    "agreement-issued": brand(-38),
    "agreement-signed": partner(-31),
    "agreement-kyc": partner(-30),
    "site-shortlist": partner(-16),
    "site-details": partner(-12),
  };
  progress.documents = {
    "doc-agreement": { state: "Accepted", at: at(-30), note: null, fileNameClaimed: "agreement-signed.pdf" },
    "doc-pan": { state: "Accepted", at: at(-30), note: null, fileNameClaimed: "pan.jpg" },
    "doc-aadhaar": { state: "Accepted", at: at(-30), note: null, fileNameClaimed: "aadhaar.jpg" },
    "doc-gst": { state: "Accepted", at: at(-29), note: null, fileNameClaimed: "gst-certificate.pdf" },
    "doc-bank": {
      state: "Needs correction",
      at: at(-9),
      note: "Only four months were sent. Six months are required.",
      fileNameClaimed: "bank-statements.pdf",
    },
    "doc-site-photos": { state: "Under review", at: at(-11), note: null, fileNameClaimed: "site-photos.zip" },
  };
  progress.siteNotes =
    "Ground floor unit on a main road, roughly 520 sq ft, 18 ft frontage. Rent quoted at 55,000 a month.";
  progress.activity = [
    { id: "A1", at: at(-40), by: "Brand", byName: "Sample — Priya N", summary: "Application approved and pin 570011 reserved." },
    { id: "A2", at: at(-38), by: "Brand", byName: "Sample — Priya N", summary: "Franchise agreement issued." },
    { id: "A3", at: at(-31), by: "Partner", byName: "Sample — Kavya Srinivasan", summary: "Signed agreement returned." },
    { id: "A4", at: at(-30), by: "Partner", byName: "Sample — Kavya Srinivasan", summary: "KYC pack sent." },
    { id: "A5", at: at(-16), by: "Partner", byName: "Sample — Kavya Srinivasan", summary: "Three sites shortlisted and sent." },
    { id: "A6", at: at(-11), by: "Partner", byName: "Sample — Kavya Srinivasan", summary: "Site photographs submitted." },
    { id: "A7", at: at(-9), by: "Brand", byName: "Sample — Priya N", summary: "Bank statements returned for correction." },
  ];
  return progress;
}
