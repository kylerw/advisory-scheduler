import { describe, it, expect } from 'vitest'
import { assign, rebalance } from '../../src/engine/assign.js'

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
    // Both students have the same options and option count; cap 1. Priority A is
    // processed first; with equal (zero) loads it takes its earlier option, 10.
    // The C student then finds 10 full and lands in 20.
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

  it('breaks option-count and priority ties by file row order', () => {
    // Identical option counts and priorities; cap 1 — the earlier row is
    // processed first and wins its first option.
    const students = [
      S('late', 'B', [10, 20], 5),
      S('early', 'B', [10, 20], 2),
    ]
    const { placed } = assign(students, { cap: 1, target: 1 })
    expect(placed.get(students[1])).toBe(10)
    expect(placed.get(students[0])).toBe(20)
  })
})

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

describe('assign — rebalance', () => {
  it('keeps a flexible student out of an over-target section', () => {
    // cap 4, target 2. a,b,c are locked to 10 (load 3 > target).
    // flex must end in 20 (under target), never 10.
    const students = [
      S('a', 'A', [10], 1),
      S('b', 'A', [10], 2),
      S('c', 'A', [10], 3),
      S('flex', 'A', [10, 20], 4),
    ]
    const { placed, roster } = assign(students, { cap: 4, target: 2 })
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

  it('directly relocates a movable occupant out of an over-target section', () => {
    // Hand-built post-greedy state that greedy itself avoids: 10 at load 4 > target 3,
    // 20 empty, flex has 20 as an under-target alternative.
    const a = S('a', 'A', [10], 1)
    const b = S('b', 'A', [10], 2)
    const c = S('c', 'A', [10], 3)
    const flex = S('flex', 'A', [10, 20], 4)
    const roster = new Map([[10, [a, b, c, flex]], [20, []]])
    const placed = new Map([[a, 10], [b, 10], [c, 10], [flex, 10]])
    rebalance(roster, placed, 3)
    expect(roster.get(10).map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(roster.get(20).map(s => s.id)).toEqual(['flex'])
    expect(placed.get(flex)).toBe(20)
  })

  it('does not move when the swap would not strictly improve balance', () => {
    // Anti-oscillation guard: src load 2, dest load 1 — destLoad + 1 < srcLoad fails.
    const a = S('a', 'A', [10], 1)
    const b = S('b', 'A', [10, 20], 2)
    const c = S('c', 'A', [20], 3)
    const roster = new Map([[10, [a, b]], [20, [c]]])
    const placed = new Map([[a, 10], [b, 10], [c, 20]])
    rebalance(roster, placed, 5)
    expect(roster.get(10)).toHaveLength(2)
    expect(roster.get(20)).toHaveLength(1)
  })
})

describe('assign — multi-hop repair chains', () => {
  it('repairs through a 2-hop chain', () => {
    // cap 1. Order = file order (all 2-option, same priority).
    // a->10, b->20, c->30, then d needs 10 or 20; both full.
    // Chain: a can only go 10<->20 (visited), b: 20->30 (full) -> deeper: c: 30->40 (free).
    // Expected: 2-hop chain b 20->30 won't fit (30 occupied by c)... BFS explores:
    // seeds {10,20}; occupants a(10): alts 20 visited; b(20): alt 30 -> push {30,[b:20->30]};
    // 30 full; occupant c alts: 40 -> push {40, [b:20->30, c:30->40]}; 40 free ->
    // apply reversed: c 30->40, b 20->30, d takes chain[0].from = 20.
    const students = [
      S('a', 'A', [10, 20], 1),
      S('b', 'A', [20, 30], 2),
      S('c', 'A', [30, 40], 3),
      S('d', 'A', [10, 20], 4),
    ]
    const { placed, flagged, roster } = assign(students, { cap: 1, target: 1 })
    expect(flagged).toEqual([])
    expect(placed.get(students[0])).toBe(10)
    expect(placed.get(students[1])).toBe(30)
    expect(placed.get(students[2])).toBe(40)
    expect(placed.get(students[3])).toBe(20)
    for (const list of roster.values()) expect(list.length).toBeLessThanOrEqual(1)
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
    const second = assign(generate(42, 1444, 57), settings)
    expect([...second.placed.values()]).toEqual([...placed.values()])
    expect(second.flagged.length).toBe(flagged.length)
  })
})
