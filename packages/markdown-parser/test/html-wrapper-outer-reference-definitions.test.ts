import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

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

  it('resolves them while streaming', () => {
    const md = getMarkdown()
    let nodes: any[] = []
    for (let end = 1; end <= headingMarkdown.length; end++)
      nodes = parseMarkdownToStructure(headingMarkdown.slice(0, end), md, { final: false })
    const [link] = findAll(nodes, 'link')
    expect(link?.href).toBe('https://example.com/docs')
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
