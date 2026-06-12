# Advisory Scheduler — Planning & Brainstorming Notes
**Date:** 2026-06-12
**Status:** All §4 questions answered (see §6). Design pending approval, then spec → implementation plan.

**Update (same day):** 57 teacher options/sections, not ~60. 1,444 ÷ 57 ≈ 25.3 students per section average, so the math is tighter than first stated — target ~25–26, hard cap 29. **Decision: cap is a configurable setting in the tool (default 29), as is the balance target.** This resolves the first half of Question 1; the pre-placed-seats half is still open.

---

## 1. Problem restatement

You upload one file with ~1,444 rows, one per unplaced student. Each row has a student ID, a priority label (A/B/C — purely a processing-order code, not a student attribute), and up to 8 numeric teacher codes (one per period, blanks meaning no class that period). Each distinct teacher code corresponds to exactly one advisory section — **57 sections total** — with a configurable hard cap (default 29) and a comfort target of ~25–26 (1,444 ÷ 57 ≈ 25.3). All merging, teaming, and pre-placement has already happened upstream — the codes in a row are the complete and final set of legal advisories for that student. The tool's only job: give every student exactly one section from their own row, keep sections near the target, never exceed the cap, place hard-to-place students first (partial schedules, then A → B → C), and clearly flag anyone it cannot place. 57 × 29 = 1,653 seats vs. 1,444 students — about 14% aggregate headroom, comfortable but not loose. The risk is **local** crowding: pockets of students who share the same few teachers.

