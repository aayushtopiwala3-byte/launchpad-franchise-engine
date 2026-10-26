# Launchpad — Franchise Expansion Engine — Build Plan

**Golden rule: rules decide, AI explains.** Every status, score, rank and allocation comes from
pure deterministic TypeScript in `lib/engine/`. AI only reads messy free text, routes chat and
phrases sentences.

**Second golden rule: never invent a fact.** Any value not present in the uploaded file renders
as "not stated".

---

## Phases

| # | Phase | Exit condition |
|---|---|---|
| 1 | Scaffold, PLAN, types, Zod schemas, policy defaults | `npm run build` passes |
| 2 | Parser + normaliser + data-quality engine | parser/quality tests green |
| 3 | Rules engine: gates, readiness, score, allocation, invariants | engine tests green |
| 4 | Seed workbook generator + 22-case expectation suite | `SEED_EXPECTATIONS.md` locked as snapshot |
| 5 | UI: upload, command centre, applicant list, decision card, territory board | journey walkable |
| 6 | Onboarding planner, counterfactuals, partner messages, partner view | all render |
| 7 | AI layer with deterministic fallbacks | AI tests green, fallback parity |
| 8 | Fail-safe, feature switches, policy profiles, feedback loop, calibration | switch-equivalence test green |
| 9 | Export, data-quality report, what-changed timeline, explain mode | export opens in Excel |
| 10 | Full acceptance run (all-on and all-off), deploy, README + Components Map | live URL verified in incognito |
| 11 | DECK / VIDEO_SCRIPT / JUDGE_TEST_PLAN / REPORT | written |

---

## Data flow

```
file ─> parse ─> normalise (+log) ─> quality ─> gates ─> readiness ─> score ─> allocate
     ─> onboarding + counterfactual + messages ─> render

chat patch ─> snapshot ─> re-run the same pipeline ─> diff ─> new version
```

The whole pipeline is a single pure function `runPipeline(input, policy, asOfDate) => Result`.
No I/O, no randomness, no `Date.now()` inside. Same input always produces the same output.

---

## File tree

```
app/
  page.tsx                     Landing + upload + load sample
  dashboard/page.tsx           Command Centre
  applicants/page.tsx          Table with filters
  applicants/[id]/page.tsx     Decision card
  territories/page.tsx         Territory board
  chat/page.tsx                Ask & Update
  quality/page.tsx             Data-quality report
  policy/page.tsx              Workspace settings, profiles, impact preview
  calibration/page.tsx         Feedback + override analytics
  timeline/page.tsx            What-changed versions and diffs
  system/page.tsx              System log + health detail
  partner/[token]/page.tsx     Partner view, no login
  api/ai/route.ts              Server-side Gemini proxy, cost cap, cache

lib/
  types.ts                     All domain types
  schemas.ts                   Zod schemas for AI responses + profile import
  reference.ts                 Allowed cities/pins/tiers/languages
  engine/
    normalise.ts  N-01..N-09 + normalisation log
    quality.ts    DQ-01..DQ-13
    gates.ts      G-01..G-04 + R-01..R-05
    score.ts      5 components, 100 points
    allocate.ts   Pass A / B / C
    onboarding.ts 8 steps, dated, owners, checklists
    counterfactual.ts  minimal-change re-run
    invariants.ts one store per pin
    pipeline.ts   the single pure entry point
    index.ts
  parse/
    headers.ts    header-row detection by name match, never row number
    exampleRow.ts exact-match template example detection
    workbook.ts   sheet discovery + row extraction (xlsx/xls/csv)
    template.ts   blank-template generator
  ai/
    model.ts      pinned resolved model id + flash guard
    client.ts     fetch wrapper: JSON only, zod, temp 0, 8s, 1 retry, cache, cost ledger
    classify.ts   AI-1 business relevance
    contradictions.ts AI-2 notes vs fields (DQ-13)
    chat.ts       AI-3 deterministic router first, AI only on miss
    polish.ts     AI-4 message polish with number-preserving post-check
    fallbacks.ts  the deterministic twin of every call above
  state/
    store.ts      React context + reducer, the single client store
    persistence.ts localStorage with corruption recovery
    versions.ts   version log + diffs
    features.ts   feature switches + URL encoding
    policy.ts     policy profiles + presets + impact preview
    health.ts     four lamps + system log
  messages/
    en.ts kn.ts hi.ts render.ts
  seed/
    applications.ts territories.ts stores.ts workbook.ts
  export/
    workbook.ts   processed workbook writer

components/ ...  (hand-rolled, shadcn-style primitives in components/ui)
tests/  engine/ parse/ ai/ seed/ acceptance/
```

---

## Data model

- **Applicant** — raw fields, normalised fields, territoryId, tier, flags[], gateResults[],
  readinessResults[], score + breakdown, status, reasonCode, reasonSentence, rank, assignedPin,
  reservedUntil, competitors[], counterfactual, onboardingPlan, messages{kn,hi,en}, partnerToken,
  trace[].
- **Territory** — id, city, state, pins[], tier, openSlots, priority, freePins[], occupiedPins[],
  usableCapacity, queue[], flags[].
- **ExistingStore** — id, city, pin, opened, source: "embedded" | "uploaded".
- **QualityIssue** — id, severity, sheet, row, column, originalValue, message, actionTaken.
- **NormalisationLogEntry** — ruleId, sheet, row, column, from, to.
- **DecisionTraceEntry** — ruleId, description, values{}, outcome, competitorId?.
- **Version** — versionId, createdAt, trigger, patch, snapshot of all statuses, diff vs previous.
- **PolicyProfile** — name, tier thresholds, score weights, reservation window, realistic-time
  constants, onboarding template, message templates, version, createdAt.
- **FeatureFlags** — one boolean per switch.
- **Feedback / Override / CostLedgerEntry** — as specified in the brief.

---

## The five decision states

| State | Colour | Meaning |
|---|---|---|
| APPROVED | green | Passes all gates and readiness and wins a slot at a free pin |
| WAITLISTED | amber | Ready but capacity exhausted; shows rank and what would move them up |
| ON HOLD | blue | Blocked by something fixable; always shows unlock condition + deadline |
| REDIRECTED | purple | Their pin cannot take a store but named free pins exist. Advisory only |
| NOT PROCEEDING | grey | Hard gate failed with no fixable path now |

---

## Testing strategy

1. **Unit** — parser, normaliser (N-01..N-09), quality (DQ-01..DQ-13), gates (G-01..G-04),
   readiness (R-01..R-05), every score band boundary, allocation passes A/B/C.
2. **Invariant** — no pin claimed or reserved twice, on every fixture, plus 50 randomised row-order
   shuffles asserting row order never changes the outcome.
3. **Determinism** — same workbook twice, hash the full result, compare.
4. **Seed expectations** — all 22 cases, locked snapshot.
5. **Feature-switch equivalence** — all switches on vs all off, byte-identical verdicts.
6. **Chat** — every scripted judge question, with AI disabled.
7. **AI layer** — schema rejection, retry, fallback, evidence-quote substring check, polish
   number-preservation, cost ceiling.
8. **Fail-safe** — rollback on throw, invariant violation caught, corrupt storage reset, `?safe=1`.
