import type { ParsedNode } from '../src'
import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function collectLinks(nodes: ParsedNode[], out: any[] = []): any[] {
  for (const node of nodes ?? []) {
    if (!node)
      continue
    if (node.type === 'link')
      out.push(node)
    const record = node as unknown as {
      children?: ParsedNode[]
      items?: ParsedNode[]
      rows?: ParsedNode[]
      cells?: ParsedNode[]
    }
    if (Array.isArray(record.children))
      collectLinks(record.children, out)
    if (Array.isArray(record.items))
      collectLinks(record.items, out)
    if (Array.isArray(record.rows))
      collectLinks(record.rows, out)
    if (Array.isArray(record.cells))
      collectLinks(record.cells, out)
  }
  return out
}

function firstLink(nodes: ParsedNode[]) {
  const links = collectLinks(nodes)
  expect(links.length).toBeGreaterThan(0)
  return links[0]
}

describe('link markup source', () => {
  const md = getMarkdown('link-markup-source')

  it('marks linkified bare text as linkify', () => {
    // `.md` / `.sh` / `.ai` are real TLDs, so these stay links by design and
    // must be distinguishable from hand written links.
    for (const source of ['see summary.md', 'see notes.sh', 'run report.ai now']) {
      const link = firstLink(parseMarkdownToStructure(source, md, { final: true }))
      expect(link.markup).toBe('linkify')
    }
  })

  it('marks linkified urls, domains and e-mails as linkify', () => {
    expect(firstLink(parseMarkdownToStructure('bare https://example.com here', md, { final: true })).markup).toBe('linkify')
    expect(firstLink(parseMarkdownToStructure('www.example.com', md, { final: true })).markup).toBe('linkify')
    expect(firstLink(parseMarkdownToStructure('write to me@example.com today', md, { final: true })).markup).toBe('linkify')
  })

  it('keeps explicit markdown links on an empty markup', () => {
    for (const source of ['[summary.md](http://summary.md)', '[guide](https://example.com/a.md)', 'see [label](https://example.com) end']) {
      const node = parseMarkdownToStructure(source, md, { final: true })
      for (const link of collectLinks(node))
        expect(link.markup).toBe('')
    }
  })

  it('marks angle bracket autolinks as autolink', () => {
    const link = firstLink(parseMarkdownToStructure('<https://example.com>', md, { final: true }))
    expect(link.markup).toBe('autolink')
  })

  it('marks inline html anchors as html', () => {
    const link = firstLink(parseMarkdownToStructure('<a href="https://example.com/x">html link</a>', md, { final: true }))
    expect(link.markup).toBe('html')
  })

  it('sets markup on every link node, including recovered ones', () => {
    const source = [
      'see summary.md',
      '',
      '[summary.md](http://summary.md)',
      '',
      '<https://example.com>',
      '',
      'em *[label](https://a.com)* end',
      '',
      'x [label](https://example.com/x.png) tail',
      '',
      '<a href="https://example.com/y">html</a>',
    ].join('\n')

    const links = collectLinks(parseMarkdownToStructure(source, md, { final: true }))
    expect(links.length).toBeGreaterThanOrEqual(6)
    for (const link of links) {
      expect(typeof link.markup).toBe('string')
      expect(['', 'linkify', 'autolink', 'html']).toContain(link.markup)
    }
  })

  it('keeps markup identical between streamed prefixes and a cold parse', () => {
    const warm = getMarkdown('link-markup-stream-warm')
    const cold = getMarkdown('link-markup-stream-cold')

    const steps = ['see sum', 'see summary', 'see summary.md', 'see summary.md and more']
    let streamed: any[] = []
    for (const step of steps) {
      streamed = collectLinks(parseMarkdownToStructure(step, warm, {
        final: step === steps[steps.length - 1],
        streamParse: true,
        reuseStableTopLevelNodes: true,
      } as any))
    }

    const expected = collectLinks(parseMarkdownToStructure(steps[steps.length - 1], cold, { final: true }))

    expect(streamed).toEqual(expected)
    expect(streamed.map(link => link.markup)).toEqual(['linkify'])
  })

  it('keeps markup on reused link nodes', () => {
    const warm = getMarkdown('link-markup-reuse-warm')
    const base = `see summary.md\n\n${'Paragraph content. '.repeat(20)}\n\n`
    const first = collectLinks(parseMarkdownToStructure(base, warm, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any))
    const second = collectLinks(parseMarkdownToStructure(`${base}Appended paragraph.\n\n`, warm, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any))

    expect(first[0].markup).toBe('linkify')
    expect(second[0].markup).toBe('linkify')
    expect(second[0]).toBe(first[0])
  })

  it('reports an unfinished hand-written link as explicit', () => {
    // The destination is still streaming in, so linkify may match the partial
    // URL, but the source clearly wrote `](`: it must not look auto-detected.
    for (const source of [
      '[summary.md](http://summary.md',
      '[guide](http://s',
      'text [x](http://s z',
      '- [x](http://s',
      '| h |\n|---|\n| [x](http://s |',
      '[x*](http://s',
    ]) {
      const links = collectLinks(parseMarkdownToStructure(source, md, { final: true }))
      expect(links).toHaveLength(1)
      expect(links[0].loading).toBe(true)
      expect(links[0].markup).toBe('')
    }
  })

  it('keeps a bare destination in plain text as linkify', () => {
    // No `](` link syntax here: the bracket text is literal and only the
    // destination was auto-detected.
    const link = firstLink(parseMarkdownToStructure('Use [n] to index (https://example.com)', md, { final: true }))
    expect(link.markup).toBe('linkify')
    expect(link.href).toBe('https://example.com')
  })

  it('keeps unrelated bracketed text off the hand-written source', () => {
    // The text in front of the folded token ends with `](`, but its label does
    // not sit directly in front of it, so the matched destination is still the
    // auto-detected part.
    for (const [source, expected] of [
      ['[x] ](https://a.com', 'linkify'],
      ['Use [n] to index](https://example.com)', 'linkify'],
      ['[x] ](<https://a.com>', 'autolink'],
    ] as [string, string][])
      expect(firstLink(parseMarkdownToStructure(source, md, { final: true })).markup).toBe(expected)
  })

  it('marks the recovered loading image link wrapper as explicit', () => {
    // The outer link of a still-loading image link was written as
    // `[![...]](`, so the wrapper stays an explicit link.
    const imageLink = firstLink(parseMarkdownToStructure('[![img](a.png)]( http://s', md, { final: true }))
    expect(imageLink.markup).toBe('')
    expect(imageLink.loading).toBe(true)
  })

  it('keeps the link source when token hooks are configured', () => {
    // Hooks route top-level streaming tokens through a deep clone, which must
    // not lose the recorded origin of folded link tokens.
    for (const hook of [
      { preTransformTokens: (tokens: unknown) => tokens },
      { postTransformTokens: (tokens: unknown) => tokens },
    ]) {
      const sourceOf = (source: string, final: boolean) =>
        firstLink(parseMarkdownToStructure(source, md, { final, streamParse: true, ...hook } as any)).markup

      expect(sourceOf('text <https://example.com> more', true)).toBe('autolink')
      expect(sourceOf('text <mailto:me@example.com> more', true)).toBe('autolink')
      expect(sourceOf('see https://example.com/a.md end', true)).toBe('linkify')
      expect(sourceOf('see summary.md', false)).toBe('linkify')
      expect(sourceOf('[summary.md](http://summary.md)', false)).toBe('')
      expect(sourceOf('[guide](http://s', false)).toBe('')
    }
  })
})
