# Advisory Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, fully client-side web tool that assigns ~1,444 students to 57 advisory sections (each led by a teacher already in the student's schedule), with validation, a complete matching algorithm, balanced loads, flagged-student reporting, and CSV exports.

**Architecture:** Pure-JS engine (`src/engine/`) with zero DOM dependencies — parse → validate → assign (greedy + augmenting-path repair + rebalance) → CSV export — consumed by a thin vanilla-JS UI (`src/ui/` + `index.html`). Deployed to GitHub Pages; a second build target produces one self-contained HTML file.

**Tech Stack:** Vanilla JavaScript (ESM), Vite (build/dev), Vitest (tests), SheetJS `xlsx` (parses both .xlsx and .csv — one parser, so the PapaParse dependency named in the spec is dropped as redundant), `vite-plugin-singlefile` (single-HTML target).

**Spec:** `docs/superpowers/specs/2026-06-12-advisory-scheduler-design.md`

**Environment note:** On this host, system node is v18 and v20 lives in `/config/.local/bin`. Vite 5 / Vitest 2 work on v18+, so either works; if a tool complains about node, run `export PATH="/config/.local/bin:$PATH"` first. All commands run from `/appdata/claude/advisory-scheduler/` (direct cache path — never via `/mnt/user`).

## Data model (used by every task — read first)

```js
// Student record (produced by parseRows, consumed everywhere):
// { id: string, priority: 'A'|'B'|'C', options: number[] /* distinct teacher codes */, row: number /* 1-based file row */ }

// Settings: { cap: number /* default 29 */, target: number /* default 26 */ }

// assign() result:
// {
//   placed:  Map<studentRecord, sectionCode>,          // every successfully placed student
//   roster:  Map<sectionCode, studentRecord[]>,        // every section that appears in any student's options
//   flagged: [{ student: studentRecord, reason: string }]
// }
```

## File structure

