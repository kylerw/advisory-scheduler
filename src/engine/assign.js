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
