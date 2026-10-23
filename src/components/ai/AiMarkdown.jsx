import { useEffect, useMemo, useRef } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Chart } from 'chart.js/auto'

// GFM-ish markdown (tables, code fences, bold/italic, links, lists, blockquotes) the way the
// reference Ask AI app renders it: sortable table columns and a "Copy" button on code blocks.
// Rendered once per message via `marked` + sanitised with DOMPurify (AI output is untrusted text).
marked.setOptions({ gfm: true, breaks: true })

const cellText = cell => {
  const copy = cell.cloneNode(true)
  copy.querySelectorAll('.ai-login-actions').forEach(node => node.remove())
  return copy.textContent.trim()
}

const tableData = table => ({
  headers: Array.from(table.querySelectorAll('thead th'), cell => cell.textContent.trim()),
  rows: Array.from(table.querySelectorAll('tbody tr'), row => Array.from(row.children, cellText))
})

const numericValue = value => {
  const source = String(value)
  const exact = source.match(/(?:L|Cr)\s*\(([-−–]?[\d,]+(?:\.\d+)?)\)/i)
  if (exact) return Number(exact[1].replace(/[−–]/g, '-').replace(/,/g, ''))
  const normalized = source.replace(/[−–]/g, '-').replace(/[₹$,%\s]/g, '').replace(/^\((.*)\)$/, '-$1')
  const match = normalized.match(/^-?\d*\.?\d+(?:e[-+]?\d+)?/i)
  return match ? Number(match[0]) : null
}

const chartLabelIndex = (headers, numericColumns) => {
  const numericIndexes = new Set(numericColumns.map(column => column.index))
  const preferred = headers.findIndex(header => /^(login|client(?:\s+login)?|name|symbol|exchange|date|day)$/i.test(header.trim()))
  if (preferred >= 0 && !numericIndexes.has(preferred)) return preferred
  return headers.findIndex((_, index) => !numericIndexes.has(index))
}

