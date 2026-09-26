import * as XLSX from 'xlsx-js-style'

// Report-style Excel export (modelled on the BrokerEye Position PDF):
//   ┌ Title band (navy) ─────────────────────── generated-at ┐
//   │ meta line(s) e.g. "Period: 01/09/2026 – 26/09/2026"     │
//   ├ Section band (navy, centred)  e.g. "NSE"               │
//   │ Column header row (navy, white bold)                   │
//   │ zebra rows, numbers right-aligned with 2 decimals      │
//   └ TOTAL row (bold, light grey)                           ┘
//
// exportStyledExcel({
//   title: 'Deals',
//   meta: ['Period: …', 'Search: …'],          // optional extra lines under the title
//   sections: [{
//     title: 'NSE',                              // optional section band
//     rows: [...],
//     totals: { label: 'TOTAL', values: { volume: 123 } } // optional
//   }],
//   columns: [{ label, value: key | row => v, type: 'text'|'number'|'integer', digits: 2, signed: true, width }],
//   sheetName: 'Deals',
//   fileName: 'deals.xlsx'
// })

const NAVY = '1F3864'
const NAVY_DARK = '172B4D'
const WHITE = 'FFFFFF'
const ZEBRA = 'F5F7FA'
const TOTAL_FILL = 'E9EDF4'
const GRID = 'C9D1E0'
const GREEN = '15803D'
const RED = 'C62828'

const thin = { style: 'thin', color: { rgb: GRID } }
const gridBorder = { top: thin, bottom: thin, left: thin, right: thin }

const numberFormat = (col) => {
  if (col.numFmt) return col.numFmt
  if (col.type === 'integer') return '#,##0'
  const digits = Number.isInteger(col.digits) ? col.digits : 2
  return digits > 0 ? `#,##0.${'0'.repeat(digits)}` : '#,##0'
}

const readValue = (col, row) => (typeof col.value === 'function' ? col.value(row) : row?.[col.value])

const pad2 = (n) => String(n).padStart(2, '0')
export const formatGeneratedAt = (date = new Date()) =>
  `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`

