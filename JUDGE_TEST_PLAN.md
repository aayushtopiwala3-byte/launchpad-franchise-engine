# Judge test plan

**Live, no login: https://launchpad-franchise-engine.vercel.app**

Nothing here needs an account, an API key, or a local install. Every expected value below was
observed on the deployed build. Where a number could drift, the test says so.

If anything looks wrong, go to **System → Clear saved data** and start again. Appending
`?safe=1` to any URL boots with persistence and AI off.

---

## A · Two minutes, the happy path

| # | Do this | Expect |
| --- | --- | --- |
| A1 | Open the link, click **Load sample data** | Lands on Command Centre. 28 applications, 8 territories |
| A2 | Read the five tiles | **8** approved · **1** waitlisted · **14** on hold · **3** redirected · **2** not proceeding |
| A3 | Read the slots tile | **8 / 16** filled · 4 high-priority still empty |
| A4 | Read "Today's brief" | A paragraph assembled by template — it says so. No model wrote it |
| A5 | Open **Applicants**, click any row | Decision card: status, one-line reason, score breakdown, rule trace, onboarding plan |
| A6 | Scroll to **What would change this** | A concrete, minimal change — not generic advice |

---

## B · The claims worth attacking

### B1 · "Rules decide, AI explains" — switch the AI off entirely

1. **Settings** (`/features`) → turn off **AI explanations** and **AI contradiction check**.
2. Hard-refresh the page.

**Expect:** every **status**, **rank**, **territory** and **assigned pin** is identical to
what you saw before.

**What legitimately changes:** two **scores** out of 28. On the sample, APP-004 goes 73→67
and APP-024 goes 73→58, because the live model reads those two business descriptions more
generously than the keyword fallback does. The result hash therefore changes too:
**`6feb0a08` with AI on, `fdcce84f` with AI off.**

That is the honest boundary of the AI's influence: it can nudge the *ranking input* for a
messy free-text field, and it cannot touch a verdict. Open **Timeline** and the system will
name those exact two rows for you rather than make you hunt for them.

> If a judge asks "so the AI *does* change the output?" — yes, by design, in one scored
> component, visibly, with the deterministic alternative one switch away. What it cannot do
> is change a status, a rank, a pin, or a reason code. That is the guarantee, and
> `tests/acceptance/switches.test.ts` enforces it against every switch and every preset.

### B2 · Determinism

1. **System → Clear saved data.**
2. Load the sample again with the same AI setting.

**Expect:** the same result hash as before (`6feb0a08` AI on / `fdcce84f` AI off), and the
same counts. The engine never reads the clock — the as-of date is an explicit input shown on
the dashboard.

### B3 · No pin is claimed twice

1. Open **Territories**.
2. For each territory, read *Occupied pins — and who holds them*.

**Expect:** every pin appears **once**, held by exactly one of: an existing store (`ST-xx`),
an approved applicant, or a reservation. TER-01's three pins are all held by existing stores
`ST-01/02/03`, which is why its queue has one approved applicant and no free pin.

Also check **TER-02**: pin `560103` is listed as *ceded to a lower-numbered territory*. Two
territories claimed it; DQ-09 fired and gave it to one of them deterministically rather than
letting both count it as capacity.

### B4 · Never invent a fact

1. Open **Data quality** (`/quality`).

**Expect:** **14** findings — **5 blocking, 9 warnings, 0 informational** — sorted blocking
first. Each row names the **sheet, row number, column and original value**.

2. Find any field rendered as *not stated* (greyed, italic).

**Expect:** it is never a blank cell and never a zero. Hover it: "This was not in the
uploaded file." The Excel export writes it out as the words **Not stated** for the same reason.

3. Note which checks fired: DQ-10 ×5, DQ-09 ×2, DQ-11 ×2, and DQ-03/06/07/08/13 once each.

### B5 · A verdict is never changed quietly

1. **Ask & Update** (`/chat`). Type: `APP-012 now has 45 lakh investment`.

**Expect:** it proposes `Investment capacity (rupees lakh): 25 → 45` and says *nothing is
applied until you say so*. It quotes **your** words back; it does not assert what the file
holds in its own voice.

2. Click **Apply and re-run**, then open **Timeline**.

**Expect:** a new version labelled *Updated from chat*, carrying the patch, and a diff naming
exactly which decisions moved. Old reasons appear struck through above new ones.

3. Use **Compare any two versions** to diff v1 against the newest.

**Expect:** the net effect, not a replay of the steps.

4. Still on **Timeline**, click **Undo the change from v3**.

**Expect:** the result hash returns to exactly what it was before the patch, and the history
**gains** a version rather than losing one. The undo is an entry you can read, and is itself
undoable. Nothing is restored from a cached copy — the old cell value goes back into the file
and the rules are run over it again, which is why the hash lands exactly.

5. **Reload the page.** The history survives — versions are persisted, because a past snapshot
cannot be recomputed from the raw rows.

### B6 · Show me the rule, not the vibe

1. **Settings** → turn on **Explain mode**.
2. Go back to any applicant.

**Expect:** every number grows a tag with the **rule code** that produced it and the **raw
cell text** it was read from. Note that reason *sentences* never contain rule codes — codes
live in the trace. That separation is pinned by a test on the export.

---

## C · Try to break it

