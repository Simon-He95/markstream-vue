import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function textOf(node: any): string {
  if (!node)
    return ''
  if (node.type === 'text')
    return String(node.content ?? '')
  if (Array.isArray(node.children))
    return node.children.map(textOf).join('')
  return ''
}

describe('issue #807 comparison operators are not HTML tags', () => {
  const cases = [
    'a<b && c>d',
    'a </ b',
    'if a < b then c > d',
    'Array<T>',
    'x<y',
    'score < baseline',
  ]

  it.each(cases)('keeps the source text on a final parse: %s', (markdown) => {
    const nodes = parseMarkdownToStructure(markdown, getMarkdown(), { final: true })
    expect(nodes.map(textOf).join('\n')).toBe(markdown)
    expect(JSON.stringify(nodes)).not.toContain('"html_inline"')
  })

  it('still parses a real inline tag when the name has an attribute or a close', () => {
    const nodes = parseMarkdownToStructure('a <b class="x">ok</b> z', getMarkdown(), { final: true })
    const html = (nodes[0] as any).children.find((child: any) => child.type === 'html_inline')
    expect(html?.tag).toBe('b')
    expect(textOf(html)).toBe('ok')
    expect(textOf(nodes[0])).toContain('a ')
    expect(textOf(nodes[0])).toContain(' z')
  })

  it('restores a comparison as soon as it cannot be an HTML tag', () => {
    const markdown = 'a<b && c>d'
    const md = getMarkdown()
    const disambiguatedAt = markdown.indexOf('&')
    for (let end = disambiguatedAt + 1; end <= markdown.length; end++) {
      const prefix = markdown.slice(0, end)
      const nodes = parseMarkdownToStructure(prefix, md, { final: false })
      expect(nodes.map(textOf).join(''), prefix).toBe(prefix.trimEnd())
    }
  })

  it('still hides a typed tag prefix that has no tag boundary yet', () => {
    const nodes = parseMarkdownToStructure('see <fo', getMarkdown(), { final: false })
    expect(textOf(nodes[0])).toBe('see')
    expect(JSON.stringify(nodes)).not.toContain('<fo')
  })
})
