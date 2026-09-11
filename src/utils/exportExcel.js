import * as XLSX from 'xlsx-js-style'

// Generic Excel export helper.
// columns: [{ label, value }] where value can be a string/number or a function(row) => cellValue
// rows: array of row objects
// sheetName / fileName: output naming
export const exportRowsToExcel = (columns, rows, sheetName = 'Sheet1', fileName = 'export.xlsx') => {
  const cols = Array.isArray(columns) ? columns : []
  const data = Array.isArray(rows) ? rows : []

  const header = cols.map(c => c.label)
  const body = data.map(row => cols.map(c => {
    const raw = typeof c.value === 'function' ? c.value(row) : row?.[c.value]
    return raw == null ? '' : raw
  }))

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...body])

  // Header styling (blue background, white bold text)
  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    fill: { fgColor: { rgb: '2563EB' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'BFDBFE' } },
      bottom: { style: 'thin', color: { rgb: 'BFDBFE' } },
      left: { style: 'thin', color: { rgb: 'BFDBFE' } },
      right: { style: 'thin', color: { rgb: 'BFDBFE' } },
    },
  }
  for (let c = 0; c < header.length; c += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c })]
    if (cell) cell.s = headerStyle
  }

  // Auto width based on content length
  worksheet['!cols'] = cols.map((c, idx) => {
    let max = String(c.label ?? '').length
    body.forEach(r => { max = Math.max(max, String(r[idx] ?? '').length) })
    return { wch: Math.min(Math.max(max + 2, 8), 40) }
  })

  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31))
  XLSX.writeFile(workbook, fileName)
}