| # | Attack | Expect |
| --- | --- | --- |
| C1 | Upload a workbook with the sheets named differently, or extra columns | Headers are matched by **name**, never by position or row number. The parse report says what it matched and what it could not |
| C2 | Upload a file with the template's example row still in it | Detected and set aside, with a one-click **Include it** if you meant it |
| C3 | Upload a corrupt or non-Excel file | Fails closed with a readable message. The previous result stays on screen — nothing is half-replaced |
| C4 | **Settings** → edit a threshold (e.g. the Tier 2 investment minimum) | You see an **impact preview** before committing. Apply it and the timeline records a *Policy changed* version with the decisions it moved |
| C5 | Override a decision on a decision card | Recorded with your reason, survives the next re-run, and appears in the export's Audit sheet |
| C6 | Corrupt storage: in DevTools set `localStorage['launchpad.v1'] = 'garbage'`, reload | Resets cleanly, flags it amber, and offers the unreadable copy as a **download** rather than silently discarding it |
| C7 | Open `/?safe=1` | Boots with persistence and AI off. Proves the product stands up with both removed |
| C8 | Block network to the AI (DevTools offline) and reload with AI on | Falls back to the deterministic twin, logs the failure in **System**, shows an amber AI lamp. Decisions still render |
| C9 | Open a `/partner/[token]` link (from any decision card) | Read-only applicant view, no login, no access to anyone else's data |

---

## D · The export

1. Click **Export decisions** (on the dashboard or the quality page).

**Expect:** a file named `Launchpad_Decisions_<date>_<hash>.xlsx` — the hash ties the file to
the exact run that produced it.

2. Open it. **Six sheets:**

| Sheet | Contains |
| --- | --- |
| Decisions | **Your uploaded columns, word for word**, with the decision appended |
| Territory summary | Capacity, pins held / approved / reserved / free / ceded, and why a slot is empty |
| Data quality | All 14 findings with severity, location and action taken |
| How values were read | Every normalisation, with the rule that did it |
| Audit | The full rule trace for every applicant |
| This run | Hash, as-of date, policy name and thresholds |

3. **Diff the Decisions sheet against your own file.** The uploaded columns are echoed
verbatim, so you can confirm nothing was rewritten behind your back.

4. Export twice without changing anything. The two files are **byte-identical** — pinned by a
test, not just a promise.

---

## E · If you want to run it locally

```bash
git clone https://github.com/aayushtopiwala3-byte/launchpad-franchise-engine
cd launchpad-franchise-engine
npm install
npm test        # 318 tests across 18 files
npm run dev
```

No API key needed. Every AI touchpoint has a deterministic fallback, and no verdict depends
on a model.

**The tests worth reading first:**

| File | Proves |
| --- | --- |
| `tests/acceptance/switches.test.ts` | No switch, preset or individual flag changes a verdict |
| `tests/engine/determinism.test.ts` | Same input → same hash; row order is irrelevant |
| `tests/engine/allocate.test.ts` | One store per pin, counting existing stores |
| `tests/seed/expectations.test.ts` | All 22 locked case expectations |
| `tests/chat/scenarios.test.ts` | The six chat scenarios above, end to end, with AI off |
| `tests/export/workbook.test.ts` | Export round-trips, sorts, and is byte-stable |
| `tests/state/versions.test.ts` | Diffs catch rank slips, not just status flips; undo is exact |

---

## F · Pre-submission checklist

Everything below was checked on the deployed build, not on a developer's laptop.

| # | Check | State |
| --- | --- | --- |
| F1 | Link works **logged out** — no account, no key, no install | ✅ verified |
| F2 | Link works **in a clean/incognito profile** with empty storage | ✅ verified |
| F3 | Link works **on mobile** (390 × 844): tiles reflow to two columns, nav scrolls, no horizontal page overflow | ✅ verified |
| F4 | **Load sample data** works from the empty state | ✅ 28 applications, 8 territories |
| F5 | A real **`.xlsx` uploads as-is, with the example row excluded** | ✅ uploaded on production in safe mode: 28 rows, parsed in 32 ms, **hash `fdcce84f`** — byte-for-byte the same verdicts as the embedded seed |
| F6 | The same file uploads **with the example row included** via the one-click toggle | ✅ `tests/parse/workbook.test.ts` (the toggle only appears when a template row is present, so it is pinned by test rather than by the production upload above) |
| F7 | All **22 seed cases** produce their expected outcomes | ✅ `tests/seed/expectations.test.ts` |
| F8 | Chat **answers and applies updates with AI disabled** | ✅ `tests/chat/scenarios.test.ts`, deterministic router |
| F9 | **No pin code ever holds two stores** — counting the 9 existing stores | ✅ every fixture, plus 50 row-order shuffles |
| F10 | **Model ID is visible** in the UI — `gemini-3.8-flash`, on **System** | ✅ shown, not buried in config |
| F11 | **Cost cap is set** — $0.50 per session, enforced before each call | ✅ `NEXT_PUBLIC_AI_COST_CEILING_USD` |
| F12 | **Nothing expires before 28 Oct 2026 EOD IST** — no trial, no token, no scheduled teardown | ✅ Vercel production, public repo |

Two things worth stating plainly rather than burying in a tick:

- **The as-of date is an input, not the clock.** The deployed sample decides as of
  **2026-10-26** and will keep saying so next week. Nothing in the engine reads `Date.now()`,
  so no decision can drift between the moment you open the link and the moment you re-check it.
- **The Gemini key is server-side only.** It lives in Vercel's environment, never in the
  repository and never in the browser; every call goes through `/api/ai`. You can confirm the
  first half by searching the public repo and the second half in the Network tab.
