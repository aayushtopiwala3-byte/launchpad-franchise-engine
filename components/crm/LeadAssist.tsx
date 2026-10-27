"use client";

// AI preparation for a conversation. It does not qualify anybody and it has no field in
// which to: the schema has no verdict, no score and no boolean, so the model cannot say
// "this lead is qualified" even if it wants to. Moving a stage stays a human action and an
// application stays the engine's business.
//
// The two lists that matter are the ones people skip. `inferences` is kept visually apart
// from `observedFacts` so a reading of the record is never mistaken for the record, and
// `factsToVerify` names the claims nobody has checked.

import { useState } from "react";
import { askAi } from "../../lib/ai/client";
import type { QualifyPayload } from "../../lib/ai/types";
import type { Lead } from "../../lib/crm/types";
import { useStore } from "../../lib/state/store";
import { Button, Card, CardHeader } from "../ui/primitives";

/** Exactly the lead record, with nothing added. The model gets no dataset and no policy. */
function payload(lead: Lead) {
  return {
    leadId: lead.leadId,
    name: lead.name,
    city: lead.city,
    preferredTerritoryId: lead.preferredTerritoryId,
    source: lead.source,
    stage: lead.stage,
    investmentRangeLakh: lead.investmentRange,
    retailExperienceYears: lead.retailExperienceYears,
    siteReadiness: lead.siteReadiness,
    consentToContact: lead.consentToContact,
    preferredChannel: lead.preferredChannel,
    notes: lead.notes,
    recordedOn: lead.createdAt.slice(0, 10),
    lastInteractionOn: lead.lastInteractionAt?.slice(0, 10) ?? null,
    nextFollowUpOn: lead.nextFollowUpAt?.slice(0, 10) ?? null,
    interactions: lead.interactions.map((i) => ({
      on: i.at.slice(0, 10),
      kind: i.kind,
      summary: i.summary,
    })),
  };
}

export function LeadAssist({ lead }: { lead: Lead }) {
  const { flags, ledger, log } = useStore();
  const [brief, setBrief] = useState<QualifyPayload | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!flags.aiExplanations) return null;

  const run = async () => {
    setBusy(true);
    setFailed(null);
    const { data, reason } = await askAi<QualifyPayload>("qualify", payload(lead), {
      ledger,
      onCall: ({ ok, detail }) =>
        log({
          at: new Date().toISOString(),
          kind: "ai",
          ok,
          message: ok ? `Conversation prep written for ${lead.leadId}` : "Conversation prep failed",
          detail,
        }),
    });
    setBusy(false);
    if (data) setBrief(data);
    else setFailed(reason ?? "The AI returned nothing usable.");
  };

  return (
    <Card>
      <CardHeader
        title="Prepare for the conversation"
        subtitle="Optional, AI-written, and advisory only. It cannot qualify this lead, move the stage or judge eligibility — there is no field in its reply for any of that."
        action={
          <Button size="sm" variant="secondary" onClick={run} disabled={busy}>
            {busy ? "Reading the record…" : brief ? "Read it again" : "Prepare"}
          </Button>
        }
      />

      {failed ? (
        <p className="px-4 py-3 text-sm text-muted">
          Nothing was written. {failed} The record above is unchanged and complete without it.
        </p>
      ) : null}

      {!brief && !failed ? (
        <p className="px-4 py-3 text-sm text-muted">
          Nothing is generated until you ask for it.
        </p>
      ) : null}

      {brief ? (
        <div className="space-y-4 px-4 py-3 text-sm">
          <p>{brief.summary}</p>

          <Two
            left={{
              title: "What the record says",
              hint: "Each one names the field it came from.",
              items: brief.observedFacts.map((f) => `${f.fact} — from ${f.fromField}`),
            }}
            right={{
              title: "A reading of those facts",
              hint: "Interpretation, not record. Each one names its basis.",
              items: brief.inferences.map((i) => `${i.inference} — because ${i.basis}`),
              muted: true,
            }}
          />

          <Two
            left={{ title: "Strengths", items: brief.strengths }}
            right={{ title: "Concerns", items: brief.concerns }}
          />

          <Two
            left={{
              title: "Not recorded anywhere",
              hint: "An application would need these; the lead does not have them.",
              items: brief.missingInformation,
            }}
            right={{
              title: "Claimed, but unchecked",
              hint: "Stated by the prospect. Nobody has verified it.",
              items: brief.factsToVerify,
            }}
          />

          <Two
            left={{ title: "Worth asking", items: brief.suggestedQuestions }}
            right={{ title: "Suggested next actions", items: brief.nextActions }}
          />

          {brief.outreachAngle ? (
            <div>
              <p className="text-xs font-medium text-muted">Angle for a message</p>
              <p className="mt-0.5">{brief.outreachAngle}</p>
            </div>
          ) : null}

          <p className="rounded-lg border border-line bg-stone-50 px-3 py-2 text-xs text-muted">
            Written by Gemini from the lead record alone. It has not seen the policy, the
            territory map or any decision, and nothing in it changes this lead&apos;s stage.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

interface Column {
  title: string;
  hint?: string;
  items: string[];
  muted?: boolean;
}

function Two({ left, right }: { left: Column; right: Column }) {
  if (left.items.length === 0 && right.items.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Col {...left} />
      <Col {...right} />
    </div>
  );
}

function Col({ title, hint, items, muted }: Column) {
  if (items.length === 0) return null;
  return (
    <div className={muted ? "rounded-lg border border-dashed border-line px-3 py-2" : undefined}>
      <p className="text-xs font-medium text-muted">{title}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
