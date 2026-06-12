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
      ['', 'A', '11', '', '', '', '', '', '', ''],
      ['1003', 'X', '11', '', '', '', '', '', '', ''],
      ['1004', 'B', 'abc', '22', '', '', '', '', '', ''],
    ])
    expect(students).toHaveLength(1)
    expect(malformed).toEqual([
      { row: 3, id: '', problems: ['missing student ID'] },
      { row: 4, id: '1003', problems: ['priority "X" is not A, B, or C'] },
      { row: 5, id: '1004', problems: ['non-numeric teacher code "abc" in period 1'] },
    ])
  })

  it('rejects hex, exponent, decimal, and zero teacher codes as non-numeric', () => {
    const { students, malformed } = parseRows([
      ['1', 'A', '0x1A', '1e3', '11.5', '0', '11', '', '', ''],
    ])
    expect(students).toEqual([])
    expect(malformed[0].problems).toEqual([
      'non-numeric teacher code "0x1A" in period 1',
      'non-numeric teacher code "1e3" in period 2',
      'non-numeric teacher code "11.5" in period 3',
      'non-numeric teacher code "0" in period 4',
    ])
  })

  it('handles exotic SheetJS cell types (Date, boolean) without throwing', () => {
    const { students, malformed } = parseRows([
      ['Header', 'Priority', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'],
      ['1', true, new Date(2026, 0, 1), '11', '', '', '', '', '', ''],
    ])
    expect(students).toEqual([])
    expect(malformed).toHaveLength(1)
    expect(malformed[0].problems[0]).toBe('priority "true" is not A, B, or C')
    expect(malformed[0].problems[1]).toMatch(/^non-numeric teacher code .* in period 1$/)
  })
})
