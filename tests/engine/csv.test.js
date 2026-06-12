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

  it('escapes ids containing commas or quotes, and doubles quotes in reasons', () => {
    const weird = S('10,01"x', 'A', [10], 1)
    const m = masterCsv(new Map([[weird, 10]]))
    expect(m).toBe('student_id,assigned_section\n"10,01""x",10\n')
    const f = flaggedCsv([{ student: weird, reason: 'she said "hello"' }])
    expect(f).toBe('student_id,row_number,reason\n"10,01""x",1,"she said ""hello"""\n')
  })
})
