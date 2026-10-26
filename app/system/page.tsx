"use client";

import { AppShell } from "../../components/shell/AppShell";
import { Banner, Button, Card, CardHeader, EmptyState, cn } from "../../components/ui/primitives";
import { LAMP_COLORS, LAMP_LABELS } from "../../lib/state/health";
import { downloadRecovery } from "../../lib/state/persistence";
import { useStore } from "../../lib/state/store";
import type { HealthState } from "../../lib/types";

const KIND_LABELS: Record<string, string> = {
  ai: "AI",
  parse: "Parser",
  storage: "Storage",
  engine: "Rules engine",
  export: "Export",
};

const time = (iso: string) => iso.slice(11, 19);

export default function SystemPage() {
  const { health, systemLog, costLedger, corruptPayload, storageAvailable, safeMode, reset } =
    useStore();

  const spent = costLedger.reduce((sum, e) => sum + e.estimatedUsd, 0);
  const cached = costLedger.filter((e) => e.cacheHit).length;

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">System log</h1>
          <p className="text-sm text-muted">
            What each part of the app did, what it spent, and what it would do if a part stopped
            working. Nothing here is hidden from you.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(LAMP_LABELS) as (keyof HealthState)[]).map((key) => (
            <Card key={key} className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", LAMP_COLORS[health[key].level])} aria-hidden />
                <span className="text-sm font-medium">{LAMP_LABELS[key]}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{health[key].detail}</p>
            </Card>
          ))}
        </div>

        {!storageAvailable ? (
          <Banner tone="warn" title="This browser will not let the app save">
            Everything still works for this visit. A refresh starts over.
          </Banner>
        ) : null}

        {corruptPayload ? (
          <Banner
            tone="warn"
            title="The previously saved copy could not be read"
            action={
              <Button size="sm" variant="secondary" onClick={() => downloadRecovery(corruptPayload)}>
                Download it
              </Button>
            }
          >
            It was replaced with a clean state rather than guessed at.
          </Banner>
        ) : null}

        <Card>
          <CardHeader
            title="AI spend this session"
            subtitle={
              costLedger.length === 0
                ? "No AI call has been made."
                : `${costLedger.length} calls, ${cached} served from the cache at no cost.`
            }
            action={<span className="text-sm font-semibold tabular-nums">${spent.toFixed(4)}</span>}
          />
          {costLedger.length > 0 ? (
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-stone-50 text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Time</th>
                    <th className="px-4 py-2 font-medium">Call</th>
                    <th className="px-4 py-2 font-medium">Tokens in / out</th>
                    <th className="px-4 py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {costLedger.map((e, i) => (
                    <tr key={`${e.at}-${i}`} className="border-t border-line">
                      <td className="px-4 py-1.5 tabular-nums">{time(e.at)}</td>
                      <td className="px-4 py-1.5">
                        {e.callType}
                        {e.cacheHit ? " (cached)" : ""}
                        {e.ok ? "" : " — failed"}
                      </td>
                      <td className="px-4 py-1.5 tabular-nums">
                        {e.promptTokens} / {e.completionTokens}
                      </td>
                      <td className="px-4 py-1.5 tabular-nums">${e.estimatedUsd.toFixed(5)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Event log"
            subtitle="Newest first. The last 200 events are kept."
          />
          {systemLog.length === 0 ? (
            <EmptyState
              title="Nothing has happened yet"
              body="Load a dataset and every parse, decision and AI call will be listed here."
            />
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {systemLog.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex gap-3 px-4 py-2 text-sm">
                  <span className="shrink-0 tabular-nums text-muted">{time(e.at)}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 text-xs leading-5",
                      e.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800",
                    )}
                  >
                    {KIND_LABELS[e.kind] ?? e.kind}
                  </span>
                  <span className="min-w-0">
                    {e.message}
                    {e.detail ? <span className="block text-xs text-muted">{e.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recovery"
            subtitle="If this browser's saved copy ever looks wrong, start clean."
            action={
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  if (confirm("Clear the dataset, versions and settings saved in this browser?")) {
                    reset();
                  }
                }}
              >
                Clear saved data
              </Button>
            }
          />
          <p className="px-4 py-3 text-sm text-muted">
            {safeMode
              ? "Safe mode is on, so nothing is being saved at all."
              : "Clearing removes the dataset, versions, overrides and settings held in this browser. Your original file is untouched."}
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
