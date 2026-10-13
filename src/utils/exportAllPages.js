export const EXPORT_CHUNK_SIZE = 500

// Downloads every row for the current filters from the API, one chunk per request.
// loadPage(page) must return { rows, total, pages } for a request with limit = chunk.
export async function fetchAllRows(loadPage, { chunk = EXPORT_CHUNK_SIZE, signal } = {}) {
  const rows = []
  for (let page = 1; ; page += 1) {
    signal?.throwIfAborted()
    const result = await loadPage(page)
    rows.push(...result.rows)
    if (!result.rows.length) break
    if (result.pages != null) { if (page >= result.pages) break }
    else if (result.total != null) { if (rows.length >= result.total) break }
    else if (result.rows.length < chunk) break
  }
  return rows
}

export function downloadCsv(header, records, filename) {
  const csv = [header, ...records]
    .map(row => row.map(value => '"' + String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"').join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
