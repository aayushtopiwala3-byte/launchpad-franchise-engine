# Phase 1 — Adversarial QA, business-rule audit and stabilisation

Audit of **Launchpad — Franchise Expansion Engine** against the commit on `main`,
`1ff8042` ("Add undo, chat memory and the submission documents").

Scope was auditing, testing, defect-fixing and reliability. **No feature was added.** No
business threshold was changed to make a test pass. No existing test was deleted and no
assertion was weakened; where a fix changed a string two tests asserted, each was rewritten
to assert the same contract **plus** an additional claim, and both rewrites are quoted in
full in section C.

---

## A · Executive summary

**Release ready: CONDITIONAL.**

The engine is sound. Seven defects were found, all seven are fixed, and the fixes moved no
seed verdict — the pinned sample hash `fdcce84f` is unchanged from before this audit to
after it. The suite went from 321 tests across 18 files to **537 across 28** — 215 new tests
in 10 new adversarial files, plus one added to `determinism.test.ts`, all of them
adversarial rather than confirmatory.

The condition is not a code condition. **The live site at
https://launchpad-franchise-engine.vercel.app still runs `1ff8042` — the pre-audit commit,
with none of the seven fixes.** Everything in section C was verified against a local build.
Until the branch is committed and deployed, a judge opening the public link gets the
version in which D-2 and D-3 are live. The release decision is therefore: ship the fixes,
then re-run the deployed smoke list in section F.

### Top five risks

1. **The deployed build is the unfixed one.** D-2 (a non-Excel upload silently replacing a
   judge's loaded data with an empty set) and D-3 (an applicant rejected outright on a
   figure the engine invented) are both reachable on the public URL today. This is the only
   P1-grade risk remaining and it is a deploy, not a code change.
2. **AI classification can move a rank.** A model reading a free-text business description
   can shift the business component by up to its full weight, **15 of 100**. It cannot
   touch a status, a reason code, a pin or a territory — `tests/acceptance/switches.test.ts`
   enforces that against every switch and preset. But under scarcity two applicants
   separated by fewer than 15 points can swap rank depending on whether AI is on. This is
   by design and one switch away from deterministic; it is a risk because the documents
   previously undersold it. Section D-4 states the boundary.
3. **No component-level test coverage.** Vitest runs in the `node` environment with no DOM,
   so every defect with a UI surface — the D-6 panel, all of D-7 — is **browser-verified
   only**. A regression in a `.tsx` file would not be caught by `npm test`. The engine is
   covered; the rendering of it is not.
4. **`resultHash` is array-order dependent while every verdict is order-invariant.** Fifty
   shuffles move no status, score, rank or pin, and move the hash every time. A judge who
   re-sorts the sheet and then compares hashes will see a difference and may read it as
   non-determinism. Now pinned by a test and corrected in three documents, but it remains a
   presentation hazard.
5. **Reservation deadlines recompute from the run's as-of date.** They do not age between
   runs. Re-running the same file on a later as-of date issues a later deadline rather than
   expiring the earlier one. Correct for a demo decided as of a fixed date; wrong for a desk
   that runs this weekly. Documented in section D-1, not changed — changing it is a business
   decision, not a bug fix.

### Tested vs not tested

| | |
| --- | --- |
| **Tested — local suite** | All 12 areas A–L and the §4 invariants. 537 tests, 28 files, 686 ms, all passing. `npx tsc --noEmit` clean. `npm run build` exit 0. |
| **Tested — local browser** | Upload of a corrupt file, the full chat→propose→apply→re-run loop, undo, all 10 data pages, the hydration fix, the D-6 panel, the D-4 competitor list. Against `npm run dev` on port 3000. |
| **Not tested — deployed** | Every functional claim. The only thing ever run against the public URL is an HTTP-status sweep: 11 routes, all 200, 0.13–0.51 s. **No deployed functional test has been performed, and none is claimed anywhere in this report.** |
| **Not tested — at all** | Component rendering under test (no DOM environment). Concurrent multi-tab writes to `localStorage`. Real Gemini latency or quota behaviour under load — the AI path is tested against a stub and against a deliberately hostile stub, not against the live model under stress. Any browser other than the Chromium build driving the preview tool. |

