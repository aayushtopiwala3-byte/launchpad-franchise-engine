import { FIELD_LABELS } from "../partner";
import type { Applicant, PipelineResult, PolicyProfile, Status } from "../types";
import { STATUS_WORDS, type RoutedQuestion } from "./router";

export interface Citation {
  ruleId: string;
  detail: string;
}

export interface ChatAnswer {
  text: string;
  citations: Citation[];
  /** Applicants the answer is about, so the UI can link straight to their cards. */
  applicationIds: string[];
}

const UNKNOWN =
  "I can answer questions about a decision, who competed for a territory, which territories have free slots, and how many applicants are in each state. I could not match that one.";

/** Every answer is assembled from the stored result. Nothing here calls a model. */
export function answerQuestion(
  question: string,
  route: RoutedQuestion,
  result: PipelineResult,
  policy: PolicyProfile,
): ChatAnswer {
  const missing = route.applicationIds.filter(
    (id) => !result.applicants.some((a) => a.applicationId === id),
  );
  if (missing.length > 0) {
    return {
      text: missing.map((id) => `${id} is not in the uploaded file.`).join(" "),
      citations: [],
      applicationIds: [],
    };
  }

  const found = route.applicationIds
    .map((id) => result.applicants.find((a) => a.applicationId === id))
    .filter((a): a is Applicant => !!a);

  switch (route.intent) {
    case "explain":
      return explain(found, policy);
    case "status":
      return status(found, policy);
    case "competitors":
      return competitors(found, route, result, policy);
    case "capacity":
      return capacity(result);
    case "counts":
      return counts(question, result, policy);
    case "no-change":
      return noChange(route);
    case "ambiguous":
      return ambiguous(route);
    default:
      return { text: UNKNOWN, citations: [], applicationIds: [] };
  }
}

const label = (policy: PolicyProfile, s: Status) => policy.statusLabels[s];

/**
 * Several reason sentences open with their own status ("On hold — …"). Once the answer has
 * already named the status, repeating it reads as a stutter, so the lead-in is dropped.
 */
function withoutStatusLead(sentence: string, policy: PolicyProfile, status: Status): string {
  const [lead, ...rest] = sentence.split(" — ");
  if (rest.length === 0) return sentence;
  const known = [status, label(policy, status)].map((s) => s.toLowerCase());
  return known.includes(lead.trim().toLowerCase()) ? rest.join(" — ") : sentence;
}

function explain(applicants: Applicant[], policy: PolicyProfile): ChatAnswer {
  if (applicants.length === 0) return { text: UNKNOWN, citations: [], applicationIds: [] };

  const parts: string[] = [];
  const citations: Citation[] = [];

  for (const a of applicants) {
    parts.push(
      `${a.applicationId} is ${label(policy, a.status)}. ${withoutStatusLead(a.reasonSentence, policy, a.status)}`,
    );

    const failed = [...a.gateResults, ...a.readinessResults].filter((r) => !r.passed);
    for (const r of failed) {
      citations.push({ ruleId: r.ruleId, detail: r.failReason ?? r.checked });
    }
    if (failed.length === 0) {
      for (const t of a.trace.filter((t) => t.ruleId.startsWith("A-"))) {
        citations.push({ ruleId: t.ruleId, detail: t.outcome });
      }
    }
    citations.push({
      ruleId: "S-01",
      detail: `Score ${a.score.total} of 100${a.rank === null ? "" : `, ranked ${a.rank}`}.`,
    });

    if (a.unlockCondition) parts.push(`To move forward: ${a.unlockCondition}`);
    if (a.reservedUntil) {
      parts.push(
        a.assignedPin
          ? `Pin ${a.assignedPin} is held for them until ${a.reservedUntil}.`
          : `The reservation runs until ${a.reservedUntil}.`,
      );
    }
  }

  return { text: parts.join(" "), citations, applicationIds: applicants.map((a) => a.applicationId) };
}

/** A stated fact the file already records. Saying so beats falling silent. */
function noChange(route: RoutedQuestion): ChatAnswer {
  const applicationId = route.unchanged[0].applicationId;
  const said = route.unchanged.map(
    (p) => `${FIELD_LABELS[p.field] ?? p.field} is already ${p.newValue}`,
  );
  return {
    text: `Nothing to change — ${applicationId}'s ${said.join(", and ")}.`,
    citations: [],
    applicationIds: [applicationId],
  };
}

/**
 * Two applicants, one stated fact. The engine will not choose between them, so the answer
 * hands the choice back rather than applying the change to whichever was named first.
 */
function ambiguous(route: RoutedQuestion): ChatAnswer {
  const named = route.applicationIds;
  return {
    text: `That could apply to ${named.slice(0, -1).join(", ")} or ${named[named.length - 1]}, so nothing has been changed. Say it again naming one of them, and I will propose the change for that applicant only.`,
    citations: [],
    applicationIds: named,
  };
}

