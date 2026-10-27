"use client";

// The command centre. Every number on this page is computed in lib/command/metrics from the
// same arrays the linked pages render, so a card and the list behind it cannot disagree.
// Nothing here is stored: there is no "dashboard state" to go stale.

import Link from "next/link";
import { useMemo } from "react";
import { PendingUpdates } from "../../components/PendingUpdates";
import { ProcessingPanel } from "../../components/ProcessingPanel";
import { RequireData } from "../../components/RequireData";
import { AppShell } from "../../components/shell/AppShell";
import { ExecutiveSummary } from "../../components/command/ExecutiveSummary";
import { FilterBar } from "../../components/command/FilterBar";
import { Hero } from "../../components/command/Hero";
import {
  Bottlenecks,
  Funnel,
  KpiGrid,
  TerritoryOverview,
} from "../../components/command/Panels";
import { Card, CardHeader, EmptyState, StatusChip } from "../../components/ui/primitives";
import {
  buildBottlenecks,
  buildFunnel,
  buildMetrics,
  territorySnapshots,
  type MetricsInput,
} from "../../lib/command/metrics";
import { useFilters } from "../../lib/state/filters";
import { useOnboardingRecords } from "../../lib/state/derive";
import { useStore } from "../../lib/state/store";
import type { PipelineResult, Status } from "../../lib/types";

const STATUS_ORDER: Status[] = [
  "APPROVED",
  "WAITLISTED",
  "ON HOLD",
  "REDIRECTED",
  "NOT PROCEEDING",
];

export default function Dashboard() {
  const { datasetLabel, parseReport, policy, leads, pendingUpdates, asOfDate } = useStore();
  const records = useOnboardingRecords();
  const { filters } = useFilters();

  return (
    <AppShell>
      <RequireData>
        {(result) => (
          <Body
            result={result}
            records={records}
            leads={leads}
            pendingUpdates={pendingUpdates}
            asOfDate={asOfDate ?? result.asOfDate}
            datasetLabel={datasetLabel}
            processedMs={parseReport?.processedMs ?? null}
            policyName={policy.name}
            statusLabels={policy.statusLabels}
            city={filters.city}
            territoryId={filters.territoryId}
          />
        )}
      </RequireData>
    </AppShell>
  );
}

function Body({
  result,
  records,
  leads,
  pendingUpdates,
  asOfDate,
  datasetLabel,
  processedMs,
  policyName,
  statusLabels,
  city,
  territoryId,
}: {
  result: PipelineResult;
  records: ReturnType<typeof useOnboardingRecords>;
  leads: MetricsInput["leads"];
  pendingUpdates: MetricsInput["pendingUpdates"];
  asOfDate: string;
  datasetLabel: string | null;
  processedMs: number | null;
  policyName: string;
  statusLabels: Record<Status, string>;
  city: string | null;
  territoryId: string | null;
}) {
  const journeys = useMemo(() => records.map((r) => r.view), [records]);

  // The city and territory pickers narrow what the territory table and the funnel describe.
  // They never narrow a decision — the engine already decided every applicant, and filtering
  // a view does not un-decide anyone.
  const territories = useMemo(
    () =>
      result.territories.filter(
        (t) =>
          (!city || t.city === city) && (!territoryId || t.territoryId === territoryId),
      ),
    [result.territories, city, territoryId],
  );

  const input: MetricsInput = useMemo(
    () => ({ result, leads, journeys, pendingUpdates }),
    [result, leads, journeys, pendingUpdates],
  );

  const metrics = useMemo(() => buildMetrics(input), [input]);
  const funnel = useMemo(() => buildFunnel(input), [input]);
  const bottlenecks = useMemo(
    () =>
      buildBottlenecks({
        ...input,
        asOfDate,
        applicantName: (id) =>
          result.applicants.find((a) => a.applicationId === id)?.normalised.applicantName ?? null,
      }),
    [input, asOfDate, result.applicants],
  );
  const snapshots = useMemo(() => territorySnapshots(territories), [territories]);

  return (
    <div className="space-y-4">
      <Hero
        result={result}
        bottlenecks={bottlenecks}
        datasetLabel={datasetLabel}
        processedMs={processedMs}
        policyName={policyName}
      />

      <FilterBar facets={["city", "territory"]} />

      <KpiGrid metrics={metrics} />

      <PendingUpdates />

      <Funnel stages={funnel} />

      <Bottlenecks panels={bottlenecks} />

      <Card>
        <CardHeader
          title="Today's brief"
          subtitle="Assembled from the numbers above by template, not written by AI."
        />
        <p className="px-4 py-3 text-sm leading-relaxed">{result.todaysBrief}</p>
      </Card>

      <ExecutiveSummary metrics={metrics} funnel={funnel} bottlenecks={bottlenecks} />

      <TerritoryOverview snapshots={snapshots} />

      <Card>
        <CardHeader
          title="Recruitment gaps"
          subtitle="Territories with capacity but nobody ready to take it, highest priority first."
        />
        {result.recruitmentGaps.length === 0 ? (
          <EmptyState
            title="No gaps"
            body="Every territory with spare capacity has at least one ready applicant."
          />
        ) : (
          <ul className="divide-y divide-line">
            {result.recruitmentGaps.map((gap) => (
              <li key={gap.territoryId} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                  <Link href="/territories" className="font-medium underline underline-offset-2">
                    {gap.territoryId}
                  </Link>
                  <span className="text-muted">
                    {gap.city ?? "city not stated"} · {gap.tier ?? "tier not stated"} ·{" "}
                    {gap.priority ?? "priority not stated"} priority
                  </span>
                  <span className="ml-auto text-muted">
                    {gap.freeCapacity} slot{gap.freeCapacity === 1 ? "" : "s"} free ·{" "}
                    {gap.readyApplicants} ready · {gap.blockedApplicants} blocked
                  </span>
                </div>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {gap.suggestedChannels.map((channel) => (
                    <li
                      key={channel}
                      className="rounded border border-line bg-stone-50 px-2 py-0.5 text-xs text-muted"
                    >
                      {channel}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="What each answer means here"
          subtitle={`Labels follow the ${policyName} profile.`}
        />
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {STATUS_ORDER.map((status) => (
            <span key={status} className="flex items-center gap-1.5 text-sm">
              <StatusChip status={status} label={statusLabels[status]} />
              <span className="tabular-nums text-muted">{result.counts[status]}</span>
            </span>
          ))}
        </div>
      </Card>

      <ProcessingPanel />
    </div>
  );
}
