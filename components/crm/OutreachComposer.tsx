"use client";

// Drafting a message. The template is the default and always works; the AI version is an
// alternative, never a replacement. Both produce the same shape, both are editable, and
// neither one sends anything — there is no send button on this page because there is no
// mail integration behind it, and a button that pretended otherwise would be a lie.

import { useState } from "react";
import { askAi } from "../../lib/ai/client";
import type { OutreachPayload } from "../../lib/ai/types";
import { templateOutreach, type OutreachContent } from "../../lib/crm/outreach";
import { OUTREACH_PURPOSES, type Lead, type OutreachPurpose } from "../../lib/crm/types";
import { useStore } from "../../lib/state/store";
import {
  Banner,
  Button,
  Card,
  CardHeader,
  Labelled,
  Select,
  TextArea,
  TextInput,
} from "../ui/primitives";

type Source = "template" | "ai";

export function OutreachComposer({ lead }: { lead: Lead }) {
  const { flags, ledger, log, saveOutreachDraft, outreachDrafts } = useStore();
  const [purpose, setPurpose] = useState<OutreachPurpose>("First contact");
  const [content, setContent] = useState<OutreachContent | null>(null);
  const [source, setSource] = useState<Source>("template");
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const saveds = outreachDrafts.filter((d) => d.leadId === lead.leadId);

  const useTemplate = () => {
    setContent(templateOutreach(lead, purpose));
    setSource("template");
    setFailed(null);
    setSaved(false);
  };

  const useAi = async () => {
    setBusy(true);
    setFailed(null);
    setSaved(false);
    const { data, reason } = await askAi<OutreachPayload>(
      "outreach",
      {
        purpose,
        channel: lead.preferredChannel ?? "Email",
        prospect: {
          name: lead.name,
          city: lead.city,
          stage: lead.stage,
          siteReadiness: lead.siteReadiness,
          investmentRangeLakh: lead.investmentRange,
          notes: lead.notes,
          lastInteraction: lead.interactions.at(-1)?.summary ?? null,
        },
      },
      {
        ledger,
        onCall: ({ ok, detail }) =>
          log({
            at: new Date().toISOString(),
            kind: "ai",
            ok,
            message: ok ? `Outreach drafted for ${lead.leadId}` : "Outreach draft failed",
            detail,
          }),
      },
    );
    setBusy(false);
    if (data) {
      setContent({ subject: data.subject, body: data.body, placeholders: data.placeholders });
      setSource("ai");
    } else {
      setFailed(reason ?? "The AI returned nothing usable.");
      setContent(templateOutreach(lead, purpose));
      setSource("template");
    }
  };

  const save = () => {
    if (!content) return;
    saveOutreachDraft({
      id: `${lead.leadId}-D${Date.now()}`,
      leadId: lead.leadId,
      purpose,
      subject: content.subject,
      body: content.body,
      createdAt: new Date().toISOString(),
      source,
    });
    setSaved(true);
  };

  return (
    <Card>
      <CardHeader
        title="Draft a message"
        subtitle="Nothing on this page sends anything. There is no mail integration behind it, so a draft is a draft until you copy it somewhere that does."
      />

      <div className="flex flex-wrap items-end gap-2 px-4 py-3">
        <Labelled label="Purpose">
          <Select
            className="w-auto"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as OutreachPurpose)}
          >
            {OUTREACH_PURPOSES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Labelled>
        <Button size="sm" variant="secondary" onClick={useTemplate}>
          Use the template
        </Button>
        {flags.aiExplanations ? (
          <Button size="sm" variant="secondary" onClick={useAi} disabled={busy}>
            {busy ? "Drafting…" : "Draft with AI"}
          </Button>
        ) : null}
      </div>

      {failed ? (
        <div className="px-4 pb-3">
          <Banner tone="warn" title="The AI draft could not be written, so the template was used">
            {failed}
          </Banner>
        </div>
      ) : null}

      {content ? (
        <div className="space-y-3 border-t border-line px-4 py-3">
          <p className="text-xs text-muted">
            {source === "ai"
              ? "Written by Gemini from this lead's record. Read every line before you use it."
              : "Written by a fixed template. No model was involved."}
          </p>

          {content.subject !== null ? (
            <Labelled label="Subject">
              <TextInput
                value={content.subject}
                onChange={(e) => setContent({ ...content, subject: e.target.value })}
              />
            </Labelled>
          ) : null}

          <Labelled label="Message">
            <TextArea
              rows={12}
              value={content.body}
              onChange={(e) => setContent({ ...content, body: e.target.value })}
            />
          </Labelled>

          {content.placeholders.length > 0 ? (
            <Banner
              tone="info"
              title={`${content.placeholders.length} thing${content.placeholders.length === 1 ? "" : "s"} you still have to fill in`}
            >
              <ul className="mt-1 list-disc pl-5">
                {content.placeholders.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              These were left blank deliberately. Nothing was invented to fill them.
            </Banner>
          ) : null}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save}>
              Save this draft
            </Button>
            {saved ? (
              <span className="text-sm text-muted">
                Saved to this browser. It has not been sent to anybody.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {saveds.length > 0 ? (
        <div className="border-t border-line px-4 py-3">
          <p className="text-xs font-medium text-muted">
            Saved drafts for this lead ({saveds.length})
          </p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {saveds.slice(0, 5).map((d) => (
              <li key={d.id} className="text-muted">
                {d.createdAt.slice(0, 10)} · {d.purpose} ·{" "}
                {d.source === "ai" ? "AI-written" : "template"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
