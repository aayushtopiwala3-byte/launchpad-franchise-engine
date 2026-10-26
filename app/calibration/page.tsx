"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AppShell } from "../../components/shell/AppShell";
import { RequireData } from "../../components/RequireData";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  RuleTag,
  Stat,
} from "../../components/ui/primitives";
import { calibrate } from "../../lib/state/calibration";
import { useStore } from "../../lib/state/store";
import type { PipelineResult } from "../../lib/types";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

function Calibration({ result }: { result: PipelineResult }) {
  const { feedback, overrides, policy } = useStore();
  const report = useMemo(
    () => calibrate(result.applicants, feedback, overrides),
    [result.applicants, feedback, overrides],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Calibration</h1>
        <p className="text-sm text-muted">
          Where your judgement and the rules disagree, and which threshold would close the gap.
          Nothing here changes a decision on its own.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Agreement rate"
          value={pct(report.agreementRate)}
          hint={`${report.agreed} of ${report.reviewed} reviewed`}
          tone={report.agreementRate === null ? "default" : report.agreementRate >= 0.8 ? "good" : "warn"}
        />
        <Stat
          label="Reviewed"
          value={`${report.reviewed} of ${report.decided}`}
          hint="Decisions you marked right or wrong"
        />
        <Stat
          label="Override rate"
          value={pct(report.overrideRate)}
          hint={`${report.overrides} decision${report.overrides === 1 ? "" : "s"} overridden by hand`}
          tone={report.overrideRate !== null && report.overrideRate > 0.1 ? "warn" : "default"}
        />
        <Stat label="Disagreements" value={report.disagreed} hint="Marked wrong" />
      </div>

      <Card>
        <CardHeader title="What this says" />
        <p className="px-4 py-3 text-sm">{report.headline}</p>
      </Card>

      <Card>
        <CardHeader
          title="Disagreements by rule"
          subtitle="A decision that failed several rules counts against each of them."
        />
        {report.disagreements.length === 0 ? (
          <EmptyState
            title="Nothing to calibrate yet"
            body="Open an applicant and mark the decision right or wrong. Once a few are in, this groups them by the rule that drove the verdict."
            action={
              <Link href="/applicants">
                <Button size="sm" variant="primary">
                  Go to applicants
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {report.disagreements.map((d) => (
              <li key={d.ruleId} className="space-y-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <RuleTag id={d.ruleId} />
                  <span className="text-sm font-medium">{d.rule}</span>
                  <span className="text-sm text-muted">
                    {d.count} disagreement{d.count === 1 ? "" : "s"}
                  </span>
                  {d.setting ? (
                    <Link href="/policy" className="ml-auto">
                      <Button size="sm" variant="secondary">
                        Open {d.setting}
                      </Button>
                    </Link>
                  ) : null}
                </div>
                <p className="text-sm">{d.suggestion}</p>
                <p className="text-xs text-muted">
                  {d.applicationIds.map((id, i) => (
                    <span key={id}>
                      {i > 0 ? ", " : ""}
                      <Link
                        href={`/applicants/${encodeURIComponent(id)}`}
                        className="font-mono underline underline-offset-2"
                      >
                        {id}
                      </Link>
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {overrides.length > 0 ? (
        <Card>
          <CardHeader
            title="Overrides on the record"
            subtitle="Each one keeps its reason, so a verdict is never quietly changed."
          />
          <ul className="divide-y divide-line">
            {overrides.map((o) => (
              <li key={o.applicationId} className="px-4 py-2.5 text-sm">
                <Link
                  href={`/applicants/${encodeURIComponent(o.applicationId)}`}
                  className="font-mono underline underline-offset-2"
                >
                  {o.applicationId}
                </Link>{" "}
                <span className="text-muted">
                  {policy.statusLabels[o.fromStatus]} → {policy.statusLabels[o.toStatus]}
                  {o.locked ? ", kept through re-runs" : ""}. {o.reason}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

export default function CalibrationPage() {
  return (
    <AppShell>
      <RequireData>{(result) => <Calibration result={result} />}</RequireData>
    </AppShell>
  );
}
