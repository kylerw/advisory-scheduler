import * as XLSX from 'xlsx'

// File -> array of cell arrays (cols A..J), via SheetJS for both xlsx and csv.
export async function loadFile(file) {
  const buf = await file.arrayBuffer()
  const workbook = XLSX.read(buf, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })
}
