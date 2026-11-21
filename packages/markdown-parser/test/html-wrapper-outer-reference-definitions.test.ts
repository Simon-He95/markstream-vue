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

const earlierParagraphs = 'Earlier paragraphs stay outside the tokenizer tail.\n\n'.repeat(40)

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

  it.each(['> ', '- '])('keeps the wrapper linked while appending after a %s reference definition', (marker) => {
    const md = getMarkdown()
    let source = headingMarkdown.replace('[docs]:', `${marker}[docs]:`)
    const readLinks = (nodes: any[]) => findAll(nodes, 'link').map(link => link.href)
    const expected = ['https://example.com/docs']
    for (const chunk of ['', '\n', 'First tail.\n', '\n', 'Second tail.\n', '\n']) {
      source += chunk
      expect(readLinks(parseMarkdownToStructure(source, md, { final: false })), JSON.stringify(source)).toEqual(expected)
    }
    expect((md.stream!.stats!() as { tailHits: number }).tailHits).toBeGreaterThan(0)
    expect(readLinks(parseMarkdownToStructure(source, md, { final: true }))).toEqual(expected)
  })

  it.each(['> ', '- '])('keeps ordinary tail appends incremental after a stable %s definition', (marker) => {
    const md = getMarkdown()
    let source = `${headingMarkdown.replace('[docs]:', `${marker}[docs]:`)}\n${earlierParagraphs}`
    const expected = ['https://example.com/docs']
    parseMarkdownToStructure(source, md, { final: false })
    md.stream!.resetStats!()

    for (const chunk of ['Start of the tail.', ' More plain text.', '\n\nNext tail.', ' More plain text.']) {
      source += chunk
      const nodes = parseMarkdownToStructure(source, md, { final: false })
      expect(findAll(nodes, 'link').map(link => link.href)).toEqual(expected)
      expect(md.stream!.stats!()).toMatchObject({ lastMode: 'tail' })
    }

    const cached = parseMarkdownToStructure(source, md, { final: false })
    expect(findAll(cached, 'link').map(link => link.href)).toEqual(expected)
    expect(md.stream!.stats!()).toMatchObject({ lastMode: 'cache', fullParses: 0, tailHits: 4 })
  })

  it.each(['> ', '- '])('keeps reference links in incrementally appended chunk parser patches for %s', (marker) => {
    const md = getMarkdown()
    const parser = createChunkParserPrototype(md)
    const initial = `${headingMarkdown.replace('[docs]:', `${marker}[docs]:`)}\n${earlierParagraphs}`
    const nodes = parser.append(initial).nodes
    md.stream!.resetStats!()

    for (const chunk of ['First tail.\n\n', 'Second tail.\n', '\nThird tail.', '\n\nFourth tail.\n']) {
      const patch = parser.append(chunk)
      nodes.splice(patch.start, nodes.length - patch.start, ...patch.nodes)
      expect(findAll(nodes, 'link').map(link => link.href)).toEqual(['https://example.com/docs'])
      expect(md.stream!.stats!()).toMatchObject({ lastMode: 'append' })
    }
    expect(md.stream!.stats!()).toMatchObject({ fullParses: 0, appendHits: 4 })
  })

  it('resolves references in a changed tail as well as in the unchanged wrapper', () => {
    const md = getMarkdown()
    const initial = `${headingMarkdown.replace('[docs]:', '> [docs]:')}\n${earlierParagraphs}`
    parseMarkdownToStructure(initial, md, { final: false })
    const source = `${initial}See the [guide][docs] for more.\n`
    const nodes = parseMarkdownToStructure(source, md, { final: false })
    expect(findAll(nodes, 'link').map(link => link.href)).toEqual([
      'https://example.com/docs',
      'https://example.com/docs',
    ])
  })

  it('drops a reference if an append invalidates its unfinished definition', () => {
    const md = getMarkdown()
    const source = headingMarkdown.replace('[docs]:', '> [docs]:').replace('https://example.com/docs', '/guide').trimEnd()
    const before = parseMarkdownToStructure(source, md, { final: false })
    expect(findAll(before, 'link').map(link => link.href)).toEqual(['/guide'])
    const after = parseMarkdownToStructure(`${source} unexpected`, md, { final: false })
    expect(findAll(after, 'link')).toHaveLength(0)
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