---

## B · Requirements traceability

Each area from the brief, the file that covers it, and what the coverage actually asserts.

| Area | Requirement | Covering tests | Count | Result |
| --- | --- | --- | --- | --- |
| **A** | Original-workbook compatibility | `tests/adversarial/workbook.test.ts`, `tests/parse/workbook.test.ts`, `tests/seed/workbook.test.ts` | 15 + 16 + 3 | PASS |
| **B** | Existing stores, duplicate-PIN protection | `tests/adversarial/invariants.test.ts` ("existing stores are never built over", "two applicants cannot hold one pin"), `tests/engine/allocate.test.ts` | 23 + 21 | PASS |
| **C** | Territory matching, capacity, allocation | `tests/adversarial/allocation.test.ts`, `tests/engine/allocate.test.ts` | 19 + 21 | PASS |
| **D** | Missing, contradictory and low-quality data | `tests/adversarial/data.test.ts`, `tests/engine/quality.test.ts`, `tests/engine/normalise.test.ts` | 33 + 19 + 73 | PASS — D-3, D-6 fixed here |
| **E** | Decision correctness and explanation integrity | `tests/adversarial/decisions.test.ts`, `tests/engine/gates.test.ts`, `tests/engine/score.test.ts` | 23 + 23 + 34 | PASS — D-5 fixed here |
| **F** | Chat updates and conversational memory | `tests/adversarial/chat.test.ts`, `tests/chat/scenarios.test.ts`, `tests/ai/router.test.ts` | 16 + 14 + 23 | PASS — D-1 fixed here |
| **G** | Reservations, deadlines, waitlist promotion | `tests/adversarial/reservations.test.ts` | 16 | PASS, with the ageing caveat in D-1 |
| **H** | Undo, timeline, state consistency | `tests/adversarial/state.test.ts`, `tests/state/versions.test.ts` | 22 + 16 | PASS |
| **I** | Settings, scoring, policy profiles | `tests/adversarial/policy.test.ts`, `tests/state/calibration.test.ts` | 31 + 9 | PASS |
| **J** | Safe mode and AI independence | `tests/adversarial/ai.test.ts`, `tests/acceptance/switches.test.ts`, `tests/ai/*` | 17 + 10 + 11 | PASS |
| **K** | Data quality, persistence, recovery | `tests/adversarial/state.test.ts`, `tests/adversarial/data.test.ts` | 22 + 33 | PASS — D-2 fixed here |
| **L** | Public-demo and release readiness | `tests/seed/expectations.test.ts`, `tests/export/workbook.test.ts`, `tests/engine/partner-token.test.ts` | 27 + 14 + 3 | PASS locally; **deployed state is the open condition** |
| **§4** | Invariants and properties | `tests/adversarial/invariants.test.ts`, `tests/engine/determinism.test.ts` | 23 + 6 | PASS |

Counts are per file and files serve more than one area, so they do not sum to 537.

The §4 invariant file asserts five properties directly, each over generated inputs rather
than one fixture: no approved or reserved applicant ever holds a pin an existing store
holds; no pin is ever held twice; approvals never exceed `openSlots`; **a high score never
buys its way past a hard gate** (a perfect-scoring applicant failing any R-rule is never
approved); and the engine's own `invariantViolation` assertion is itself exercised by
feeding it a deliberately corrupt allocation to confirm it fires rather than sitting
permanently null.

---

## C · Defect register

Seven defects. Three P1, four P2, no P0. All fixed, all verified.

### D-1 · P1 · A sentence naming two applicants patched only the first

**Repro.** Chat: `APP-012 and APP-013 both now have 45 lakh investment`.
**Expected.** Either both patched, or a refusal to guess.
**Actual.** A proposal for APP-012 alone. APP-013 was dropped with no mention.
**Root cause.** The router's extraction took the first ID match and returned, so a second
subject was structurally invisible — it was not an ambiguity the code resolved badly, it was
one the code could not see.
**Fix.** A new `ambiguous` intent in `lib/ai/router.ts` plus a `statedChanges()` pass that
collects every subject in the sentence; when more than one is present the router answers
with a clarification instead of a patch.
**Regression test.** `tests/adversarial/chat.test.ts`, `describe("ambiguity is never
resolved by guessing")`.
**Verification.** Local suite.

