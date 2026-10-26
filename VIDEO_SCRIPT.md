# Video script — 60 seconds

**Launchpad — Franchise Expansion Engine** · Aayush Topiwala & Durgesh Panchal

Record at **https://launchpad-franchise-engine.vercel.app** in a clean browser profile.
Clear site data first so the landing page is the empty state.

Have the sample workbook downloaded before you start — the upload must be a real file drop,
not the shortcut button:

```
https://launchpad-franchise-engine.vercel.app/sample/Launchpad_Sample_Data.xlsx
```

Narration is **156 words**, paced for ~155 wpm. Every claim is on screen as it is said.

---

### 0:00 – 0:08 · The problem

**On screen:** the landing page, empty. No data loaded. Cursor still.

> "A franchise desk gets more applications than it can judge. Two coordinators read the same
> row and reach different answers — and nobody can explain a rejection afterwards."

---

### 0:08 – 0:20 · Upload a real file

**Click Upload workbook. Choose `Launchpad_Sample_Data.xlsx`.** Let the parse report render
in full before you speak over it.

> "One upload. It tells you what it matched, what it set aside, and every value it had to
> interpret — fourteen findings, blocking first, each pointing at a sheet, a row and a column
> in your file."

**On screen:** sheets found · headers matched by name · the template example row excluded ·
the normalisation log · **14 findings, 5 blocking, 9 warnings**.

---

### 0:20 – 0:35 · A decision that explains itself

**Land on the Command Centre. Let the territory board fill, then click into APP-007.**

> "Twenty-eight applications, eight territories, decided. Fareed Ahmed is on hold — and not
> because a model said so."

**Scroll the decision card to the rule trace, then to the onboarding plan.**

> "Upper floor, read from that cell, against this threshold. Here's what unlocks it, here's
> the deadline, and here's the plan and the partner's message in Kannada."

**On screen:** status, the one-line reason, the **R-03** trace row showing the floor value
`Upper`, the reservation date **2026-12-10**, and the Kannada onboarding plan.

---

### 0:35 – 0:50 · Tell it something new

**Click Ask & Update. Type: `Why is APP-007 on hold?`** Let the cited answer land.

**Then type: `APP-013 has secured a ground-floor shop of 500 sq ft`.**

> "Tell it something new and it proposes a change — quoting you, never claiming to know what
> the file already held."

**Click Apply and re-run.** The what-changed panel appears.

> "Applied. APP-013 moves to approved, and it names every decision that shifted — not just
> the one you touched. A verdict is never changed quietly."

---

### 0:50 – 1:00 · Export and hand over

**Click Export decisions, then open a partner link from the decision card.**

> "Out comes Excel — your columns echoed back word for word, decisions appended. And a
> read-only link the applicant can open, no login. Rules decide. AI explains."

**On screen:** the file name `Launchpad_Decisions_2026-10-26_<hash>.xlsx`, then the partner
view.

---

## Shot list

| Time | Screen | Action |
| --- | --- | --- |
| 0:00 | `/` | Hold on the empty state |
| 0:08 | `/` → parse report | Upload `Launchpad_Sample_Data.xlsx` |
| 0:20 | `/dashboard` → `/applicants/APP-007` | Territory board fills, open the hold card, scroll trace → onboarding |
| 0:35 | `/chat` | Two messages, then Apply and re-run |
| 0:50 | `/dashboard` → `/partner/[token]` | Export, then open the partner link |

## Recording notes

- **Upload the file, don't click "Load sample data".** The button skips the parser, and the
  parse report is the whole point of the 0:08 beat.
- **Be precise about the hash** if it is legible on screen. With AI on the sample hashes to
  `6feb0a08`; with AI off, `fdcce84f`. It is stable for a *fixed* configuration, not across
  the AI switch — the live model reads two business descriptions more generously than the
  keyword fallback, which moves two scores and therefore the hash. Say "same settings, same
  hash", never "the hash never changes".
- **If a take runs short**, the strongest ten seconds to add is Settings → turn both AI
  switches off → hard refresh → Timeline: every status, rank and pin identical, two scores
  moved, and the timeline names both. That is the "rules decide" claim proved rather than
  asserted. Do it as a **hard** refresh so nobody can call it cached.
- If the chat patch is already applied from an earlier take, **System → Clear saved data**
  and start over. The change has to happen live.
- Don't narrate the UI ("now I'm clicking…"). Say what it proves.