One framing note that drives everything below: this is a textbook **bipartite assignment with capacities** (students on one side, sections on the other, an edge wherever a teacher code appears in a student's row). That matters because it means we can do better than "greedy and hope" — there are standard techniques that *guarantee* a full placement whenever one mathematically exists.

## 2. Scheduling approach — options and tradeoffs

**Option A — Pure greedy in your specified order.** Sort students (partials first, then A→B→C), walk the list, put each student in their eligible section with the most remaining room. This is essentially your spreadsheet, automated. It's simple and explainable, but it can strand students unnecessarily: an early student takes the last seat in section X when they had other options, and a later student who *only* had X is now stuck — even though a valid full assignment existed.

**Option B — Greedy + automatic repair (recommended).** Same greedy pass, but when a student can't be placed, the tool searches for a *chain of swaps*: "this stuck student takes a seat in their full section X; the displaced student moves to their other eligible section Y; if Y is full, displace again…" (an augmenting path, in matching terms). With repair, the algorithm is **provably complete**: if any valid full assignment exists, it finds one. Anyone still flagged is *mathematically* unplaceable given the caps — not a casualty of ordering. You keep your familiar ordering as the primary heuristic, and the repair step only kicks in when needed. A final balancing pass then nudges students from over-target sections (>25) into under-target eligible ones to even things out.

**Option C — Full optimization (min-cost flow / ILP).** Solve the whole thing at once, with an objective that rewards balance and penalizes cap overage. Strictly the most "optimal," and still fast at this size (≈11,500 student-section edges — milliseconds in a browser). The downside is explainability: when a registrar asks "why is this kid in section 41?", "the solver minimized a cost function" is a worse answer than "they were placed 312th and this was their most-open option, then one swap balanced the load."

**Recommendation: B.** It produces the same completeness guarantee as C for the question you care about (everyone placed if possible), it honors your stated ordering as the visible, defensible process, and its decisions can be narrated step by step. C is worth keeping in our back pocket only if we later add softer preferences (e.g., "prefer the student's period-1 teacher").

**Ordering within the partial group:** rather than treating "partial" as one bucket, sort by **count of distinct eligible sections, ascending** — students with 1 option go absolutely first, then 2, then 3, etc. Within the same option-count, A→B→C, then file order for determinism. This generalizes the stated rule (partials naturally have fewer options) and directly targets the real constraint, which is option scarcity, not blank periods per se. A student with 8 periods but the same teacher twice has only 7 options; a 6-period student might still have 6 distinct ones.

**Balance:** during greedy, "most remaining seats below target" keeps everything drifting toward 25 evenly; the cap only gets used when a section is the last resort. The post-pass then smooths what the constraint-driven phase roughed up. Expected steady state: most sections 22–26, a few constrained ones at cap, a few teacher codes that appear rarely sitting low.

## 3. Edge cases and failure modes

**Data-level (caught at validation, before any assignment):**
- A row with **zero** teacher codes — unplaceable by definition; report it immediately, don't fail the run.
- **Duplicate teacher codes within a row** (same teacher two periods) — dedupe silently; it's one option, not two.
- **Duplicate student IDs** across rows — flag; ambiguous input shouldn't be silently resolved.
- Malformed cells: non-numeric teacher codes, priority not in {A, B, C}, missing ID. Report row numbers; the user decides whether to fix the file or proceed without those rows.
- A teacher code that appears in only one or two rows — legal, but worth surfacing ("section 17 will have 2 students") since it probably signals an upstream data issue.

**Assignment-level:**
- **One-option students exceeding a cap:** if 35 students have *only* teacher 22, no algorithm helps — that's a genuine infeasibility. The tool should report it as a *cluster*: "these 35 students are all locked to section 22 (cap 29); 6 cannot be placed; here are the 35 IDs" so it can be fixed upstream (split the section, pre-place some, adjust the cap).
- **Hidden cluster infeasibility** (the subtle one): no individual student looks stuck, but 90 students collectively share only 3 sections (≤87 seats). Option B's repair step detects this naturally — when augmenting fails, the search itself identifies the saturated cluster, and we can name the bottleneck sections and the students trapped in them. This diagnostic is the single most valuable thing the tool can give over the spreadsheet.
- **Forced imbalance:** sometimes constraints force one section to 29 while another sits at 15. The tool should show a per-section load summary so this is visible, not hidden.
- **Ties everywhere:** all tie-breaks deterministic (file order as the final key), so the same file always produces the same result — see question 4, because a reshuffle option might also be wanted.

## 4. Open questions (answers drive the spec)

1. ~~What is the hard cap?~~ **Answered: 29, configurable in the tool (default 29), one number for all 57 sections unless per-section overrides prove necessary.** Still open, and more important: some students are **pre-placed and excluded from the file** — do those students occupy seats in these same advisories? If teacher 14's advisory already holds 10 pre-placed kids, the tool must treat its remaining capacity as 18–19, which means a second (small) input is needed: a per-section list of caps or seats-already-used. Or are pre-placed students always in sections that never appear in this file?
2. **Where does the section list come from?** Derive the set of valid sections from the codes that appear in student rows, or upload a master list of section codes (which would also catch typo'd codes that match no real section)?
3. **What should priority actually buy?** With the repair step, placement order no longer determines *whether* someone is placed — nearly everyone gets a seat regardless. So A/B/C only matters in two situations: (a) genuinely infeasible clusters, where someone must go unplaced — should C students be the ones flagged before B before A? And (b) cosmetic differences in *which* of their teachers a student lands with — does A/B/C imply anything there, or is any eligible section equally good? Working assumption: any of a student's own teachers is equally fine, and priority only governs (a).
4. **Determinism vs. reshuffle:** should the same file always produce the identical result (defensible, auditable), or is a "re-roll" button wanted that produces a different valid arrangement (useful if a particular result has an awkward grouping)? These can coexist — deterministic by default, optional seed.
5. **Input and output formats:** is the upload a CSV export, or drop the actual `.xlsx` in? For output — assumed: (a) one master CSV of `student ID → section code`, (b) a per-section roster view on screen, printable, and (c) the flagged/unplaceable list with reasons. Does anything need to round-trip back into the SIS in a specific format?
6. **Mid-year churn:** students enroll and leave after the initial run. Is v1 strictly "run once at the start of the term," or is a mode needed that holds existing assignments fixed and places only new students? (Fine to defer — but it affects whether the output format should be re-importable as a lock list.)
7. **Who uses this, from where?** Just the master scheduler, on one machine? That affects hosting: a single static page (even one HTML file kept on the desktop) versus a URL served from the Unraid box behind SWAG like the other apps.

## 5. Proposed build plan

Everything runs **in the browser** — the file is parsed, solved, and rendered client-side; no student data ever leaves the machine. The privacy preference also simplifies the build: it's a static site with zero backend.

- **Phase 1 — Engine, no UI.** A pure JavaScript module: parse → validate → assign (greedy + repair) → balance → report. Built test-first with synthetic fixtures (tiny feasible cases, forced-infeasible clusters, one-option pile-ups, duplicate codes, malformed rows). Acceptance test: run last year's real file through it and compare against what the spreadsheet produced — the tool should place at least as many students, with equal-or-better balance. This phase is where all the correctness lives, and it's independently verifiable before any pixel exists.
- **Phase 2 — The web tool.** Single-page static app: drag-and-drop the file (CSV and XLSX both, via PapaParse/SheetJS), a validation report to confirm before running, then results — per-section rosters, a load-summary bar chart, the flagged list with plain-English reasons, and CSV downloads. Deployed as a container on the Unraid box at a URL (SvelteKit static build, or even a single self-contained HTML file given the scope — decide at plan time).
- **Phase 3 — Quality-of-life, driven by real use.** Candidates, not commitments: re-roll with seed, per-section cap overrides in the UI, a "lock these students" input for mid-year re-runs, printable rosters. YAGNI applies — only build what the first real run proves is needed.

## 6. Decisions — answers received 2026-06-12

1. **Pre-placed students do NOT consume seats.** All 57 sections start empty with full capacity (29). No second capacity input needed.
2. **Section list derives from the file.** Registrar pre-cleans the data (typos handled upstream). The tool still runs a lightweight validation report as a safety net, but no master section list upload.
3. **Priority A/B/C is only a proxy for "fewer options."** The real goal: place the maximum number of students automatically. The tool's fewest-distinct-options-first ordering supersedes A/B/C; priority remains only as a tie-breaker among students with equal option counts.
4. **Deterministic by default; re-roll is a setting.** Deterministic ships first; seeded re-roll is a later action item.
5. **Input: .xlsx (also accept CSV). Output: CSV files** — master assignment list, per-section rosters, flagged/unplaced list.
6. **Run once per school year.** No incremental/lock mode; post-run changes handled by counselors by hand.
7. **Two users: registrar (primary) + assistant principal.** Needs a shared URL. Since all processing is client-side and no student data ever leaves the browser, hosting is a simple static page.
