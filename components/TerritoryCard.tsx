"use client";

import Link from "next/link";
import { STATUS_COLORS } from "../lib/reference";
import type { Territory } from "../lib/types";
import { Card, CardHeader, NotStated, StatusChip, cn } from "./ui/primitives";

const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-red-50 text-red-800 border-red-200",
  Medium: "bg-amber-50 text-amber-900 border-amber-200",
  Low: "bg-stone-100 text-stone-700 border-stone-200",
};

function PinList({
  pins,
  holders,
  empty,
}: {
  pins: string[];
  holders?: Territory["pinHolders"];
  empty: string;
}) {
  if (pins.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {pins.map((pin) => {
        const holder = holders?.[pin];
        return (
          <li
            key={pin}
            className="rounded border border-line bg-stone-50 px-1.5 py-0.5 font-mono text-xs"
            title={holder ? `Held by ${holder.id} (${holder.kind})` : undefined}
          >
            {pin}
            {holder ? <span className="ml-1 font-sans text-stone-500">{holder.id}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TerritoryCard({ territory }: { territory: Territory }) {
  const t = territory;
  const approvals = t.queue.filter((q) => q.status === "APPROVED").length;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t.territoryId}
            <span className="font-normal text-muted">{t.city ?? "city not stated"}</span>
            {t.priority ? (
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-xs font-medium",
                  PRIORITY_STYLES[t.priority],
                )}
              >
                {t.priority} priority
              </span>
            ) : null}
            {t.tier ? (
              <span className="rounded border border-line bg-stone-50 px-1.5 py-0.5 text-xs text-muted">
                {t.tier}
              </span>
            ) : null}
          </span>
        }
        subtitle={`${approvals} of ${t.usableCapacity} usable slot${t.usableCapacity === 1 ? "" : "s"} filled`}
      />

      <div className="space-y-3 p-4 text-sm">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted">Open slots</div>
            <div className="text-lg font-semibold tabular-nums">
              {t.openSlots ?? <NotStated />}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Usable capacity</div>
            <div className="text-lg font-semibold tabular-nums">{t.usableCapacity}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Free pins</div>
            <div className="text-lg font-semibold tabular-nums">{t.freePins.length}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Occupied pins</div>
            <div className="text-lg font-semibold tabular-nums">{t.occupiedPins.length}</div>
          </div>
        </div>

        {t.capacityCappedReason ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900">
            {t.capacityCappedReason}
          </p>
        ) : null}

        <div>
          <div className="mb-1 text-xs font-medium text-muted">Free pins</div>
          <PinList pins={t.freePins} empty="No free pin is left in this territory." />
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-muted">
            Occupied pins — and who holds them
          </div>
          <PinList
            pins={t.occupiedPins}
            holders={t.pinHolders}
            empty="Nothing is holding a pin here yet."
          />
        </div>

        {t.cededPins.length > 0 ? (
          <div>
            <div className="mb-1 text-xs font-medium text-muted">
              Ceded to a lower-numbered territory
            </div>
            <PinList pins={t.cededPins} empty="" />
          </div>
        ) : null}

        <div>
          <div className="mb-1 text-xs font-medium text-muted">Queue</div>
          {t.queue.length === 0 ? (
            <p className="text-sm text-muted">No applicant has reached this territory.</p>
          ) : (
            <ol className="divide-y divide-line rounded border border-line">
              {t.queue.map((q) => (
                <li key={`${q.applicationId}-${q.rank}`} className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="w-6 shrink-0 text-xs tabular-nums text-muted">{q.rank}</span>
                  <Link
                    href={`/applicants/${q.applicationId}`}
                    className="font-mono text-xs underline underline-offset-2"
                  >
                    {q.applicationId}
                  </Link>
                  <span className={cn("ml-auto text-xs tabular-nums", STATUS_COLORS[q.status].text)}>
                    {q.score}
                  </span>
                  <StatusChip status={q.status} />
                </li>
              ))}
            </ol>
          )}
        </div>

        {t.unfilledSlotBlocker ? (
          <p className="rounded border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-sm text-sky-900">
            <span className="font-medium">Why a slot is still empty: </span>
            {t.unfilledSlotBlocker}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
