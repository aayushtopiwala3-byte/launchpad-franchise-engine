"use client";

import Link from "next/link";
import { AppShell } from "../../components/shell/AppShell";
import { ExportButton } from "../../components/ExportButton";
import { PendingUpdates } from "../../components/PendingUpdates";
import { ProcessingPanel } from "../../components/ProcessingPanel";
import { RequireData } from "../../components/RequireData";
import { TerritoryCard } from "../../components/TerritoryCard";
import { Card, CardHeader, EmptyState, Stat, StatusChip } from "../../components/ui/primitives";
import { useStore } from "../../lib/state/store";
import type { Status } from "../../lib/types";

const STATUS_ORDER: Status[] = [
  "APPROVED",
  "WAITLISTED",
  "ON HOLD",
  "REDIRECTED",
  "NOT PROCEEDING",
];

export default function Dashboard() {
  const { datasetLabel, parseReport, policy } = useStore();

  return (
    <AppShell>
      <RequireData>
        {(result) => (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-xl font-semibold tracking-tight">Command Centre</h1>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted">
                  {datasetLabel}
                  {parseReport ? ` · processed in ${parseReport.processedMs} ms` : null} · decided
                  as of {result.asOfDate}
                </p>
                <ExportButton />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <Stat label="Applications" value={result.applicants.length} />
              <Stat label="Approved" value={result.counts.APPROVED} tone="good" />
              <Stat label="Waitlisted" value={result.counts.WAITLISTED} tone="warn" />
              <Stat label="On hold" value={result.counts["ON HOLD"]} />
              <Stat label="Redirected" value={result.counts.REDIRECTED} />
              <Stat label="Not proceeding" value={result.counts["NOT PROCEEDING"]} />
              <Stat
                label="Slots filled"
                value={`${result.slotsFilled} / ${result.slotsFilled + result.slotsOpen}`}
                hint={
                  result.highPrioritySlotsEmpty > 0
                    ? `${result.highPrioritySlotsEmpty} high-priority still empty`
                    : "No high-priority slot is empty"
                }
                tone={result.highPrioritySlotsEmpty > 0 ? "warn" : "good"}
              />
            </div>

            <PendingUpdates />

            <Card>
              <CardHeader
                title="Today's brief"
                subtitle="Assembled from the numbers above by template, not written by AI."
              />
              <p className="px-4 py-3 text-sm leading-relaxed">{result.todaysBrief}</p>
            </Card>

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
                        <Link
                          href="/territories"
                          className="font-medium underline underline-offset-2"
                        >
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
                subtitle={`Labels follow the ${policy.name} profile.`}
              />
              <div className="flex flex-wrap gap-2 px-4 py-3">
                {STATUS_ORDER.map((status) => (
                  <span key={status} className="flex items-center gap-1.5 text-sm">
                    <StatusChip status={status} label={policy.statusLabels[status]} />
                    <span className="tabular-nums text-muted">{result.counts[status]}</span>
                  </span>
                ))}
              </div>
            </Card>

            <ProcessingPanel />

            <div>
              <h2 className="mb-2 text-sm font-semibold tracking-tight">Territory board</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {result.territories.map((t) => (
                  <TerritoryCard key={t.territoryId} territory={t} />
                ))}
              </div>
            </div>
          </div>
        )}
      </RequireData>
    </AppShell>
  );
}
