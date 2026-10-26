import { formatDate } from "../engine/onboarding";
import { LANGUAGES } from "../reference";
import type { Applicant, Language, PolicyProfile } from "../types";
import { buildEnglish } from "./en";
import { buildHindi } from "./hi";
import { buildKannada } from "./kn";
import type { MessageBuilder, MessageVars } from "./types";

const BUILDERS: Record<Language, MessageBuilder> = {
  English: buildEnglish,
  Kannada: buildKannada,
  Hindi: buildHindi,
};

/** Hand-written templates in all three languages. No AI, so the message is identical every run. */
export function renderMessages(
  applicant: Applicant,
  policy: PolicyProfile,
): Record<Language, string> {
  const plan = applicant.onboardingPlan;
  const vars: MessageVars = {
    brandName: policy.brandName,
    name: applicant.normalised.applicantName ?? applicant.applicationId,
    city: applicant.normalised.city ?? "your city",
    pin: applicant.assignedPin ?? applicant.normalised.pinCode,
    suggestedPins: applicant.suggestedPins,
    launchDate: plan ? formatDate(plan.launchDate) : null,
    reservedUntil: applicant.reservedUntil ? formatDate(applicant.reservedUntil) : null,
    unlockCondition: applicant.unlockCondition,
    trainingStore:
      plan?.trainingStoreId && plan.trainingStoreCity
        ? `${plan.trainingStoreId} (${plan.trainingStoreCity})`
        : null,
    trainingWeeks: plan?.trainingWeeks ?? null,
  };

  const out = {} as Record<Language, string>;
  for (const lang of LANGUAGES) out[lang] = BUILDERS[lang](applicant.status, vars);
  return out;
}
