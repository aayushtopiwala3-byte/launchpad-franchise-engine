"use client";

// Every approved partner's journey, in one list. These records are not stored: a journey
// exists because the engine approved an application, and it disappears if that decision
// changes. That is what keeps onboarding from becoming a second opinion about who is in.

import Link from "next/link";
import { useMemo } from "react";
import { FilterBar } from "../../components/command/FilterBar";
import { RequireData } from "../../components/RequireData";
import { AppShell } from "../../components/shell/AppShell";
import { MilestoneChip } from "../../components/onboarding/Journey";
import {
  Button,
  Card,
  CardHeader,
  DemoBadge,
  EmptyState,
  NotStated,
  ProgressBar,
  Stat,
  cn,
} from "../../components/ui/primitives";
import { MILESTONE_BY_KEY } from "../../lib/onboarding/config";
import { useFilters } from "../../lib/state/filters";
import { useOnboardingRecords, type OnboardingRecord } from "../../lib/state/derive";
import { useStore } from "../../lib/state/store";

export default function OnboardingPage() {
  return (
    <AppShell>
      <RequireData>{() => <Body />}</RequireData>
    </AppShell>
  );
}

function Body() {
  const records = useOnboardingRecords();
  const { demoSeeded, restoreDemoRecords } = useStore();
  const { filters } = useFilters();

  const visible = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return records.filter(({ profile, view }) => {
      if (filters.city && profile.city !== filters.city) return false;
      if (filters.territoryId && profile.territoryId !== filters.territoryId) return false;
      if (filters.onboardingStage && view.current?.def.key !== filters.onboardingStage) {
        return false;
      }
      if (q) {
        const hay = `${profile.applicationId} ${profile.partnerName} ${profile.city} ${profile.assignedPin ?? ""}`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [records, filters]);

  const counts = useMemo(() => {
    const blocked = records.filter((r) => r.view.current?.status === "Blocked").length;
    const awaitingBrand = records.filter(
      (r) => r.view.current?.status === "Awaiting brand verification",
    ).length;
    const awaitingAuth = records.filter(
      (r) => r.view.launch.verdict === "Awaiting brand authorisation",
    ).length;
    const corrections = records.filter((r) =>
      r.view.outstandingDocuments.some((d) => d.record.state === "Needs correction"),
    ).length;
    const opened = records.filter((r) => r.view.launch.verdict === "Store opened").length;
    return { blocked, awaitingBrand, awaitingAuth, corrections, opened };
  }, [records]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Onboarding &amp; Launch</h1>
          <p className="text-sm text-muted">
            One journey for every approved application, plus the sample partner. Nothing here
            can change a decision, a territory or a pin — onboarding reads the engine&apos;s
            output, it never writes to it.
          </p>
        </div>
        <Link href="/owner">
          <Button variant="secondary">Open Demo Franchise Owner Dashboard</Button>
        </Link>
      </div>

      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Blocked on an earlier step"
          value={counts.blocked}
          tone={counts.blocked > 0 ? "warn" : "default"}
          hint="Current milestone cannot start yet."
        />
        <Stat
          label="Waiting on the brand"
          value={counts.awaitingBrand}
          tone={counts.awaitingBrand > 0 ? "warn" : "default"}
          hint="Partner has done their part of the current step."
        />
        <Stat
          label="Awaiting authorisation"
          value={counts.awaitingAuth}
          tone={counts.awaitingAuth > 0 ? "warn" : "default"}
          hint="Everything mandatory is done. Nobody has authorised an opening."
        />
        <Stat
          label="Documents returned"
          value={counts.corrections}
          tone={counts.corrections > 0 ? "bad" : "default"}
          hint="At least one document needs correction."
        />
        <Stat label="Stores opened" value={counts.opened} tone="good" hint="Recorded by the brand." />
      </div>

      <FilterBar
        facets={["query", "city", "territory", "onboardingStage"]}
        searchPlaceholder="Search partner, application ID, city or pin…"
      />

      <Card>
        <CardHeader
          title={`${visible.length} journey${visible.length === 1 ? "" : "s"}`}
          subtitle="Progress is completed milestone weight over total configured weight. A part-finished milestone contributes nothing."
        />

        {records.length === 0 ? (
          <EmptyState
            title="No approved applications, so no journeys"
            body="A journey is derived from an approval. Load data and approve somebody, or restore the sample partner to see a part-finished journey."
            action={
              demoSeeded ? (
                <Button onClick={restoreDemoRecords}>Restore sample records</Button>
              ) : undefined
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No journey matches these filters"
            body="There are journeys here — the filters above are hiding all of them."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Partner</th>
                  <th className="px-4 py-2 font-medium">City / pin</th>
                  <th className="px-4 py-2 font-medium">Current milestone</th>
                  <th className="px-4 py-2 font-medium">Progress</th>
                  <th className="px-4 py-2 font-medium">Next action</th>
                  <th className="px-4 py-2 font-medium">Launch</th>
                </tr>
              </thead>
              <tbody className="stagger divide-y divide-line">
                {visible.map((r) => (
                  <Row key={r.profile.applicationId} record={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ record: { profile, view } }: { record: OnboardingRecord }) {
  const current = view.current;
  return (
    <tr className="align-top hover:bg-stone-50">
      <td className="px-4 py-2">
        <Link
          href={`/onboarding/${encodeURIComponent(profile.applicationId)}`}
          className="font-medium underline underline-offset-2"
        >
          {profile.partnerName}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs text-muted">{profile.applicationId}</span>
          {profile.isDemo ? <DemoBadge /> : null}
        </div>
      </td>
      <td className="px-4 py-2">
        {profile.city || <NotStated />}
        <div className="font-mono text-xs text-muted">
          {profile.assignedPin ?? "no pin held"}
        </div>
      </td>
      <td className="px-4 py-2">
        {current ? (
          <>
            <div>
              {current.def.number}. {current.def.title}
            </div>
            <MilestoneChip status={current.status} />
          </>
        ) : (
          <span className="text-muted">Every milestone is complete</span>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="tabular-nums">
          {view.percentComplete}%{" "}
          <span className="text-xs text-muted">
            ({view.completedWeight}/{view.totalWeight})
          </span>
        </div>
        <ProgressBar
          className="mt-1 w-28"
          percent={view.percentComplete}
          label={`${profile.partnerName}: ${view.percentComplete} per cent`}
        />
      </td>
      <td className="px-4 py-2">
        {view.nextAction ? (
          <>
            <div>{view.nextAction.label}</div>
            <div className="text-xs text-muted">
              {view.nextAction.owner} ·{" "}
              {MILESTONE_BY_KEY.get(view.nextAction.milestone)?.title ?? view.nextAction.milestone}
            </div>
          </>
        ) : (
          <span className="text-muted">Nothing outstanding</span>
        )}
      </td>
      <td className="px-4 py-2">
        <LaunchChip verdict={view.launch.verdict} />
      </td>
    </tr>
  );
}

const VERDICT_TONE: Record<string, string> = {
  "Store opened": "border-emerald-200 bg-emerald-50 text-emerald-800",
  "Authorised to open": "border-sky-200 bg-sky-50 text-sky-800",
  "Awaiting brand authorisation": "border-amber-200 bg-amber-50 text-amber-900",
  "Partner work outstanding": "border-line bg-stone-50 text-stone-700",
};

function LaunchChip({ verdict }: { verdict: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        VERDICT_TONE[verdict] ?? "border-line bg-stone-50 text-stone-700",
      )}
    >
      {verdict}
    </span>
  );
}
