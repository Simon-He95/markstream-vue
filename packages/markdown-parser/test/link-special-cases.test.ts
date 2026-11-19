import { describe, expect, it } from 'vitest'
import { textIncludes } from '../../../test/utils/midstate-utils'
import { getMarkdown, parseMarkdownToStructure } from '../src'

const md = getMarkdown('test')

function collectByType(nodes: any[], type: string) {
  const out: any[] = []
  const walk = (n: any) => {
    if (!n)
      return
    if (n.type === type)
      out.push(n)
    if (Array.isArray(n.children))
      n.children.forEach(walk)
    if (Array.isArray(n.items))
      n.items.forEach(walk)
  }
  nodes.forEach(walk)
  return out
}

describe('special link cases', () => {
  it('parses link with numeric brackets in link text: [[8]](url)', () => {
    const markdown = '建议采用以下接口方案：[[8]](https://markstream.simonhe.me/)'
    const nodes = parseMarkdownToStructure(markdown, md)

    // Collect all link nodes
    const links: any[] = []
    const walk = (n: any) => {
      if (!n)
        return
      if (n.type === 'link')
        links.push(n)
      if (Array.isArray(n.children))
        n.children.forEach(walk)
      if (Array.isArray(n.items))
        n.items.forEach(walk)
    }
    nodes.forEach(walk)

    // Should have exactly one link
    expect(links.length).toBe(1)
    const link = links[0]

    // Verify link properties
    expect(link.href).toBe('https://markstream.simonhe.me/')
    expect(link.loading).toBe(false)

    // Verify link text contains [8]
    // The link text should be "[8]" (the brackets are part of the link text)
    const linkText = link.text || ''
    const childText = (link.children || [])
      .map((c: any) => (c.content ?? c.text ?? ''))
      .join('')
    const fullText = linkText || childText

    expect(fullText).toBe('[8]')

    // Verify the paragraph contains both the prefix text and the link
    const para = nodes.find((n: any) => n.type === 'paragraph') as any
    expect(para).toBeTruthy()
    expect(textIncludes(para, '建议采用以下接口方案：')).toBe(true)
    expect(para.children.some((c: any) => c.type === 'link')).toBe(true)
  })

  it('parses link with emphasis markers in link text: [DR **(Danmarks Radio)](url)', () => {
    const markdown = '[DR **(Danmarks Radio)](https://www.dr.dk/nyheder)'
    const nodes = parseMarkdownToStructure(markdown, md)

    // Collect all link nodes
    const links: any[] = []
    const walk = (n: any) => {
      if (!n)
        return
      if (n.type === 'link')
        links.push(n)
      if (Array.isArray(n.children))
        n.children.forEach(walk)
      if (Array.isArray(n.items))
        n.items.forEach(walk)
    }
    nodes.forEach(walk)

    // Should have exactly one link
    expect(links.length).toBe(1)
    const link = links[0]

    // Verify link properties
    expect(link.href).toBe('https://www.dr.dk/nyheder')
    expect(link.loading).toBe(false)

    // Should contain "DR" and "Danmarks Radio"
    expect(textIncludes(link, 'DR')).toBe(true)
    expect(textIncludes(link, 'Danmarks Radio')).toBe(true)
    expect(textIncludes(link, '(Danmarks Radio)')).toBe(true)

    // Verify the paragraph contains the link
    const para = nodes.find((n: any) => n.type === 'paragraph') as any
    expect(para).toBeTruthy()
    expect(para.children.some((c: any) => c.type === 'link')).toBe(true)
  })

  it('parses multiple links with special characters in same paragraph', () => {
    const markdown = '建议采用以下接口方案：[[8]](https://markstream.simonhe.me/)\n\n[DR **(Danmarks Radio)](https://www.dr.dk/nyheder)'
    const nodes = parseMarkdownToStructure(markdown, md)

    // Collect all link nodes
    const links: any[] = []
    const walk = (n: any) => {
      if (!n)
        return
      if (n.type === 'link')
        links.push(n)
      if (Array.isArray(n.children))
        n.children.forEach(walk)
      if (Array.isArray(n.items))
        n.items.forEach(walk)
    }
    nodes.forEach(walk)

    // Should have exactly two links
    expect(links.length).toBe(2)

    // First link: [[8]](url)
    const firstLink = links.find(l => l.href === 'https://markstream.simonhe.me/')
    expect(firstLink).toBeDefined()
    expect(firstLink?.loading).toBe(false)
    const firstLinkText = firstLink?.text || (firstLink?.children || []).map((c: any) => c.content || '').join('')
    expect(firstLinkText).toBe('[8]')

    // Second link: [DR **(Danmarks Radio)](url)
    const secondLink = links.find(l => l.href === 'https://www.dr.dk/nyheder')
    expect(secondLink).toBeDefined()
    expect(secondLink?.loading).toBe(false)
    expect(textIncludes(secondLink, 'DR')).toBe(true)
    expect(textIncludes(secondLink, 'Danmarks Radio')).toBe(true)
  })

  it('parses standalone numeric bracket link without prefix text', () => {
    const markdown = '[[8]](https://example.com)'
    const nodes = parseMarkdownToStructure(markdown, md)

    const links: any[] = []
    const walk = (n: any) => {
      if (!n)
        return
      if (n.type === 'link')
        links.push(n)
      if (Array.isArray(n.children))
        n.children.forEach(walk)
    }
    nodes.forEach(walk)

    expect(links.length).toBe(1)
    expect(links[0].href).toBe('https://example.com')
    expect(links[0].text || links[0].children?.map((c: any) => c.content || '').join('')).toBe('[8]')
  })

  it('parses local file URL links', () => {
    const markdown = '[fetch_deepseek_models.py#L62](file:///Users/eric8810/dim-agent/fetch_deepseek_models.py#L62)'
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })
    const links = collectByType(nodes, 'link')

    expect(links).toHaveLength(1)
    expect(links[0].href).toBe('file:///Users/eric8810/dim-agent/fetch_deepseek_models.py#L62')
    expect(links[0].text).toBe('fetch_deepseek_models.py#L62')
    expect(links[0].loading).toBe(false)
  })

  it('does not parse hosted file URL links', () => {
    const cases = [
      '[x](file://example.com/etc/passwd)',
      '[x](file:////example.com/etc/passwd)',
    ]

    for (const markdown of cases) {
      const nodes = parseMarkdownToStructure(markdown, md, { final: true })
      expect(collectByType(nodes, 'link'), markdown).toHaveLength(0)
      expect(textIncludes(nodes, 'x'), markdown).toBe(true)
    }
  })

  it('distinguishes between reference [8] and link [[8]](url)', () => {
    // Standalone [8] should be a reference
    const referenceMarkdown = '请参考 [8] 了解更多信息'
    const referenceNodes = parseMarkdownToStructure(referenceMarkdown, md)

    const references: any[] = []
    const walkRef = (n: any) => {
      if (!n)
        return
      if (n.type === 'reference')
        references.push(n)
      if (Array.isArray(n.children))
        n.children.forEach(walkRef)
    }
    referenceNodes.forEach(walkRef)

    // [8] as standalone should be parsed as reference (if reference rule matches)
    // But if it's followed by ](, it should be a link
    const linkMarkdown = '请参考 [[8]](https://example.com) 了解更多信息'
    const linkNodes = parseMarkdownToStructure(linkMarkdown, md)

    const links: any[] = []
    const walkLink = (n: any) => {
      if (!n)
        return
      if (n.type === 'link')
        links.push(n)
      if (Array.isArray(n.children))
        n.children.forEach(walkLink)
    }
    linkNodes.forEach(walkLink)

    // The link version should have a link node
    expect(links.length).toBeGreaterThan(0)
    const link = links.find(l => l.href === 'https://example.com')
    expect(link).toBeDefined()
    expect(link?.text || link?.children?.map((c: any) => c.content || '').join('')).toBe('[8]')
  })

  it('preserves normal reference-style links when the label is not numeric', () => {
    const markdown = `请看 [1][source]

[source]: https://example.com`
    const nodes = parseMarkdownToStructure(markdown, md)
    const links = collectByType(nodes, 'link')
    const references = collectByType(nodes, 'reference')

    expect(links).toHaveLength(1)
    expect(links[0].href).toBe('https://example.com')
    expect(links[0].text || links[0].children?.map((c: any) => c.content || '').join('')).toBe('1')
    expect(references).toHaveLength(0)
  })

  it('parses numeric references when they are adjacent to surrounding text', () => {
    const cases = [
      '随便输入一些文字[1]',
      '随便输入一些文字[1]后面还有文字',
      '随便输入一些文字[1] ',
      '随便输入一些文字[1] （空格+文字）',
    ]

    for (const markdown of cases) {
      const nodes = parseMarkdownToStructure(markdown, md)
      const references = collectByType(nodes, 'reference')

      expect(references, markdown).toHaveLength(1)
      expect(references[0].id).toBe('1')
      expect(textIncludes(nodes, '随便输入一些文字')).toBe(true)
    }
  })

  it('parses a numeric reference immediately followed by a normal inline link', () => {
    const cases = [
      '随便输入一些文字 [1][百度](www.baidu.com)',
      '随便输入一些文字 [1] [百度](www.baidu.com)',
    ]

    for (const markdown of cases) {
      const nodes = parseMarkdownToStructure(markdown, md)
      const references = collectByType(nodes, 'reference')
      const links = collectByType(nodes, 'link')

      expect(references, markdown).toHaveLength(1)
      expect(references[0].id).toBe('1')
      expect(links, markdown).toHaveLength(1)
      expect(links[0].href).toBe('www.baidu.com')
      expect(textIncludes(links[0], '百度')).toBe(true)
    }
  })

  it('parses chained numeric references without requiring spaces', () => {
    const nodes = parseMarkdownToStructure('随便输入一些文字[1][2][3]', md)
    const references = collectByType(nodes, 'reference')

    expect(references).toHaveLength(3)
    expect(references.map(ref => ref.id)).toEqual(['1', '2', '3'])
    expect(textIncludes(nodes, '随便输入一些文字')).toBe(true)
  })

  it('does not fold a bracket separated from its paren into a link', () => {
    // `]` and `(` have to touch for the source to be link syntax. With a space in
    // between, markdown-it renders the text and gives the URL its own link; the
    // label must not become that link's text, and the space must survive.
    const cases = [
      { input: '[a] (https://e.com/l)', text: '[a] (', href: 'https://e.com/l' },
      { input: '[a]  (https://e.com/l)', text: '[a]  (', href: 'https://e.com/l' },
      { input: 'text [a] (https://e.com/l) end', text: 'text [a] (', href: 'https://e.com/l' },
    ]

    for (const { input, text, href } of cases) {
      for (const final of [false, true]) {
        const nodes = parseMarkdownToStructure(input, md, { final })
        const links = collectByType(nodes, 'link')
        expect(links, `${input} final=${final}`).toHaveLength(1)
        expect(links[0]).toMatchObject({ href, text: href, loading: false })
        expect(textIncludes(nodes, text), `${input} final=${final}`).toBe(true)
      }
    }

    // No space: the source is a link, and its label is the link's text.
    for (const final of [false, true]) {
      const links = collectByType(parseMarkdownToStructure('[a](https://e.com/l)', md, { final }), 'link')
      expect(links, `final=${final}`).toHaveLength(1)
      expect(links[0]).toMatchObject({ href: 'https://e.com/l', text: 'a' })
    }

    // `![a] (url)` used to become an image, which markdown-it never produces.
    for (const final of [false, true]) {
      const nodes = parseMarkdownToStructure('![a] (https://e.com/i.png)', md, { final })
      expect(collectByType(nodes, 'image'), `final=${final}`).toHaveLength(0)
      expect(textIncludes(nodes, '![a] ('), `final=${final}`).toBe(true)
    }
  })
})