export const exportStyledExcel = ({
  title = 'Report',
  showTitle = true,
  meta = [],
  generatedAt = formatGeneratedAt(),
  sections = [],
  columns = [],
  sheetName = 'Sheet1',
  fileName = 'export.xlsx'
}) => {
  const cols = columns.filter(Boolean)
  const colCount = Math.max(cols.length, 2)
  const lastCol = colCount - 1
  const ws = {}
  const merges = []
  const rowHeights = []
  let r = 0

  const put = (row, col, cell) => { ws[XLSX.utils.encode_cell({ r: row, c: col })] = cell }
  const band = (text, style, height) => {
    for (let c = 0; c <= lastCol; c += 1) put(r, c, { t: 's', v: c === 0 ? text : '', s: style })
    merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } })
    rowHeights[r] = { hpt: height }
    r += 1
  }

  if (showTitle) {
    // Title band: title on the left, generated time on the right
    const titleStyle = { font: { bold: true, sz: 16, color: { rgb: WHITE } }, fill: { fgColor: { rgb: NAVY_DARK } }, alignment: { vertical: 'center', horizontal: 'left', indent: 1 } }
    const stampStyle = { font: { sz: 10, color: { rgb: WHITE } }, fill: { fgColor: { rgb: NAVY_DARK } }, alignment: { vertical: 'center', horizontal: 'right' } }
    // The generated-at stamp spans the last two columns (when there are enough) so it is never cut off
    const stampStart = lastCol >= 3 ? lastCol - 1 : lastCol
    for (let c = 0; c <= lastCol; c += 1) {
      const isStamp = c >= stampStart
      put(r, c, { t: 's', v: c === 0 ? title : c === stampStart ? generatedAt : '', s: isStamp ? stampStyle : titleStyle })
    }
    if (stampStart > 1) merges.push({ s: { r, c: 0 }, e: { r, c: stampStart - 1 } })
    if (stampStart < lastCol) merges.push({ s: { r, c: stampStart }, e: { r, c: lastCol } })
    rowHeights[r] = { hpt: 30 }
    r += 1
  
  }

  const metaStyle = { font: { sz: 10, color: { rgb: '4B5563' } }, alignment: { horizontal: 'left', indent: 1 } }
  meta.filter(Boolean).forEach(line => band(line, metaStyle, 18))
  if (r > 0) r += 1 // spacer after title or metadata only

  const sectionStyle = { font: { bold: true, sz: 12, color: { rgb: WHITE } }, fill: { fgColor: { rgb: NAVY } }, alignment: { horizontal: 'center', vertical: 'center' }, border: gridBorder }
  const headStyle = (col) => ({
    font: { bold: true, sz: 10, color: { rgb: WHITE } },
    fill: { fgColor: { rgb: NAVY } },
    alignment: { horizontal: col.type && col.type !== 'text' ? 'right' : 'left', vertical: 'center', wrapText: true },
    border: { ...gridBorder, left: { style: 'thin', color: { rgb: '3B5486' } }, right: { style: 'thin', color: { rgb: '3B5486' } } }
  })

  let firstHeaderRow = null
  const widths = cols.map(c => Math.max(String(c.label).length + 2, c.width || 0))

  sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) r += 1 // gap between sections
    if (section.title) band(section.title, sectionStyle, 22)

    // Column headers
    if (firstHeaderRow === null) firstHeaderRow = r
    cols.forEach((col, c) => put(r, c, { t: 's', v: col.label, s: headStyle(col) }))
    rowHeights[r] = { hpt: 20 }
    r += 1

    // Body
    ;(section.rows || []).forEach((row, i) => {
      const fill = i % 2 ? { fgColor: { rgb: ZEBRA } } : undefined
      cols.forEach((col, c) => {
        const raw = readValue(col, row)
        const isNumber = col.type && col.type !== 'text'
        const num = Number(raw)
        let cell
        if (isNumber && raw !== '' && raw != null && Number.isFinite(num)) {
          const color = col.signed ? (num > 0 ? GREEN : num < 0 ? RED : undefined) : undefined
          cell = {
            t: 'n',
            v: num,
            z: numberFormat(col),
            s: { font: { sz: 10, ...(color ? { color: { rgb: color } } : {}) }, alignment: { horizontal: 'right' }, border: gridBorder, ...(fill ? { fill } : {}) }
          }
          widths[c] = Math.max(widths[c], num.toLocaleString('en-IN', { maximumFractionDigits: 2 }).length + 3)
        } else {
          const text = raw == null ? '' : String(raw)
          const color = col.colorFor ? col.colorFor(text, row) : undefined
          cell = {
            t: 's',
            v: text,
            s: { font: { sz: 10, ...(color ? { color: { rgb: color }, bold: true } : {}) }, alignment: { horizontal: col.align || 'left' }, border: gridBorder, ...(fill ? { fill } : {}) }
          }
          widths[c] = Math.max(widths[c], text.length + 2)
        }
        put(r, c, cell)
      })
      r += 1
    })

    // Totals
    if (section.totals) {
      const base = { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: TOTAL_FILL } }, border: { ...gridBorder, top: { style: 'medium', color: { rgb: NAVY } }, bottom: { style: 'medium', color: { rgb: NAVY } } } }
      const labelColumn = cols.findIndex(col => {
        const key = col.key ?? (typeof col.value === 'string' ? col.value : undefined)
        return section.totals.values?.[key] == null
      })
      cols.forEach((col, c) => {
        const key = col.key ?? (typeof col.value === 'string' ? col.value : undefined)
        const value = c === labelColumn ? (section.totals.label || 'TOTAL') : section.totals.values?.[key]
        if (c !== labelColumn && value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) {
          const num = Number(value)
          const color = col.signed ? (num > 0 ? GREEN : num < 0 ? RED : undefined) : undefined
          put(r, c, { t: 'n', v: num, z: numberFormat(col), s: { ...base, font: { ...base.font, ...(color ? { color: { rgb: color } } : {}) }, alignment: { horizontal: 'right' } } })
        } else {
          put(r, c, { t: 's', v: value == null ? '' : String(value), s: { ...base, alignment: { horizontal: col.align || 'left' } } })
        }
      })
      r += 1
    }
  })

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r - 1, 0), c: lastCol } })
  ws['!merges'] = merges
  ws['!rows'] = rowHeights
  ws['!cols'] = cols.map((_, c) => ({ wch: Math.min(Math.max(widths[c], 8), 45) }))
  if (firstHeaderRow !== null && sections.length === 1) {
    // Single table: keep the header visible while scrolling and allow Excel filtering
    ws['!freeze'] = { xSplit: 0, ySplit: firstHeaderRow + 1 }
    ws['!views'] = [{ state: 'frozen', ySplit: firstHeaderRow + 1, topLeftCell: XLSX.utils.encode_cell({ r: firstHeaderRow + 1, c: 0 }) }]
    const bodyEnd = firstHeaderRow + (sections[0].rows?.length || 0)
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: firstHeaderRow, c: 0 }, e: { r: bodyEnd, c: lastCol } }) }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
  XLSX.writeFile(wb, fileName)
}

