"use client";

import { Card, CardHeader, NotStated } from "../ui/primitives";
import type { OnboardingPlan as Plan } from "../../lib/types";

export function OnboardingPlan({ plan }: { plan: Plan }) {
  return (
    <Card>
      <CardHeader
        title="Onboarding plan"
        subtitle={`Launch ${plan.launchDate}. Dates are counted forward from the decision date, not invented.`}
      />

      <div className="space-y-3 px-4 py-3">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Launch</dt>
            <dd className="font-medium">{plan.launchDate}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Their target</dt>
            <dd className="font-medium">{plan.targetDate ?? <NotStated />}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Training</dt>
            <dd className="font-medium">
              {plan.trainingWeeks} week{plan.trainingWeeks === 1 ? "" : "s"} ·{" "}
              {plan.trainingLanguage}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Training store</dt>
            <dd className="font-medium">
              {plan.trainingStoreId ? (
                <>
                  {plan.trainingStoreId}
                  {plan.trainingStoreCity ? (
                    <span className="font-normal text-muted"> · {plan.trainingStoreCity}</span>
                  ) : null}
                </>
              ) : (
                <NotStated />
              )}
            </dd>
          </div>
        </dl>

        {plan.targetIsAggressive && plan.aggressiveNote ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900">
            {plan.aggressiveNote}
          </p>
        ) : null}
      </div>

      <ol className="divide-y divide-line border-t border-line">
        {plan.steps.map((step) => (
          <li key={step.number} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
              <span className="font-medium">
                {step.number}. {step.title}
              </span>
              <span className="rounded border border-line bg-stone-50 px-1.5 py-0.5 text-xs text-muted">
                {step.owner}
              </span>
              <span className="ml-auto text-xs text-muted">
                {step.startDate} → {step.endDate} · {step.timingLabel}
              </span>
            </div>
            {step.checklist.length > 0 ? (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-muted">
                {step.checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>

      {plan.supportCheckIns.length > 0 ? (
        <div className="border-t border-line px-4 py-3">
          <div className="text-xs font-medium text-muted">Support check-ins after launch</div>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {plan.supportCheckIns.map((c) => (
              <li
                key={c.label}
                className="rounded border border-line bg-stone-50 px-2 py-0.5 text-xs"
              >
                {c.label} · {c.date}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
