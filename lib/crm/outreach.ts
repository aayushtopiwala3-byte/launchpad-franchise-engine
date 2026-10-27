// The deterministic twin of the AI outreach draft. Same shape, no model, no network.
//
// It exists so that drafting never depends on Gemini being reachable, and so that the AI
// version has something to be compared against. Both return a body plus an explicit list of
// placeholders: anything the writer must supply is a gap in square brackets, never a guess.
// Neither version ever promises exclusivity, approval, a timeline or a return, because the
// brand has authorised no such promise and a lead record contains none.

import type { Lead, OutreachPurpose } from "./types";

export interface OutreachContent {
  subject: string | null;
  body: string;
  placeholders: string[];
}

const SIGN_OFF = "[Your name]\n[Your role], [Brand name]";

/** Square-bracketed gaps are collected from the finished text, so the list cannot drift. */
function collect(body: string, subject: string | null): string[] {
  const found = new Set<string>();
  for (const match of `${subject ?? ""}\n${body}`.matchAll(/\[([^\]]+)\]/g)) {
    found.add(match[1]);
  }
  return Array.from(found);
}

function firstName(lead: Lead): string {
  const cleaned = lead.name.replace(/^Sample — /, "").trim();
  return cleaned.split(/\s+/)[0] || "there";
}

export function templateOutreach(lead: Lead, purpose: OutreachPurpose): OutreachContent {
  const name = firstName(lead);
  const place = lead.city ?? "[city]";
  const lines: string[] = [];
  let subject: string | null = null;

  switch (purpose) {
    case "First contact":
      subject = `Your franchise enquiry — [Brand name]`;
      lines.push(
        `Dear ${name},`,
        "",
        `Thank you for your interest in opening a store with us in ${place}. I am the person looking after enquiries in your area.`,
        "I would like to understand what you have in mind — the kind of site you are considering, your timing, and what you would want from us.",
        "Would a short call suit you this week? [Suggest two times].",
      );
      break;

    case "Follow-up after no response":
      subject = `Following up on your franchise enquiry`;
      lines.push(
        `Dear ${name},`,
        "",
        `I wrote to you recently about a franchise in ${place} and have not heard back, which is no trouble at all.`,
        "If the timing is wrong, tell me and I will leave it there. If it is still of interest, I am happy to pick up wherever is useful.",
      );
      break;

    case "Request for missing information":
      subject = `A few details to take this further`;
      lines.push(
        `Dear ${name},`,
        "",
        "Thank you for the conversation so far. To take this to the next step I need a few things we have not covered:",
        "[List the specific details you need].",
        "Once I have those I can tell you exactly what happens next.",
      );
      break;

    case "Invitation to apply":
      subject = `Your franchise application`;
      lines.push(
        `Dear ${name},`,
        "",
        "Thank you for the time you have given this so far. The next step is a formal application.",
        "[Application link].",
        "The form asks for your premises details, your investment capacity and your target opening. It is reviewed against the same written criteria for everyone, and I will let you know the outcome as soon as it is decided.",
      );
      break;

    case "Request for site details":
      subject = `The site you mentioned`;
      lines.push(
        `Dear ${name},`,
        "",
        `You mentioned a site in ${place}. Could you send me the pin code, the floor, and the approximate size in square feet?`,
        "The pin code matters most — it decides which territory the site falls in, and I cannot check availability without it.",
      );
      break;

    case "Meeting confirmation":
      subject = `Confirming our meeting`;
      lines.push(
        `Dear ${name},`,
        "",
        "Confirming our meeting on [date] at [time], at [place].",
        "If that no longer works, tell me and I will move it.",
      );
      break;

    case "Next-step summary":
      subject = `Where we got to, and what happens next`;
      lines.push(
        `Dear ${name},`,
        "",
        "Thank you for your time today. To put it in writing so nothing is lost:",
        "[What we agreed].",
        "[What I will do next, and by when].",
        "[What you said you would send].",
      );
      break;
  }

  if (lead.consentToContact === false) {
    lines.push(
      "",
      "Note for the sender: this lead is recorded as not having agreed to be contacted. Check before sending.",
    );
  }

  lines.push("", "With best wishes,", SIGN_OFF);
  const body = lines.join("\n");
  return { subject, body, placeholders: collect(body, subject) };
}
