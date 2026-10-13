import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportRowsToExcel } from './exportExcel.js'
import { exportStyledExcel } from './exportStyledExcel.js'

test('table and report exporters write actual CSV with escaped text and numeric values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brokereye-csv-'))
  const table = join(directory, 'table.csv')
  const report = join(directory, 'report.csv')
  const columns = [{ key: 'name', label: 'Name', value: 'name' }, { key: 'amount', label: 'Amount', value: 'amount', type: 'number' }]
  const rows = [{ name: 'Demo, "A"', amount: -12.5 }]
  try {
    exportRowsToExcel(columns, rows, 'Table', table)
    exportStyledExcel({ showTitle: false, columns, sections: [{ rows }], fileName: report })
    for (const file of [table, report]) {
      const csv = await readFile(file, 'utf8')
      assert.ok(!csv.startsWith('PK'), 'CSV must not contain an XLSX ZIP archive')
      assert.match(csv, /Name,Amount/)
      assert.match(csv, /"Demo, ""A"""/)
      assert.match(csv, /-12\.5/)
    }
  } finally {
    await Promise.all([table, report].map(file => unlink(file).catch(() => {})))
    await rmdir(directory)
  }
})
