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

// BFS from the stuck student's sections toward any section with a free seat.
// chain[i] = { mover, from, to }: occupant `mover` leaves `from` for `to`.
// Returns { ok: true } after applying, or { ok: false, visited } naming the
// saturated cluster.
function repair(student, roster, placed, cap) {
  const visited = new Set(student.options)
  const queue = student.options.map(code => ({ code, chain: [] }))

  while (queue.length > 0) {
    const { code, chain } = queue.shift()
    if (roster.get(code).length < cap) {
      for (let i = chain.length - 1; i >= 0; i--) {
        const { mover, from, to } = chain[i]
        roster.set(from, roster.get(from).filter(s => s !== mover))
        roster.get(to).push(mover)
        placed.set(mover, to)
      }
      const dest = chain.length > 0 ? chain[0].from : code
      roster.get(dest).push(student)
      placed.set(student, dest)
      return { ok: true }
    }
    for (const occupant of roster.get(code)) {
      for (const alt of occupant.options) {
        if (!visited.has(alt)) {
          visited.add(alt)
          queue.push({ code: alt, chain: [...chain, { mover: occupant, from: code, to: alt }] })
        }
      }
    }
  }
  return { ok: false, visited }
}

function bottleneckReason(visited, roster, cap) {
  const sections = [...visited].sort((a, b) => a - b)
  const seats = sections.length * cap
  const locked = sections.reduce((n, code) => n + roster.get(code).length, 0) + 1
  return `all eligible sections full — bottleneck: sections ${sections.join(', ')} (${seats} seats, ${locked} students locked to them)`
}

export function assign(students, { cap, target }) {
  const order = orderStudents(students)
  const roster = new Map()
  for (const s of students) {
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
      const result = repair(s, roster, placed, cap)
      if (!result.ok) {
        flagged.push({ student: s, reason: bottleneckReason(result.visited, roster, cap) })
      }
    }
  }
  return { placed, roster, flagged }
}
