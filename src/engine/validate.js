// Sections with <= this many ELIGIBLE students are flagged as suspiciously tiny.
const TINY_SECTION_THRESHOLD = 5

// parsed: { students, malformed, headerRowsSkipped } from parseRows. Returns
// the pre-run report.
// rowCount counts parsed data rows (header and blank rows are not included).
export function validate({ students, malformed, headerRowsSkipped }) {
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
    headerRowsSkipped: headerRowsSkipped ?? 0,
    sectionCount: sectionCounts.size,
    eligible,
    zeroOption,
    duplicates,
    malformed,
    tinySections,
  }
}
