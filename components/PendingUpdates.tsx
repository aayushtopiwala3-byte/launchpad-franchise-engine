"use client";

import Link from "next/link";
import { FIELD_LABELS } from "../lib/partner";
import { useStore } from "../lib/state/store";
import { Button, Card, CardHeader } from "./ui/primitives";

export function PendingUpdates() {
  const { pendingUpdates, resolvePendingUpdate, result } = useStore();
  if (pendingUpdates.length === 0) return null;

  const waiting = pendingUpdates.filter((u) => u.state === "pending");
  const settled = pendingUpdates.filter((u) => u.state !== "pending");

  return (
    <Card>
      <CardHeader
        title={`Pending updates${waiting.length > 0 ? ` — ${waiting.length} waiting` : ""}`}
        subtitle="Changes partners reported through their own link. Nothing here has been applied yet."
      />
      <ul className="divide-y divide-line">
        {[...waiting, ...settled].map((u) => {
          const known = result?.applicants.some((a) => a.applicationId === u.applicationId);
          return (
            <li key={u.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2 text-sm">
                {known ? (
                  <Link
                    href={`/applicants/${encodeURIComponent(u.applicationId)}`}
                    className="font-mono text-xs underline underline-offset-2"
                  >
                    {u.applicationId}
                  </Link>
                ) : (
                  <span className="font-mono text-xs">{u.applicationId}</span>
                )}
                <span className="text-xs text-muted">{u.submittedAt.slice(0, 16).replace("T", " ")}</span>
                {u.state !== "pending" ? (
                  <span
                    className={
                      u.state === "accepted"
                        ? "rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800"
                        : "rounded border border-line bg-stone-50 px-1.5 py-0.5 text-xs text-muted"
                    }
                  >
                    {u.state === "accepted" ? "Applied" : "Rejected"}
                  </span>
                ) : null}
              </div>

              <ul className="mt-1 space-y-0.5 text-sm">
                {u.proposedPatches.map((p, i) => (
                  <li key={`${p.field}-${i}`}>
                    <span className="font-medium">{FIELD_LABELS[p.field] ?? p.field}</span>{" "}
                    <span className="text-muted">
                      {p.oldValue ?? "not stated"} → {p.newValue ?? "not stated"}
                    </span>
                  </li>
                ))}
              </ul>

              {u.message ? <p className="mt-1 text-sm text-muted">“{u.message}”</p> : null}

              {u.state === "pending" ? (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!known}
                    onClick={() => resolvePendingUpdate(u.id, true)}
                  >
                    Accept and re-run
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => resolvePendingUpdate(u.id, false)}>
                    Reject
                  </Button>
                  {known ? null : (
                    <span className="self-center text-xs text-muted">
                      This application is not in the dataset loaded now.
                    </span>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
