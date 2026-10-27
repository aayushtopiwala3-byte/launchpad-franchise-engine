"use client";

// Partner acquisition. A lead is a conversation, not a decision — nothing on this page
// approves anybody, and the stage shown here is only how far the conversation has got.
// The engine still owns every verdict, and it only ever sees an application.

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { AppShell } from "../../components/shell/AppShell";
import { FilterBar } from "../../components/command/FilterBar";
import { NewLeadForm } from "../../components/crm/NewLeadForm";
import {
  Button,
  Card,
  CardHeader,
  DemoBadge,
  EmptyState,
  NotStated,
  cn,
} from "../../components/ui/primitives";
import { followUpState, isOpen, stageCounts, workload } from "../../lib/crm/leads";
import type { Lead } from "../../lib/crm/types";
import { useFirstPaint } from "../../lib/state/firstPaint";
import { useFilters, withinRange } from "../../lib/state/filters";
import { useStore } from "../../lib/state/store";

const FOLLOW_UP_TONE: Record<string, string> = {
  overdue: "text-red-700",
  "due today": "text-amber-700",
  scheduled: "text-muted",
  none: "text-muted",
};

// `today` falls back to the real clock when no as-of date is loaded, and reading the clock
// during a prerender is exactly what Next.js refuses. The body sits behind its own Suspense
// boundary so the read happens on the visit rather than at build time.
export default function AcquisitionPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <Body />
      </Suspense>
    </AppShell>
  );
}