### D-2 · P1 · A non-Excel upload wiped the loaded dataset

**Repro.** Load the sample, then upload a `.txt` renamed `.xlsx`.
**Expected.** Fail closed, keep the previous result on screen — this is exactly what
`JUDGE_TEST_PLAN.md` C3 promises.
**Actual.** The parser returned an empty-but-valid result, which `publish` then committed.
The judge's 28 decisions were replaced by zero, and the promise in C3 was false.
**Root cause.** `lib/parse/workbook.ts` treated "no recognisable header in either sheet" as
an empty workbook rather than as a refusal.
**Fix.** `parseWorkbook` now throws in that case. `publishParse` in `lib/state/store.tsx`
already try/catches, sets parser health red, logs it, and crucially **does not call
`publish`** — so the throw is what makes the documented behaviour true.
**Regression test.** `tests/adversarial/workbook.test.ts`, `describe("input the parser must
refuse rather than guess at")`.
**Verification.** Local suite **and local browser** — synthesised a `text/plain` File via
`DataTransfer` and dropped it on the live upload control; the parser lamp went red with a
readable message while "28 rows decided" stayed on screen.

### D-3 · P1 · A figure above 1,000 was re-read as rupees, and the applicant rejected on the invented value

**Repro.** An Investment cell reading `5000`.
**Expected.** 5000 is ambiguous — it is either 5000 lakh or 5000 rupees, and the file does
not say. Something must be said about that; nothing may be asserted.
**Actual.** N-01 divided by 100,000, produced **0.05 lakh**, and R-01 then rejected the
applicant with *"Investment of 0.05 lakh is 19.95 lakh short of the 20 lakh minimum"* — a
sentence stating a figure that appears nowhere in the file. The worst defect found: the
engine invented a fact and then made a verdict out of it.
**Root cause.** The rupee-conversion heuristic had no plausibility floor, so any value in
the ambiguous band converted silently.
**Fix.** `lib/engine/normalise.ts` gained `RUPEES_ABOVE = 1000` and
`PLAUSIBLE_MIN_LAKH = 1`; a conversion landing below the floor returns `null` rather than a
number, and `investmentUnitsAreAmbiguous()` exposes the case. `lib/engine/quality.ts`
suppresses DQ-01 for that column (which would have said "blank", also untrue) and emits a
**blocking DQ-07** instead. `lib/engine/gates.ts` R-01 now branches three ways so the
failure reason distinguishes *unreadable units* from *not stated* from *genuinely short*.
**Regression test.** `tests/adversarial/data.test.ts` and `tests/engine/normalise.test.ts`.
**Verification.** Local suite **and a full browser walk-through**: typed the figure in via
chat, applied the patch, and watched APP-023 move **Approved → On hold** — not to Not
proceeding on a fabricated 0.05 — carrying a truthful R-01, an R-05 with DQ-07, a correct
counterfactual, and its pin held provisionally under A-03.

### D-4 · P2 · A duplicate-ID applicant was listed as its own competitor

**Repro.** Two rows sharing one Application ID in the same pin.
**Expected.** An applicant is not in competition with itself.
**Actual.** The same-pin sweep compared on a composite key, so the row matched itself and
appeared in its own competitor list.
**Fix.** `lib/engine/pipeline.ts` skips on Application ID, not on the key.
**Regression test.** Covered by `tests/adversarial/allocation.test.ts`.
**Verification.** Local suite and local browser.

### D-5 · P1 · Model prose was interpolated verbatim into the authoritative reason

