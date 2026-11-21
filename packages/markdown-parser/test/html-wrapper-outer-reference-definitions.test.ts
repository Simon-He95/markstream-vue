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

  it('keeps the badge image on every frame after its definition arrives', () => {
    const md = getMarkdown()
    const imageDefinitionEnd = badgeMarkdown.indexOf('[ci-link]:')
    let nodes: any[] = []
    for (let end = 1; end <= badgeMarkdown.length; end++) {
      nodes = parseMarkdownToStructure(badgeMarkdown.slice(0, end), md, { final: false })
      if (end === imageDefinitionEnd + 1)
        expect(md.stream!.stats!()).toMatchObject({ lastMode: 'cache' })
      if (end >= imageDefinitionEnd)
        expect(findAll(nodes, 'image').map(image => image.src), `prefix length ${end}`).toEqual(['https://example.com/ci.svg'])
    }

    expect(findAll(nodes, 'link').map(link => link.href)).toEqual(['https://example.com/ci'])

    const cached = parseMarkdownToStructure(badgeMarkdown, md, { final: false })
    expect(md.stream!.stats!()).toMatchObject({ lastMode: 'cache' })
    expect(cached).toEqual(nodes)
    expect(parseMarkdownToStructure(badgeMarkdown, md, { final: true })).toEqual(
      parseMarkdownToStructure(badgeMarkdown, getMarkdown(), { final: true }),
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

  it('keeps reference links across chunk parser patches', () => {
    const parser = createChunkParserPrototype(getMarkdown())
    const initial = headingMarkdown.replace('[docs]:', '> [docs]:')
    const nodes: ParsedNode[] = []
    for (const chunk of [initial, '\n', 'First tail.\n', '\n', 'Second tail.\n', '\n']) {
      const patch = parser.append(chunk)
      nodes.splice(patch.start, nodes.length - patch.start, ...patch.nodes)
      expect(findAll(nodes, 'link').map(link => link.href)).toEqual(['https://example.com/docs'])
    }
    expect(parser.stats().tokenizerAppendCalls).toBeGreaterThan(0)
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
