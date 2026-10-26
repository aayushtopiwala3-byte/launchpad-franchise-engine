"use client";

import Link from "next/link";
import { Suspense, use } from "react";
import { AppShell } from "../../../components/shell/AppShell";
import { RequireData } from "../../../components/RequireData";
import { Explain, RawCell } from "../../../components/decision/Explain";
import { FeedbackControls } from "../../../components/decision/FeedbackControls";
import { OnboardingPlan } from "../../../components/decision/OnboardingPlan";
import { PartnerMessage } from "../../../components/decision/PartnerMessage";
import { RuleTrace } from "../../../components/decision/RuleTrace";
import { ScoreBreakdown } from "../../../components/decision/ScoreBreakdown";
import {
  Card,
  CardHeader,
  EmptyState,
  Field,
  SeverityChip,
  StatusChip,
  Value,
} from "../../../components/ui/primitives";
import { useStore } from "../../../lib/state/store";
import type { Applicant, NormalisationLogEntry } from "../../../lib/types";

function Identity({ applicant: a, log }: { applicant: Applicant; log: NormalisationLogEntry[] }) {
  const n = a.normalised;
  return (
    <Card>
      <CardHeader
        title="What the file said"
        subtitle={`Row ${a.rowNumber} of the Applications sheet. Anything blank below was blank there.`}
      />
      <dl className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
        <Field label="Name">
          <Value>{n.applicantName}</Value>
          <RawCell value={a.raw.applicantName} />
        </Field>
        <Field label="City">
          <Value>{n.city}</Value>
          <RawCell value={a.raw.city} />
        </Field>
        <Field label="Pin code">
          <Value>{n.pinCode}</Value>
          <RawCell value={a.raw.pinCode} />
        </Field>
        <Field label="Territory">
          <Value>{a.territoryId}</Value>
          <Explain block>matched by pin, not by a column</Explain>
        </Field>
        <Field label="Tier">
          <Value>{a.tier}</Value>
          <Explain block>from the territory</Explain>
        </Field>
        <Field label="Investment">
          <Value suffix="lakh">{n.investmentLakh}</Value>
          <RawCell value={a.raw.investmentLakh} />
        </Field>
        <Field label="Retail experience">
          <Value suffix="years">{n.retailExperienceYears}</Value>
          <RawCell value={a.raw.retailExperienceYears} />
        </Field>
        <Field label="Current business">
          <Value>{n.currentBusiness}</Value>
          <RawCell value={a.raw.currentBusiness} />
        </Field>
        <Field label="Space">
          <Value>{n.spaceAvailable}</Value>
          <RawCell value={a.raw.spaceAvailable} />
        </Field>
        <Field label="Space size">
          <Value suffix="sq ft">{n.spaceSizeSqft}</Value>
          <RawCell value={a.raw.spaceSizeSqft} />
        </Field>
        <Field label="Floor">
          <Value>{n.floor}</Value>
          <RawCell value={a.raw.floor} />
        </Field>
        <Field label="Target launch">
          <Value suffix="months">{n.targetLaunchMonths}</Value>
          <RawCell value={a.raw.targetLaunchMonths} />
        </Field>
        <Field label="Language">
          <Value>{n.preferredLanguage}</Value>
          <RawCell value={a.raw.preferredLanguage} />
          {n.languageWasDefaulted ? (
            <Explain block>defaulted — the file did not say</Explain>
          ) : null}
        </Field>
        <Field label="Business read as">
          {a.businessClassification.category.replace(/_/g, " ")}
          <span className="ml-1 text-xs text-muted">
            ({a.businessClassification.source === "ai" ? "AI" : "keyword match"})
          </span>
          <Explain block>
            confidence {a.businessClassification.confidence.toFixed(2)}
            {a.businessClassification.evidenceQuote
              ? ` · “${a.businessClassification.evidenceQuote}”`
              : " · no quote"}
          </Explain>
        </Field>
        <div className="col-span-2 sm:col-span-4">
          <Field label="Notes">
            <Value>{n.notes}</Value>
          </Field>
        </div>
      </dl>

      {log.length > 0 ? (
        <div className="border-t border-line px-4 py-3">
          <Explain block>
            {log.map((entry) => (
              <span key={`${entry.ruleId}-${entry.column}`} className="block">
                {entry.ruleId} {entry.column}: “{entry.from || "(blank)"}” read as “
                {entry.to || "(blank)"}”
              </span>
            ))}
          </Explain>
        </div>
      ) : null}
    </Card>
  );
}

