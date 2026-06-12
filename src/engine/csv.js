function byRow(a, b) {
  return a.row - b.row
}

// Quote a field when it contains a comma, quote, or newline; double internal quotes.
function esc(value) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function masterCsv(placed) {
  const lines = [...placed.keys()]
    .sort(byRow)
    .map(s => `${esc(s.id)},${placed.get(s)}`)
  return ['student_id,assigned_section', ...lines, ''].join('\n')
}

export function rosterCsv(placed) {
  const entries = [...placed.entries()].sort(
    (a, b) => a[1] - b[1] || byRow(a[0], b[0]),
  )
  const lines = entries.map(([s, code]) => `${code},${esc(s.id)}`)
  return ['section,student_id', ...lines, ''].join('\n')
}

export function flaggedCsv(flagged) {
  const lines = [...flagged]
    .sort((a, b) => byRow(a.student, b.student))
    .map(f => `${esc(f.student.id)},${f.student.row},"${f.reason.replaceAll('"', '""')}"`)
  return ['student_id,row_number,reason', ...lines, ''].join('\n')
}