function Body() {
  const { leads, asOfDate, demoSeeded, hydrated, clearDemoRecords, restoreDemoRecords } =
    useStore();
  const { filters } = useFilters();
  const [adding, setAdding] = useState(false);

  const painted = useFirstPaint();

  const today = asOfDate ?? new Date().toISOString().slice(0, 10);
  const hasDemo = leads.some((l) => l.isDemo);

  const visible = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return leads.filter((l) => {
      if (filters.city && l.city !== filters.city) return false;
      if (filters.territoryId && l.preferredTerritoryId !== filters.territoryId) return false;
      if (filters.leadStage && l.stage !== filters.leadStage) return false;
      if (filters.owner && l.assignedTo !== filters.owner) return false;
      if (!withinRange(l.createdAt, filters.from, filters.to)) return false;
      if (q) {
        const hay = `${l.leadId} ${l.name} ${l.city ?? ""} ${l.email ?? ""} ${l.phone ?? ""}`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [leads, filters]);

  const load = useMemo(() => workload(leads, today), [leads, today]);
  const counts = useMemo(() => stageCounts(leads), [leads]);

  if (!painted || !hydrated) {
    return (
      <Card>
        <EmptyState title="Loading…" body="Reading anything saved in this browser." />
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Partner Acquisition</h1>
            <p className="text-sm text-muted">
              Prospects before they apply. Nothing here decides anything — a lead becomes a
              decision only once it is an application the engine has read.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {demoSeeded && hasDemo ? (
              <Button size="sm" variant="ghost" onClick={clearDemoRecords}>
                Remove sample records
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={restoreDemoRecords}>
                Restore sample records
              </Button>
            )}
            <Button variant={adding ? "secondary" : "primary"} onClick={() => setAdding((v) => !v)}>
              {adding ? "Cancel" : "Add a lead"}
            </Button>
          </div>
        </div>

        {adding ? <NewLeadForm onDone={() => setAdding(false)} /> : null}

        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <WorkTile label="Follow-up overdue" leads={load.overdue} tone="bad" />
          <WorkTile label="Follow-up due today" leads={load.dueToday} tone="warn" />
          <WorkTile label="Never contacted" leads={load.uncontacted} tone="warn" />
          <WorkTile label="Qualification pending" leads={load.awaitingApplicantInfo} />
          <WorkTile label="Qualified, no next action" leads={load.qualifiedWithoutNextAction} />
        </div>

        <Card>
          <CardHeader
            title="Acquisition stages"
            subtitle="Where each conversation has got to. A stage is recorded by a person; it is not an assessment."
          />
          <ul className="stagger flex flex-wrap gap-2 px-4 py-3 text-sm">
            {counts.map((c) => (
              <li
                key={c.stage}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-stone-50 px-3 py-1 transition-colors duration-150 hover:border-line-2 hover:bg-brand-soft"
              >
                <span className="text-muted">{c.stage}</span>
                <span className="font-bold tabular-nums">{c.count}</span>
              </li>
            ))}
          </ul>
        </Card>

        <FilterBar
          facets={["query", "city", "territory", "leadStage", "owner", "dates"]}
          searchPlaceholder="Search by name, ID, city or contact…"
        />

        <Card>
          <CardHeader
            title={`Leads (${visible.length} of ${leads.length})`}
            subtitle="Open the lead to log a call, draft outreach or prepare an application handover."
          />
          {visible.length === 0 ? (
            <EmptyState
              title="No leads match"
              body={
                leads.length === 0
                  ? "No leads have been recorded yet. Add one, or restore the sample records."
                  : "Every recorded lead is filtered out by the current selection."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Lead</th>
                    <th className="px-2 py-2 font-medium">City</th>
                    <th className="px-2 py-2 font-medium">Stage</th>
                    <th className="px-2 py-2 font-medium">Owner</th>
                    <th className="px-2 py-2 font-medium">Investment stated</th>
                    <th className="px-2 py-2 font-medium">Site</th>
                    <th className="px-4 py-2 font-medium">Next follow-up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((l) => {
                    const fu = followUpState(l, today);
                    return (
                      <tr
                        key={l.leadId}
                        className={cn(
                          "transition-colors duration-150 hover:bg-stone-50",
                          isOpen(l) ? undefined : "opacity-60",
                        )}
                      >
                        <td className="px-4 py-2">
                          <Link
                            href={`/acquisition/${l.leadId}`}
                            className="font-medium underline underline-offset-2"
                          >
                            {l.name}
                          </Link>
                          <span className="ml-1.5 text-xs text-muted">{l.leadId}</span>
                          {l.isDemo ? <DemoBadge className="ml-1.5" /> : null}
                        </td>
                        <td className="px-2 py-2 text-muted">{l.city ?? <NotStated />}</td>
                        <td className="px-2 py-2">
                          <span className="inline-flex items-center rounded-full border border-line bg-stone-50 px-2 py-0.5 text-xs font-semibold whitespace-nowrap">
                            {l.stage}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-muted">{l.assignedTo ?? <NotStated />}</td>
                        <td className="px-2 py-2 tabular-nums text-muted">{investment(l)}</td>
                        <td className="px-2 py-2 text-muted">{l.siteReadiness}</td>
                        <td className={`px-4 py-2 ${FOLLOW_UP_TONE[fu]}`}>
                          {l.nextFollowUpAt ? `${l.nextFollowUpAt.slice(0, 10)} · ${fu}` : "None set"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-line px-4 py-2 text-xs text-muted">
            Follow-up state is measured against {today}, the same as-of date every decision on
            this site uses — not against the clock on your machine.
          </p>
        </Card>
      </div>
    </>
  );
}

/** A stated range stays a range. Collapsing it to a midpoint would invent a figure. */
function investment(l: Lead): string {
  const { minLakh, maxLakh } = l.investmentRange;
  if (minLakh === null && maxLakh === null) return "Not stated";
  if (minLakh !== null && maxLakh !== null) {
    return minLakh === maxLakh ? `₹${minLakh}L` : `₹${minLakh}–${maxLakh}L`;
  }
  return minLakh !== null ? `₹${minLakh}L and above` : `Up to ₹${maxLakh}L`;
}

function WorkTile({
  label,
  leads,
  tone,
}: {
  label: string;
  leads: Lead[];
  tone?: "warn" | "bad";
}) {
  const colour = tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "";
  return (
    <div className="lift shadow-card rounded-[14px] border border-line bg-surface px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`anim-pop mt-0.5 text-2xl font-semibold tracking-tight tabular-nums ${colour}`}>
        {leads.length}
      </p>
      <ul className="mt-1 space-y-0.5">
        {leads.slice(0, 3).map((l) => (
          <li key={l.leadId} className="truncate text-xs">
            <Link href={`/acquisition/${l.leadId}`} className="underline underline-offset-2">
              {l.name}
            </Link>
          </li>
        ))}
        {leads.length > 3 ? (
          <li className="text-xs text-muted">{leads.length - 3} more</li>
        ) : null}
      </ul>
    </div>
  );
}
