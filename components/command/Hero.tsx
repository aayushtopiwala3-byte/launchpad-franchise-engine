"use client";

// The top of the Command Centre. It is a presentation of numbers that already exist below —
// the headline count, the status split and the attention list are all read from the same
// result and the same bottleneck panels the rest of the page renders. The hero states nothing
// the page cannot be checked against, which is why the big number is a count of decided
// applications rather than a score or a health rating: a count can be verified by opening
// the list, and a rating cannot.

import Link from "next/link";
import { ExportButton } from "../ExportButton";
import type { Bottleneck } from "../../lib/command/metrics";
import type { PipelineResult } from "../../lib/types";

export function Hero({
  result,
  bottlenecks,
  datasetLabel,
  processedMs,
  policyName,
}: {
  result: PipelineResult;
  bottlenecks: Bottleneck[];
  datasetLabel: string | null;
  processedMs: number | null;
  policyName: string;
}) {
  const decided = result.applicants.length;
  const approved = result.counts.APPROVED;
  const attention = bottlenecks.filter((b) => b.items.length > 0);

  return (
    <section className="anim-rise relative overflow-hidden rounded-[24px] bg-night px-6 py-7 text-white shadow-[0_24px_60px_#140a3240] sm:px-8">
      <div
        className="blob size-[340px] bg-brand"
        style={{ top: "-170px", right: "8%" }}
        aria-hidden
      />
      <div
        className="blob size-[220px] bg-[#c6f24e]"
        style={{ bottom: "-140px", left: "18%", animationDelay: "-6s", opacity: 0.25 }}
        aria-hidden
      />

      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <div className="min-w-0">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            Command Centre{" "}
            <span className="text-white/45">for {result.territories.length} territories</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70">
            {datasetLabel ?? "No dataset label"}
            {processedMs !== null ? ` · processed in ${processedMs} ms` : null} · decided as of{" "}
            {result.asOfDate} · {policyName} thresholds
          </p>

          <div className="mt-6 flex flex-wrap items-baseline gap-3">
            <b className="text-5xl leading-none font-extrabold tracking-tighter tabular-nums sm:text-6xl">
              {decided}
            </b>
            <span className="text-sm text-white/55">
              application{decided === 1 ? "" : "s"} decided by the rules
            </span>
            <span className="text-sm font-bold text-[#c6f24e]">{approved} approved</span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Link
              href="/owner"
              className="inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-semibold text-stone-900 transition-[transform,filter] duration-150 hover:brightness-95 active:translate-y-px"
            >
              Open Demo Franchise Owner Dashboard
            </Link>
            <ExportButton size="md" />
          </div>
          <p className="mt-3 max-w-xl text-xs text-white/45">
            The owner dashboard shows one invented partner with a part-finished journey. It is
            marked as a sample on every screen and it never touches the decisions below.
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-white/45 uppercase">
            {attention.length === 0 ? "Nothing is waiting on anyone" : "Waiting on someone"}
          </p>
          {attention.length === 0 ? (
            <p className="mt-3 text-sm text-white/70">
              No overdue follow-up, no blocking data issue, no unanswered update and no onboarding
              step waiting on anyone.
            </p>
          ) : (
            <ul className="stagger mt-3 space-y-2">
              {attention.map((b) => (
                <li key={b.key} className="grid grid-cols-[auto_1fr] items-baseline gap-2.5 text-sm">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold tabular-nums text-[#c6f24e]">
                    {b.items.length}
                  </span>
                  <span className="text-white/75">{b.title}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex items-end gap-1 bar-pulse h-10" aria-hidden>
            <span className="h-full w-1.5 rounded-full bg-white/25" />
            <span className="h-full w-1.5 rounded-full bg-white/35" />
            <span className="h-full w-1.5 rounded-full bg-[#c6f24e]/60" />
          </div>
        </div>
      </div>

      <div className="relative mt-6 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-xs text-white/45">
        <span>Rules decide, AI explains. Every count here is recomputed from the dataset.</span>
        <span className="tabular-nums">Result {result.resultHash}</span>
      </div>
    </section>
  );
}
