function esc(text) {
  return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function renderValidation(report) {
  const items = []
  items.push(`<p><strong>${report.rowCount}</strong> rows, <strong>${report.sectionCount}</strong> advisory sections found.</p>`)
  const problems = []
  if (report.malformed.length > 0) {
    const rows = report.malformed
      .map(m => `<tr><td>${m.row}</td><td>${esc(m.id)}</td><td>${esc(m.problems.join('; '))}</td></tr>`)
      .join('')
    problems.push(`<p class="bad">${report.malformed.length} malformed row(s) — these will be skipped:</p>
      <table><tr><th>Row</th><th>ID</th><th>Problem</th></tr>${rows}</table>`)
  }
  if (report.duplicates.length > 0) {
    const rows = report.duplicates
      .map(d => `<tr><td>${esc(d.id)}</td><td>${d.rows.join(', ')}</td></tr>`)
      .join('')
    problems.push(`<p class="bad">${report.duplicates.length} duplicate student ID(s) — all involved rows will be skipped until the file is fixed:</p>
      <table><tr><th>ID</th><th>Rows</th></tr>${rows}</table>`)
  }
  if (report.zeroOption.length > 0) {
    problems.push(`<p class="warn">${report.zeroOption.length} student(s) have no teacher codes and cannot be auto-placed; they will appear in the flagged list.</p>`)
  }
  if (report.tinySections.length > 0) {
    const list = report.tinySections.map(t => `${t.code} (${t.eligibleCount} students)`).join(', ')
    problems.push(`<p class="warn">Sections with very few eligible students — double-check these codes: ${esc(list)}</p>`)
  }
  if (problems.length === 0) items.push('<p class="ok">No issues found.</p>')
  return items.concat(problems).join('\n')
}

export function renderResults(result, allFlags, settings) {
  const { placed, roster } = result
  const total = placed.size + allFlags.length
  const headline = `<p><strong class="${allFlags.length === 0 ? 'ok' : 'warn'}">
    ${placed.size} of ${total} students placed.</strong>
    ${allFlags.length > 0 ? `${allFlags.length} need attention (see flagged list).` : 'No hand-placement needed.'}</p>`

  const codes = [...roster.keys()].sort((a, b) => a - b)
  const maxLoad = Math.max(settings.cap, ...codes.map(c => roster.get(c).length))
  const loadRows = codes
    .map(code => {
      const n = roster.get(code).length
      const width = Math.round((n / maxLoad) * 300)
      const cls = n > settings.target ? 'bar over-target' : 'bar'
      return `<tr><td>${code}</td><td>${n}</td><td><span class="${cls}" style="width:${width}px"></span></td></tr>`
    })
    .join('')
  const loads = `<table><tr><th>Section</th><th>Students</th><th>Load (target ${settings.target}, cap ${settings.cap})</th></tr>${loadRows}</table>`

  let flaggedHtml = ''
  if (allFlags.length > 0) {
    const rows = allFlags
      .map(f => `<tr><td>${esc(f.student.id)}</td><td>${f.student.row}</td><td>${esc(f.reason)}</td></tr>`)
      .join('')
    flaggedHtml = `<h3 class="warn">Flagged students</h3>
      <table><tr><th>ID</th><th>Row</th><th>Reason</th></tr>${rows}</table>`
  }

  const rosters = codes
    .map(code => {
      const ids = roster.get(code).map(s => esc(s.id)).join(', ')
      return `<h4>Section ${code} — ${roster.get(code).length} students</h4><p>${ids}</p>`
    })
    .join('\n')

  return { headline, loads, flaggedHtml, rosters }
}