// Buy / Sell style text colouring for action / type columns
export const actionColor = (text) => {
  const t = String(text).toUpperCase()
  if (t === 'BUY') return GREEN
  if (t === 'SELL') return RED
  return undefined
}

// Normalise MT5 action codes (0/1) and labels to BUY / SELL / FLAT
export const actionText = (value) => {
  if (value === 0 || value === '0') return 'BUY'
  if (value === 1 || value === '1') return 'SELL'
  return value == null || value === '' ? '' : String(value).toUpperCase()
}

// Positions-module columns: which keys are numbers / signed P&L / counts / BUY-SELL text / timestamps
const POSITION_NUMERIC = new Set(['volume', 'volumePercentage', 'priceOpen', 'priceCurrent', 'sl', 'tp', 'profit', 'profitPercentage', 'storage', 'storagePercentage', 'appliedPercentage', 'commission', 'netVolume', 'avgPrice', 'currentPrice', 'totalProfit', 'totalStorage', 'totalCommission'])
const POSITION_SIGNED = new Set(['profit', 'profitPercentage', 'storage', 'storagePercentage', 'totalProfit', 'totalStorage', 'commission', 'totalCommission'])
const POSITION_INTEGER = new Set(['loginCount', 'totalPositions', 'positionCount'])
const POSITION_ACTION = new Set(['action', 'netType', 'type'])
const POSITION_TIME = new Set(['time', 'updated', 'timeUpdate', 'timeCreate'])

// Convert the existing [{ key, label, accessor }] export headers into styled columns.
// Preserve one export column for each frontend column, including timestamps.
export const styledColumnsFromHeaders = (headers) => headers.flatMap(h => {
  const get = (row) => (typeof h.accessor === 'function' ? h.accessor(row) : row?.[h.key])
  if (POSITION_TIME.has(h.key)) return [{ key: h.key, label: h.label, value: get, align: 'center' }]
  if (POSITION_ACTION.has(h.key)) return [{ key: h.key, label: h.label, value: row => actionText(get(row)), align: 'center', colorFor: actionColor }]
  if (POSITION_INTEGER.has(h.key)) return [{ key: h.key, label: h.label, value: get, type: 'integer' }]
  if (POSITION_NUMERIC.has(h.key)) return [{ key: h.key, label: h.label, value: get, type: 'number', digits: 2, signed: POSITION_SIGNED.has(h.key) }]
  return [{ key: h.key, label: h.label, value: get }]
})

// Column sums for a TOTAL row (only for the given keys)
export const sumColumns = (rows, columns, keys) => {
  const values = {}
  columns.forEach(col => {
    if (!keys.includes(col.key)) return
    values[col.key] = rows.reduce((total, row) => {
      const v = Number(typeof col.value === 'function' ? col.value(row) : row?.[col.value])
      return total + (Number.isFinite(v) ? v : 0)
    }, 0)
  })
  return values
}
