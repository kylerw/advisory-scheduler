const PRIORITIES = ['A', 'B', 'C']

function cellStr(cell) {
  return cell === undefined || cell === null ? '' : String(cell).trim()
}

function isBlankRow(cells) {
  return cells.every(c => cellStr(c) === '')
}

// Header rows are only looked for within this many leading rows; past that,
// every row is treated as data and bad rows surface as malformed.
const HEADER_SCAN_LIMIT = 10

// A row looks like data when column B is a priority code AND its teacher-code
// cells aren't uniformly non-numeric text. The second clause catches header
// rows that label columns with letters (column B literally "B"); a zero-option
// data row (all option cells blank) still counts as data.
function isDataRow(cells) {
  if (!PRIORITIES.includes(cellStr(cells[1]).toUpperCase())) return false
  const filled = []
  for (let c = 2; c <= 9; c++) {
    const v = cellStr(cells[c])
    if (v !== '') filled.push(v)
  }
  return filled.length === 0 || filled.some(v => /^\d+$/.test(v))
}

/**
 * @param {Array<Array<unknown>>} rows - raw sheet rows, cols A..J = indexes 0..9
 * @returns {{ students: Array<{id: string, priority: 'A'|'B'|'C', options: number[], row: number}>,
 *             malformed: Array<{row: number, id: string, problems: string[]}>,
 *             headerRowsSkipped: number }}
 */
export function parseRows(rows) {
  const students = []
  const malformed = []

  // Skip leading header rows: everything above the first row that looks like
  // data (within the scan window). If nothing in the window looks like data,
  // skip nothing — every row then surfaces as malformed rather than vanishing.
  const scanWindow = rows.slice(0, HEADER_SCAN_LIMIT)
  const firstData = scanWindow.findIndex(cells => isDataRow(cells ?? []))
  const start = firstData === -1 ? 0 : firstData
  const headerRowsSkipped = scanWindow
    .slice(0, start)
    .filter(cells => !isBlankRow(cells ?? [])).length

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
      if (!/^\d+$/.test(raw) || raw === '0') {
        problems.push(`non-numeric teacher code "${raw}" in period ${c - 1}`)
        continue
      }
      const code = Number(raw)
      if (!options.includes(code)) options.push(code)
    }

    if (problems.length > 0) malformed.push({ row, id, problems })
    else students.push({ id, priority, options, row })
  }
  return { students, malformed, headerRowsSkipped }
}
