# Seed expectations — the locked decision matrix

The bundled sample set is 28 application rows (27 unique IDs plus one deliberate
duplicate) across 8 territories and the 10 existing stores. Every figure below is
produced by the deterministic engine with AI switched off, at a frozen
`asOfDate` of **2026-10-26** and the brand-default policy profile.

This file is documentation. The lock is
[`tests/seed/expectations.test.ts`](tests/seed/expectations.test.ts), which asserts the same
two matrices cell for cell. If a rule changes, that test fails before anything
else does, and the change has to be deliberate.

Regenerate the workbook that carries this data with `npm run sample`; verify the
matrix with `npm test`.

- **Result hash:** `fdcce84f`
- **Slots filled:** 8
- **One-store-per-pin invariant:** holds

## Outcome counts

| Status | Rows |
|---|---|
| APPROVED | 8 |
| WAITLISTED | 1 |
| ON HOLD | 14 |
| REDIRECTED | 3 |
| NOT PROCEEDING | 2 |

## Applications

`—` means the field does not apply to that status, never that a value was
unknown. Ranks are within the territory. The duplicate `APP-023` appears twice,
in sheet order: the first row is the live applicant, the second is held and
excluded from allocation.

| Application | Status | Reason | Score | Rank | Territory | Assigned pin | Reserved until | Suggested pins |
|---|---|---|---:|---:|---|---|---|---|
| APP-002 | APPROVED | A-01 | 100 | 1 | TER-03 | 570001 | — | — |
| APP-003 | REDIRECTED | A-02 | 87 | 3 | TER-03 | — | — | 570011, 570016 |
| APP-004 | WAITLISTED | A-01 | 67 | 5 | TER-03 | — | — | — |
| APP-005 | APPROVED | A-01 | 100 | 2 | TER-03 | 570008 | — | — |
| APP-006 | APPROVED | A-01 | 80 | 4 | TER-03 | 570002 | — | — |
| APP-007 | ON HOLD | R-03 | 80 | — | TER-07 | — | 2026-12-10 | — |
| APP-008 | REDIRECTED | G-03 | 95 | — | — | — | — | 570011, 570016 |
| APP-009 | REDIRECTED | G-04 | 81 | — | — | — | — | 570011, 570016 |
| APP-010 | ON HOLD | R-01 | 70 | — | TER-07 | — | — | — |
| APP-011 | NOT PROCEEDING | G-02 | 48 | — | TER-07 | — | — | — |
| APP-012 | ON HOLD | R-02 | 70 | — | TER-08 | — | 2026-12-10 | — |
| APP-013 | ON HOLD | R-02 | 75 | — | TER-08 | — | 2026-12-10 | — |
| APP-014 | ON HOLD | G-01 | 95 | — | TER-01 | — | — | — |
| APP-015 | ON HOLD | R-05 | 97 | — | TER-01 | — | — | — |
| APP-016 | ON HOLD | R-04 | 100 | — | TER-02 | — | 2026-12-10 | — |
| APP-017 | APPROVED | A-01 | 65 | 2 | TER-07 | 575003 | — | — |
| APP-018 | ON HOLD | R-02 | 62 | — | TER-06 | — | 2026-12-10 | — |
| APP-019 | ON HOLD | R-01 | 57 | — | TER-05 | — | 2026-12-10 | — |
| APP-020 | ON HOLD | R-01 | 70 | — | TER-01 | — | 2026-12-10 | — |
| APP-021 | APPROVED | A-01 | 88 | 1 | TER-01 | 560103 | — | — |
| APP-022 | APPROVED | A-01 | 100 | 1 | TER-02 | 560102 | — | — |
| APP-023 | APPROVED | A-01 | 95 | 1 | TER-07 | 575004 | — | — |
| APP-023 | ON HOLD | R-05 | 95 | — | TER-07 | — | — | — |
| APP-024 | APPROVED | A-01 | 58 | 1 | TER-04 | 570023 | — | — |
| APP-025 | ON HOLD | R-04 | 68 | — | TER-08 | — | — | — |
| APP-026 | NOT PROCEEDING | G-04 | 95 | — | — | — | — | — |
| APP-027 | ON HOLD | R-03 | 59 | — | TER-06 | — | — | — |
| APP-028 | ON HOLD | R-05 | 79 | — | TER-05 | — | 2026-12-10 | — |

## Territories

Usable capacity is `min(open slots, free pins)`. A pin holding an existing store
counts as occupied, and a pin claimed by two territories is ceded to the lower
territory ID.

| Territory | City | Priority | Open slots | Usable capacity | Occupied pins | Free pins | Ceded pins | Approvals |
|---|---|---|---:|---:|---|---|---|---:|
| TER-01 | Bengaluru | High | 3 | 2 | 560001, 560034, 560038 | — | — | 1 |
| TER-02 | Bengaluru | High | 2 | 2 | 560066, 560076 | — | 560103 | 1 |
| TER-03 | Mysuru | High | 3 | 3 | — | 570011, 570016 | — | 3 |
| TER-04 | Mysuru | Medium | 2 | 1 | 570017 | — | — | 1 |
| TER-05 | Davanagere | High | 2 | 2 | — | 577004 | — | 0 |
| TER-06 | Tumakuru | Medium | 1 | 1 | — | 572102 | — | 0 |
| TER-07 | Mangaluru | Medium | 3 | 3 | 575001 | — | — | 2 |
| TER-08 | Hubballi-Dharwad | Low | 2 | 2 | 580020 | — | — | 0 |

