import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../packages/markdown-parser/src'

const options = { streamParse: true, reuseStableTopLevelNodes: true }

describe('final stream cache reuse', () => {
  it.each([
    'plain text '.repeat(2000),
    '# Heading\n\nText **bold** and `code`.\n\n- first\n- second\n\n',
    '> quote\n\n1. first\n2. second\n\n',
  ])('retains already final-invariant node identities', (source) => {
    const md = getMarkdown('final-cache')
    const streamed = parseMarkdownToStructure(source, md, { ...options, final: false })
    const expected = parseMarkdownToStructure(source, getMarkdown('final-reference'), { final: true, streamParse: false })
    const final = parseMarkdownToStructure(source, md, { ...options, final: true })
    expect(final).toEqual(expected)
    expect(final).toBe(streamed)
  })

  it.each([
    '**unfinished',
    '*unfinished',
    'text (',
    'literal `',
    '$',
    '|',
    '# **unfinished\n\nfollowing paragraph',
    '<details><summary>Title</summary>body',
    '```ts\nconst x = 1',
    'a | b\n--|--\nx|y',
    '[link][ref]\n\n[ref]: https://example.com',
    'escaped \\* and &amp; entity',
  ])('preserves authoritative final parsing for %s', (source) => {
    const md = getMarkdown('final-cache-sensitive')
    parseMarkdownToStructure(source, md, { ...options, final: false })
    const final = parseMarkdownToStructure(source, md, { ...options, final: true })
    const expected = parseMarkdownToStructure(source, getMarkdown('final-sensitive-reference'), { final: true, streamParse: false })
    expect(final).toEqual(expected)
  })
})
