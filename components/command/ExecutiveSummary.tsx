"use client";

// The one genuinely generative thing on the command centre, and the one most able to
// mislead. It is therefore wired so that it can only ever describe arithmetic that has
// already happened: the payload it sends contains finished counts, finished funnel steps
// and finished stuck-work lists. It is never given raw rows to total up.
//
// It is also strictly additive. Nothing on the page depends on it, it is not generated
// until someone asks, and when it fails the page is exactly the page it was before.

import { useState } from "react";
import { askAi } from "../../lib/ai/client";
import type { Bottleneck, FunnelStage, Metric } from "../../lib/command/metrics";
import type { BriefPayload } from "../../lib/ai/types";
import { useStore } from "../../lib/state/store";
import { Button, Card, CardHeader } from "../ui/primitives";

interface Props {
  metrics: Metric[];
  funnel: FunnelStage[];
  bottlenecks: Bottleneck[];
}

/**
 * What the model is allowed to see. Counts only — no applicant names, no lead names, no
 * free text anybody typed. A summary of a pipeline does not need to know who is in it, and
 * the smaller the payload, the less there is for a prompt injection to hide in.
 */
function payload({ metrics, funnel, bottlenecks }: Props, datasetLabel: string, asOfDate: string) {
  return {
    datasetLabel,
    asOfDate,
    counts: metrics.map((m) => ({ label: m.label, value: m.value, counts: m.basis })),
    funnel: funnel.map((s) => ({
      step: s.label,
      count: s.count,
      conversionFromPreviousPercent: s.conversionFromPrevious,
      conversionUnavailableBecause: s.unavailableReason,
    })),
    stuckWork: bottlenecks
      .filter((b) => b.items.length > 0)
      .map((b) => ({ category: b.title, count: b.items.length, caveat: b.note })),
  };
}

export function ExecutiveSummary(props: Props) {
  const { flags, ledger, log, datasetLabel, asOfDate } = useStore();
  const [brief, setBrief] = useState<BriefPayload | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState<number | null>(null);
  const [cached, setCached] = useState(false);

  if (!flags.aiExplanations) return null;

  const generate = async () => {
    setBusy(true);
    setFailed(null);
    const started = Date.now();
    const input = payload(props, datasetLabel ?? "the loaded dataset", asOfDate ?? "not stated");
    const { data, reason, cached: fromCache } = await askAi<BriefPayload>("brief", input, {
      ledger,
      onCall: ({ ok, detail }) =>
        log({
          at: new Date().toISOString(),
          kind: "ai",
          ok,
          message: ok ? "Executive summary written" : "Executive summary failed",
          detail,
        }),
    });
    setMs(Date.now() - started);
    setCached(fromCache);
    setBusy(false);
    if (data) setBrief(data);
    else setFailed(reason ?? "The AI returned nothing usable.");
  };

  return (
    <Card>
      <CardHeader
        title="Executive summary"
        subtitle="Optional. Written by Gemini from the counts already on this page — it is given no raw rows and does no arithmetic of its own."
        action={
          <Button size="sm" variant="secondary" onClick={generate} disabled={busy}>
            {busy ? "Writing…" : brief ? "Write it again" : "Write a summary"}
          </Button>
        }
      />

      {!brief && !failed ? (
        <p className="px-4 py-3 text-sm text-muted">
          Nothing is generated until you ask. Every number above was calculated without it.
        </p>
      ) : null}

      {failed ? (
        <p className="px-4 py-3 text-sm text-muted">
          No summary was written. {failed} Nothing else on this page depends on it.
        </p>
      ) : null}

      {brief ? (
        <div className="space-y-3 px-4 py-3 text-sm leading-relaxed">
          <p className="font-medium">{brief.headline}</p>
          {brief.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}

          {brief.watchPoints.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted">Worth watching</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {brief.watchPoints.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {brief.notSupported.length > 0 ? (
            <div className="rounded-lg border border-line bg-stone-50 px-3 py-2">
              <p className="text-xs font-medium text-muted">
                What this summary cannot tell you, because the data does not contain it
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">
                {brief.notSupported.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-xs text-muted">
            {cached ? "Served from this session's cache" : `Generated in ${ms} ms`} ·{" "}
            {datasetLabel ?? "dataset not named"} · decided as of {asOfDate ?? "not stated"}. It
            describes the figures above and decides nothing.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
