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
  it('keeps smartquotes enabled for normal prose by default', () => {
    const md = getMarkdown('issue-466-prose')
    const nodes = parseMarkdownToStructure('He said "hello world".', md, { final: true }) as any[]
    const text = JSON.stringify(nodes)
    expect(text).toMatch(/[“”]/)
  })

  it('preserves ASCII double quotes inside an inline custom tag without disabling prose smartquotes', () => {
    const markdown = 'He said "hello". <my-tag>{"foo":"bar","n":1}</my-tag>'
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

    const allNodes = JSON.stringify(nodes)
    expect(allNodes).toMatch(/[“”]/)
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

  it('keeps source cursor aligned across block and inline custom tags', () => {
    const markdown = `<my-tag>{"block":"value"}</my-tag>

Text "quoted" <my-tag>{"inline":"value"}</my-tag>`
    const md = getMarkdown('issue-466-cursor', { customHtmlTags: ['my-tag'] })
    const nodes = parseMarkdownToStructure(markdown, md, {
      final: true,
      customHtmlTags: ['my-tag'],
    }) as any[]

    const customNodes: any[] = []
    const walk = (items: any[]) => {
      for (const item of items) {
        if (item?.type === 'my-tag')
          customNodes.push(item)
        if (Array.isArray(item?.children))
          walk(item.children)
      }
    }
    walk(nodes)

    expect(customNodes).toHaveLength(2)
    expect(String(customNodes[0]?.content ?? '')).toContain('"block"')
    expect(String(customNodes[1]?.content ?? '')).toContain('"inline"')
    expect(JSON.stringify(nodes)).toMatch(/[“”]/)
  })
})
