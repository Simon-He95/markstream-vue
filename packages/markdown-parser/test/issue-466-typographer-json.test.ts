import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function findCustomNode(nodes: any[], tag: string): any {
  for (const n of nodes) {
    if (!n)
      continue
    if (n.type === tag)
      return n
    if (Array.isArray(n.children)) {
      const found = findCustomNode(n.children, tag)
      if (found)
        return found
    }
  }
  return null
}

describe('issue 466 typographer should not corrupt JSON quotes inside custom tags', () => {
  it('preserves ASCII double quotes inside an inline custom tag', () => {
    const markdown = '<my-tag>{"foo":"bar","n":1}</my-tag>'
    const md = getMarkdown('issue-466-inline', { customHtmlTags: ['my-tag'] })
    const nodes = parseMarkdownToStructure(markdown, md, {
      final: true,
      customHtmlTags: ['my-tag'],
    }) as any[]

    const node = findCustomNode(nodes, 'my-tag')
    expect(node).toBeTruthy()
    const content = String(node?.content ?? node?.raw ?? '')
    expect(content).toContain('"foo"')
    expect(content).toContain('"bar"')
    expect(content).not.toMatch(/[“”]/)
  })

  it('preserves ASCII double quotes inside a block-level custom tag', () => {
    const markdown = '<my-tag>\n{"foo":"bar","n":1}\n</my-tag>'
    const md = getMarkdown('issue-466-block', { customHtmlTags: ['my-tag'] })
    const nodes = parseMarkdownToStructure(markdown, md, {
      final: true,
      customHtmlTags: ['my-tag'],
    }) as any[]

    const node = findCustomNode(nodes, 'my-tag')
    expect(node).toBeTruthy()
    const content = String(node?.content ?? node?.raw ?? '')
    expect(content).toContain('"foo"')
    expect(content).toContain('"bar"')
    expect(content).not.toMatch(/[“”]/)
  })

  it('preserves ASCII single quotes inside an inline custom tag', () => {
    const markdown = `<my-tag>{'k':'v'}</my-tag>`
    const md = getMarkdown('issue-466-single', { customHtmlTags: ['my-tag'] })
    const nodes = parseMarkdownToStructure(markdown, md, {
      final: true,
      customHtmlTags: ['my-tag'],
    }) as any[]

    const node = findCustomNode(nodes, 'my-tag')
    expect(node).toBeTruthy()
    const content = String(node?.content ?? node?.raw ?? '')
    expect(content).toContain('\'k\'')
    expect(content).not.toMatch(/[‘’]/)
  })

  it('opt-in: re-enables smartquotes when enableSmartQuotes is true', () => {
    const markdown = 'He said "hello world".'
    const md = getMarkdown('issue-466-optin', { enableSmartQuotes: true })
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    const text = JSON.stringify(nodes)
    expect(text).toMatch(/[“”]/)
  })
})
