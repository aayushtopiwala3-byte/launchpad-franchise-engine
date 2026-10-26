"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "../../components/shell/AppShell";
import { RequireData } from "../../components/RequireData";
import {
  Card,
  CardHeader,
  EmptyState,
  Stat,
  StatusChip,
  cn,
} from "../../components/ui/primitives";
import { FIELD_LABELS } from "../../lib/partner";
import { diffBetween } from "../../lib/state/versions";
import { useStore } from "../../lib/state/store";
import type { PipelineResult, PolicyProfile, Version, VersionDiffEntry } from "../../lib/types";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function DiffRows({
  entries,
  policy,
}: {
  entries: VersionDiffEntry[];
  policy: PolicyProfile;
}) {
  if (entries.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted">
        No decision moved. The change was recorded, and it changed nothing.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {entries.map((d) => (
        <li key={d.key} className="space-y-1 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href={`/applicants/${encodeURIComponent(d.applicationId)}`}
              className="font-mono underline underline-offset-2"
            >
              {d.applicationId}
            </Link>
            {d.applicantName ? <span className="text-muted">{d.applicantName}</span> : null}
            {d.fromStatus === null ? <span className="text-muted">new in this version →</span> : null}
            {d.fromStatus !== null && d.fromStatus !== d.toStatus ? (
              <>
                <StatusChip status={d.fromStatus} label={policy.statusLabels[d.fromStatus]} />
                <span aria-hidden className="text-muted">
                  →
                </span>
              </>
            ) : null}
            <StatusChip status={d.toStatus} label={policy.statusLabels[d.toStatus]} />
            {d.fromStatus === d.toStatus ? (
              <span className="text-xs text-muted">answer unchanged</span>
            ) : null}
            {d.fromScore !== null && d.fromScore !== d.toScore ? (
              <span className="tabular-nums text-muted">
                score {d.fromScore} → {d.toScore}
              </span>
            ) : null}
            {d.fromRank !== null && d.fromRank !== d.toRank ? (
              <span className="tabular-nums text-muted">
                rank {d.fromRank} → {d.toRank ?? "unranked"}
              </span>
            ) : null}
            {d.displaced ? (
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">
                lost the pin they held
              </span>
            ) : null}
          </div>
          {d.fromReason && d.fromReason !== d.toReason ? (
            <p className="text-xs text-muted line-through">{d.fromReason}</p>
          ) : null}
          <p className="text-sm">{d.toReason}</p>
        </li>
      ))}
    </ul>
  );
}

function Compare({
  versions,
  result,
  policy,
}: {
  versions: Version[];
  result: PipelineResult;
  policy: PolicyProfile;
}) {
  const [fromId, setFromId] = useState(versions[0].versionId);
  const [toId, setToId] = useState(versions[versions.length - 1].versionId);

  const entries = useMemo(
    () => diffBetween(versions, fromId, toId, result.applicants),
    [versions, fromId, toId, result.applicants],
  );

  const select = (value: string, onChange: (id: string) => void, label: string) => (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1 text-sm"
      >
        {versions.map((v) => (
          <option key={v.versionId} value={v.versionId}>
            {v.versionId} · {v.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Card>
      <CardHeader
        title="Compare any two versions"
        subtitle="Recomputed from the two snapshots, so it shows the net effect rather than the steps."
      />
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        {select(fromId, setFromId, "From")}
        {select(toId, setToId, "To")}
        <span className="text-sm text-muted">
          {entries.length} decision{entries.length === 1 ? "" : "s"} differ
        </span>
      </div>
      <DiffRows entries={entries} policy={policy} />
    </Card>
  );
}

function Timeline({ result }: { result: PipelineResult }) {
  const { versions, policy } = useStore();
  const newestFirst = useMemo(() => [...versions].reverse(), [versions]);
  const moved = useMemo(
    () => versions.reduce((n, v) => n + v.diff.length, 0),
    [versions],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Timeline</h1>
        <p className="text-sm text-muted">
          Every version of the decisions, what caused it, and exactly which decisions moved. A
          verdict is never changed quietly.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Stat label="Versions" value={versions.length} hint="Oldest is the first run" />
        <Stat label="Decision changes recorded" value={moved} hint="Summed across every version" />
        <Stat
          label="Current result"
          value={<span className="font-mono text-base">{result.resultHash}</span>}
          hint="The same input and policy always give this hash"
        />
      </div>

      {versions.length > 1 ? (
        <Compare versions={versions} result={result} policy={policy} />
      ) : null}

      <Card>
        <CardHeader title="History" subtitle="Newest first." />
        {newestFirst.length === 0 ? (
          <EmptyState
            title="No versions yet"
            body="A version is recorded every time the decisions are recomputed — an upload, a chat update, a policy change or an override."
          />
        ) : (
          <ul className="divide-y divide-line">
            {newestFirst.map((v, index) => (
              <li key={v.versionId} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-mono text-sm">{v.versionId}</span>
                  <span className="text-sm font-medium">{v.label}</span>
                  <span className="text-xs text-muted">{when(v.createdAt)}</span>
                  <span
                    className={cn(
                      "ml-auto text-xs",
                      v.diff.length > 0 ? "text-amber-800" : "text-muted",
                    )}
                  >
                    {index === newestFirst.length - 1
                      ? "the first run"
                      : `${v.diff.length} decision${v.diff.length === 1 ? "" : "s"} moved`}
                  </span>
                </div>

                {v.patches.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                    {v.patches.map((p, i) => (
                      <li key={`${p.applicationId}-${p.field}-${i}`}>
                        <span className="font-mono">{p.applicationId}</span>{" "}
                        {FIELD_LABELS[p.field] ?? p.field}: {p.oldValue ?? "not stated"} →{" "}
                        {p.newValue ?? "not stated"}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {v.diff.length > 0 ? (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-xs text-muted underline underline-offset-2">
                      What moved
                    </summary>
                    <div className="mt-1 rounded border border-line">
                      <DiffRows entries={v.diff} policy={policy} />
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function TimelinePage() {
  return (
    <AppShell>
      <RequireData>{(result) => <Timeline result={result} />}</RequireData>
    </AppShell>
  );
}