**Repro.** Run with the AI contradiction check on and a model returning a confident,
wrong contradiction.
**Expected.** "Rules decide, AI explains" means the decision sentence is engine-authored.
**Actual.** DQ-13 interpolated the model's sentence directly into the reason, and the quote
it attributed to the file was not checked against the file. A reader could not tell which
words were the engine's and which were the model's, and the engine's voice asserted
something no rule had established.
**Root cause.** `Contradiction` carried no provenance, so the merge could not tell an
engine-detected contradiction from a model-detected one.
**Fix.** `Contradiction.source?: "ai"` set by `mergeContradictions` in `pipeline.ts`; a
`quoteIsInNotes()` helper in `quality.ts` nulls `originalValue` when the quote is not
verifiable in the source text; and the DQ-13 loop now emits engine-authored wording rather
than reprinting prose.
**Regression test.** `tests/adversarial/ai.test.ts`, which drives the path with a
deliberately hostile stub model.
**Verification.** Local suite.

### D-6 · P2 · A filled cell was called "not stated", under a subtitle promising the opposite

**Repro.** The same `5000` cell from D-3, viewed on `/applicants/[id]`.
**Expected.** Not blank, so not described as blank.
**Actual.** Two places said it was. The score basis read *"Investment was not stated"*, and
the "What the file said" panel rendered *not stated* — immediately beside a `RawCell`
printing `5000`, under a subtitle reading *"Anything blank below was blank there."* The
page contradicted itself on screen. This is D-3's sibling: having stopped the engine
asserting a figure the file never gave, it must not assert the opposite either.
**Root cause.** `null` reaches the renderer from two different situations — a blank cell and
a cell whose units could not be settled — and both the basis string and the field treated
`null` as proof of blankness.
**Fix.** Three edits.
`lib/engine/score.ts:30` — basis becomes *"No investment figure was read — scored at the
lowest band."*, which is true of both situations.
`app/applicants/[id]/page.tsx` — the Investment field distinguishes them, showing an amber
*could not be read* when the raw cell is non-empty.
Same file, line 31 — the subtitle becomes *"Row N of the Applications sheet. The cell itself
is printed under every value we read from it."*, dropping the claim it could not keep.
**Regression test.** Two new tests in `tests/adversarial/data.test.ts`: one asserts the
string "not stated" appears in **none** of the basis, the R-01 fail reason or the reason
sentence for a filled cell; the other asserts it still does appear for a genuinely blank
one, so the fix cannot be satisfied by deleting the phrase everywhere.

Two pre-existing tests asserted the exact string being removed. **Neither was weakened.**
`tests/engine/score.test.ts` kept its `points === 8` assertion and gained a second string
assertion (`"lowest band"`) alongside the reworded one. `tests/adversarial/data.test.ts:41`
kept `blank.points <= dismal.points`, took the new wording, and gained
`expect(blank.basis).not.toMatch(/\d/)` — a stronger claim than it made before, since a
basis that quotes no digit cannot smuggle an invented figure back in.
**Verification.** Local suite and local browser.

### D-7 · P2 · Hydration mismatch on every data page

**Repro.** Open any data page with saved data in `localStorage`. React logs a hydration
error to the console.
**Expected.** Clean hydration.
**Actual.** A mismatch on every one of the 10 data pages. **Pre-existing, not introduced by
this audit** — reproduced at the original line 285 before any of my edits and at line 294
after, which is the same code displaced by the lines I added.
**Root cause.** The pages above `RequireData` suspend on their `params` promise. By the time
the subtree first renders on the client, the store's hydrate effect has already run, so the
first client paint showed restored data while the server had sent a placeholder.
**Fix.** A `painted` mount guard in `components/RequireData.tsx` forces the first client
paint to match the server's placeholder, with the data arriving on the pass after it.
**Regression test.** **None.** D-20 — Vitest runs in the `node` environment with no DOM and
the project has no component tests — so adding one would mean standing up a test
environment, which is outside a stabilisation phase. This is listed in section A as risk 3.
**Verification.** **Browser only.** Restarted the dev server for a clean log, then walked all
10 data pages: "No server errors found", console clean, every page still rendering.

---

## D · Business-policy ambiguities

Four places where the correct behaviour is a business decision, not a defect. **None was
changed.** Each is recorded here rather than resolved by invention.

### D-1 · Reservations recompute rather than age

A reservation deadline is derived from the run's as-of date every time the pipeline runs. Run
the same file a month later and the applicant gets a deadline a month later, rather than
having the first one expire.

