import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'
import { fixTableTokens } from '../src/plugins/fixTableTokens'

describe('table loading mid-states', () => {
  it.each([
    '| ',
    '| 左对齐 ',
    '| 左对齐 |',
    '| 左对齐 | 居中对齐 |',
    '| 左对齐 | 居中对齐 | 右',
    '| 左对齐 | 居中对齐 | 右对齐 |',
  ])('does not treat a single-line header prefix as a loading table: %s', (markdown) => {
    const md = getMarkdown('table-loading-incomplete-header-prefix')

    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]

    expect(nodes.find(node => node.type === 'table')).toBeUndefined()
  })

  it('recognizes spaced separator rows as loading tables', () => {
    const md = getMarkdown('table-loading-spaced-separator')
    const markdown = `# 表格
|列1|列2|列3|列4|列5|
| - | - | - | - | `

    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]
    const table = nodes.find(node => node.type === 'table') as any

    expect(table).toBeTruthy()
    expect(table.loading).toBe(true)
    expect(table.header.cells.map((cell: any) => cell.raw)).toEqual(['列1', '列2', '列3', '列4', '列5'])
  })

  it('keeps header cells when the separator row is only partially typed', () => {
    const md = getMarkdown('table-loading-partial-separator')
    const markdown = `# 表格
|列1|列2|列3|列4|列5|
|:-`

    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]
    const table = nodes.find(node => node.type === 'table') as any

    expect(table).toBeTruthy()
    expect(table.loading).toBe(true)
    expect(table.header.cells.map((cell: any) => cell.raw)).toEqual(['列1', '列2', '列3', '列4', '列5'])
  })

  describe('separator row character-by-character loading', () => {
    const header = '| 左对齐 | 居中对齐 | 右对齐 |'
    const separatorTail = '\n|:-------|：'
    const cases = Array.from({ length: separatorTail.length }, (_, index) => header + separatorTail.slice(0, index + 1))

    it.each(cases.map((markdown, index) => [index, markdown]))('keeps a table loading at streamed character %i', (_, markdown) => {
      const md = getMarkdown('table-loading-char-by-char')

      const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]
      const table = nodes.find(node => node.type === 'table') as any

      expect(table).toBeTruthy()
      expect(table.loading).toBe(true)
      expect(table.header.cells.map((cell: any) => cell.raw)).toEqual(['左对齐', '居中对齐', '右对齐'])
    })
  })

  it('does not turn the fullwidth colon separator tail into a table in final mode', () => {
    const md = getMarkdown('table-loading-fullwidth-colon-tail-final')
    const markdown = `| 左对齐 | 居中对齐 | 右对齐 |
|:-------|：`

    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes.find(node => node.type === 'table')).toBeUndefined()
    expect(nodes[0]?.type).toBe('paragraph')
  })

  it('fixes inline fallback tables with spaced alignment markers', () => {
    const tokens = [
      { type: 'paragraph_open', tag: 'p' },
      { type: 'inline', tag: '', content: '|列1|列2|列3|\n| :- | :-: | -: |', children: null },
      { type: 'paragraph_close', tag: 'p' },
    ] as any[]

    const fixed = fixTableTokens(tokens)

    expect(fixed[0]?.type).toBe('table_open')
    expect(fixed[0]?.loading).toBe(true)
    expect(fixed.filter(token => token.type === 'th_open')).toHaveLength(3)
    expect(fixed.filter(token => token.type === 'inline').map(token => token.content)).toEqual(['列1', '列2', '列3'])
  })

  it('does not hang on long malformed separator rows', { timeout: 500 }, () => {
    const tokens = [
      { type: 'paragraph_open', tag: 'p' },
      {
        type: 'inline',
        tag: '',
        content: `|${'列|'.repeat(4000)}\n|${' :-'.repeat(4000)}`,
        children: [{}, {}, {}],
      },
      { type: 'paragraph_close', tag: 'p' },
    ] as any[]

    const fixed = fixTableTokens(tokens)

    expect(fixed).toHaveLength(3)
    expect(fixed[1]?.type).toBe('inline')
  })
})
