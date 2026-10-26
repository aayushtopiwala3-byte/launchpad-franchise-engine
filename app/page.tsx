"use client";

import Link from "next/link";
import { DataLoader } from "../components/DataLoader";
import { AppShell } from "../components/shell/AppShell";
import { Card, CardHeader } from "../components/ui/primitives";
import { useStore } from "../lib/state/store";

const STATES = [
  ["Approved", "Passes every rule and wins a free pin in a territory with a slot."],
  ["Waitlisted", "Ready, but the territory is full. Shows their rank and what moves them up."],
  ["On hold", "Blocked by something fixable. Always names the fix and the deadline."],
  ["Redirected", "Their pin cannot take a store, but free pins nearby are named. Advice only."],
  ["Not proceeding", "A hard requirement was not met. The application stays on file."],
];

export default function Landing() {
  const { result, datasetLabel } = useStore();

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 py-6">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Turn a spreadsheet of franchise applications into decisions you can defend.
          </h1>
          <p className="text-muted">
            Upload the Applications and Territories workbook. Launchpad reads it, applies one
            written rulebook to every row, and tells you who to approve, which pin code they take,
            who is waiting and exactly why — with the rule and the number behind each answer.
          </p>
        </div>

        <DataLoader />

        {result ? (
          <Card className="p-4">
            <p className="text-sm">
              <span className="font-medium">{datasetLabel}</span> is already loaded —{" "}
              {result.applicants.length} applications across {result.territories.length}{" "}
              territories.{" "}
              <Link href="/dashboard" className="underline underline-offset-2">
                Go to the Command Centre
              </Link>
              .
            </p>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="How to test this in two minutes"
            subtitle="No account, no setup, nothing to install."
          />
          <ol className="list-decimal space-y-1.5 py-3 pr-4 pl-9 text-sm text-muted">
            <li>
              Press <span className="font-medium text-foreground">Load sample data</span>. It
              carries 28 deliberately messy applications, including a duplicate ID and a pin that
              already holds a store.
            </li>
            <li>
              Open any applicant and read{" "}
              <span className="font-medium text-foreground">What would change this decision</span>.
              That answer is the rules re-run with one value changed, not a guess.
            </li>
            <li>
              Add <code className="rounded bg-stone-100 px-1 font-mono text-xs">?safe=1</code> to the
              URL to switch off AI, the map and saving. Every verdict stays identical, because the
              rules never needed them.
            </li>
          </ol>
        </Card>

        <Card>
          <CardHeader
            title="The five answers it gives"
            subtitle="Every application lands in exactly one of these."
          />
          <dl className="divide-y divide-line">
            {STATES.map(([label, meaning]) => (
              <div key={label} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-4">
                <dt className="w-36 shrink-0 text-sm font-medium">{label}</dt>
                <dd className="text-sm text-muted">{meaning}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </AppShell>
  );
}
