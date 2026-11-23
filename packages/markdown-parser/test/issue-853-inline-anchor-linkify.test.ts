import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function childrenOf(source: string, options: Record<string, unknown>, opts: Record<string, unknown> = {}) {
  const md = getMarkdown(`issue-853-${JSON.stringify(options)}`, { markdownItOptions: options })
  const nodes = parseMarkdownToStructure(source, md, { final: true, streamParse: false, ...opts }) as any[]
  return nodes[0]?.children ?? []
}

describe('issue 853: inline HTML anchors with html disabled and linkify enabled', () => {
  const htmlOff = { html: false, linkify: true }

  it('keeps an inline anchor with an absolute href as one html link node', () => {
    const children = childrenOf('See <a href="https://example.com/page">the page</a>.', htmlOff)

    expect(children.map((child: any) => child.type)).toEqual(['text', 'link', 'text'])
    const [link] = children.filter((child: any) => child.type === 'link')
    expect(link.href).toBe('https://example.com/page')
    expect(link.text).toBe('the page')
    expect(link.markup).toBe('html')
    expect(link.raw).toBe('<a href="https://example.com/page">the page</a>')
    expect(link.children.map((child: any) => child.content)).toEqual(['the page'])
    expect(children.some((child: any) => child.type === 'html_inline')).toBe(false)
  })

  it('matches the node stream produced when linkify is disabled', () => {
    const source = 'See <a href="https://example.com/page">the page</a>.'
    expect(childrenOf(source, htmlOff)).toEqual(childrenOf(source, { html: false, linkify: false }))
  })

  it('guards every attribute of a start tag, not only href', () => {
    const children = childrenOf('See <a title="see https://example.com" href="/page">x</a>.', htmlOff)

    expect(children.map((child: any) => child.type)).toEqual(['text', 'link', 'text'])
    const [link] = children.filter((child: any) => child.type === 'link')
    expect(link.href).toBe('/page')
    expect(link.text).toBe('x')
    expect(link.raw).toBe('<a title="see https://example.com" href="/page">x</a>')
  })

  it('guards void tags such as img', () => {
    const children = childrenOf('See <img src="https://example.com/a.png"> ok', htmlOff)

    expect(children.map((child: any) => child.type)).toEqual(['text', 'html_inline', 'text'])
    expect(children[1].content).toBe('<img src="https://example.com/a.png">')
  })

  it('still linkifies bare URLs outside inline tags', () => {
    const children = childrenOf('See https://example.com/page now.', htmlOff)

    expect(children.map((child: any) => child.type)).toEqual(['text', 'link', 'text'])
    expect(children[1].href).toBe('https://example.com/page')
    expect(children[1].markup).toBe('linkify')
  })

  it('still linkifies a URL after an unclosed tag-like prefix', () => {
    const children = childrenOf('if a<b and see https://example.com', htmlOff)

    expect(children.map((child: any) => child.type)).toEqual(['text', 'link'])
    expect(children[1].href).toBe('https://example.com')
  })

  it('keeps comparison text literal while linkifying a later URL', () => {
    const children = childrenOf('if a < b and c > d then https://example.com', htmlOff)

    expect(children.map((child: any) => child.type)).toEqual(['text', 'link'])
    expect(children[0].content).toBe('if a < b and c > d then ')
    expect(children[1].href).toBe('https://example.com')
  })

  it('guards custom tags declared for the parse', () => {
    const md = getMarkdown('issue-853-custom-tag', {
      markdownItOptions: htmlOff,
      customHtmlTags: ['thinking'],
    })
    const nodes = parseMarkdownToStructure(
      'Before <thinking src="https://example.com/a">inner</thinking> after',
      md,
      { customHtmlTags: ['thinking'], final: true, streamParse: false },
    ) as any[]
    const children = nodes[0]?.children ?? []

    expect(children.some((child: any) => child.type === 'thinking')).toBe(true)
    expect(children.some((child: any) => child.type === 'link')).toBe(false)
  })

  it('keeps the open tag whole while streaming', () => {
    const md = getMarkdown('issue-853-stream', { markdownItOptions: htmlOff })
    const nodes = parseMarkdownToStructure(
      'See <a href="https://example.com/page">the page',
      md,
      { final: false },
    ) as any[]
    const children = nodes[0]?.children ?? []

    expect(children.map((child: any) => child.type)).toEqual(['text', 'link'])
    expect(children[1].href).toBe('https://example.com/page')
    expect(children[1].markup).toBe('html')
  })
})