Defensible for a demo that decides as of a fixed date, which is what the deployed sample is.
Wrong for a desk running this weekly, where the whole point of a deadline is that it passes.
Resolving it needs a decision about where the first-issued date is stored and what the desk
wants to happen when it lapses — a feature, not a fix.

### D-2 · Capacity-blocked applicants get no cross-territory advice

`lib/engine/allocate.ts` has a Pass B branch intended to suggest a neighbouring territory.
It is unreachable: Pass A tests capacity before it tests the pin, so an applicant blocked by
a full territory exits before Pass B can look at them. The branch only ever sees gate-blocked
applicants.

The effect is that the applicants who would most benefit from "try TER-04 instead" — the ones
whose only problem is that their own territory is full — are the ones who never get told.
Whether that is the intended policy or an ordering bug depends on whether the desk wants to
redirect on capacity at all. Left alone because changing the pass order would move live
verdicts, and moving a verdict is not a Phase 1 action.

### D-3 · `resultHash` fingerprints a run, not a verdict set

The hash digests the applicant array in arrival order. Fifty seeded shuffles of both sheets
produce identical statuses, scores, ranks and pins — and a different hash every time.

Both behaviours are correct for what they are: the verdicts are order-invariant because the
engine sorts before it decides, and the hash is honest about being a fingerprint of one run
of one file. But a judge told "same file, same hash" who then re-sorts the sheet will see a
difference and may read it as non-determinism. Now pinned by
`tests/engine/determinism.test.ts` — the test asserts both halves at once, that the decisions
match and the hash does not — and corrected in `REPORT.md`, `JUDGE_TEST_PLAN.md` and
`VIDEO_SCRIPT.md`.

### D-4 · The AI's true ceiling is 15 points, and 15 points can reorder a rank

The guarantee that holds absolutely: no switch, preset or flag changes a status, reason code,
territory or pin. `tests/acceptance/switches.test.ts` enforces it exhaustively.

The guarantee that does not hold: that AI changes nothing. A model reading a free-text
business description can move the business component across its full **15-point weight**. Two
applicants within 15 points of each other can therefore swap rank, and under scarcity rank
decides who gets the last pin. So the AI cannot change a verdict directly, but it can change
*whose turn it is*.

This is by design, visible, and one switch from deterministic. It is in this section because
the documents previously implied a smaller boundary than the real one. `REPORT.md` now states
the 15-point ceiling explicitly; `tests/adversarial/ai.test.ts` pins it against a hostile
model.

**One further correction, in the same spirit.** `JUDGE_TEST_PLAN.md` and `VIDEO_SCRIPT.md`
both published an AI-on hash of `6feb0a08`. I measured `59f9cf82` on a live run. An AI-on
hash is not a constant — it depends on what the model returns for free text, so it can differ
between runs and between model versions. Publishing one invites a judge to find a mismatch
and conclude the engine is non-deterministic when it is the documentation that was wrong.
Removed from both documents. **`fdcce84f` (AI off) is the only quotable hash**, it is pinned
by `tests/chat/scenarios.test.ts`, and it is unchanged by every fix in this report.

---

## E · Test evidence

Every figure below was observed. Nothing is projected.

**Suite, final state**

```
Test Files  28 passed (28)
     Tests  537 passed (537)
  Duration  686ms
```

`npx tsc --noEmit` — clean. `npm run build` — exit 0.

**Baseline before this audit:** 321 tests across 18 files. **Added:** 215 across 10 new
adversarial files totalling 2,529 lines, plus the one row-order test added to
`tests/engine/determinism.test.ts` — 216 in all. **Deleted:** none. **Weakened:** none.

| New file | Tests | Area |
| --- | --- | --- |
| `tests/adversarial/data.test.ts` | 33 | D |
| `tests/adversarial/policy.test.ts` | 31 | I |
| `tests/adversarial/decisions.test.ts` | 23 | E |
| `tests/adversarial/invariants.test.ts` | 23 | §4 |
| `tests/adversarial/state.test.ts` | 22 | H, K |
| `tests/adversarial/allocation.test.ts` | 19 | C |
| `tests/adversarial/ai.test.ts` | 17 | J |
| `tests/adversarial/chat.test.ts` | 16 | F |
| `tests/adversarial/reservations.test.ts` | 16 | G |
| `tests/adversarial/workbook.test.ts` | 15 | A |

