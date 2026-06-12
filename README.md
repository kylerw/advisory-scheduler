# Advisory Scheduler

Assigns every student to a weekly advisory section led by a teacher already in
their schedule. Fully client-side: the spreadsheet is parsed and solved in the
browser and never leaves the computer.

**Use it:** upload the .xlsx (one row per student: ID, priority A/B/C, eight
teacher-code columns), review the file check, set cap/target if needed, click
Run, download the CSVs.

**Docs:** design spec and implementation plan live in `docs/superpowers/`.

**Builds:** `npm run build` (static site, deployed to GitHub Pages on push to
main) · `npm run build:single` (one self-contained HTML file in `dist-single/`
for offline/shared-drive use) · `npx vitest --run` (test suite).
