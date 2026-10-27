"use client";

import Link from "next/link";
import type { Bottleneck, FunnelStage, Metric, TerritorySnapshot } from "../../lib/command/metrics";
import { Card, CardHeader, DemoBadge, EmptyState, cn } from "../ui/primitives";

const TONE = {
  good: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-red-700",
  undefined: "text-foreground",
} as const;

/**
 * Every card is a link to the list it counts. That is not decoration — it is the only way a
 * reader can check the number, and a KPI nobody can check is a claim rather than a measure.
 */
export function KpiGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <ul className="stagger grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {metrics.map((m) => (
        <li key={m.key}>
          <Link
            href={m.href}
            className="lift shadow-card block h-full rounded-[14px] border border-line bg-surface px-3 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <div className="flex items-start gap-1">
              <span className="text-xs font-medium text-muted">{m.label}</span>
              {m.includesDemo ? <DemoBadge className="ml-auto scale-90 origin-right" /> : null}
            </div>
            <div
              className={cn(
                "mt-0.5 text-2xl font-semibold tracking-tight tabular-nums",
                TONE[(m.tone ?? "undefined") as keyof typeof TONE],
              )}
            >
              {m.value}
            </div>
            <p className="mt-0.5 text-xs leading-snug text-muted">{m.basis}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Funnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <Card>
      <CardHeader
        title="Expansion funnel"
        subtitle="A conversion rate appears only where both numbers are actually observed. Where they are not, it says so."
      />
      <ol className="stagger divide-y divide-line">
        {stages.map((s, i) => (
          <li key={s.label} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
            <Link href={s.href} className="w-44 shrink-0 text-sm underline underline-offset-2">
              {s.label}
            </Link>
            <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-stone-100">
              <div
                className="bar-fill anim-grow-x h-full rounded-full bg-gradient-to-r from-brand to-[#a855f7]"
                style={{
                  width: `${Math.round((s.count / max) * 100)}%`,
                  animationDelay: `${i * 70}ms`,
                }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
              {s.count}
            </span>
            <span className="w-full text-xs text-muted sm:w-64 sm:text-right">
              {s.conversionFromPrevious !== null ? (
                <>{s.conversionFromPrevious}% of the step before</>
              ) : s.unavailableReason ? (
                <span title={s.unavailableReason}>Conversion rate unavailable</span>
              ) : (
                <>Top of the funnel</>
              )}
            </span>
          </li>
        ))}
      </ol>
      <p className="border-t border-line px-4 py-2 text-xs text-muted">
        Counts are measured independently at each step, so a later step can exceed an earlier
        one — an application can arrive without ever having been a lead here. That is reported
        rather than hidden.
      </p>
    </Card>
  );
}

export function Bottlenecks({ panels }: { panels: Bottleneck[] }) {
  const withItems = panels.filter((p) => p.items.length > 0);
  if (withItems.length === 0) {
    return (
      <Card>
        <CardHeader title="Where work is stuck" />
        <EmptyState
          title="Nothing is stuck"
          body="No overdue follow-up, no blocking data issue, no unanswered update and no onboarding step waiting on anyone."
        />
      </Card>
    );
  }
  return (
    <div className="stagger grid gap-3 lg:grid-cols-2">
      {withItems.map((p) => (
        <Card key={p.key} className="lift">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                {p.title}
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold tabular-nums text-brand">
                  {p.items.length}
                </span>
              </span>
            }
            subtitle={p.note ?? undefined}
          />
          <ul className="divide-y divide-line">
            {p.items.slice(0, 8).map((item) => (
              <li key={item.id} className="px-4 py-2 text-sm">
                <Link href={item.href} className="font-medium underline underline-offset-2">
                  {item.label}
                </Link>
                <p className="text-xs text-muted">{item.detail}</p>
              </li>
            ))}
          </ul>
          {p.items.length > 8 ? (
            <p className="border-t border-line px-4 py-1.5 text-xs text-muted">
              {p.items.length - 8} more not shown.
            </p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

export function TerritoryOverview({ snapshots }: { snapshots: TerritorySnapshot[] }) {
  return (
    <Card>
      <CardHeader
        title="Territory and pin code overview"
        subtitle="Read from the allocation map the engine writes, not from the pre-allocation store list."
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Territory</th>
              <th className="px-2 py-2 font-medium">City</th>
              <th className="px-2 py-2 text-right font-medium">Capacity</th>
              <th className="px-2 py-2 text-right font-medium">Stores</th>
              <th className="px-2 py-2 text-right font-medium">Approved</th>
              <th className="px-2 py-2 text-right font-medium">Reserved</th>
              <th className="px-2 py-2 text-right font-medium">Free pins</th>
              <th className="px-4 py-2 font-medium">Same-city pins held elsewhere</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {snapshots.map((s) => (
              <tr
                key={s.territory.territoryId}
                className="transition-colors duration-150 hover:bg-stone-50"
              >
                <td className="px-4 py-2">
                  <Link href="/territories" className="font-medium underline underline-offset-2">
                    {s.territory.territoryId}
                  </Link>
                </td>
                <td className="px-2 py-2 text-muted">{s.territory.city ?? "not stated"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{s.territory.usableCapacity}</td>
                <td className="px-2 py-2 text-right tabular-nums">{s.storePins.length}</td>
                <td className="px-2 py-2 text-right tabular-nums">{s.approvedPins.length}</td>
                <td className="px-2 py-2 text-right tabular-nums">{s.reservedPins.length}</td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold">
                  {s.freePins.length}
                </td>
                <td className="px-4 py-2 text-xs text-muted">
                  {s.possibleOverlap.length === 0
                    ? "None"
                    : `${s.possibleOverlap.length} in ${Array.from(new Set(s.possibleOverlap.map((o) => o.territoryId))).join(", ")}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-muted">
        The last column is a prompt to look, not a finding. An exact pin code can only be held
        once and the engine enforces that. Two stores in neighbouring pins of the same city may
        or may not take trade from each other, and nothing in this data says which — so it is
        never counted as a conflict.
      </p>
    </Card>
  );
}