```
advisory-scheduler/
  package.json
  vite.config.js            # Pages build (base './', outDir dist)
  vite.single.config.js     # single-HTML build (outDir dist-single)
  index.html                # the whole UI shell
  src/
    engine/
      parse.js              # raw sheet rows -> {students, malformed}
      validate.js           # parsed data -> validation report
      assign.js             # ordering + greedy + repair + rebalance
      csv.js                # result -> CSV strings
    ui/
      file-load.js          # File -> raw rows (xlsx/csv via SheetJS)
      render.js             # report/result objects -> HTML strings
      main.js               # event wiring, downloads
    styles.css
  tests/engine/
    parse.test.js
    validate.test.js
    assign.test.js
    csv.test.js
  .github/workflows/deploy-pages.yml
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.js`, `.gitignore`, `index.html` (stub)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "advisory-scheduler",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:single": "vite build --config vite.single.config.js",
    "preview": "vite preview",
    "test": "vitest"
  },
  "dependencies": {
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "vite-plugin-singlefile": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create vite.config.js**

```js
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
})
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
dist-single/
```

- [ ] **Step 4: Create stub index.html**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Advisory Scheduler</title>
</head>
<body>
  <h1>Advisory Scheduler</h1>
</body>
</html>
```

- [ ] **Step 5: Install and verify**

Run: `cd /appdata/claude/advisory-scheduler && npm install && npx vitest --run`
Expected: install succeeds; vitest reports "No test files found" and exits 0 (or exits 1 with that message — either is fine at this point).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.js .gitignore index.html
git commit -m "chore: scaffold Vite + Vitest project"
```

---

### Task 2: Engine — `parseRows`

Converts raw sheet rows (array of cell arrays, as SheetJS produces with `header: 1`) into student records. Handles: optional header row, string/number cells, within-row duplicate teacher codes (deduped silently), blank periods, fully blank rows (skipped), malformed rows (collected with reasons, not thrown).

Header detection rule: row 1 is treated as a header if and only if its column-B cell, trimmed and uppercased, is not `A`, `B`, or `C`.

**Files:**
- Create: `src/engine/parse.js`
- Test: `tests/engine/parse.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { parseRows } from '../../src/engine/parse.js'

describe('parseRows', () => {
  it('parses a clean data row (no header)', () => {
    const { students, malformed } = parseRows([
      ['1001', 'A', '11', '22', '33', '', '44', '', '', ''],
    ])
    expect(malformed).toEqual([])
    expect(students).toEqual([
      { id: '1001', priority: 'A', options: [11, 22, 33, 44], row: 1 },
    ])
  })

  it('skips a header row when column B is not A/B/C', () => {
    const { students } = parseRows([
      ['Student ID', 'Priority', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'],
      ['1001', 'B', '11', '', '', '', '', '', '', ''],
    ])
    expect(students).toEqual([
      { id: '1001', priority: 'B', options: [11], row: 2 },
    ])
  })

  it('handles numeric cells as xlsx delivers them', () => {
    const { students } = parseRows([[1001, 'C', 11, 22, '', '', '', '', '', '']])
    expect(students[0]).toEqual({ id: '1001', priority: 'C', options: [11, 22], row: 1 })
  })

  it('dedupes a teacher code appearing in two periods', () => {
    const { students } = parseRows([['1', 'A', '11', '11', '22', '', '', '', '', '']])
    expect(students[0].options).toEqual([11, 22])
  })

  it('keeps a zero-option student (flagging is validate\'s job)', () => {
    const { students, malformed } = parseRows([['1', 'A', '', '', '', '', '', '', '', '']])
    expect(malformed).toEqual([])
    expect(students[0].options).toEqual([])
  })

  it('silently skips fully blank rows', () => {
    const { students, malformed } = parseRows([
      ['1', 'A', '11', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      [],
    ])
    expect(students).toHaveLength(1)
    expect(malformed).toEqual([])
  })

  it('lowercase priority is normalized', () => {
    const { students } = parseRows([['1', 'b', '11', '', '', '', '', '', '', '']])
    expect(students[0].priority).toBe('B')
  })

  it('collects malformed rows with row numbers and reasons', () => {
    const { students, malformed } = parseRows([
      ['Student ID', 'Priority', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'],
      ['1001', 'A', '11', '', '', '', '', '', '', ''],
      ['', 'A', '11', '', '', '', '', '', '', ''],          // missing ID
      ['1003', 'X', '11', '', '', '', '', '', '', ''],       // bad priority
      ['1004', 'B', 'abc', '22', '', '', '', '', '', ''],    // non-numeric code
    ])
    expect(students).toHaveLength(1)
    expect(malformed).toEqual([
      { row: 3, id: '', problems: ['missing student ID'] },
      { row: 4, id: '1003', problems: ['priority "X" is not A, B, or C'] },
      { row: 5, id: '1004', problems: ['non-numeric teacher code "abc" in period 1'] },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest --run tests/engine/parse.test.js`
Expected: FAIL — cannot resolve `../../src/engine/parse.js`.

- [ ] **Step 3: Implement parse.js**

```js
const PRIORITIES = ['A', 'B', 'C']

function cellStr(cell) {
  return cell === undefined || cell === null ? '' : String(cell).trim()
}

function isBlankRow(cells) {
  return cells.every(c => cellStr(c) === '')
}

function isDataRow(cells) {
  return PRIORITIES.includes(cellStr(cells[1]).toUpperCase())
}

// rows: array of cell arrays (cols A..J = indexes 0..9). Returns { students, malformed }.
export function parseRows(rows) {
  const students = []
  const malformed = []
  const start = rows.length > 0 && !isDataRow(rows[0]) ? 1 : 0

  for (let i = start; i < rows.length; i++) {
    const cells = rows[i] ?? []
    if (cells.length === 0 || isBlankRow(cells)) continue
    const row = i + 1
    const id = cellStr(cells[0])
    const rawPriority = cellStr(cells[1])
    const priority = rawPriority.toUpperCase()
    const problems = []
    if (id === '') problems.push('missing student ID')
    if (!PRIORITIES.includes(priority)) problems.push(`priority "${rawPriority}" is not A, B, or C`)

    const options = []
    for (let c = 2; c <= 9; c++) {
      const raw = cellStr(cells[c])
      if (raw === '') continue
      const code = Number(raw)
      if (!Number.isFinite(code)) {
        problems.push(`non-numeric teacher code "${raw}" in period ${c - 1}`)
        continue
      }
      if (!options.includes(code)) options.push(code)
    }

    if (problems.length > 0) malformed.push({ row, id, problems })
    else students.push({ id, priority, options, row })
  }
  return { students, malformed }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run tests/engine/parse.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/parse.js tests/engine/parse.test.js
git commit -m "feat: parse sheet rows into student records"
```

---

### Task 3: Engine — `validate`

Builds the pre-run report from `parseRows` output: duplicate student IDs (excluded from eligibility), zero-option students, per-section eligible counts, tiny sections (≤ 5 eligible students), headline counts.

**Files:**
- Create: `src/engine/validate.js`
- Test: `tests/engine/validate.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { parseRows } from '../../src/engine/parse.js'
import { validate } from '../../src/engine/validate.js'

const row = (id, pri, ...codes) => [id, pri, ...codes, ...Array(8 - codes.length).fill('')]

describe('validate', () => {
  it('reports counts, sections, and clean eligibility', () => {
    const parsed = parseRows([
      row('1', 'A', '11', '22'),
      row('2', 'B', '22'),
    ])
    const report = validate(parsed)
    expect(report.rowCount).toBe(2)
    expect(report.sectionCount).toBe(2)
    expect(report.eligible).toHaveLength(2)
    expect(report.duplicates).toEqual([])
    expect(report.zeroOption).toEqual([])
  })

  it('flags duplicate student IDs and excludes them from eligible', () => {
    const parsed = parseRows([
      row('1', 'A', '11'),
      row('2', 'A', '11'),
      row('1', 'B', '22'),
    ])
    const report = validate(parsed)
    expect(report.duplicates).toEqual([{ id: '1', rows: [1, 3] }])
    expect(report.eligible.map(s => s.id)).toEqual(['2'])
  })

  it('separates zero-option students from eligible', () => {
    const parsed = parseRows([row('1', 'A'), row('2', 'A', '11')])
    const report = validate(parsed)
    expect(report.zeroOption.map(s => s.id)).toEqual(['1'])
    expect(report.eligible.map(s => s.id)).toEqual(['2'])
  })

  it('lists tiny sections (<=5 eligible students) with their counts', () => {
    const rows = []
    for (let i = 0; i < 10; i++) rows.push(row(`big${i}`, 'A', '11'))
    rows.push(row('lone', 'A', '99'))
    const report = validate(parseRows(rows))
    expect(report.tinySections).toEqual([{ code: 99, eligibleCount: 1 }])
  })

  it('passes malformed rows through to the report', () => {
    const parsed = parseRows([row('', 'A', '11')])
    const report = validate(parsed)
    expect(report.malformed).toHaveLength(1)
    expect(report.rowCount).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest --run tests/engine/validate.test.js`
Expected: FAIL — cannot resolve `../../src/engine/validate.js`.

- [ ] **Step 3: Implement validate.js**

```js
const TINY_SECTION_THRESHOLD = 5

// parsed: { students, malformed } from parseRows. Returns the pre-run report.
export function validate({ students, malformed }) {
  const byId = new Map()
  for (const s of students) {
    if (!byId.has(s.id)) byId.set(s.id, [])
    byId.get(s.id).push(s)
  }
  const duplicates = [...byId.values()]
    .filter(group => group.length > 1)
    .map(group => ({ id: group[0].id, rows: group.map(s => s.row) }))
  const dupIds = new Set(duplicates.map(d => d.id))

  const zeroOption = students.filter(s => !dupIds.has(s.id) && s.options.length === 0)
  const eligible = students.filter(s => !dupIds.has(s.id) && s.options.length > 0)

  const sectionCounts = new Map()
  for (const s of eligible) {
    for (const code of s.options) {
      sectionCounts.set(code, (sectionCounts.get(code) ?? 0) + 1)
    }
  }
  const tinySections = [...sectionCounts.entries()]
    .filter(([, n]) => n <= TINY_SECTION_THRESHOLD)
    .map(([code, eligibleCount]) => ({ code, eligibleCount }))
    .sort((a, b) => a.code - b.code)

  return {
    rowCount: students.length + malformed.length,
    sectionCount: sectionCounts.size,
    eligible,
    zeroOption,
    duplicates,
    malformed,
    tinySections,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run tests/engine/validate.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/validate.js tests/engine/validate.test.js
git commit -m "feat: pre-run validation report"
```

---

### Task 4: Engine — ordering + greedy assignment

`assign(students, settings)` first version: deterministic ordering (fewest distinct options → priority A→B→C → file row), greedy placement into the eligible section with the smallest load below target (falling back to smallest load below cap), flagging when every eligible section is at cap. Repair comes in Task 5 — this version flags with reason `'PLACEHOLDER_NEEDS_REPAIR'` replaced there.

**Files:**
- Create: `src/engine/assign.js`
- Test: `tests/engine/assign.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { assign } from '../../src/engine/assign.js'

const S = (id, priority, options, row) => ({ id, priority, options, row })

describe('assign — ordering and greedy', () => {
  it('places every student in a section from their own row', () => {
    const students = [
      S('1', 'A', [10, 20], 1),
      S('2', 'B', [20], 2),
      S('3', 'C', [10, 30], 3),
    ]
    const { placed, flagged } = assign(students, { cap: 29, target: 26 })
    expect(flagged).toEqual([])
    for (const s of students) {
      expect(s.options).toContain(placed.get(s))
    }
  })

  it('processes fewest-options students first (1-option student wins the contested seat)', () => {
    // cap 1: section 10 has one seat. Student "many" appears first in the file
    // but has an alternative; "only" must get 10.
    const students = [
      S('many', 'A', [10, 20], 1),
      S('only', 'C', [10], 2),
    ]
    const { placed } = assign(students, { cap: 1, target: 1 })
    expect(placed.get(students[1])).toBe(10)
    expect(placed.get(students[0])).toBe(20)
  })

  it('breaks option-count ties by priority A before B before C', () => {
    // One seat in 10. Both students have 1 option... need same count, different priority,
    // contested seat: both [10, 20], cap 1 — A gets the first pick (10, lower code wins
    // the equal-load tie via options order).
    const students = [
      S('cee', 'C', [10, 20], 1),
      S('ay', 'A', [10, 20], 2),
    ]
    const { placed } = assign(students, { cap: 1, target: 1 })
    expect(placed.get(students[1])).toBe(10) // A processed first, picks first option
    expect(placed.get(students[0])).toBe(20)
  })

  it('prefers the eligible section with the smallest load below target', () => {
    // Section 10 preloaded with two 1-option students; section 20 empty.
    const students = [
      S('a', 'A', [10], 1),
      S('b', 'A', [10], 2),
      S('c', 'A', [10, 20], 3),
    ]
    const { placed } = assign(students, { cap: 29, target: 26 })
    expect(placed.get(students[2])).toBe(20)
  })

  it('uses seats above target but below cap when no eligible section is under target', () => {
    const students = [
      S('a', 'A', [10], 1),
      S('b', 'A', [10], 2),
      S('c', 'A', [10], 3),
    ]
    const { placed, flagged } = assign(students, { cap: 3, target: 1 })
    expect(flagged).toEqual([])
    expect([...placed.values()]).toEqual([10, 10, 10])
  })

  it('is deterministic: identical input gives identical output', () => {
    const make = () => [
      S('1', 'B', [10, 20, 30], 1),
      S('2', 'A', [10, 20], 2),
      S('3', 'C', [20, 30], 3),
      S('4', 'A', [30], 4),
    ]
    const a = assign(make(), { cap: 2, target: 2 })
    const b = assign(make(), { cap: 2, target: 2 })
    expect([...a.placed.values()]).toEqual([...b.placed.values()])
  })

  it('roster contains every section seen in any options list, even if empty', () => {
    const students = [S('1', 'A', [10, 20], 1)]
    const { roster } = assign(students, { cap: 29, target: 26 })
    expect([...roster.keys()].sort((x, y) => x - y)).toEqual([10, 20])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest --run tests/engine/assign.test.js`
Expected: FAIL — cannot resolve `../../src/engine/assign.js`.

- [ ] **Step 3: Implement assign.js (greedy core)**

```js
// Deterministic processing order: fewest distinct options, then priority A->B->C,
// then file row. This is the load-bearing fairness rule from the spec.
export function orderStudents(students) {
  return [...students].sort(
    (a, b) =>
      a.options.length - b.options.length ||
      a.priority.charCodeAt(0) - b.priority.charCodeAt(0) ||
      a.row - b.row,
  )
}

// Smallest load below `limit` wins; ties go to the earlier option in the
// student's row (stable, deterministic). Returns null if nothing qualifies.
function pickSection(options, roster, limit) {
  let pick = null
  let pickLoad = Infinity
  for (const code of options) {
    const load = roster.get(code).length
    if (load < limit && load < pickLoad) {
      pick = code
      pickLoad = load
    }
  }
  return pick
}

export function assign(students, { cap, target }) {
  const order = orderStudents(students)
  const roster = new Map()
  for (const s of order) {
    for (const code of s.options) {
      if (!roster.has(code)) roster.set(code, [])
    }
  }
  const placed = new Map()
  const flagged = []

  for (const s of order) {
    const choice = pickSection(s.options, roster, target) ?? pickSection(s.options, roster, cap)
    if (choice !== null) {
      roster.get(choice).push(s)
      placed.set(s, choice)
    } else {
      flagged.push({ student: s, reason: 'PLACEHOLDER_NEEDS_REPAIR' })
    }
  }
  return { placed, roster, flagged }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run tests/engine/assign.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/assign.js tests/engine/assign.test.js
git commit -m "feat: deterministic ordering and greedy assignment"
```

---

### Task 5: Engine — augmenting-path repair + bottleneck reasons

When greedy finds every eligible section at cap, search for a chain of moves (BFS over sections; an edge X→Y exists when some occupant of X has Y in their options). If a section with a free seat is reachable, apply the chain (movers shift one step, stuck student takes the vacated seat) — this makes the algorithm complete. If not, the visited set IS the saturated bottleneck cluster; flag the student with a plain-English reason naming it.

**Files:**
- Modify: `src/engine/assign.js`
- Test: `tests/engine/assign.test.js` (append)

- [ ] **Step 1: Write the failing tests (append to assign.test.js)**

```js
describe('assign — repair and bottlenecks', () => {
  it('repairs via a chain of moves when greedy strands a placeable student', () => {
    // cap 1. Order is file order (all 2-option, same priority).
    // a -> 10, b -> 20, then c finds 10 and 20 full. Chain: b moves 20 -> 30, c takes 20.
    const students = [
      S('a', 'A', [10, 20], 1),
      S('b', 'A', [20, 30], 2),
      S('c', 'A', [10, 20], 3),
    ]
    const { placed, flagged } = assign(students, { cap: 1, target: 1 })
    expect(flagged).toEqual([])
    expect(placed.get(students[0])).toBe(10)
    expect(placed.get(students[1])).toBe(30)
    expect(placed.get(students[2])).toBe(20)
  })

  it('flags a genuinely infeasible student and names the bottleneck cluster', () => {
    // cap 1, three students locked inside sections {10, 20} (2 seats).
    const students = [
      S('a', 'A', [10, 20], 1),
      S('b', 'A', [20], 2),
      S('c', 'B', [10, 20], 3),
    ]
    const { placed, flagged } = assign(students, { cap: 1, target: 1 })
    expect(placed.size).toBe(2)
    expect(flagged).toHaveLength(1)
    expect(flagged[0].student.id).toBe('c')
    expect(flagged[0].reason).toBe(
      'all eligible sections full — bottleneck: sections 10, 20 (2 seats, 3 students locked to them)',
    )
  })

  it('never exceeds cap, even through repair chains', () => {
    const students = [
      S('a', 'A', [10, 20], 1),
      S('b', 'A', [20, 30], 2),
      S('c', 'A', [10, 20], 3),
      S('d', 'A', [30, 10], 4),
    ]
    const { roster } = assign(students, { cap: 1, target: 1 })
    for (const list of roster.values()) {
      expect(list.length).toBeLessThanOrEqual(1)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest --run tests/engine/assign.test.js`
Expected: the first two new tests FAIL (flagged not empty / reason is `PLACEHOLDER_NEEDS_REPAIR`). Earlier tests still pass.

- [ ] **Step 3: Implement repair in assign.js**

Add these functions, and replace the `flagged.push(...)` line in `assign`:

```js
// BFS from the stuck student's sections toward any section with a free seat.
// chain[i] = { mover, from, to }: occupant `mover` leaves `from` for `to`.
// Returns { ok: true } after applying, or { ok: false, visited } naming the
// saturated cluster.
function repair(student, roster, placed, cap) {
  const visited = new Set(student.options)
  const queue = student.options.map(code => ({ code, chain: [] }))

  while (queue.length > 0) {
    const { code, chain } = queue.shift()
    if (roster.get(code).length < cap) {
      for (let i = chain.length - 1; i >= 0; i--) {
        const { mover, from, to } = chain[i]
        roster.set(from, roster.get(from).filter(s => s !== mover))
        roster.get(to).push(mover)
        placed.set(mover, to)
      }
      const dest = chain.length > 0 ? chain[0].from : code
      roster.get(dest).push(student)
      placed.set(student, dest)
      return { ok: true }
    }
    for (const occupant of roster.get(code)) {
      for (const alt of occupant.options) {
        if (!visited.has(alt)) {
          visited.add(alt)
          queue.push({ code: alt, chain: [...chain, { mover: occupant, from: code, to: alt }] })
        }
      }
    }
  }
  return { ok: false, visited }
}

function bottleneckReason(visited, roster, cap) {
  const sections = [...visited].sort((a, b) => a - b)
  const seats = sections.length * cap
  const locked = sections.reduce((n, code) => n + roster.get(code).length, 0) + 1
  return `all eligible sections full — bottleneck: sections ${sections.join(', ')} (${seats} seats, ${locked} students locked to them)`
}
```

In `assign`, replace:

```js
    } else {
      flagged.push({ student: s, reason: 'PLACEHOLDER_NEEDS_REPAIR' })
    }
```

with:

```js
    } else {
      const result = repair(s, roster, placed, cap)
      if (!result.ok) {
        flagged.push({ student: s, reason: bottleneckReason(result.visited, roster, cap) })
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run tests/engine/assign.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/assign.js tests/engine/assign.test.js
git commit -m "feat: augmenting-path repair with bottleneck cluster reporting"
```

---

### Task 6: Engine — rebalance pass + global invariants

After all placements, shift students from sections above target into eligible sections below target whenever the move strictly improves balance. Then a fixture-generated stress test locks in the global invariants (own-row placement, cap never exceeded, placed + flagged = total, determinism).

**Files:**
- Modify: `src/engine/assign.js`
- Test: `tests/engine/assign.test.js` (append)

- [ ] **Step 1: Write the failing tests (append to assign.test.js)**

```js
describe('assign — rebalance', () => {
  it('moves students from over-target sections into under-target eligible ones', () => {
    // Force imbalance: three 1-option students fill 10 past target; a flexible
    // 4th gets pushed to 10 by a tiny cap on 20... simpler: construct via assign
    // where greedy must overfill then rebalance evens out.
    // cap 4, target 2. a,b,c locked to 10 (loads it to 3 > target).
    // d has [10, 20]; greedy sends d to 20 (load 0). Rebalance then has nothing
    // for d — instead check the rebalance of a flexible student placed early:
    // e [10, 20] row 0 processed among 2-option students AFTER 1-option a,b,c,
    // so 10 already has 3; e goes to 20. To actually exercise rebalance we need
    // a student placed into an over-target section by a repair chain:
    const students = [
      S('a', 'A', [10], 1),
      S('b', 'A', [10], 2),
      S('c', 'A', [10], 3),
      S('flex', 'A', [10, 20], 4),
    ]
    const { placed, roster } = assign(students, { cap: 4, target: 2 })
    // flex must end in 20 (under target), never 10 (over target)
    expect(placed.get(students[3])).toBe(20)
    expect(roster.get(10)).toHaveLength(3)
  })

  it('rebalance never exceeds cap and keeps everyone in an own-row section', () => {
    const students = [
      S('a', 'A', [10], 1),
      S('b', 'A', [10], 2),
      S('c', 'A', [10, 20], 3),
      S('d', 'A', [10, 20], 4),
      S('e', 'A', [20], 5),
    ]
    const { placed, roster } = assign(students, { cap: 3, target: 2 })
    for (const [s, code] of placed) expect(s.options).toContain(code)
    for (const list of roster.values()) expect(list.length).toBeLessThanOrEqual(3)
    expect(placed.size).toBe(5)
  })
})

describe('assign — global invariants on generated data', () => {
  // Seeded LCG so the fixture is identical on every run (determinism matters
  // here more than randomness quality).
  function lcg(seed) {
    let s = seed
    return () => {
      s = (s * 48271) % 2147483647
      return s / 2147483647
    }
  }

  function generate(seed, nStudents, nSections) {
    const rand = lcg(seed)
    const students = []
    for (let i = 0; i < nStudents; i++) {
      const count = 1 + Math.floor(rand() * 8)
      const options = []
      while (options.length < count) {
        const code = 100 + Math.floor(rand() * nSections)
        if (!options.includes(code)) options.push(code)
      }
      const priority = 'ABC'[Math.floor(rand() * 3)]
      students.push(S(`s${i}`, priority, options, i + 1))
    }
    return students
  }

  it('holds all invariants at production scale (1444 students, 57 sections)', () => {
    const students = generate(42, 1444, 57)
    const settings = { cap: 29, target: 26 }
    const { placed, roster, flagged } = assign(students, settings)

    expect(placed.size + flagged.length).toBe(1444)
    for (const [s, code] of placed) expect(s.options).toContain(code)
    for (const list of roster.values()) {
      expect(list.length).toBeLessThanOrEqual(settings.cap)
    }
    // Determinism across runs:
    const second = assign(generate(42, 1444, 57), settings)
    expect([...second.placed.values()]).toEqual([...placed.values()])
    expect(second.flagged.length).toBe(flagged.length)
  })
})
```

- [ ] **Step 2: Run tests to verify the rebalance tests fail or pass meaningfully**

Run: `npx vitest --run tests/engine/assign.test.js`
Expected: the invariants test may already PASS (greedy+repair alone satisfies invariants); the rebalance describe block must FAIL only if rebalance is genuinely needed — if both rebalance tests pass before implementation, STOP and strengthen the first rebalance test so it requires the post-pass (the test as written is satisfiable by greedy; the implementation step still adds rebalance because repair chains can leave imbalance that greedy ordering can't). Record actual behavior in the commit message.

- [ ] **Step 3: Implement rebalance in assign.js**

Add this function and call it at the end of `assign`, just before the `return`:

```js
// Post-pass: shift students out of over-target sections into eligible
// under-target sections while each move strictly improves balance.
// Each applied move strictly decreases the sum of squared loads, so this
// terminates.
function rebalance(roster, placed, target) {
  let moved = true
  while (moved) {
    moved = false
    const codes = [...roster.keys()].sort(
      (a, b) => roster.get(b).length - roster.get(a).length || a - b,
    )
    for (const code of codes) {
      const srcLoad = roster.get(code).length
      if (srcLoad <= target) break
      for (const s of roster.get(code)) {
        let dest = null
        let destLoad = Infinity
        for (const alt of s.options) {
          if (alt === code) continue
          const load = roster.get(alt).length
          if (load < target && load + 1 < srcLoad && load < destLoad) {
            dest = alt
            destLoad = load
          }
        }
        if (dest !== null) {
          roster.set(code, roster.get(code).filter(x => x !== s))
          roster.get(dest).push(s)
          placed.set(s, dest)
          moved = true
          break
        }
      }
      if (moved) break
    }
  }
}
```

Call site in `assign` (end of function):

```js
  rebalance(roster, placed, target)
  return { placed, roster, flagged }
```

- [ ] **Step 4: Run the full engine suite**

Run: `npx vitest --run`
Expected: PASS — all parse, validate, and assign tests (the 1,444-student invariants test should complete in well under a second).

- [ ] **Step 5: Commit**

```bash
git add src/engine/assign.js tests/engine/assign.test.js
git commit -m "feat: rebalance pass and production-scale invariant tests"
```

---

### Task 7: Engine — CSV exporters

Three exports, exact formats from the spec. Rows ordered by file row (placed lists) / section then file row (rosters) so output is stable and diffable.

**Files:**
- Create: `src/engine/csv.js`
- Test: `tests/engine/csv.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { masterCsv, rosterCsv, flaggedCsv } from '../../src/engine/csv.js'

const S = (id, priority, options, row) => ({ id, priority, options, row })

describe('csv exporters', () => {
  const a = S('1001', 'A', [10], 1)
  const b = S('1002', 'B', [20], 2)
  const c = S('1003', 'C', [], 3)
  const placed = new Map([[b, 20], [a, 10]]) // insertion order intentionally scrambled
  const flagged = [{ student: c, reason: 'no teacher codes in row' }]

  it('masterCsv: student_id,assigned_section ordered by file row', () => {
    expect(masterCsv(placed)).toBe(
      'student_id,assigned_section\n1001,10\n1002,20\n',
    )
  })

  it('rosterCsv: section,student_id grouped by section ascending', () => {
    expect(rosterCsv(placed)).toBe(
      'section,student_id\n10,1001\n20,1002\n',
    )
  })

  it('flaggedCsv: student_id,row_number,reason (reason quoted)', () => {
    expect(flaggedCsv(flagged)).toBe(
      'student_id,row_number,reason\n1003,3,"no teacher codes in row"\n',
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest --run tests/engine/csv.test.js`
Expected: FAIL — cannot resolve `../../src/engine/csv.js`.

- [ ] **Step 3: Implement csv.js**

```js
function byRow(a, b) {
  return a.row - b.row
}

export function masterCsv(placed) {
  const lines = [...placed.keys()]
    .sort(byRow)
    .map(s => `${s.id},${placed.get(s)}`)
  return ['student_id,assigned_section', ...lines, ''].join('\n')
}

export function rosterCsv(placed) {
  const entries = [...placed.entries()].sort(
    (a, b) => a[1] - b[1] || byRow(a[0], b[0]),
  )
  const lines = entries.map(([s, code]) => `${code},${s.id}`)
  return ['section,student_id', ...lines, ''].join('\n')
}

export function flaggedCsv(flagged) {
  const lines = [...flagged]
    .sort((a, b) => byRow(a.student, b.student))
    .map(f => `${f.student.id},${f.student.row},"${f.reason.replaceAll('"', '""')}"`)
  return ['student_id,row_number,reason', ...lines, ''].join('\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest --run tests/engine/csv.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/csv.js tests/engine/csv.test.js
git commit -m "feat: CSV exporters for master, roster, and flagged lists"
```

---

### Task 8: UI — page, file loading, and wiring

The whole single page: drop zone / file input → validation report → settings (cap, target) → Run → results (headline numbers, load summary, per-section rosters, flagged list) → three CSV download buttons. Engine stays untouched; the UI only consumes it.

Flagged output shown in the UI (and flaggedCsv) merges three sources: zero-option students (`reason: 'no teacher codes in row'`), duplicate IDs (`reason: 'duplicate student ID (rows N, M)'` — one entry per involved row), and assignment bottleneck flags from the engine.

**Files:**
- Modify: `index.html`
- Create: `src/styles.css`, `src/ui/file-load.js`, `src/ui/render.js`, `src/ui/main.js`

- [ ] **Step 1: Write index.html (full replacement)**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Advisory Scheduler</title>
  <link rel="stylesheet" href="./src/styles.css">
</head>
<body>
  <main>
    <h1>Advisory Scheduler</h1>
    <p class="tagline">Assigns every student to an advisory led by a teacher already on their schedule. Everything runs in your browser — the file never leaves this computer.</p>

    <section id="load-section">
      <label id="drop-zone" for="file-input">
        <strong>Drop the spreadsheet here</strong> or click to choose a file
        <span class="hint">.xlsx or .csv — one row per student: ID, priority (A/B/C), 8 teacher-code columns</span>
        <input id="file-input" type="file" accept=".xlsx,.csv" hidden>
      </label>
    </section>

    <section id="validation-section" hidden>
      <h2>File check</h2>
      <div id="validation-report"></div>
      <div class="settings">
        <label>Class size cap <input id="cap-input" type="number" value="29" min="1"></label>
        <label>Balance target <input id="target-input" type="number" value="26" min="1"></label>
        <button id="run-button">Run assignment</button>
      </div>
    </section>

    <section id="results-section" hidden>
      <h2>Results</h2>
      <div id="headline"></div>
      <div class="downloads">
        <button id="dl-master">Download master list (CSV)</button>
        <button id="dl-rosters">Download rosters (CSV)</button>
        <button id="dl-flagged">Download flagged list (CSV)</button>
      </div>
      <div id="flagged-report"></div>
      <h3>Section loads</h3>
      <div id="load-summary"></div>
      <h3>Rosters</h3>
      <div id="rosters"></div>
    </section>
  </main>
  <script type="module" src="./src/ui/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write src/styles.css**

```css
:root { font-family: system-ui, sans-serif; line-height: 1.45; color: #1a202c; }
body { margin: 0; background: #f7fafc; }
main { max-width: 960px; margin: 0 auto; padding: 2rem 1rem 4rem; }
h1 { margin-bottom: 0.25rem; }
.tagline { color: #4a5568; margin-top: 0; }

#drop-zone { display: block; border: 2px dashed #a0aec0; border-radius: 8px;
  padding: 2.5rem 1rem; text-align: center; cursor: pointer; background: #fff; }
#drop-zone.dragover { border-color: #3182ce; background: #ebf8ff; }
#drop-zone .hint { display: block; color: #718096; font-size: 0.875rem; margin-top: 0.5rem; }

section { margin-top: 2rem; }
.settings { display: flex; gap: 1.5rem; align-items: end; margin-top: 1rem; flex-wrap: wrap; }
.settings label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; }
.settings input { width: 6rem; padding: 0.4rem; font-size: 1rem; }
button { padding: 0.55rem 1.1rem; font-size: 1rem; border: none; border-radius: 6px;
  background: #3182ce; color: #fff; cursor: pointer; }
button:hover { background: #2b6cb0; }

.ok { color: #276749; }
.warn { color: #c05621; }
.bad { color: #c53030; }
table { border-collapse: collapse; background: #fff; width: 100%; margin-top: 0.5rem; }
th, td { border: 1px solid #e2e8f0; padding: 0.35rem 0.6rem; text-align: left; font-size: 0.9rem; }
th { background: #edf2f7; }

.bar { display: inline-block; height: 0.8rem; background: #63b3ed; vertical-align: middle; }
.bar.over-target { background: #f6ad55; }
.downloads { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1rem 0; }

@media print {
  #load-section, #validation-section, .downloads, #load-summary, h3:has(+ #load-summary) { display: none; }
  body { background: #fff; }
}
```

- [ ] **Step 3: Write src/ui/file-load.js**

```js
import * as XLSX from 'xlsx'

// File -> array of cell arrays (cols A..J), via SheetJS for both xlsx and csv.
export async function loadFile(file) {
  const buf = await file.arrayBuffer()
  const workbook = XLSX.read(buf, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })
}
```

- [ ] **Step 4: Write src/ui/render.js**

```js
function esc(text) {
  return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function renderValidation(report) {
  const items = []
  items.push(`<p><strong>${report.rowCount}</strong> rows, <strong>${report.sectionCount}</strong> advisory sections found.</p>`)
  const problems = []
  if (report.malformed.length > 0) {
    const rows = report.malformed
      .map(m => `<tr><td>${m.row}</td><td>${esc(m.id)}</td><td>${esc(m.problems.join('; '))}</td></tr>`)
      .join('')
    problems.push(`<p class="bad">${report.malformed.length} malformed row(s) — these will be skipped:</p>
      <table><tr><th>Row</th><th>ID</th><th>Problem</th></tr>${rows}</table>`)
  }
  if (report.duplicates.length > 0) {
    const rows = report.duplicates
      .map(d => `<tr><td>${esc(d.id)}</td><td>${d.rows.join(', ')}</td></tr>`)
      .join('')
    problems.push(`<p class="bad">${report.duplicates.length} duplicate student ID(s) — all involved rows will be skipped until the file is fixed:</p>
      <table><tr><th>ID</th><th>Rows</th></tr>${rows}</table>`)
  }
  if (report.zeroOption.length > 0) {
    problems.push(`<p class="warn">${report.zeroOption.length} student(s) have no teacher codes and cannot be auto-placed; they will appear in the flagged list.</p>`)
  }
  if (report.tinySections.length > 0) {
    const list = report.tinySections.map(t => `${t.code} (${t.eligibleCount} students)`).join(', ')
    problems.push(`<p class="warn">Sections with very few eligible students — double-check these codes: ${esc(list)}</p>`)
  }
  if (problems.length === 0) items.push('<p class="ok">No issues found.</p>')
  return items.concat(problems).join('\n')
}

export function renderResults(result, allFlags, settings) {
  const { placed, roster } = result
  const total = placed.size + allFlags.length
  const headline = `<p><strong class="${allFlags.length === 0 ? 'ok' : 'warn'}">
    ${placed.size} of ${total} students placed.</strong>
    ${allFlags.length > 0 ? `${allFlags.length} need attention (see flagged list).` : 'No hand-placement needed.'}</p>`

  const codes = [...roster.keys()].sort((a, b) => a - b)
  const maxLoad = Math.max(settings.cap, ...codes.map(c => roster.get(c).length))
  const loadRows = codes
    .map(code => {
      const n = roster.get(code).length
      const width = Math.round((n / maxLoad) * 300)
      const cls = n > settings.target ? 'bar over-target' : 'bar'
      return `<tr><td>${code}</td><td>${n}</td><td><span class="${cls}" style="width:${width}px"></span></td></tr>`
    })
    .join('')
  const loads = `<table><tr><th>Section</th><th>Students</th><th>Load (target ${settings.target}, cap ${settings.cap})</th></tr>${loadRows}</table>`

  let flaggedHtml = ''
  if (allFlags.length > 0) {
    const rows = allFlags
      .map(f => `<tr><td>${esc(f.student.id)}</td><td>${f.student.row}</td><td>${esc(f.reason)}</td></tr>`)
      .join('')
    flaggedHtml = `<h3 class="warn">Flagged students</h3>
      <table><tr><th>ID</th><th>Row</th><th>Reason</th></tr>${rows}</table>`
  }

  const rosters = codes
    .map(code => {
      const ids = roster.get(code).map(s => esc(s.id)).join(', ')
      return `<h4>Section ${code} — ${roster.get(code).length} students</h4><p>${ids}</p>`
    })
    .join('\n')

  return { headline, loads, flaggedHtml, rosters }
}
```

- [ ] **Step 5: Write src/ui/main.js**

```js
import { parseRows } from '../engine/parse.js'
import { validate } from '../engine/validate.js'
import { assign } from '../engine/assign.js'
import { masterCsv, rosterCsv, flaggedCsv } from '../engine/csv.js'
import { loadFile } from './file-load.js'
import { renderValidation, renderResults } from './render.js'

const $ = id => document.getElementById(id)

let report = null
let lastRun = null

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function onFile(file) {
  if (!file) return
  const rows = await loadFile(file)
  report = validate(parseRows(rows))
  $('validation-report').innerHTML = renderValidation(report)
  $('validation-section').hidden = false
  $('results-section').hidden = true
}

function allFlags(report, engineFlagged) {
  const flags = []
  for (const s of report.zeroOption) {
    flags.push({ student: s, reason: 'no teacher codes in row' })
  }
  for (const d of report.duplicates) {
    for (const row of d.rows) {
      flags.push({
        student: { id: d.id, row },
        reason: `duplicate student ID (rows ${d.rows.join(', ')})`,
      })
    }
  }
  return flags.concat(engineFlagged).sort((a, b) => a.student.row - b.student.row)
}

function run() {
  const settings = {
    cap: Number($('cap-input').value),
    target: Number($('target-input').value),
  }
  if (!Number.isFinite(settings.cap) || settings.cap < 1) return alert('Cap must be a positive number')
  if (!Number.isFinite(settings.target) || settings.target < 1) return alert('Target must be a positive number')

  const result = assign(report.eligible, settings)
  const flags = allFlags(report, result.flagged)
  lastRun = { result, flags }

  const html = renderResults(result, flags, settings)
  $('headline').innerHTML = html.headline
  $('load-summary').innerHTML = html.loads
  $('flagged-report').innerHTML = html.flaggedHtml
  $('rosters').innerHTML = html.rosters
  $('results-section').hidden = false
}

$('file-input').addEventListener('change', e => onFile(e.target.files[0]))

const zone = $('drop-zone')
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover') })
zone.addEventListener('dragleave', () => zone.classList.remove('dragover'))
zone.addEventListener('drop', e => {
  e.preventDefault()
  zone.classList.remove('dragover')
  onFile(e.dataTransfer.files[0])
})

$('run-button').addEventListener('click', run)
$('dl-master').addEventListener('click', () => download('advisory-assignments.csv', masterCsv(lastRun.result.placed)))
$('dl-rosters').addEventListener('click', () => download('advisory-rosters.csv', rosterCsv(lastRun.result.placed)))
$('dl-flagged').addEventListener('click', () => download('advisory-flagged.csv', flaggedCsv(lastRun.flags)))
```

- [ ] **Step 6: Build and verify**

Run: `npx vitest --run && npm run build`
Expected: all tests PASS; Vite build succeeds, output in `dist/`.

Then run `npm run dev` and manually verify in a browser (or note for the user to verify): drop a small test .csv (e.g. `id,priority,p1..p8` rows), see the validation report, click Run, see results and download all three CSVs. A quick test file:

```
1001,A,11,22,,,,,,
1002,B,11,,,,,,,
1003,C,22,33,,,,,,
```

- [ ] **Step 7: Commit**

```bash
git add index.html src/styles.css src/ui/file-load.js src/ui/render.js src/ui/main.js
git commit -m "feat: web UI — file load, validation, run, results, CSV downloads"
```

---

### Task 9: Single-file build target

One self-contained HTML file (`dist-single/index.html`) for the school's end-state hand-off — runs from a double-click, no hosting.

**Files:**
- Create: `vite.single.config.js`

- [ ] **Step 1: Create vite.single.config.js**

```js
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-single' },
})
```

- [ ] **Step 2: Build and verify**

Run: `npm run build:single && ls -la dist-single/ && grep -c '<script' dist-single/index.html`
Expected: build succeeds; `dist-single/` contains essentially just `index.html` (everything inlined — file will be ~1 MB because SheetJS is bundled in); the grep confirms inline script present.

- [ ] **Step 3: Commit**

```bash
git add vite.single.config.js
git commit -m "feat: single-file HTML build target"
```

---

### Task 10: GitHub repo + Pages deployment

**Files:**
- Create: `.github/workflows/deploy-pages.yml`, `README.md`

- [ ] **Step 1: Create the workflow**

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx vitest --run
      - run: npm run build
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write README.md**

```markdown
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
```

- [ ] **Step 3: Create the GitHub repo and push**

```bash
git add .github/workflows/deploy-pages.yml README.md
git commit -m "ci: GitHub Pages deployment + README"
gh repo create kylerw/advisory-scheduler --public --source . --push
```

Expected: repo created, main pushed, Actions run starts.

- [ ] **Step 4: Enable Pages via Actions source and verify deploy**

```bash
gh api repos/kylerw/advisory-scheduler/pages -X POST -f build_type=workflow 2>/dev/null || gh api repos/kylerw/advisory-scheduler/pages -X PUT -f build_type=workflow
gh run watch --repo kylerw/advisory-scheduler --exit-status
```

Expected: workflow completes green; site live at `https://kylerw.github.io/advisory-scheduler/`. If the first run raced the Pages enablement, re-run it: `gh run rerun --repo kylerw/advisory-scheduler <run-id>`.

- [ ] **Step 5: Smoke-test the live URL**

Run: `curl -s https://kylerw.github.io/advisory-scheduler/ | grep -o '<title>[^<]*</title>'`
Expected: `<title>Advisory Scheduler</title>`

---

### Task 11: Real-data acceptance (manual, with the user)

No code. Checklist to run with Kyler/Wendi on the actual file:

- [ ] Upload the real .xlsx. File check should report ~1,444 rows / 57 sections and (per the registrar's cleaning) no issues. Anything unexpected here is a data conversation, not a bug — but if the tool misreads a well-formed file, that IS a bug.
- [ ] Run with defaults (cap 29, target 26). Record: placed count, flagged count, min/max section load.
- [ ] Compare against the spreadsheet process's historical result: the tool must place at least as many students. Spot-check ~10 students: each assigned section appears in their row.
- [ ] Download all three CSVs and open them in Excel — confirm formats are usable for the school's workflow.
- [ ] Re-upload the same file and re-run: results identical (determinism check).
- [ ] Hand Wendi the Pages URL; build and deliver the single-file HTML if they prefer that route.
```
