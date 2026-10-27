"use client";

// The one place onboarding records are assembled, so the command centre, the internal
// onboarding list and the owner portal cannot disagree about what exists.
//
// A journey is not stored for each partner. It is derived: every APPROVED applicant in the
// current result has one, plus the synthetic sample partner. Change the dataset and the set
// of journeys changes with it — which is exactly what "one source of truth" has to mean.

import { useMemo } from "react";
import {
  DEMO_APPLICATION_ID,
  demoOwnerProfile,
  demoSubject,
  type OwnerProfile,
} from "../onboarding/demo";
import { buildJourney, emptyProgress } from "../onboarding/journey";
import type { JourneyView } from "../onboarding/types";
import { useStore } from "./store";

export interface OnboardingRecord {
  profile: OwnerProfile;
  view: JourneyView;
}

export function useOnboardingRecords(): OnboardingRecord[] {
  const { result, journeyProgress, asOfDate } = useStore();
  return useMemo(() => {
    const records: OnboardingRecord[] = [];

    for (const a of result?.applicants ?? []) {
      if (a.status !== "APPROVED") continue;
      const progress =
        journeyProgress[a.applicationId] ?? emptyProgress(a.applicationId, false);
      records.push({
        profile: {
          applicationId: a.applicationId,
          partnerName: a.normalised.applicantName ?? a.applicationId,
          city: a.normalised.city ?? "",
          territoryId: a.territoryId,
          assignedPin: a.assignedPin,
          // No support contact is configured anywhere in this product for real partners.
          supportContact: null,
          illustrativeLaunchDate: a.onboardingPlan?.launchDate ?? null,
          isDemo: false,
        },
        view: buildJourney(a, progress),
      });
    }

    const demoProgress = journeyProgress[DEMO_APPLICATION_ID];
    if (demoProgress) {
      records.push({
        profile: demoOwnerProfile(asOfDate ?? demoProgress.activity[0]?.at.slice(0, 10) ?? "2026-01-01"),
        view: buildJourney(demoSubject(), demoProgress),
      });
    }

    return records;
  }, [result, journeyProgress, asOfDate]);
}

export function useOnboardingRecord(applicationId: string): OnboardingRecord | null {
  const records = useOnboardingRecords();
  return records.find((r) => r.profile.applicationId === applicationId) ?? null;
}
