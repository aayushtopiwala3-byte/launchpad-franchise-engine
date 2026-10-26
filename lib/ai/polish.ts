/**
 * AI-4 guard. Polish may only change wording, so any number, pin code, date or ID that
 * differs from the template means the rewrite is discarded and the template is used.
 */

const ID_TOKEN = /\b[A-Z]{2,}-\d+\b/g;

/** Every token that carries meaning a partner could act on. */
function facts(text: string): { numbers: string[]; tokens: string[] } {
  const tokens = (text.match(ID_TOKEN) ?? []).map((t) => t.toUpperCase());
  // IDs are compared whole, so their digits must not also count as free-standing numbers.
  const numbers = (text.replace(ID_TOKEN, " ").match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) =>
    n.replace(/,/g, ""),
  );
  return { numbers, tokens };
}

const sameMultiset = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

export interface PolishCheck {
  accepted: boolean;
  text: string;
  reason: string | null;
}

export function checkPolish(template: string, polished: string): PolishCheck {
  const trimmed = polished.trim();
  if (trimmed.length === 0) {
    return { accepted: false, text: template, reason: "The AI returned an empty message." };
  }

  const before = facts(template);
  const after = facts(trimmed);

  if (!sameMultiset(before.numbers, after.numbers)) {
    return {
      accepted: false,
      text: template,
      reason: `Numbers changed: template had ${before.numbers.join(", ") || "none"}, the rewrite had ${after.numbers.join(", ") || "none"}.`,
    };
  }
  if (!sameMultiset(before.tokens, after.tokens)) {
    return {
      accepted: false,
      text: template,
      reason: `Identifiers changed: template had ${before.tokens.join(", ") || "none"}, the rewrite had ${after.tokens.join(", ") || "none"}.`,
    };
  }
  // A rewrite twice the length is adding something, whatever the numbers say.
  if (trimmed.length > template.length * 2) {
    return { accepted: false, text: template, reason: "The rewrite added too much new text." };
  }

  return { accepted: true, text: trimmed, reason: null };
}
