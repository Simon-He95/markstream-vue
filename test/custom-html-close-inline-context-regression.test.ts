import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('custom html close same-line markers in inline contexts', () => {
  const tags = ['my_component']
  const md = getMarkdown('custom-html-close-inline-context-regression', { customHtmlTags: tags })

  const markerCases = [
    { label: 'heading marker', suffix: '## h' },
    { label: 'bullet marker', suffix: '- item' },
    { label: 'ordered marker', suffix: '1. item' },
    { label: 'blockquote marker', suffix: '> quote' },
    { label: 'admonition marker', suffix: '::: tip' },
    { label: 'math marker', suffix: '$$x' },
  ] as const

  it.each(markerCases)(
    'does not split paragraph when custom tag is inline and followed by $label',
    ({ suffix }) => {
      const markdown = `Text <my_component label="x"></my_component>${suffix}`
      const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]

      expect(nodes).toHaveLength(1)
      expect(nodes[0]?.type).toBe('paragraph')
    },
  )

  it.each(markerCases)(
    'does not split list item when custom tag is inline and followed by $label',
    ({ suffix }) => {
      const markdown = `- Text <my_component label="x"></my_component>${suffix}`
      const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]

      expect(nodes).toHaveLength(1)
      expect(nodes[0]?.type).toBe('list')
      expect(nodes[0]?.items).toHaveLength(1)
    },
  )

  it.each(markerCases)(
    'does not split blockquote line when custom tag is inline and followed by $label',
    ({ suffix }) => {
      const markdown = `> Text <my_component label="x"></my_component>${suffix}`
      const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]

      expect(nodes).toHaveLength(1)
      expect(nodes[0]?.type).toBe('blockquote')
      const inner = nodes[0]?.children ?? []
      expect(inner).toHaveLength(1)
      expect(inner[0]?.type).toBe('paragraph')
    },
  )

  it('still splits when custom block starts at line start', () => {
    const markdown = '<my_component>t</my_component>## h'
    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]

    expect(nodes.map(n => n.type)).toEqual(['paragraph', 'heading'])
  })
})
