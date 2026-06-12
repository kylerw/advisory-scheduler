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
    // Both students have the same options and option count; cap 1 — the A student
    // is processed first and takes the first option (equal loads, earlier option wins).
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
