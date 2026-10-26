"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AppShell } from "../../components/shell/AppShell";
import { RequireData } from "../../components/RequireData";
import { Badge } from "../../components/chat/Badge";
import { Button, Card, CardHeader, RuleTag } from "../../components/ui/primitives";
import { askAi } from "../../lib/ai/client";
import { answerQuestion } from "../../lib/ai/answer";
import { ground, routeQuestion, type ChatIntent, type RoutedQuestion } from "../../lib/ai/router";
import type { ChatRoutePayload } from "../../lib/ai/types";
import { FIELD_LABELS } from "../../lib/partner";
import { useStore } from "../../lib/state/store";
import { diffSnapshots, snapshotOf } from "../../lib/state/versions";
import type { ChatMessage, Patch, PipelineResult } from "../../lib/types";

const SUGGESTIONS = [
  "Why is APP-020 on hold?",
  "Who else wanted TER-01?",
  "Which territories still have free slots?",
  "How many approved?",
];

const uid = () => `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

/** AI may only fill in the route. The answer is always assembled from the result. */
function routeFromAi(payload: ChatRoutePayload, result: PipelineResult): RoutedQuestion {
  const { applied, unchanged } = ground(payload.patches, result);

  // An AI "update" that survives no patch is only an update if something really moves.
  // Where the file already says it, the answer should say so rather than go blank.
  const intent: ChatIntent =
    payload.intent !== "update"
      ? payload.intent
      : applied.length > 0
        ? "update"
        : unchanged.length > 0
          ? "no-change"
          : "unknown";

  return {
    intent,
    applicationIds: payload.applicationIds.map((s) => s.toUpperCase()),
    territoryIds: payload.territoryIds.map((s) => s.toUpperCase()),
    patches: applied,
    unchanged,
    deterministic: false,
  };
}

/** The applicants the conversation last named, so "it is 450 sq ft" has something to mean. */
function lastMentioned(history: ChatMessage[]): string[] {
  for (let i = history.length - 1; i >= 0; i--) {
    const named = [...new Set(history[i].text.match(/\bAPP-\d+\b/gi) ?? [])].map((s) =>
      s.toUpperCase(),
    );
    if (named.length > 0) return named;
  }
  return [];
}

function Chat({ result }: { result: PipelineResult }) {
  const store = useStore();
  const { chat, setChat, policy, flags, ledger, applyPatches, log } = store;
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const push = (...added: ChatMessage[]) => {
    const next = [...chat, ...added];
    setChat(next);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    return next;
  };

  /** Applies a patch set and reports what actually moved, named row by row. */
  const runPatches = (patches: Patch[], history: ChatMessage[], proposalId: string) => {
    const before = snapshotOf(result);
    const after = applyPatches(patches, "chat-patch", patches[0]?.sourceQuote);
    if (!after) return;
    const diff = diffSnapshots(before, snapshotOf(after), after.applicants);
    const text =
      diff.length === 0
        ? "Applied. No decision changed as a result."
        : `Applied. ${diff.length} decision${diff.length === 1 ? "" : "s"} changed.`;
    setChat([
      // Stamping the proposal retires its Apply button, so the same change cannot land twice.
      ...history.map((m) => (m.id === proposalId ? { ...m, versionId: after.resultHash } : m)),
      { id: uid(), role: "assistant", text, diff, at: new Date().toISOString() },
    ]);
  };

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || thinking) return;
    setDraft("");

    const user: ChatMessage = { id: uid(), role: "user", text: q, at: new Date().toISOString() };
    let history = push(user);

    let route = routeQuestion(q, result, { applicationIds: lastMentioned(chat) });
    let routedBy: ChatMessage["routedBy"] = "deterministic";

    if (!route.deterministic && flags.aiExplanations) {
      setThinking(true);
      const { data, reason } = await askAi<ChatRoutePayload>("chat", { question: q }, {
        ledger,
        onCall: ({ ok, detail }) =>
          log({
            at: new Date().toISOString(),
            kind: "ai",
            ok,
            message: ok ? "Chat question routed by AI" : "Chat routing failed",
            detail,
          }),
      });
      setThinking(false);
      if (data) {
        route = routeFromAi(data, result);
        routedBy = "ai";
      } else if (reason) {
        history = [
          ...history,
          {
            id: uid(),
            role: "assistant",
            text: `The AI could not be reached, so I answered from the rules alone. ${reason}`,
            at: new Date().toISOString(),
          },
        ];
      }
    }

    if (route.intent === "update" && route.patches.length > 0) {
      const lines = route.patches
        .map(
          (p) =>
            `${p.applicationId} ${FIELD_LABELS[p.field] ?? p.field}: ${p.oldValue ?? "not stated"} → ${p.newValue ?? "not stated"}`,
        )
        .join("; ");
      const proposal: ChatMessage = {
        id: uid(),
        role: "assistant",
        text: flags.autoApplyChatUpdates
          ? `Reading that as a change — ${lines}.`
          : `I read that as a change: ${lines}. Nothing is applied until you say so.`,
        routedBy,
        intent: "update",
        patches: route.patches,
        at: new Date().toISOString(),
      };
      const next = [...history, proposal];
      setChat(next);
      if (flags.autoApplyChatUpdates) runPatches(route.patches, next, proposal.id);
      return;
    }

    const answer = answerQuestion(q, route, result, policy);
    setChat([
      ...history,
      {
        id: uid(),
        role: "assistant",
        text: answer.text,
        routedBy,
        intent: route.intent,
        citations: answer.citations,
        at: new Date().toISOString(),
      },
    ]);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ask &amp; Update</h1>
        <p className="text-sm text-muted">
          Questions are answered from the stored result, with the rule IDs behind every claim. Tell
          it something new and it proposes a change you can apply.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Conversation"
          subtitle={
            flags.aiExplanations
              ? "Matched questions never leave the browser. Only an unmatched one is sent to the AI, and even then the AI only picks the intent."
              : "AI is off, so only questions the rules can match will be answered."
          }
          action={
            chat.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setChat([])}>
                Clear
              </Button>
            ) : null
          }
        />

        <div className="max-h-[55vh] space-y-3 overflow-y-auto px-4 py-4">
          {chat.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing asked yet. Try one of the questions below.
            </p>
          ) : null}

          {chat.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-xl bg-stone-900 px-3 py-2 text-sm text-white"
                    : "max-w-[90%] space-y-2 rounded-xl border border-line bg-stone-50 px-3 py-2 text-sm"
                }
              >
                <p>{m.text}</p>

                {m.role === "assistant" && m.routedBy ? (
                  <Badge routedBy={m.routedBy} intent={m.intent} />
                ) : null}

                {m.citations?.length ? (
                  <ul className="space-y-0.5 border-t border-line pt-2">
                    {m.citations.map((c, i) => (
                      <li key={`${c.ruleId}-${i}`} className="flex gap-2 text-xs text-muted">
                        <RuleTag id={c.ruleId} />
                        <span>{c.detail}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {m.patches?.length ? (
                  <div className="flex flex-wrap gap-2 border-t border-line pt-2">
                    {m.versionId ? (
                      <span className="text-xs text-muted">Applied in version {m.versionId}.</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => runPatches(m.patches!, chat, m.id)}
                      >
                        Apply and re-run
                      </Button>
                    )}
                    <span className="self-center text-xs text-muted">
                      Quoted from you: “{m.patches[0].sourceQuote}”
                    </span>
                  </div>
                ) : null}

                {m.diff?.length ? (
                  <ul className="space-y-0.5 border-t border-line pt-2 text-xs">
                    {m.diff.map((d) => (
                      <li key={d.key}>
                        <Link
                          href={`/applicants/${encodeURIComponent(d.applicationId)}`}
                          className="font-mono underline underline-offset-2"
                        >
                          {d.applicationId}
                        </Link>{" "}
                        <span className="text-muted">
                          {d.fromStatus ?? "new"} → {d.toStatus}
                          {d.displaced ? " (lost their pin)" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ))}

          {thinking ? <p className="text-sm text-muted">Asking the AI to read that one…</p> : null}
          <div ref={endRef} />
        </div>

        <form
          className="flex gap-2 border-t border-line px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask why a decision was made, or state a change…"
            aria-label="Your question"
            className="h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-sm"
          />
          <Button type="submit" variant="primary" disabled={thinking || draft.trim() === ""}>
            Ask
          </Button>
        </form>
      </Card>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <Button key={s} size="sm" variant="secondary" onClick={() => void send(s)}>
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <AppShell>
      <RequireData>{(result) => <Chat result={result} />}</RequireData>
    </AppShell>
  );
}
