const INTENTS: Record<string, string> = {
  explain: "why a decision was made",
  status: "current status",
  competitors: "who competed",
  capacity: "free slots",
  counts: "how many",
  update: "a stated change",
  "no-change": "a stated fact the file already records",
  unknown: "no matching question",
};

/**
 * States out loud which path produced the answer. A judge should never have to guess
 * whether a sentence came from the rules or from a model.
 */
export function Badge({ routedBy, intent }: { routedBy: "deterministic" | "ai"; intent?: string }) {
  const what = intent ? INTENTS[intent] ?? intent : null;
  return (
    <p className="text-xs text-muted">
      {routedBy === "deterministic"
        ? "Matched by the rules — no AI call was made."
        : "The rules could not match this, so the AI picked the intent. The answer itself is still rule-written."}
      {what ? ` Read as: ${what}.` : ""}
    </p>
  );
}