function status(applicants: Applicant[], policy: PolicyProfile): ChatAnswer {
  if (applicants.length === 0) return { text: UNKNOWN, citations: [], applicationIds: [] };

  const parts = applicants.map((a) => {
    const where = a.assignedPin
      ? `Pin ${a.assignedPin} in ${a.territoryId} is held for them${a.reservedUntil ? ` until ${a.reservedUntil}` : ""}.`
      : a.territoryId
        ? `They map to ${a.territoryId} but hold no pin.`
        : "They are not mapped to a territory.";
    return `${a.applicationId} (${a.normalised.applicantName ?? "name not stated"}) is ${label(policy, a.status)}. ${where} Next step: ${a.nextStep}`;
  });

  return {
    text: parts.join(" "),
    citations: applicants.map((a) => ({
      ruleId: a.reasonCode,
      detail: a.reasonSentence,
    })),
    applicationIds: applicants.map((a) => a.applicationId),
  };
}

function competitors(
  applicants: Applicant[],
  route: RoutedQuestion,
  result: PipelineResult,
  policy: PolicyProfile,
): ChatAnswer {
  if (applicants.length > 0) {
    const a = applicants[0];
    if (a.competitors.length === 0) {
      return {
        text: `Nobody else competed with ${a.applicationId}. ${a.reasonSentence}`,
        citations: [{ ruleId: a.reasonCode, detail: a.reasonSentence }],
        applicationIds: [a.applicationId],
      };
    }
    const lines = a.competitors.map(
      (c) =>
        `${c.applicationId} (${c.applicantName ?? "name not stated"}) scored ${c.score} and is ${label(policy, c.status)}${c.whyRankedHigher ? ` — ${c.whyRankedHigher}` : ""}`,
    );
    return {
      text: `${a.applicationId} scored ${a.score.total}. Competing for the same pin code: ${lines.join("; ")}.`,
      citations: a.trace
        .filter((t) => t.ruleId.startsWith("A-") || t.ruleId === "S-01")
        .map((t) => ({ ruleId: t.ruleId, detail: t.outcome })),
      applicationIds: [a.applicationId, ...a.competitors.map((c) => c.applicationId)],
    };
  }

  const territoryId = route.territoryIds[0];
  const territory = result.territories.find((t) => t.territoryId === territoryId);
  if (!territory) {
    return { text: `${territoryId ?? "That territory"} is not in the uploaded file.`, citations: [], applicationIds: [] };
  }

  const wanted = result.applicants.filter((a) => a.territoryId === territoryId);
  if (wanted.length === 0) {
    return {
      text: `Nobody applied for ${territoryId}.`,
      citations: [],
      applicationIds: [],
    };
  }
  const ordered = [...wanted].sort((x, y) => y.score.total - x.score.total);
  const lines = ordered.map(
    (a) =>
      `${a.applicationId} (${a.normalised.applicantName ?? "name not stated"}) scored ${a.score.total} and is ${label(policy, a.status)}`,
  );
  return {
    text: `${wanted.length} applicant${wanted.length === 1 ? "" : "s"} mapped to ${territoryId}: ${lines.join("; ")}.`,
    citations: [
      {
        ruleId: "A-01",
        detail: `${territoryId} has ${territory.usableCapacity} usable slot${territory.usableCapacity === 1 ? "" : "s"}.`,
      },
    ],
    applicationIds: ordered.map((a) => a.applicationId),
  };
}

/**
 * `usableCapacity` already excludes pins an existing store sits on, so only the approved and
 * reserved holders consume a slot. Counting every holder would subtract the stores twice.
 */
function freeSlots(t: PipelineResult["territories"][number]): number {
  const consumed = Object.values(t.pinHolders).filter((h) => h.kind !== "store").length;
  return Math.max(0, t.usableCapacity - consumed);
}

function capacity(result: PipelineResult): ChatAnswer {
  const open = result.territories.filter((t) => freeSlots(t) > 0);

  if (open.length === 0) {
    return {
      text: "Every territory with usable capacity is full.",
      citations: [{ ruleId: "A-01", detail: `${result.slotsFilled} slots filled, 0 open.` }],
      applicationIds: [],
    };
  }

  const lines = open.map((t) => {
    const free = freeSlots(t);
    return `${t.territoryId} (${t.city ?? "city not stated"}, ${t.priority ?? "priority not stated"} priority) has ${free} free`;
  });

  return {
    text: `${open.length} territor${open.length === 1 ? "y" : "ies"} still ${open.length === 1 ? "has" : "have"} room: ${lines.join("; ")}.`,
    citations: open
      .filter((t) => t.capacityCappedReason)
      .map((t) => ({ ruleId: "DQ-11", detail: t.capacityCappedReason as string })),
    applicationIds: [],
  };
}

function counts(question: string, result: PipelineResult, policy: PolicyProfile): ChatAnswer {
  const lower = question.toLowerCase();
  const asked = Object.entries(STATUS_WORDS).filter(([word]) => lower.includes(word));

  if (asked.length === 0) {
    return {
      text: `${result.applicants.length} applications were processed across ${result.territories.length} territories.`,
      citations: [],
      applicationIds: [],
    };
  }

  const parts = asked.map(([, s]) => {
    const who = result.applicants.filter((a) => a.status === s).map((a) => a.applicationId);
    return `${who.length} ${label(policy, s).toLowerCase()}${who.length > 0 ? ` (${who.join(", ")})` : ""}`;
  });

  return {
    text: `${parts.join("; ")}.`,
    citations: [],
    applicationIds: asked.flatMap(([, s]) =>
      result.applicants.filter((a) => a.status === s).map((a) => a.applicationId),
    ),
  };
}
