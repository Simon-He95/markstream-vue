import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

// Focus tests on the core plugin behavior added in fixHtmlInline

describe('fixHtmlInline core plugin', () => {
  it('expands single-token inline <a> with inner text', () => {
    const md = getMarkdown()
    const markdown = `<a href="https://example.com">Here</a>`
    const nodes = parseMarkdownToStructure(markdown, md)
    // nodes[0] should be paragraph with a link child
    const para = nodes[0] as any
    expect(para.type).toBe('paragraph')
    const link = para.children.find((c: any) => c.type === 'link')
    expect(link).toBeDefined()
    expect(link.href).toBe('https://example.com')
    expect(link.children?.[0]?.content).toBe('Here')
  })

  it('handles attribute values containing ">" inside quotes when splitting open tag', () => {
    const md = getMarkdown()
    const markdown = `<a href="https://example.com?q=a>b&x=1">Here</a>`
    const nodes = parseMarkdownToStructure(markdown, md)
    const para = nodes[0] as any
    const link = para.children.find((c: any) => c.type === 'link')
    expect(link).toBeDefined()
    expect(link.href).toBe('https://example.com?q=a>b&x=1')
    expect(link.children?.[0]?.content).toBe('Here')
  })

  it('treats void/self-closing tag inline as single html chunk (fallback to inline_code)', () => {
    const md = getMarkdown()
    const markdown = `before <img src="/x.png" alt="pic" /> after`
    const nodes = parseMarkdownToStructure(markdown, md)
    const para = nodes[0] as any
    expect(para.type).toBe('paragraph')
    const htmlInline = para.children.find((c: any) => c.type === 'html_inline')
    expect(htmlInline).toBeDefined()
    expect(htmlInline.content).toContain('<img')
    // Ensure no weird closing tag was synthesized in output
    expect(String(htmlInline.content)).not.toContain('</img>')
  })
})
