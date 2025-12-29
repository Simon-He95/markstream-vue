import type {
  MarkdownToken,
  ParseOptions,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '../../types'
import { parseInlineTokens } from '../inline-parsers'

// Extract alignment from attrs (e.g. ['style','text-align:left'])
function extractAlign(attrs: MarkdownToken['attrs']): 'left' | 'right' | 'center' | undefined {
  if (!attrs)
    return 'left'
  for (const a of attrs) {
    if (!a)
      continue
    const [key, val] = a
    if (!val)
      continue
    const value = String(val).trim().toLowerCase()
    if (key === 'style') {
      const m = /text-align\s*:\s*(left|right|center)/i.exec(value)
      if (m)
        return m[1].toLowerCase() as any
    }
  }
  return 'left'
}
export function parseTable(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
): [TableNode, number] {
  let j = index + 1
  let headerRow: TableRowNode | null = null
  const rows: TableRowNode[] = []
  let isHeader = false
  while (j < tokens.length && tokens[j].type !== 'table_close') {
    if (tokens[j].type === 'thead_open') {
      isHeader = true
      j++
    }
    else if (tokens[j].type === 'thead_close') {
      isHeader = false
      j++
    }
    else if (
      tokens[j].type === 'tbody_open'
      || tokens[j].type === 'tbody_close'
    ) {
      j++
    }
    else if (tokens[j].type === 'tr_open') {
      const cells: TableCellNode[] = []
      let k = j + 1

      while (k < tokens.length && tokens[k].type !== 'tr_close') {
        if (tokens[k].type === 'th_open' || tokens[k].type === 'td_open') {
          const isHeaderCell = tokens[k].type === 'th_open'
          const contentToken = tokens[k + 1]
          const content = String(contentToken.content ?? '')
          const align = extractAlign(tokens[k].attrs)

          cells.push({
            type: 'table_cell',
            header: isHeaderCell || isHeader,
            children: parseInlineTokens(contentToken.children || [], content, undefined, {
              requireClosingStrong: options?.requireClosingStrong,
              customHtmlTags: options?.customHtmlTags,
            }),
            raw: content,
            align,
          })

          k += 3 // Skip th_open/td_open, inline, th_close/td_close
        }
        else {
          k++
        }
      }

      const rowNode: TableRowNode = {
        type: 'table_row',
        cells,
        raw: cells.map(cell => cell.raw).join('|'),
      }

      if (isHeader) {
        headerRow = rowNode
      }
      else {
        rows.push(rowNode)
      }

      j = k + 1 // Skip tr_close
    }
    else {
      j++
    }
  }

  if (!headerRow) {
    // Default empty header if none found
    headerRow = {
      type: 'table_row',
      cells: [],
      raw: '',
    }
  }

  const tableNode: TableNode = {
    type: 'table',
    header: headerRow,
    rows,
    loading: tokens[index].loading ?? false,
    raw: [headerRow, ...rows].map(row => row.raw).join('\n'),
  }

  return [tableNode, j + 1] // Skip table_close
}
