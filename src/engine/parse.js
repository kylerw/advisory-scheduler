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
