import type { ParsedNode } from '../src'
import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'
import { createChunkParserPrototype } from '../src/chunk-prototype'

function findAll(nodes: any[], type: string, out: any[] = []): any[] {
  for (const node of nodes ?? []) {
    if (node?.type === type)
      out.push(node)
    if (Array.isArray(node?.children))
      findAll(node.children, type, out)
  }
  return out
}

const badgeMarkdown = `<div align="center">

[![CI][ci-badge]][ci-link]

</div>

[ci-badge]: https://example.com/ci.svg
[ci-link]: https://example.com/ci
`

const headingMarkdown = `<div>

## Title

see [docs]

</div>

[docs]: https://example.com/docs
`

describe('html wrapper children and outer reference definitions', () => {
  it('resolves reference links inside a wrapper against definitions after it', () => {
    const nodes = parseMarkdownToStructure(badgeMarkdown, getMarkdown(), { final: true })
    const [link] = findAll(nodes, 'link')
    expect(link?.href).toBe('https://example.com/ci')
    const [image] = findAll(nodes, 'image')
    expect(image?.src).toBe('https://example.com/ci.svg')
  })

  it('resolves reference links when the wrapper is structured into blocks', () => {
    const nodes = parseMarkdownToStructure(headingMarkdown, getMarkdown(), { final: true })
    expect(findAll(nodes, 'heading')).toHaveLength(1)
    const [link] = findAll(nodes, 'link')
    expect(link?.href).toBe('https://example.com/docs')
  })

  it('keeps the badge image and link on every frame after their definitions arrive', () => {
    const md = getMarkdown()
    const linkDefinitionEnd = badgeMarkdown.length
    const imageDefinitionEnd = badgeMarkdown.indexOf('[ci-link]:')
    const source = `${badgeMarkdown}\nTail text.\n\nMore tail.\n`
    let nodes: any[] = []
    for (let end = 1; end <= source.length; end++) {
      nodes = parseMarkdownToStructure(source.slice(0, end), md, { final: false })
      if (end === imageDefinitionEnd + 1)
        expect(md.stream!.stats!()).toMatchObject({ lastMode: 'cache' })
      if (end >= imageDefinitionEnd)
        expect(findAll(nodes, 'image').map(image => image.src), `prefix length ${end}`).toEqual(['https://example.com/ci.svg'])
      if (end >= linkDefinitionEnd)
        expect(findAll(nodes, 'link').map(link => link.href), `prefix length ${end}`).toEqual(['https://example.com/ci'])
    }

    const cached = parseMarkdownToStructure(source, md, { final: false })
    expect(md.stream!.stats!()).toMatchObject({ lastMode: 'cache' })
    expect(cached).toEqual(nodes)
    expect(parseMarkdownToStructure(source, md, { final: true })).toEqual(
      parseMarkdownToStructure(source, getMarkdown(), { final: true }),
    )
  })

  it.each(['> ', '- '])('keeps the wrapper linked on every tail frame after a %s reference definition', (marker) => {
    const md = getMarkdown()
    const initial = `${headingMarkdown.replace('[docs]:', `${marker}[docs]:`)}\nStable paragraph.\n\n`
    const tail = 'Read [docs] and then keep going.'
    const source = initial + tail
    const readLinks = (nodes: ParsedNode[]) => findAll(nodes, 'link').map(link => link.href)
    const docs = 'https://example.com/docs'
    parseMarkdownToStructure(initial, md, { final: false })

    for (let end = 1; end <= tail.length; end++) {
      const frame = parseMarkdownToStructure(initial + tail.slice(0, end), md, { final: false })
      const expected = end > tail.indexOf(']') ? [docs, docs] : [docs]
      expect(readLinks(frame), `prefix ${end}`).toEqual(expected)
    }
    expect(md.stream!.stats!()).toMatchObject({ fullParses: 1, resets: 0, tailHits: tail.length })
    const cached = parseMarkdownToStructure(source, md, { final: false })
    expect(md.stream!.stats!()).toMatchObject({ lastMode: 'cache' })
    expect(readLinks(cached)).toEqual([docs, docs])
    expect(readLinks(parseMarkdownToStructure(source, md, { final: true }))).toEqual([docs, docs])
  })

  it('keeps the node sequence after merging a wrapper before a list of reference definitions', () => {
    const md = getMarkdown()
    const initial = `${headingMarkdown.replace('[docs]:', '- [docs]:')}- [other]: /other\n\nStable paragraph.\n\n`
    const options = { final: false, reuseStableTopLevelNodes: true }
    const before = parseMarkdownToStructure(initial, md, options)
    expect(before.map(node => node.type)).toEqual(['html_block', 'paragraph'])

    const source = `${initial}Read [docs].`
    const streamed = parseMarkdownToStructure(source, md, options)
    expect(md.stream!.stats!()).toMatchObject({ lastMode: 'tail' })
    expect(streamed).toEqual(parseMarkdownToStructure(source, getMarkdown(), { final: false, streamParse: false }))
    expect(parseMarkdownToStructure(source, md, options)).toEqual(streamed)
    expect(md.stream!.stats!()).toMatchObject({ lastMode: 'cache' })
  })

  it('keeps references and local precedence across chunk parser appends', () => {
    const parser = createChunkParserPrototype(getMarkdown())
    const initial = `> [docs]: /outside
> [logo]: /logo.svg

<div>

## Title

See [docs] and ![Badge][logo].

> [docs]: /inside

</div>

Stable paragraph.

`
    const nodes: ParsedNode[] = []
    const patch = parser.append(initial)
    nodes.splice(patch.start, nodes.length - patch.start, ...patch.nodes)
    expect(findAll(nodes, 'link').map(link => link.href)).toEqual(['/inside'])
    for (const chunk of ['Read [docs].\n\n', 'See [docs] again.\n\n']) {
      const patch = parser.append(chunk)
      nodes.splice(patch.start, nodes.length - patch.start, ...patch.nodes)
      expect(parser.stats().stream).toMatchObject({ lastMode: 'append' })
      expect(findAll(nodes, 'link')[0]?.href).toBe('/inside')
      expect(findAll(nodes, 'link').at(-1)?.href).toBe('/outside')
      expect(findAll(nodes, 'image').map(image => image.src)).toEqual(['/logo.svg'])
    }
    expect(parser.stats()).toMatchObject({ tokenizerAppendCalls: 2, stream: { fullParses: 1, resets: 0 } })
  })

  it('resolves a new nested definition whose delimiter straddles two frames', () => {
    const md = getMarkdown()
    const initial = `${headingMarkdown.replace('see [docs]', 'see [docs] and [late]').replace('[docs]:', '> [docs]:')
    }\nStable paragraph.\n\n> [late]`
    const readLinks = (source: string) => findAll(parseMarkdownToStructure(source, md, { final: false }), 'link').map(link => link.href)
    expect(readLinks(initial)).toEqual(['https://example.com/docs'])
    const source = `${initial}: /late\n> [docs]: /duplicate\n\n`
    expect(readLinks(source)).toEqual(['https://example.com/docs', '/late'])
    expect(readLinks(source)).toEqual(['https://example.com/docs', '/late'])
  })

  it('reparses an unfinished nested definition when its destination changes', () => {
    const md = getMarkdown()
    const initial = headingMarkdown.replace('[docs]: https://example.com/docs\n', '> [docs]: /draft')
    const readLinks = (source: string) => findAll(parseMarkdownToStructure(source, md, { final: false }), 'link').map(link => link.href)
    expect(readLinks(initial)).toEqual(['/draft'])
    expect(readLinks(`${initial}-updated`)).toEqual(['/draft-updated'])
    expect(readLinks(`${initial}-updated invalid trailing text`)).toEqual([])
  })

  it('picks up the title of a nested definition across multiple lines', () => {
    const md = getMarkdown()
    const initial = headingMarkdown.replace('[docs]: https://example.com/docs\n', '> [docs]: /docs\n> "Line one\n> Line two')
    const readLink = (source: string) => findAll(parseMarkdownToStructure(source, md, { final: false }), 'link')[0]
    expect(readLink(initial)).toMatchObject({ href: '/docs', title: null })
    const complete = `${initial}"\n\nStable paragraph.\n\n`
    expect(readLink(complete)).toMatchObject({ href: '/docs', title: 'Line one\nLine two' })
    expect(readLink(`${complete}More text.`)).toMatchObject({ href: '/docs', title: 'Line one\nLine two' })
  })

  it('keeps definitions inside the wrapper working', () => {
    const md = `<div>

see [docs]

[docs]: https://example.com/inner

</div>
`
    const nodes = parseMarkdownToStructure(md, getMarkdown(), { final: true })
    const [link] = findAll(nodes, 'link')
    expect(link?.href).toBe('https://example.com/inner')
  })

  it('resolves definitions placed before the wrapper and in nested wrappers', () => {
    const md = `[docs]: https://example.com/docs

<div>

<div>

## Title

see [docs]

</div>

</div>
`
    const nodes = parseMarkdownToStructure(md, getMarkdown(), { final: true })
    const [link] = findAll(nodes, 'link')
    expect(link?.href).toBe('https://example.com/docs')
  })

  it('lets a definition inside the wrapper win for its own label', () => {
    const md = `<div>

see [docs] and [api]

[docs]: https://example.com/inner

</div>

[docs]: https://example.com/outer
[api]: https://example.com/api
`
    const nodes = parseMarkdownToStructure(md, getMarkdown(), { final: true })
    expect(findAll(nodes, 'link').map(link => link.href)).toEqual([
      'https://example.com/inner',
      'https://example.com/api',
    ])
  })

  it.each([
    ['> [docs]: /inner', 'docs'],
    ['- [docs]: /inner', 'docs'],
    ['[two\nwords]: /inner', 'two words'],
    ['[x\\]y]: /inner', 'x\\]y'],
  ])('keeps the fragment definition %s ahead of the outer definition', (definition, label) => {
    const markdown = `<div>
${definition}
## Title
see [${label}]
</div>

[${label}]: /outer
`
    const nodes = parseMarkdownToStructure(markdown, getMarkdown(), { final: true })
    expect(findAll(nodes, 'link').map(link => link.href)).toEqual(['/inner'])
  })

  it('does not resolve undefined labels', () => {
    const md = `<div>

see [missing]

</div>

[docs]: https://example.com/docs
`
    const nodes = parseMarkdownToStructure(md, getMarkdown(), { final: true })
    expect(findAll(nodes, 'link')).toHaveLength(0)
  })
})
