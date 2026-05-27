import type { MarkdownIt } from '../markdown-it-types'
import type { MarkdownToken } from '../types'

export function applyFixTableTokens(md: MarkdownIt) {
  // Run after block parsing so block-level tokens (including inline
  // children) are present. We replace the token array with the
  // fixed version returned by `fixTableTokens`.
  md.core.ruler.after('block', 'fix_table_tokens', (state: unknown) => {
    const s = state as unknown as { tokens?: MarkdownToken[], env?: { __markstreamFinal?: boolean }, src?: string }
    try {
      const toks = s.tokens ?? []
      const fixed = fixTableTokens(toks, !!s.env?.__markstreamFinal, s.src ?? '')
      if (Array.isArray(fixed))
        s.tokens = fixed
    }
    catch (e) {
      // swallow errors to avoid breaking parsing; keep original tokens
      console.error('[applyFixTableTokens] failed to fix table tokens', e)
    }
  })
}

function createStart() {
  return [
    {
      type: 'table_open',
      tag: 'table',
      attrs: null,
      map: null,
      children: null,
      content: '',
      markup: '',
      info: '',
      level: 0,
      loading: true,
      meta: null,
    },
    {
      type: 'thead_open',
      tag: 'thead',
      attrs: null,
      block: true,
      level: 1,
      children: null,
    },
    {
      type: 'tr_open',
      tag: 'tr',
      attrs: null,
      block: true,
      level: 2,
      children: null,
    },

  ]
}
function createEnd() {
  return [
    {
      type: 'tr_close',
      tag: 'tr',
      attrs: null,
      block: true,
      level: 2,
      children: null,
    },
    {
      type: 'thead_close',
      tag: 'thead',
      attrs: null,
      block: true,
      level: 1,
      children: null,
    },
    {
      type: 'table_close',
      tag: 'table',
      attrs: null,
      map: null,
      children: null,
      content: '',
      markup: '',
      info: '',
      level: 0,
      meta: null,
    },
  ]
}
function createTh(text: string) {
  return [{
    type: 'th_open',
    tag: 'th',
    attrs: null,
    block: true,
    level: 3,
    children: null,
  }, {
    type: 'inline',
    tag: '',
    children: null,
    content: text,
    level: 4,
    attrs: null,
    block: true,
  }, {
    type: 'th_close',
    tag: 'th',
    attrs: null,
    block: true,
    level: 3,
    children: null,
  }]
}

function getPipeRowCells(line: string, requireTrailingPipe: boolean) {
  if (!line.startsWith('|') || line.includes('\n'))
    return null
  if (requireTrailingPipe && !line.endsWith('|'))
    return null

  const cells = line.slice(1).split('|')
  if (cells.at(-1) === '')
    cells.pop()

  return cells.length > 0 && cells.every(cell => cell.trim().length > 0) ? cells : null
}

function hasTrailingPipeHeaderRow(line: string) {
  return getPipeRowCells(line, true) !== null
}

function isSeparatorCell(cell: string) {
  return /^:?-+:?$/.test(cell.trim())
}

function isTableSeparatorRow(line: string) {
  if (!line.startsWith('|'))
    return false

  const cells = line.slice(1).split('|')
  if (cells.at(-1) === '')
    cells.pop()

  return cells.length > 0 && cells.every(isSeparatorCell)
}

function isPartialSeparatorTail(cell: string) {
  return /^(?:[:：]-*|:?-+:?)?$/.test(cell.trim())
}

function isTableSeparatorRowWithPartialTail(line: string) {
  if (line === '')
    return true
  if (!line.startsWith('|'))
    return false

  const cells = line.slice(1).split('|')
  const tail = cells.at(-1) ?? ''
  const completedCells = cells.slice(0, -1)

  return completedCells.every(isSeparatorCell)
    && isPartialSeparatorTail(tail)
}

function isTruncatedSeparatorRow(line: string) {
  return line === '|' || line === '|:'
}

function hasTrailingPipeHeaderRowWithoutColon(line: string) {
  const cells = getPipeRowCells(line, true)
  return cells !== null && cells.every(cell => !cell.includes(':'))
}

export function fixTableTokens(tokens: MarkdownToken[], final = false, source = ''): MarkdownToken[] {
  const fixedTokens = [...tokens]
  if (tokens.length < 3)
    return fixedTokens
  const i = tokens.length - 2
  const token = tokens[i]
  if (token.type === 'inline') {
    const tcontent = String(token.content ?? '')
    const headerContent = tcontent.split('\n')[0] ?? ''
    const [headerLine = '', separatorLine = '', ...rest] = tcontent.split('\n')
    const hasTrailingNewlineSeparatorStart = !final
      && !tcontent.includes('\n')
      && /\r?\n$/.test(source)
      && hasTrailingPipeHeaderRow(tcontent)

    if (
      !final
      && (
        (
          tcontent.includes('\n')
          && rest.length === 0
          && hasTrailingPipeHeaderRow(headerLine)
          && isTableSeparatorRowWithPartialTail(separatorLine)
        )
        || hasTrailingNewlineSeparatorStart
      )
    ) {
      const body = headerContent.slice(1, -1).split('|').map(i => i.trim()).flatMap(i => createTh(i))
      const insert = ([
        ...createStart(),
        ...body,
        ...createEnd(),
      ] as unknown) as MarkdownToken[]
      fixedTokens.splice(i - 1, 3, ...insert)
    }
    else if (
      tcontent.includes('\n')
      && rest.length === 0
      && hasTrailingPipeHeaderRow(headerLine)
      && isTableSeparatorRow(separatorLine)
    ) {
      // 解析 table
      const body = headerContent.slice(1, -1).split('|').map(i => i.trim()).flatMap(i => createTh(i))
      const insert = ([
        ...createStart(),
        ...body,
        ...createEnd(),
      ] as unknown) as MarkdownToken[]
      fixedTokens.splice(i - 1, 3, ...insert)
    }
    else if (
      tcontent.includes('\n')
      && rest.length === 0
      && hasTrailingPipeHeaderRowWithoutColon(headerLine)
      && isTruncatedSeparatorRow(separatorLine)
    ) {
      token.content = tcontent.slice(0, -2)
      token.children!.splice(2, 1)
    }
  }

  return fixedTokens
}
