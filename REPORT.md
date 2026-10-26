# Build report

**Launchpad — Franchise Expansion Engine** · Ops Hackathon Case 1
Aayush Topiwala · Durgesh Panchal · 26 October 2026

This is the honest account of what was built, what was measured, what was decided where the
brief was silent, and what was not finished. Section 9 is the one to read if you are short of
time — it is the list of things this build does **not** do.

---

## 1 · Where it lives

| | |
| --- | --- |
| **Live MVP** | https://launchpad-franchise-engine.vercel.app |
| **Repository** | https://github.com/aayushtopiwala3-byte/launchpad-franchise-engine |

Public, no login, no API key, nothing to install. Verified logged-out, in a clean browser
profile, and at 390 × 844 mobile width. Hosted on Vercel production; nothing expires before
28 October 2026 EOD IST.

The engine runs in the browser. The only server route is `/api/ai`, which exists solely to
keep the Gemini key off the client.

---

## 2 · Test results

**318 tests across 18 files. 318 passed, 0 failed, 0 skipped.** `npm test`, on a clean
checkout, with no `GEMINI_API_KEY` set and no network reachable from the suite.

| Area | File | Tests |
| --- | --- | --- |
| Acceptance | `tests/acceptance/switches.test.ts` | 10 |
| AI | `tests/ai/router.test.ts` · `polish` · `enrichment` | 34 |
| Chat | `tests/chat/scenarios.test.ts` | 14 |
| Engine | `normalise` 70 · `score` 34 · `gates` 23 · `allocate` 21 · `quality` 19 · `determinism` 5 · `partner-token` 3 | 175 |
| Parse | `tests/parse/workbook.test.ts` | 16 |
| Export | `tests/export/workbook.test.ts` | 14 |
| Seed | `expectations` 27 · `workbook` 3 | 30 |
| State | `versions` 16 · `calibration` 9 | 25 |

**Failures: none.** Nothing was skipped, marked `.todo`, or quietly removed to get the suite
green. `npx tsc --noEmit` is clean and `npm run build` compiles all routes.

The tests worth reading first:

| File | What it pins down |
| --- | --- |
| `tests/acceptance/switches.test.ts` | No switch, preset or individual flag changes a status, reason code, score, rank, territory or pin |
| `tests/engine/determinism.test.ts` | Same input → same `resultHash`; row order is irrelevant |
| `tests/engine/allocate.test.ts` | One store per pin, counting the 9 existing stores, across 50 randomised row-order shuffles |
| `tests/seed/expectations.test.ts` | The full locked decision matrix, cell for cell, plus the 22 cases of §11.3 |
| `tests/chat/scenarios.test.ts` | The §12 chat scenarios end to end, with AI disabled |
| `tests/export/workbook.test.ts` | Export round-trips, sorts, and is byte-identical across two runs |
| `tests/state/versions.test.ts` | Diffs catch a rank slip, not just a status flip; undo is exact |

---

## 3 · The 22 cases of §11.3

All 22 are asserted in `tests/seed/expectations.test.ts` under
`describe("the twenty-two cases section 11.3 asks the seed to demonstrate")`, except where
noted. Every one passes.