function Counterfactual({ applicant: a }: { applicant: Applicant }) {
  return (
    <Card>
      <CardHeader
        title="What would change this decision"
        subtitle="Each line is the full rulebook re-run with one value changed. Not a guess, not written by AI."
      />
      {a.counterfactual.length === 0 ? (
        <EmptyState
          title="Nothing single would change it"
          body={
            a.status === "APPROVED"
              ? "They are approved — there is nothing to unlock."
              : "No single change to one field moves this decision. More than one thing would have to change."
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {a.counterfactual.map((c, i) => (
            <li key={`${c.field}-${i}`} className="px-4 py-2.5">
              <div className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-medium">{c.change}</span>
                <StatusChip status={c.resultingStatus} />
                {c.reachesApproved ? (
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800">
                    enough on its own
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-sm text-muted">{c.resultingReason}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Competitors({ applicant: a }: { applicant: Applicant }) {
  if (a.competitors.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Who else wanted this"
        subtitle="Applicants in the same territory, and whether they were after the same pin."
      />
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Application</th>
            <th className="px-2 py-2 font-medium">Name</th>
            <th className="px-2 py-2 font-medium">Pin</th>
            <th className="px-2 py-2 text-right font-medium">Score</th>
            <th className="px-2 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Why they ranked above</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {a.competitors.map((c) => (
            <tr key={c.applicationId} className={c.samePin ? "bg-amber-50/50" : undefined}>
              <td className="px-4 py-2">
                <Link
                  href={`/applicants/${encodeURIComponent(c.applicationId)}`}
                  className="font-mono text-xs underline underline-offset-2"
                >
                  {c.applicationId}
                </Link>
                {c.samePin ? <span className="ml-1 text-xs text-amber-700">same pin</span> : null}
              </td>
              <td className="px-2 py-2">
                <Value>{c.applicantName}</Value>
              </td>
              <td className="px-2 py-2 font-mono text-xs">
                <Value>{c.pinCode}</Value>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{c.score}</td>
              <td className="px-2 py-2">
                <StatusChip status={c.status} />
              </td>
              <td className="px-4 py-2 text-muted">{c.whyRankedHigher ?? "They did not."}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function QualityFlags({ applicant: a }: { applicant: Applicant }) {
  if (a.issues.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title="Data-quality flags"
        subtitle="What looked wrong in the file, and what the engine did about it."
      />
      <ul className="divide-y divide-line">
        {a.issues.map((issue, i) => (
          <li key={`${issue.id}-${i}`} className="px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <SeverityChip severity={issue.severity} />
              <code className="font-mono">{issue.id}</code>
              <span>
                {issue.sheet} · row {issue.row} · {issue.column}
              </span>
              {issue.originalValue ? (
                <span>
                  original value: <code className="font-mono">{issue.originalValue}</code>
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm">{issue.message}</p>
            <p className="mt-0.5 text-sm text-muted">{issue.actionTaken}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function DecisionCard({ params }: PageProps<"/applicants/[id]">) {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm text-muted">Opening the decision…</p>}>
        <Resolved params={params} />
      </Suspense>
    </AppShell>
  );
}

function Resolved({ params }: { params: PageProps<"/applicants/[id]">["params"] }) {
  const { id } = use(params);
  const decoded = decodeURIComponent(id);
  const { policy, flags } = useStore();

  return (
    <RequireData>
      {(result) => {
        const a =
          result.applicants.find((x) => x.key === decoded) ??
          result.applicants.find((x) => x.applicationId === decoded);

        if (!a) {
          return (
            <Card>
              <EmptyState
                title={`No application called ${decoded}`}
                body="It may belong to a different dataset than the one loaded now."
                action={
                  <Link href="/applicants" className="text-sm underline underline-offset-2">
                    Back to all applicants
                  </Link>
                }
              />
            </Card>
          );
        }

        return (
          <div className="space-y-4">
            <div>
              <Link href="/applicants" className="text-sm text-muted underline underline-offset-2">
                ← All applicants
              </Link>
            </div>

            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={a.status} label={policy.statusLabels[a.status]} />
                <h1 className="text-lg font-semibold tracking-tight">
                  {a.applicationId}
                  {a.normalised.applicantName ? ` · ${a.normalised.applicantName}` : ""}
                </h1>
                {a.isDuplicateHold ? (
                  <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">
                    duplicate row
                  </span>
                ) : null}
                <span className="ml-auto text-sm tabular-nums text-muted">
                  Score {a.score.total}
                  {a.rank !== null ? ` · rank ${a.rank}` : ""}
                  <Explain>S-01 · rank is within {a.territoryId ?? "no territory"}</Explain>
                </span>
              </div>

              <p className="mt-2 text-base leading-relaxed">{a.reasonSentence}</p>
              <Explain block>
                {a.reasonCode} · failed:{" "}
                {[...a.gateResults, ...a.readinessResults]
                  .filter((r) => !r.passed)
                  .map((r) => r.ruleId)
                  .join(", ") || "nothing"}
              </Explain>

              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-4">
                <Field label="Next step">{a.nextStep}</Field>
                <Field label="Assigned pin">
                  {a.assignedPin ? (
                    <code className="font-mono">{a.assignedPin}</code>
                  ) : (
                    <span className="text-muted">none held</span>
                  )}
                </Field>
                <Field label="Reserved until">
                  {a.reservedUntil ?? <span className="text-muted">no reservation</span>}
                </Field>
                <Field label="Unlock condition">
                  {a.unlockCondition ?? <span className="text-muted">nothing to unlock</span>}
                </Field>
              </dl>

              {a.suggestedPins.length > 0 ? (
                <p className="mt-3 rounded border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-sm text-purple-900">
                  Free pins they could apply for instead:{" "}
                  <span className="font-mono">{a.suggestedPins.join(", ")}</span>. This is advice —
                  none of them is held for this applicant.
                </p>
              ) : null}

              {flags.partnerView ? (
                <p className="mt-3 text-xs text-muted">
                  Partner view:{" "}
                  <Link
                    href={`/partner/${a.partnerToken}`}
                    className="underline underline-offset-2"
                  >
                    /partner/{a.partnerToken}
                  </Link>{" "}
                  — no login needed.
                </p>
              ) : null}
            </Card>

            {flags.counterfactuals ? <Counterfactual applicant={a} /> : null}

            <RuleTrace trace={a.trace} />
            <ScoreBreakdown score={a.score} />
            <Competitors applicant={a} />
            <QualityFlags applicant={a} />
            <Identity
              applicant={a}
              log={result.normalisationLog.filter((n) => n.subjectId === a.applicationId)}
            />

            {a.onboardingPlan ? <OnboardingPlan plan={a.onboardingPlan} /> : null}
            {flags.partnerMessages ? <PartnerMessage applicant={a} /> : null}
            <FeedbackControls applicant={a} />
          </div>
        );
      }}
    </RequireData>
  );
}
