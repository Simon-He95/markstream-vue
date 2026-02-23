import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('custom html tag table regression', () => {
  const tags = ['my_component']
  const md = getMarkdown('custom-html-tag-in-table-regression', { customHtmlTags: tags })

  it('keeps all table rows when repeated custom tags are used in cells', () => {
    const markdown = `| Item| Value |
|--------|-------|
| A | <my_component label="Name"></my_component> |
| B | <my_component label="Name 2"></my_component> |
| C | domain.com |`

    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('table')

    const table = nodes[0]
    expect(table.rows).toHaveLength(3)
    expect(table.rows[0]?.cells?.[1]?.children?.[0]?.type).toBe('my_component')
    expect(table.rows[1]?.cells?.[1]?.children?.[0]?.type).toBe('my_component')
    expect(table.rows[2]?.cells?.[1]?.children?.[0]?.type).toBe('link')

    const firstCustomCellChildren = table.rows[0]?.cells?.[1]?.children ?? []
    expect(
      firstCustomCellChildren.some((c: any) => c?.type === 'html_inline' && String(c?.content ?? '').includes('</my_component>')),
    ).toBe(false)
  })

  const sameLineSuffixCases = [
    { label: 'pipe', suffix: '| tail' },
    { label: 'heading marker', suffix: '## heading-like' },
    { label: 'bullet marker', suffix: '- list-like' },
    { label: 'ordered marker', suffix: '1. ordered-like' },
    { label: 'blockquote marker', suffix: '> quote-like' },
    { label: 'admonition marker', suffix: '::: tip' },
    { label: 'math marker', suffix: '$$math-like' },
  ] as const

  it.each(sameLineSuffixCases)(
    'does not break table when custom tag close is followed by $label inside a cell',
    ({ suffix }) => {
      const markdown = `| Item | Value |
| --- | --- |
| A | <my_component label="Name"></my_component>${suffix} |
| B | ok |`

      const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]
      expect(nodes).toHaveLength(1)
      expect(nodes[0]?.type).toBe('table')
      expect(nodes[0]?.rows).toHaveLength(2)
      expect(nodes[0]?.rows?.[1]?.cells?.[0]?.children?.[0]?.content).toBe('B')
    },
  )

  it('does not break blockquote table rows after custom tag close in a cell', () => {
    const markdown = `> | Item | Value |
> | --- | --- |
> | A | <my_component label="Name"></my_component>## heading-like |
> | B | ok |`

    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('blockquote')
    const table = nodes[0]?.children?.[0]
    expect(table?.type).toBe('table')
    expect(table?.rows).toHaveLength(2)
    expect(table?.rows?.[1]?.cells?.[0]?.children?.[0]?.content).toBe('B')
  })
})