**Seed hash:** `fdcce84f`, pinned at `tests/chat/scenarios.test.ts:66` — that one line is
the only place the literal appears in the suite. The 27 case expectations in
`tests/seed/expectations.test.ts` pin the verdicts themselves rather than the digest.
Identical before and after all seven fixes — **no seed verdict moved.**

**Browser verification** — all against `npm run dev` on `localhost:3000`, Chromium via the
preview tool. Each of these was performed, not inferred:

- D-2: corrupt upload via a synthesised `text/plain` File. Parser red, prior 28 decisions
  intact.
- D-3: full chat loop — sentence typed, patch proposed, applied, re-run. APP-023 Approved →
  On hold with a truthful reason.
- D-6: the Investment field and subtitle on `/applicants/[id]`.
- D-7: all 10 data pages after a server restart. Clean server log, clean console.
- Undo: Versions 2 → 3, labelled "v3 · Change undone — reversed v2", hash returned to
  `59f9cf82`.
- Row-order hash: `bba8c7a2` vs `4de04a8e` on the same file re-ordered, statuses and pins
  identical.

**Deployed verification** — **HTTP status sweep only.** 11 routes, all 200, 0.13–0.51 s.
**No functional behaviour has been tested on the deployed build, and the deployed build does
not contain any fix in section C.**

---

## F · Release checklist

| # | Check | State |
| --- | --- | --- |
| 1 | Full suite green | **PASS** — 537/537, 28 files |
| 2 | TypeScript clean | **PASS** — `tsc --noEmit`, no output |
| 3 | Production build | **PASS** — `npm run build` exit 0 |
| 4 | No test deleted or weakened | **PASS** — two rewrites, both strengthened, quoted in C/D-6 |
| 5 | No business threshold moved to pass a test | **PASS** — the only new constants are D-3's plausibility floor, which creates a refusal rather than changing a threshold |
| 6 | Seed verdicts unmoved by the fixes | **PASS** — `fdcce84f` before and after |
| 7 | All 12 areas A–L covered | **PASS** — section B |
| 8 | §4 invariants covered by property tests | **PASS** — 23 tests over generated inputs |
| 9 | A high score never passes a hard gate | **PASS** — pinned in `invariants.test.ts` |
| 10 | No pin ever held twice, counting existing stores | **PASS** — 50 shuffles, every fixture |
| 11 | AI cannot change a status, reason code, pin or territory | **PASS** — `switches.test.ts`, every switch and preset |
| 12 | Engine never reads the clock | **PASS** — as-of date is an explicit input |
| 13 | Export byte-stable across two runs | **PASS** — `export/workbook.test.ts` |
| 14 | D-7 hydration fix covered by a test | **NOT TESTED** — no DOM environment; browser-verified only (risk 3) |
| 15 | UI rendering covered by tests generally | **NOT TESTED** — same cause |
| 16 | Documents match verified reality | **PASS** — `REPORT.md`, `JUDGE_TEST_PLAN.md`, `VIDEO_SCRIPT.md` corrected for the row-order hash and the removed AI-on hash |
| 17 | Phase 1 changes committed | **BLOCKED** — awaiting the commit below |
| 18 | Fixes present on the public URL | **FAIL** — live site runs `1ff8042`, zero fixes |
| 19 | Deployed functional smoke after deploy | **NOT TESTED** — cannot run until 17 and 18 clear |
| 20 | Concurrent multi-tab storage writes | **NOT TESTED** — out of scope, no evidence either way |
| 21 | Live model under latency or quota pressure | **NOT TESTED** — AI paths tested against stubs, including a hostile one |

**Release decision.** The code is ready. The deployment is not. Items 17–19 are the whole
of the condition in section A, and they are sequential: commit the Phase 1 changes, deploy,
then re-run the section E browser checks against the public URL and record the deployed
commit SHA here. Until item 19 is filled in with an observed result, no functional claim
about the live site should be made.

---

*Phase 1 only. No feature was added, and none will be, pending approval.*
