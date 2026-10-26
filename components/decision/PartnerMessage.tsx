"use client";

import { useState } from "react";
import { LANGUAGES } from "../../lib/reference";
import { Button, Card, CardHeader, cn } from "../ui/primitives";
import type { Applicant, Language } from "../../lib/types";

export function PartnerMessage({ applicant }: { applicant: Applicant }) {
  const preferred = applicant.normalised.preferredLanguage ?? "English";
  const [language, setLanguage] = useState<Language>(preferred);
  const [copied, setCopied] = useState(false);
  const text = applicant.messages[language] ?? "";

  return (
    <Card>
      <CardHeader
        title="Message to send them"
        subtitle={
          applicant.normalised.languageWasDefaulted
            ? "No language was stated in the file, so this defaults to English."
            : `Their stated preference is ${preferred}.`
        }
        action={
          <div className="flex gap-0.5 rounded-md border border-line p-0.5">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors",
                  language === l ? "bg-stone-900 text-white" : "text-muted hover:bg-stone-100",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        }
      />
      <div className="space-y-2 px-4 py-3">
        <p className="rounded border border-line bg-stone-50 px-3 py-2.5 text-sm whitespace-pre-wrap">
          {text}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="ghost">
              Open in WhatsApp
            </Button>
          </a>
        </div>
      </div>
    </Card>
  );
}
