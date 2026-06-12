import { parseRows } from '../engine/parse.js'
import { validate } from '../engine/validate.js'
import { assign } from '../engine/assign.js'
import { masterCsv, rosterCsv, flaggedCsv } from '../engine/csv.js'
import { loadFile } from './file-load.js'
import { renderValidation, renderResults } from './render.js'

const $ = id => document.getElementById(id)

let report = null
let lastRun = null

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function onFile(file) {
  if (!file) return
  const rows = await loadFile(file)
  report = validate(parseRows(rows))
  $('validation-report').innerHTML = renderValidation(report)
  $('validation-section').hidden = false
  $('results-section').hidden = true
}

function allFlags(report, engineFlagged) {
  const flags = []
  for (const s of report.zeroOption) {
    flags.push({ student: s, reason: 'no teacher codes in row' })
  }
  for (const d of report.duplicates) {
    for (const row of d.rows) {
      flags.push({
        student: { id: d.id, row },
        reason: `duplicate student ID (rows ${d.rows.join(', ')})`,
      })
    }
  }
  return flags.concat(engineFlagged).sort((a, b) => a.student.row - b.student.row)
}

function run() {
  const settings = {
    cap: Number($('cap-input').value),
    target: Number($('target-input').value),
  }
  if (!Number.isFinite(settings.cap) || settings.cap < 1) return alert('Cap must be a positive number')
  if (!Number.isFinite(settings.target) || settings.target < 1) return alert('Target must be a positive number')

  const result = assign(report.eligible, settings)
  const flags = allFlags(report, result.flagged)
  lastRun = { result, flags }

  const html = renderResults(result, flags, settings)
  $('headline').innerHTML = html.headline
  $('load-summary').innerHTML = html.loads
  $('flagged-report').innerHTML = html.flaggedHtml
  $('rosters').innerHTML = html.rosters
  $('results-section').hidden = false
}

$('file-input').addEventListener('change', e => onFile(e.target.files[0]))

const zone = $('drop-zone')
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover') })
zone.addEventListener('dragleave', () => zone.classList.remove('dragover'))
zone.addEventListener('drop', e => {
  e.preventDefault()
  zone.classList.remove('dragover')
  onFile(e.dataTransfer.files[0])
})

$('run-button').addEventListener('click', run)
$('dl-master').addEventListener('click', () => download('advisory-assignments.csv', masterCsv(lastRun.result.placed)))
$('dl-rosters').addEventListener('click', () => download('advisory-rosters.csv', rosterCsv(lastRun.result.placed)))
$('dl-flagged').addEventListener('click', () => download('advisory-flagged.csv', flaggedCsv(lastRun.flags)))