| # | Case | Row(s) | Result |
| --- | --- | --- | --- |
| 1 | Clean strong applicant approved | APP-002 | ✅ APPROVED, score 100, pin 570001 |
| 2 | Same-pin conflict, loser redirected | APP-003 | ✅ REDIRECTED to named free pins 570011, 570016 |
| 3 | More ready applicants than slots → waitlist with rank | APP-004 | ✅ WAITLISTED, rank 5 of 5 in TER-03 |
| 4 | Pin holds an existing store | APP-008 | ✅ REDIRECTED (G-03), ST-06 holds 570009 |
| 5 | Pin in no territory, city has capacity | APP-009 | ✅ REDIRECTED (G-04) |
| 6 | Upper floor | APP-007 | ✅ ON HOLD (R-03) + 45-day reservation |
| 7 | Space not identified, reservation granted | APP-012 | ✅ ON HOLD (R-02), reserved to 2026-12-10 |
| 8 | Investment at 85% of minimum | APP-010 | ✅ ON HOLD (R-01), 3 lakh gap stated |
| 9 | Investment at 50% of minimum | APP-011 | ✅ NOT PROCEEDING (G-02) |
| 10 | City / pin contradiction | APP-014 | ✅ ON HOLD (G-01) |
| 11 | Notes contradict the fields | APP-015 | ✅ ON HOLD (R-05 via DQ-13) |
| 12 | Owned space, size blank | APP-016 | ✅ ON HOLD (R-04 via DQ-06), size renders *not stated* |
| 13 | Zero experience but strong → extra training week | APP-017 | ✅ APPROVED, +1 training week |
| 14 | One-month target, no space → aggressive flag | APP-018 | ✅ ON HOLD + reservation + aggressive-target flag |
| 15 | Messy values normalised and logged | APP-020, APP-021 | ✅ N-01/N-02/N-03 logged; `3000000` → 30 lakh |
| 16 | Duplicate Application ID | APP-023 ×2 | ✅ first row APPROVED, second ON HOLD and excluded from allocation |
| 17 | Territory pin holds an existing store | TER-01/04/07/08 | ✅ counted as occupied, not free |
| 18 | Open slots exceed free pins | TER-01, TER-04 | ✅ capacity capped, and the board says why |
| 19 | High-priority territory, no ready applicant | TER-05 | ✅ surfaced as a recruitment gap |
| 20 | Tumakuru trains at ST-01, Davanagere at ST-09 | APP-018, APP-019 | ✅ both overrides applied |
| 21 | All three languages present | — | ✅ Kannada, Hindi, English |
| 22 | Template example row excluded with a notice | — | ✅ `tests/parse/workbook.test.ts` — see note |

