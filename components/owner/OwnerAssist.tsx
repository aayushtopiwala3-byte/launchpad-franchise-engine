"use client";

// The partner's question about their own journey, answered from their own record.
//
// The schema this call is held to has an `answer` and a `cannotAnswer`, and nothing that
// could approve, authorise or promise. So the worst a wrong answer can do is describe the
// record badly — it cannot move a milestone, accept a document or confirm a launch date,
// because there is no field in the reply for any of those.

import { useState } from "react";
import { askAi } from "../../lib/ai/client";
import type { OwnerAssistPayload } from "../../lib/ai/types";
import type { OwnerProfile } from "../../lib/onboarding/demo";
import type { JourneyView } from "../../lib/onboarding/types";
import { useStore } from "../../lib/state/store";
import { Banner, Button, Card, CardHeader, TextArea } from "../ui/primitives";

const SUGGESTIONS = [
  "What is holding up my application right now?",
  "Why were my bank statements sent back?",
  "What do I need to do before the site visit?",
  "When can I open?",
];

/** Only this partner's own journey. No dataset, no policy, no other partner's record. */
function payload(profile: OwnerProfile, view: JourneyView, question: string) {
  return {
    question,
    partner: {
      name: profile.partnerName,
      city: profile.city,
      pinCodeHeld: profile.assignedPin,
      illustrativeLaunchDate: profile.illustrativeLaunchDate,
      launchDateIsIllustrative: true,
      supportContact: profile.supportContact,
    },
    progress: {
      percentComplete: view.percentComplete,
      completedWeight: view.completedWeight,
      totalWeight: view.totalWeight,
      launchVerdict: view.launch.verdict,
      authorisedToOpen: view.launch.authorised,
    },
    currentMilestone: view.current
      ? {
          number: view.current.def.number,
          title: view.current.def.title,
          status: view.current.status,
          completionCriteria: view.current.def.completionCriteria,
          blockedBy: view.current.blockedBy,
        }
      : null,
    nextAction: view.nextAction,
    milestones: view.milestones.map((m) => ({
      number: m.def.number,
      title: m.def.title,
      status: m.status,
      owner: m.def.owner,
    })),
    outstanding: view.launch.outstandingMandatory,
    documents: view.milestones.flatMap((m) =>
      m.documents.map((d) => ({
        label: d.def.label,
        required: d.def.required,
        state: d.record.state,
        note: d.record.note,
      })),
    ),
  };
}

export function OwnerAssist({
  profile,
  view,
}: {
  profile: OwnerProfile;
  view: JourneyView;
}) {
  const { flags, ledger, log } = useStore();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<OwnerAssistPayload | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!flags.aiExplanations) return null;

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    setBusy(true);
    setFailed(null);
    setAnswer(null);
    const { data, reason } = await askAi<OwnerAssistPayload>(
      "ownerAssist",
      payload(profile, view, q),
      {
        ledger,
        onCall: ({ ok, detail }) =>
          log({
            at: new Date().toISOString(),
            kind: "ai",
            ok,
            message: ok ? "Owner question answered" : "Owner question failed",
            detail,
          }),
      },
    );
    setBusy(false);
    if (data) setAnswer(data);
    else setFailed(reason ?? "The AI returned nothing usable.");
  };

  return (
    <Card>
      <CardHeader
        title="Ask about your journey"
        subtitle="Answered by Gemini from the record on this page and nothing else. It cannot approve anything, accept a document or confirm an opening date."
      />

      <div className="space-y-3 px-4 py-3">
        <TextArea
          rows={2}
          placeholder="Ask a question about your onboarding…"
          aria-label="Your question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => ask(question)} disabled={busy || !question.trim()}>
            {busy ? "Reading your record…" : "Ask"}
          </Button>
          {SUGGESTIONS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setQuestion(s);
                ask(s);
              }}
            >
              {s}
            </Button>
          ))}
        </div>

        {failed ? (
          <Banner tone="warn" title="No answer was written">
            {failed} Everything above is unchanged and complete without it — the milestones and
            the outstanding list are produced by rules, not by the model.
          </Banner>
        ) : null}

        {answer ? (
          <div className="space-y-2 rounded-lg border border-line bg-stone-50 px-3 py-2.5">
            {answer.cannotAnswer ? (
              <Banner tone="info" title="Your record does not answer this">
                {answer.escalateTo
                  ? `Ask ${answer.escalateTo}.`
                  : "Ask your contact at the brand."}
              </Banner>
            ) : null}

            <p className="text-sm whitespace-pre-wrap">{answer.answer}</p>

            {answer.basedOn.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-muted">What this answer rests on</p>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-xs text-muted">
                  {answer.basedOn.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {!answer.cannotAnswer && answer.escalateTo ? (
              <p className="text-xs text-muted">For more than this, ask {answer.escalateTo}.</p>
            ) : null}

            <p className="text-xs text-muted">
              Written by a model. If it disagrees with the milestones above, the milestones are
              right — they come from rules, this does not.
            </p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
