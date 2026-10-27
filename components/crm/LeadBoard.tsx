"use client";

// The pipeline board. Columns are the acquisition stages; a card is one conversation.
//
// Moving a card is a select, not a drag. A drag is nicer to demo and worse to use with a
// keyboard, and the honest version of "move this lead" is the same write either way: it logs
// a stage-change interaction against the lead, so the move is in the history afterwards.
//
// A refused move says why on the card instead of snapping back silently.

import Link from "next/link";
import { useState } from "react";
import { boardColumns, canMoveTo } from "../../lib/crm/board";
import { followUpState } from "../../lib/crm/leads";
import { LEAD_STAGES, type Lead, type LeadStage } from "../../lib/crm/types";
import { useStore } from "../../lib/state/store";
import { DemoBadge, NotStated, Select, cn } from "../ui/primitives";

export function LeadBoard({ leads, asOfDate }: { leads: Lead[]; asOfDate: string }) {
  const { setLeadStage } = useStore();
  const [refused, setRefused] = useState<{ leadId: string; reason: string } | null>(null);
  const columns = boardColumns(leads, asOfDate);

  const move = (lead: Lead, stage: LeadStage) => {
    const check = canMoveTo(lead, stage);
    if (!check.ok) {
      setRefused({ leadId: lead.leadId, reason: check.reason });
      return;
    }
    setRefused(null);
    setLeadStage(lead.leadId, stage, "Command centre");
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {columns.map((col) => (
          <section
            key={col.stage}
            className={cn(
              "w-64 shrink-0 rounded-xl border border-line bg-stone-50/60",
              col.isClosedStage && "opacity-80",
            )}
            aria-label={`${col.stage}: ${col.leads.length} lead${col.leads.length === 1 ? "" : "s"}`}
          >
            <header className="flex items-baseline gap-2 border-b border-line px-3 py-2">
              <h3 className="text-sm font-semibold">{col.stage}</h3>
              <span className="tabular-nums text-sm text-muted">{col.leads.length}</span>
              {col.overdue > 0 ? (
                <span className="ml-auto text-xs font-medium text-red-700">
                  {col.overdue} overdue
                </span>
              ) : null}
            </header>

            {col.leads.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted">Nothing at this stage right now.</p>
            ) : (
              <ul className="space-y-2 p-2">
                {col.leads.map((l) => {
                  const fu = followUpState(l, asOfDate);
                  return (
                    <li
                      key={l.leadId}
                      className="lift shadow-card rounded-[10px] border border-line bg-surface px-3 py-2"
                    >
                      <div className="flex items-baseline gap-1.5">
                        <Link
                          href={`/acquisition/${l.leadId}`}
                          className="truncate text-sm font-medium underline underline-offset-2"
                        >
                          {l.name}
                        </Link>
                        {l.isDemo ? <DemoBadge /> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {l.city ?? <NotStated />} · {l.assignedTo ?? "unassigned"}
                      </p>
                      <p
                        className={cn(
                          "text-xs",
                          fu === "overdue"
                            ? "text-red-700"
                            : fu === "due today"
                              ? "text-amber-700"
                              : "text-muted",
                        )}
                      >
                        {l.nextFollowUpAt
                          ? `Follow-up ${l.nextFollowUpAt.slice(0, 10)} · ${fu}`
                          : "No follow-up scheduled"}
                      </p>
                      <Select
                        aria-label={`Move ${l.name} to another stage`}
                        className="mt-1.5 w-full text-xs"
                        value={l.stage}
                        onChange={(e) => move(l, e.target.value as LeadStage)}
                      >
                        {LEAD_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                      {refused?.leadId === l.leadId ? (
                        <p className="mt-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                          {refused.reason}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