## Reason sentences

Plain English, no rule codes. The codes live in the rule trace behind each
decision card, where an operator who wants them can find them.

| # | Application | Status | Reason given to the operator |
|---|---|---|---|
| 1 | APP-002 | APPROVED | Approved for pin 570001 in TER-03. Lakshmi Rao meets every Tier 2 requirement and took the slot on a score of 100. |
| 2 | APP-003 | REDIRECTED | Pin 570001 is taken by APP-002, but pins 570011, 570016 are free nearby. This is advice, not a rejection — no slot is taken and no pin is held. |
| 3 | APP-004 | WAITLISTED | Ready to proceed, but TER-03 has only 3 usable slots and Nandini Shetty is ranked 5th. They move up the moment a slot frees. |
| 4 | APP-005 | APPROVED | Approved for pin 570008 in TER-03. Imran Shaikh meets every Tier 2 requirement and took the slot on a score of 100. |
| 5 | APP-006 | APPROVED | Approved for pin 570002 in TER-03. Prakash Gowda meets every Tier 2 requirement and took the slot on a score of 80. |
| 6 | APP-007 | ON HOLD | On hold — The space is on the Upper floor, which loses passing footfall and walk-in trade. |
| 7 | APP-008 | REDIRECTED | Pin 570009 is taken by ST-06, but pins 570011, 570016 are free nearby. This is advice, not a rejection — no slot is taken and no pin is held. |
| 8 | APP-009 | REDIRECTED | Pin 570004 is not inside any territory we have mapped, but pins 570011, 570016 are free nearby. This is advice, not a rejection — no slot is taken and no pin is held. |
| 9 | APP-010 | ON HOLD | On hold — Investment of 17 lakh is 3 lakh short of the 20 lakh minimum for Tier 2. |
| 10 | APP-011 | NOT PROCEEDING | Not proceeding — Investment of 10 lakh is below the hard floor of 15 lakh for Tier 2 (50% of the 20 lakh minimum). The application stays on file. |
| 11 | APP-012 | ON HOLD | On hold — No space has been identified yet. (3 checks still open) |
| 12 | APP-013 | ON HOLD | On hold — No space has been identified yet. (3 checks still open) |
| 13 | APP-014 | ON HOLD | On hold — City Mysuru uses pin codes starting 570, but the pin code given is 560043. |
| 14 | APP-015 | ON HOLD | On hold — The notes say "still looking for a shop in the area" but Space available says Rented. The notes describe an ongoing search, which cannot be true if the space is already Rented. |
| 15 | APP-016 | ON HOLD | On hold — Space size is not stated. (2 checks still open) |
| 16 | APP-017 | APPROVED | Approved for pin 575003 in TER-07. Arjun Rai meets every Tier 2 requirement and took the slot on a score of 65. |
| 17 | APP-018 | ON HOLD | On hold — No space has been identified yet. (3 checks still open) |
| 18 | APP-019 | ON HOLD | On hold — Investment of 14 lakh is 1 lakh short of the 15 lakh minimum for Tier 3. |
| 19 | APP-020 | ON HOLD | On hold — Investment of 25 lakh is 5 lakh short of the 30 lakh minimum for Tier 1. |
| 20 | APP-021 | APPROVED | Approved for pin 560103 in TER-01. Harish Kamath meets every Tier 1 requirement and took the slot on a score of 88. |
| 21 | APP-022 | APPROVED | Approved for pin 560102 in TER-02. Meera Iyer meets every Tier 1 requirement and took the slot on a score of 100. |
| 22 | APP-023 | APPROVED | Approved for pin 575004 in TER-07. Vinod Shetty meets every Tier 2 requirement and took the slot on a score of 95. |
| 23 | APP-023 | ON HOLD | On hold — Application ID APP-023 already appears on row 25. Two rows cannot share an ID. |
| 24 | APP-024 | APPROVED | Approved for pin 570023 in TER-04. Ganesh Murthy meets every Tier 2 requirement and took the slot on a score of 58. |
| 25 | APP-025 | ON HOLD | On hold — Space is 340 sq ft; the minimum for Tier 2 is 350 sq ft. |
| 26 | APP-026 | NOT PROCEEDING | Not proceeding — Pin 590001 is not inside any territory, and we have no territory in Belagavi at all. The application stays on file. |
| 27 | APP-027 | ON HOLD | On hold — The floor has not been confirmed. |
| 28 | APP-028 | ON HOLD | On hold — Investment capacity (rupees lakh) reads 800 lakh, above the plausible ceiling of 500 lakh. This is almost certainly a typing error. |

## Seed adjustments

Two values differ from the tables in the brief. Both are recorded with their
reasons in [`DECISIONS.md`](DECISIONS.md) (D-21 and D-22). No rule was bent to
fit a figure; in both cases the seed data was wrong for the case it was meant to
demonstrate.