**Note on case 22.** It is pinned in `tests/parse/workbook.test.ts` (*"reads the blank
template and excludes the grey example row"* and *"keeps the example row when the operator
asks for it"*) rather than in the seed file, because the generated sample workbook does not
carry a template row to exclude — the exclusion happens one layer earlier, in the parser.
The slot numbered 22 in `tests/seed/expectations.test.ts` is used instead for a 23rd case
worth locking: a pin claimed by two territories is ceded to the lower-numbered one (DQ-09).

---

## 4 · Was `GEMINI_API_KEY` present?

**Yes.** It is set in Vercel for production, preview and development, as a **Secret** for the
first two. It is **not** in the repository — confirmed by scanning every tracked file. The
browser never receives it; all calls go through `/api/ai`.

**The test suite runs entirely without it.** No test touches the network. The AI paths are
tested against mocked and schema-invalid responses rather than skipped, including:

- a model that **agrees** with the deterministic twin (`tests/acceptance/switches.test.ts`)
- a model that **returns nothing** — every deterministic finding must survive
- a model that **disagrees** — it may add a finding, never silence one
- a model returning **malformed JSON**, an `evidence_quote` that is not a substring of the
  input, or a polish that alters a number or a pin code — all rejected in favour of the twin

So the suite proves the fallbacks work; the live deployment proves the model path works.

---

## 5 · AI cost

**The test run cost $0.00.** The suite makes no network calls.

Measured on the live deployment, with the real key:

| | |
| --- | --- |
| Calls for the full 28-application sample | **24** (22 classify, 2 contradiction checks) |
| A fresh classify call | **136 input / 22 output tokens** |
| Cost of that call | **$0.00010** |
| **A cold run of the whole dataset** | **≈ $0.0024** |
| A re-run in the same browser | ≈ $0.00000 — 23 of 24 calls are cache hits |
| Session ceiling | **$0.50** (`NEXT_PUBLIC_AI_COST_CEILING_USD`) |

Extrapolated: at 1,000 applications a month this is roughly **$0.09 a month**. Prices come
from a constant table in `lib/ai/cost.ts` and are labelled in the UI as an estimate, because
Gemini does not return a price with the response — reporting it as fact would break the same
rule the rest of the product is built on.

The ledger is visible to the user on **System**, per call, with cache hits marked.

---

## 6 · Resolved Gemini model

**`gemini-3.8-flash`** (`lib/ai/model.ts`), shown in the UI on the System screen.

Resolved against the live `ListModels` endpoint rather than guessed: it is the newest
**stable** model (non-preview, non-image, non-TTS) whose name contains `flash` and which
answered a real `generateContent` probe. `gemini-2.5-flash` returns HTTP 404 *"no longer
available to new users"* on this key, so the brief's suggested default could not be used.

Fallback chain, used only if the resolved model is rejected at runtime:
`gemini-2.5-flash` → `gemini-2.0-flash`. A guard (`assertFlashModel`) throws rather than
calling any non-flash model, so a future edit cannot quietly make this slow and expensive.

---

## 7 · Decisions taken where the spec was silent

All 28 are recorded in [`DECISIONS.md`](DECISIONS.md) with their reasons. The ones that
changed the shape of the product:

| # | Decision | Why |
| --- | --- | --- |
| D-02 | SheetJS 0.20.3 from a **vendored tarball**, not the registry | The registry copy is pinned at 0.18.5 and carries CVE-2023-30533 and CVE-2024-22363. Vendoring also means the Vercel build needs no network fetch. |
| D-03 | Pinned model `gemini-3.8-flash` | See §6 — the brief's default 404s on this key. |
| D-06 | `asOfDate` frozen to the upload timestamp and reused for every re-run | If it drifted, reservation deadlines would change with no input change and determinism would be a lie. |
| D-07 | Engine runs client-side; the only server route is the AI proxy | Decisions must not depend on the network; the key must never reach the browser. |
| D-10 | Duplicate IDs: the **first row in sheet order** is live, later rows held | Predictable to an operator reading their own file, rather than depending on a quality ordering they cannot see. |
| D-12 | REDIRECTED applicants are ranked and traced, but consume no capacity | Advisory by the brief's definition; ranking them anyway keeps the trace complete. |
| D-13 | Partner tokens are a deterministic hash, not random | A random token would change on every re-run and invalidate links already sent. |
| D-23 | When several gates fail, the **most final** outcome wins — reject beats hold beats redirect | APP-026 fails both G-03 and G-04. First-wins would have redirected them to a city with no territory — advice that cannot be followed. |
| D-25 | Reason sentences never contain rule codes; codes live in the trace | R-05 originally read *"1 blocking data-quality issue: DQ-13"*, which is meaningless to the person the sentence is for. Pinned by an export test. |
| D-26 | Undo **adds** a version carrying the inverted patch and re-runs, rather than popping history or restoring a cached snapshot | Restoring a snapshot would leave the result and the raw rows disagreeing; popping would make an undo the one change the timeline could not show. |
| D-27 | Chat carries the previous applicant forward only for sentences that open by pointing back, and only ever to an update | "It is 450 sq ft" is plainly still about the last row; "how many are approved?" is not. The proposal names the applicant it resolved to before anything is applied. |
| D-28 | The unused `map` feature flag was removed rather than shipped switched off | A switch labelled "plots territories, stores and applicants" that nothing reads is the same failure as inventing a cell value. |

---

## 8 · Seed values adjusted, and why

The brief says the Expected column in §11.2 is normative and its arithmetic is not: run the
engine, and if a status differs, **adjust the seed, never the rule**. Two rows needed it.

| Row | Brief | Shipped | Why |
| --- | --- | --- | --- |
| **TER-08** open slots | 1 | **2** | With one slot only the higher-ranked APP-013 could hold a reservation, but case 7 needs APP-012 to hold one too. Both of TER-08's free pins can physically take a store, so 2 is the honest figure. |
| **APP-025** investment | 18 lakh | **20 lakh** | At 18 the investment check R-01 failed first and masked R-04 — the undersized 340 sq ft shop this row exists to demonstrate. Raising it to exactly the Tier 2 minimum lets the intended rule fire. |

No rule was bent to fit a figure. In both cases the seed data was wrong for the case it was
meant to demonstrate. Recorded as D-21 and D-22.

---

## 9 · What is not finished

Stated plainly, because a build report that claims everything is done is not worth reading.

**1 · The map (§9.6) was not built.** No Leaflet, no pin-code centroid dataset, no plotted
markers. This is the one substantial feature of the brief that is missing. The brief permits
skipping it if the coordinate dataset cannot be fetched; in truth it was deprioritised behind
the decision engine, the export and the audit trail, which carry the product's actual claim.
The honest consequence was a switch on `/features` labelled "Map — plots territories, stores
and applicants by pin-code centroid", wired to a `map` feature flag that nothing read. A
switch that promises a view the build does not contain is the same failure mode as inventing
a cell value, so the flag, its label and the two banners that named it were **removed**
rather than left to imply a feature. Nothing in the product now claims a map exists.

**2 · Policy profiles are editable, but not everything the brief lists is.** Working today:
tier minimum investment and space, preferred bands, acceptable floors, score component
weights, reservation window, realistic-time constants, default language, decision-state
labels, brand name — each with an impact preview before applying, three presets, and reset to
defaults. **Not editable in the UI:** the onboarding step list (durations and owners), the
message templates per status per language, and the decision-state **colours** (labels are
editable, colours are not). Profiles are named and versioned but **cannot be exported or
imported as JSON**.

**3 · No component tests.** By deliberate decision (D-20) the suite is engine, parser,
chat-router and fail-safe behaviour — all pure functions, `node` environment. Rendering is
verified by the scripted journey in `JUDGE_TEST_PLAN.md` and by hand on the deployment, not
by an automated test. A UI regression would not be caught by CI.

**4 · ESLint reports 3 errors and 1 warning**, all in `lib/state/store.tsx` and all on one
deliberate
`stateRef.current = state` latest-value idiom that the single publish path depends on for a
synchronous read. The build and typecheck are clean. This is a known, reasoned suppression
rather than an oversight, but it is not tidy.

**5 · The AI's influence on scores is real, and bounded.** With AI on, the live model reads
two business descriptions more generously than the keyword fallback, so **two scores out of
28 move** (APP-004 67→73, APP-024 58→73) and the result hash changes: **`6feb0a08` with AI
on, `fdcce84f` with AI off**. No status, rank, territory or pin moves. This is by design and
the timeline names both rows — but anyone who read "rules decide, AI explains" as "the output
is bit-identical either way" should read it as "no *verdict* changes either way", which is
what `tests/acceptance/switches.test.ts` actually enforces.

---

## 10 · The three things I would fix first with another hour

**1 · Build the map.** It is the only missing feature a judge can point at, and the data to
drive it is already in the result — every applicant and territory carries a pin code, and
every pin already has a status and a colour. The work is a centroid lookup table and a
Leaflet layer, not new logic.

**2 · Make onboarding steps and message templates editable.** The brief asks for it, and more
importantly the product's adoption argument is *"the team owns the policy."* Thresholds being
editable while the words sent to a partner are hard-coded undercuts exactly the objection the
feature exists to answer.

**3 · Add a smoke test over the rendered screens.** Not a full component suite — one test
that boots each of the 13 routes with the seed and asserts it renders without throwing. Every
guarantee in this report is enforced by a test except the one a judge experiences first,
which is that the page loads.

---

## In one line

> Not "the AI decided." **This rule decided, here is the row it read, and here is what would
> change it.**
