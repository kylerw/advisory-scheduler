# Advisory Scheduler — Design Specification

**Date:** 2026-06-12
**Status:** Approved design, pending user review of this written spec
**Background:** `docs/superpowers/2026-06-12-planning-notes.md` (full brainstorm, options considered, Q&A)

## 1. Purpose

A browser-based tool that assigns every student to a weekly advisory section led by a teacher already in that student's schedule. Replaces a two-year-old manual spreadsheet process. Users: the school registrar (primary) and the assistant principal. Scale: ~1,444 students, 57 sections, run once per school year.

**Success criteria:** the maximum mathematically possible number of students placed automatically (zero hand-placement when a full assignment exists), no section over the cap, sections balanced near the target, and a clear flagged list with reasons for anyone unplaceable.

## 2. Privacy constraint (architectural driver)

All processing happens client-side in the browser. The uploaded file is parsed, solved, and rendered locally; no student data is ever transmitted to or stored on any server. This makes the app a pure static site, which in turn makes hosting trivial. The input file contains only opaque IDs and codes (no names, grades, or demographics).

## 3. Input

One spreadsheet, `.xlsx` (primary, what the registrar produces) or `.csv` (also accepted). One row per student:

| Column | Content |
|---|---|
| A | Student ID (opaque identifier) |
| B | Priority code: `A`, `B`, or `C` (processing-order label only — A students tend to have fewer class options) |
| C–J | Teacher code per period (8 periods), numeric. Blank = no class that period. |

