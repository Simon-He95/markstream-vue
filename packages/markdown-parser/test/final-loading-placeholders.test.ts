import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

const md = getMarkdown('final-loading-placeholders')

function childrenOf(input: string, final: boolean) {
  const nodes = parseMarkdownToStructure(input, md, { final }) as any[]
  expect(nodes).toHaveLength(1)
  return (nodes[0] as any).children as any[]
}

function describeNode(node: any): string {
  if (node?.type === 'text')
    return `text(${node.content})`
  if (node?.type === 'image')
    return `image(src=${node.src},loading=${node.loading})`
  if (node?.type === 'link')
    return `link(loading=${node.loading})`
  return String(node?.type)
}

function findLoading(nodes: any[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    if ((node?.type === 'image' || node?.type === 'link') && node.loading)
      out.push(describeNode(node))
    if (Array.isArray(node?.children))
      out.push(...findLoading(node.children))
    if (Array.isArray(node?.items))
      out.push(...findLoading(node.items))
    if (Array.isArray(node?.rows))
      out.push(...node.rows.flatMap((row: any) => findLoading(row?.cells ?? [])))
  }
  return out
}

describe('a final parse never leaves a loading image or link', () => {
  // Every one of these used to keep a placeholder that spun forever: the URL is
  // grabbed by linkify (a space is not allowed in a destination) or the
  // destination never closed, so nothing could resolve it once the parse ended.
  const cases = [
    '![a](https://e.com/a b.png)',
    '![a](https://e.com/a b.png) tail',
    'see ![a](https://e.com/a b.png) end',
    '![a](https://e.com/a.png "t t")',
    '[a](https://e.com/a b.png)',
    'see [a](https://e.com/a b.png) end',
    '[guide](http://s',
    'text [x](http://s z',
    '- [x](http://s',
    '| h |\n|---|\n| [x](http://s |',
    '**![a](https://e.com/a b.png)** ok',
    '> ![a](https://e.com/a b.png)',
  ]

  it.each(cases)('keeps %j free of loading nodes', (input) => {
    const final = parseMarkdownToStructure(input, md, { final: true }) as any[]
    expect(findLoading(final)).toEqual([])
  })

  it('shows the source of a space-separated destination instead of a link', () => {
    expect(childrenOf('![a](https://e.com/a b.png)', true)).toEqual([
      expect.objectContaining({ type: 'text', content: '![a](https://e.com/a b.png)' }),
    ])
    expect(childrenOf('[a](https://e.com/a b.png)', true)).toEqual([
      expect.objectContaining({ type: 'text', content: '[a](https://e.com/a b.png)' }),
    ])
  })

  it('keeps the placeholder for the same sources while streaming', () => {
    for (const input of ['![a](https://e.com/a b', '[a](https://e.com/a b', '[guide](http://s']) {
      const stream = parseMarkdownToStructure(input, md, { final: false }) as any[]
      expect(findLoading(stream).length, input).toBeGreaterThan(0)
    }
  })

  it('keeps the image inside an unfinished link instead of hiding it', () => {
    // LinkNode renders only `text` while a link is loading, so before this the
    // image was invisible behind the spinner.
    const children = childrenOf('[![img](a.png)]( http://s', true)
    expect(children.map(child => child.type)).toEqual(['text', 'image', 'text'])
    expect(children[0]).toMatchObject({ content: '[' })
    expect(children[1]).toMatchObject({ type: 'image', src: 'a.png', loading: false })
    expect(children[2]).toMatchObject({ content: '](http://s' })

    const streaming = parseMarkdownToStructure('[![img](a.png)]( http://s', md, { final: false }) as any[]
    expect(streaming[0].children[0]).toMatchObject({ type: 'link', loading: true })
  })

  it('keeps an autolink a link instead of rewriting it to source', () => {
    // A container parse can lose an autolink's label and hand it over loading.
    // `<url>` delimits its own destination, so the link is complete: the final
    // parse must not turn it into source text or leave a spinner behind.
    const nodes = parseMarkdownToStructure('::: tip\n<https://example.com>\n:::', md, { final: true }) as any[]
    const link = nodes[0].children[0].children[0]
    expect(link).toMatchObject({
      type: 'link',
      href: 'https://example.com',
      loading: false,
      markup: 'autolink',
      text: 'https://example.com',
    })
    expect(link.children).toEqual([
      expect.objectContaining({ type: 'text', content: 'https://example.com' }),
    ])
  })

  it.each([
    '![a](https://e.com/a.png)',
    '![a](<b c>)',
    '![a](b "t")',
    '![a](data:image/png;base64,AA)',
    '![a](file:///C:/x.png)',
    'see ![a](https://e.com/a.png) end',
    '[![a](https://e.com/i.png)](https://e.com/l)',
  ])('still resolves the real image %j', (input) => {
    for (const final of [false, true]) {
      const images: any[] = []
      const walk = (nodes: any[]) => {
        for (const node of nodes) {
          if (node?.type === 'image')
            images.push(node)
          if (Array.isArray(node?.children))
            walk(node.children)
        }
      }
      walk(parseMarkdownToStructure(input, md, { final }) as any[])
      expect(images.length, input).toBe(1)
      expect(images[0].loading, input).toBe(false)
      expect(String(images[0].src), input).not.toBe('')
    }
  })

  it('keeps a rejected scheme as an image, since its target is valid markdown', () => {
    // `javascript:` is blocked by validateLink, not half-typed: this repo shows
    // it as a placeholder with no src at every stage, which fix-link-inline
    // asserts for `file:///` with validateLink: () => false as well.
    const children = childrenOf('![a](javascript:alert(1))', true)
    expect(children).toEqual([
      expect.objectContaining({ type: 'image', src: '', loading: true }),
    ])
  })

  it('matches a cold final parse when the stream was parsed incrementally', () => {
    for (const input of [
      '![a](https://e.com/a b.png)',
      '[a](https://e.com/a b.png)',
      '[guide](http://s',
      '[![img](a.png)]( http://s',
      '![a](https://e.com/a.png)',
    ]) {
      const warm = getMarkdown(`warm-${input.length}`)
      for (let i = 1; i <= input.length; i++)
        parseMarkdownToStructure(input.slice(0, i), warm, { final: false })
      const warmFinal = parseMarkdownToStructure(input, warm, { final: true }) as any[]
      const coldFinal = parseMarkdownToStructure(input, getMarkdown(`cold-${input.length}`), { final: true }) as any[]
      expect(warmFinal, input).toEqual(coldFinal)
    }
  })
})
