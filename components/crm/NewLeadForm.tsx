"use client";

// Adding a lead. Two deliberate choices here.
//
// A city we do not operate in is a warning, never a block: losing a prospect because the
// drop-down did not have their town is worse than holding a lead with an odd city on it.
//
// A possible duplicate is shown, never auto-merged. Matching on name and city is a guess,
// and silently folding two people together is far more expensive than asking.

import Link from "next/link";
import { useState } from "react";
import {
  blockingIssues,
  findDuplicates,
  nextLeadId,
  validateLead,
} from "../../lib/crm/leads";
import { LEAD_SOURCES, type Lead, type LeadSource } from "../../lib/crm/types";
import { useStore } from "../../lib/state/store";
import { Banner, Button, Card, CardHeader, Labelled, Select, TextArea, TextInput } from "../ui/primitives";

export function NewLeadForm({ onDone }: { onDone: () => void }) {
  const { leads, addLead, asOfDate, result, log } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [territoryId, setTerritoryId] = useState("");
  const [source, setSource] = useState<LeadSource>("Website enquiry");
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const draft = { name, email, phone, city };
  const issues = validateLead(draft);
  const blocking = blockingIssues(issues);
  const warnings = issues.filter((i) => !blocking.includes(i));
  const duplicates = findDuplicates(leads, draft);
  const mustAcknowledge = duplicates.length > 0 && !acknowledged;

  const submit = () => {
    if (blocking.length > 0 || mustAcknowledge) return;
    const at = `${asOfDate ?? new Date().toISOString().slice(0, 10)}T09:00:00.000Z`;
    const lead: Lead = {
      leadId: nextLeadId(leads),
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      city: city.trim() || null,
      preferredTerritoryId: territoryId || null,
      source,
      assignedTo: assignedTo.trim() || null,
      investmentRange: { minLakh: null, maxLakh: null },
      retailExperienceYears: null,
      siteReadiness: "Not stated",
      stage: "New",
      notes: notes.trim() || null,
      createdAt: at,
      lastInteractionAt: null,
      nextFollowUpAt: null,
      consentToContact: null,
      preferredChannel: null,
      linkedApplicationId: null,
      interactions: [],
      isDemo: false,
    };
    addLead(lead);
    log({
      at: new Date().toISOString(),
      kind: "storage",
      ok: true,
      message: `Lead ${lead.leadId} recorded`,
      detail: duplicates.length > 0 ? "Recorded despite a possible duplicate." : "",
    });
    onDone();
  };

  return (
    <Card>
      <CardHeader
        title="Add a lead"
        subtitle="Only a name is required. Everything else can be filled in as the conversation goes on."
      />
      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
        <Labelled label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Labelled>
        <Labelled label="Email">
          <TextInput value={email} onChange={(e) => setEmail(e.target.value)} />
        </Labelled>
        <Labelled label="Phone">
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Labelled>
        <Labelled label="City">
          <TextInput value={city} onChange={(e) => setCity(e.target.value)} />
        </Labelled>
        <Labelled label="Preferred territory">
          <Select value={territoryId} onChange={(e) => setTerritoryId(e.target.value)}>
            <option value="">Not stated</option>
            {(result?.territories ?? []).map((t) => (
              <option key={t.territoryId} value={t.territoryId}>
                {t.territoryId} · {t.city ?? "city not stated"}
              </option>
            ))}
          </Select>
        </Labelled>
        <Labelled label="Source">
          <Select value={source} onChange={(e) => setSource(e.target.value as LeadSource)}>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Labelled>
        <Labelled label="Assigned to">
          <TextInput value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
        </Labelled>
        <div className="sm:col-span-2 lg:col-span-3">
          <Labelled label="Notes">
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Labelled>
        </div>
      </div>

      <div className="space-y-2 px-4 pb-3 empty:hidden">
        {blocking.map((i) => (
          <Banner key={i.field} tone="error" title={i.message}>
            The lead cannot be recorded until this is right.
          </Banner>
        ))}
        {warnings.map((i) => (
          <Banner key={i.field} tone="warn" title={i.message}>
            Recording it anyway is fine. The city is kept exactly as typed.
          </Banner>
        ))}
        {duplicates.length > 0 ? (
          <Banner
            tone="warn"
            title={`${duplicates.length} existing lead${duplicates.length === 1 ? "" : "s"} may be the same person`}
          >
            <ul className="mt-1 space-y-0.5">
              {duplicates.map((d) => (
                <li key={d.lead.leadId}>
                  <Link
                    href={`/acquisition/${d.lead.leadId}`}
                    className="underline underline-offset-2"
                  >
                    {d.lead.name}
                  </Link>{" "}
                  matches on {d.on}
                  {d.strong ? "" : " — a weak match, so it may well be someone else"}.
                </li>
              ))}
            </ul>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span>I have looked, and this is a different person.</span>
            </label>
          </Banner>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <Button onClick={submit} disabled={blocking.length > 0 || mustAcknowledge || !name.trim()}>
          Record this lead
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
