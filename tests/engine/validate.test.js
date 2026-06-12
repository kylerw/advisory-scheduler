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

  it('tiny-section boundary: exactly 5 is tiny, exactly 6 is not', () => {
    const rows = []
    for (let i = 0; i < 5; i++) rows.push(row(`five${i}`, 'A', '55'))
    for (let i = 0; i < 6; i++) rows.push(row(`six${i}`, 'A', '66'))
    const report = validate(parseRows(rows))
    expect(report.tinySections).toEqual([{ code: 55, eligibleCount: 5 }])
  })

  it('a duplicated zero-option student lands in duplicates, not zeroOption', () => {
    const parsed = parseRows([row('1', 'A'), row('1', 'B')])
    const report = validate(parsed)
    expect(report.duplicates).toEqual([{ id: '1', rows: [1, 2] }])
    expect(report.zeroOption).toEqual([])
  })
})
