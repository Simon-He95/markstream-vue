import type {
  InternalParseOptions,
  MarkdownToken,
  ParseOptions,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '../../types'
import type { LinkifyDemotionContext } from '../linkifyHeuristics'
import { parseInlineTokens } from '../inline-parsers'
import { inferLinkifyDemotionContext } from '../linkifyHeuristics'

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
        return m[1].toLowerCase() as TableCellNode['align']
    }
  }
  return 'left'
}

function hasTableCellContext(context?: LinkifyDemotionContext) {
  return context?.filename === true || context?.explicitFilename === true || context?.marketTicker === true
}

function mergeTableCellContext(
  left?: LinkifyDemotionContext,
  right?: LinkifyDemotionContext,
) {
  const merged = {
    filename: left?.filename || right?.filename,
    explicitFilename: left?.explicitFilename || right?.explicitFilename,
    marketTicker: left?.marketTicker || right?.marketTicker,
  }
  return hasTableCellContext(merged) ? merged : undefined
}

function parseOptionsForTableCell(
  options: ParseOptions | undefined,
  headerRaw?: string,
  rowContext?: LinkifyDemotionContext,
) {
  const cellContext = mergeTableCellContext(inferLinkifyDemotionContext(headerRaw), rowContext)
  if (!hasTableCellContext(cellContext))
    return options

  const inheritedContext = (options as InternalParseOptions | undefined)?.__linkifyDemotionContext
  return {
    ...options,
    __linkifyDemotionContext: {
      filename: inheritedContext?.filename || cellContext?.filename,
      explicitFilename: inheritedContext?.explicitFilename || cellContext?.explicitFilename,
      marketTicker: inheritedContext?.marketTicker || cellContext?.marketTicker,
    },
  } as InternalParseOptions
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
      let rowContext: LinkifyDemotionContext | undefined

      while (k < tokens.length && tokens[k].type !== 'tr_close') {
        if (tokens[k].type === 'th_open' || tokens[k].type === 'td_open') {
          const isHeaderCell = tokens[k].type === 'th_open'
          const contentToken = tokens[k + 1]
          const content = String(contentToken.content ?? '')
          const align = extractAlign(tokens[k].attrs)
          const cellIndex = cells.length
          const isBodyCell = !isHeaderCell && !isHeader
          const headerRaw = isBodyCell ? headerRow?.cells[cellIndex]?.raw : undefined

          cells.push({
            type: 'table_cell',
            header: isHeaderCell || isHeader,
            children: parseInlineTokens(contentToken.children || [], content, undefined, parseOptionsForTableCell(options, headerRaw, isBodyCell ? rowContext : undefined)),
            raw: content,
            align,
          })

          if (isBodyCell)
            rowContext = mergeTableCellContext(rowContext, inferLinkifyDemotionContext(content))

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

  const tokenLoading = tokens[index].loading === true

  const tableNode: TableNode = {
    type: 'table',
    header: headerRow,
    rows,
    loading: tokenLoading && !options?.final && rows.length === 0,
    raw: [headerRow, ...rows].map(row => row.raw).join('\n'),
  }

  return [tableNode, j + 1] // Skip table_close
}