const downloadBlob = (content, type, filename) => {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`
const ICONS = {
  copy: icon('M9 9h11v11H9z M4 4h11v2H6v9H4z'),
  csv: icon('M12 3v12m-5-5 5 5 5-5M4 21h16'),
  chart: icon('M4 20V10m6 10V4m6 16v-7M2 20h20'),
  png: icon('M12 3v12m-5-5 5 5 5-5M4 21h16')
}

const makeButton = (label, iconSvg) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ai-table-action'
  button.innerHTML = `${iconSvg}<span>${label}</span>`
  return button
}

const AiMarkdown = ({ text, className = '', onOpenClient, onAsk, onPrefill }) => {
  const ref = useRef(null)
  const actionsRef = useRef({ onOpenClient, onAsk, onPrefill })
  actionsRef.current = { onOpenClient, onAsk, onPrefill }
  const html = useMemo(() => {
    const raw = marked.parse(text || '')
    return DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] })
  }, [text])
  const innerHtml = useMemo(() => ({ __html: html }), [html])

  // Post-render enhancements marked doesn't do on its own: a totals row gets bold styling,
  // numeric columns right-align, table headers become click-to-sort, and <pre> blocks get a
  // "Copy" button. Runs after every re-render since `html` is replaced wholesale each time.
  useEffect(() => {
    const root = ref.current
    if (!root) return undefined
    const charts = []
    const chartByBox = new WeakMap()

    root.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer' })

    root.querySelectorAll('pre').forEach(pre => {
      if (pre.querySelector('.ai-md-copy')) return
      pre.style.position = 'relative'
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ai-md-copy'
      btn.textContent = 'Copy'
      Object.assign(btn.style, {
        position: 'absolute', top: '6px', right: '6px', height: '24px', padding: '0 8px',
        border: '1px solid #e2e8f0', background: '#fff', color: '#475569', borderRadius: '6px',
        fontSize: '11px', cursor: 'pointer'
      })
      btn.onclick = () => {
        const code = pre.querySelector('code')?.textContent || pre.textContent || ''
        navigator.clipboard?.writeText(code).then(() => {
          btn.textContent = 'Copied'
          setTimeout(() => { btn.textContent = 'Copy' }, 1200)
        }).catch(() => {})
      }
      pre.appendChild(btn)
    })

    root.querySelectorAll('table').forEach(table => {
      if (table.closest('.ai-table-card')) return
      const theadRow = table.querySelector('thead tr')
      if (!theadRow) return
      const previous = table.previousElementSibling
      const titleNode = previous && (/^H[1-6]$/.test(previous.tagName) || (previous.tagName === 'P' && previous.children.length === 1 && previous.firstElementChild?.tagName === 'STRONG')) ? previous : null
      const title = titleNode?.textContent.trim().replace(/:$/, '') || 'Table'
      titleNode?.remove()
      const card = document.createElement('section')
      card.className = 'ai-table-card'
      const toolbar = document.createElement('div')
      toolbar.className = 'ai-table-toolbar'
      const heading = document.createElement('div')
      heading.className = 'ai-table-heading'
      const initialData = tableData(table)
      const loginIndex = initialData.headers.findIndex(header => /^(login|client login|account)$/i.test(header.trim()))
      if (loginIndex >= 0) {
        Array.from(table.querySelectorAll('tbody tr')).forEach(row => {
          const cell = row.children[loginIndex]
          if (!cell) return
          const login = cellText(cell).match(/\d+/)?.[0]
          if (!login) return
          cell.classList.add('ai-login-cell')
          cell.dataset.login = login
          cell.tabIndex = 0
          cell.role = 'button'
          cell.title = 'Open the client panel'
          const actions = document.createElement('span')
          actions.className = 'ai-login-actions'
          // Match the reference app: Panel opens the client panel; Credit/Rule/Watch prefill the
          // composer (so the broker can edit the amount — note the double space in "Give  credit")
          // and then send it themselves. Falls back to onAsk (send) if no prefill handler is wired.
          const prefill = (t) => (actionsRef.current.onPrefill || actionsRef.current.onAsk)?.(t)
          const choices = [
            ['Panel', 'Open the client panel', () => actionsRef.current.onOpenClient?.(login)],
            ['Credit', 'Credit in / out', () => prefill(`Give  credit to ${login}`)],
            ['Rule', 'Apply a rule', () => prefill(`Put ${login} on close only`)],
            ['Watch', 'Alert on this account', () => prefill(`Alert me when ${login}'s margin level drops below 120%`)]
          ]
          choices.forEach(([label, title, handler]) => {
            const button = document.createElement('button')
            button.type = 'button'
            button.textContent = label
            button.title = title
            button.onclick = event => {
              event.stopPropagation()
              handler()
            }
            actions.appendChild(button)
          })
          cell.appendChild(actions)
        })
      }
      heading.innerHTML = `<strong>${title}</strong><span>${initialData.rows.length} ${initialData.rows.length === 1 ? 'row' : 'rows'}</span>`
      const actions = document.createElement('div')
      actions.className = 'ai-table-actions'
      const copyButton = makeButton('Copy', ICONS.copy)
      const csvButton = makeButton('CSV', ICONS.csv)
      const chartButton = makeButton('Chart', ICONS.chart)
      actions.append(copyButton, csvButton, chartButton)
      toolbar.append(heading, actions)
      const scroller = document.createElement('div')
      scroller.className = 'ai-table-scroll'
      table.replaceWith(card)
      scroller.appendChild(table)
      card.append(toolbar, scroller)

      copyButton.onclick = async () => {
        const data = tableData(table)
        const output = [data.headers, ...data.rows].map(row => row.join('\t')).join('\n')
        await navigator.clipboard?.writeText(output)
        copyButton.querySelector('span').textContent = 'Copied'
        setTimeout(() => { copyButton.querySelector('span').textContent = 'Copy' }, 1200)
      }
      csvButton.onclick = () => {
        const data = tableData(table)
        const quote = value => `"${String(value).replace(/"/g, '""')}"`
        const csv = `\ufeff${[data.headers, ...data.rows].map(row => row.map(quote).join(',')).join('\n')}`
        downloadBlob(csv, 'text/csv;charset=utf-8', `${title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'table'}.csv`)
      }
      chartButton.onclick = () => {
        const existing = card.querySelector('.ai-table-chart')
        if (existing) {
          chartByBox.get(existing)?.destroy()
          existing.remove()
          chartButton.classList.remove('is-active')
          return
        }
        const data = tableData(table)
        const numericColumns = data.headers.map((header, index) => ({ header, index, values: data.rows.map(row => numericValue(row[index])) })).filter(column => !/(?:^|\s)(login|id|account)(?:\s|$)/i.test(column.header) && column.values.some(value => value != null))
        if (!numericColumns.length || !data.rows.length) return
        const labelIndex = chartLabelIndex(data.headers, numericColumns)
        const chartBox = document.createElement('div')
        chartBox.className = 'ai-table-chart'
        const chartHeader = document.createElement('div')
        chartHeader.className = 'ai-table-chart-header'
        chartHeader.innerHTML = `<strong>${title}</strong>`
        const pngButton = makeButton('PNG', ICONS.png)
        chartHeader.appendChild(pngButton)
        const canvasWrap = document.createElement('div')
        canvasWrap.className = 'ai-table-canvas'
        const canvas = document.createElement('canvas')
        canvasWrap.appendChild(canvas)
        chartBox.append(chartHeader, canvasWrap)
        card.appendChild(chartBox)
        const colors = ['#2563eb', '#0f766e', '#64748b', '#f59e0b', '#dc2626', '#7c3aed']
        const chart = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: data.rows.map((row, index) => labelIndex >= 0 ? row[labelIndex] : `Row ${index + 1}`),
            datasets: numericColumns.map((column, index) => ({ label: column.header, data: column.values.map(value => value ?? 0), backgroundColor: colors[index % colors.length], borderColor: colors[index % colors.length], borderWidth: 1 }))
          },
          options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', align: 'start' } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }
        })
        charts.push(chart)
        chartByBox.set(chartBox, chart)
        chartButton.classList.add('is-active')
        pngButton.onclick = () => { const link = document.createElement('a'); link.download = `${title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'chart'}.png`; link.href = chart.toBase64Image('image/png', 1); link.click() }
      }

      theadRow.dataset.sortWired = '1'
      const ths = Array.from(theadRow.children)
      ths.forEach((th, colIndex) => {
        th.style.cursor = 'pointer'
        th.style.userSelect = 'none'
        th.title = 'Click to sort'
        th.addEventListener('click', () => {
          const tbody = table.querySelector('tbody')
          if (!tbody) return
          const rows = Array.from(tbody.querySelectorAll('tr'))
          const asc = th.dataset.sortDir !== 'asc'
          ths.forEach(h => { delete h.dataset.sortDir; h.textContent = h.textContent.replace(/\s*[↑↓]$/, '') })
          th.dataset.sortDir = asc ? 'asc' : 'desc'
          th.textContent = `${th.textContent} ${asc ? '↑' : '↓'}`
          const num = (s) => { const n = Number(String(s).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null }
          rows.sort((ra, rb) => {
            const ca = ra.children[colIndex] ? cellText(ra.children[colIndex]) : ''
            const cb = rb.children[colIndex] ? cellText(rb.children[colIndex]) : ''
            const na = num(ca); const nb = num(cb)
            const cmp = (na != null && nb != null) ? na - nb : ca.localeCompare(cb, undefined, { numeric: true })
            return asc ? cmp : -cmp
          })
          rows.forEach(r => tbody.appendChild(r))
        })
      })
    })
    return () => charts.forEach(chart => chart.destroy())
  }, [html])

  const openLoginFromEvent = event => {
    if (event.target.closest('.ai-login-actions')) return
    const cell = event.target.closest('.ai-login-cell[data-login]')
    if (cell && ref.current?.contains(cell)) actionsRef.current.onOpenClient?.(cell.dataset.login)
  }

  const openLoginFromKey = event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const cell = event.target.closest('.ai-login-cell[data-login]')
    if (!cell || event.target !== cell || !ref.current?.contains(cell)) return
    event.preventDefault()
    actionsRef.current.onOpenClient?.(cell.dataset.login)
  }

  return <div ref={ref} className={`ai-md text-sm leading-6 text-slate-700 ${className}`} onClick={openLoginFromEvent} onKeyDown={openLoginFromKey} dangerouslySetInnerHTML={innerHtml} />
}

export default AiMarkdown
