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

function collectCustomNodes(nodes: any[], tag: string): any[] {
  const found: any[] = []
  const seen = new Set<any>()
  const walk = (value: any) => {
    if (!value || typeof value !== 'object')
      return
    if (seen.has(value))
      return
    seen.add(value)

    if (Array.isArray(value)) {
      for (const item of value)
        walk(item)
      return
    }

    if (value.type === tag)
      found.push(value)

    for (const child of Object.values(value)) {
      if (child && typeof child === 'object')
        walk(child)
    }
  }
  walk(nodes)
  return found
}

function collectCustomNodesFromChildren(nodes: any[], tag: string): any[] {
  const found: any[] = []
  const walk = (items: any[]) => {
    for (const item of items) {
      if (!item)
        continue
      if (item.type === tag)
        found.push(item)
      if (Array.isArray(item.children))
        walk(item.children)
    }
  }
  walk(nodes)
  return found
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

    const customNodes = collectCustomNodesFromChildren(nodes, 'my-tag')

    expect(customNodes).toHaveLength(2)
    expect(String(customNodes[0]?.content ?? '')).toContain('"block"')
    expect(String(customNodes[1]?.content ?? '')).toContain('"inline"')
    expect(JSON.stringify(nodes)).toMatch(/[“”]/)
  })

  it('does not pick a custom-looking tag inside code span before a real custom tag', () => {
    const markdown = '`<my-tag>{"foo":"bad"}</my-tag>` <my-tag>{"foo":"real"}</my-tag>'
    const md = getMarkdown('issue-466-code-span-anchor', { customHtmlTags: ['my-tag'] })
    const nodes = parseMarkdownToStructure(markdown, md, {
      final: true,
      customHtmlTags: ['my-tag'],
    }) as any[]

    const node = findCustomNode(nodes, 'my-tag')
    expect(node).toBeTruthy()
    expect(String(node?.content ?? '')).toContain('"real"')
    expect(String(node?.content ?? '')).not.toContain('"bad"')
  })

  it('does not pick a custom-looking tag inside fenced code before a real custom tag', () => {
    const markdown = '```html\n<my-tag>{"foo":"bad"}</my-tag>\n```\n\n<my-tag>{"foo":"real"}</my-tag>'
    const md = getMarkdown('issue-466-fence-anchor', { customHtmlTags: ['my-tag'] })
    const nodes = parseMarkdownToStructure(markdown, md, {
      final: true,
      customHtmlTags: ['my-tag'],
    }) as any[]

    const node = findCustomNode(nodes, 'my-tag')
    expect(node).toBeTruthy()
    expect(String(node?.content ?? '')).toContain('"real"')
    expect(String(node?.content ?? '')).not.toContain('"bad"')
  })

  it('does not pick a custom-looking tag inside a link destination before a real custom tag', () => {
    const markdown = '[bad](<my-tag>{"foo":"bad"}</my-tag>) <my-tag>{"foo":"real"}</my-tag>'
    const md = getMarkdown('issue-466-link-destination-anchor', { customHtmlTags: ['my-tag'] })
    const nodes = parseMarkdownToStructure(markdown, md, {
      final: true,
      customHtmlTags: ['my-tag'],
    }) as any[]

    const customNodes = collectCustomNodes(nodes, 'my-tag')
    const node = customNodes[customNodes.length - 1]
    expect(node).toBeTruthy()
    expect(String(node?.content ?? '')).toContain('"real"')
    expect(String(node?.content ?? '')).not.toContain('"bad"')
  })

  it('does not pick a custom-looking tag inside a link title before a real custom tag', () => {
    const markdown = '[bad](https://example.com "<my-tag>{\\"foo\\":\\"bad\\"}</my-tag>") <my-tag>{"foo":"real"}</my-tag>'
    const md = getMarkdown('issue-466-link-title-anchor', { customHtmlTags: ['my-tag'] })
    const nodes = parseMarkdownToStructure(markdown, md, {
      final: true,
      customHtmlTags: ['my-tag'],
    }) as any[]

    const customNodes = collectCustomNodes(nodes, 'my-tag')
    expect(customNodes).toHaveLength(1)
    expect(String(customNodes[0]?.content ?? '')).toContain('"real"')
    expect(String(customNodes[0]?.content ?? '')).not.toContain('"bad"')
  })

  it('does not pick an escaped custom-looking tag before a real custom tag', () => {
    const markdown = '\\<my-tag>{"foo":"bad"}</my-tag> <my-tag>{"foo":"real"}</my-tag>'
    const md = getMarkdown('issue-466-escaped-anchor', { customHtmlTags: ['my-tag'] })
    const nodes = parseMarkdownToStructure(markdown, md, {
      final: true,
      customHtmlTags: ['my-tag'],
    }) as any[]

    const customNodes = collectCustomNodes(nodes, 'my-tag')
    expect(customNodes).toHaveLength(1)
    expect(String(customNodes[0]?.content ?? '')).toContain('"real"')
    expect(String(customNodes[0]?.content ?? '')).not.toContain('"bad"')
  })

  it('strips a trailing partial closing tag from streaming inline custom content', () => {
    const markdown = '<my-tag>{"foo":"bar"}</my'
    const md = getMarkdown('issue-466-streaming-partial-close', { customHtmlTags: ['my-tag'] })
    const nodes = parseMarkdownToStructure(markdown, md, {
      final: false,
      customHtmlTags: ['my-tag'],
    }) as any[]

    const node = findCustomNode(nodes, 'my-tag')
    expect(node).toBeTruthy()
    expect(String(node?.content ?? '')).toContain('"foo"')
    expect(String(node?.content ?? '')).toContain('"bar"')
    expect(String(node?.content ?? '')).not.toContain('</my')
    expect(String(node?.content ?? '')).not.toMatch(/[“”]/)
  })

  it('preserves custom tag JSON quotes in non-paragraph inline containers', () => {
    const markdown = [
      '# Heading <my-tag>{"heading":"ok"}</my-tag>',
      '',
      '- Item <my-tag>{"list":"ok"}</my-tag>',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| Cell | <my-tag>{"table":"ok"}</my-tag> |',
    ].join('\n')
    const md = getMarkdown('issue-466-inline-containers', { customHtmlTags: ['my-tag'] })
    const nodes = parseMarkdownToStructure(markdown, md, {
      final: true,
      customHtmlTags: ['my-tag'],
    }) as any[]

    const customNodes = collectCustomNodes(nodes, 'my-tag')
    expect(customNodes).toHaveLength(3)
    expect(String(customNodes[0]?.content ?? '')).toContain('"heading"')
    expect(String(customNodes[1]?.content ?? '')).toContain('"list"')
    expect(String(customNodes[2]?.content ?? '')).toContain('"table"')
    for (const node of customNodes)
      expect(String(node?.content ?? '')).not.toMatch(/[“”]/)
  })

  it('anchors custom tag JSON quotes to the current table cell', () => {
    const markdown = [
      '| A | B |',
      '| --- | --- |',
      '| <my-tag>{"cell":"one"}</my-tag> | <my-tag>{"cell":"two"}</my-tag> |',
    ].join('\n')
    const md = getMarkdown('issue-466-table-cell-anchor', { customHtmlTags: ['my-tag'] })
    const nodes = parseMarkdownToStructure(markdown, md, {
      final: true,
      customHtmlTags: ['my-tag'],
    }) as any[]

    const customNodes = collectCustomNodes(nodes, 'my-tag')
    expect(customNodes).toHaveLength(2)
    expect(String(customNodes[0]?.content ?? '')).toContain('"one"')
    expect(String(customNodes[0]?.content ?? '')).not.toContain('"two"')
    expect(String(customNodes[1]?.content ?? '')).toContain('"two"')
    expect(String(customNodes[1]?.content ?? '')).not.toContain('"one"')
  })
})