Properties guaranteed upstream (by the registrar's data pull):

- Teacher codes in a row are the complete, final set of legal advisory options for that student. All teacher merging/combining and all pre-placements happened before this file was made.
- Pre-placed students are excluded from the file and do **not** occupy seats in any of the 57 sections — every section starts at zero with full capacity.
- Data is pre-cleaned for typos. The tool still validates (section 5) as a seatbelt, not a gate.
- The set of valid sections is **derived from the file**: every distinct teacher code appearing in columns C–J is a section. No separate section-list upload.

## 4. Settings (user-editable on the page, applied per run)

| Setting | Default | Meaning |
|---|---|---|
| Hard cap | 29 | Absolute max students per section. Never exceeded. |
| Balance target | 26 | Soft per-section size the algorithm steers toward (1,444 ÷ 57 ≈ 25.3). |

One cap/target for all sections. Per-section overrides are out of scope for v1 (future enhancement if a real run proves the need).

## 5. Validation (pre-run report, shown before assignment)

Displayed after file load; the user confirms before running:

- Row count and distinct-section count (expected ≈ 1,444 / 57).
- **Zero-option rows** (no teacher codes at all) → listed; excluded from assignment; appear in the flagged output as "no teacher codes in row."
- **Duplicate teacher codes within a row** (same teacher multiple periods) → silently deduplicated; one option, not two.
- **Duplicate student IDs across rows** → flagged with row numbers; the duplicate rows are excluded until resolved (ambiguity is never silently resolved).
- **Malformed cells** (non-numeric teacher code, priority not in {A,B,C}, missing ID) → flagged with row numbers; user chooses fix-and-reupload or proceed without those rows.
- **Tiny sections** (a code appearing in very few rows, e.g. ≤5) → informational warning; legal, but usually signals an upstream issue.

## 6. Assignment algorithm

Greedy with augmenting-path repair and a balancing post-pass (Option B from planning; provably complete — if any full assignment exists under the cap, it is found).

**Ordering.** Students sorted by:
1. Count of **distinct** eligible sections, ascending (1-option students absolutely first). This generalizes "partial schedules first" — the real constraint is option scarcity.
2. Priority `A` → `B` → `C` (tie-breaker only; per user decision, priority carries no other meaning once placement is maximized).
3. File row order (final deterministic tie-break).

**Greedy pass.** Each student in order is placed into their eligible section with the most open seats below target; if all eligible sections are at/above target, the one with most room below cap.

**Repair (augmenting paths).** If every eligible section is at cap, search for a chain of moves: the stuck student takes a seat in a full section X; a current occupant of X (one with other options) moves to their alternative Y; recursively if Y is full. If a chain exists, apply it — everyone stays validly placed and the stuck student gets a seat. If no chain exists, the student is mathematically unplaceable; record the saturated **bottleneck cluster** (the sections and co-trapped students found by the failed search) for the flagged report.

**Balance pass.** After all placements, move students from sections above target to eligible sections below target while it reduces overall imbalance. Cap is never exceeded at any point in any pass.

**Determinism.** Same file + same settings ⇒ identical output, every run. No randomness anywhere. (Seeded re-roll is a logged future enhancement, not in v1.)

**Performance envelope.** ≤ ~11,500 student-section edges; the whole solve is sub-second in the browser. No async/worker complexity needed.

## 7. Outputs

**On screen:**
- Per-section rosters (section code, count, student IDs), printable.
- Load summary: every section's count vs. target and cap, sorted, visualized (simple bar list).
- Flagged list with plain-English reasons: "no teacher codes in row," "duplicate student ID (rows 14, 922)," "all eligible sections full — bottleneck: sections 12, 31, 44 (87 seats, 90 students locked to them)."
- Headline numbers: placed / total, sections at cap, flagged count.

**Downloads (CSV):**
1. **Master assignment list** — `student_id, assigned_section` (one row per placed student).
2. **Per-section rosters** — `section, student_id`, grouped/sorted by section.
3. **Flagged students** — `student_id, row_number, reason`.

## 8. Architecture

Two units with a hard boundary:

- **Engine** (`src/engine/`) — pure JavaScript, zero DOM/UI dependencies. Functions: `parse(rows)` → student records; `validate(students)` → validation report; `assign(students, settings)` → assignment + flags + per-section loads; `toCsv(...)` exporters. Fully unit-testable; the UI is just a consumer.
- **UI** (`src/ui/` + `index.html`) — file drop zone, settings inputs, validation report, run button, results tables, download buttons. Reads engine output; contains no scheduling logic.

**Dependencies:** SheetJS (parses both .xlsx and .csv — PapaParse dropped as redundant, amended at planning). No framework — plain JS/HTML/CSS with Vite for dev/build/test tooling. Vitest for tests.

## 9. Hosting & distribution

- **Primary: GitHub Pages.** Public static URL, free, always up, easy to iterate and share with the registrar (Wendi) during testing. Safe to be public because the page contains no data and receives none — student data exists only in the visitor's own browser session.
- **Alternate hand-off: single self-contained HTML file.** The Vite build also produces a one-file bundle (via `vite-plugin-singlefile`) that runs from a double-click with no hosting — for the school's end-state use if they prefer a file on a shared drive over a URL. Same code, second build target; this is accounted for from the start so it's a build flag, not a rewrite.

## 10. Testing

Engine is built test-first:
- Synthetic fixtures: small feasible cases with known-optimal outcomes; forced bottleneck clusters (placeable only via repair chains); genuinely infeasible clusters (must flag, must name the bottleneck); one-option pile-ups; duplicate codes in a row; duplicate IDs; malformed cells; zero-option rows; empty file.
- Invariant checks on every test outcome: no section over cap, every placed student got a section from their own row, deterministic across repeated runs.
- **Acceptance test:** last year's real file. The tool must place at least as many students as the manual spreadsheet process did, with equal-or-better balance.

## 11. Out of scope for v1 (logged future enhancements)

- Seeded re-roll / alternative arrangements (decision: deterministic first; re-roll is the agreed later action item).
- Per-section cap overrides.
- Incremental mid-year runs with locked assignments (decision: runs once per year; counselors handle changes by hand).
- Authentication (nothing to protect server-side).

## 12. Build phases

1. **Engine + tests** — all logic in section 6, validated by section 10's suite, runnable headlessly. Correctness lives here and is verified before any UI exists.
2. **Web UI + GitHub Pages deploy** — the page described in sections 5/7, wired to the engine; Pages deployment; single-file build target verified.
3. **Real-data acceptance + polish** — run the actual file with the registrar, fix what real use reveals, hand off.
